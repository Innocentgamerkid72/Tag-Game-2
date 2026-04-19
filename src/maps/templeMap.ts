import * as THREE from "three";
import { MapResult, Teleporter } from "../testMap";
import { StunTrap } from "./stunTrap";

const BOUNDARY = 38;

export function buildTempleMap(scene: THREE.Scene): MapResult {
  const colliders: THREE.Box3[] = [];
  const walls:     THREE.Box3[] = [];
  const teleporters: Teleporter[] = [];
  const hazards: { update(dt: number, entities: import("../types").Controllable[]): void }[] = [];

  const _objs: THREE.Object3D[] = [];
  function add<T extends THREE.Object3D>(o: T): T { scene.add(o); _objs.push(o); return o; }

  // ── Atmosphere ───────────────────────────────────────────────────────────────
  scene.fog = new THREE.Fog(0x18100a, 30, 110);
  add(new THREE.AmbientLight(0xff9944, 0.22));

  const dir = new THREE.DirectionalLight(0x9988bb, 0.35);
  dir.position.set(15, 30, 10);
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
    (isWall ? walls : colliders).push(new THREE.Box3().setFromObject(mesh));
  }

  function addPillar(x: number, z: number, height = 7) {
    const r = 0.7;
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r * 1.12, height, 10),
      new THREE.MeshLambertMaterial({ color: 0x7a6a4e }),
    );
    cyl.position.set(x, height / 2, z);
    cyl.castShadow = true;
    add(cyl);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(r * 2.8, 0.5, r * 2.8),
      new THREE.MeshLambertMaterial({ color: 0x8a7a5e }),
    );
    cap.position.set(x, height + 0.25, z);
    add(cap);
    walls.push(new THREE.Box3(
      new THREE.Vector3(x - r, 0, z - r),
      new THREE.Vector3(x + r, height, z + r),
    ));
  }

  function addTorch(x: number, y: number, z: number) {
    const sconce = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.6, 0.2),
      new THREE.MeshLambertMaterial({ color: 0x554422 }),
    );
    sconce.position.set(x, y + 0.3, z);
    add(sconce);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff6600 }),
    );
    flame.position.set(x, y + 0.8, z);
    add(flame);
    const l = new THREE.PointLight(0xff6600, 1.3, 14);
    l.position.set(x, y + 1.0, z);
    add(l);
  }

  function addObelisk(x: number, z: number) {
    solidBox(x, 0, z, 1.0, 6, 1.0, 0x5a4c36, true);   // shaft
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.6, 1.5, 4),
      new THREE.MeshLambertMaterial({ color: 0xd4a840 }),
    );
    tip.position.set(x, 6.75, z);
    tip.rotation.y = Math.PI / 4;
    add(tip);
    add(new THREE.PointLight(0xffcc44, 0.4, 6)).position.set(x, 7, z);
  }

  function addTeleporter(x: number, y: number, z: number, dx: number, dy: number, dz: number): Teleporter {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 0.14, 12),
      new THREE.MeshLambertMaterial({ color: 0x9988aa, emissive: new THREE.Color(0x221133) }),
    );
    pad.position.set(x, y + 0.07, z);
    add(pad);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.1, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xaa44ff }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, y + 0.15, z);
    add(ring);
    const l = new THREE.PointLight(0xaa44ff, 0.9, 7);
    l.position.set(x, y + 0.9, z);
    add(l);
    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
    );
    sprite.position.set(x, y + 2.0, z);
    sprite.scale.set(1.3, 1.3, 1);
    sprite.visible = false;
    add(sprite);
    const tp: Teleporter = {
      trigger: new THREE.Box3(
        new THREE.Vector3(x - 0.85, y, z - 0.85),
        new THREE.Vector3(x + 0.85, y + 0.6, z + 0.85),
      ),
      destination: new THREE.Vector3(dx, dy, dz),
      cooldown: 0, sprite, texture, canvas,
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

  const grid = new THREE.GridHelper(BOUNDARY * 2, 30, 0x3a2e1e, 0x3a2e1e);
  grid.position.y = 0.01;
  add(grid);

  // ── Outer boundary walls ──────────────────────────────────────────────────────
  const WH = 9, WL = BOUNDARY * 2;
  // North wall — two halves with a wide gateway (x: −5 to 5)
  solidBox(-22, 0, -BOUNDARY, 52, WH, 1.3, 0x5a4e36, true);
  solidBox( 22, 0, -BOUNDARY, 52, WH, 1.3, 0x5a4e36, true);
  solidBox(  0, 6, -BOUNDARY,  10, WH - 6, 1.3, 0x5a4e36, true); // lintel over gateway
  // South, East, West (solid)
  solidBox( 0, 0,  BOUNDARY, WL, WH, 1.3, 0x5a4e36, true);
  solidBox(-BOUNDARY, 0, 0, 1.3, WH, WL, 0x5a4e36, true);
  solidBox( BOUNDARY, 0, 0, 1.3, WH, WL, 0x5a4e36, true);

  // ── Outer courtyard pillars & torches ─────────────────────────────────────────
  for (const [px, pz] of [
    [-28, -28], [28, -28], [-28, 28], [28, 28],
    [-28,   0], [28,   0], [0, -28], [0,  28],
  ]) {
    addPillar(px, pz, 8);
    addTorch(px, 6, pz + (pz < 0 ? 1.5 : -1.5));
  }

  // Obelisks at outer-courtyard corners
  addObelisk(-32, -32);
  addObelisk( 32, -32);
  addObelisk(-32,  32);
  addObelisk( 32,  32);

  // ── Inner temple ring walls (create middle corridor) ─────────────────────────
  // Sits at ±18, with a 6-unit wide archway opening on each side
  for (const sign of [-1, 1]) {
    // North/south inner walls
    solidBox( sign * 22, 0, -18, 1.2, 5, 12, 0x5a4e36, true); // N segment
    solidBox( sign * 22, 0,  18, 1.2, 5, 12, 0x5a4e36, true); // S segment
    solidBox( sign * 22, 5, 0, 1.2, 1.0, 8,  0x6a5e46, false); // arch lintel

    // East/west inner walls
    solidBox(-18, 0, sign * 22, 12, 5, 1.2, 0x5a4e36, true);
    solidBox( 18, 0, sign * 22, 12, 5, 1.2, 0x5a4e36, true);
    solidBox(  0, 5, sign * 22, 8, 1.0, 1.2, 0x6a5e46, false);
  }

  // Corridor floor slabs (slightly raised stonework between inner and outer walls)
  for (const [cx, cz, w, d] of [
    // N/S corridors (between inner ring and outer wall in N and S zones)
    [ 0, -28, 26, 14],
    [ 0,  28, 26, 14],
    // E/W corridors
    [-28,  0, 14, 26],
    [ 28,  0, 14, 26],
  ] as [number, number, number, number][]) {
    solidBox(cx, 0, cz, w, 0.18, d, 0x564838);
  }

  // ── Central altar complex ─────────────────────────────────────────────────────
  solidBox(0, 0, 0, 12, 2.2, 12, 0x6a5a40);  // main dais

  // Steps on all 4 sides
  for (const [sx, sz, sw, sd] of [
    [ 0, -6.5, 8, 1.2],
    [ 0,  6.5, 8, 1.2],
    [-6.5, 0, 1.2, 8],
    [ 6.5, 0, 1.2, 8],
  ] as [number, number, number, number][]) {
    solidBox(sx, 0, sz, sw, 1.1, sd, 0x5c5034);
    solidBox(sx, 1.1, sz, sw * 0.82, 1.1, sd * 0.82, 0x5c5034);
  }

  // Altar centrepiece
  solidBox(0, 2.2, 0, 2.4, 1.6, 2.4, 0x887a58);
  add(new THREE.PointLight(0xffaa44, 1.8, 14)).position.set(0, 6, 0);

  // Torches around altar steps
  for (const [fx, fz] of [[-6, 0], [6, 0], [0, -6], [0, 6]]) {
    addTorch(fx, 2.2, fz);
  }

  // ── Inner-ring pillars ────────────────────────────────────────────────────────
  for (const [px, pz] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
    addPillar(px - 0.9, pz, 8);
    addPillar(px + 0.9, pz, 8);
    addTorch(px, 6.5, pz + (pz < 0 ? -1.5 : 1.5));
  }

  // ── Elevated platforms in inner courtyard corners ─────────────────────────────
  solidBox(-20, 0, -20, 7, 4.0, 7, 0x564838); // NW inner platform
  solidBox( 20, 0, -20, 7, 4.0, 7, 0x564838); // NE
  solidBox(-20, 0,  20, 7, 3.5, 7, 0x564838); // SW
  solidBox( 20, 0,  20, 7, 3.5, 7, 0x564838); // SE

  // Pillars on top of platforms
  addPillar(-20, -20, 5);
  addPillar( 20, -20, 5);
  addPillar(-20,  20, 5);
  addPillar( 20,  20, 5);

  // ── Side chamber niches (built into outer wall, NE / SW / NW / SE) ───────────
  // Each is a small recessed room with a teleporter and walls around it
  for (const [cx, cz, wallX, wallZ] of [
    [-32, -10,  1, 0],   // west corridor niche
    [ 32,  10, -1, 0],   // east corridor niche
    [  0, -32,  0, 1],   // north corridor niche
    [  0,  32,  0,-1],   // south corridor niche
  ] as [number, number, number, number][]) {
    solidBox(cx, 0, cz, 6, 4, 6, 0x4e4230, false); // raised floor
    // Back wall
    solidBox(cx + wallX * 3, 0, cz + wallZ * 3, wallX !== 0 ? 0.5 : 7, 4, wallZ !== 0 ? 0.5 : 7, 0x4a4030, true);
  }

  // ── Stun traps (12 total) ─────────────────────────────────────────────────────
  const trapPos: [number, number, number][] = [
    // Inner corridor archways (high traffic)
    [ 22, 0, 0], [-22, 0,  0],
    [ 0, 0, -22], [ 0, 0,  22],
    // Outer courtyard choke points near pillars
    [ 28, 0, -14], [-28, 0,  14],
    [ 14, 0,  28], [-14, 0, -28],
    // Altar approach bottlenecks
    [ -3, 0, -10], [ 3, 0, -10],
    [ -3, 0,  10], [ 3, 0,  10],
  ];
  for (const [tx, ty, tz] of trapPos) {
    hazards.push(new StunTrap(scene, tx, ty, tz, add));
  }

  // ── Teleporters (4) ───────────────────────────────────────────────────────────
  // Outer courtyard: NW ↔ SE
  const tp1 = addTeleporter(-30, 0, -30,  30, 1,  30);
  const tp2 = addTeleporter( 30, 0,  30, -30, 1, -30);
  tp1.link = tp2; tp2.link = tp1;

  // Inner zone: NE elevated platform ↔ SW elevated platform
  const tp3 = addTeleporter( 20, 4, -20, -20, 3.5 + 1, 20);
  const tp4 = addTeleporter(-20, 3.5, 20,  20, 4 + 1, -20);
  tp3.link = tp4; tp4.link = tp3;

  // ── Dispose ───────────────────────────────────────────────────────────────────
  return {
    colliders,
    walls,
    teleporters,
    hazards,
    boundary: BOUNDARY,
    gravity: -28,
    background: 0x18100a,
    spawnPos: new THREE.Vector3(0, 3, 0),
    dispose() {
      for (const o of _objs) {
        scene.remove(o);
        if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      }
    },
  };
}
