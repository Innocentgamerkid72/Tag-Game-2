import * as THREE from "three";
import type { WeaponType } from "./weapon";

// Renders a simple hand-held weapon model in the bottom-right corner of the
// screen. Uses a second isolated scene + camera so the model always renders
// on top (clearDepth trick) and is never occluded by the game world.

const WEAPON_SCENE = new THREE.Scene();
const WEAPON_CAM   = new THREE.PerspectiveCamera(50, 1, 0.01, 10);
WEAPON_CAM.position.set(0, 0, 0);
WEAPON_CAM.lookAt(0, 0, -1);

// Simple point light so the model isn't flat
const _light = new THREE.PointLight(0xffffff, 1.5, 6);
_light.position.set(0.5, 1, 1);
WEAPON_SCENE.add(_light);
WEAPON_SCENE.add(new THREE.AmbientLight(0xffffff, 0.6));

// ── Model builders (all geometry kept minimal) ────────────────────────────────

function _box(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
}

function _cyl(rt: number, rb: number, len: number, color: number, segs = 8): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(rt, rb, len, segs),
    new THREE.MeshLambertMaterial({ color }),
  );
  m.rotation.x = Math.PI / 2; // point along -Z
  return m;
}

function _sphere(r: number, color: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(r, 8, 8),
    new THREE.MeshLambertMaterial({ color }),
  );
}

function buildSword(): THREE.Group {
  const g = new THREE.Group();
  // Blade — long thin light-blue bar
  const blade = _box(0.04, 0.55, 0.04, 0xaaddff);
  blade.position.set(0, 0.22, 0);
  g.add(blade);
  // Guard — horizontal bar
  const guard = _box(0.26, 0.05, 0.06, 0x8899bb);
  guard.position.set(0, -0.04, 0);
  g.add(guard);
  // Handle
  const handle = _box(0.05, 0.18, 0.05, 0x553322);
  handle.position.set(0, -0.16, 0);
  g.add(handle);
  // Pommel
  const pommel = _sphere(0.045, 0x664433);
  pommel.position.set(0, -0.27, 0);
  g.add(pommel);
  return g;
}

function buildRocket(): THREE.Group {
  const g = new THREE.Group();
  // Main tube
  const tube = _cyl(0.06, 0.06, 0.52, 0x556677);
  tube.position.set(0, 0, 0);
  g.add(tube);
  // Bell at back
  const bell = _cyl(0.09, 0.06, 0.12, 0x445566);
  bell.position.set(0, 0, 0.32);
  g.add(bell);
  // Sight on top
  const sight = _box(0.03, 0.06, 0.04, 0x334455);
  sight.position.set(0, 0.09, -0.1);
  g.add(sight);
  // Small fins (two flat boxes)
  const finL = _box(0.14, 0.02, 0.12, 0x445566);
  finL.position.set(0, -0.06, 0.2);
  g.add(finL);
  const finV = _box(0.02, 0.14, 0.12, 0x445566);
  finV.position.set(0, 0, 0.2);
  g.add(finV);
  return g;
}

function buildFreezeRay(): THREE.Group {
  const g = new THREE.Group();
  // Barrel
  const barrel = _cyl(0.035, 0.05, 0.5, 0x2288cc);
  g.add(barrel);
  // Crystal tip
  const tip = _sphere(0.07, 0x88eeff);
  tip.position.set(0, 0, -0.28);
  g.add(tip);
  // Inner glow sphere
  const glow = _sphere(0.04, 0xaaffff);
  glow.position.set(0, 0, -0.28);
  g.add(glow);
  // Grip bumps
  for (let i = 0; i < 3; i++) {
    const bump = _cyl(0.055, 0.055, 0.04, 0x1a6699);
    bump.position.set(0, 0, 0.05 + i * 0.09);
    g.add(bump);
  }
  return g;
}

function buildBlaster(): THREE.Group {
  const g = new THREE.Group();
  // Barrel — thin long cylinder
  const barrel = _cyl(0.025, 0.025, 0.44, 0x223322);
  barrel.position.set(0, 0.03, 0);
  g.add(barrel);
  // Barrel tip — slightly wider ring
  const tip = _cyl(0.038, 0.025, 0.05, 0x334433);
  tip.position.set(0, 0.03, -0.22);
  g.add(tip);
  // Receiver body
  const body = _box(0.1, 0.08, 0.22, 0x1a2e1a);
  body.position.set(0, 0, 0.1);
  g.add(body);
  // Energy cell (glowing green)
  const cell = _sphere(0.045, 0x00ff44);
  cell.position.set(0, 0.01, 0.22);
  g.add(cell);
  // Inner glow
  const glow = _sphere(0.028, 0x88ffaa);
  glow.position.set(0, 0.01, 0.22);
  g.add(glow);
  // Grip
  const grip = _box(0.07, 0.16, 0.07, 0x111a11);
  grip.position.set(0, -0.1, 0.14);
  g.add(grip);
  // Trigger guard
  const guard = _box(0.04, 0.04, 0.1, 0x1a2e1a);
  guard.position.set(0, -0.06, 0.05);
  g.add(guard);
  return g;
}

function buildShotgun(): THREE.Group {
  const g = new THREE.Group();
  // Barrel (double — two narrow cylinders side by side)
  const barL = _cyl(0.03, 0.03, 0.42, 0x445544);
  barL.position.set( 0.035, 0, 0);
  g.add(barL);
  const barR = _cyl(0.03, 0.03, 0.42, 0x445544);
  barR.position.set(-0.035, 0, 0);
  g.add(barR);
  // Receiver
  const recv = _box(0.12, 0.1, 0.18, 0x334433);
  recv.position.set(0, -0.02, 0.18);
  g.add(recv);
  // Stock
  const stock = _box(0.07, 0.09, 0.22, 0x6b4226);
  stock.position.set(0, -0.03, 0.35);
  g.add(stock);
  // Guard
  const guard = _box(0.1, 0.05, 0.06, 0x223322);
  guard.position.set(0, -0.07, 0.06);
  g.add(guard);
  return g;
}

// ── Pre-build all models ──────────────────────────────────────────────────────
const MODELS: Record<WeaponType, THREE.Group> = {
  sword:   buildSword(),
  rocket:  buildRocket(),
  freeze:  buildFreezeRay(),
  shotgun: buildShotgun(),
  blaster: buildBlaster(),
};

// Resting position / rotation for each model in view-space
// (x right, y up, -z into screen)
const POSE: Record<WeaponType, { pos: [number,number,number]; rot: [number,number,number] }> = {
  sword:   { pos: [ 0.28, -0.30, -0.55], rot: [ 0.10,  0.50, -0.20] },
  rocket:  { pos: [ 0.25, -0.28, -0.60], rot: [ 0.05,  0.45,  0.00] },
  freeze:  { pos: [ 0.26, -0.28, -0.58], rot: [ 0.05,  0.40,  0.00] },
  shotgun: { pos: [ 0.25, -0.30, -0.58], rot: [ 0.05,  0.42,  0.00] },
  blaster: { pos: [ 0.26, -0.28, -0.56], rot: [ 0.05,  0.42,  0.00] },
};

// Add all models to the weapon scene (only one visible at a time)
for (const m of Object.values(MODELS)) {
  WEAPON_SCENE.add(m);
  m.visible = false;
}

let _currentType: WeaponType | null = null;

export function setViewModelWeapon(type: WeaponType | null) {
  if (type === _currentType) return;
  _currentType = type;
  for (const [t, m] of Object.entries(MODELS) as [WeaponType, THREE.Group][]) {
    m.visible = t === type;
    if (t === type) {
      const pose = POSE[t];
      m.position.set(...pose.pos);
      m.rotation.set(...pose.rot);
    }
  }
}

export function renderViewModel(renderer: THREE.WebGLRenderer, aspectRatio: number) {
  if (!_currentType) return;

  WEAPON_CAM.aspect = aspectRatio;
  WEAPON_CAM.updateProjectionMatrix();

  // Render on top: preserve colour buffer, wipe depth only
  renderer.clearDepth();
  renderer.render(WEAPON_SCENE, WEAPON_CAM);
}
