import * as THREE from "three";
import { MapResult, Teleporter } from "../testMap";

const BOUNDARY  = 42;
const FLOOR2_Y  = 10;   // 2nd floor elevation
const MZ        = 28;   // mezzanine half-span (x/z from -MZ to +MZ)
const GAP       = 5;    // half-width of center skylight hole

export function buildWarehouseMap(scene: THREE.Scene): MapResult {
  const colliders: THREE.Box3[] = [];
  const walls:     THREE.Box3[] = [];
  const teleporters: Teleporter[] = [];

  const _objs: THREE.Object3D[] = [];
  function add<T extends THREE.Object3D>(o: T): T { scene.add(o); _objs.push(o); return o; }

  // ── Lighting ────────────────────────────────────────────────────────────────
  scene.fog = new THREE.Fog(0x140e06, 40, 130);
  add(new THREE.AmbientLight(0xffeedd, 0.28));

  // Ground-floor strip lights in a 3×3 grid
  for (const lx of [-22, 0, 22]) {
    for (const lz of [-22, 0, 22]) {
      const l = new THREE.PointLight(0xffcc88, 1.0, 32);
      l.position.set(lx, 9, lz);
      add(l);
    }
  }
  // 2nd floor caged bulbs
  for (const [lx, lz] of [[-18, -18], [18, -18], [-18, 18], [18, 18], [0, -18], [0, 18], [-18, 0], [18, 0]]) {
    const l = new THREE.PointLight(0xffdd99, 0.85, 22);
    l.position.set(lx, FLOOR2_Y + 5, lz);
    add(l);
  }

  // ── Core helpers ─────────────────────────────────────────────────────────────
  function box(
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

  // Teleporter pad (yellow industrial style)
  function addTeleporter(x: number, y: number, z: number, dx: number, dy: number, dz: number): Teleporter {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16),
      new THREE.MeshLambertMaterial({ color: 0xffaa00, emissive: new THREE.Color(0x553300) }),
    );
    pad.position.set(x, y + 0.08, z);
    add(pad);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffdd44 }),
    );
    ring.position.set(x, y + 0.16, z);
    ring.rotation.x = Math.PI / 2;
    add(ring);
    const l = new THREE.PointLight(0xffaa00, 0.6, 5);
    l.position.set(x, y + 1, z);
    add(l);
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
        new THREE.Vector3(x - 0.7, y, z - 0.7),
        new THREE.Vector3(x + 0.7, y + 0.6, z + 0.7),
      ),
      destination: new THREE.Vector3(dx, dy, dz),
      cooldown: 0, sprite, texture, canvas,
    };
    teleporters.push(tp);
    return tp;
  }

  // Shelf unit: back panel + two walkable shelves + end-caps + cargo boxes
  function addShelf(cx: number, cz: number, len: number) {
    const W = 1.4, H1 = 2.5, H2 = 5.2, T = 0.22;
    box(cx, 0, cz, W, H2 + 0.5, len, 0x3a3028, true);           // back panel
    box(cx, H1, cz, W + 0.3, T, len, 0x5a4830);                  // shelf 1
    box(cx, H2, cz, W + 0.3, T, len, 0x5a4830);                  // shelf 2
    for (const zo of [-len / 2 + 0.1, len / 2 - 0.1]) {
      box(cx, H2 / 2, cz + zo, W + 0.3, H2, 0.18, 0x2e2418, true); // end-cap
    }
    for (let i = -1; i <= 1; i++) {
      const bs = 0.65 + Math.random() * 0.45;
      box(cx, H2 + T, cz + i * (len / 3.2), bs, bs, bs, 0x8b6914); // cargo box
    }
  }

  // Staircase going in +x or −x from (bx, bz), 5 steps × 2 units each → reaches FLOOR2_Y
  function addStaircase(bx: number, bz: number, dir: 'x+' | 'x-') {
    for (let i = 0; i < 5; i++) {
      const sx = dir === 'x+' ? bx + i * 2 : bx - i * 2;
      box(sx, i * 2, bz, 2.1, 2.05, 4, 0x3a3028); // step
    }
    // Handrails (aesthetic walls flanking stairs)
    const rLen = 10.5, rH = 1.0, sign = dir === 'x+' ? 1 : -1;
    for (const zo of [-2.2, 2.2]) {
      // slanted rail approximated by a tilted box — use a flat wall for simplicity
      walls.push(new THREE.Box3(
        new THREE.Vector3(Math.min(bx, bx + sign * rLen) - 0.1, 0, bz + zo - 0.15),
        new THREE.Vector3(Math.max(bx, bx + sign * rLen) + 0.1, rH + FLOOR2_Y * 0.5, bz + zo + 0.15),
      ));
    }
  }

  function addCrateStack(cx: number, cz: number, ht = 3) {
    for (let i = 0; i < ht; i++) {
      const s = 1.15 - i * 0.05;
      box(cx + (Math.random() - 0.5) * 0.25, i * 1.15, cz + (Math.random() - 0.5) * 0.25,
          s, 1.15, s, [0x7a5c2e, 0x8b6b35, 0x6b4f24][i % 3]);
    }
  }

  function addForklift(x: number, z: number, ry: number) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 1.5), new THREE.MeshLambertMaterial({ color: 0xdd8800 }));
    body.position.y = 0.9; g.add(body);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.5, 0.22), new THREE.MeshLambertMaterial({ color: 0xcc7700 }));
    mast.position.set(-1.2, 2.25, 0); g.add(mast);
    for (const fz of [-0.42, 0.42]) {
      const fork = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.13, 0.2), new THREE.MeshLambertMaterial({ color: 0x888888 }));
      fork.position.set(0.1, 0.38, fz); g.add(fork);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    add(g);
    walls.push(new THREE.Box3(new THREE.Vector3(x - 2.2, 0, z - 1.2), new THREE.Vector3(x + 2.2, 2.6, z + 1.2)));
  }

  // ── Ground floor ──────────────────────────────────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(BOUNDARY * 2, BOUNDARY * 2),
    new THREE.MeshLambertMaterial({ color: 0x252018 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  add(floor);

  // Yellow aisle lines
  const lmat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
  for (const lx of [-22, -9, 4, 17, 30]) {
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(0.18, BOUNDARY * 1.8), lmat);
    ln.rotation.x = -Math.PI / 2;
    ln.position.set(lx, 0.01, 0);
    add(ln);
  }

  // ── Exterior walls ────────────────────────────────────────────────────────────
  const WH = 16, WL = BOUNDARY * 2;
  box(0, 0, -BOUNDARY, WL, WH, 0.9, 0x1c1710, true);
  box(0, 0,  BOUNDARY, WL, WH, 0.9, 0x1c1710, true);
  box(-BOUNDARY, 0, 0, 0.9, WH, WL, 0x1c1710, true);
  box( BOUNDARY, 0, 0, 0.9, WH, WL, 0x1c1710, true);

  // Roof (visual only)
  const roofMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(WL, WL),
    new THREE.MeshLambertMaterial({ color: 0x14100a, side: THREE.BackSide }),
  );
  roofMesh.rotation.x = Math.PI / 2;
  roofMesh.position.y = WH;
  add(roofMesh);

  // ── Interior ground-floor walls ────────────────────────────────────────────────
  // Main E-W divider at z = 0 — two halves, gap at centre (x: −5 to +5)
  box(-20, 0, 0, 30, 4.5, 0.55, 0x2e2820, true);   // west half
  box( 20, 0, 0, 30, 4.5, 0.55, 0x2e2820, true);   // east half

  // Secondary E-W walls creating north/south zones
  box(-18, 0, -18, 32, 3.5, 0.4, 0x2a2418, true);  // north sub-divider (gap at x: −2 to 2)
  box( 18, 0,  18, 32, 3.5, 0.4, 0x2a2418, true);  // south sub-divider

  // N-S short walls partitioning aisles near south wall
  box(-30, 0,  28, 0.4, 4.0, 18, 0x2a2418, true);  // far west partition
  box( 30, 0, -28, 0.4, 4.0, 18, 0x2a2418, true);  // far east partition

  // Dead-end alcove walls (NE and SW corners — create hidden pockets)
  // NE storage room: x 25→40, z −40→−25
  box( 32, 0, -32, 0.5, 5, 20, 0x242018, true);   // west wall of NE room
  box( 38, 0, -24, 12, 5, 0.5, 0x242018, true);   // south wall of NE room
  // SW storage room: x −40→−25, z 25→40
  box(-32, 0,  32, 0.5, 5, 20, 0x242018, true);
  box(-38, 0,  24, 12, 5, 0.5, 0x242018, true);

  // Short stub walls for cover throughout ground floor
  for (const [wx, wz, wr] of [
    [-12, -30, false], [12, 30, false],
    [-38, -10, true],  [38, 10, true],
    [0, -30, false],   [0, 30, false],
  ] as [number, number, boolean][]) {
    if (wr) box(wx, 0, wz, 0.5, 3, 8, 0x2a2018, true);
    else     box(wx, 0, wz, 8, 3, 0.5, 0x2a2018, true);
  }

  // ── Shelving aisles (5 pairs, each 30 units long N-S) ────────────────────────
  for (const cx of [-28, -14, 0, 14, 28]) {
    addShelf(cx - 0.72, 0, 30);
    addShelf(cx + 0.72, 0, 30);
  }

  // ── Crate clusters ───────────────────────────────────────────────────────────
  for (const [cx, cz] of [
    [-36, -36], [36, -36], [-36, 36], [36, 36],
    [-10, -36], [10, -36], [-10, 36], [10, 36],
    [-36, 10],  [36, -10], [0, -36],  [0, 36],
    [-22, -26], [22, 26],
  ]) {
    addCrateStack(cx, cz, 2 + (Math.random() > 0.5 ? 1 : 0));
  }

  // ── Forklifts ────────────────────────────────────────────────────────────────
  addForklift(-35, -10, Math.PI / 5);
  addForklift( 35,  10, -Math.PI / 5);
  addForklift( 20, -35, Math.PI / 2.5);

  // ── Loading dock (south exterior wall) ───────────────────────────────────────
  box(0, 0, 40, 14, 1.5, 5, 0x2e2820);   // raised dock platform
  // Dock bumpers
  for (const dx of [-5, 0, 5]) {
    box(dx, 1.5, 38, 1.2, 0.6, 0.5, 0xdd8800);
  }

  // ── 2nd Floor mezzanine ───────────────────────────────────────────────────────
  // Four slab quadrants with a GAP×2 × GAP×2 skylight hole in the centre
  const slabW = MZ - GAP;   // 23 units each quadrant
  const slabCX = (MZ + GAP) / 2;  // 16.5

  box(-slabCX, FLOOR2_Y, -slabCX, slabW, 0.42, slabW, 0x2e2820); // NW
  box( slabCX, FLOOR2_Y, -slabCX, slabW, 0.42, slabW, 0x2e2820); // NE
  box(-slabCX, FLOOR2_Y,  slabCX, slabW, 0.42, slabW, 0x2e2820); // SW
  box( slabCX, FLOOR2_Y,  slabCX, slabW, 0.42, slabW, 0x2e2820); // SE

  // Cross bridges over the skylight (+ shape, 2 units wide each)
  box(0, FLOOR2_Y, 0, 2.2, 0.42, GAP * 2, 0x383028);  // N-S bridge
  box(0, FLOOR2_Y, 0, GAP * 2, 0.42, 2.2, 0x383028);  // E-W bridge

  // Outer perimeter railings (safety rails at mezzanine edge)
  const F2 = FLOOR2_Y + 0.42;  // top of slab
  box(0,    F2, -MZ, MZ * 2, 1.1, 0.22, 0x444038, true); // north rail
  box(0,    F2,  MZ, MZ * 2, 1.1, 0.22, 0x444038, true); // south rail
  box(-MZ,  F2, 0, 0.22, 1.1, MZ * 2, 0x444038, true);   // west rail
  box( MZ,  F2, 0, 0.22, 1.1, MZ * 2, 0x444038, true);   // east rail

  // ── 2nd floor interior walls (offices / storage bays) ────────────────────────
  // NW quadrant: small office room
  box(-20, F2, -22, 12, 3.5, 0.3, 0x282416, true);  // south wall
  box(-25, F2, -19, 0.3, 3.5, 6,  0x282416, true);  // east wall (opening on west)

  // NE quadrant: open storage with partial divider
  box( 20, F2, -22, 12, 3.5, 0.3, 0x282416, true);
  box( 22, F2, -15, 0.3, 3.5, 14, 0x282416, true);

  // SE quadrant: another office
  box( 18, F2,  22, 12, 3.5, 0.3, 0x282416, true);
  box( 24, F2,  18, 0.3, 3.5, 8,  0x282416, true);

  // SW quadrant: small bay
  box(-18, F2,  22, 12, 3.5, 0.3, 0x282416, true);
  box(-24, F2,  18, 0.3, 3.5, 8,  0x282416, true);

  // ── Staircases (x-direction, one pair per side) ───────────────────────────────
  // NW: climb eastward from x=−38, settle onto NW slab at x=−28
  addStaircase(-38, -26, 'x+');
  // NE: climb westward from x=+38, settle onto NE slab at x=+28
  addStaircase( 38, -26, 'x-');
  // SW
  addStaircase(-38,  26, 'x+');
  // SE
  addStaircase( 38,  26, 'x-');

  // ── Teleporters ───────────────────────────────────────────────────────────────
  // Ground floor: NW ↔ SE
  const tp1 = addTeleporter(-36, 0, -36,  36, 1, 36);
  const tp2 = addTeleporter( 36, 0,  36, -36, 1, -36);
  tp1.link = tp2; tp2.link = tp1;

  // Ground floor: NE ↔ SW
  const tp3 = addTeleporter( 36, 0, -36, -36, 1, 36);
  const tp4 = addTeleporter(-36, 0,  36,  36, 1, -36);
  tp3.link = tp4; tp4.link = tp3;

  // 2nd floor: NE quad ↔ SW quad (links the two opposite mezzanine wings)
  const tp5 = addTeleporter( 20, F2, -20, -20, F2 + 1, 20);
  const tp6 = addTeleporter(-20, F2,  20,  20, F2 + 1, -20);
  tp5.link = tp6; tp6.link = tp5;

  // 2nd floor: NW quad ↔ SE quad
  const tp7 = addTeleporter(-20, F2, -20,  20, F2 + 1, 20);
  const tp8 = addTeleporter( 20, F2,  20, -20, F2 + 1, -20);
  tp7.link = tp8; tp8.link = tp7;

  // ── Dispose ──────────────────────────────────────────────────────────────────
  return {
    colliders,
    walls,
    teleporters,
    hazards: [],
    boundary: BOUNDARY,
    gravity: -28,
    background: 0x140e06,
    spawnPos: new THREE.Vector3(0, 1, 0),
    dispose() {
      for (const o of _objs) {
        scene.remove(o);
        if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      }
    },
  };
}
