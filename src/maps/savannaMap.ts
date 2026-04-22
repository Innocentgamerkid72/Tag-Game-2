import * as THREE from "three";
import { MapResult, Teleporter } from "../testMap";

const BOUNDARY = 58;

export function buildSavannaMap(scene: THREE.Scene): MapResult {
  const colliders: THREE.Box3[] = [];
  const walls:     THREE.Box3[] = [];
  const teleporters: Teleporter[] = [];

  const _objs: THREE.Object3D[] = [];
  function add<T extends THREE.Object3D>(o: T): T { scene.add(o); _objs.push(o); return o; }

  scene.fog = new THREE.Fog(0xd4943a, 70, 180);

  // Ground
  const ground = add(new THREE.Mesh(
    new THREE.PlaneGeometry(BOUNDARY * 2, BOUNDARY * 2),
    new THREE.MeshLambertMaterial({ color: 0xc8a030 }),
  ));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;

  // Dry-grass texture overlay
  const overlay = add(new THREE.Mesh(
    new THREE.PlaneGeometry(BOUNDARY * 2, BOUNDARY * 2),
    new THREE.MeshBasicMaterial({ color: 0xd4aa44, transparent: true, opacity: 0.3 }),
  ));
  overlay.rotation.x = -Math.PI / 2;
  overlay.position.y = 0.01;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function rawBox(x: number, z: number, w: number, h: number, d: number, color: number, wall: boolean) {
    const mesh = add(new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color }),
    ));
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (wall) walls.push(new THREE.Box3().setFromObject(mesh));
    else      colliders.push(new THREE.Box3().setFromObject(mesh));
  }

  /** Flat-top mesa: wall sides + walkable collider on top. */
  function addMesa(x: number, z: number, w: number, d: number, h: number) {
    rawBox(x, z, w, h, d, 0x9a6618, true);
    // Thin top slab
    const top = add(new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.4, d),
      new THREE.MeshLambertMaterial({ color: 0xc88822 }),
    ));
    top.position.set(x, h + 0.2, z);
    top.receiveShadow = true;
    colliders.push(new THREE.Box3().setFromObject(top));
  }

  /** Low rock for cover. */
  function addRock(x: number, z: number, w: number, d: number, h: number) {
    rawBox(x, z, w, h, d, 0x7a6244, true);
  }

  /** Acacia-style tree: trunk + canopy. */
  function addTree(x: number, z: number) {
    const trunkH = 5.5;
    const trunk = add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.65, trunkH, 8),
      new THREE.MeshLambertMaterial({ color: 0x5a3810 }),
    ));
    trunk.position.set(x, trunkH / 2, z);
    trunk.castShadow = true;
    walls.push(new THREE.Box3(
      new THREE.Vector3(x - 0.7, 0, z - 0.7),
      new THREE.Vector3(x + 0.7, trunkH, z + 0.7),
    ));
    // Flat spreading canopy
    const canopy = add(new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 1.0, 1.2, 8),
      new THREE.MeshLambertMaterial({ color: 0x3a6a10 }),
    ));
    canopy.position.set(x, trunkH + 0.8, z);
    canopy.castShadow = true;
  }

  function addTeleporter(x: number, z: number, destX: number, destY: number, destZ: number): Teleporter {
    const pad = add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16),
      new THREE.MeshLambertMaterial({ color: 0x00eeff, emissive: new THREE.Color(0x006688) }),
    ));
    pad.position.set(x, 0.08, z);
    const ring = add(new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x00ffff }),
    ));
    ring.position.set(x, 0.15, z);
    ring.rotation.x = Math.PI / 2;
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
      destination: new THREE.Vector3(destX, destY, destZ),
      cooldown: 0, sprite, texture, canvas,
    };
    teleporters.push(tp);
    return tp;
  }

  // ── Mesas (4 corners) ─────────────────────────────────────────────────────
  addMesa(-32, -28,  14, 11, 5);   // NW mesa
  addMesa( 30, -30,  12, 10, 4.5); // NE mesa
  addMesa(-30,  28,  11, 13, 4.5); // SW mesa
  addMesa( 32,  26,  13, 10, 5);   // SE mesa

  // ── Central rock cluster ──────────────────────────────────────────────────
  addRock(  0, 0,  5, 10, 2.5);
  addRock(  0, 9, 10,  4, 2.5);
  addRock(  0,-9, 10,  4, 2.5);

  // ── Scattered low rocks ───────────────────────────────────────────────────
  const rockData: [number, number, number, number, number][] = [
    [-14,  10,  8,  4, 2.2], [ 14, -10,  8,  4, 2.2],
    [-10, -14,  4,  8, 2.0], [ 10,  14,  4,  8, 2.0],
    [-20,  -4,  6,  3, 1.8], [ 20,   4,  6,  3, 1.8],
    [  4,  18,  3,  7, 1.8], [ -4, -18,  3,  7, 1.8],
    [-42,   2,  4, 11, 2.5], [ 42,  -2,  4, 11, 2.5],
    [  2, -42, 11,  4, 2.5], [ -2,  42, 11,  4, 2.5],
    [-16,  38,  5,  3, 2.0], [ 16, -38,  5,  3, 2.0],
    [ 38, -16,  3,  5, 2.0], [-38,  16,  3,  5, 2.0],
  ];
  for (const [x, z, w, d, h] of rockData) addRock(x, z, w, d, h);

  // ── Acacia trees ──────────────────────────────────────────────────────────
  const trees: [number, number][] = [
    [ -7, -5], [  7,  5], [ -5,  7], [  5, -7],
    [-22,  18], [ 22, -18], [-20, -20], [ 20,  20],
    [-44,  12], [ 44, -12], [-12,  44], [ 12, -44],
    [-36,   6], [ 36,  -6], [  6,  36], [ -6, -36],
    [-50,  28], [ 50, -28], [-28,  50], [ 28, -50],
  ];
  for (const [tx, tz] of trees) addTree(tx, tz);

  // ── Teleporters: corners ↔ opposite mesas ─────────────────────────────────
  // tp1 (far NW corner) → SE mesa top; tp2 (far SE corner) → NW mesa top
  const tp1 = addTeleporter(-52, -52,  32,  5.6,  26);
  const tp2 = addTeleporter( 52,  52, -32,  5.6, -28);
  tp1.link = tp2; tp2.link = tp1;
  // tp3 (far NE corner) → SW mesa top; tp4 (far SW corner) → NE mesa top
  const tp3 = addTeleporter( 52, -52, -30,  5.1,  28);
  const tp4 = addTeleporter(-52,  52,  30,  5.1, -30);
  tp3.link = tp4; tp4.link = tp3;

  // ── Sun light ─────────────────────────────────────────────────────────────
  const sun = add(new THREE.DirectionalLight(0xffcc77, 1.6));
  sun.position.set(40, 60, 30);

  return {
    colliders, walls, teleporters,
    boundary: BOUNDARY,
    botBoundary: 48,
    gravity: -28,
    background: 0xd4882a,
    dispose() {
      for (const o of _objs) {
        scene.remove(o);
        (o as THREE.Mesh).geometry?.dispose();
        ((o as THREE.Mesh).material as THREE.Material)?.dispose();
      }
    },
  };
}
