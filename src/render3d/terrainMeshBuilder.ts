import * as THREE from 'three';
import { getGroundHeight } from '../engine/terrain';
import { TerrainConfig } from '../types/mech';

function makeCompassLabelSprite(text: string, colorHex: string): THREE.Sprite | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(12, 12, 232, 72, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = colorHex;
    ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 49);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(42, 16, 1);
  return sprite;
}

function buildDrapedGridLines(
  terrain: TerrainConfig,
  step: number,
  sampleStep: number,
  skipMultiplesOf?: number
): THREE.BufferGeometry {
  const pts: number[] = [];
  const hw = terrain.width * 0.5;
  const hd = terrain.depth * 0.5;

  // North-South lines (varying Z for fixed X)
  for (let wx = step; wx < terrain.width; wx += step) {
    if (skipMultiplesOf && wx % skipMultiplesOf === 0) continue;
    const vx = wx - hw;
    for (let wy = 0; wy < terrain.depth; wy += sampleStep) {
      const wyNext = Math.min(terrain.depth, wy + sampleStep);
      const h1 = getGroundHeight(terrain, wx, wy) + 0.22;
      const h2 = getGroundHeight(terrain, wx, wyNext) + 0.22;
      pts.push(vx, h1, wy - hd, vx, h2, wyNext - hd);
    }
  }

  // East-West lines (varying X for fixed Z)
  for (let wy = step; wy < terrain.depth; wy += step) {
    if (skipMultiplesOf && wy % skipMultiplesOf === 0) continue;
    const vz = wy - hd;
    for (let wx = 0; wx < terrain.width; wx += sampleStep) {
      const wxNext = Math.min(terrain.width, wx + sampleStep);
      const h1 = getGroundHeight(terrain, wx, wy) + 0.22;
      const h2 = getGroundHeight(terrain, wxNext, wy) + 0.22;
      pts.push(wx - hw, h1, vz, wxNext - hw, h2, vz);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

export function buildTerrainGroup(terrain: TerrainConfig): THREE.Group {
  const group = new THREE.Group();
  group.name = `terrain_${terrain.id}`;

  const segsX = 64;
  const segsZ = 64;
  const geo = new THREE.PlaneGeometry(terrain.width, terrain.depth, segsX, segsZ);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);
  const lowColor = new THREE.Color('#132238');
  const midColor = new THREE.Color('#1f415e');
  const highColor = new THREE.Color('#387694');
  const tmpColor = new THREE.Color();

  const maxAmp = Math.max(12, terrain.heightAmplitude);

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const wx = vx + terrain.width * 0.5;
    const wy = vz + terrain.depth * 0.5;
    const h = getGroundHeight(terrain, wx, wy);
    posAttr.setY(i, h);

    const ratio = Math.min(1, Math.max(0, h / maxAmp));
    if (ratio < 0.5) {
      tmpColor.lerpColors(lowColor, midColor, ratio * 2);
    } else {
      tmpColor.lerpColors(midColor, highColor, (ratio - 0.5) * 2);
    }
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.88,
    metalness: 0.12,
  });
  const terrainMesh = new THREE.Mesh(geo, terrainMat);
  terrainMesh.name = 'terrain_surface';
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // Heightmap-draped orthogonal tactical grids (50m minor + 100m major)
  const minorGridGeo = buildDrapedGridLines(terrain, 50, 10, 100);
  const minorGridMat = new THREE.LineBasicMaterial({
    color: '#334155',
    transparent: true,
    opacity: 0.58,
  });
  group.add(new THREE.LineSegments(minorGridGeo, minorGridMat));

  const majorGridGeo = buildDrapedGridLines(terrain, 100, 10);
  const majorGridMat = new THREE.LineBasicMaterial({
    color: '#38bdf8',
    transparent: true,
    opacity: 0.34,
  });
  group.add(new THREE.LineSegments(majorGridGeo, majorGridMat));

  // Obstacles (mesas, pillars, cover walls) with bevel caps & crisp edges
  const obsMat = new THREE.MeshStandardMaterial({
    color: '#2b3d57',
    roughness: 0.72,
    metalness: 0.22,
    flatShading: true,
  });
  const obsCapMat = new THREE.MeshStandardMaterial({
    color: '#476285',
    roughness: 0.65,
    metalness: 0.25,
    flatShading: true,
  });
  const obsEdgeMat = new THREE.LineBasicMaterial({
    color: '#7dd3fc',
    transparent: true,
    opacity: 0.42,
  });

  for (const obs of terrain.obstacles) {
    const h = Math.max(0.5, obs.topZ - obs.baseZ);
    const obsGeo = new THREE.BoxGeometry(obs.width, h, obs.height);
    const mesh = new THREE.Mesh(obsGeo, obsMat);
    mesh.name = `obs_${obs.id}`;
    mesh.position.set(
      obs.x + obs.width * 0.5 - terrain.width * 0.5,
      obs.baseZ + h * 0.5,
      obs.y + obs.height * 0.5 - terrain.depth * 0.5
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(obsGeo), obsEdgeMat);
    edges.position.copy(mesh.position);
    group.add(edges);

    // Top rim plate for depth readability
    const capGeo = new THREE.BoxGeometry(obs.width + 0.5, 0.5, obs.height + 0.5);
    const capMesh = new THREE.Mesh(capGeo, obsCapMat);
    capMesh.position.set(mesh.position.x, obs.topZ - 0.15, mesh.position.z);
    capMesh.receiveShadow = true;
    group.add(capMesh);
  }

  // CodePanzer-style Perimeter Walls with cyan trim rails
  const hw = terrain.width * 0.5;
  const hd = terrain.depth * 0.5;
  const wallThick = 8;
  const wallHeight = 10;
  const wallMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    roughness: 0.55,
    metalness: 0.45,
  });
  const trimMat = new THREE.MeshBasicMaterial({ color: '#0ea5e9' });

  const wallsData = [
    { w: terrain.width + wallThick * 2, d: wallThick, x: 0, z: -hd - wallThick * 0.5 },
    { w: terrain.width + wallThick * 2, d: wallThick, x: 0, z: hd + wallThick * 0.5 },
    { w: wallThick, d: terrain.depth, x: -hw - wallThick * 0.5, z: 0 },
    { w: wallThick, d: terrain.depth, x: hw + wallThick * 0.5, z: 0 },
  ];

  for (const wd of wallsData) {
    const wMesh = new THREE.Mesh(new THREE.BoxGeometry(wd.w, wallHeight, wd.d), wallMat);
    wMesh.position.set(wd.x, wallHeight * 0.5, wd.z);
    wMesh.receiveShadow = true;
    group.add(wMesh);

    const trimMesh = new THREE.Mesh(new THREE.BoxGeometry(wd.w, 1.3, wd.d), trimMat);
    trimMesh.position.set(wd.x, wallHeight + 0.65, wd.z);
    group.add(trimMesh);
  }

  // Compass Labels (N=0°, E=90°, S=180°, W=270°)
  const compassDefs: Array<{ text: string; color: string; x: number; z: number }> = [
    { text: 'N 0°', color: '#38bdf8', x: 0, z: -hd - 18 },
    { text: 'E 90°', color: '#cbd5e1', x: hw + 22, z: 0 },
    { text: 'S 180°', color: '#cbd5e1', x: 0, z: hd + 18 },
    { text: 'W 270°', color: '#cbd5e1', x: -hw - 22, z: 0 },
  ];
  for (const c of compassDefs) {
    const sprite = makeCompassLabelSprite(c.text, c.color);
    if (sprite) {
      sprite.position.set(c.x, 22, c.z);
      group.add(sprite);
    }
  }

  return group;
}
