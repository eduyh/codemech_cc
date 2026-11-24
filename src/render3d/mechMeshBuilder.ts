import * as THREE from 'three';
import { getArmWeaponSpec, getChassisSpec, getShoulderWeaponSpec } from '../data/parts';
import { getSurfaceHeight } from '../engine/terrain';
import { MechPartId, MechRuntimeState, TerrainConfig } from '../types/mech';
import { simToThreePos, simYawToThreeRotY } from './coords';

export interface MechRig3D {
  mechId: string;
  blueprintId: string;
  blueprintSignature: string;
  teamColorHex: string;
  root: THREE.Group;
  bodyGroup: THREE.Group;
  upperBodyGroup: THREE.Group;
  partGroups: Record<MechPartId, THREE.Group>;
  rightLegPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  boosterFlames: THREE.Mesh[];
  altitudeLine: THREE.Line;
  groundShadow: THREE.Mesh;
  focusRing: THREE.Mesh;
  stridePhase: number;
}

function tagClickable(obj: THREE.Object3D, mechId: string): void {
  obj.traverse((child) => {
    child.userData.mechId = mechId;
  });
}

function buildWeaponBarrel(
  weaponId: string,
  gunMat: THREE.Material,
  glowMat: THREE.Material,
  bladeMat: THREE.Material,
  shieldMat: THREE.Material
): THREE.Group {
  const g = new THREE.Group();
  if (weaponId === 'arm_none') return g;

  if (weaponId === 'sniper_rifle' || weaponId === 'gauss_rifle') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 1.8), gunMat);
    body.position.set(0, -0.1, -1.2);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, -0.05, -2.9);
    g.add(body, barrel);
  } else if (weaponId === 'plasma_rifle' || weaponId === 'ppc') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.48, 1.5), gunMat);
    body.position.set(0, -0.1, -1.1);
    const coil = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 1.1), glowMat);
    coil.position.set(0, 0.06, -1.6);
    g.add(body, coil);
  } else if (weaponId === 'small_laser' || weaponId === 'medium_laser' || weaponId === 'large_laser') {
    const len = weaponId === 'large_laser' ? 1.7 : weaponId === 'medium_laser' ? 1.25 : 0.9;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, len), gunMat);
    body.position.set(0, -0.1, -0.95);
    const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.4, 8), glowMat);
    emitter.rotation.x = Math.PI / 2;
    emitter.position.set(0, -0.08, -0.95 - len * 0.5);
    g.add(body, emitter);
  } else if (weaponId === 'laser_blade') {
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.7), gunMat);
    hilt.position.set(0, -0.1, -0.8);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 2.1), bladeMat);
    blade.position.set(0, -0.05, -2.1);
    g.add(hilt, blade);
  } else if (weaponId === 'autocannon_light' || weaponId === 'mg_light' || weaponId === 'lbx_shotgun') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 1.3), gunMat);
    body.position.set(0, -0.1, -1.0);
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6), gunMat);
    b1.rotation.x = Math.PI / 2;
    b1.position.set(0.1, -0.1, -1.9);
    const b2 = b1.clone();
    b2.position.x = -0.1;
    g.add(body, b1, b2);
  } else if (weaponId === 'srm_rocket' || weaponId === 'streak_srm') {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 1.25), gunMat);
    pod.position.set(0, -0.1, -1.0);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.15), shieldMat);
    tip.position.set(0, -0.1, -1.65);
    g.add(pod, tip);
  } else {
    // ac5 / ac10 / default ballistic cannon
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 1.45), gunMat);
    body.position.set(0, -0.1, -1.05);
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(weaponId === 'ac10' ? 0.13 : 0.09, 0.11, 1.35, 8),
      gunMat
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, -0.06, -2.1);
    g.add(body, barrel);
  }

  return g;
}

function buildSideTorsoWeapon(
  weaponId: string,
  gunMat: THREE.Material,
  accentMat: THREE.Material
): THREE.Group {
  const g = new THREE.Group();
  if (weaponId === 'shd_none') return g;

  if (weaponId === 'rail_cannon' || weaponId === 'gauss_rifle') {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.72, 1.55), gunMat);
    housing.position.set(0, 0.95, -0.35);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 3.0), accentMat);
    barrel.position.set(0, 0.98, -1.65);
    g.add(housing, barrel);
  } else if (weaponId === 'flak_pod' || weaponId === 'lbx_shotgun' || weaponId === 'ac5') {
    const bay = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.72, 0.9), gunMat);
    bay.position.set(0, 0.38, -0.92);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.95, 8), gunMat);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.38, -1.45);
    g.add(bay, muzzle);
  } else if (weaponId === 'medium_laser' || weaponId === 'large_laser' || weaponId === 'ppc') {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.58, 1.15), gunMat);
    housing.position.set(0, 0.38, -0.82);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.38), accentMat);
    lens.position.set(0, 0.38, -1.35);
    g.add(housing, lens);
  } else if (weaponId === 'ams_ballistic' || weaponId === 'ams_laser') {
    const turret = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.42, 0.56), gunMat);
    turret.position.set(0, 1.35, -0.05);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.72, 6), accentMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 1.48, -0.45);
    g.add(turret, barrel);
  } else if (weaponId === 'bap_probe') {
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.22, 0.42, 8), gunMat);
    dish.position.set(0, 1.38, -0.05);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 6), accentMat);
    mast.position.set(0, 1.95, -0.05);
    g.add(dish, mast);
  } else {
    // lrm5 / lrm10 / lrm15 / srm_rocket / streak_srm: integrated torso missile pod
    const w = weaponId === 'lrm15' ? 1.12 : weaponId === 'lrm10' ? 0.96 : 0.78;
    const pod = new THREE.Mesh(new THREE.BoxGeometry(w, 0.76, 1.35), gunMat);
    pod.position.set(0, 1.12, -0.22);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, 0.58, 0.14), accentMat);
    cap.position.set(0, 1.12, -0.92);
    g.add(pod, cap);
  }

  return g;
}

function buildLegAssembly(
  legStyle: string,
  sideSign: 1 | -1,
  armorMat: THREE.Material,
  frameMat: THREE.Material,
  accentMat: THREE.Material
): THREE.Group {
  const pivot = new THREE.Group();

  if (legStyle === 'quad') {
    // Front & rear outrigger legs on this side
    for (const zOff of [-0.75, 0.75]) {
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.0, 0.7), armorMat);
      upper.position.set(sideSign * 0.3, -1.0, zOff);
      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.58, 2.3, 0.75), frameMat);
      lower.position.set(sideSign * 0.5, -3.0, zOff * 1.15);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.5, 1.25), armorMat);
      foot.position.set(sideSign * 0.55, -4.25, zOff * 1.2);
      pivot.add(upper, lower, foot);
    }
    return pivot;
  }

  if (legStyle === 'hover') {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.4, 2.1), armorMat);
    skirt.position.set(sideSign * 0.15, -1.6, 0);
    const pod = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.25, 2.5), frameMat);
    pod.position.set(sideSign * 0.25, -3.45, 0);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 1.9), accentMat);
    glow.position.set(sideSign * 0.25, -4.15, 0);
    pivot.add(skirt, pod, glow);
    return pivot;
  }

  if (legStyle === 'reverse_joint') {
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.1, 0.9), armorMat);
    thigh.position.set(0, -1.05, 0.25);
    thigh.rotation.x = 0.25;
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.62, 2.3, 0.72), frameMat);
    shin.position.set(0, -2.9, -0.15);
    shin.rotation.x = -0.25;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.45, 1.65), armorMat);
    foot.position.set(0, -4.25, -0.25);
    pivot.add(thigh, shin, foot);
    return pivot;
  }

  // Standard biped
  const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.2, 1.0), armorMat);
  thigh.position.set(0, -1.1, 0);
  const shin = new THREE.Mesh(new THREE.BoxGeometry(0.78, 2.2, 0.95), frameMat);
  shin.position.set(0, -3.15, 0.05);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 1.6), armorMat);
  foot.position.set(0, -4.3, -0.15);
  pivot.add(thigh, shin, foot);
  return pivot;
}

export function buildProceduralMechRig(
  mech: MechRuntimeState,
  teamColorHex: string
): MechRig3D {
  const root = new THREE.Group();
  root.name = `mech_${mech.id}`;

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const upperBodyGroup = new THREE.Group();
  bodyGroup.add(upperBodyGroup);

  const primaryColor = new THREE.Color(mech.blueprint.color || teamColorHex);
  const teamColor = new THREE.Color(teamColorHex);

  const armorMat = new THREE.MeshLambertMaterial({ color: primaryColor, flatShading: true });
  const rearArmorMat = new THREE.MeshLambertMaterial({ color: '#334155', flatShading: true });
  const frameMat = new THREE.MeshLambertMaterial({ color: '#1e293b', flatShading: true });
  const gunMat = new THREE.MeshLambertMaterial({ color: '#475569', flatShading: true });
  const visorMat = new THREE.MeshBasicMaterial({ color: teamColor });
  const glowMat = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
  const bladeMat = new THREE.MeshBasicMaterial({ color: '#22d3ee' });
  const flameMat = new THREE.MeshBasicMaterial({ color: '#f97316', transparent: true, opacity: 0.9 });
  const shieldMat = new THREE.MeshLambertMaterial({ color: teamColor, flatShading: true });

  // 1. Center Torso (中央胴) + Pelvis + Waist Turntable
  const isHeavyTorso = mech.blueprint.parts.torso === 'torso_heavy';
  const isLightTorso = mech.blueprint.parts.torso === 'torso_light';
  const ctW = isHeavyTorso ? 1.95 : isLightTorso ? 1.45 : 1.7;
  const ctD = isHeavyTorso ? 2.4 : 2.05;

  const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.85, 1.55), frameMat);
  pelvisMesh.position.set(0, 4.65, 0);
  bodyGroup.add(pelvisMesh);

  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 6.65, 0);

  const coreMesh = new THREE.Mesh(new THREE.BoxGeometry(ctW, 3.3, ctD), armorMat);
  const chestProw = new THREE.Mesh(
    new THREE.BoxGeometry(ctW * 0.82, 1.85, 0.72),
    shieldMat
  );
  chestProw.position.set(0, 0.2, -ctD * 0.5 - 0.12);
  chestProw.rotation.x = 0.18;
  const upperGlacis = new THREE.Mesh(new THREE.BoxGeometry(ctW * 0.92, 0.75, ctD * 0.7), armorMat);
  upperGlacis.position.set(0, 1.55, -0.1);
  const rearPack = new THREE.Mesh(new THREE.BoxGeometry(ctW * 0.82, 2.35, 0.85), rearArmorMat);
  rearPack.position.set(0, 0.12, ctD * 0.5 + 0.35);
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.08, 0.72, 8), frameMat);
  waist.position.set(0, -1.92, 0);
  torsoGroup.add(coreMesh, chestProw, upperGlacis, rearPack, waist);

  // Backpack booster flames angled downward-backward for ~60° upward-forward lift
  const boosterFlames: THREE.Mesh[] = [];
  for (const fx of [-0.52, 0.52]) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.5, 6), flameMat);
    flame.rotation.x = Math.PI * 0.67;
    flame.position.set(fx, -0.5, ctD * 0.5 + 1.2);
    flame.visible = false;
    torsoGroup.add(flame);
    boosterFlames.push(flame);
  }
  upperBodyGroup.add(torsoGroup);

  // 2. Recessed BattleMech Cockpit Head (頭)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 8.65, -0.32);
  const headId = mech.blueprint.parts.head;
  const headW = headId === 'head_armored' ? 1.05 : headId === 'head_recon' ? 0.82 : 0.92;
  const headBox = new THREE.Mesh(new THREE.BoxGeometry(headW, 0.75, 1.2), armorMat);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(headW * 1.06, 0.22, 0.55), frameMat);
  brow.position.set(0, 0.32, -0.45);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(headW * 0.86, 0.24, 0.22), visorMat);
  visor.position.set(0, 0.05, -0.6);
  headGroup.add(headBox, brow, visor);
  if (headId === 'head_recon') {
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.15, 6), glowMat);
    antenna.position.set(0.32, 0.75, 0.15);
    headGroup.add(antenna);
  }
  upperBodyGroup.add(headGroup);

  // 3. Right & Left Side Torsos (右胴 / 左胴) flanking Center Torso
  const isHeavyStR = mech.blueprint.parts.rightShoulderMount === 'shd_heavy';
  const isHeavyStL = mech.blueprint.parts.leftShoulderMount === 'shd_heavy';
  const stWR = isHeavyStR ? 1.24 : 1.02;
  const stWL = isHeavyStL ? 1.24 : 1.02;
  const stDR = isHeavyStR ? 2.25 : 1.88;
  const stDL = isHeavyStL ? 2.25 : 1.88;
  const stH = 2.95;

  const rightTorsoX = ctW * 0.5 + stWR * 0.5 + 0.05;
  const rightShoulderGroup = new THREE.Group();
  rightShoulderGroup.position.set(rightTorsoX, 6.9, 0);
  const rStMain = new THREE.Mesh(new THREE.BoxGeometry(stWR, stH, stDR), armorMat);
  const rStBevel = new THREE.Mesh(new THREE.BoxGeometry(stWR * 0.88, 1.75, 0.38), shieldMat);
  rStBevel.position.set(0, 0.25, -stDR * 0.5 - 0.08);
  const rStRear = new THREE.Mesh(new THREE.BoxGeometry(stWR * 0.85, 2.2, 0.35), rearArmorMat);
  rStRear.position.set(0, 0.1, stDR * 0.5 + 0.15);
  rightShoulderGroup.add(
    rStMain,
    rStBevel,
    rStRear,
    buildSideTorsoWeapon(
      getShoulderWeaponSpec(mech.blueprint.parts.rightShoulderWeapon).id,
      gunMat,
      visorMat
    )
  );
  upperBodyGroup.add(rightShoulderGroup);

  const leftTorsoX = -(ctW * 0.5 + stWL * 0.5 + 0.05);
  const leftShoulderGroup = new THREE.Group();
  leftShoulderGroup.position.set(leftTorsoX, 6.9, 0);
  const lStMain = new THREE.Mesh(new THREE.BoxGeometry(stWL, stH, stDL), armorMat);
  const lStBevel = new THREE.Mesh(new THREE.BoxGeometry(stWL * 0.88, 1.75, 0.38), shieldMat);
  lStBevel.position.set(0, 0.25, -stDL * 0.5 - 0.08);
  const lStRear = new THREE.Mesh(new THREE.BoxGeometry(stWL * 0.85, 2.2, 0.35), rearArmorMat);
  lStRear.position.set(0, 0.1, stDL * 0.5 + 0.15);
  leftShoulderGroup.add(
    lStMain,
    lStBevel,
    lStRear,
    buildSideTorsoWeapon(
      getShoulderWeaponSpec(mech.blueprint.parts.leftShoulderWeapon).id,
      gunMat,
      visorMat
    )
  );
  upperBodyGroup.add(leftShoulderGroup);

  // 4. Right & Left Weapon Arms attached outboard of Side Torsos
  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(ctW * 0.5 + stWR + 0.44, 6.75, 0);
  const rightArmPivot = new THREE.Group();
  const rJoint = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 8), frameMat);
  rJoint.rotation.z = Math.PI / 2;
  rJoint.position.set(-0.22, -0.1, 0);
  const rUpper = new THREE.Mesh(new THREE.BoxGeometry(0.64, 1.65, 0.74), frameMat);
  rUpper.position.set(0.05, -0.85, 0);
  const rFore = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.78, 1.4), armorMat);
  rFore.position.set(0.05, -1.62, -0.45);
  const rWep = buildWeaponBarrel(
    getArmWeaponSpec(mech.blueprint.parts.rightArmWeapon).id,
    gunMat,
    glowMat,
    bladeMat,
    shieldMat
  );
  rWep.position.set(0.05, -1.58, -0.42);
  rightArmPivot.add(rJoint, rUpper, rFore, rWep);
  rightArmGroup.add(rightArmPivot);
  upperBodyGroup.add(rightArmGroup);

  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-(ctW * 0.5 + stWL + 0.44), 6.75, 0);
  const leftArmPivot = new THREE.Group();
  const lJoint = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 8), frameMat);
  lJoint.rotation.z = Math.PI / 2;
  lJoint.position.set(0.22, -0.1, 0);
  const lUpper = new THREE.Mesh(new THREE.BoxGeometry(0.64, 1.65, 0.74), frameMat);
  lUpper.position.set(-0.05, -0.85, 0);
  const lFore = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.78, 1.4), armorMat);
  lFore.position.set(-0.05, -1.62, -0.45);
  const lWep = buildWeaponBarrel(
    getArmWeaponSpec(mech.blueprint.parts.leftArmWeapon).id,
    gunMat,
    glowMat,
    bladeMat,
    shieldMat
  );
  lWep.position.set(-0.05, -1.58, -0.42);
  leftArmPivot.add(lJoint, lUpper, lFore, lWep);
  leftArmGroup.add(leftArmPivot);
  upperBodyGroup.add(leftArmGroup);

  // 5. Right & Left Legs
  const chassis = getChassisSpec(mech.blueprint.chassisId);
  const sizeScale = mech.stats.sizeScale;
  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(1.0, 4.55, 0);
  const rightLegPivot = buildLegAssembly(chassis.legStyle, 1, armorMat, frameMat, glowMat);
  rightLegGroup.add(rightLegPivot);
  bodyGroup.add(rightLegGroup);

  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-1.0, 4.55, 0);
  const leftLegPivot = buildLegAssembly(chassis.legStyle, -1, armorMat, frameMat, glowMat);
  leftLegGroup.add(leftLegPivot);
  bodyGroup.add(leftLegGroup);

  // Ground shadow disc (scaled by chassis sizeScale)
  const shadowGeo = new THREE.CircleGeometry(3.2 * sizeScale, 20);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: '#020617',
    transparent: true,
    opacity: 0.48,
  });
  const groundShadow = new THREE.Mesh(shadowGeo, shadowMat);
  root.add(groundShadow);

  // Focus ring around feet (scaled by chassis sizeScale)
  const ringGeo = new THREE.RingGeometry(3.6 * sizeScale, 4.3 * sizeScale, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
  const focusRing = new THREE.Mesh(ringGeo, ringMat);
  focusRing.position.y = 0.2;
  focusRing.visible = false;
  root.add(focusRing);

  // Altitude drop-line when airborne
  const altGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -1, 0),
  ]);
  const altMat = new THREE.LineBasicMaterial({
    color: teamColor,
    transparent: true,
    opacity: 0.65,
  });
  const altitudeLine = new THREE.Line(altGeo, altMat);
  altitudeLine.visible = false;
  root.add(altitudeLine);

  bodyGroup.scale.setScalar(sizeScale);

  bodyGroup.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && !boosterFlames.includes(mesh)) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  tagClickable(bodyGroup, mech.id);

  return {
    mechId: mech.id,
    blueprintId: mech.blueprint.id,
    blueprintSignature: `${mech.blueprint.id}|${mech.blueprint.chassisId}|${mech.blueprint.boosterEnabled ? 1 : 0}|${mech.blueprint.color}|${Object.values(mech.blueprint.parts).join(',')}`,
    teamColorHex,
    root,
    bodyGroup,
    upperBodyGroup,
    partGroups: {
      head: headGroup,
      torso: torsoGroup,
      rightShoulder: rightShoulderGroup,
      rightArm: rightArmGroup,
      leftShoulder: leftShoulderGroup,
      leftArm: leftArmGroup,
      rightLeg: rightLegGroup,
      leftLeg: leftLegGroup,
    },
    rightLegPivot,
    leftLegPivot,
    rightArmPivot,
    leftArmPivot,
    boosterFlames,
    altitudeLine,
    groundShadow,
    focusRing,
    stridePhase: mech.slotIndex * 0.9,
  };
}

export function updateMechRigAnimation(
  rig: MechRig3D,
  mech: MechRuntimeState,
  terrain: TerrainConfig,
  focused: boolean,
  simTick: number
): void {
  simToThreePos(mech.pos, terrain, rig.root.position);
  rig.bodyGroup.rotation.set(0, simYawToThreeRotY(mech.yawDeg), 0);
  rig.upperBodyGroup.rotation.set(0, simYawToThreeRotY(mech.torsoYawOffsetDeg), 0);

  // Part destruction visibility
  rig.partGroups.head.visible = !mech.parts.head.destroyed;
  rig.partGroups.rightShoulder.visible = !mech.parts.rightShoulder.destroyed;
  rig.partGroups.leftShoulder.visible = !mech.parts.leftShoulder.destroyed;
  rig.partGroups.rightArm.visible = !mech.parts.rightArm.destroyed;
  rig.partGroups.leftArm.visible = !mech.parts.leftArm.destroyed;
  rig.partGroups.rightLeg.visible = !mech.parts.rightLeg.destroyed;
  rig.partGroups.leftLeg.visible = !mech.parts.leftLeg.destroyed;

  // Ground shadow & altitude line
  const surfaceZ = getSurfaceHeight(terrain, mech.pos.x, mech.pos.y);
  const altAboveGround = Math.max(0, mech.pos.z - surfaceZ);
  rig.groundShadow.position.y = -altAboveGround + 0.14;
  rig.focusRing.position.y = 0.22;
  rig.focusRing.visible = focused && mech.alive;

  if (altAboveGround > 1.2 && mech.alive) {
    rig.altitudeLine.visible = true;
    const posAttr = rig.altitudeLine.geometry.attributes.position as THREE.BufferAttribute;
    posAttr.setXYZ(0, 0, 0.2, 0);
    posAttr.setXYZ(1, 0, -altAboveGround + 0.15, 0);
    posAttr.needsUpdate = true;
  } else {
    rig.altitudeLine.visible = false;
  }

  if (!mech.alive) {
    rig.bodyGroup.position.y = -3.4 * mech.stats.sizeScale;
    rig.bodyGroup.rotation.x = 1.25;
    rig.bodyGroup.rotation.z = 0.35;
    rig.upperBodyGroup.rotation.set(0, 0, 0);
    rig.boosterFlames.forEach((f) => {
      f.visible = false;
    });
    return;
  }

  rig.bodyGroup.position.y = 0;
  rig.bodyGroup.rotation.x = 0;
  rig.bodyGroup.rotation.z = 0;

  const horizSpeed = Math.hypot(mech.vel.x, mech.vel.y);
  const isHover = mech.blueprint.parts.legs === 'legs_hover';

  if (!mech.grounded) {
    rig.rightLegPivot.rotation.x = 0.35;
    rig.leftLegPivot.rotation.x = -0.25;
  } else if (isHover) {
    rig.rightLegPivot.rotation.x = 0;
    rig.leftLegPivot.rotation.x = 0;
    rig.bodyGroup.position.y = Math.sin(simTick * 0.25 + mech.slotIndex) * 0.22 + 0.22;
  } else if (horizSpeed > 3) {
    rig.stridePhase = simTick * 0.35 + mech.slotIndex;
    const amp = Math.min(0.55, horizSpeed / 55);
    rig.rightLegPivot.rotation.x = Math.sin(rig.stridePhase) * amp;
    rig.leftLegPivot.rotation.x = -Math.sin(rig.stridePhase) * amp;
  } else {
    rig.rightLegPivot.rotation.x = 0;
    rig.leftLegPivot.rotation.x = 0;
  }

  rig.rightArmPivot.rotation.x = 0;
  rig.leftArmPivot.rotation.x = 0;

  // Booster flames when torso booster is active & jumping/lifting in ~60° forward arc
  const showFlame =
    mech.stats.boosterActive &&
    !mech.enOverheated &&
    !mech.grounded &&
    mech.vel.z > -4;
  const flamePulse = 0.85 + Math.sin(simTick * 0.8) * 0.25;
  for (const flame of rig.boosterFlames) {
    flame.visible = showFlame;
    if (showFlame) {
      flame.scale.set(1, flamePulse, 1);
    }
  }
}
