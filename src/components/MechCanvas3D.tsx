import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { getMechTorsoWorldYaw, getMechTotalIntegrity } from '../engine/mechSim';
import { clamp, degToRad } from '../engine/math';
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
import { buildTerrainGroup } from '../render3d/terrainMeshBuilder';
import { ArmorFace, MechPartId, SimState, Vec3 } from '../types/mech';

type CameraMode = 'overview' | 'follow' | 'orbit';

interface MechCanvas3DProps {
  simState: SimState;
  renderTick?: number;
  focusedMechId: string;
  onSelectMech: (mechId: string) => void;
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
}: MechCanvas3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>('overview');
  const [showTacticalOverlay, setShowTacticalOverlay] = useState<boolean>(true);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [tags, setTags] = useState<ProjectedMechTag[]>([]);
  const [popups, setPopups] = useState<ProjectedHitPopup[]>([]);

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
  const terrainGroupRef = useRef<THREE.Group | null>(null);
  const terrainKeyRef = useRef<string>('');
  const tacticalGroupRef = useRef<THREE.Group | null>(null);
  const tacticalSpecKeyRef = useRef<string>('');
  const rigsRef = useRef<Map<string, MechRig3D>>(new Map());
  const effectsRef = useRef<EffectsManager3D | null>(null);
  const storedPopupsRef = useRef<StoredPopup[]>([]);
  const lastPopupTickRef = useRef<number>(-1);

  const orbitStateRef = useRef({
    yaw: 0.55,
    pitch: 0.62,
    overviewDist: 340,
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
      const sig = `${mech.blueprint.id}|${mech.blueprint.chassisId}|${mech.blueprint.boosterEnabled ? 1 : 0}|${mech.blueprint.color}|${Object.values(mech.blueprint.parts).join(',')}`;
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
      updateMechRigAnimation(rig, mech, state.terrain, mech.id === focusedId, state.tick);
    }

    // 3. Effects, projectiles & continuous laser beams
    if (effectsRef.current) {
      effectsRef.current.syncProjectiles(state.projectiles, state.terrain);
      effectsRef.current.syncActiveBeams(state.activeBeams, state.terrain);
      effectsRef.current.ingestEventsAndStep(
        state.lastTickEvents,
        state.mechs,
        state.terrain,
        state.tick
      );
    }

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

    // 5. Camera positioning & 3D tactical FOV/radar/aim overlay
    const orb = orbitStateRef.current;
    const focusedMech = state.mechs.find((m) => m.id === focusedId) ?? state.mechs[0];
    const targetVec = new THREE.Vector3(0, 6, 0);

    if (tacticalGroupRef.current) {
      const tacGroup = tacticalGroupRef.current;
      if (showTacticalRef.current && focusedMech && focusedMech.alive) {
        const effectiveRadar =
          focusedMech.stats.radarRange * (focusedMech.parts.head.destroyed ? 0.4 : 1.0);
        const effectiveFovHalf =
          focusedMech.stats.visionFovHalfDeg * (focusedMech.parts.head.destroyed ? 0.55 : 1.0);
        const specKey = `${Math.round(effectiveRadar)}_${Math.round(effectiveFovHalf)}`;
        if (tacGroup.children.length === 0 || tacticalSpecKeyRef.current !== specKey) {
          while (tacGroup.children.length > 0) {
            const c = tacGroup.children[0];
            tacGroup.remove(c);
            disposeObject3D(c);
          }

          // Optical FOV sector wedge
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
            opacity: 0.13,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const fovMesh = new THREE.Mesh(fovGeo, fovMat);
          fovMesh.position.y = 0.6;
          tacGroup.add(fovMesh);

          // 360-deg Radar ring
          const ringPts: THREE.Vector3[] = [];
          for (let i = 0; i <= 48; i++) {
            const th = (i / 48) * Math.PI * 2;
            ringPts.push(new THREE.Vector3(Math.cos(th) * effectiveRadar, 0.5, Math.sin(th) * effectiveRadar));
          }
          const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
          const ringMat = new THREE.LineBasicMaterial({
            color: '#f59e0b',
            transparent: true,
            opacity: 0.36,
          });
          tacGroup.add(new THREE.Line(ringGeo, ringMat));

          // Torso aim line
          const aimLen = Math.min(220, effectiveRadar);
          const aimGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 6.8, 0),
            new THREE.Vector3(0, 6.8, -aimLen),
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

    if (mode === 'follow' && focusedMech) {
      simToThreePos(focusedMech.pos, state.terrain, targetVec);
      const yawRad = degToRad(focusedMech.yawDeg);
      const fwdX = Math.sin(yawRad);
      const fwdZ = -Math.cos(yawRad);
      camera.position.set(
        targetVec.x - fwdX * 42,
        targetVec.y + 22,
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
      projVec.y += 12.2;
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
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#070d1a', 0.00024);

    const camera = new THREE.PerspectiveCamera(48, width / height, 1, 2400);
    const ambient = new THREE.AmbientLight('#cbd5e1', 0.42);
    const hemi = new THREE.HemisphereLight('#dbeafe', '#1e293b', 0.9);
    const dir = new THREE.DirectionalLight('#ffffff', 1.35);
    dir.position.set(180, 340, 160);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 1024;
    dir.shadow.mapSize.height = 1024;
    dir.shadow.camera.near = 40;
    dir.shadow.camera.far = 1200;
    const shadowBound = 380;
    dir.shadow.camera.left = -shadowBound;
    dir.shadow.camera.right = shadowBound;
    dir.shadow.camera.top = shadowBound;
    dir.shadow.camera.bottom = -shadowBound;
    dir.shadow.bias = -0.0008;
    const rim = new THREE.DirectionalLight('#38bdf8', 0.45);
    rim.position.set(-200, 140, -180);
    scene.add(ambient, hemi, dir, rim);

    const tacticalGroup = new THREE.Group();
    tacticalGroup.name = 'tactical_overlay';
    scene.add(tacticalGroup);
    tacticalGroupRef.current = tacticalGroup;
    tacticalSpecKeyRef.current = '';

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
        orb.overviewDist = clamp(orb.overviewDist + e.deltaY * 0.35, 120, 760);
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
      <div className="cm-3d-cam-bar">
        <button
          type="button"
          className={cameraMode === 'overview' ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
          onClick={() => setCameraMode('overview')}
        >
          全体俯瞰
        </button>
        <button
          type="button"
          className={cameraMode === 'follow' ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
          onClick={() => setCameraMode('follow')}
        >
          注目機追従
        </button>
        <button
          type="button"
          className={cameraMode === 'orbit' ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
          onClick={() => setCameraMode('orbit')}
        >
          機体オービット
        </button>
        <button
          type="button"
          className={showTacticalOverlay ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
          onClick={() => setShowTacticalOverlay((v) => !v)}
          title="注目機の光学視界コーン・360°レーダー・照準ラインの表示切替"
        >
          視界・照準
        </button>
      </div>

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

      <div className="cm-3d-hint">
        ドラッグ: 視点回転 / ホイール: ズーム / 機体クリック: 注目切替
      </div>
    </div>
  );
}
