import * as THREE from "three";
import { MapResult, Teleporter } from "../testMap";
import { StunTrap } from "./stunTrap";

const BOUNDARY = 24;

export function buildTempleMap(scene: THREE.Scene): MapResult {
  const colliders: THREE.Box3[] = [];
  const walls:     THREE.Box3[] = [];
  const teleporters: Teleporter[] = [];
  const hazards: { update(dt: number, entities: import("../types").Controllable[]): void }[] = [];

  const _objs: THREE.Object3D[] = [];
  function add<T extends THREE.Object3D>(o: T): T { scene.add(o); _objs.push(o); return o; }

  // ── Atmosphere ───────────────────────────────────────────────────────────────
  scene.fog = new THREE.Fog(0x1a1006, 25, 85);

  const ambient = new THREE.AmbientLight(0xff9944, 0.25);
  add(ambient);

  // Dim directional (moonlight)
  const dir = new THREE.DirectionalLight(0x9988bb, 0.4);
  dir.position.set(10, 20, 10);
  add(dir);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function solidBox(
    x: number, y: number, z: number,
    w: number, h: number, d: number,
    color: number,
    isWall = false,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color }),
    );
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    add(mesh);
    const b3 = new THREE.Box3().setFromObject(mesh);
    if (isWall) walls.push(b3); else colliders.push(b3);
  }

  function addPillar(x: number, z: number, height = 6) {
    const radius = 0.65;
    // Stone drum
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.1, height, 10),
      new THREE.MeshLambertMaterial({ color: 0x7a6a4e }),
    );
    cyl.position.set(x, height / 2, z);
    cyl.castShadow = true;
    add(cyl);
    // Capital (top block)
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 2.5, 0.45, radius * 2.5),
      new THREE.MeshLambertMaterial({ color: 0x8a7a5e }),
    );
    cap.position.set(x, height + 0.22, z);
    add(cap);
    // Wall collision for the pillar shaft
    walls.push(new THREE.Box3(
      new THREE.Vector3(x - radius, 0, z - radius),
      new THREE.Vector3(x + radius, height, z + radius),
    ));
  }

  function addTorch(x: number, y: number, z: number) {
    // Sconce
    const sconce = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.55, 0.18),
      new THREE.MeshLambertMaterial({ color: 0x554422 }),
    );
    sconce.position.set(x, y + 0.28, z);
    add(sconce);
    // Flame sphere
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff6600 }),
    );
    flame.position.set(x, y + 0.7, z);
    add(flame);
    // Point light
    const light = new THREE.PointLight(0xff6600, 1.2, 12);
    light.position.set(x, y + 0.9, z);
    add(light);
  }

  function addTeleporter(
    x: number, y: number, z: number,
    dx: number, dy: number, dz: number,
  ): Teleporter {
    // Stone ring pad
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 0.12, 12),
      new THREE.MeshLambertMaterial({ color: 0x9988aa, emissive: new THREE.Color(0x221133) }),
    );
    pad.position.set(x, y + 0.06, z);
    add(pad);

    // Glowing runes ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.09, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xaa44ff }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, y + 0.13, z);
    add(ring);

    const light = new THREE.PointLight(0xaa44ff, 0.8, 6);
    light.position.set(x, y + 0.8, z);
    add(light);

    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
    );
    sprite.position.set(x, y + 1.8, z);
    sprite.scale.set(1.2, 1.2, 1);
    sprite.visible = false;
    add(sprite);

    const tp: Teleporter = {
      trigger: new THREE.Box3(
        new THREE.Vector3(x - 0.8, y, z - 0.8),
        new THREE.Vector3(x + 0.8, y + 0.6, z + 0.8),
      ),
      destination: new THREE.Vector3(dx, dy, dz),
      cooldown: 0,
      sprite,
      texture,
      canvas,
    };
    teleporters.push(tp);
    return tp;
  }

  // ── Floor ─────────────────────────────────────────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(BOUNDARY * 2, BOUNDARY * 2),
    new THREE.MeshLambertMaterial({ color: 0x4a3e2c }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  add(floor);

  // Stone tile pattern overlay
  const grid = new THREE.GridHelper(BOUNDARY * 2, 24, 0x3a2e1e, 0x3a2e1e);
  grid.position.y = 0.01;
  add(grid);

  // ── Outer temple walls ────────────────────────────────────────────────────────
  const WH = 8;
  const WL = BOUNDARY * 2;
  // North wall with opening in centre
  solidBox(-10, 0, -BOUNDARY, 28, WH, 1.2, 0x5a4e36, true);
  solidBox( 10, 0, -BOUNDARY, 28, WH, 1.2, 0x5a4e36, true); // gap at centre
  // Top of arch over opening
  solidBox(0, 5, -BOUNDARY, 4, WH - 5, 1.2, 0x5a4e36, true);

  solidBox(0, 0,  BOUNDARY, WL, WH, 1.2, 0x5a4e36, true);
  solidBox(-BOUNDARY, 0, 0, 1.2, WH, WL, 0x5a4e36, true);
  solidBox( BOUNDARY, 0, 0, 1.2, WH, WL, 0x5a4e36, true);

  // Inner side corridors (low stone arches)
  for (const sign of [-1, 1]) {
    // Side wall with gap/opening at the centre
    solidBox(sign * 14, 0, -8, 1.2, 4, 8,  0x5a4e36, true);
    solidBox(sign * 14, 0,  8, 1.2, 4, 8,  0x5a4e36, true);
    // Arch lintel
    solidBox(sign * 14, 4, 0, 1.2, 0.6, 6, 0x6a5e46, false);
    // Corridor floor (slight raised stone)
    solidBox(sign * 18, 0, 0, 8, 0.15, 14, 0x5a4a32, false);
  }

  // ── Central altar platform ────────────────────────────────────────────────────
  solidBox(0, 0, 0, 10, 2, 10, 0x6a5a40);   // main raised dais
  // Steps leading up (north / south / east / west)
  for (const [sx, sz, sw, sd] of [
    [ 0, -5.5, 6, 1],
    [ 0,  5.5, 6, 1],
    [-5.5, 0, 1, 6],
    [ 5.5, 0, 1, 6],
  ] as [number, number, number, number][]) {
    solidBox(sx, 0, sz, sw, 1.0, sd, 0x5e5038);
    solidBox(sx, 1, sz, sw * 0.85, 1.0, sd * 0.85, 0x5e5038);
  }
  // Altar centrepiece (decorative stone block + light)
  solidBox(0, 2, 0, 2, 1.4, 2, 0x887a58);
  const altarLight = new THREE.PointLight(0xffaa44, 1.5, 12);
  altarLight.position.set(0, 5, 0);
  add(altarLight);

  // ── Columns / pillars ─────────────────────────────────────────────────────────
  // Four corner groups (each group = 2 pillars side by side)
  for (const [px, pz] of [[-8,-8],[8,-8],[-8,8],[8,8]]) {
    addPillar(px - 0.8, pz, 7);
    addPillar(px + 0.8, pz, 7);
    addTorch(px, 5.5, pz + (pz < 0 ? -1 : 1));
  }

  // Extra pillars along walls
  for (const [px, pz] of [[-18,-8],[-18,8],[18,-8],[18,8]]) {
    addPillar(px, pz, 6);
    addTorch(px, 4.5, pz + (pz < 0 ? 1 : -1));
  }

  // ── Elevated side platforms (for vertical gameplay) ───────────────────────────
  solidBox(-18, 0, -16, 6, 3.5, 5, 0x554838);  // NW nook
  solidBox( 18, 0,  16, 6, 3.5, 5, 0x554838);  // SE nook
  solidBox(-18, 0,  16, 6, 3.0, 5, 0x554838);  // SW nook
  solidBox( 18, 0, -16, 6, 3.0, 5, 0x554838);  // NE nook

  // ── Stun Traps ────────────────────────────────────────────────────────────────
  // Placed in corridors, bottlenecks, and near the altar steps
  const trapPositions: [number, number, number][] = [
    // East corridor
    [ 18, 0,  -4],
    [ 18, 0,   4],
    // West corridor
    [-18, 0,  -4],
    [-18, 0,   4],
    // North approach (flanking the altar steps)
    [ -3, 0, -9],
    [  3, 0, -9],
    // South approach
    [ -3, 0,  9],
    [  3, 0,  9],
  ];
  for (const [tx, ty, tz] of trapPositions) {
    hazards.push(new StunTrap(scene, tx, ty, tz, add));
  }

  // ── Torches around altar ──────────────────────────────────────────────────────
  for (const [fx, fz] of [[-5, 0],[5, 0],[0, -5],[0, 5]]) {
    addTorch(fx, 2.0, fz);
  }

  // ── Teleporters ───────────────────────────────────────────────────────────────
  const tp1 = addTeleporter(-21, 0, -21,  21, 0,  21);
  const tp2 = addTeleporter( 21, 0,  21, -21, 0, -21);
  tp1.link = tp2;
  tp2.link = tp1;

  // ── Dispose ───────────────────────────────────────────────────────────────────
  return {
    colliders,
    walls,
    teleporters,
    hazards,
    boundary: BOUNDARY,
    gravity: -28,
    background: 0x1a1006,
    spawnPos: new THREE.Vector3(0, 3, 0),
    dispose() {
      for (const o of _objs) {
        scene.remove(o);
        if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      }
    },
  };
}
