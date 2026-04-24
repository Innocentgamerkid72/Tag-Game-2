import * as THREE from "three";
import { MapResult, Teleporter } from "../testMap";

const BOUNDARY = 38;

export function buildHauntedMap(scene: THREE.Scene): MapResult {
  const colliders: THREE.Box3[] = [];
  const walls:     THREE.Box3[] = [];
  const teleporters: Teleporter[] = [];

  const _objs: THREE.Object3D[] = [];
  function add<T extends THREE.Object3D>(o: T): T { scene.add(o); _objs.push(o); return o; }

  scene.fog = new THREE.FogExp2(0x08060c, 0.055);

  // Ground — dark earth
  const ground = add(new THREE.Mesh(
    new THREE.PlaneGeometry(BOUNDARY * 2, BOUNDARY * 2),
    new THREE.MeshLambertMaterial({ color: 0x100c08 }),
  ));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;

  // Dim ambient — barely lit
  add(new THREE.AmbientLight(0x2a1a3a, 0.6));

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function wall(x: number, z: number, w: number, h: number, d: number, color: number) {
    const mesh = add(new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color }),
    ));
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    walls.push(new THREE.Box3().setFromObject(mesh));
  }

  /** Flat-top platform: wall sides + walkable top. */
  function platform(x: number, z: number, w: number, d: number, h: number, color: number) {
    wall(x, z, w, h, d, color);
    const top = add(new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.3, d),
      new THREE.MeshLambertMaterial({ color }),
    ));
    top.position.set(x, h + 0.15, z);
    colliders.push(new THREE.Box3().setFromObject(top));
  }

  function lantern(x: number, z: number, y = 2.2) {
    // Post
    const post = add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, y, 6),
      new THREE.MeshLambertMaterial({ color: 0x2a2a2a }),
    ));
    post.position.set(x, y / 2, z);
    // Light box
    const box = add(new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xffcc44 }),
    ));
    box.position.set(x, y, z);
    // Point light
    const light = add(new THREE.PointLight(0xff9922, 1.4, 10));
    light.position.set(x, y + 0.1, z);
  }

  /** Dead tree: trunk + bare branching arms. */
  function deadTree(x: number, z: number, h = 7) {
    const trunk = add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.28, h, 6),
      new THREE.MeshLambertMaterial({ color: 0x1c1208 }),
    ));
    trunk.position.set(x, h / 2, z);
    trunk.castShadow = true;
    walls.push(new THREE.Box3(
      new THREE.Vector3(x - 0.3, 0, z - 0.3),
      new THREE.Vector3(x + 0.3, h, z + 0.3),
    ));
    // Two branches
    for (const [bx, bz, ang] of [[-0.5, 0, 0.4], [0.5, 0, -0.4]] as [number, number, number][]) {
      const branch = add(new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.1, 2.5, 5),
        new THREE.MeshLambertMaterial({ color: 0x1c1208 }),
      ));
      branch.position.set(x + bx * 1.2, h * 0.72, z + bz * 1.2);
      branch.rotation.z = ang;
      branch.castShadow = true;
    }
  }

  /** Tombstone: short wall slab. */
  function tombstone(x: number, z: number, w = 0.9, h = 1.4, rotY = 0) {
    const mesh = add(new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 0.22),
      new THREE.MeshLambertMaterial({ color: 0x3a3832 }),
    ));
    mesh.position.set(x, h / 2, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    walls.push(new THREE.Box3().setFromObject(mesh));
  }

  // ── Iron fence perimeter ──────────────────────────────────────────────────
  const FW = BOUNDARY * 2, FH = 2.2, FT = 0.4;
  wall(  0, -BOUNDARY, FW,      FH, FT, 0x1a1a1a);
  wall(  0,  BOUNDARY, FW,      FH, FT, 0x1a1a1a);
  wall(-BOUNDARY, 0,   FT, FH, FW,      0x1a1a1a);
  wall( BOUNDARY, 0,   FT, FH, FW,      0x1a1a1a);

  // ── Central mausoleum ─────────────────────────────────────────────────────
  // Hollow: 4 wall slabs + roof, doorways on N and S
  const MX = 0, MZ = 0, MW = 10, MD = 10, MH = 6;
  const doorW = 2.4;
  // N wall (two halves with gap)
  wall(MX - (MW - doorW) / 4 - doorW / 4, MZ - MD / 2, (MW - doorW) / 2, MH, 0.5, 0x2a2420);
  wall(MX + (MW - doorW) / 4 + doorW / 4, MZ - MD / 2, (MW - doorW) / 2, MH, 0.5, 0x2a2420);
  // S wall (two halves with gap)
  wall(MX - (MW - doorW) / 4 - doorW / 4, MZ + MD / 2, (MW - doorW) / 2, MH, 0.5, 0x2a2420);
  wall(MX + (MW - doorW) / 4 + doorW / 4, MZ + MD / 2, (MW - doorW) / 2, MH, 0.5, 0x2a2420);
  // E and W walls (solid)
  wall(MX - MW / 2, MZ, 0.5, MH, MD, 0x2a2420);
  wall(MX + MW / 2, MZ, 0.5, MH, MD, 0x2a2420);
  // Roof as walkable platform
  platform(MX, MZ, MW, MD, MH, 0x222018);
  // Interior eerie lantern
  lantern(MX, MZ, 1.8);

  // ── Burial mounds (low raised platforms) ─────────────────────────────────
  platform(-18, -14, 6, 3, 1.2, 0x181008);
  platform( 16,  12, 5, 3, 1.0, 0x181008);
  platform(-14,  18, 3, 6, 1.2, 0x181008);
  platform( 20, -16, 3, 5, 1.0, 0x181008);

  // ── Tombstone clusters ────────────────────────────────────────────────────
  const stones: [number, number, number?, number?, number?][] = [
    // NW cluster
    [-24, -20], [-22, -18, 0.8, 1.2, 0.2], [-26, -22, 1.1, 1.5, -0.1],
    [-20, -24, 0.7, 1.1, 0.3], [-28, -18, 1.0, 1.6, 0.1],
    // NE cluster
    [ 22, -18], [ 24, -22, 0.8, 1.2, -0.2], [ 20, -20, 1.0, 1.5, 0.15],
    [ 26, -24, 0.7, 1.1, 0.2], [ 28, -18, 1.1, 1.4, -0.1],
    // SW cluster
    [-22,  20], [-24,  22, 1.0, 1.3, 0.1], [-20,  24, 0.8, 1.6, -0.2],
    [-28,  22, 0.7, 1.1, 0.3], [-26,  18, 1.1, 1.5, -0.1],
    // SE cluster
    [ 22,  20], [ 24,  22, 0.9, 1.2, 0.2], [ 20,  24, 1.1, 1.5, -0.15],
    [ 28,  22, 0.7, 1.1, 0.1], [ 26,  18, 1.0, 1.4, -0.2],
    // Mid scattered
    [-8, -28, 0.8, 1.2], [8, -28, 1.0, 1.5, 0.2], [0, -32, 0.9, 1.3, -0.1],
    [-8,  28, 0.8, 1.2], [8,  28, 1.0, 1.5, 0.2], [0,  32, 0.9, 1.3,  0.1],
    [-32, -6], [ 32, -6, 0.9, 1.5, 0.1], [-32, 8, 1.1, 1.3], [32, 8],
  ];
  for (const [x, z, w, h, r] of stones) tombstone(x, z, w, h, r);

  // ── Inner iron fence corridors (funnel approaches to mausoleum) ──────────
  // N/S approach flanks
  wall(-14, -12, 0.3, 2.0, 10, 0x1e1e1e);
  wall( 14, -12, 0.3, 2.0, 10, 0x1e1e1e);
  wall(-14,  12, 0.3, 2.0, 10, 0x1e1e1e);
  wall( 14,  12, 0.3, 2.0, 10, 0x1e1e1e);
  // Short cross-stubs E/W of mausoleum doorways
  wall(-10, -2, 4, 2.0, 0.3, 0x1e1e1e);
  wall(-10,  2, 4, 2.0, 0.3, 0x1e1e1e);
  wall( 10, -2, 4, 2.0, 0.3, 0x1e1e1e);
  wall( 10,  2, 4, 2.0, 0.3, 0x1e1e1e);

  // ── Stone crypt fragments (L-walls in 4 mid-zones) ───────────────────────
  wall(-18, -20, 8, 3.5, 0.5, 0x2c2824);
  wall(-22, -17, 0.5, 3.5, 6,  0x2c2824);
  wall( 18, -20, 8, 3.5, 0.5, 0x2c2824);
  wall( 22, -17, 0.5, 3.5, 6,  0x2c2824);
  wall(-18,  20, 8, 3.5, 0.5, 0x2c2824);
  wall(-22,  17, 0.5, 3.5, 6,  0x2c2824);
  wall( 18,  20, 8, 3.5, 0.5, 0x2c2824);
  wall( 22,  17, 0.5, 3.5, 6,  0x2c2824);

  // ── Hedge dividers (E/W blocking walls with central gap) ─────────────────
  wall( 24, -7, 0.5, 2.2,  8, 0x162010);
  wall( 24,  7, 0.5, 2.2,  8, 0x162010);
  wall(-24, -7, 0.5, 2.2,  8, 0x162010);
  wall(-24,  7, 0.5, 2.2,  8, 0x162010);
  // N/S hedge rows with gap at centre (two halves each)
  wall( -9, -22, 8, 2.2, 0.5, 0x162010);
  wall(  9, -22, 8, 2.2, 0.5, 0x162010);
  wall( -9,  22, 8, 2.2, 0.5, 0x162010);
  wall(  9,  22, 8, 2.2, 0.5, 0x162010);

  // ── Mid-area tombstone rows (low barriers in open ground) ─────────────────
  for (const [tx, tz] of [
    [-4,-15],[0,-15],[4,-15], [-4,15],[0,15],[4,15],
    [-15,-4],[-15,0],[-15,4], [15,-4],[15,0],[15,4],
    [-8,-8],[8,8],[-8,8],[8,-8],
  ] as [number,number][]) tombstone(tx, tz, 0.9, 1.4);

  // ── Additional stone crypt walls (inner maze near mausoleum) ─────────────────
  // NW quadrant passage walls
  wall( -6, -8,  6, 3.0, 0.4, 0x2c2824);
  wall(-10, -6,  0.4, 3.0,  8, 0x2c2824);
  // NE quadrant passage walls
  wall(  6, -8,  6, 3.0, 0.4, 0x2c2824);
  wall( 10, -6,  0.4, 3.0,  8, 0x2c2824);
  // SW quadrant passage walls
  wall( -6,  8,  6, 3.0, 0.4, 0x2c2824);
  wall(-10,  6,  0.4, 3.0,  8, 0x2c2824);
  // SE quadrant passage walls
  wall(  6,  8,  6, 3.0, 0.4, 0x2c2824);
  wall( 10,  6,  0.4, 3.0,  8, 0x2c2824);

  // ── Outer broken ring walls ───────────────────────────────────────────────────
  wall(-28,   0, 0.4, 3.0, 12, 0x2a2420);
  wall( 28,   0, 0.4, 3.0, 12, 0x2a2420);
  wall(  0, -28, 12,  3.0, 0.4, 0x2a2420);
  wall(  0,  28, 12,  3.0, 0.4, 0x2a2420);
  wall(-28, -10, 0.4, 3.0,  8, 0x2a2420);
  wall(-28,  10, 0.4, 3.0,  8, 0x2a2420);
  wall( 28, -10, 0.4, 3.0,  8, 0x2a2420);
  wall( 28,  10, 0.4, 3.0,  8, 0x2a2420);

  // ── Extra low tomb slabs (mid-map barriers) ────────────────────────────────────
  for (const [tx, tz, tr] of [
    [ -5,-20, 0.10], [  5,-20,-0.10], [ -5, 20, 0.20], [  5, 20,-0.20],
    [-20, -5, 0.00], [-20,  5, 0.15], [ 20, -5, 0.00], [ 20,  5,-0.10],
    [ -2,-10, 0.05], [  2, 10,-0.05], [-10,  2, 0.10], [ 10, -2,-0.10],
  ] as [number,number,number][]) tombstone(tx, tz, 1.1, 0.7, tr);

  // ── Dead trees ────────────────────────────────────────────────────────────
  deadTree(-12, -10, 7);
  deadTree( 12,  10, 8);
  deadTree(-10,  12, 6.5);
  deadTree( 10, -12, 7.5);
  deadTree(-30, -10, 8);
  deadTree( 30,  10, 7);
  deadTree(-10,  30, 8);
  deadTree( 10, -30, 7);

  // ── Lanterns (atmosphere) ─────────────────────────────────────────────────
  lantern(-16,  -2);
  lantern( 16,   2);
  lantern( -2,  16);
  lantern(  2, -16);
  lantern(-28,  28, 1.8);
  lantern( 28, -28, 1.8);
  lantern(-20, -20, 1.6);
  lantern( 20,  20, 1.6);

  // ── Teleporters (dim cryptic pads) ────────────────────────────────────────
  function addTp(x: number, z: number, dx: number, dz: number): Teleporter {
    const pad = add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16),
      new THREE.MeshLambertMaterial({ color: 0x440066, emissive: new THREE.Color(0x220033) }),
    ));
    pad.position.set(x, 0.08, z);
    const ring = add(new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x9922ff }),
    ));
    ring.position.set(x, 0.15, z);
    ring.rotation.x = Math.PI / 2;
    add(new THREE.PointLight(0x6600cc, 0.8, 4)).position.set(x, 0.8, z);
    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = add(new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
    ));
    sprite.position.set(x, 1.6, z);
    sprite.scale.set(1.2, 1.2, 1);
    sprite.visible = false;
    const tp: Teleporter = {
      trigger: new THREE.Box3(
        new THREE.Vector3(x - 0.7, 0, z - 0.7),
        new THREE.Vector3(x + 0.7, 0.5, z + 0.7),
      ),
      destination: new THREE.Vector3(dx, 1, dz),
      cooldown: 0, sprite, texture, canvas,
    };
    teleporters.push(tp);
    return tp;
  }

  const tp1 = addTp(-33, -33,  33,  33);
  const tp2 = addTp( 33,  33, -33, -33);
  tp1.link = tp2; tp2.link = tp1;
  const tp3 = addTp( 33, -33, -33,  33);
  const tp4 = addTp(-33,  33,  33, -33);
  tp3.link = tp4; tp4.link = tp3;

  return {
    colliders, walls, teleporters,
    boundary: BOUNDARY,
    botBoundary: 30,
    gravity: -28,
    background: 0x04030a,
    dispose() {
      for (const o of _objs) {
        scene.remove(o);
        (o as THREE.Mesh).geometry?.dispose();
        ((o as THREE.Mesh).material as THREE.Material)?.dispose();
      }
    },
  };
}
