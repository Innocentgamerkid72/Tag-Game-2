import * as THREE from "three";

const SKIN  = 0xffb890;
const PANTS = 0x334477;
const SHOES = 0x221100;

export interface HumanoidParts {
  group:       THREE.Group;
  shirtMeshes: THREE.Mesh[];
}

export function buildHumanoid(shirtColor: number): HumanoidParts {
  const group = new THREE.Group();
  const shirtMeshes: THREE.Mesh[] = [];

  function mk(geo: THREE.BufferGeometry, color: number, shirt = false): THREE.Mesh {
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    m.castShadow = true;
    group.add(m);
    if (shirt) shirtMeshes.push(m);
    return m;
  }

  const B = (w: number, h: number, d: number, c: number, shirt = false) =>
    mk(new THREE.BoxGeometry(w, h, d), c, shirt);
  const S = (r: number, c: number) =>
    mk(new THREE.SphereGeometry(r, 8, 6), c);
  const C = (r: number, h: number, c: number) =>
    mk(new THREE.CylinderGeometry(r, r, h, 8), c);

  // Head
  const head = S(0.185, SKIN);
  head.position.set(0, 1.62, 0);

  // Eyes (face toward -Z so they align with yaw=0 "forward")
  const eL = S(0.032, 0x111122);
  eL.position.set(-0.075, 1.645, -0.175);
  const eR = S(0.032, 0x111122);
  eR.position.set( 0.075, 1.645, -0.175);

  // Neck
  const neck = C(0.065, 0.10, SKIN);
  neck.position.set(0, 1.455, 0);

  // Torso
  const torso = B(0.46, 0.52, 0.25, shirtColor, true);
  torso.position.set(0, 1.14, 0);

  // Waist
  const waist = B(0.42, 0.16, 0.23, PANTS);
  waist.position.set(0, 0.82, 0);

  // Upper arms (shirt-colored)
  const laU = B(0.14, 0.30, 0.15, shirtColor, true);
  laU.position.set(-0.30, 1.04, 0);
  const raU = B(0.14, 0.30, 0.15, shirtColor, true);
  raU.position.set( 0.30, 1.04, 0);

  // Forearms + hands (skin)
  const laD = B(0.12, 0.28, 0.13, SKIN);
  laD.position.set(-0.30, 0.73, 0);
  const raD = B(0.12, 0.28, 0.13, SKIN);
  raD.position.set( 0.30, 0.73, 0);

  // Upper legs
  const llU = B(0.165, 0.35, 0.165, PANTS);
  llU.position.set(-0.12, 0.555, 0);
  const rlU = B(0.165, 0.35, 0.165, PANTS);
  rlU.position.set( 0.12, 0.555, 0);

  // Lower legs
  const llD = B(0.145, 0.31, 0.145, PANTS);
  llD.position.set(-0.12, 0.19, 0);
  const rlD = B(0.145, 0.31, 0.145, PANTS);
  rlD.position.set( 0.12, 0.19, 0);

  // Shoes
  const shL = B(0.175, 0.07, 0.26, SHOES);
  shL.position.set(-0.12, 0.035, 0.05);
  const shR = B(0.175, 0.07, 0.26, SHOES);
  shR.position.set( 0.12, 0.035, 0.05);

  // suppress unused-variable warnings
  void [head, eL, eR, neck, waist, laD, raD, llU, rlU, llD, rlD, shL, shR];

  return { group, shirtMeshes };
}

export function setHumanoidShirtColor(parts: HumanoidParts, color: number): void {
  for (const m of parts.shirtMeshes)
    (m.material as THREE.MeshLambertMaterial).color.set(color);
}
