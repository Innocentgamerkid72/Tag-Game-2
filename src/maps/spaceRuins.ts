import * as THREE from "three";
import { MapResult, Teleporter } from "../testMap";
import { BlackHole } from "./blackHole";

export function buildSpaceRuins(scene: THREE.Scene): MapResult {
  const colliders: THREE.Box3[] = [];
  const walls: THREE.Box3[] = [];
  const teleporters: Teleporter[] = [];
  const BOUNDARY = 30;

  const _objs: THREE.Object3D[] = [];
  function add<T extends THREE.Object3D>(o: T): T { scene.add(o); _objs.push(o); return o; }

  // No fog — clear space
  scene.fog = null;

  // ── Stars ────────────────────────────────────────────────────────────────────
  const starGeo = new THREE.BufferGeometry();
  const starCount = 500;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3]     = (Math.random() - 0.5) * 200;
    starPositions[i * 3 + 1] = Math.random() * 80 + 5;
    starPositions[i * 3 + 2] = (Math.random() - 0.5) * 200;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.2 }));
  add(stars);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function addPlatform(
    x: number, y: number, z: number,
    w: number, h: number, d: number,
    color = 0x445566
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color })
    );
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
  }

  function addWall(
    x: number, y: number, z: number,
    w: number, h: number, d: number,
    color = 0x556677
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color })
    );
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    add(mesh);
    walls.push(new THREE.Box3().setFromObject(mesh));
  }

  function addTeleporter(
    x: number, y: number, z: number,
    destX: number, destY: number, destZ: number
  ): Teleporter {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16),
      new THREE.MeshLambertMaterial({ color: 0xaa00ff, emissive: new THREE.Color(0x440088) })
    );
    pad.position.set(x, y + 0.08, z);
    add(pad);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xcc44ff })
    );
    ring.position.set(x, y + 0.15, z);
    ring.rotation.x = Math.PI / 2;
    add(ring);

    const triggerBox = new THREE.Box3(
      new THREE.Vector3(x - 0.7, y, z - 0.7),
      new THREE.Vector3(x + 0.7, y + 0.5, z + 0.7)
    );

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

    const tp: Teleporter = {
      trigger: triggerBox,
      destination: new THREE.Vector3(destX, destY, destZ),
      cooldown: 0,
      sprite,
      texture,
      canvas,
    };
    teleporters.push(tp);
    return tp;
  }

  // ── Floor ────────────────────────────────────────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(BOUNDARY * 2, BOUNDARY * 2),
    new THREE.MeshLambertMaterial({ color: 0x080818 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  add(floor);

  // Glowing grid overlay
  const grid = new THREE.GridHelper(BOUNDARY * 2, 22, 0x1a2a4a, 0x1a2a4a);
  grid.position.y = 0.01;
  add(grid);

  // Subtle point lights near the floor corners to add depth
  for (const [lx, lz] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) {
    const l = new THREE.PointLight(0x2244aa, 0.4, 18);
    l.position.set(lx, 0.5, lz);
    add(l);
  }

  // ── Floating platforms (12-15 at y=2 to y=18) ───────────────────────────────
  // Low tier (y=2-4)
  addPlatform(  0,  2,   0,  5, 0.5, 5, 0x334455);
  addPlatform(-11,  2,  -8,  4, 0.5, 4, 0x3a3a55);
  addPlatform( 11,  2,  -8,  4, 0.5, 4, 0x3a3a55);
  addPlatform(-11,  2,   8,  4, 0.5, 4, 0x3a3a55);
  addPlatform( 11,  3,   8,  4, 0.5, 4, 0x3a3a55);

  // Mid tier (y=6-10)
  addPlatform( -7,  6,   0,  3, 0.5, 3, 0x445566);
  addPlatform(  7,  6,   0,  3, 0.5, 3, 0x445566);
  addPlatform(  0,  7, -12,  4, 0.5, 4, 0x443355);
  addPlatform(  0,  8,  12,  4, 0.5, 4, 0x445533);
  addPlatform(-16,  9,   0,  3, 0.5, 6, 0x334433);
  addPlatform( 16,  9,   0,  3, 0.5, 6, 0x334433);

  // High tier (y=12-18)
  addPlatform(  0, 12,   0,  4, 0.5, 4, 0x556677);
  addPlatform( -9, 15,  -9,  3, 0.5, 3, 0x665566);
  addPlatform(  9, 15,   9,  3, 0.5, 3, 0x665566);
  addPlatform(  0, 18,   0,  3, 0.5, 3, 0x778899);

  // ── Extra platforms — fill gaps between tiers ────────────────────────────────
  // Low-to-mid stepping stones (y=4) — diagonal corners and cardinals
  addPlatform( -5,  4,  -5,  3, 0.5, 3, 0x3a3a66);
  addPlatform(  5,  4,  -5,  3, 0.5, 3, 0x3a3a66);
  addPlatform( -5,  4,   5,  3, 0.5, 3, 0x3a3a66);
  addPlatform(  5,  4,   5,  3, 0.5, 3, 0x3a3a66);
  addPlatform( -9,  4,   0,  3, 0.5, 3, 0x3a4466);
  addPlatform(  9,  4,   0,  3, 0.5, 3, 0x3a4466);
  addPlatform(  0,  4, -11,  3, 0.5, 3, 0x3a4466);
  addPlatform(  0,  4,  11,  3, 0.5, 3, 0x3a4466);
  // Diagonal mid-level (y=7) — fills the empty corners between mid-tier pads
  addPlatform( -9,  7,  -9,  3, 0.5, 3, 0x445566);
  addPlatform(  9,  7,   9,  3, 0.5, 3, 0x445566);
  addPlatform( -9,  7,   9,  3, 0.5, 3, 0x445566);
  addPlatform(  9,  7,  -9,  3, 0.5, 3, 0x445566);
  // Outer mid (y=6) — far platforms off the ±16 axis
  addPlatform(-18,  6,   8,  3, 0.5, 3, 0x334455);
  addPlatform( 18,  6,  -8,  3, 0.5, 3, 0x334455);
  addPlatform(  8,  6,  18,  3, 0.5, 3, 0x334455);
  addPlatform( -8,  6, -18,  3, 0.5, 3, 0x334455);
  // High-tier extras (y=13) — diagonal stepping stones up to apex
  addPlatform( -5, 13,  -5,  3, 0.5, 3, 0x556688);
  addPlatform(  5, 13,   5,  3, 0.5, 3, 0x556688);
  addPlatform( -5, 13,   5,  3, 0.5, 3, 0x556688);
  addPlatform(  5, 13,  -5,  3, 0.5, 3, 0x556688);

  // ── Walls on some platforms ──────────────────────────────────────────────────
  // Walls on center low platform
  addWall(  0, 2.5, -3.0,  5, 1.5, 0.3, 0x445566);
  addWall(  0, 2.5,  3.0,  5, 1.5, 0.3, 0x445566);

  // Wall on high center platform
  addWall(-2, 12.5,   0,  0.3, 2, 4, 0x667788);
  addWall( 2, 12.5,   0,  0.3, 2, 4, 0x667788);

  // ── Glowing ruins decorations ────────────────────────────────────────────────
  const ruinPositions = [[-19, 4, -19], [19, 4, -19], [-19, 4, 19], [19, 4, 19]];
  for (const [rx, ry, rz] of ruinPositions) {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.4, 4, 6),
      new THREE.MeshLambertMaterial({ color: 0x334455 })
    );
    pillar.position.set(rx, ry as number, rz);
    add(pillar);
    const glow = new THREE.PointLight(0x4488ff, 0.5, 8);
    glow.position.set(rx, (ry as number) + 2.5, rz);
    add(glow);
  }

  // ── Black hole (1, sweeps diagonally — captures and teleports) ──────────────
  // All platform landing spots the black hole can drop players onto
  const bhTeleportSpots = [
    // Low tier
    new THREE.Vector3(  0, 3.0,   0),
    new THREE.Vector3(-11, 3.0,  -8),
    new THREE.Vector3( 11, 3.0,  -8),
    new THREE.Vector3(-11, 3.0,   8),
    new THREE.Vector3( 11, 4.0,   8),
    // Mid tier
    new THREE.Vector3( -7, 7.0,   0),
    new THREE.Vector3(  7, 7.0,   0),
    new THREE.Vector3(  0, 8.0, -12),
    new THREE.Vector3(  0, 9.0,  12),
    new THREE.Vector3(-16, 10.0,  0),
    new THREE.Vector3( 16, 10.0,  0),
    // High tier
    new THREE.Vector3(  0, 13.0,  0),
    new THREE.Vector3( -9, 16.0, -9),
    new THREE.Vector3(  9, 16.0,  9),
    new THREE.Vector3(  0, 19.0,  0),
  ];

  const bh1 = new BlackHole(
    new THREE.Vector3(-18, 7, -14),
    new THREE.Vector3( 18, 7,  14),
    add,
    bhTeleportSpots,
  );

  // ── Teleporters (3 pairs, purple/magenta) ────────────────────────────────────
  // Pair 1: center low <-> apex high
  const tp1a = addTeleporter( 0, 2.5,  0,   0, 18.5,  0);
  const tp1b = addTeleporter( 0, 18.5, 0,   0,  3.0,  0);
  tp1a.link = tp1b; tp1b.link = tp1a;

  // Pair 2: SW mid <-> NE mid
  const tp2a = addTeleporter(-16, 9.5,  0,  16, 10.0,  0);
  const tp2b = addTeleporter( 16, 9.5,  0, -16, 10.0,  0);
  tp2a.link = tp2b; tp2b.link = tp2a;

  // Pair 3: SE low <-> NW high
  const tp3a = addTeleporter( 11, 3.5,  8,  -9, 15.5, -9);
  const tp3b = addTeleporter( -9, 15.5,-9,  11,  4.0,  8);
  tp3a.link = tp3b; tp3b.link = tp3a;

  return {
    colliders,
    walls,
    teleporters,
    hazards: [bh1],
    boundary: BOUNDARY,
    gravity: -15,
    background: 0x000010,
    groundY: 0,
    spawnPos: new THREE.Vector3(0, 3.5, 0),
    dispose: () => {
      scene.fog = null;
      _objs.forEach(o => scene.remove(o));
    },
  };
}
