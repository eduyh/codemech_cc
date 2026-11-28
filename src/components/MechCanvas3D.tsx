import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  getMechTorsoWorldYaw,
  getMechTotalIntegrity,
  isMechAmsActive,
  isMechBapActive,
  isMechEcmActive,
} from '../engine/mechSim';
import { clamp, degToRad, distance2D } from '../engine/math';
import { getSurfaceHeight } from '../engine/terrain';
import {
  disposeObject3D,
  getTeamColorHex,
  simToThreePos,
  simYawToThreeRotY,
} from '../render3d/coords';
import { EffectsManager3D } from '../render3d/effectsPool';
import {
  MechRig3D,
  buildProceduralMechRig,
  updateMechRigAnimation,
} from '../render3d/mechMeshBuilder';
import { buildTerrainGroup, getArenaAtmosphere } from '../render3d/terrainMeshBuilder';
import { ArmorFace, MechPartId, MechRuntimeState, SimState, Vec3 } from '../types/mech';
import { battleAudio } from '../utils/battleAudio';
import { formatKillBanner, formatKillFeedLine } from '../utils/combatText';
import { MvpArenaCanvas } from './MvpArenaCanvas';

type CameraMode = 'director' | 'overview' | 'follow' | 'orbit';

interface MechCanvas3DProps {
  simState: SimState;
  renderTick?: number;
  focusedMechId: string;
  onSelectMech: (mechId: string) => void;
  onSwitchTo2D?: () => void;
}

interface ProjectedMechTag {
  id: string;
  name: string;
  teamColor: string;
  x: number;
  y: number;
  hpPct: number;
  enPct: number;
  altitude: number;
  focused: boolean;
}

interface StoredPopup {
  worldPos: Vec3;
  text: string;
  color: string;
  createdTick: number;
}

interface ProjectedHitPopup {
  key: string;
  x: number;
  y: number;
  text: string;
  color: string;
  opacity: number;
}

interface BroadcastTeamRow {
  teamId: string;
  label: string;
  color: string;
  aliveCount: number;
  totalCount: number;
  hpPct: number;
}

interface KillFeedItem {
  key: string;
  text: string;
  color: string;
  createdTick: number;
}

const PART_LABEL_JA: Record<MechPartId, string> = {
  head: '頭',
  torso: '中央胴',
  rightShoulder: '右胴',
  rightArm: '右腕',
  leftShoulder: '左胴',
  leftArm: '左腕',
  rightLeg: '右脚',
  leftLeg: '左脚',
};

function formatFaceLabel(face?: ArmorFace): string {
  if (face === 'front') return '(前)';
  if (face === 'rear') return '(後)';
  return '';
}

export function MechCanvas3D({
  simState,
  renderTick,
  focusedMechId,
  onSelectMech,
  onSwitchTo2D,
}: MechCanvas3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>('director');
  const [showTacticalOverlay, setShowTacticalOverlay] = useState<boolean>(true);
  const [showMinimap, setShowMinimap] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => battleAudio.isEnabled());
  const [webglError, setWebglError] = useState<string | null>(null);
  const [tags, setTags] = useState<ProjectedMechTag[]>([]);
  const [popups, setPopups] = useState<ProjectedHitPopup[]>([]);
  const [teamBars, setTeamBars] = useState<BroadcastTeamRow[]>([]);
  const [killFeed, setKillFeed] = useState<KillFeedItem[]>([]);
  const [killBanner, setKillBanner] = useState<{ headline: string; detail: string } | null>(null);

  const simRef = useRef(simState);
  simRef.current = simState;
  const focusedRef = useRef(focusedMechId);
  focusedRef.current = focusedMechId;
  const cameraModeRef = useRef(cameraMode);
  cameraModeRef.current = cameraMode;
  const showTacticalRef = useRef(showTacticalOverlay);
  showTacticalRef.current = showTacticalOverlay;
  const onSelectRef = useRef(onSelectMech);
  onSelectRef.current = onSelectMech;

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const rimLightRef = useRef<THREE.DirectionalLight | null>(null);
  const terrainGroupRef = useRef<THREE.Group | null>(null);
  const terrainKeyRef = useRef<string>('');
  const tacticalGroupRef = useRef<THREE.Group | null>(null);
  const tacticalSpecKeyRef = useRef<string>('');
  const captureZonesGroupRef = useRef<THREE.Group | null>(null);
  const captureZonesKeyRef = useRef<string>('');
  const rigsRef = useRef<Map<string, MechRig3D>>(new Map());
  const effectsRef = useRef<EffectsManager3D | null>(null);
  const storedPopupsRef = useRef<StoredPopup[]>([]);
  const lastPopupTickRef = useRef<number>(-1);
  const feedItemsRef = useRef<KillFeedItem[]>([]);
  const killBannerRef = useRef<{ headline: string; detail: string; untilTick: number } | null>(null);
  const directorStateRef = useRef({
    primaryId: '',
    secondaryId: '',
    switchAfterTick: 0,
    killFocusPos: null as Vec3 | null,
    killFocusUntilTick: -1,
    orbitAngle: 0.6,
    shakeIntensity: 0,
    lastTick: -1,
    smoothCamPos: new THREE.Vector3(),
    smoothLookAt: new THREE.Vector3(),
    initialized: false,
  });

  const orbitStateRef = useRef({
    yaw: 0.55,
    pitch: 0.62,
    overviewDist: 680,
    orbitDist: 95,
    dragging: false,
    downX: 0,
    downY: 0,
    movedDist: 0,
  });

  const renderFrame = useCallback(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const host = hostRef.current;
    if (!scene || !camera || !renderer || !host) return;

    const state = simRef.current;
    const focusedId = focusedRef.current;
    const mode = cameraModeRef.current;
    const w = host.clientWidth || 560;
    const h = host.clientHeight || 420;

    // 1. Rebuild terrain mesh when arena config changes or after mount/remount
    const tKey = `${state.terrain.id}_${state.terrain.width}_${state.terrain.depth}_${state.terrain.seed}`;
    if (!terrainGroupRef.current || terrainKeyRef.current !== tKey) {
      if (terrainGroupRef.current) {
        scene.remove(terrainGroupRef.current);
        disposeObject3D(terrainGroupRef.current);
      }
      const nextTerrain = buildTerrainGroup(state.terrain);
      scene.add(nextTerrain);
      terrainGroupRef.current = nextTerrain;
      terrainKeyRef.current = tKey;

      orbitStateRef.current.overviewDist = Math.round(state.terrain.width * 0.68);
      const atmo = getArenaAtmosphere(state.terrain.id);
      renderer.setClearColor(atmo.skyBottom, 1);
      scene.fog = new THREE.FogExp2(atmo.fogColor, atmo.fogDensity);
      if (hemiLightRef.current) {
        hemiLightRef.current.color.set(atmo.hemiSky);
        hemiLightRef.current.groundColor.set(atmo.hemiGround);
      }
      if (rimLightRef.current) {
        rimLightRef.current.color.set(atmo.rimColor);
      }
      if (dirLightRef.current) {
        const dir = dirLightRef.current;
        dir.color.set(atmo.sunColor);
        dir.intensity = atmo.sunIntensity;
        const shadowBound = Math.max(380, state.terrain.width * 0.62);
        dir.position.set(
          state.terrain.width * 0.3,
          Math.max(340, state.terrain.width * 0.55),
          state.terrain.depth * 0.28
        );
        dir.shadow.camera.left = -shadowBound;
        dir.shadow.camera.right = shadowBound;
        dir.shadow.camera.top = shadowBound;
        dir.shadow.camera.bottom = -shadowBound;
        dir.shadow.camera.far = Math.max(1200, state.terrain.width * 2.2);
        dir.shadow.camera.updateProjectionMatrix();
      }
    }

    // 2. Sync mech rigs (create/replace if match entries or blueprints changed)
    const teamOrder: string[] = [];
    for (const m of state.mechs) {
      if (!teamOrder.includes(m.teamId)) teamOrder.push(m.teamId);
    }

    const activeIds = new Set(state.mechs.map((m) => m.id));
    for (const [id, rig] of rigsRef.current.entries()) {
      if (!activeIds.has(id)) {
        scene.remove(rig.root);
        disposeObject3D(rig.root);
        rigsRef.current.delete(id);
      }
    }

    for (const mech of state.mechs) {
      const teamHex = getTeamColorHex(teamOrder, mech.teamId);
      const mountsSig = Object.entries(mech.blueprint.weaponMountCounts ?? {})
        .map(([k, v]) => `${k}:${v}`)
        .join(',');
      const sig = `${mech.blueprint.id}|${mech.isBalloon ? 1 : 0}|${mech.blueprint.chassisId}|${mech.blueprint.boosterEnabled ? 1 : 0}|${mech.blueprint.color}|${Object.values(mech.blueprint.parts).join(',')}|${mountsSig}`;
      let rig = rigsRef.current.get(mech.id);
      if (!rig || rig.blueprintSignature !== sig || rig.teamColorHex !== teamHex) {
        if (rig) {
          scene.remove(rig.root);
          disposeObject3D(rig.root);
        }
        rig = buildProceduralMechRig(mech, teamHex);
        scene.add(rig.root);
        rigsRef.current.set(mech.id, rig);
      }
      updateMechRigAnimation(
        rig,
        mech,
        state.terrain,
        mech.id === focusedId,
        state.tick,
        state.lastTickEvents
      );
    }

    // 2b. Sync training capture zones (if any)
    if (captureZonesGroupRef.current) {
      const czGroup = captureZonesGroupRef.current;
      const zones = state.captureZones ?? [];
      const czKey = zones
        .map((z) => `${z.id}:${Math.round(z.x)}:${Math.round(z.y)}:${Math.round(z.radius)}:${z.captured ? 1 : 0}:${Math.round(z.progressSec * 10)}`)
        .join('|');
      if (captureZonesKeyRef.current !== czKey) {
        while (czGroup.children.length > 0) {
          const c = czGroup.children[0];
          czGroup.remove(c);
          disposeObject3D(c);
        }
        for (const zone of zones) {
          const surfaceZ = zone.z ?? getSurfaceHeight(state.terrain, zone.x, zone.y);
          const pos = new THREE.Vector3();
          simToThreePos({ x: zone.x, y: zone.y, z: surfaceZ }, state.terrain, pos);
          const color = zone.captured ? '#22c55e' : '#38bdf8';
          const ringGeo = new THREE.RingGeometry(Math.max(1, zone.radius - 1.6), zone.radius, 36);
          ringGeo.rotateX(-Math.PI / 2);
          const ringMesh = new THREE.Mesh(
            ringGeo,
            new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.78 })
          );
          ringMesh.position.set(pos.x, pos.y + 0.35, pos.z);
          czGroup.add(ringMesh);

          const pct = zone.holdSec > 0 ? clamp(zone.progressSec / zone.holdSec, 0.06, 1) : 1;
          const fillGeo = new THREE.CircleGeometry(zone.radius * pct, 28);
          fillGeo.rotateX(-Math.PI / 2);
          const fillMesh = new THREE.Mesh(
            fillGeo,
            new THREE.MeshBasicMaterial({
              color: zone.captured ? '#22c55e' : '#fbbf24',
              side: THREE.DoubleSide,
              transparent: true,
              opacity: zone.captured ? 0.28 : 0.18,
            })
          );
          fillMesh.position.set(pos.x, pos.y + 0.25, pos.z);
          czGroup.add(fillMesh);
        }
        captureZonesKeyRef.current = czKey;
      }
    }

    // 3. Effects, projectiles, beams & Web Audio SFX
    if (effectsRef.current) {
      effectsRef.current.syncProjectiles(state.projectiles, state.terrain, state.tick);
      effectsRef.current.syncActiveBeams(state.activeBeams, state.terrain, state.tick);
      effectsRef.current.ingestEventsAndStep(
        state.lastTickEvents,
        state.mechs,
        state.terrain,
        state.tick
      );
    }
    battleAudio.playSimEvents(state.lastTickEvents, state.mechs, state.tick);

    // 4. Collect hit-part popups (aggregate rapid continuous laser ticks into readable popups)
    if (state.tick < lastPopupTickRef.current) {
      storedPopupsRef.current = [];
    }
    if (state.tick !== lastPopupTickRef.current) {
      lastPopupTickRef.current = state.tick;
      const tickHitAgg = new Map<
        string,
        { worldPos: Vec3; partId: MechPartId; face?: ArmorFace; damage: number }
      >();
      for (const ev of state.lastTickEvents) {
        if (ev.type === 'hit' && ev.partId && ev.damage && ev.damage > 0) {
          const aggKey = `${ev.targetId ?? 't'}_${ev.partId}_${ev.face ?? 'all'}`;
          const prev = tickHitAgg.get(aggKey);
          if (prev) {
            prev.damage += ev.damage;
            prev.worldPos = { ...ev.pos };
          } else {
            tickHitAgg.set(aggKey, {
              worldPos: { ...ev.pos },
              partId: ev.partId,
              face: ev.face,
              damage: ev.damage,
            });
          }
        } else if (ev.type === 'ricochet') {
          storedPopupsRef.current.push({
            worldPos: { ...ev.pos },
            text: '跳弾!',
            color: '#93c5fd',
            createdTick: state.tick,
          });
        } else if (ev.type === 'part_destroyed' && ev.partId) {
          storedPopupsRef.current.push({
            worldPos: { ...ev.pos, z: ev.pos.z + 9 },
            text: `${PART_LABEL_JA[ev.partId]}破壊!`,
            color: '#f87171',
            createdTick: state.tick,
          });
        } else if (ev.type === 'thermal_shutdown') {
          storedPopupsRef.current.push({
            worldPos: { ...ev.pos, z: ev.pos.z + 11 },
            text: '熱シャットダウン!',
            color: '#fb923c',
            createdTick: state.tick,
          });
        } else if (ev.type === 'heat_damage') {
          storedPopupsRef.current.push({
            worldPos: { ...ev.pos, z: ev.pos.z + 10 },
            text: '過熱ダメ!',
            color: '#ef4444',
            createdTick: state.tick,
          });
        } else if (ev.type === 'ecm_disrupted') {
          storedPopupsRef.current.push({
            worldPos: { ...ev.pos, z: ev.pos.z + 10 },
            text: 'ECM妨害!',
            color: '#c084fc',
            createdTick: state.tick,
          });
        }
      }

      for (const agg of tickHitAgg.values()) {
        const prefix = `${PART_LABEL_JA[agg.partId]}${formatFaceLabel(agg.face)}`;
        // Merge with a recent popup on the same label within 6 ticks (keeps burn beams readable)
        const existing = storedPopupsRef.current.find(
          (p) => p.text.startsWith(`${prefix} -`) && state.tick - p.createdTick <= 6
        );
        if (existing) {
          const prevNum = Number(existing.text.split(' -')[1] ?? 0) || 0;
          const total = Math.max(1, Math.round(prevNum + agg.damage));
          existing.text = `${prefix} -${total}`;
          existing.worldPos = { ...agg.worldPos };
          existing.createdTick = state.tick;
        } else {
          const shown = Math.max(1, Math.round(agg.damage));
          storedPopupsRef.current.push({
            worldPos: agg.worldPos,
            text: `${prefix} -${shown}`,
            color: agg.partId === 'head' ? '#fb7185' : '#fde047',
            createdTick: state.tick,
          });
        }
      }

      storedPopupsRef.current = storedPopupsRef.current.filter(
        (p) => state.tick - p.createdTick <= 26
      );
    }

    // 4b. Director event impulses (shake, kill focus, kill feed & kill banner)
    const dirState = directorStateRef.current;
    const mechNameById = new Map(state.mechs.map((m) => [m.id, m.name]));
    if (state.tick < dirState.lastTick) {
      feedItemsRef.current = [];
      killBannerRef.current = null;
      dirState.killFocusPos = null;
      dirState.killFocusUntilTick = -1;
      dirState.primaryId = '';
      dirState.secondaryId = '';
      dirState.switchAfterTick = 0;
      dirState.shakeIntensity = 0;
      dirState.initialized = false;
    }
    if (state.tick !== dirState.lastTick) {
      dirState.lastTick = state.tick;
      dirState.shakeIntensity *= 0.82;
      if (dirState.shakeIntensity < 0.04) dirState.shakeIntensity = 0;
      dirState.orbitAngle += 0.0038;

      for (const ev of state.lastTickEvents) {
        if (ev.type === 'mech_destroyed') {
          dirState.shakeIntensity = Math.min(3.0, dirState.shakeIntensity + 2.2);
          dirState.killFocusPos = { ...ev.pos };
          dirState.killFocusUntilTick = state.tick + 54;
          const banner = formatKillBanner(ev, mechNameById);
          killBannerRef.current = {
            headline: banner.headline,
            detail: banner.detail,
            untilTick: state.tick + 85,
          };
          feedItemsRef.current.unshift({
            key: `kill_${state.tick}_${ev.targetId ?? ev.actorId}`,
            text: formatKillFeedLine(ev, mechNameById),
            color: '#f87171',
            createdTick: state.tick,
          });
        } else if (ev.type === 'part_destroyed' && ev.partId) {
          dirState.shakeIntensity = Math.min(2.4, dirState.shakeIntensity + 0.9);
          feedItemsRef.current.unshift({
            key: `part_${state.tick}_${ev.targetId ?? ''}_${ev.partId}`,
            text: formatKillFeedLine(ev, mechNameById),
            color: '#fb923c',
            createdTick: state.tick,
          });
          if (ev.targetId && ev.actorId) {
            dirState.primaryId = ev.targetId;
            dirState.secondaryId = ev.actorId;
            dirState.switchAfterTick = Math.max(dirState.switchAfterTick, state.tick + 55);
          }
        } else if (ev.type === 'thermal_shutdown') {
          feedItemsRef.current.unshift({
            key: `heat_${state.tick}_${ev.actorId}`,
            text: formatKillFeedLine(ev, mechNameById),
            color: '#facc15',
            createdTick: state.tick,
          });
        } else if (ev.type === 'hit' && (ev.damage ?? 0) >= 42) {
          dirState.shakeIntensity = Math.min(2.0, dirState.shakeIntensity + 0.45);
        }
      }
      feedItemsRef.current = feedItemsRef.current
        .filter((f) => state.tick - f.createdTick <= 270)
        .slice(0, 5);
      if (killBannerRef.current && state.tick > killBannerRef.current.untilTick) {
        killBannerRef.current = null;
      }
    }

    const nextTeamBars: BroadcastTeamRow[] = teamOrder.map((tid) => {
      const members = state.mechs.filter((m) => m.teamId === tid);
      const aliveCount = members.filter((m) => m.alive).length;
      const ratioSum = members.reduce(
        (acc, m) => acc + (m.alive ? getMechTotalIntegrity(m).ratio : 0),
        0
      );
      const hpPct = members.length > 0 ? Math.round((ratioSum / members.length) * 100) : 0;
      const label =
        teamOrder.length === 2
          ? tid === 'T1'
            ? '味方'
            : tid === 'T2'
              ? '敵'
              : tid
          : tid;
      return {
        teamId: tid,
        label,
        color: getTeamColorHex(teamOrder, tid),
        aliveCount,
        totalCount: members.length,
        hpPct,
      };
    });
    setTeamBars(nextTeamBars);
    setKillFeed([...feedItemsRef.current]);
    setKillBanner(
      killBannerRef.current
        ? { headline: killBannerRef.current.headline, detail: killBannerRef.current.detail }
        : null
    );

    // 5. Camera positioning & 3D tactical FOV/radar/aim overlay
    const orb = orbitStateRef.current;
    const focusedMech = state.mechs.find((m) => m.id === focusedId) ?? state.mechs[0];
    const targetVec = new THREE.Vector3(0, 6, 0);

    if (tacticalGroupRef.current) {
      const tacGroup = tacticalGroupRef.current;
      if (showTacticalRef.current && focusedMech && focusedMech.alive) {
        const headRadarMult = focusedMech.parts.head.destroyed ? 0.4 : 1.0;
        const effectiveRadar = focusedMech.stats.radarRange * headRadarMult;
        const effectiveFovHalf =
          focusedMech.stats.visionFovHalfDeg * (focusedMech.parts.head.destroyed ? 0.55 : 1.0);
        const aimY = 6.8 * focusedMech.stats.sizeScale;
        const ecmUp = isMechEcmActive(focusedMech);
        const amsUp = isMechAmsActive(focusedMech);
        const bapUp = isMechBapActive(focusedMech);
        const specKey = `${Math.round(effectiveRadar)}_${Math.round(effectiveFovHalf)}_${headRadarMult}_${focusedMech.stats.sizeScale}_${ecmUp ? 1 : 0}_${amsUp ? 1 : 0}_${bapUp ? 1 : 0}`;
        if (tacGroup.children.length === 0 || tacticalSpecKeyRef.current !== specKey) {
          while (tacGroup.children.length > 0) {
            const c = tacGroup.children[0];
            tacGroup.remove(c);
            disposeObject3D(c);
          }

          // Optical FOV sector wedge (800m forward visual cone)
          const fovSegments = 28;
          const halfRad = degToRad(effectiveFovHalf);
          const fovVerts: number[] = [];
          for (let i = 0; i < fovSegments; i++) {
            const a1 = -halfRad + (i / fovSegments) * (2 * halfRad);
            const a2 = -halfRad + ((i + 1) / fovSegments) * (2 * halfRad);
            fovVerts.push(0, 0, 0);
            fovVerts.push(Math.sin(a1) * effectiveRadar, 0, -Math.cos(a1) * effectiveRadar);
            fovVerts.push(Math.sin(a2) * effectiveRadar, 0, -Math.cos(a2) * effectiveRadar);
          }
          const fovGeo = new THREE.BufferGeometry();
          fovGeo.setAttribute('position', new THREE.Float32BufferAttribute(fovVerts, 3));
          const fovMat = new THREE.MeshBasicMaterial({
            color: '#38bdf8',
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const fovMesh = new THREE.Mesh(fovGeo, fovMat);
          fovMesh.position.y = 0.6;
          tacGroup.add(fovMesh);

          // 360-deg Omni Radar rings (120m Light RCS inner, 400m Assault RCS outer)
          const omniBands: Array<{ radius: number; opacity: number }> = [
            { radius: 120 * headRadarMult, opacity: 0.45 },
            { radius: 400 * headRadarMult, opacity: 0.24 },
          ];
          for (const band of omniBands) {
            const ringPts: THREE.Vector3[] = [];
            for (let i = 0; i <= 48; i++) {
              const th = (i / 48) * Math.PI * 2;
              ringPts.push(new THREE.Vector3(Math.cos(th) * band.radius, 0.5, Math.sin(th) * band.radius));
            }
            const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
            const ringMat = new THREE.LineBasicMaterial({
              color: '#f59e0b',
              transparent: true,
              opacity: band.opacity,
            });
            tacGroup.add(new THREE.Line(ringGeo, ringMat));
          }

          // Optional ECM (130m purple), AMS (80m green), BAP (240m cyan) rings
          const moduleRings: Array<{ active: boolean; radius: number; color: string; opacity: number }> = [
            { active: ecmUp, radius: 130, color: '#c084fc', opacity: 0.48 },
            { active: amsUp, radius: 80, color: '#4ade80', opacity: 0.45 },
            { active: bapUp, radius: 240, color: '#22d3ee', opacity: 0.35 },
          ];
          for (const mr of moduleRings) {
            if (!mr.active) continue;
            const ringPts: THREE.Vector3[] = [];
            for (let i = 0; i <= 48; i++) {
              const th = (i / 48) * Math.PI * 2;
              ringPts.push(new THREE.Vector3(Math.cos(th) * mr.radius, 0.7, Math.sin(th) * mr.radius));
            }
            const rGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
            const rMat = new THREE.LineBasicMaterial({
              color: mr.color,
              transparent: true,
              opacity: mr.opacity,
            });
            tacGroup.add(new THREE.Line(rGeo, rMat));
          }

          // Torso aim line
          const aimLen = Math.min(350, effectiveRadar);
          const aimGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, aimY, 0),
            new THREE.Vector3(0, aimY, -aimLen),
          ]);
          const aimMat = new THREE.LineBasicMaterial({
            color: '#38bdf8',
            transparent: true,
            opacity: 0.72,
          });
          tacGroup.add(new THREE.Line(aimGeo, aimMat));
          tacticalSpecKeyRef.current = specKey;
        }

        simToThreePos(focusedMech.pos, state.terrain, tacGroup.position);
        tacGroup.rotation.set(0, simYawToThreeRotY(getMechTorsoWorldYaw(focusedMech)), 0);
        tacGroup.visible = true;
      } else {
        tacGroup.visible = false;
      }
    }

    if (mode === 'director') {
      const alive = state.mechs.filter((m) => m.alive);
      let desiredCamPos: THREE.Vector3;
      let desiredLookAt: THREE.Vector3;

      if (dirState.killFocusPos && state.tick <= dirState.killFocusUntilTick) {
        const kVec = new THREE.Vector3();
        simToThreePos(dirState.killFocusPos, state.terrain, kVec);
        desiredLookAt = new THREE.Vector3(kVec.x, kVec.y + 4, kVec.z);
        const angle = dirState.orbitAngle * 1.4;
        const dist = 54;
        desiredCamPos = new THREE.Vector3(
          kVec.x + Math.sin(angle) * dist,
          kVec.y + 22,
          kVec.z + Math.cos(angle) * dist
        );
      } else {
        const findAlive = (id: string): MechRuntimeState | undefined =>
          alive.find((m) => m.id === id);
        let pMech = findAlive(dirState.primaryId);
        let sMech = findAlive(dirState.secondaryId);

        if (
          !pMech ||
          !sMech ||
          pMech.teamId === sMech.teamId ||
          state.tick >= dirState.switchAfterTick
        ) {
          let bestPair: [MechRuntimeState, MechRuntimeState] | null = null;
          let bestScore = Infinity;
          for (let i = 0; i < alive.length; i++) {
            for (let j = i + 1; j < alive.length; j++) {
              const mA = alive[i];
              const mB = alive[j];
              if (mA.teamId === mB.teamId) continue;
              const d = distance2D(mA.pos.x, mA.pos.y, mB.pos.x, mB.pos.y);
              const recentHitBonus =
                state.tick - mA.lastHitTick < 30 || state.tick - mB.lastHitTick < 30 ? 90 : 0;
              const score = d - recentHitBonus;
              if (score < bestScore) {
                bestScore = score;
                bestPair = [mA, mB];
              }
            }
          }
          if (bestPair) {
            pMech = bestPair[0];
            sMech = bestPair[1];
            dirState.primaryId = pMech.id;
            dirState.secondaryId = sMech.id;
            dirState.switchAfterTick = state.tick + 110;
          } else {
            pMech = focusedMech && focusedMech.alive ? focusedMech : alive[0] ?? focusedMech;
            sMech = undefined;
          }
        }

        if (pMech && sMech) {
          const vA = new THREE.Vector3();
          const vB = new THREE.Vector3();
          simToThreePos(pMech.pos, state.terrain, vA);
          simToThreePos(sMech.pos, state.terrain, vB);
          const pairDist = vA.distanceTo(vB);
          desiredLookAt = new THREE.Vector3().addVectors(vA, vB).multiplyScalar(0.5);
          desiredLookAt.y += 5.5;

          const baseYaw = Math.atan2(vB.x - vA.x, vB.z - vA.z) + Math.PI * 0.36;
          const angle = baseYaw + Math.sin(dirState.orbitAngle * 0.7) * 0.45;
          const dist = clamp(pairDist * 0.62 + 48, 56, 210);
          desiredCamPos = new THREE.Vector3(
            desiredLookAt.x + Math.sin(angle) * dist,
            desiredLookAt.y + clamp(dist * 0.28, 16, 62),
            desiredLookAt.z + Math.cos(angle) * dist
          );
        } else if (pMech) {
          const vP = new THREE.Vector3();
          simToThreePos(pMech.pos, state.terrain, vP);
          desiredLookAt = new THREE.Vector3(vP.x, vP.y + 6, vP.z);
          desiredCamPos = new THREE.Vector3(
            vP.x + Math.sin(dirState.orbitAngle) * 64,
            vP.y + 24,
            vP.z + Math.cos(dirState.orbitAngle) * 64
          );
        } else {
          desiredLookAt = new THREE.Vector3(0, 6, 0);
          desiredCamPos = new THREE.Vector3(0, 120, 180);
        }
      }

      // Prevent camera from clipping below local terrain / obstacle surface
      const camSimX = desiredCamPos.x + state.terrain.width * 0.5;
      const camSimY = desiredCamPos.z + state.terrain.depth * 0.5;
      const minSurfaceY = getSurfaceHeight(state.terrain, camSimX, camSimY) + 12;
      if (desiredCamPos.y < minSurfaceY) {
        desiredCamPos.y = minSurfaceY;
      }

      if (!dirState.initialized) {
        dirState.smoothCamPos.copy(desiredCamPos);
        dirState.smoothLookAt.copy(desiredLookAt);
        dirState.initialized = true;
      } else {
        dirState.smoothCamPos.lerp(desiredCamPos, 0.13);
        dirState.smoothLookAt.lerp(desiredLookAt, 0.16);
      }

      const shakeX =
        dirState.shakeIntensity > 0 ? Math.sin(state.tick * 2.9) * dirState.shakeIntensity : 0;
      const shakeY =
        dirState.shakeIntensity > 0 ? Math.cos(state.tick * 3.7) * dirState.shakeIntensity * 0.8 : 0;
      camera.position.set(
        dirState.smoothCamPos.x + shakeX,
        dirState.smoothCamPos.y + shakeY,
        dirState.smoothCamPos.z
      );
      camera.lookAt(
        dirState.smoothLookAt.x - shakeX * 0.5,
        dirState.smoothLookAt.y - shakeY * 0.5,
        dirState.smoothLookAt.z
      );
    } else if (mode === 'follow' && focusedMech) {
      simToThreePos(focusedMech.pos, state.terrain, targetVec);
      const yawRad = degToRad(focusedMech.yawDeg);
      const fwdX = Math.sin(yawRad);
      const fwdZ = -Math.cos(yawRad);
      const shakeY =
        dirState.shakeIntensity > 0 ? Math.cos(state.tick * 3.5) * dirState.shakeIntensity * 0.6 : 0;
      camera.position.set(
        targetVec.x - fwdX * 42,
        targetVec.y + 22 + shakeY,
        targetVec.z - fwdZ * 42
      );
      camera.lookAt(targetVec.x + fwdX * 26, targetVec.y + 6, targetVec.z + fwdZ * 26);
    } else if (mode === 'orbit' && focusedMech) {
      simToThreePos(focusedMech.pos, state.terrain, targetVec);
      targetVec.y += 5.5;
      const cosP = Math.cos(orb.pitch);
      camera.position.set(
        targetVec.x + Math.sin(orb.yaw) * cosP * orb.orbitDist,
        targetVec.y + Math.sin(orb.pitch) * orb.orbitDist,
        targetVec.z + Math.cos(orb.yaw) * cosP * orb.orbitDist
      );
      camera.lookAt(targetVec);
    } else {
      // Overview
      const cosP = Math.cos(orb.pitch);
      camera.position.set(
        Math.sin(orb.yaw) * cosP * orb.overviewDist,
        Math.sin(orb.pitch) * orb.overviewDist,
        Math.cos(orb.yaw) * cosP * orb.overviewDist
      );
      camera.lookAt(0, 6, 0);
    }

    camera.updateMatrixWorld();
    renderer.render(scene, camera);

    // 6. Project 2D HUD tags & hit popups
    const nextTags: ProjectedMechTag[] = [];
    const projVec = new THREE.Vector3();

    for (const mech of state.mechs) {
      if (!mech.alive) continue;
      simToThreePos(mech.pos, state.terrain, projVec);
      projVec.y += 12.2 * mech.stats.sizeScale;
      projVec.project(camera);
      if (projVec.z > 1 || projVec.z < -1) continue;

      const sx = (projVec.x * 0.5 + 0.5) * w;
      const sy = (-projVec.y * 0.5 + 0.5) * h;
      if (sx < -40 || sx > w + 40 || sy < -30 || sy > h + 30) continue;

      nextTags.push({
        id: mech.id,
        name: mech.name,
        teamColor: getTeamColorHex(teamOrder, mech.teamId),
        x: sx,
        y: sy,
        hpPct: Math.round(getMechTotalIntegrity(mech).ratio * 100),
        enPct: mech.maxHeat > 0 ? Math.min(100, Math.round((mech.heat / mech.maxHeat) * 100)) : 0,
        altitude: Math.round(mech.pos.z),
        focused: mech.id === focusedId,
      });
    }
    setTags(nextTags);

    const nextPopups: ProjectedHitPopup[] = [];
    storedPopupsRef.current.forEach((p, idx) => {
      const age = state.tick - p.createdTick;
      simToThreePos(p.worldPos, state.terrain, projVec);
      projVec.y += age * 0.25;
      projVec.project(camera);
      if (projVec.z > 1 || projVec.z < -1) return;

      nextPopups.push({
        key: `${p.createdTick}_${idx}`,
        x: (projVec.x * 0.5 + 0.5) * w,
        y: (-projVec.y * 0.5 + 0.5) * h,
        text: p.text,
        color: p.color,
        opacity: Math.max(0.15, 1 - age / 27),
      });
    });
    setPopups(nextPopups);
  }, []);

  // Initialize WebGLRenderer & Scene once
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    } catch (err) {
      setWebglError(
        err instanceof Error ? err.message : 'WebGL コンテキストを初期化できませんでした'
      );
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor('#070d1a', 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const width = host.clientWidth || 560;
    const height = host.clientHeight || 420;
    renderer.setSize(width, height, false);
    renderer.domElement.className = 'cm-3d-canvas';
    renderer.domElement.title = 'ドラッグ: 視点回転 / ホイール: ズーム / 機体クリック: 注目切替';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#070d1a', 0.00018);

    const camera = new THREE.PerspectiveCamera(48, width / height, 1, 6500);
    const ambient = new THREE.AmbientLight('#cbd5e1', 0.42);
    const hemi = new THREE.HemisphereLight('#dbeafe', '#1e293b', 0.9);
    hemiLightRef.current = hemi;
    const dir = new THREE.DirectionalLight('#ffffff', 1.35);
    dir.position.set(180, 340, 160);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 1024;
    dir.shadow.mapSize.height = 1024;
    dir.shadow.camera.near = 40;
    dir.shadow.camera.far = 2200;
    const shadowBound = 620;
    dir.shadow.camera.left = -shadowBound;
    dir.shadow.camera.right = shadowBound;
    dir.shadow.camera.top = shadowBound;
    dir.shadow.camera.bottom = -shadowBound;
    dir.shadow.bias = -0.0008;
    dirLightRef.current = dir;
    const rim = new THREE.DirectionalLight('#38bdf8', 0.5);
    rim.position.set(-200, 140, -180);
    rimLightRef.current = rim;
    scene.add(ambient, hemi, dir, rim);

    const tacticalGroup = new THREE.Group();
    tacticalGroup.name = 'tactical_overlay';
    scene.add(tacticalGroup);
    tacticalGroupRef.current = tacticalGroup;
    tacticalSpecKeyRef.current = '';

    const captureZonesGroup = new THREE.Group();
    captureZonesGroup.name = 'capture_zones';
    scene.add(captureZonesGroup);
    captureZonesGroupRef.current = captureZonesGroup;
    captureZonesKeyRef.current = '';

    const effects = new EffectsManager3D();
    scene.add(effects.group);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    effectsRef.current = effects;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const rw = Math.max(240, Math.round(entry.contentRect.width));
      const rh = Math.max(240, Math.round(entry.contentRect.height));
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      renderer.setSize(rw, rh, false);
      renderFrame();
    });
    resizeObserver.observe(host);

    const dom = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      const orb = orbitStateRef.current;
      orb.dragging = true;
      orb.downX = e.clientX;
      orb.downY = e.clientY;
      orb.movedDist = 0;
    };

    const onPointerMove = (e: PointerEvent) => {
      const orb = orbitStateRef.current;
      if (!orb.dragging) return;
      const dx = e.clientX - orb.downX;
      const dy = e.clientY - orb.downY;
      orb.movedDist += Math.hypot(dx, dy);
      orb.downX = e.clientX;
      orb.downY = e.clientY;
      orb.yaw -= dx * 0.008;
      orb.pitch = clamp(orb.pitch + dy * 0.007, 0.14, 1.42);
      renderFrame();
    };

    const onPointerUp = (e: PointerEvent) => {
      const orb = orbitStateRef.current;
      if (!orb.dragging) return;
      orb.dragging = false;

      if (orb.movedDist < 6) {
        const rect = dom.getBoundingClientRect();
        ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        const rigRoots = Array.from(rigsRef.current.values()).map((r) => r.bodyGroup);
        const hits = raycaster.intersectObjects(rigRoots, true);
        if (hits.length > 0) {
          const mechId = hits[0].object.userData?.mechId as string | undefined;
          if (mechId) onSelectRef.current(mechId);
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const orb = orbitStateRef.current;
      if (cameraModeRef.current === 'orbit') {
        orb.orbitDist = clamp(orb.orbitDist + e.deltaY * 0.12, 30, 260);
      } else {
        const maxDist = Math.max(760, simRef.current.terrain.width * 1.45);
        orb.overviewDist = clamp(orb.overviewDist + e.deltaY * 0.65, 120, maxDist);
      }
      renderFrame();
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    renderFrame();

    return () => {
      resizeObserver.disconnect();
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('wheel', onWheel);

      if (terrainGroupRef.current) {
        disposeObject3D(terrainGroupRef.current);
        terrainGroupRef.current = null;
      }
      terrainKeyRef.current = '';
      if (captureZonesGroupRef.current) {
        scene.remove(captureZonesGroupRef.current);
        disposeObject3D(captureZonesGroupRef.current);
        captureZonesGroupRef.current = null;
      }
      captureZonesKeyRef.current = '';
      if (tacticalGroupRef.current) {
        disposeObject3D(tacticalGroupRef.current);
        tacticalGroupRef.current = null;
      }
      tacticalSpecKeyRef.current = '';
      for (const rig of rigsRef.current.values()) {
        disposeObject3D(rig.root);
      }
      rigsRef.current.clear();
      effects.dispose();
      renderer.dispose();
      if (dom.parentElement === host) {
        host.removeChild(dom);
      }
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      dirLightRef.current = null;
      hemiLightRef.current = null;
      rimLightRef.current = null;
      effectsRef.current = null;
    };
  }, [renderFrame]);

  useEffect(() => {
    renderFrame();
  }, [simState, simState.tick, renderTick, focusedMechId, cameraMode, showTacticalOverlay, renderFrame]);

  if (webglError) {
    return (
      <div className="cm-3d-fallback">
        3D ビューを利用できません ({webglError})。右上の切替で「2D 戦術図」をご使用ください。
      </div>
    );
  }

  return (
    <div className="cm-3d-viewport" ref={hostRef}>
      {teamBars.length > 0 && (
        <div className="cm-3d-broadcast-bar" aria-hidden="true">
          {teamBars.length === 2 ? (
            <>
              <div className="cm-3d-team-side is-left">
                <span className="cm-3d-team-name" style={{ color: teamBars[0].color }}>
                  {teamBars[0].label} ({teamBars[0].aliveCount}/{teamBars[0].totalCount})
                </span>
                <div className="cm-3d-team-track">
                  <div
                    className="cm-3d-team-fill"
                    style={{
                      width: `${teamBars[0].hpPct}%`,
                      backgroundColor: teamBars[0].color,
                    }}
                  />
                </div>
              </div>
              <span className="cm-3d-vs-badge">VS</span>
              <div className="cm-3d-team-side is-right">
                <div className="cm-3d-team-track">
                  <div
                    className="cm-3d-team-fill"
                    style={{
                      width: `${teamBars[1].hpPct}%`,
                      backgroundColor: teamBars[1].color,
                    }}
                  />
                </div>
                <span className="cm-3d-team-name" style={{ color: teamBars[1].color }}>
                  ({teamBars[1].aliveCount}/{teamBars[1].totalCount}) {teamBars[1].label}
                </span>
              </div>
            </>
          ) : (
            teamBars.map((t) => (
              <div key={t.teamId} className="cm-3d-team-chip">
                <span className="cm-3d-dot" style={{ backgroundColor: t.color }} />
                <span>
                  {t.label}:{t.aliveCount}/{t.totalCount}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {killBanner && (
        <div className="cm-3d-banner" aria-hidden="true">
          <strong>{killBanner.headline}</strong>
          <span>{killBanner.detail}</span>
        </div>
      )}

      {killFeed.length > 0 && (
        <div className="cm-3d-killfeed" aria-hidden="true">
          {killFeed.map((item) => (
            <div key={item.key} className="cm-3d-killfeed-item" style={{ borderLeftColor: item.color }}>
              {item.text}
            </div>
          ))}
        </div>
      )}

      <div className="cm-3d-cam-bar">
        <button
          type="button"
          className={cameraMode === 'director' ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
          onClick={() => setCameraMode('director')}
          title="交戦中の機体を自動で追う中継カメラ"
        >
          中継
        </button>
        <button
          type="button"
          className={cameraMode === 'overview' ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
          onClick={() => setCameraMode('overview')}
        >
          俯瞰
        </button>
        <button
          type="button"
          className={cameraMode === 'follow' ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
          onClick={() => setCameraMode('follow')}
        >
          追従
        </button>
        <button
          type="button"
          className={cameraMode === 'orbit' ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
          onClick={() => setCameraMode('orbit')}
        >
          回転
        </button>
        <button
          type="button"
          className={showTacticalOverlay ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
          onClick={() => setShowTacticalOverlay((v) => !v)}
          title="注目機の光学視界コーン・360°レーダー・照準ラインの表示切替"
        >
          視界
        </button>
        <button
          type="button"
          className={showMinimap ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
          onClick={() => setShowMinimap((v) => !v)}
          title="2D俯瞰ミニマップ (PiP) の表示切替"
        >
          ミニマップ
        </button>
        <button
          type="button"
          className={soundEnabled ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
          onClick={() => {
            const next = !soundEnabled;
            battleAudio.setEnabled(next);
            if (next) battleAudio.unlock();
            setSoundEnabled(next);
          }}
          title="戦闘効果音 (Web Audio) の ON/OFF"
        >
          {soundEnabled ? 'SE ON' : 'SE OFF'}
        </button>
      </div>

      {showMinimap && (
        <div
          className="cm-3d-pip"
          onPointerDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="cm-3d-pip-head">
            <span>2D 俯瞰</span>
            <div className="cm-3d-pip-actions">
              {onSwitchTo2D && (
                <button
                  type="button"
                  className="cm-3d-pip-btn"
                  onClick={onSwitchTo2D}
                  title="2D戦術図ビューへ切替"
                >
                  2D拡大
                </button>
              )}
              <button
                type="button"
                className="cm-3d-pip-btn"
                onClick={() => setShowMinimap(false)}
                title="ミニマップを閉じる"
                aria-label="ミニマップを閉じる"
              >
                ×
              </button>
            </div>
          </div>
          <MvpArenaCanvas
            simState={simState}
            renderTick={renderTick}
            focusedMechId={focusedMechId}
            onSelectMech={onSelectMech}
            compact
            className="cm-arena-canvas--pip"
          />
        </div>
      )}

      <div className="cm-3d-overlay" aria-hidden="true">
        {tags.map((tag) => (
          <div
            key={tag.id}
            className={`cm-3d-tag ${tag.focused ? 'is-focused' : ''}`}
            style={{ left: `${tag.x}px`, top: `${tag.y}px` }}
          >
            <div className="cm-3d-tag-head">
              <span className="cm-3d-dot" style={{ backgroundColor: tag.teamColor }} />
              <span>{tag.name}</span>
              {tag.altitude > 2 && <span className="cm-3d-alt">+{tag.altitude}m</span>}
            </div>
            <div className="cm-3d-tag-bars">
              <div className="cm-3d-mini-bar">
                <div style={{ width: `${tag.hpPct}%`, backgroundColor: '#22c55e' }} />
              </div>
              <div className="cm-3d-mini-bar">
                <div
                  style={{
                    width: `${tag.enPct}%`,
                    backgroundColor:
                      tag.enPct >= 80 ? '#ef4444' : tag.enPct >= 50 ? '#f59e0b' : '#fb923c',
                  }}
                />
              </div>
            </div>
          </div>
        ))}

        {popups.map((p) => (
          <div
            key={p.key}
            className="cm-3d-popup"
            style={{
              left: `${p.x}px`,
              top: `${p.y}px`,
              color: p.color,
              opacity: p.opacity,
            }}
          >
            {p.text}
          </div>
        ))}
      </div>
    </div>
  );
}
