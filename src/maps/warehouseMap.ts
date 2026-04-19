import * as THREE from "three";
import { MapResult, Teleporter } from "../testMap";

const BOUNDARY = 26;

export function buildWarehouseMap(scene: THREE.Scene): MapResult {
  const colliders: THREE.Box3[] = [];
  const walls:     THREE.Box3[] = [];
  const teleporters: Teleporter[] = [];

  const _objs: THREE.Object3D[] = [];
  function add<T extends THREE.Object3D>(o: T): T { scene.add(o); _objs.push(o); return o; }

  // ── Lighting ────────────────────────────────────────────────────────────────
  scene.fog = new THREE.Fog(0x1a1208, 30, 90);

  const ambient = new THREE.AmbientLight(0xffeedd, 0.35);
  add(ambient);

  // Overhead industrial strip lights
  for (const [lx, lz] of [[-10, -10], [10, -10], [-10, 10], [10, 10], [0, 0]]) {
    const l = new THREE.PointLight(0xffcc88, 1.0, 22);
    l.position.set(lx, 9, lz);
    add(l);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
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
    const b3 = new THREE.Box3().setFromObject(mesh);
    if (isWall) walls.push(b3); else colliders.push(b3);
    return mesh;
  }

  // Shelf unit: two walkable levels + side walls
  function addShelf(cx: number, cz: number, length: number) {
    const W = 1.4;   // shelf depth
    const H1 = 2.5;  // first shelf height
    const H2 = 5.0;  // second shelf height
    const THICK = 0.2;

    // Vertical back panel (wall collision)
    box(cx, 0, cz, W, H2 + 0.5, length, 0x3a3028, true);

    // First shelf surface (walkable)
    box(cx, H1, cz, W + 0.3, THICK, length, 0x5a4830);
    colliders[colliders.length - 1]; // already added

    // Second shelf surface (walkable)
    box(cx, H2, cz, W + 0.3, THICK, length, 0x5a4830);

    // Side end-caps
    for (const zOff of [-length / 2 + 0.1, length / 2 - 0.1]) {
      box(cx, H2 / 2, cz + zOff, W + 0.3, H2, 0.15, 0x2e2418, true);
    }

    // Cardboard boxes on upper shelf (decorative, also walkable)
    for (let i = -1; i <= 1; i++) {
      const bx = cx;
      const bz = cz + i * (length / 3);
      const bSize = 0.7 + Math.random() * 0.4;
      box(bx, H2 + THICK, bz, bSize, bSize, bSize, 0x8b6914);
    }
  }

  function addCrateStack(cx: number, cz: number) {
    const colors = [0x7a5c2e, 0x8b6b35, 0x6b4f24];
    const sizes  = [[1.2, 1.2, 1.2], [1.1, 1.1, 1.1], [1.0, 1.0, 1.0]];
    for (let i = 0; i < 3; i++) {
      const [w, h, d] = sizes[i];
      box(cx + (Math.random() - 0.5) * 0.3, i * 1.2, cz + (Math.random() - 0.5) * 0.3, w, h, d, colors[i]);
    }
  }

  function addTeleporter(
    x: number, y: number, z: number,
    dx: number, dy: number, dz: number,
  ): Teleporter {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16),
      new THREE.MeshLambertMaterial({ color: 0xffaa00, emissive: new THREE.Color(0x553300) }),
    );
    pad.position.set(x, y + 0.08, z);
    add(pad);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffcc44 }),
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
      destination: new THREE.Vector3(dx, dy, dz),
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
    new THREE.MeshLambertMaterial({ color: 0x2a2420 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  add(floor);

  // Painted floor lines (aisle markers)
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
  for (const lx of [-7, 7]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.15, BOUNDARY * 1.6), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(lx, 0.01, 0);
    add(line);
  }

  // ── Exterior walls (all four sides) ──────────────────────────────────────────
  const WH = 12; // wall height
  const WL = BOUNDARY * 2;
  // North / South
  box(0,  0, -BOUNDARY, WL, WH, 0.8, 0x1e1a14, true);
  box(0,  0,  BOUNDARY, WL, WH, 0.8, 0x1e1a14, true);
  // East / West
  box(-BOUNDARY, 0, 0, 0.8, WH, WL, 0x1e1a14, true);
  box( BOUNDARY, 0, 0, 0.8, WH, WL, 0x1e1a14, true);

  // Corrugated roof (visual only, no collider)
  const roof = new THREE.Mesh(
    new THREE.PlaneGeometry(WL, WL),
    new THREE.MeshLambertMaterial({ color: 0x18130e, side: THREE.BackSide }),
  );
  roof.rotation.x = Math.PI / 2;
  roof.position.y = WH;
  add(roof);

  // ── Shelving aisles ───────────────────────────────────────────────────────────
  // Three pairs of shelves, each pair faces each other across an aisle
  for (const cx of [-8.5, 0, 8.5]) {
    addShelf(cx - 0.7,  0, 16);   // left shelf of pair
    addShelf(cx + 0.7,  0, 16);   // right shelf
  }

  // ── Central raised catwalk (E-W) ─────────────────────────────────────────────
  // Catwalk platform
  box(0, 5, 0, 34, 0.25, 2.5, 0x444038);
  // Guard rails (walls, chest-height)
  for (const zOff of [-1.2, 1.2]) {
    box(0, 5.25, zOff, 34, 0.9, 0.12, 0x555040, true);
  }
  // Support pillars
  for (const px of [-12, -6, 0, 6, 12]) {
    box(px, 2.5, 0, 0.35, 5, 0.35, 0x2a2318, true);
  }

  // Ramp up to catwalk on the west side
  // (A stepped approach using stacked boxes)
  box(-15, 0,  -4, 2, 1.8, 2, 0x3a3028, false); // step 1
  box(-15, 1.8, -4, 2, 1.8, 2, 0x3a3028, false); // step 2
  box(-15, 3.6, -4, 2, 1.8, 2, 0x3a3028, false); // step 3 (connects to catwalk)

  // Ramp up to catwalk on the east side
  box(15, 0,  4, 2, 1.8, 2, 0x3a3028, false);
  box(15, 1.8, 4, 2, 1.8, 2, 0x3a3028, false);
  box(15, 3.6, 4, 2, 1.8, 2, 0x3a3028, false);

  // ── Crate clusters ────────────────────────────────────────────────────────────
  for (const [cx, cz] of [
    [-18, -18], [18, -18], [-18, 18], [18, 18],
    [-4,  -18], [4,  -18], [-4,  18], [4,  18],
  ]) {
    addCrateStack(cx, cz);
  }

  // ── Forklift obstacle (decorative + wall collision) ───────────────────────────
  {
    const fGroup = new THREE.Group();
    // Body
    const fBody = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 1.8, 1.4),
      new THREE.MeshLambertMaterial({ color: 0xdd8800 }),
    );
    fBody.position.y = 0.9;
    fGroup.add(fBody);
    // Mast
    const mast = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 4, 0.2),
      new THREE.MeshLambertMaterial({ color: 0xcc7700 }),
    );
    mast.position.set(-1.1, 2, 0);
    fGroup.add(mast);
    // Forks
    for (const fz of [-0.4, 0.4]) {
      const fork = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.12, 0.18),
        new THREE.MeshLambertMaterial({ color: 0x888888 }),
      );
      fork.position.set(0, 0.35, fz);
      fGroup.add(fork);
    }
    fGroup.position.set(-20, 0, -6);
    fGroup.rotation.y = Math.PI / 6;
    add(fGroup);
    walls.push(new THREE.Box3(
      new THREE.Vector3(-22, 0, -8),
      new THREE.Vector3(-18, 2.5, -4),
    ));
  }

  // ── Loading dock platform ────────────────────────────────────────────────────
  box(22, 0, 0, 4, 1.2, 8, 0x2e2820, false);

  // ── Teleporters ───────────────────────────────────────────────────────────────
  const tp1 = addTeleporter(-20, 0, -20, 20, 0, 20);
  const tp2 = addTeleporter( 20, 0,  20, -20, 0, -20);
  tp1.link = tp2;
  tp2.link = tp1;

  // ── Dispose ──────────────────────────────────────────────────────────────────
  return {
    colliders,
    walls,
    teleporters,
    hazards: [],
    boundary: BOUNDARY,
    gravity: -28,
    background: 0x1a1208,
    spawnPos: new THREE.Vector3(0, 1, 0),
    dispose() {
      for (const o of _objs) {
        scene.remove(o);
        if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      }
    },
  };
}
