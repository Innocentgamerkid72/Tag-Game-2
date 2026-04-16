import * as THREE from "three";
import { Controllable } from "./types";
import { MovingPlatform } from "./maps/movingPlatform";
import { FallingPlatform } from "./maps/fallingPlatform";

export interface Teleporter {
  trigger: THREE.Box3;
  destination: THREE.Vector3;
  cooldown: number;          // seconds remaining (shared — global for all players)
  link?: Teleporter;         // paired return teleporter
  sprite: THREE.Sprite;      // floating timer label
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  sabotaged?: boolean;       // Hunter mode: next non-hunter user teleports to hunter
  sabotageProgress?: number; // 0–5 seconds of hunter standing nearby
}

export interface MapResult {
  colliders: THREE.Box3[];
  walls: THREE.Box3[];
  teleporters: Teleporter[];
  boundary: number;
  botBoundary?: number;  // waypoint clamp for bots (defaults to boundary)
  gravity: number;
  background: number;
  groundY?: number;      // y-level of the solid floor (default 0); set low to disable
  fallDeathY?: number;   // entities below this y are eliminated (void maps)
  voidBoundary?: number; // entities beyond ±this XZ distance are instantly eliminated
  hazards?: Array<{ update(dt: number, entities: Controllable[]): void }>;
  movingPlatforms?: MovingPlatform[];
  fallingPlatforms?: FallingPlatform[];
  spawnPos?: THREE.Vector3; // player spawn position override
  botSpawnY?: number;       // bot spawn height override (defaults to spawnPos.y)
  dispose(): void;
}

export function buildTestMap(scene: THREE.Scene): MapResult {
  const colliders: THREE.Box3[] = [];
  const walls: THREE.Box3[] = [];
  const teleporters: Teleporter[] = [];
  const BOUNDARY = 30;

  const _objs: THREE.Object3D[] = [];
  function add<T extends THREE.Object3D>(o: T): T { scene.add(o); _objs.push(o); return o; }

  // ── Ground ──────────────────────────────────────────────────────────────────
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(BOUNDARY * 2, BOUNDARY * 2),
    new THREE.MeshLambertMaterial({ color: 0x558833 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  add(ground);
  add(new THREE.GridHelper(BOUNDARY * 2, 22, 0x336622, 0x336622));

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function addPlatform(
    x: number, y: number, z: number,
    w: number, h: number, d: number,
    color = 0x886644
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color })
    );
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    return mesh;
  }

  // Visible wall with collision
  function addWallOn(
    x: number, y: number, z: number,
    w: number, h: number, d: number,
    color = 0x775544
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color })
    );
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    add(mesh);
    walls.push(new THREE.Box3().setFromObject(mesh));
  }

  // Glowing portal pad + register as a teleporter
  function addTeleporter(
    x: number, y: number, z: number,
    destX: number, destY: number, destZ: number
  ) {
    // Pad
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16),
      new THREE.MeshLambertMaterial({ color: 0x00eeff, emissive: new THREE.Color(0x006688) })
    );
    pad.position.set(x, y + 0.08, z);
    add(pad);

    // Ring glow
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x00ffff })
    );
    ring.position.set(x, y + 0.15, z);
    ring.rotation.x = Math.PI / 2;
    add(ring);

    // Trigger volume (slightly above pad surface)
    const triggerBox = new THREE.Box3(
      new THREE.Vector3(x - 0.7, y, z - 0.7),
      new THREE.Vector3(x + 0.7, y + 0.5, z + 0.7)
    );

    // Canvas timer sprite (floats above the pad)
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
    );
    sprite.position.set(x, y + 1.6, z);
    sprite.scale.set(1.2, 1.2, 1);
    sprite.visible = false;
    add(sprite);

    teleporters.push({
      trigger: triggerBox,
      destination: new THREE.Vector3(destX, destY, destZ),
      cooldown: 0,
      sprite,
      texture,
      canvas,
    });
  }

  function addTree(x: number, z: number, scale = 1) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2 * scale, 0.3 * scale, 2 * scale, 6),
      new THREE.MeshLambertMaterial({ color: 0x8b5e3c })
    );
    trunk.position.set(x, scale, z);
    trunk.castShadow = true;
    add(trunk);

    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(1.4 * scale, 7, 7),
      new THREE.MeshLambertMaterial({ color: 0x2d8a2d })
    );
    leaves.position.set(x, scale * 3.2, z);
    leaves.castShadow = true;
    add(leaves);
  }

  // ── Invisible boundary walls ─────────────────────────────────────────────────
  const invisible = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
  for (const [x, z, w, d] of [
    [0, BOUNDARY, BOUNDARY * 2, 0.5],
    [0, -BOUNDARY, BOUNDARY * 2, 0.5],
    [BOUNDARY, 0, 0.5, BOUNDARY * 2],
    [-BOUNDARY, 0, 0.5, BOUNDARY * 2],
  ] as [number, number, number, number][]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 20, d), invisible);
    wall.position.set(x, 10, z);
    add(wall);
  }

  // ── Platforms ────────────────────────────────────────────────────────────────

  // Ring 1 — low (y=2)
  addPlatform(-8,  2,   0,  4, 0.4, 4);
  addPlatform( 8,  2,   0,  4, 0.4, 4);
  addPlatform( 0,  2,  10,  4, 0.4, 4);
  addPlatform( 0,  2, -10,  4, 0.4, 4);

  // Ring 2 — diagonal mid (y=4)
  addPlatform(-11,  4, -11,  4, 0.4, 4, 0x6699aa);
  addPlatform( 11,  4, -11,  4, 0.4, 4, 0x6699aa);
  addPlatform(-11,  4,  11,  4, 0.4, 4, 0x6699aa);
  addPlatform( 11,  4,  11,  4, 0.4, 4, 0x6699aa);

  // Ring 2 — cardinal bridges
  addPlatform(-17, 3,   0,  4, 0.4, 3, 0x886644);
  addPlatform( 17, 3,   0,  4, 0.4, 3, 0x886644);
  addPlatform(  0, 3,  17,  3, 0.4, 4, 0x886644);
  addPlatform(  0, 3, -17,  3, 0.4, 4, 0x886644);

  // Ring 3 — elevated (y=6)
  addPlatform(-7,  6,  -5,  3, 0.4, 3, 0x8866aa);
  addPlatform( 7,  6,  -5,  3, 0.4, 3, 0x8866aa);
  addPlatform(-7,  6,   5,  3, 0.4, 3, 0x8866aa);
  addPlatform( 7,  6,   5,  3, 0.4, 3, 0x8866aa);

  // Outer ledges
  addPlatform(-23, 5,   0,  4, 0.4, 6, 0xaa7733);
  addPlatform( 23, 5,   0,  4, 0.4, 6, 0xaa7733);
  addPlatform(  0, 5,  23,  6, 0.4, 4, 0xaa7733);
  addPlatform(  0, 5, -23,  6, 0.4, 4, 0xaa7733);

  // Center tower
  addPlatform( 0,  9,   0,  4,   0.4, 4,   0xcc9944);
  addPlatform( 0, 12,   0,  2.5, 0.4, 2.5, 0xffbb55);

  // Gap-fill: between Ring 1 cardinal and Ring 2 diagonal (y=3)
  addPlatform(-10,  3,  -5,  3, 0.4, 3, 0x779944);
  addPlatform( 10,  3,  -5,  3, 0.4, 3, 0x779944);
  addPlatform(-10,  3,   5,  3, 0.4, 3, 0x779944);
  addPlatform( 10,  3,   5,  3, 0.4, 3, 0x779944);
  addPlatform( -5,  3, -10,  3, 0.4, 3, 0x779944);
  addPlatform(  5,  3, -10,  3, 0.4, 3, 0x779944);
  addPlatform( -5,  3,  10,  3, 0.4, 3, 0x779944);
  addPlatform(  5,  3,  10,  3, 0.4, 3, 0x779944);

  // Mid fill: between Ring 2 diagonal and outer ledges (y=5)
  addPlatform(-14,  5,  -9,  3, 0.4, 3, 0x6677aa);
  addPlatform( 14,  5,  -9,  3, 0.4, 3, 0x6677aa);
  addPlatform(-14,  5,   9,  3, 0.4, 3, 0x6677aa);
  addPlatform( 14,  5,   9,  3, 0.4, 3, 0x6677aa);
  addPlatform( -9,  5, -14,  3, 0.4, 3, 0x6677aa);
  addPlatform(  9,  5, -14,  3, 0.4, 3, 0x6677aa);
  addPlatform( -9,  5,  14,  3, 0.4, 3, 0x6677aa);
  addPlatform(  9,  5,  14,  3, 0.4, 3, 0x6677aa);

  // Upper ring between Ring 3 (y=6) and tower (y=9)
  addPlatform(-10,  7,   0,  3, 0.4, 3, 0x9966cc);
  addPlatform( 10,  7,   0,  3, 0.4, 3, 0x9966cc);
  addPlatform(  0,  7, -10,  3, 0.4, 3, 0x9966cc);
  addPlatform(  0,  7,  10,  3, 0.4, 3, 0x9966cc);

  // ── Ground-level walls (cover obstacles) ─────────────────────────────────────

  // Center cluster — creates a small maze near the ground teleporter
  addWallOn(  4,  0,   4,   0.3, 1.8, 4);
  addWallOn( -4,  0,  -4,   4,   1.8, 0.3);
  addWallOn(  7,  0,  -5,   0.3, 1.8, 4);
  addWallOn( -7,  0,   5,   4,   1.8, 0.3);

  // Left side cover
  addWallOn(-14,  0,   7,   0.3, 2, 5);
  addWallOn(-14,  0,  -7,   5,   2, 0.3);

  // Right side cover
  addWallOn( 14,  0,  -7,   0.3, 2, 5);
  addWallOn( 14,  0,   7,   5,   2, 0.3);

  // Near-spawn wall (behind player start at z=8)
  addWallOn( -5,  0,  16,   0.3, 2, 5);
  addWallOn(  5,  0,  16,   0.3, 2, 5);

  // ── Walls on elevated platforms ───────────────────────────────────────────────

  // Back wall on the -Z bridge
  addWallOn(  0,  3.4, -19.5,  3, 2, 0.3);

  // Side walls on the +Z outer ledge
  addWallOn(-3, 5.4,  23,  0.3, 2, 4);
  addWallOn( 3, 5.4,  23,  0.3, 2, 4);

  // Tower top parapet
  addWallOn( 1.1,  9.4,  0,   0.3, 1, 4,  0xddaa55);
  addWallOn(-1.1,  9.4,  0,   0.3, 1, 4,  0xddaa55);
  addWallOn( 0,    9.4,  1.1, 4,   1, 0.3, 0xddaa55);
  addWallOn( 0,    9.4, -1.1, 4,   1, 0.3, 0xddaa55);

  // ── Teleporters ───────────────────────────────────────────────────────────────

  // Ground center ↔ Tower top
  addTeleporter( 0,  0,    0,   0, 13,   0);
  addTeleporter( 0, 12.4,  0,   0,  1.5, 0);
  teleporters[teleporters.length - 2].link = teleporters[teleporters.length - 1];
  teleporters[teleporters.length - 1].link = teleporters[teleporters.length - 2];

  // Left Ring-1 platform ↔ Right outer ledge
  addTeleporter(-8,  2.4,  0,   23,  6.5,  0);
  addTeleporter(23,  5.4,  0,  -8,   3.5,  0);
  teleporters[teleporters.length - 2].link = teleporters[teleporters.length - 1];
  teleporters[teleporters.length - 1].link = teleporters[teleporters.length - 2];

  // +Z outer ledge ↔ -Z outer ledge
  addTeleporter( 0,  5.4,  23,   0,  6.5, -23);
  addTeleporter( 0,  5.4, -23,   0,  6.5,  23);
  teleporters[teleporters.length - 2].link = teleporters[teleporters.length - 1];
  teleporters[teleporters.length - 1].link = teleporters[teleporters.length - 2];

  // NW diagonal platform ↔ SE diagonal platform
  addTeleporter(-11,  4.4, -11,   11,  5.5,  11);
  addTeleporter( 11,  4.4,  11,  -11,  5.5, -11);
  teleporters[teleporters.length - 2].link = teleporters[teleporters.length - 1];
  teleporters[teleporters.length - 1].link = teleporters[teleporters.length - 2];

  // ── Cloud platforms (moving) ─────────────────────────────────────────────────
  const movingPlatforms: MovingPlatform[] = [];

  // Cloud 1: sweeps east–west at mid height, above the ring-3 platforms
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-16, 8.5, -5),
    new THREE.Vector3( 16, 8.5, -5),
    4.5, 0.4, 3, 0xd8ecf8, 2.5, add, colliders
  ));

  // Cloud 2: sweeps north–south, slightly higher
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(5, 10, -16),
    new THREE.Vector3(5, 10,  16),
    3.5, 0.4, 4, 0xe0f0ff, 2.0, add, colliders
  ));

  // Cloud 3: small fast one near the top of the center tower
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-12, 13,  7),
    new THREE.Vector3( 12, 13,  7),
    3, 0.4, 3, 0xcce8ff, 3.5, add, colliders
  ));

  // ── Trees ────────────────────────────────────────────────────────────────────

  // Perimeter trees
  addTree(-25,  25);
  addTree( 25,  25);
  addTree(-25, -25);
  addTree( 25, -25);
  addTree(-25,   0);
  addTree( 25,   0);
  addTree(  0,  25);
  addTree(  0, -25);

  // Mid-map cluster trees
  addTree(-15,  15);
  addTree( 15,  15);
  addTree(-15, -15);
  addTree( 15, -15);

  // Near-center small trees
  addTree(-3,   3, 0.6);
  addTree( 3,  -3, 0.6);
  addTree( 3,   3, 0.6);
  addTree(-3,  -3, 0.6);

  return {
    colliders,
    walls,
    teleporters,
    movingPlatforms,
    boundary: BOUNDARY,
    gravity: -28,
    background: 0x87ceeb,
    dispose: () => _objs.forEach(o => scene.remove(o)),
  };
}
