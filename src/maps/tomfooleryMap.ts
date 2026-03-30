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

  // Wide boundary so players can walk to platform edge and fall;
  // bots use botBoundary (12) to stay near the main platform.
  const BOUNDARY = 50;

  const _objs: THREE.Object3D[] = [];
  function add<T extends THREE.Object3D>(o: T): T { scene.add(o); _objs.push(o); return o; }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function addPlatform(x: number, y: number, z: number, w: number, h: number, d: number, color: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color })
    );
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    add(mesh);
    // Manually compute bounds to avoid setFromObject world-matrix timing issues
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, y,     z - d / 2),
      new THREE.Vector3(x + w / 2, y + h, z + d / 2)
    ));
    return mesh;
  }

  function addWallOn(x: number, y: number, z: number, w: number, h: number, d: number, color: number) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color })
    );
    mesh.position.set(x, y + h / 2, z);
    add(mesh);
    walls.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, y,     z - d / 2),
      new THREE.Vector3(x + w / 2, y + h, z + d / 2)
    ));
  }

  function addTeleporter(x: number, y: number, z: number, destX: number, destY: number, destZ: number): Teleporter {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16),
      new THREE.MeshLambertMaterial({ color: 0x00eeff, emissive: new THREE.Color(0x006688) })
    );
    pad.position.set(x, y + 0.08, z);
    add(pad);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x00ffff })
    );
    ring.position.set(x, y + 0.15, z);
    ring.rotation.x = Math.PI / 2;
    add(ring);

    const triggerBox = new THREE.Box3(
      new THREE.Vector3(x - 0.7, y, z - 0.7),
      new THREE.Vector3(x + 0.7, y + 0.5, z + 0.7)
    );

    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
    );
    sprite.position.set(x, y + 1.6, z);
    sprite.scale.set(1.2, 1.2, 1);
    sprite.visible = false;
    add(sprite);

    const tp: Teleporter = {
      trigger: triggerBox,
      destination: new THREE.Vector3(destX, destY, destZ),
      cooldown: 0,
      sprite, texture, canvas,
    };
    teleporters.push(tp);
    return tp;
  }

  // ── Main platform (26×26, top at y=1) ─────────────────────────────────────
  addPlatform(0, 0, 0, 26, 1, 26, 0x1e2d3a);

  // Raised center dais — cover and visual focal point
  addPlatform(0, 1, 0, 8, 0.5, 8, 0x2a3e52);

  // Four low raised blocks on dais corners (extra cover)
  for (const [cx, cz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) {
    addPlatform(cx, 1.5, cz, 1.5, 0.5, 1.5, 0x364f66);
  }

  // ── Guard walls around main platform edge (gaps at each cardinal center) ───
  const WALL_COLOR = 0x2e4255;
  addWallOn(-9,  1, -13, 8, 1.5, 0.4, WALL_COLOR);
  addWallOn( 9,  1, -13, 8, 1.5, 0.4, WALL_COLOR);
  addWallOn(-9,  1,  13, 8, 1.5, 0.4, WALL_COLOR);
  addWallOn( 9,  1,  13, 8, 1.5, 0.4, WALL_COLOR);
  addWallOn(-13, 1,  -9, 0.4, 1.5, 8, WALL_COLOR);
  addWallOn(-13, 1,   9, 0.4, 1.5, 8, WALL_COLOR);
  addWallOn( 13, 1,  -9, 0.4, 1.5, 8, WALL_COLOR);
  addWallOn( 13, 1,   9, 0.4, 1.5, 8, WALL_COLOR);

  // ── Ring 1: cardinal outer platforms (original) ────────────────────────────
  addPlatform(-18, 0, 0, 5, 1, 5, 0x14202e); // West
  addPlatform( 18, 0, 0, 5, 1, 5, 0x14202e); // East
  addPlatform(0, 0, -18, 5, 1, 5, 0x14202e); // North
  addPlatform(0, 0,  18, 5, 1, 5, 0x14202e); // South

  // ── Ring 1: diagonal outer platforms (new) ────────────────────────────────
  for (const [dx, dz] of [[19, 19], [-19, 19], [19, -19], [-19, -19]]) {
    addPlatform(dx, 0, dz, 4, 1, 4, 0x121c28);
  }

  // ── Teleporters: Ring 1 cardinal pairs ────────────────────────────────────
  const tp1 = addTeleporter(-18, 1, 0,   18, 1.1, 0);
  const tp2 = addTeleporter( 18, 1, 0,  -18, 1.1, 0);
  tp1.link = tp2; tp2.link = tp1;

  const tp3 = addTeleporter(0, 1, -18,  0, 1.1,  18);
  const tp4 = addTeleporter(0, 1,  18,  0, 1.1, -18);
  tp3.link = tp4; tp4.link = tp3;

  // ── Ring 2: far cardinal platforms ────────────────────────────────────────
  addPlatform(-30, 0,   0, 5, 1, 5, 0x0e1720);
  addPlatform( 30, 0,   0, 5, 1, 5, 0x0e1720);
  addPlatform(  0, 0, -30, 5, 1, 5, 0x0e1720);
  addPlatform(  0, 0,  30, 5, 1, 5, 0x0e1720);

  // ── Ring 2: far diagonal platforms ────────────────────────────────────────
  for (const [dx, dz] of [[26, 26], [-26, 26], [26, -26], [-26, -26]]) {
    addPlatform(dx, 0, dz, 4, 1, 4, 0x10181f);
  }

  // ── Teleporters: Ring 2 cardinal pairs ────────────────────────────────────
  const tp5 = addTeleporter(-30, 1,   0,  30, 1.1,   0);
  const tp6 = addTeleporter( 30, 1,   0, -30, 1.1,   0);
  tp5.link = tp6; tp6.link = tp5;

  const tp7 = addTeleporter(  0, 1, -30,   0, 1.1,  30);
  const tp8 = addTeleporter(  0, 1,  30,   0, 1.1, -30);
  tp7.link = tp8; tp8.link = tp7;

  // ── Sky tier: central tower cap ───────────────────────────────────────────
  // Pillar rising from center dais
  addPlatform(0, 1.5, 0, 2, 8, 2, 0x253848);       // thin pillar
  addPlatform(0, 9.5, 0, 8, 0.5, 8, 0x1a3050);     // sky platform at top

  // ── Sky tier: mid-sky ring (y=6) ─────────────────────────────────────────
  for (const [dx, dz] of [[14, 0], [-14, 0], [0, 14], [0, -14]]) {
    addPlatform(dx, 6, dz, 3.5, 0.4, 3.5, 0x2a3555);
  }

  // ── Sky tier: high diagonal platforms (y=10) ─────────────────────────────
  for (const [dx, dz] of [[11, 11], [-11, 11], [11, -11], [-11, -11]]) {
    addPlatform(dx, 10, dz, 3.5, 0.4, 3.5, 0x1e2840);
  }

  // ── Sky tier: elevated outer pads on ring 1 diagonals (y=4) ─────────────
  for (const [dx, dz] of [[22, 0], [-22, 0], [0, 22], [0, -22]]) {
    addPlatform(dx, 4, dz, 3, 0.4, 3, 0x1a2a3a);
  }

  // ── Moving platforms ─────────────────────────────────────────────────────
  // Original E-W sweeper above dais
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-10, 7, 0), new THREE.Vector3(10, 7, 0),
    4, 0.4, 4, 0x2255aa, 4, add, colliders,
  ));
  // Original N-S sweeper at y=5.5
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(0, 5.5, -10), new THREE.Vector3(0, 5.5, 10),
    3.5, 0.4, 3.5, 0x225533, 6, add, colliders,
  ));
  // Original east vertical bobber
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(16, 1, 0), new THREE.Vector3(16, 7, 0),
    3, 0.4, 3, 0x553322, 3, add, colliders,
  ));
  // West vertical bobber (mirrors east)
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-16, 1, 0), new THREE.Vector3(-16, 7, 0),
    3, 0.4, 3, 0x553322, 3.5, add, colliders,
  ));
  // High E-W sweeper connecting sky diagonals
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-12, 9, 9), new THREE.Vector3(12, 9, 9),
    3.5, 0.4, 3.5, 0x334466, 5, add, colliders,
  ));
  // Slow wide N-S sweeper at mid height bridging the outer rings
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(0, 4, -24), new THREE.Vector3(0, 4, 24),
    4, 0.4, 4, 0x1e3344, 9, add, colliders,
  ));
  // Diagonal sweeper: NE ↔ SW at y=3 — links ring 1 diagonals
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-18, 3, -18), new THREE.Vector3(18, 3, 18),
    3.5, 0.4, 3.5, 0x223322, 7, add, colliders,
  ));

  // ── Falling platforms ─────────────────────────────────────────────────────
  const fpColor  = 0x3a2e1e;
  const fpColor2 = 0x2a2030;  // second-ring gaps — darker purple-grey
  const fpSize   = 2.5;
  const fpH      = 0.4;
  const gapY     = 1;

  // Cardinal gap: main → ring 1 cardinal
  fallingPlatforms.push(new FallingPlatform( 14.5, gapY,    0, fpSize, fpH, fpSize, fpColor, add, colliders));
  fallingPlatforms.push(new FallingPlatform(-14.5, gapY,    0, fpSize, fpH, fpSize, fpColor, add, colliders));
  fallingPlatforms.push(new FallingPlatform(    0, gapY,  14.5, fpSize, fpH, fpSize, fpColor, add, colliders));
  fallingPlatforms.push(new FallingPlatform(    0, gapY, -14.5, fpSize, fpH, fpSize, fpColor, add, colliders));

  // Diagonal gap: main corners → ring 1 diagonal
  fallingPlatforms.push(new FallingPlatform( 10, gapY,  10, fpSize, fpH, fpSize, fpColor, add, colliders));
  fallingPlatforms.push(new FallingPlatform(-10, gapY, -10, fpSize, fpH, fpSize, fpColor, add, colliders));
  fallingPlatforms.push(new FallingPlatform( 10, gapY, -10, fpSize, fpH, fpSize, fpColor, add, colliders));
  fallingPlatforms.push(new FallingPlatform(-10, gapY,  10, fpSize, fpH, fpSize, fpColor, add, colliders));

  // Mid-stepping: ring 1 diagonal → ring 1 diagonal (tighter bridge stones)
  fallingPlatforms.push(new FallingPlatform( 16, gapY,  16, fpSize, fpH, fpSize, fpColor, add, colliders));
  fallingPlatforms.push(new FallingPlatform(-16, gapY,  16, fpSize, fpH, fpSize, fpColor, add, colliders));
  fallingPlatforms.push(new FallingPlatform( 16, gapY, -16, fpSize, fpH, fpSize, fpColor, add, colliders));
  fallingPlatforms.push(new FallingPlatform(-16, gapY, -16, fpSize, fpH, fpSize, fpColor, add, colliders));

  // Ring 1 cardinal → Ring 2 cardinal
  fallingPlatforms.push(new FallingPlatform( 23, gapY,   0, fpSize, fpH, fpSize, fpColor2, add, colliders));
  fallingPlatforms.push(new FallingPlatform(-23, gapY,   0, fpSize, fpH, fpSize, fpColor2, add, colliders));
  fallingPlatforms.push(new FallingPlatform(  0, gapY,  23, fpSize, fpH, fpSize, fpColor2, add, colliders));
  fallingPlatforms.push(new FallingPlatform(  0, gapY, -23, fpSize, fpH, fpSize, fpColor2, add, colliders));

  // Ring 1 diagonal → Ring 2 diagonal
  fallingPlatforms.push(new FallingPlatform( 23, gapY,  23, fpSize, fpH, fpSize, fpColor2, add, colliders));
  fallingPlatforms.push(new FallingPlatform(-23, gapY,  23, fpSize, fpH, fpSize, fpColor2, add, colliders));
  fallingPlatforms.push(new FallingPlatform( 23, gapY, -23, fpSize, fpH, fpSize, fpColor2, add, colliders));
  fallingPlatforms.push(new FallingPlatform(-23, gapY, -23, fpSize, fpH, fpSize, fpColor2, add, colliders));

  // ── Coloured point lights ─────────────────────────────────────────────────
  const lightDefs: [number, number, number, number][] = [
    [-6, -6, 6,  0x4466ff], [ 6, -6, 6,  0xff4466],
    [-6,  6, 6,  0x44ff88], [ 6,  6, 6,  0xffaa22],
    [  0, 12, 0, 0x88aaff], // sky platform light
    [ 20,  5, 0, 0xff6633], [-20, 5, 0, 0x33aaff],
    [  0,  5,20, 0x44ff88], [  0, 5,-20, 0xff44aa],
  ];
  for (const [lx, lz, ly, col] of lightDefs) {
    const light = new THREE.PointLight(col, 1.5, 22);
    light.position.set(lx, ly, lz);
    add(light);
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 6),
      new THREE.MeshBasicMaterial({ color: col }),
    );
    orb.position.set(lx, ly, lz);
    add(orb);
  }

  // ── Star field — scattered in the abyss below and around ─────────────────
  const starMat = new THREE.MeshBasicMaterial({ color: 0x8899cc });
  for (let i = 0; i < 220; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), starMat);
    const angle  = Math.random() * Math.PI * 2;
    const radius = 22 + Math.random() * 100;
    s.position.set(
      Math.cos(angle) * radius,
      -(2 + Math.random() * 60),
      Math.sin(angle) * radius,
    );
    add(s);
  }

  return {
    colliders,
    walls,
    teleporters,
    movingPlatforms,
    fallingPlatforms,
    boundary:    BOUNDARY,
    botBoundary: 12,    // bots roam a bit more of the main platform
    spawnPos:    new THREE.Vector3(0, 3.0, 0),
    botSpawnY:   2.5,
    gravity:     -28,
    background:  0x000510,
    groundY:     -200,
    fallDeathY:  -10,
    voidBoundary: 44,   // expanded to match new far platforms at ±30
    dispose: () => _objs.forEach(o => scene.remove(o)),
  };
}
