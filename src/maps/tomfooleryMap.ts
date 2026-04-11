import * as THREE from "three";
import { MapResult, Teleporter } from "../testMap";
import { Controllable } from "../types";
import { MovingPlatform } from "./movingPlatform";
import { FallingPlatform } from "./fallingPlatform";

// ── Explosive Barrel ──────────────────────────────────────────────────────────
const BARREL_TRIGGER_RADIUS = 2.2;  // proximity that arms the barrel
const BARREL_EXPLODE_DELAY  = 0.6;  // seconds after being touched before boom
const BARREL_BLAST_RADIUS   = 6.0;
const BARREL_FORCE          = 38;
const BARREL_FORCE_Y        = 18;
const BARREL_RESPAWN        = 6.0;  // seconds until barrel resets

class ExplosiveBarrel {
  private readonly _mesh: THREE.Group;
  private readonly _light: THREE.PointLight;
  private readonly _pos: THREE.Vector3;
  private _fuse   = -1;   // >0 = counting down; -1 = idle
  private _dead   = false;
  private _respawn = 0;

  constructor(private readonly _scene: THREE.Scene, x: number, y: number, z: number,
              _add: (o: THREE.Object3D) => void) {
    this._pos = new THREE.Vector3(x, y, z);
    this._mesh = new THREE.Group();

    // Barrel body
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.9, 12),
      new THREE.MeshLambertMaterial({ color: 0x884400 }),
    );
    body.position.y = 0.45;
    this._mesh.add(body);

    // Warning stripe ring
    const stripe = new THREE.Mesh(
      new THREE.TorusGeometry(0.36, 0.055, 6, 16),
      new THREE.MeshBasicMaterial({ color: 0xffcc00 }),
    );
    stripe.position.y = 0.55;
    stripe.rotation.x = Math.PI / 2;
    this._mesh.add(stripe);

    // Skull top
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xcccccc }),
    );
    top.position.y = 1.0;
    this._mesh.add(top);

    // Warning light (off until fuse lit)
    this._light = new THREE.PointLight(0xff4400, 0, 8);
    this._light.position.y = 1.0;
    this._mesh.add(this._light);

    this._mesh.position.copy(this._pos);
    _add(this._mesh);
    _scene.add(this._mesh);
  }

  update(dt: number, entities: Controllable[]) {
    if (this._dead) {
      this._respawn -= dt;
      if (this._respawn <= 0) {
        this._dead = false;
        this._fuse = -1;
        this._mesh.visible = true;
        this._light.intensity = 0;
      }
      return;
    }

    if (this._fuse < 0) {
      // Check if any entity is close enough to arm the barrel
      for (const e of entities) {
        if (e.isEliminated) continue;
        if (e.position.distanceTo(this._pos) < BARREL_TRIGGER_RADIUS) {
          this._fuse = BARREL_EXPLODE_DELAY;
          break;
        }
      }
    } else {
      this._fuse -= dt;
      // Pulse the warning light while the fuse burns
      this._light.intensity = 4 + Math.sin(this._fuse * 30) * 3;

      if (this._fuse <= 0) {
        this._explode(entities);
      }
    }
  }

  private _explode(entities: Controllable[]) {
    // Knockback all nearby entities
    for (const e of entities) {
      if (e.isEliminated) continue;
      const dist = e.position.distanceTo(this._pos);
      if (dist > BARREL_BLAST_RADIUS) continue;
      const falloff = 1 - dist / BARREL_BLAST_RADIUS;
      const push = new THREE.Vector3(
        e.position.x - this._pos.x, 0, e.position.z - this._pos.z,
      );
      if (push.length() > 0.01) push.normalize();
      e.velocity.x    += push.x * BARREL_FORCE * falloff;
      e.velocity.z    += push.z * BARREL_FORCE * falloff;
      e.velocity.y     = Math.max(e.velocity.y, BARREL_FORCE_Y * falloff);
      e.knockbackTimer = 0.6;
      e.tagImmunity    = Math.max(e.tagImmunity, 0.6);
    }

    // Visual flash
    const flash = new THREE.PointLight(0xff8800, 14, 18);
    flash.position.copy(this._pos).y += 0.8;
    this._scene.add(flash);
    setTimeout(() => this._scene.remove(flash), 300);

    this._dead = true;
    this._respawn = BARREL_RESPAWN;
    this._mesh.visible = false;
    this._light.intensity = 0;
  }
}

export function buildTomfooleryMap(scene: THREE.Scene): MapResult {
  const colliders:        THREE.Box3[] = [];
  const walls:            THREE.Box3[] = [];
  const teleporters:      Teleporter[] = [];
  const movingPlatforms:  MovingPlatform[] = [];
  const fallingPlatforms: FallingPlatform[] = [];
  const hazards: Array<{ update(dt: number, entities: Controllable[]): void }> = [];

  const BOUNDARY = 100;

  const _objs: THREE.Object3D[] = [];
  function add<T extends THREE.Object3D>(o: T): T { scene.add(o); _objs.push(o); return o; }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function addPlatform(x: number, y: number, z: number, w: number, h: number, d: number, color: number) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color }),
    );
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    add(mesh);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, y,     z - d / 2),
      new THREE.Vector3(x + w / 2, y + h, z + d / 2),
    ));
  }

  function addWall(x: number, y: number, z: number, w: number, h: number, d: number, color: number) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color }),
    );
    mesh.position.set(x, y + h / 2, z);
    add(mesh);
    walls.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, y,     z - d / 2),
      new THREE.Vector3(x + w / 2, y + h, z + d / 2),
    ));
  }

  function addTeleporter(x: number, y: number, z: number, destX: number, destY: number, destZ: number): Teleporter {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16),
      new THREE.MeshLambertMaterial({ color: 0x00eeff, emissive: new THREE.Color(0x006688) }),
    );
    pad.position.set(x, y + 0.08, z);
    add(pad);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x00ffff }),
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
      destination: new THREE.Vector3(destX, destY, destZ),
      cooldown: 0, sprite, texture, canvas,
    };
    teleporters.push(tp);
    return tp;
  }

  function addBarrel(x: number, y: number, z: number) {
    hazards.push(new ExplosiveBarrel(scene, x, y, z, add));
  }

  // ── Main platform (40×40, top at y=1) ────────────────────────────────────────
  addPlatform(0, 0, 0, 40, 1, 40, 0x1e2d3a);

  // Raised center dais
  addPlatform(0, 1, 0, 10, 0.5, 10, 0x2a3e52);
  for (const [cx, cz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]] as [number,number][]) {
    addPlatform(cx, 1.5, cz, 2, 0.5, 2, 0x364f66);
  }

  // Edge walls on main platform
  const WC = 0x2e4255;
  addWall(-12, 1, -20, 10, 1.5, 0.4, WC); addWall(12, 1, -20, 10, 1.5, 0.4, WC);
  addWall(-12, 1,  20, 10, 1.5, 0.4, WC); addWall(12, 1,  20, 10, 1.5, 0.4, WC);
  addWall(-20, 1, -12, 0.4, 1.5, 10, WC); addWall(-20, 1, 12, 0.4, 1.5, 10, WC);
  addWall( 20, 1, -12, 0.4, 1.5, 10, WC); addWall( 20, 1, 12, 0.4, 1.5, 10, WC);

  // Barrels on main platform corners and edges
  for (const [bx, bz] of [[-8,0],[8,0],[0,-8],[0,8],[-12,12],[12,-12],[-12,-12],[12,12]] as [number,number][]) {
    addBarrel(bx, 1, bz);
  }

  // ── Ring 1: cardinal (±26) ────────────────────────────────────────────────────
  for (const [rx, rz] of [[-26,0],[26,0],[0,-26],[0,26]] as [number,number][]) {
    addPlatform(rx, 0, rz, 7, 1, 7, 0x14202e);
    addBarrel(rx, 1, rz);
  }
  // Ring 1: diagonal (±23, ±23)
  for (const [rx, rz] of [[23,23],[-23,23],[23,-23],[-23,-23]] as [number,number][]) {
    addPlatform(rx, 0, rz, 6, 1, 6, 0x121c28);
  }

  // Teleporters Ring 1 cardinal pairs
  const [tp1, tp2] = [addTeleporter(-26,1,0, 26,1.1,0), addTeleporter(26,1,0, -26,1.1,0)];
  tp1.link = tp2; tp2.link = tp1;
  const [tp3, tp4] = [addTeleporter(0,1,-26, 0,1.1,26), addTeleporter(0,1,26, 0,1.1,-26)];
  tp3.link = tp4; tp4.link = tp3;

  // ── Ring 2: cardinal (±44) ────────────────────────────────────────────────────
  for (const [rx, rz] of [[-44,0],[44,0],[0,-44],[0,44]] as [number,number][]) {
    addPlatform(rx, 0, rz, 7, 1, 7, 0x0e1720);
    addBarrel(rx, 1, rz);
  }
  // Ring 2: diagonal (±37, ±37)
  for (const [rx, rz] of [[37,37],[-37,37],[37,-37],[-37,-37]] as [number,number][]) {
    addPlatform(rx, 0, rz, 6, 1, 6, 0x10181f);
  }
  // Ring 2: mid-cardinal side pads
  for (const [rx, rz] of [[-44,16],[-44,-16],[44,16],[44,-16],[16,-44],[-16,-44],[16,44],[-16,44]] as [number,number][]) {
    addPlatform(rx, 0, rz, 4, 1, 4, 0x0f1820);
  }

  // Teleporters Ring 2 cardinal pairs
  const [tp5, tp6] = [addTeleporter(-44,1,0, 44,1.1,0), addTeleporter(44,1,0, -44,1.1,0)];
  tp5.link = tp6; tp6.link = tp5;
  const [tp7, tp8] = [addTeleporter(0,1,-44, 0,1.1,44), addTeleporter(0,1,44, 0,1.1,-44)];
  tp7.link = tp8; tp8.link = tp7;

  // ── Ring 3: cardinal (±62) ────────────────────────────────────────────────────
  for (const [rx, rz] of [[-62,0],[62,0],[0,-62],[0,62]] as [number,number][]) {
    addPlatform(rx, 0, rz, 8, 1, 8, 0x0b1219);
    addBarrel(rx, 1, rz);
  }
  // Ring 3: diagonal (±52, ±52)
  for (const [rx, rz] of [[52,52],[-52,52],[52,-52],[-52,-52]] as [number,number][]) {
    addPlatform(rx, 0, rz, 6, 1, 6, 0x0d151e);
  }
  // Ring 3: mid-cardinal side pads
  for (const [rx, rz] of [[-62,20],[-62,-20],[62,20],[62,-20],[20,-62],[-20,-62],[20,62],[-20,62]] as [number,number][]) {
    addPlatform(rx, 0, rz, 5, 1, 5, 0x0c1318);
  }

  // Teleporters Ring 3 cardinal pairs
  const [tp9, tp10] = [addTeleporter(-62,1,0, 62,1.1,0), addTeleporter(62,1,0, -62,1.1,0)];
  tp9.link = tp10; tp10.link = tp9;
  const [tp11, tp12] = [addTeleporter(0,1,-62, 0,1.1,62), addTeleporter(0,1,62, 0,1.1,-62)];
  tp11.link = tp12; tp12.link = tp11;

  // ── Ring 4: cardinal (±80) ────────────────────────────────────────────────────
  for (const [rx, rz] of [[-80,0],[80,0],[0,-80],[0,80]] as [number,number][]) {
    addPlatform(rx, 0, rz, 9, 1, 9, 0x09101a);
    addBarrel(rx, 1, rz);
  }
  // Ring 4: diagonal (±68, ±68)
  for (const [rx, rz] of [[68,68],[-68,68],[68,-68],[-68,-68]] as [number,number][]) {
    addPlatform(rx, 0, rz, 7, 1, 7, 0x0a1218);
  }
  // Ring 4: mid-cardinal side pads
  for (const [rx, rz] of [[-80,24],[-80,-24],[80,24],[80,-24],[24,-80],[-24,-80],[24,80],[-24,80]] as [number,number][]) {
    addPlatform(rx, 0, rz, 5, 1, 5, 0x09111a);
  }
  // Ring 4: extra corner pads to make outer ring feel connected
  for (const [rx, rz] of [[80,28],[-80,28],[80,-28],[-80,-28],[28,80],[-28,80],[28,-80],[-28,-80]] as [number,number][]) {
    addPlatform(rx, 0, rz, 4, 1, 4, 0x090f18);
  }

  // Teleporters Ring 4 — wrap back to center
  const [tp13, tp14] = [addTeleporter(-80,1,0, 0,1.1,0), addTeleporter(80,1,0, 0,1.1,0)];
  tp13.link = tp14; tp14.link = tp13;
  const [tp15, tp16] = [addTeleporter(0,1,-80, 0,1.1,0), addTeleporter(0,1,80, 0,1.1,0)];
  tp15.link = tp16; tp16.link = tp15;

  // ── Sky tier: central pillar + top ───────────────────────────────────────────
  addPlatform(0, 1.5, 0, 2, 10, 2, 0x253848);
  addPlatform(0, 11.5, 0, 12, 0.5, 12, 0x1a3050);
  addBarrel(4, 12, 4); addBarrel(-4, 12, 4); addBarrel(4, 12, -4); addBarrel(-4, 12, -4);

  // Sky tier: mid-ring (y=6)
  for (const [dx, dz] of [[20,0],[-20,0],[0,20],[0,-20]] as [number,number][]) {
    addPlatform(dx, 6, dz, 5, 0.4, 5, 0x2a3555);
    addBarrel(dx, 6.4, dz);
  }
  // Sky tier: high diagonals (y=12)
  for (const [dx, dz] of [[15,15],[-15,15],[15,-15],[-15,-15]] as [number,number][]) {
    addPlatform(dx, 12, dz, 4.5, 0.4, 4.5, 0x1e2840);
  }
  // Sky tier: outer elevated pads (y=5)
  for (const [dx, dz] of [[30,0],[-30,0],[0,30],[0,-30]] as [number,number][]) {
    addPlatform(dx, 5, dz, 4, 0.4, 4, 0x1a2a3a);
  }
  // Sky tier: upper outer ring (y=9)
  for (const [dx, dz] of [[22,22],[-22,22],[22,-22],[-22,-22]] as [number,number][]) {
    addPlatform(dx, 9, dz, 4, 0.4, 4, 0x1c2d40);
  }
  // Sky tier: very high platforms (y=16)
  for (const [dx, dz] of [[8,0],[-8,0],[0,8],[0,-8]] as [number,number][]) {
    addPlatform(dx, 16, dz, 3.5, 0.4, 3.5, 0x182538);
    addBarrel(dx, 16.4, dz);
  }
  // Sky tier: apex pad (y=20)
  addPlatform(0, 20, 0, 6, 0.4, 6, 0x1a2a40);
  addBarrel(2, 20.4, 2); addBarrel(-2, 20.4, -2);

  // ── Moving platforms ──────────────────────────────────────────────────────────
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-14, 7, 0), new THREE.Vector3(14, 7, 0),
    5, 0.4, 5, 0x2255aa, 4, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(0, 5.5, -14), new THREE.Vector3(0, 5.5, 14),
    4, 0.4, 4, 0x225533, 6, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(24, 1, 0), new THREE.Vector3(24, 10, 0),
    4, 0.4, 4, 0x553322, 3, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-24, 1, 0), new THREE.Vector3(-24, 10, 0),
    4, 0.4, 4, 0x553322, 3.5, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-16, 11, 10), new THREE.Vector3(16, 11, 10),
    4, 0.4, 4, 0x334466, 5, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(0, 4, -36), new THREE.Vector3(0, 4, 36),
    5, 0.4, 5, 0x1e3344, 9, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-26, 3, -26), new THREE.Vector3(26, 3, 26),
    4, 0.4, 4, 0x223322, 7, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-44, 2, 0), new THREE.Vector3(-26, 2, 0),
    4, 0.4, 4, 0x334422, 5, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(26, 2, 0), new THREE.Vector3(44, 2, 0),
    4, 0.4, 4, 0x334422, 5, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(0, 2, -44), new THREE.Vector3(0, 2, -26),
    4, 0.4, 4, 0x442233, 6, add, colliders,
  ));
  // New: Ring 3 ↔ Ring 4 bridges
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(62, 2, 0), new THREE.Vector3(80, 2, 0),
    4, 0.4, 4, 0x334433, 6, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-80, 2, 0), new THREE.Vector3(-62, 2, 0),
    4, 0.4, 4, 0x334433, 6, add, colliders,
  ));
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(0, 2, 62), new THREE.Vector3(0, 2, 80),
    4, 0.4, 4, 0x334433, 7, add, colliders,
  ));
  // New: diagonal diagonal sky cross (y=14)
  movingPlatforms.push(new MovingPlatform(
    new THREE.Vector3(-20, 14, -20), new THREE.Vector3(20, 14, 20),
    4, 0.4, 4, 0x2244aa, 8, add, colliders,
  ));

  // ── Falling platforms (gap bridges) ──────────────────────────────────────────
  const fpC  = 0x3a2e1e;
  const fpC2 = 0x2a2030;
  const fpC3 = 0x1e1a28;
  const fpC4 = 0x141020;
  const fpS  = 3;
  const fpH  = 0.4;
  const gY   = 1;

  // Main → Ring 1 cardinal
  for (const [fx, fz] of [[21,0],[-21,0],[0,21],[0,-21]] as [number,number][]) {
    fallingPlatforms.push(new FallingPlatform(fx, gY, fz, fpS, fpH, fpS, fpC, add, colliders));
  }
  // Main corners → Ring 1 diagonal
  for (const [fx, fz] of [[14,14],[-14,14],[14,-14],[-14,-14]] as [number,number][]) {
    fallingPlatforms.push(new FallingPlatform(fx, gY, fz, fpS, fpH, fpS, fpC, add, colliders));
  }
  // Ring 1 diagonal stepping stones
  for (const [fx, fz] of [[20,20],[-20,20],[20,-20],[-20,-20]] as [number,number][]) {
    fallingPlatforms.push(new FallingPlatform(fx, gY, fz, fpS, fpH, fpS, fpC, add, colliders));
  }
  // Ring 1 → Ring 2 cardinal
  for (const [fx, fz] of [[35,0],[-35,0],[0,35],[0,-35]] as [number,number][]) {
    fallingPlatforms.push(new FallingPlatform(fx, gY, fz, fpS, fpH, fpS, fpC2, add, colliders));
  }
  // Ring 1 → Ring 2 diagonal
  for (const [fx, fz] of [[30,30],[-30,30],[30,-30],[-30,-30]] as [number,number][]) {
    fallingPlatforms.push(new FallingPlatform(fx, gY, fz, fpS, fpH, fpS, fpC2, add, colliders));
  }
  // Ring 2 → Ring 3 cardinal
  for (const [fx, fz] of [[52,0],[-52,0],[0,52],[0,-52]] as [number,number][]) {
    fallingPlatforms.push(new FallingPlatform(fx, gY, fz, fpS, fpH, fpS, fpC3, add, colliders));
  }
  // Ring 2 → Ring 3 diagonal
  for (const [fx, fz] of [[44,44],[-44,44],[44,-44],[-44,-44]] as [number,number][]) {
    fallingPlatforms.push(new FallingPlatform(fx, gY, fz, fpS, fpH, fpS, fpC3, add, colliders));
  }
  // Ring 3 → Ring 4 cardinal
  for (const [fx, fz] of [[70,0],[-70,0],[0,70],[0,-70]] as [number,number][]) {
    fallingPlatforms.push(new FallingPlatform(fx, gY, fz, fpS, fpH, fpS, fpC4, add, colliders));
  }
  // Ring 3 → Ring 4 diagonal
  for (const [fx, fz] of [[60,60],[-60,60],[60,-60],[-60,-60]] as [number,number][]) {
    fallingPlatforms.push(new FallingPlatform(fx, gY, fz, fpS, fpH, fpS, fpC4, add, colliders));
  }

  // ── Coloured point lights ─────────────────────────────────────────────────────
  const lightDefs: [number, number, number, number][] = [
    [-8, 6, 8, 0x4466ff], [8, 6, 8, 0xff4466],
    [-8, 6, -8, 0x44ff88], [8, 6, -8, 0xffaa22],
    [0, 14, 0, 0x88aaff], [0, 22, 0, 0xffffff],
    [28, 5, 0, 0xff6633], [-28, 5, 0, 0x33aaff],
    [0, 5, 28, 0x44ff88], [0, 5, -28, 0xff44aa],
    [46, 3, 0, 0xffcc00], [-46, 3, 0, 0x00ccff],
    [0, 3, 46, 0xcc44ff], [0, 3, -46, 0x44ffcc],
    [65, 3, 0, 0xff4400], [-65, 3, 0, 0x0088ff],
    [0, 3, 65, 0x44ff44], [82, 3, 0, 0xffaa00],
  ];
  for (const [lx, lz, ly, col] of lightDefs) {
    const light = new THREE.PointLight(col, 1.5, 30);
    light.position.set(lx, ly, lz);
    add(light);
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 6, 6),
      new THREE.MeshBasicMaterial({ color: col }),
    );
    orb.position.set(lx, ly, lz);
    add(orb);
  }

  // ── Star field ────────────────────────────────────────────────────────────────
  const starMat = new THREE.MeshBasicMaterial({ color: 0x8899cc });
  for (let i = 0; i < 450; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), starMat);
    const angle  = Math.random() * Math.PI * 2;
    const radius = 40 + Math.random() * 180;
    s.position.set(
      Math.cos(angle) * radius,
      -(2 + Math.random() * 80),
      Math.sin(angle) * radius,
    );
    add(s);
  }

  return {
    colliders, walls, teleporters, movingPlatforms, fallingPlatforms, hazards,
    boundary:    BOUNDARY,
    botBoundary: 16,
    spawnPos:    new THREE.Vector3(0, 3.0, 0),
    botSpawnY:   2.5,
    gravity:     -28,
    background:  0x000510,
    groundY:     -200,
    fallDeathY:  -10,
    voidBoundary: 85,
    dispose: () => _objs.forEach(o => scene.remove(o)),
  };
}
