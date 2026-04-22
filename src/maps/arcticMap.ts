import * as THREE from "three";
import { MapResult, Teleporter } from "../testMap";

const BOUNDARY = 62;

export function buildArcticMap(scene: THREE.Scene): MapResult {
  const colliders: THREE.Box3[] = [];
  const walls:     THREE.Box3[] = [];
  const teleporters: Teleporter[] = [];

  const _objs: THREE.Object3D[] = [];
  function add<T extends THREE.Object3D>(o: T): T { scene.add(o); _objs.push(o); return o; }

  scene.fog = new THREE.Fog(0xc8dff0, 70, 190);

  // Ground — packed snow
  const ground = add(new THREE.Mesh(
    new THREE.PlaneGeometry(BOUNDARY * 2, BOUNDARY * 2),
    new THREE.MeshLambertMaterial({ color: 0xddeef8 }),
  ));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;

  // Frozen lake — central shiny disc, purely visual
  const lake = add(new THREE.Mesh(
    new THREE.CylinderGeometry(18, 18, 0.04, 48),
    new THREE.MeshLambertMaterial({ color: 0x9fcce0, transparent: true, opacity: 0.7 }),
  ));
  lake.position.y = 0.02;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function iceBlock(x: number, z: number, w: number, h: number, d: number) {
    const mesh = add(new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: 0x88bbd4, transparent: true, opacity: 0.88 }),
    ));
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    walls.push(new THREE.Box3().setFromObject(mesh));
  }

  /** Walkable ice floe: wall sides + top collider. */
  function addIcePlatform(x: number, z: number, w: number, d: number, h: number) {
    const side = add(new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: 0x70aac8 }),
    ));
    side.position.set(x, h / 2, z);
    side.castShadow = true;
    walls.push(new THREE.Box3().setFromObject(side));
    const top = add(new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.35, d),
      new THREE.MeshLambertMaterial({ color: 0xbce0f0 }),
    ));
    top.position.set(x, h + 0.175, z);
    top.receiveShadow = true;
    colliders.push(new THREE.Box3().setFromObject(top));
  }

  /** Cluster of 3-4 ice spires. */
  function addCluster(cx: number, cz: number, count: number, spread: number) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = spread * (0.4 + Math.random() * 0.6);
      const x = cx + Math.cos(angle) * r;
      const z = cz + Math.sin(angle) * r;
      const w = 1.2 + Math.random() * 1.4;
      const d = 1.0 + Math.random() * 1.2;
      const h = 2.5 + Math.random() * 2.5;
      iceBlock(x, z, w, h, d);
    }
    // Central tall spire
    iceBlock(cx, cz, 1.4, 5 + Math.random() * 2, 1.4);
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

  // ── Ice platforms (elevated floes) ────────────────────────────────────────
  addIcePlatform(-34, -30, 14, 12, 4);   // NW
  addIcePlatform( 32, -32, 12, 11, 3.5); // NE
  addIcePlatform(-32,  30, 11, 13, 3.5); // SW
  addIcePlatform( 34,  28, 13, 11, 4);   // SE
  addIcePlatform(  0, -36, 10,  8, 3);   // N mid
  addIcePlatform(  0,  36,  8, 10, 3);   // S mid

  // ── Ice spire clusters ────────────────────────────────────────────────────
  // Ring clusters around frozen lake
  addCluster(-22,   0, 4, 3);
  addCluster( 22,   0, 4, 3);
  addCluster(  0, -22, 4, 3);
  addCluster(  0,  22, 4, 3);
  // Diagonal clusters
  addCluster(-16, -16, 3, 2.5);
  addCluster( 16,  16, 3, 2.5);
  addCluster(-16,  16, 3, 2.5);
  addCluster( 16, -16, 3, 2.5);
  // Outer clusters
  addCluster(-46,   8, 4, 3.5);
  addCluster( 46,  -8, 4, 3.5);
  addCluster(  8, -46, 4, 3.5);
  addCluster( -8,  46, 4, 3.5);
  addCluster(-46, -30, 3, 2.5);
  addCluster( 46,  30, 3, 2.5);
  addCluster(-30,  46, 3, 2.5);
  addCluster( 30, -46, 3, 2.5);

  // ── Scattered lone ice pillars ────────────────────────────────────────────
  const pillars: [number, number][] = [
    [-8, 0], [8, 0], [0, -8], [0, 8],
    [-42, 0], [42, 0], [0, -42], [0, 42],
    [-28, -50], [28, 50], [-50, 28], [50, -28],
  ];
  for (const [px, pz] of pillars) {
    iceBlock(px, pz, 1.2, 4.5, 1.2);
  }

  // ── Long ice walls (open corridors between them) ──────────────────────────
  iceBlock(-42, -12, 1.5, 3, 18);  // N-S wall west
  iceBlock( 42,  12, 1.5, 3, 18);  // N-S wall east
  iceBlock(-12, -42, 18,  3, 1.5); // E-W wall north
  iceBlock( 12,  42, 18,  3, 1.5); // E-W wall south

  // ── Teleporters: corners ↔ opposite ice platforms ─────────────────────────
  const tp1 = addTeleporter(-56, -56,  34,  4.35,  28);
  const tp2 = addTeleporter( 56,  56, -34,  4.35, -30);
  tp1.link = tp2; tp2.link = tp1;
  const tp3 = addTeleporter( 56, -56, -32,  3.85,  30);
  const tp4 = addTeleporter(-56,  56,  32,  3.85, -32);
  tp3.link = tp4; tp4.link = tp3;

  // ── Cool blue-white light ─────────────────────────────────────────────────
  const sun = add(new THREE.DirectionalLight(0xccecff, 1.4));
  sun.position.set(-30, 60, -20);

  return {
    colliders, walls, teleporters,
    boundary: BOUNDARY,
    botBoundary: 52,
    gravity: -28,
    background: 0xa8cce0,
    dispose() {
      for (const o of _objs) {
        scene.remove(o);
        (o as THREE.Mesh).geometry?.dispose();
        ((o as THREE.Mesh).material as THREE.Material)?.dispose();
      }
    },
  };
}
