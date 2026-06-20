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

export function buildHumanoid(shirtColor: number): HumanoidParts {
  const group = new THREE.Group();
  const shirtMeshes: THREE.Mesh[] = [];

  function mk(
    geo: THREE.BufferGeometry,
    color: number,
    parent: THREE.Object3D,
    shirt = false,
  ): THREE.Mesh {
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    m.castShadow = true;
    parent.add(m);
    if (shirt) shirtMeshes.push(m);
    return m;
  }

  const B = (w: number, h: number, d: number, c: number, p: THREE.Object3D, shirt = false) =>
    mk(new THREE.BoxGeometry(w, h, d), c, p, shirt);
  const S = (r: number, c: number, p: THREE.Object3D) =>
    mk(new THREE.SphereGeometry(r, 8, 6), c, p);
  const C = (r: number, h: number, c: number, p: THREE.Object3D) =>
    mk(new THREE.CylinderGeometry(r, r, h, 8), c, p);

  // ── Head & face ──
  const head = S(0.185, SKIN, group);
  head.position.set(0, 1.62, 0);

  const eL = S(0.032, 0x111122, group);
  eL.position.set(-0.075, 1.645, -0.175);
  const eR = S(0.032, 0x111122, group);
  eR.position.set( 0.075, 1.645, -0.175);

  const neck = C(0.065, 0.10, SKIN, group);
  neck.position.set(0, 1.455, 0);

  // ── Torso / waist ──
  const torso = B(0.46, 0.52, 0.25, shirtColor, group, true);
  torso.position.set(0, 1.14, 0);

  const waist = B(0.42, 0.16, 0.23, PANTS, group);
  waist.position.set(0, 0.82, 0);

  // ── Left arm pivot at shoulder (world y=1.19) ──
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.30, 1.19, 0);
  group.add(leftArm);
  B(0.14, 0.30, 0.15, shirtColor, leftArm, true).position.set(0, -0.15, 0);
  B(0.12, 0.28, 0.13, SKIN,       leftArm      ).position.set(0, -0.46, 0);

  // ── Right arm pivot at shoulder ──
  const rightArm = new THREE.Group();
  rightArm.position.set(0.30, 1.19, 0);
  group.add(rightArm);
  B(0.14, 0.30, 0.15, shirtColor, rightArm, true).position.set(0, -0.15, 0);
  B(0.12, 0.28, 0.13, SKIN,       rightArm      ).position.set(0, -0.46, 0);

  // ── Left leg pivot at hip (world y=0.73) ──
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.12, 0.73, 0);
  group.add(leftLeg);
  B(0.165, 0.35,  0.165, PANTS, leftLeg).position.set(0, -0.175, 0);
  B(0.145, 0.31,  0.145, PANTS, leftLeg).position.set(0, -0.505, 0);
  B(0.175, 0.07,  0.260, SHOES, leftLeg).position.set(0, -0.695, 0.05);

  // ── Right leg pivot at hip ──
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.12, 0.73, 0);
  group.add(rightLeg);
  B(0.165, 0.35,  0.165, PANTS, rightLeg).position.set(0, -0.175, 0);
  B(0.145, 0.31,  0.145, PANTS, rightLeg).position.set(0, -0.505, 0);
  B(0.175, 0.07,  0.260, SHOES, rightLeg).position.set(0, -0.695, 0.05);

  return { group, shirtMeshes, limbs: { leftArm, rightArm, leftLeg, rightLeg } };
}

export function setHumanoidShirtColor(parts: HumanoidParts, color: number): void {
  for (const m of parts.shirtMeshes)
    (m.material as THREE.MeshLambertMaterial).color.set(color);
}

/**
 * Drive limb swings each frame.
 * @param walkCycle  Accumulated phase (caller advances by horizSpeed * dt * 2.5)
 * @param isInAir    True while the entity is off the ground
 * @param isSprinting True when sprinting (wider swing)
 * @param horizSpeed  Current horizontal speed in units/s (scales amplitude to 0 when idle)
 */
export function updateHumanoidAnimation(
  parts:       HumanoidParts,
  walkCycle:   number,
  isInAir:     boolean,
  isSprinting: boolean,
  horizSpeed:  number,
): void {
  const { leftArm, rightArm, leftLeg, rightLeg } = parts.limbs;

  if (isInAir) {
    // Jump pose: arms angle back, legs split
    leftArm.rotation.x  = -0.55;
    rightArm.rotation.x = -0.55;
    leftLeg.rotation.x  =  0.30;
    rightLeg.rotation.x = -0.12;
    parts.group.position.y = 0;
    return;
  }

  // Scale amplitude down smoothly when decelerating to 0
  const speedFactor = Math.min(horizSpeed / 3.0, 1.0);
  const maxAmp      = isSprinting ? 0.78 : 0.55;
  const swing       = Math.sin(walkCycle) * maxAmp * speedFactor;

  leftArm.rotation.x  =  swing;
  rightArm.rotation.x = -swing;
  leftLeg.rotation.x  = -swing;
  rightLeg.rotation.x =  swing;

  // Subtle vertical body-bob (two bobs per stride)
  const bobAmp = (isSprinting ? 0.055 : 0.038) * speedFactor;
  parts.group.position.y = Math.abs(Math.sin(walkCycle * 2)) * bobAmp;
}
