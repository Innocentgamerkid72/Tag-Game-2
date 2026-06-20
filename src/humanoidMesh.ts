import * as THREE from "three";

const SKIN  = 0xffb890;
const PANTS = 0x334477;
const SHOES = 0x221100;

export interface HumanoidParts {
  group:       THREE.Group;
  shirtMeshes: THREE.Mesh[];
  limbs: {
    leftArm:  THREE.Group; // pivot at shoulder
    rightArm: THREE.Group;
    leftLeg:  THREE.Group; // pivot at hip
    rightLeg: THREE.Group;
  };
}

function mat(color: number, roughness = 0.88, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

export function buildHumanoid(shirtColor: number): HumanoidParts {
  const group = new THREE.Group();
  const shirtMeshes: THREE.Mesh[] = [];

  function mk(
    geo:    THREE.BufferGeometry,
    color:  number,
    parent: THREE.Object3D,
    rough   = 0.88,
    shirt   = false,
  ): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat(color, rough));
    m.castShadow = true;
    parent.add(m);
    if (shirt) shirtMeshes.push(m);
    return m;
  }

  const B = (w: number, h: number, d: number, c: number, p: THREE.Object3D, rough = 0.88, shirt = false) =>
    mk(new THREE.BoxGeometry(w, h, d), c, p, rough, shirt);
  const S = (r: number, c: number, p: THREE.Object3D, rough = 0.88) =>
    mk(new THREE.SphereGeometry(r, 8, 6), c, p, rough);
  const C = (r: number, h: number, c: number, p: THREE.Object3D) =>
    mk(new THREE.CylinderGeometry(r, r, h, 8), c, p);

  // ── Head & face ──
  const head = S(0.185, SKIN, group, 0.82);
  head.position.set(0, 1.62, 0);

  const eL = S(0.032, 0x111122, group, 0.5);
  eL.position.set(-0.075, 1.645, -0.175);
  const eR = S(0.032, 0x111122, group, 0.5);
  eR.position.set( 0.075, 1.645, -0.175);

  const neck = C(0.065, 0.10, SKIN, group);
  neck.position.set(0, 1.455, 0);

  // ── Torso / waist (shirt-colored shirt material) ──
  const torso = B(0.46, 0.52, 0.25, shirtColor, group, 0.9, true);
  torso.position.set(0, 1.14, 0);

  const waist = B(0.42, 0.16, 0.23, PANTS, group);
  waist.position.set(0, 0.82, 0);

  // ── Left arm pivot at shoulder (world y = 1.19) ──
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.30, 1.19, 0);
  group.add(leftArm);
  B(0.14, 0.30, 0.15, shirtColor, leftArm, 0.9, true).position.set(0, -0.15, 0);
  B(0.12, 0.28, 0.13, SKIN,       leftArm, 0.82       ).position.set(0, -0.46, 0);

  // ── Right arm pivot at shoulder ──
  const rightArm = new THREE.Group();
  rightArm.position.set(0.30, 1.19, 0);
  group.add(rightArm);
  B(0.14, 0.30, 0.15, shirtColor, rightArm, 0.9, true).position.set(0, -0.15, 0);
  B(0.12, 0.28, 0.13, SKIN,       rightArm, 0.82       ).position.set(0, -0.46, 0);

  // ── Left leg pivot at hip (world y = 0.73) ──
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.12, 0.73, 0);
  group.add(leftLeg);
  B(0.165, 0.35, 0.165, PANTS, leftLeg).position.set(0, -0.175, 0);
  B(0.145, 0.31, 0.145, PANTS, leftLeg).position.set(0, -0.505, 0);
  B(0.175, 0.07, 0.260, SHOES, leftLeg, 0.65).position.set(0, -0.695, 0.05);

  // ── Right leg pivot at hip ──
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.12, 0.73, 0);
  group.add(rightLeg);
  B(0.165, 0.35, 0.165, PANTS, rightLeg).position.set(0, -0.175, 0);
  B(0.145, 0.31, 0.145, PANTS, rightLeg).position.set(0, -0.505, 0);
  B(0.175, 0.07, 0.260, SHOES, rightLeg, 0.65).position.set(0, -0.695, 0.05);

  return { group, shirtMeshes, limbs: { leftArm, rightArm, leftLeg, rightLeg } };
}

export function setHumanoidShirtColor(parts: HumanoidParts, color: number): void {
  for (const m of parts.shirtMeshes)
    (m.material as THREE.MeshStandardMaterial).color.set(color);
}

/**
 * Drive limb animations each frame with smooth lerp transitions.
 * @param walkCycle  Caller advances by horizSpeed * dt * 2.5
 * @param isInAir    Off the ground
 * @param isSprinting Sprinting state
 * @param horizSpeed  Current horizontal speed (units/s)
 * @param dt          Frame delta time (seconds)
 */
export function updateHumanoidAnimation(
  parts:       HumanoidParts,
  walkCycle:   number,
  isInAir:     boolean,
  isSprinting: boolean,
  horizSpeed:  number,
  dt:          number,
): void {
  const { leftArm, rightArm, leftLeg, rightLeg } = parts.limbs;
  const now = performance.now() * 0.001;

  // Smooth lerp factor — higher = snappier response
  const k  = 1 - Math.exp(-13 * dt);
  const ks = 1 - Math.exp(-8  * dt); // slower for body-level transforms

  function lerp(current: number, target: number, factor: number) {
    return current + (target - current) * factor;
  }

  if (isInAir) {
    leftArm.rotation.x  = lerp(leftArm.rotation.x,  -0.55, k);
    rightArm.rotation.x = lerp(rightArm.rotation.x, -0.55, k);
    leftLeg.rotation.x  = lerp(leftLeg.rotation.x,   0.30, k);
    rightLeg.rotation.x = lerp(rightLeg.rotation.x, -0.12, k);

    parts.group.rotation.x = lerp(parts.group.rotation.x, 0, ks);
    parts.group.position.x = lerp(parts.group.position.x, 0, ks);
    parts.group.position.y = lerp(parts.group.position.y, 0, ks);
    return;
  }

  const speedFactor = Math.min(horizSpeed / 3.0, 1.0);
  const maxAmp      = isSprinting ? 0.78 : 0.55;
  const swing       = Math.sin(walkCycle) * maxAmp * speedFactor;

  leftArm.rotation.x  = lerp(leftArm.rotation.x,   swing, k);
  rightArm.rotation.x = lerp(rightArm.rotation.x,  -swing, k);
  leftLeg.rotation.x  = lerp(leftLeg.rotation.x,   -swing, k);
  rightLeg.rotation.x = lerp(rightLeg.rotation.x,   swing, k);

  // Forward lean when sprinting
  const targetLean = isSprinting ? speedFactor * 0.10 : 0;
  parts.group.rotation.x = lerp(parts.group.rotation.x, targetLean, ks);

  // Lateral hip sway (opposite phase to leg swing)
  const lateralTarget = Math.sin(walkCycle + Math.PI / 2) * 0.028 * speedFactor;
  parts.group.position.x = lerp(parts.group.position.x, lateralTarget, ks);

  // Vertical body bob — two bobs per stride
  const bobAmp = (isSprinting ? 0.055 : 0.038) * speedFactor;
  const bobTarget = Math.abs(Math.sin(walkCycle * 2)) * bobAmp;

  // Breathing idle: very subtle when standing still
  const breathOffset = speedFactor < 0.08
    ? Math.sin(now * 1.15) * 0.007
    : 0;

  parts.group.position.y = lerp(parts.group.position.y, bobTarget + breathOffset, ks);
}
