import { useEffect, useRef } from 'react';
import { buildMechSensorState, getMechTorsoWorldYaw, isMechAmsActive } from '../engine/mechSim';
import { getGroundHeight } from '../engine/terrain';
import { SimCombatEvent, SimState } from '../types/mech';

interface MvpArenaCanvasProps {
  simState: SimState;
  renderTick?: number;
  focusedMechId: string;
  onSelectMech: (mechId: string) => void;
  compact?: boolean;
  className?: string;
}

interface FloatingMarker {
  x: number;
  y: number;
  text: string;
  color: string;
  createdTick: number;
}

const TEAM_PALETTE = [
  '#06b6d4',
  '#f59e0b',
  '#22c55e',
  '#a855f7',
  '#f43f5e',
  '#3b82f6',
  '#14b8a6',
  '#eab308',
  '#ec4899',
  '#6366f1',
  '#84cc16',
  '#fb923c',
];

function getTeamColor(simState: SimState, teamId: string): string {
  const seen: string[] = [];
  for (const m of simState.mechs) {
    if (!seen.includes(m.teamId)) seen.push(m.teamId);
  }
  const idx = Math.max(0, seen.indexOf(teamId));
  return TEAM_PALETTE[idx % TEAM_PALETTE.length];
}

export function MvpArenaCanvas({
  simState,
  renderTick,
  focusedMechId,
  onSelectMech,
  compact = false,
  className,
}: MvpArenaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainLayerRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const markersRef = useRef<FloatingMarker[]>([]);
  const lastMarkerTickRef = useRef<number>(-1);

  useEffect(() => {
    const t = simState.terrain;
    const terrainKey = `${t.id}_${t.width}_${t.depth}_${t.seed}`;
    if (terrainLayerRef.current?.key !== terrainKey) {
      const off = document.createElement('canvas');
      off.width = 600;
      off.height = 600;
      const octx = off.getContext('2d');
      if (octx) {
        octx.fillStyle = '#071121';
        octx.fillRect(0, 0, 600, 600);

        // Heightmap shading grid
        const cell = Math.max(10, Math.round(t.width / 60));
        for (let py = 0; py < t.depth; py += cell) {
          for (let px = 0; px < t.width; px += cell) {
            const h = getGroundHeight(t, px + cell * 0.5, py + cell * 0.5);
            if (h > 0.5) {
              const alpha = Math.min(0.6, h / Math.max(24, t.heightAmplitude * 1.4));
              octx.fillStyle = `rgba(56, 189, 248, ${alpha.toFixed(3)})`;
              octx.fillRect(
                (px / t.width) * 600,
                (py / t.depth) * 600,
                (cell / t.width) * 600 + 0.5,
                (cell / t.depth) * 600 + 0.5
              );
            }
          }
        }

        // Tactical grid lines
        const minorStep = t.width >= 1400 ? 100 : 50;
        const majorStep = t.width >= 1400 ? 200 : 100;
        octx.lineWidth = 1;
        for (let g = minorStep; g < t.width; g += minorStep) {
          const sx = (g / t.width) * 600;
          octx.strokeStyle =
            g % majorStep === 0 ? 'rgba(56, 189, 248, 0.17)' : 'rgba(148, 163, 184, 0.07)';
          octx.beginPath();
          octx.moveTo(sx, 0);
          octx.lineTo(sx, 600);
          octx.stroke();
        }
        for (let g = minorStep; g < t.depth; g += minorStep) {
          const sy = (g / t.depth) * 600;
          octx.strokeStyle =
            g % majorStep === 0 ? 'rgba(56, 189, 248, 0.17)' : 'rgba(148, 163, 184, 0.07)';
          octx.beginPath();
          octx.moveTo(0, sy);
          octx.lineTo(600, sy);
          octx.stroke();
        }

        // Crisp arena border & N/E/S/W compass cues
        octx.strokeStyle = 'rgba(14, 165, 233, 0.55)';
        octx.lineWidth = 2;
        octx.strokeRect(1, 1, 598, 598);

        octx.fillStyle = '#38bdf8';
        octx.font = 'bold 11px sans-serif';
        octx.textAlign = 'center';
        octx.fillText('N 0°', 300, 13);
        octx.fillStyle = 'rgba(203, 213, 225, 0.78)';
        octx.fillText('S 180°', 300, 592);
        octx.textAlign = 'right';
        octx.fillText('E 90°', 594, 304);
        octx.textAlign = 'left';
        octx.fillText('W 270°', 6, 304);

        // Obstacles (3 height tiers)
        for (const obs of t.obstacles) {
          const rx = (obs.x / t.width) * 600;
          const ry = (obs.y / t.depth) * 600;
          const rw = (obs.width / t.width) * 600;
          const rh = (obs.height / t.depth) * 600;
          const localG = getGroundHeight(t, obs.x + obs.width * 0.5, obs.y + obs.height * 0.5);
          const clearH = obs.topZ - localG;
          octx.fillStyle = clearH < 8 ? '#334155' : clearH > 22 ? '#0f172a' : '#1e293b';
          octx.fillRect(rx, ry, rw, rh);
          octx.strokeStyle = clearH > 22 ? '#38bdf8' : '#64748b';
          octx.lineWidth = 1.5;
          octx.strokeRect(rx, ry, rw, rh);
          octx.fillStyle = '#94a3b8';
          octx.font = '10px sans-serif';
          octx.fillText(`${Math.round(obs.topZ)}m`, rx + 3, ry + 11);
        }
      }
      terrainLayerRef.current = { key: terrainKey, canvas: off };
    }

    // Collect floating combat feedback from latest tick
    if (simState.tick < lastMarkerTickRef.current) {
      markersRef.current = [];
    }
    if (simState.tick !== lastMarkerTickRef.current) {
      lastMarkerTickRef.current = simState.tick;
      const evs: SimCombatEvent[] = simState.lastTickEvents;
      for (const ev of evs) {
        if (ev.type === 'hit' && ev.damage && ev.damage > 0) {
          markersRef.current.push({
            x: ev.pos.x,
            y: ev.pos.y,
            text: `${Math.round(ev.damage)}`,
            color: ev.partId === 'head' ? '#f43f5e' : '#facc15',
            createdTick: simState.tick,
          });
        } else if (ev.type === 'ricochet') {
          markersRef.current.push({
            x: ev.pos.x,
            y: ev.pos.y,
            text: '跳弾',
            color: '#93c5fd',
            createdTick: simState.tick,
          });
        } else if (ev.type === 'part_destroyed') {
          markersRef.current.push({
            x: ev.pos.x,
            y: ev.pos.y - 6,
            text: `破壊:${ev.partId ?? ''}`,
            color: '#fb7185',
            createdTick: simState.tick,
          });
        }
      }
      markersRef.current = markersRef.current.filter((m) => simState.tick - m.createdTick <= 22);
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sx = (wx: number) => (wx / simState.terrain.width) * 600;
    const sy = (wy: number) => (wy / simState.terrain.depth) * 600;

    if (terrainLayerRef.current) {
      ctx.drawImage(terrainLayerRef.current.canvas, 0, 0);
    }

    // Projectiles
    for (const proj of simState.projectiles) {
      const px = sx(proj.pos.x);
      const py = sy(proj.pos.y);
      const isEnergy = proj.kind === 'energy' || proj.kind === 'laser';
      const isMissile =
        proj.kind === 'missile' ||
        proj.kind === 'srm_rocket' ||
        proj.kind === 'srm_homing' ||
        proj.kind === 'lrm_homing';
      ctx.fillStyle = isEnergy ? '#22d3ee' : isMissile ? '#f97316' : '#fbbf24';
      ctx.beginPath();
      ctx.arc(px, py, isMissile ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Continuous laser burn beams
    for (const beam of simState.activeBeams) {
      ctx.save();
      ctx.strokeStyle = beam.color;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sx(beam.originPos.x), sy(beam.originPos.y));
      ctx.lineTo(sx(beam.endPos.x), sy(beam.endPos.y));
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.92;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }

    // Instant laser beam flashes & AMS intercept tracers
    for (const ev of simState.lastTickEvents) {
      if (ev.type === 'fire' && ev.endPos && ev.detail !== 'laser') {
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx(ev.pos.x), sy(ev.pos.y));
        ctx.lineTo(sx(ev.endPos.x), sy(ev.endPos.y));
        ctx.stroke();
      } else if (ev.type === 'missile_intercepted' && ev.endPos) {
        ctx.strokeStyle =
          ev.detail === 'ams_laser' ? 'rgba(74, 222, 128, 0.95)' : 'rgba(250, 204, 21, 0.95)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(sx(ev.pos.x), sy(ev.pos.y));
        ctx.lineTo(sx(ev.endPos.x), sy(ev.endPos.y));
        ctx.stroke();
      }
    }

    // Radar range (360 deg) & Optical FOV wedge for focused mech
    const focusedMech = simState.mechs.find((m) => m.id === focusedMechId && m.alive);
    const radarOnlyIds = new Set<string>();
    if (focusedMech) {
      const fSensor = buildMechSensorState(simState, focusedMech.id);
      const fx = sx(focusedMech.pos.x);
      const fy = sy(focusedMech.pos.y);
      const radarRadiusPx = (fSensor.effectiveRadarRange / simState.terrain.width) * 600;
      const omniMinPx = ((120 * fSensor.effectiveOmniRadarScale) / simState.terrain.width) * 600;
      const omniMaxPx = ((400 * fSensor.effectiveOmniRadarScale) / simState.terrain.width) * 600;
      const fovRad = (fSensor.effectiveVisionFovHalfDeg * Math.PI) / 180;
      const centerAngle = ((fSensor.torsoYawDeg - 90) * Math.PI) / 180;

      // 360° Omni radar rings (120m Light RCS inner, 400m Assault RCS outer)
      ctx.save();
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.beginPath();
      ctx.arc(fx, fy, omniMinPx, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(245, 158, 11, 0.22)';
      ctx.beginPath();
      ctx.arc(fx, fy, omniMaxPx, 0, Math.PI * 2);
      ctx.stroke();

      if (fSensor.ecmActive) {
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.55)';
        ctx.beginPath();
        ctx.arc(fx, fy, (130 / simState.terrain.width) * 600, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (isMechAmsActive(focusedMech)) {
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.5)';
        ctx.beginPath();
        ctx.arc(fx, fy, (80 / simState.terrain.width) * 600, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (fSensor.bapActive) {
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.4)';
        ctx.beginPath();
        ctx.arc(fx, fy, (240 / simState.terrain.width) * 600, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Front optical FOV cone (800m visual range along upper-body torsoYawDeg)
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.arc(fx, fy, radarRadiusPx, centerAngle - fovRad, centerAngle + fovRad);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      for (const c of fSensor.radarContacts) {
        if (!(c.inVisualFov && c.hasLineOfSight)) {
          radarOnlyIds.add(c.id);
        }
      }
    }

    // Mechs
    for (const mech of simState.mechs) {
      const mx = sx(mech.pos.x);
      const my = sy(mech.pos.y);
      const teamColor = getTeamColor(simState, mech.teamId);

      if (!mech.alive) {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(mx - 5, my - 5);
        ctx.lineTo(mx + 5, my + 5);
        ctx.moveTo(mx + 5, my - 5);
        ctx.lineTo(mx - 5, my + 5);
        ctx.stroke();
        continue;
      }

      const ms = mech.stats.sizeScale * (compact ? 1.55 : 1);

      if (radarOnlyIds.has(mech.id)) {
        ctx.save();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.arc(mx, my, 12 * ms, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (mech.id === focusedMechId) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mx, my, 13 * ms, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Lower-body leg orientation base
      const legRad = (mech.yawDeg * Math.PI) / 180;
      const lfx = Math.sin(legRad);
      const lfy = -Math.cos(legRad);
      const lrx = -lfy;
      const lry = lfx;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.beginPath();
      ctx.moveTo(mx + lfx * 7 * ms + lrx * 5 * ms, my + lfy * 7 * ms + lry * 5 * ms);
      ctx.lineTo(mx + lfx * 7 * ms - lrx * 5 * ms, my + lfy * 7 * ms - lry * 5 * ms);
      ctx.lineTo(mx - lfx * 7 * ms - lrx * 5 * ms, my - lfy * 7 * ms - lry * 5 * ms);
      ctx.lineTo(mx - lfx * 7 * ms + lrx * 5 * ms, my - lfy * 7 * ms + lry * 5 * ms);
      ctx.closePath();
      ctx.fill();

      // Upper-body torso facing triangle
      const torsoYaw = getMechTorsoWorldYaw(mech);
      const rad = (torsoYaw * Math.PI) / 180;
      const fx = Math.sin(rad);
      const fy = -Math.cos(rad);
      const rx = -fy;
      const ry = fx;

      ctx.fillStyle = teamColor;
      ctx.beginPath();
      ctx.moveTo(mx + fx * 10 * ms, my + fy * 10 * ms);
      ctx.lineTo(mx - fx * 6 * ms + rx * 6 * ms, my - fy * 6 * ms + ry * 6 * ms);
      ctx.lineTo(mx - fx * 6 * ms - rx * 6 * ms, my - fy * 6 * ms - ry * 6 * ms);
      ctx.closePath();
      ctx.fill();

      // Heat mini bar
      const heatRatio = mech.maxHeat > 0 ? Math.max(0, Math.min(1, mech.heat / mech.maxHeat)) : 0;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(mx - 10, my + 10, 20, 3);
      ctx.fillStyle = mech.thermalShutdown ? '#ef4444' : mech.overrideShutdownActive ? '#f97316' : '#fbbf24';
      ctx.fillRect(mx - 10, my + 10, 20 * heatRatio, 3);

      // Name & altitude
      ctx.fillStyle = '#e2e8f0';
      ctx.font = compact ? 'bold 13px sans-serif' : '10px sans-serif';
      const alt = Math.round(mech.pos.z);
      const label = !compact && alt > 2 ? `${mech.name} (+${alt}m)` : mech.name;
      ctx.fillText(label, mx + (compact ? 14 : 11), my - 4);
    }

    // Floating combat markers (omitted in compact PiP minimap)
    if (!compact) {
      ctx.font = 'bold 10px sans-serif';
      for (const mk of markersRef.current) {
        const age = simState.tick - mk.createdTick;
        ctx.globalAlpha = Math.max(0.15, 1 - age / 24);
        ctx.fillStyle = mk.color;
        ctx.fillText(mk.text, sx(mk.x) + 4, sy(mk.y) - age * 0.6);
      }
      ctx.globalAlpha = 1;
    }
  }, [simState, simState.tick, renderTick, focusedMechId, compact]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const wx = ((e.clientX - rect.left) / rect.width) * simState.terrain.width;
    const wy = ((e.clientY - rect.top) / rect.height) * simState.terrain.depth;

    let bestId: string | null = null;
    let bestDist = Math.max(32, simState.terrain.width * 0.045);
    for (const m of simState.mechs) {
      const d = Math.hypot(m.pos.x - wx, m.pos.y - wy);
      if (d < bestDist) {
        bestDist = d;
        bestId = m.id;
      }
    }
    if (bestId) onSelectMech(bestId);
  };

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={600}
      className={className ? `cm-arena-canvas ${className}` : 'cm-arena-canvas'}
      onClick={handleCanvasClick}
      title="クリックで注目機体を切り替え"
    />
  );
}
