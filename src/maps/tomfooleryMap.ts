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
  // Each edge is 26 units wide. Walls cover the outer 8 units on each side,
  // leaving a ~10-unit gap at the center so players can walk to the edge and fall.
  const WALL_COLOR = 0x2e4255;
  // North (z = -13)
  addWallOn(-9,  1, -13, 8, 1.5, 0.4, WALL_COLOR);
  addWallOn( 9,  1, -13, 8, 1.5, 0.4, WALL_COLOR);
  // South (z = +13)
  addWallOn(-9,  1,  13, 8, 1.5, 0.4, WALL_COLOR);
  addWallOn( 9,  1,  13, 8, 1.5, 0.4, WALL_COLOR);
  // West (x = -13)
  addWallOn(-13, 1,  -9, 0.4, 1.5, 8, WALL_COLOR);
  addWallOn(-13, 1,   9, 0.4, 1.5, 8, WALL_COLOR);
  // East (x = +13)
  addWallOn( 13, 1,  -9, 0.4, 1.5, 8, WALL_COLOR);
  addWallOn( 13, 1,   9, 0.4, 1.5, 8, WALL_COLOR);

  // ── Outer floating platforms at cardinal directions (wall-less — dangerous!) ─
  // Gap from main edge (±13) to outer platform near edge (±17.5 ± 2.5 = ±15)
  // = 2 units — jumpable while sprinting.
  addPlatform(-18, 0, 0, 5, 1, 5, 0x14202e); // West
  addPlatform( 18, 0, 0, 5, 1, 5, 0x14202e); // East
  addPlatform(0, 0, -18, 5, 1, 5, 0x14202e); // North
  addPlatform(0, 0,  18, 5, 1, 5, 0x14202e); // South

  // ── Teleporters: West ↔ East, North ↔ South ──────────────────────────────
  const tp1 = addTeleporter(-18, 1, 0,   18, 1.1, 0);
  const tp2 = addTeleporter( 18, 1, 0,  -18, 1.1, 0);
  tp1.link = tp2; tp2.link = tp1;

  const tp3 = addTeleporter(0, 1, -18,  0, 1.1,  18);
  const tp4 = addTeleporter(0, 1,  18,  0, 1.1, -18);
  tp3.link = tp4; tp4.link = tp3;

  // ── Moving platforms ─────────────────────────────────────────────────────
  // A slow sweeper that crosses the arena east-west above the dais
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-10, 7, 0), new THREE.Vector3(10, 7, 0),
    4, 0.4, 4, 0x2255aa, 4, add, colliders,
  ));

  // A fast sweeper crossing north-south at a different height
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(0, 5.5, -10), new THREE.Vector3(0, 5.5, 10),
    3.5, 0.4, 3.5, 0x225533, 6, add, colliders,
  ));

  // A vertical bobber on the east side — bridges the gap to the east outer platform
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(16, 1, 0), new THREE.Vector3(16, 7, 0),
    3, 0.4, 3, 0x553322, 3, add, colliders,
  ));

  // ── Falling platforms ─────────────────────────────────────────────────────
  // In the void gap between the main platform and the outer platforms
  const fpColor = 0x3a2e1e;
  const fpSize  = 2.5;
  const fpH     = 0.4;
  const voidGapY = 1; // flush with main platform top so players can step onto them

  // Cardinal gap platforms
  fallingPlatforms.push(new FallingPlatform( 14.5, voidGapY,    0, fpSize, fpH, fpSize, fpColor, add, colliders));
  fallingPlatforms.push(new FallingPlatform(-14.5, voidGapY,    0, fpSize, fpH, fpSize, fpColor, add, colliders));
  fallingPlatforms.push(new FallingPlatform(   0, voidGapY,  14.5, fpSize, fpH, fpSize, fpColor, add, colliders));
  fallingPlatforms.push(new FallingPlatform(   0, voidGapY, -14.5, fpSize, fpH, fpSize, fpColor, add, colliders));

  // Diagonal gap platforms
  fallingPlatforms.push(new FallingPlatform( 10, voidGapY,  10, fpSize, fpH, fpSize, fpColor, add, colliders));
  fallingPlatforms.push(new FallingPlatform(-10, voidGapY, -10, fpSize, fpH, fpSize, fpColor, add, colliders));
  fallingPlatforms.push(new FallingPlatform( 10, voidGapY, -10, fpSize, fpH, fpSize, fpColor, add, colliders));
  fallingPlatforms.push(new FallingPlatform(-10, voidGapY,  10, fpSize, fpH, fpSize, fpColor, add, colliders));

  // ── Coloured point lights floating above the arena ────────────────────────
  const lightDefs: [number, number, number][] = [
    [-6, -6, 0x4466ff], [6, -6, 0xff4466],
    [-6,  6, 0x44ff88], [6,  6, 0xffaa22],
  ];
  for (const [lx, lz, col] of lightDefs) {
    const light = new THREE.PointLight(col, 1.5, 20);
    light.position.set(lx, 6, lz);
    add(light);
    // Tiny glowing orb so the light source is visible
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), new THREE.MeshBasicMaterial({ color: col }));
    orb.position.set(lx, 6, lz);
    add(orb);
  }

  // ── Star field — small dots scattered in the abyss below ─────────────────
  const starMat = new THREE.MeshBasicMaterial({ color: 0x8899cc });
  for (let i = 0; i < 150; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), starMat);
    const angle  = Math.random() * Math.PI * 2;
    const radius = 18 + Math.random() * 70;
    s.position.set(
      Math.cos(angle) * radius,
      -(2 + Math.random() * 50),  // below the platform
      Math.sin(angle) * radius
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
    botBoundary: 9,     // bots wander within ±7 — safely away from the ±13 platform edge
    spawnPos:    new THREE.Vector3(0, 3.0, 0),
    botSpawnY:   2.5,
    gravity:     -28,
    background:  0x000510,
    groundY:     -200,  // no floor — players fall freely into the void
    fallDeathY:  -10,   // anyone below this is eliminated
    voidBoundary: 22,   // anyone past ±22 XZ is instantly eliminated
    dispose: () => _objs.forEach(o => scene.remove(o)),
  };
}
