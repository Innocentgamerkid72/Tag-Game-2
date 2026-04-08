import * as THREE from "three";
import { MapResult, Teleporter } from "../testMap";
import { MovingPlatform } from "./movingPlatform";
import { FallingPlatform } from "./fallingPlatform";

export function buildTomfooleryMap(scene: THREE.Scene): MapResult {
  const colliders:        THREE.Box3[] = [];
  const walls:            THREE.Box3[] = [];
  const teleporters:      Teleporter[] = [];
  const movingPlatforms:  MovingPlatform[] = [];
  const fallingPlatforms: FallingPlatform[] = [];

  const BOUNDARY = 80;

  const _objs: THREE.Object3D[] = [];
  function add<T extends THREE.Object3D>(o: T): T { scene.add(o); _objs.push(o); return o; }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function addPlatform(x: number, y: number, z: number, w: number, h: number, d: number, color: number) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color }),
    );
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    add(mesh);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, y,     z - d / 2),
      new THREE.Vector3(x + w / 2, y + h, z + d / 2),
    ));
  }

  function addWall(x: number, y: number, z: number, w: number, h: number, d: number, color: number) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color }),
    );
    mesh.position.set(x, y + h / 2, z);
    add(mesh);
    walls.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, y,     z - d / 2),
      new THREE.Vector3(x + w / 2, y + h, z + d / 2),
    ));
  }

  function addTeleporter(x: number, y: number, z: number, destX: number, destY: number, destZ: number): Teleporter {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16),
      new THREE.MeshLambertMaterial({ color: 0x00eeff, emissive: new THREE.Color(0x006688) }),
    );
    pad.position.set(x, y + 0.08, z);
    add(pad);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x00ffff }),
    );
    ring.position.set(x, y + 0.15, z);
    ring.rotation.x = Math.PI / 2;
    add(ring);
    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
    );
    sprite.position.set(x, y + 1.6, z);
    sprite.scale.set(1.2, 1.2, 1);
    sprite.visible = false;
    add(sprite);
    const tp: Teleporter = {
      trigger: new THREE.Box3(
        new THREE.Vector3(x - 0.7, y, z - 0.7),
        new THREE.Vector3(x + 0.7, y + 0.5, z + 0.7),
      ),
      destination: new THREE.Vector3(destX, destY, destZ),
      cooldown: 0, sprite, texture, canvas,
    };
    teleporters.push(tp);
    return tp;
  }

  // ── Main platform (36×36, top at y=1) ────────────────────────────────────────
  addPlatform(0, 0, 0, 36, 1, 36, 0x1e2d3a);

  // Raised center dais
  addPlatform(0, 1, 0, 10, 0.5, 10, 0x2a3e52);
  for (const [cx, cz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]] as [number,number][]) {
    addPlatform(cx, 1.5, cz, 2, 0.5, 2, 0x364f66);
  }

  // Edge walls on main platform
  const WC = 0x2e4255;
  addWall(-12, 1, -18, 10, 1.5, 0.4, WC); addWall(12, 1, -18, 10, 1.5, 0.4, WC);
  addWall(-12, 1,  18, 10, 1.5, 0.4, WC); addWall(12, 1,  18, 10, 1.5, 0.4, WC);
  addWall(-18, 1, -12, 0.4, 1.5, 10, WC); addWall(-18, 1, 12, 0.4, 1.5, 10, WC);
  addWall( 18, 1, -12, 0.4, 1.5, 10, WC); addWall( 18, 1, 12, 0.4, 1.5, 10, WC);

  // ── Ring 1: cardinal (±24) ────────────────────────────────────────────────────
  for (const [rx, rz] of [[-24,0],[24,0],[0,-24],[0,24]] as [number,number][]) {
    addPlatform(rx, 0, rz, 6, 1, 6, 0x14202e);
  }
  // Ring 1: diagonal (±22, ±22)
  for (const [rx, rz] of [[22,22],[-22,22],[22,-22],[-22,-22]] as [number,number][]) {
    addPlatform(rx, 0, rz, 5, 1, 5, 0x121c28);
  }

  // Teleporters Ring 1 cardinal pairs
  const [tp1, tp2] = [addTeleporter(-24,1,0, 24,1.1,0), addTeleporter(24,1,0, -24,1.1,0)];
  tp1.link = tp2; tp2.link = tp1;
  const [tp3, tp4] = [addTeleporter(0,1,-24, 0,1.1,24), addTeleporter(0,1,24, 0,1.1,-24)];
  tp3.link = tp4; tp4.link = tp3;

  // ── Ring 2: cardinal (±40) ────────────────────────────────────────────────────
  for (const [rx, rz] of [[-40,0],[40,0],[0,-40],[0,40]] as [number,number][]) {
    addPlatform(rx, 0, rz, 6, 1, 6, 0x0e1720);
  }
  // Ring 2: diagonal (±34, ±34)
  for (const [rx, rz] of [[34,34],[-34,34],[34,-34],[-34,-34]] as [number,number][]) {
    addPlatform(rx, 0, rz, 5, 1, 5, 0x10181f);
  }

  // Teleporters Ring 2 cardinal pairs
  const [tp5, tp6] = [addTeleporter(-40,1,0, 40,1.1,0), addTeleporter(40,1,0, -40,1.1,0)];
  tp5.link = tp6; tp6.link = tp5;
  const [tp7, tp8] = [addTeleporter(0,1,-40, 0,1.1,40), addTeleporter(0,1,40, 0,1.1,-40)];
  tp7.link = tp8; tp8.link = tp7;

  // ── Ring 3: cardinal (±58) ────────────────────────────────────────────────────
  for (const [rx, rz] of [[-58,0],[58,0],[0,-58],[0,58]] as [number,number][]) {
    addPlatform(rx, 0, rz, 7, 1, 7, 0x0b1219);
  }
  // Ring 3: diagonal (±48, ±48)
  for (const [rx, rz] of [[48,48],[-48,48],[48,-48],[-48,-48]] as [number,number][]) {
    addPlatform(rx, 0, rz, 5, 1, 5, 0x0d151e);
  }
  // Ring 3: mid-cardinal side pads
  for (const [rx, rz] of [[-58,18],[-58,-18],[58,18],[58,-18],[18,-58],[-18,-58],[18,58],[-18,58]] as [number,number][]) {
    addPlatform(rx, 0, rz, 4, 1, 4, 0x0c1318);
  }

  // Teleporters Ring 3 cardinal pairs
  const [tp9, tp10] = [addTeleporter(-58,1,0, 58,1.1,0), addTeleporter(58,1,0, -58,1.1,0)];
  tp9.link = tp10; tp10.link = tp9;
  const [tp11, tp12] = [addTeleporter(0,1,-58, 0,1.1,58), addTeleporter(0,1,58, 0,1.1,-58)];
  tp11.link = tp12; tp12.link = tp11;

  // ── Sky tier: central pillar + top ───────────────────────────────────────────
  addPlatform(0, 1.5, 0, 2, 10, 2, 0x253848);
  addPlatform(0, 11.5, 0, 10, 0.5, 10, 0x1a3050);

  // Sky tier: mid-ring (y=6)
  for (const [dx, dz] of [[18,0],[-18,0],[0,18],[0,-18]] as [number,number][]) {
    addPlatform(dx, 6, dz, 4, 0.4, 4, 0x2a3555);
  }
  // Sky tier: high diagonals (y=12)
  for (const [dx, dz] of [[14,14],[-14,14],[14,-14],[-14,-14]] as [number,number][]) {
    addPlatform(dx, 12, dz, 4, 0.4, 4, 0x1e2840);
  }
  // Sky tier: outer elevated pads (y=5)
  for (const [dx, dz] of [[28,0],[-28,0],[0,28],[0,-28]] as [number,number][]) {
    addPlatform(dx, 5, dz, 3.5, 0.4, 3.5, 0x1a2a3a);
  }
  // Sky tier: upper outer ring (y=8)
  for (const [dx, dz] of [[20,20],[-20,20],[20,-20],[-20,-20]] as [number,number][]) {
    addPlatform(dx, 8, dz, 3.5, 0.4, 3.5, 0x1c2d40);
  }
  // Sky tier: very high platforms (y=15)
  for (const [dx, dz] of [[8,0],[-8,0],[0,8],[0,-8]] as [number,number][]) {
    addPlatform(dx, 15, dz, 3, 0.4, 3, 0x182538);
  }

  // ── Moving platforms ──────────────────────────────────────────────────────────
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-12, 7, 0), new THREE.Vector3(12, 7, 0),
    5, 0.4, 5, 0x2255aa, 4, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(0, 5.5, -12), new THREE.Vector3(0, 5.5, 12),
    4, 0.4, 4, 0x225533, 6, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(22, 1, 0), new THREE.Vector3(22, 9, 0),
    4, 0.4, 4, 0x553322, 3, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-22, 1, 0), new THREE.Vector3(-22, 9, 0),
    4, 0.4, 4, 0x553322, 3.5, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-14, 11, 10), new THREE.Vector3(14, 11, 10),
    4, 0.4, 4, 0x334466, 5, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(0, 4, -32), new THREE.Vector3(0, 4, 32),
    5, 0.4, 5, 0x1e3344, 9, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-24, 3, -24), new THREE.Vector3(24, 3, 24),
    4, 0.4, 4, 0x223322, 7, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-40, 2, 0), new THREE.Vector3(-24, 2, 0),
    4, 0.4, 4, 0x334422, 5, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(24, 2, 0), new THREE.Vector3(40, 2, 0),
    4, 0.4, 4, 0x334422, 5, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(0, 2, -40), new THREE.Vector3(0, 2, -24),
    4, 0.4, 4, 0x442233, 6, add, colliders,
  ));

  // ── Falling platforms (gap bridges) ──────────────────────────────────────────
  const fpC  = 0x3a2e1e;
  const fpC2 = 0x2a2030;
  const fpC3 = 0x1e1a28;
  const fpS  = 3;
  const fpH  = 0.4;
  const gY   = 1;

  // Main → Ring 1 cardinal
  for (const [fx, fz] of [[19,0],[-19,0],[0,19],[0,-19]] as [number,number][]) {
    fallingPlatforms.push(new FallingPlatform(fx, gY, fz, fpS, fpH, fpS, fpC, add, colliders));
  }
  // Main corners → Ring 1 diagonal
  for (const [fx, fz] of [[13,13],[-13,13],[13,-13],[-13,-13]] as [number,number][]) {
    fallingPlatforms.push(new FallingPlatform(fx, gY, fz, fpS, fpH, fpS, fpC, add, colliders));
  }
  // Ring 1 diagonal stepping stones
  for (const [fx, fz] of [[19,19],[-19,19],[19,-19],[-19,-19]] as [number,number][]) {
    fallingPlatforms.push(new FallingPlatform(fx, gY, fz, fpS, fpH, fpS, fpC, add, colliders));
  }
  // Ring 1 → Ring 2 cardinal
  for (const [fx, fz] of [[31,0],[-31,0],[0,31],[0,-31]] as [number,number][]) {
    fallingPlatforms.push(new FallingPlatform(fx, gY, fz, fpS, fpH, fpS, fpC2, add, colliders));
  }
  // Ring 1 → Ring 2 diagonal
  for (const [fx, fz] of [[28,28],[-28,28],[28,-28],[-28,-28]] as [number,number][]) {
    fallingPlatforms.push(new FallingPlatform(fx, gY, fz, fpS, fpH, fpS, fpC2, add, colliders));
  }
  // Ring 2 → Ring 3 cardinal
  for (const [fx, fz] of [[48,0],[-48,0],[0,48],[0,-48]] as [number,number][]) {
    fallingPlatforms.push(new FallingPlatform(fx, gY, fz, fpS, fpH, fpS, fpC3, add, colliders));
  }
  // Ring 2 → Ring 3 diagonal
  for (const [fx, fz] of [[41,41],[-41,41],[41,-41],[-41,-41]] as [number,number][]) {
    fallingPlatforms.push(new FallingPlatform(fx, gY, fz, fpS, fpH, fpS, fpC3, add, colliders));
  }

  // ── Coloured point lights ─────────────────────────────────────────────────────
  const lightDefs: [number, number, number, number][] = [
    [-8, 6, 8, 0x4466ff], [8, 6, 8, 0xff4466],
    [-8, 6, -8, 0x44ff88], [8, 6, -8, 0xffaa22],
    [0, 14, 0, 0x88aaff],
    [26, 5, 0, 0xff6633], [-26, 5, 0, 0x33aaff],
    [0, 5, 26, 0x44ff88], [0, 5, -26, 0xff44aa],
    [42, 3, 0, 0xffcc00], [-42, 3, 0, 0x00ccff],
    [0, 3, 42, 0xcc44ff], [0, 3, -42, 0x44ffcc],
  ];
  for (const [lx, lz, ly, col] of lightDefs) {
    const light = new THREE.PointLight(col, 1.5, 28);
    light.position.set(lx, ly, lz);
    add(light);
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 6, 6),
      new THREE.MeshBasicMaterial({ color: col }),
    );
    orb.position.set(lx, ly, lz);
    add(orb);
  }

  // ── Star field ────────────────────────────────────────────────────────────────
  const starMat = new THREE.MeshBasicMaterial({ color: 0x8899cc });
  for (let i = 0; i < 350; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), starMat);
    const angle  = Math.random() * Math.PI * 2;
    const radius = 35 + Math.random() * 140;
    s.position.set(
      Math.cos(angle) * radius,
      -(2 + Math.random() * 80),
      Math.sin(angle) * radius,
    );
    add(s);
  }

  return {
    colliders, walls, teleporters, movingPlatforms, fallingPlatforms,
    boundary:    BOUNDARY,
    botBoundary: 16,
    spawnPos:    new THREE.Vector3(0, 3.0, 0),
    botSpawnY:   2.5,
    gravity:     -28,
    background:  0x000510,
    groundY:     -200,
    fallDeathY:  -10,
    voidBoundary: 68,
    dispose: () => _objs.forEach(o => scene.remove(o)),
  };
}
