import * as THREE from "three";
import { MapResult, Teleporter } from "../testMap";
import { MovingCar } from "./movingCar";
import { Trampoline } from "./trampoline";

export function buildRetroCity(scene: THREE.Scene): MapResult {
  const colliders: THREE.Box3[] = [];
  const walls: THREE.Box3[] = [];
  const teleporters: Teleporter[] = [];
  const BOUNDARY = 34;

  const _objs: THREE.Object3D[] = [];
  function add<T extends THREE.Object3D>(o: T): T { scene.add(o); _objs.push(o); return o; }

  // ── Fog ─────────────────────────────────────────────────────────────────────
  scene.fog = new THREE.Fog(0x0a0a1a, 20, 80);

  // ── Ground ──────────────────────────────────────────────────────────────────
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(BOUNDARY * 2, BOUNDARY * 2),
    new THREE.MeshLambertMaterial({ color: 0x1a1a2e })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  add(ground);

  // ── Roads ───────────────────────────────────────────────────────────────────
  const roadMat  = new THREE.MeshBasicMaterial({ color: 0x333344 });
  const hwayMat  = new THREE.MeshBasicMaterial({ color: 0x222233 }); // slightly darker highway
  const lineMat  = new THREE.MeshBasicMaterial({ color: 0xffffaa });

  function addRoad(z: number, w: number, mat: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(BOUNDARY * 2, w), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.01, z);
    add(mesh);
  }
  function addRoadV(x: number, w: number, mat: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, BOUNDARY * 2), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.01, 0);
    add(mesh);
  }
  function addDashLine(x: number, z: number, len: number, horiz: boolean) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(horiz ? len : 0.15, horiz ? 0.15 : len), lineMat
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, z);
    add(mesh);
  }

  // Main cross roads (centre highway, 8 units wide)
  addRoad(0, 8, hwayMat);
  addRoadV(0, 8, hwayMat);
  // Centre divider dashes
  for (let i = -30; i <= 30; i += 5) addDashLine(i, 0, 3, true);
  for (let i = -30; i <= 30; i += 5) addDashLine(0, i, 3, false);

  // Side streets (4 units wide) at ±16 on each axis
  addRoad(-16, 4, roadMat);
  addRoad( 16, 4, roadMat);
  addRoadV(-16, 4, roadMat);
  addRoadV( 16, 4, roadMat);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function addBuilding(x: number, z: number, w: number, h: number, d: number, color: number) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color })
    );
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    add(mesh);
    // Roof as walkable platform collider
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, h - 0.05, z - d / 2),
      new THREE.Vector3(x + w / 2, h + 0.05, z + d / 2)
    ));
    // Sides as walls
    walls.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, 0, z - d / 2),
      new THREE.Vector3(x + w / 2, h, z + d / 2)
    ));
  }

  function addCar(x: number, z: number, rotY: number) {
    const group = new THREE.Group();
    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.7, 0.9),
      new THREE.MeshLambertMaterial({ color: 0x223355 })
    );
    body.position.y = 0.55;
    group.add(body);
    // Cabin
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.55, 0.85),
      new THREE.MeshLambertMaterial({ color: 0x334466 })
    );
    cabin.position.set(-0.1, 1.05, 0);
    group.add(cabin);
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    group.castShadow = true;
    add(group);
    // Collision box for the car
    const box = new THREE.Box3().setFromObject(group);
    walls.push(box);
  }

  function addTeleporter(
    x: number, y: number, z: number,
    destX: number, destY: number, destZ: number
  ): Teleporter {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16),
      new THREE.MeshLambertMaterial({ color: 0xff6600, emissive: new THREE.Color(0x883300) })
    );
    pad.position.set(x, y + 0.08, z);
    add(pad);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xff8800 })
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

  // ── Buildings (8 buildings, varying heights 5-15) ───────────────────────────
  addBuilding(-20,  -20, 6,  8, 6, 0x2a2a3e);
  addBuilding( 20,  -20, 5, 12, 5, 0x1e2a3a);
  addBuilding(-20,   20, 7, 15, 6, 0x2e1e2e);
  addBuilding( 20,   20, 6,  6, 7, 0x1a2e1a);
  addBuilding(-24,    0, 4,  9, 4, 0x2a1a1a);
  addBuilding( 24,    0, 5, 11, 5, 0x1a1a2e);
  addBuilding(  0,  -24, 8,  7, 5, 0x2e2e1e);
  addBuilding(  0,   24, 6, 10, 6, 0x1e2e2e);

  // ── Additional buildings (interior fill) ────────────────────────────────────
  addBuilding( -8,  -16, 4,  5, 4, 0x1e1e2e);
  addBuilding(  8,  -16, 4,  7, 4, 0x222233);
  addBuilding(-16,    8, 4,  6, 4, 0x1e2820);
  addBuilding( 16,   -8, 4,  8, 4, 0x20201e);

  // ── Scaffolding / billboard ledges (walkable mid-height platforms) ───────────
  // These are thin elevated boxes — not full buildings, just extra traversal
  function addLedge(x: number, h: number, z: number, w: number, d: number) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.3, d),
      new THREE.MeshLambertMaterial({ color: 0x2a2a44 })
    );
    mesh.position.set(x, h, z);
    mesh.castShadow = true;
    add(mesh);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, h - 0.15, z - d / 2),
      new THREE.Vector3(x + w / 2, h + 0.15, z + d / 2)
    ));
  }
  addLedge(-10,  4,   0, 3, 3);
  addLedge( 10,  5,   0, 3, 3);
  addLedge(  0,  4,  10, 3, 3);
  addLedge(  0,  5, -10, 3, 3);
  addLedge(-16,  5,  -8, 3, 3);
  addLedge( 16,  5,   8, 3, 3);
  addLedge( -8,  4,  16, 3, 3);
  addLedge(  8,  4, -16, 3, 3);
  // Mid-height cross-bridges between building clusters
  addLedge(-12,  6,  -4, 5, 2);
  addLedge( 12,  6,   4, 5, 2);
  addLedge( -4,  6,  12, 2, 5);
  addLedge(  4,  6, -12, 2, 5);

  // ── Parked cars (6 cars) ─────────────────────────────────────────────────────
  addCar(-11,  -4, 0);
  addCar(-11,   4, 0);
  addCar( 11,  -4, Math.PI);
  addCar( 11,   4, Math.PI);
  addCar( -4, -14, Math.PI / 2);
  addCar(  4,  14, Math.PI / 2);

  // ── Street lamps ─────────────────────────────────────────────────────────────
  const lampPositions = [[-14, -14], [14, -14], [-14, 14], [14, 14]];
  for (const [lx, lz] of lampPositions) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.07, 4, 6),
      new THREE.MeshLambertMaterial({ color: 0x444444 })
    );
    pole.position.set(lx, 2, lz);
    add(pole);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffaa })
    );
    lamp.position.set(lx, 4.2, lz);
    add(lamp);
    const light = new THREE.PointLight(0xffffaa, 0.8, 12);
    light.position.set(lx, 4, lz);
    add(light);
  }

  // ── Trampolines near tall buildings ──────────────────────────────────────────
  // Placed just outside the building wall so players can run to them and bounce up
  const hazards: Array<{ update(dt: number, entities: import("../types").Controllable[]): void }> = [];
  hazards.push(new Trampoline(scene, -20, 0, 15,   2.2, add, colliders)); // near h=15 (SW)
  hazards.push(new Trampoline(scene,  20, 0, -15,  2.2, add, colliders)); // near h=12 (NW)
  hazards.push(new Trampoline(scene,  19, 0,   0,  2.2, add, colliders)); // near h=11 (E)
  hazards.push(new Trampoline(scene, -19, 0,   0,  2.2, add, colliders)); // near h=9 (W)
  hazards.push(new Trampoline(scene,   0, 0,  19,  2.2, add, colliders)); // near h=10 (N)

  // ── Moving cars ──────────────────────────────────────────────────────────────
  // Main highway (z ≈ 0), two lanes
  hazards.push(new MovingCar("x", -30, -2.0, -30, 30,  1, 0xcc2222, add)); // red, W→E
  hazards.push(new MovingCar("x",  10,  2.0, -30, 30, -1, 0xccaa00, add)); // yellow, E→W staggered
  // Main highway (x ≈ 0), two lanes
  hazards.push(new MovingCar("z", -30, -2.0, -30, 30,  1, 0x2244cc, add)); // blue, S→N
  hazards.push(new MovingCar("z",   0,  2.0, -30, 30, -1, 0xaa22cc, add)); // purple, N→S
  // Side street z = -16
  hazards.push(new MovingCar("x", -25, -16.8, -30, 30,  1, 0xff8800, add)); // orange
  hazards.push(new MovingCar("x",   5, -15.2, -30, 30, -1, 0x00aaff, add)); // cyan, staggered
  // Side street z = +16
  hazards.push(new MovingCar("x",  15,  16.8, -30, 30, -1, 0xff44aa, add)); // pink
  hazards.push(new MovingCar("x", -10,  15.2, -30, 30,  1, 0x88ff00, add)); // lime
  // Side street x = -16
  hazards.push(new MovingCar("z",  20, -16.8, -30, 30, -1, 0xffcc00, add)); // gold
  // Side street x = +16
  hazards.push(new MovingCar("z", -20,  16.8, -30, 30,  1, 0x00ffcc, add)); // teal

  // ── Elevated highway overpass ────────────────────────────────────────────────
  // A raised road deck runs diagonally across the map (NW-SE), supported by pillars.
  // Players can walk on top and cars drive across it.
  const OVER_Y = 5.5; // road surface height
  const OVER_W = 4.0; // road width
  const OVER_T = 0.5; // deck thickness

  // Deck segments (straight run from x=-28 to x=28 at z=8)
  {
    const deck = add(new THREE.Mesh(
      new THREE.BoxGeometry(56, OVER_T, OVER_W),
      new THREE.MeshLambertMaterial({ color: 0x2a2a3a }),
    ));
    deck.position.set(0, OVER_Y, 8);
    deck.castShadow = true;
    deck.receiveShadow = true;
    colliders.push(new THREE.Box3(
      new THREE.Vector3(-28, OVER_Y, 8 - OVER_W / 2),
      new THREE.Vector3( 28, OVER_Y + OVER_T, 8 + OVER_W / 2),
    ));
    walls.push(new THREE.Box3(
      new THREE.Vector3(-28, 0, 8 - OVER_W / 2 - 0.3),
      new THREE.Vector3( 28, OVER_Y, 8 + OVER_W / 2 + 0.3),
    ));
  }
  // Guardrails (visual only)
  for (const side of [-1, 1]) {
    const rail = add(new THREE.Mesh(
      new THREE.BoxGeometry(56, 0.6, 0.15),
      new THREE.MeshLambertMaterial({ color: 0x555566 }),
    ));
    rail.position.set(0, OVER_Y + OVER_T / 2 + 0.3, 8 + side * (OVER_W / 2));
  }
  // Support pillars every 8 units
  for (let px = -24; px <= 24; px += 8) {
    const pillar = add(new THREE.Mesh(
      new THREE.BoxGeometry(0.8, OVER_Y, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x333344 }),
    ));
    pillar.position.set(px, OVER_Y / 2, 8);
    walls.push(new THREE.Box3().setFromObject(pillar));
  }
  // On-ramp from ground (z=16 side) — sloped platform stub
  {
    const rampW = 3;
    for (let i = 0; i < 5; i++) {
      const rY = (i / 4) * OVER_Y + OVER_T / 2;
      const rampSeg = add(new THREE.Mesh(
        new THREE.BoxGeometry(rampW, 0.3, 1.4),
        new THREE.MeshLambertMaterial({ color: 0x2a2a3a }),
      ));
      const rZ = 8 + OVER_W / 2 + 1 + i * 1.4;
      rampSeg.position.set(-26 + i * 0.5, rY, rZ);
      colliders.push(new THREE.Box3(
        new THREE.Vector3(-26 + i * 0.5 - rampW / 2, rY - 0.15, rZ - 0.7),
        new THREE.Vector3(-26 + i * 0.5 + rampW / 2, rY + 0.15, rZ + 0.7),
      ));
    }
  }
  // Car on the overpass (yOffset lifts it to road surface)
  hazards.push(new MovingCar("x", -28, 8, -28, 28, 1, 0xff2288, add, OVER_Y + OVER_T / 2));

  // ── Teleporters (3 pairs, orange) ───────────────────────────────────────────
  // Pad y must equal the building height so the trigger box starts at roof surface
  // where player feet (position.y == roof collider top ≈ h+0.05) can enter it.

  // Pair 1: Ground center <-> top of tallest building (h=15)
  const tp1a = addTeleporter(  0,  0,    0,  -20, 15.5,  20);
  const tp1b = addTeleporter(-20, 15,   20,    0,  1.5,   0);
  tp1a.link = tp1b; tp1b.link = tp1a;

  // Pair 2: Left building top (h=9) <-> right building top (h=11)
  const tp2a = addTeleporter(-24,  9,  0,  24, 11.5,  0);
  const tp2b = addTeleporter( 24, 11,  0, -24,  9.5,  0);
  tp2a.link = tp2b; tp2b.link = tp2a;

  // Pair 3: South building top (h=7) <-> North building top (h=10)
  const tp3a = addTeleporter(  0,  7, -24,   0, 10.5, 24);
  const tp3b = addTeleporter(  0, 10,  24,   0,  7.5,-24);
  tp3a.link = tp3b; tp3b.link = tp3a;

  return {
    colliders,
    walls,
    teleporters,
    hazards,
    boundary: BOUNDARY,
    gravity: -28,
    background: 0x0a0a1a,
    dispose: () => {
      scene.fog = null;
      _objs.forEach(o => scene.remove(o));
    },
  };
}
