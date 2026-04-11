import * as THREE from "three";
import { Controllable } from "./types";

// ── Per-weapon config ─────────────────────────────────────────────────────────
export type WeaponType = "rocket" | "freeze" | "shotgun" | "sword";

interface WeaponDef {
  name:        string;
  color:       number;
  lightColor:  number;
  size:        number;
  speed:       number;
  cooldown:    number;
  life:        number;
  gravity:     number;   // 0 = straight, negative = falls
  hitForce:    number;
  hitForceY:   number;
  splashRadius:number;   // 0 = single target only
  freezeSec:   number;   // 0 = no freeze
  pellets:     number;   // >1 = shotgun spread
  spread:      number;   // radians half-angle
}

export const DEFS: Record<WeaponType, WeaponDef> = {
  rocket: {
    name: "Rocket", color: 0xff2200, lightColor: 0xff4400,
    size: 0.38, speed: 20, cooldown: 1.4, life: 4.0,
    gravity: -18, hitForce: 34, hitForceY: 22,
    splashRadius: 9, freezeSec: 0, pellets: 1, spread: 0,
  },
  freeze: {
    name: "Freeze Ray", color: 0x44aaff, lightColor: 0x66ccff,
    size: 0.5, speed: 26, cooldown: 0.9, life: 3.0,
    gravity: 0, hitForce: 0, hitForceY: 0,
    splashRadius: 0, freezeSec: 3.0, pellets: 1, spread: 0,
  },
  shotgun: {
    name: "Shotgun", color: 0xffee33, lightColor: 0xffdd00,
    size: 0.14, speed: 36, cooldown: 0.85, life: 0.6,
    gravity: 0, hitForce: 20, hitForceY: 6,
    splashRadius: 0, freezeSec: 0, pellets: 7, spread: 0.22,
  },
  // sword is handled separately — not a projectile weapon
  sword: {
    name: "Sword", color: 0xaaddff, lightColor: 0xcceeff,
    size: 0, speed: 0, cooldown: 0.7, life: 0,
    gravity: 0, hitForce: 0, hitForceY: 0,
    splashRadius: 0, freezeSec: 0, pellets: 0, spread: 0,
  },
};

export const WEAPON_ORDER: WeaponType[] = ["rocket", "freeze", "shotgun", "sword"];

// ── Explosion effect ──────────────────────────────────────────────────────────
class Explosion {
  private readonly _flash:     THREE.Mesh;
  private readonly _ring:      THREE.Mesh;
  private readonly _particles: THREE.Mesh[];
  private readonly _partVels:  THREE.Vector3[];
  private readonly _light:     THREE.PointLight;
  private _timer = 0;
  done = false;

  private static readonly DURATION = 0.55;

  constructor(private readonly _scene: THREE.Scene, center: THREE.Vector3) {
    // Central flash sphere — expands then fades
    this._flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 1 }),
    );
    this._flash.position.copy(center);
    _scene.add(this._flash);

    // Shockwave ring — expands outward
    this._ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.15, 6, 20),
      new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.85 }),
    );
    this._ring.position.copy(center);
    this._ring.rotation.x = Math.PI / 2;
    _scene.add(this._ring);

    // Debris particles
    this._particles = [];
    this._partVels  = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 1 }),
      );
      m.position.copy(center);
      _scene.add(m);
      this._particles.push(m);
      this._partVels.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          Math.random() * 1.5 + 0.5,
          (Math.random() - 0.5) * 2,
        ).normalize().multiplyScalar(4 + Math.random() * 8),
      );
    }

    // Bright point light that quickly dims
    this._light = new THREE.PointLight(0xff6600, 10, 16);
    this._light.position.copy(center);
    _scene.add(this._light);
  }

  update(dt: number) {
    if (this.done) return;
    this._timer += dt;
    const t = this._timer / Explosion.DURATION; // 0 → 1

    if (t >= 1) { this._remove(); return; }

    // Flash: blooms outward then collapses
    const flashScale = t < 0.3
      ? 1 + (t / 0.3) * 4
      : Math.max(0, 5 - ((t - 0.3) / 0.7) * 5);
    this._flash.scale.setScalar(flashScale);
    (this._flash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t * 1.6);

    // Ring: expands and fades
    const rs = 1 + t * 7;
    this._ring.scale.set(rs, rs, 1);
    (this._ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 - t * 1.5);

    // Light: sharp flash then gone by ~40% of duration
    this._light.intensity = 10 * Math.max(0, 1 - t * 2.5);

    // Debris: arc outward with gravity, fade in second half
    for (let i = 0; i < this._particles.length; i++) {
      this._partVels[i].y -= 22 * dt;
      this._particles[i].position.addScaledVector(this._partVels[i], dt);
      (this._particles[i].material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t * 1.8);
    }
  }

  private _remove() {
    this._scene.remove(this._flash, this._ring, this._light);
    for (const p of this._particles) this._scene.remove(p);
    this.done = true;
  }
}

// ── Single projectile ─────────────────────────────────────────────────────────
class Projectile {
  readonly mesh:  THREE.Mesh;
  private readonly _light: THREE.PointLight;
  private readonly _vel:   THREE.Vector3;
  private readonly _def:   WeaponDef;
  private _life: number;
  done = false;

  onExplode?: (center: THREE.Vector3) => void;

  constructor(
    private readonly _scene: THREE.Scene,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    def: WeaponDef,
  ) {
    this._def  = def;
    this._life = def.life;

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(def.size, 10, 10),
      new THREE.MeshBasicMaterial({ color: def.color }),
    );
    this.mesh.position.copy(origin);

    this._light = new THREE.PointLight(def.lightColor, 2.5, def.size * 28);
    this.mesh.add(this._light);

    _scene.add(this.mesh);
    this._vel = direction.clone().normalize().multiplyScalar(def.speed);
  }

  update(dt: number, shooter: Controllable, entities: Controllable[],
         freezeMap: Map<Controllable, number>,
         colliders: THREE.Box3[], walls: THREE.Box3[]) {
    if (this.done) return;

    this._life -= dt;
    if (this._life <= 0) { this._remove(); return; }

    // Gravity
    this._vel.y += this._def.gravity * dt;
    this.mesh.position.addScaledVector(this._vel, dt);

    const pos = this.mesh.position;

    // Geometry collision — cap at 0.25 so large-radius projectiles (freeze ray)
    // don't get destroyed by geometry they merely fly near
    const geoThreshold = Math.min(this._def.size, 0.25) + 0.05;
    for (const box of colliders) {
      if (box.distanceToPoint(pos) < geoThreshold) {
        if (this._def.splashRadius > 0) this._explode(pos, shooter, entities, freezeMap);
        else this._remove();
        return;
      }
    }
    for (const box of walls) {
      if (box.distanceToPoint(pos) < geoThreshold) {
        if (this._def.splashRadius > 0) this._explode(pos, shooter, entities, freezeMap);
        else this._remove();
        return;
      }
    }

    // Hit detection — use body centre (feet + 0.9) so projectiles at head height register
    const bodyCenter = (e: Controllable) =>
      new THREE.Vector3(e.position.x, e.position.y + 0.9, e.position.z);

    if (this._def.splashRadius > 0) {
      // Rocket: check if we've come close to ANY entity or the ground
      for (const e of entities) {
        if ((e as unknown) === (shooter as unknown) || e.isEliminated) continue;
        if (pos.distanceTo(bodyCenter(e)) < this._def.size + 0.6) {
          this._explode(pos, shooter, entities, freezeMap);
          return;
        }
      }
    } else {
      // Direct hit
      for (const e of entities) {
        if ((e as unknown) === (shooter as unknown) || e.isEliminated) continue;
        if (pos.distanceTo(bodyCenter(e)) > this._def.size + 0.5) continue;
        this._applyHit(e, pos, freezeMap);
        this._remove();
        return;
      }
    }
  }

  private _explode(
    center: THREE.Vector3,
    shooter: Controllable,
    entities: Controllable[],
    _freezeMap: Map<Controllable, number>,
  ) {
    for (const e of entities) {
      if ((e as unknown) === (shooter as unknown) || e.isEliminated) continue;
      const dist = center.distanceTo(e.position);
      if (dist > this._def.splashRadius) continue;
      const falloff = 1 - dist / this._def.splashRadius;
      const push = new THREE.Vector3(
        e.position.x - center.x, 0, e.position.z - center.z,
      );
      const len = push.length();
      if (len > 0) push.divideScalar(len);
      e.velocity.x     += push.x * this._def.hitForce * falloff;
      e.velocity.z     += push.z * this._def.hitForce * falloff;
      e.velocity.y      = Math.max(e.velocity.y, this._def.hitForceY * falloff);
      e.knockbackTimer  = 0.55;
      e.tagImmunity     = Math.max(e.tagImmunity, 0.55);
    }
    this.onExplode?.(center);
    this._remove();
  }

  private _applyHit(
    e: Controllable,
    center: THREE.Vector3,
    freezeMap: Map<Controllable, number>,
  ) {
    // Apply knockback first (works even if hitForce is 0)
    const push = new THREE.Vector3(
      e.position.x - center.x, 0, e.position.z - center.z,
    );
    const len = push.length();
    if (len > 0) push.divideScalar(len);
    if (this._def.hitForce > 0) {
      e.velocity.x    += push.x * this._def.hitForce;
      e.velocity.z    += push.z * this._def.hitForce;
      e.velocity.y     = Math.max(e.velocity.y, this._def.hitForceY);
      e.knockbackTimer = 0.55;
      e.tagImmunity    = Math.max(e.tagImmunity, 0.55);
    }
    // Then stun/freeze if applicable
    if (this._def.freezeSec > 0) {
      e.setFrozen(true);
      freezeMap.set(e, this._def.freezeSec);
    }
  }

  forceRemove(scene: THREE.Scene) { scene.remove(this.mesh); this.done = true; }

  private _remove() {
    this._scene.remove(this.mesh);
    this.done = true;
  }
}

// ── Sword swing ───────────────────────────────────────────────────────────────
const SWORD_RANGE      = 3.2;   // hit distance in front of player
const SWORD_ARC        = 1.4;   // half-angle of hit cone (radians ~80°)
const SWORD_FORCE      = 38;    // massive knockback
const SWORD_FORCE_Y    = 12;
const SWORD_SWING_TIME = 0.25;  // seconds the swing is active
const SWORD_PARRY_RADIUS = 4.0; // projectiles within this radius are destroyed

class SwordSwing {
  private mesh:  THREE.Group;
  private _light: THREE.PointLight;
  private _timer  = SWORD_SWING_TIME;
  done = false;

  constructor(
    private readonly _scene: THREE.Scene,
    origin: THREE.Vector3,
    private readonly _forward: THREE.Vector3,
  ) {
    // Blade: a glowing flat box
    this.mesh = new THREE.Group();
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 2.2),
      new THREE.MeshBasicMaterial({ color: 0xaaddff }),
    );
    blade.position.z = -1.1;           // extends forward from origin
    this.mesh.add(blade);

    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.12, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x88aacc }),
    );
    this.mesh.add(guard);

    this._light = new THREE.PointLight(0xaaddff, 4, 6);
    this.mesh.add(this._light);

    // Orient the group so -Z axis points forward
    this.mesh.position.copy(origin).addScaledVector(_forward, 0.4);
    this.mesh.lookAt(origin.clone().addScaledVector(_forward, -1));

    _scene.add(this.mesh);
  }

  get position() { return this.mesh.position; }

  update(dt: number, shooter: Controllable, entities: Controllable[],
         projectiles: Projectile[]) {
    if (this.done) return;
    this._timer -= dt;

    // Fade light as swing ends
    this._light.intensity = Math.max(0, (this._timer / SWORD_SWING_TIME) * 4);

    // Animate: rotate the sword group around Y during swing
    this.mesh.rotation.y += (Math.PI * 1.5) * dt / SWORD_SWING_TIME;

    // Hit entities in arc
    for (const e of entities) {
      if ((e as unknown) === (shooter as unknown) || e.isEliminated) continue;
      const toE = new THREE.Vector3(
        e.position.x - shooter.position.x,
        0,
        e.position.z - shooter.position.z,
      );
      const dist = toE.length();
      if (dist > SWORD_RANGE || dist < 0.01) continue;
      const angle = toE.normalize().angleTo(
        new THREE.Vector3(this._forward.x, 0, this._forward.z).normalize()
      );
      if (angle > SWORD_ARC) continue;

      e.velocity.x    += (toE.x / dist || 0) * SWORD_FORCE;
      e.velocity.z    += (toE.z / dist || 0) * SWORD_FORCE;
      e.velocity.y     = Math.max(e.velocity.y, SWORD_FORCE_Y);
      e.knockbackTimer = 0.7;
      e.tagImmunity    = Math.max(e.tagImmunity, 0.7);
    }

    // Parry: destroy any projectile within parry radius
    for (const p of projectiles) {
      if (p.done) continue;
      if (this.mesh.position.distanceTo(p.mesh.position) < SWORD_PARRY_RADIUS) {
        p.forceRemove(this._scene);
      }
    }

    if (this._timer <= 0) {
      this._scene.remove(this.mesh);
      this.done = true;
    }
  }
}

// ── Weapon system ─────────────────────────────────────────────────────────────
export class WeaponSystem {
  private _type:        WeaponType = "rocket";
  private _projectiles: Projectile[] = [];
  private _swings:      SwordSwing[] = [];
  private _explosions:  Explosion[] = [];
  private _cooldown     = 0;
  private _freezeMap:   Map<Controllable, number> = new Map();

  get type()    { return this._type; }
  get canFire() { return this._cooldown <= 0; }
  get def()     { return DEFS[this._type]; }

  setWeapon(t: WeaponType) { this._type = t; this._cooldown = 0; }

  /** Fire a specific weapon type without affecting current weapon or cooldown.
   *  Used by the admin panel to shoot from bot/player positions. */
  fireAs(scene: THREE.Scene, origin: THREE.Vector3, direction: THREE.Vector3,
         _shooter: Controllable, weaponType: WeaponType) {
    if (weaponType === "sword") return;
    const def = DEFS[weaponType];
    if (def.pellets === 1) {
      const p = new Projectile(scene, origin, direction, def);
      if (weaponType === "rocket") {
        p.onExplode = (center) => this._explosions.push(new Explosion(scene, center));
      }
      this._projectiles.push(p);
    } else {
      for (let i = 0; i < def.pellets; i++) {
        const angle = (Math.random() - 0.5) * 2 * def.spread;
        const axis  = new THREE.Vector3(
          Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5,
        ).normalize();
        const spreadDir = direction.clone().applyAxisAngle(axis, angle).normalize();
        this._projectiles.push(new Projectile(scene, origin, spreadDir, def));
      }
    }
  }

  fire(scene: THREE.Scene, origin: THREE.Vector3, direction: THREE.Vector3,
       _shooter: Controllable) {
    if (this._cooldown > 0) return;
    const def = DEFS[this._type];

    if (this._type === "sword") {
      this._swings.push(new SwordSwing(scene, origin, direction));
      this._cooldown = def.cooldown;
      return;
    }

    if (def.pellets === 1) {
      const p = new Projectile(scene, origin, direction, def);
      if (this._type === "rocket") {
        p.onExplode = (center) => this._explosions.push(new Explosion(scene, center));
      }
      this._projectiles.push(p);
    } else {
      for (let i = 0; i < def.pellets; i++) {
        const angle = (Math.random() - 0.5) * 2 * def.spread;
        const axis  = new THREE.Vector3(
          Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5,
        ).normalize();
        const spreadDir = direction.clone().applyAxisAngle(axis, angle).normalize();
        this._projectiles.push(new Projectile(scene, origin, spreadDir, def));
      }
    }
    this._cooldown = def.cooldown;
  }

  update(dt: number, _scene: THREE.Scene, shooter: Controllable, entities: Controllable[],
         colliders: THREE.Box3[] = [], walls: THREE.Box3[] = []) {
    this._cooldown = Math.max(0, this._cooldown - dt);

    for (const [e, t] of this._freezeMap) {
      const remaining = t - dt;
      if (remaining <= 0) {
        this._freezeMap.delete(e);
        if (!e.isEliminated) e.setFrozen(false);
      } else {
        this._freezeMap.set(e, remaining);
      }
    }

    for (const p of this._projectiles) p.update(dt, shooter, entities, this._freezeMap, colliders, walls);
    this._projectiles = this._projectiles.filter(p => !p.done);

    for (const s of this._swings) s.update(dt, shooter, entities, this._projectiles);
    this._swings = this._swings.filter(s => !s.done);

    for (const ex of this._explosions) ex.update(dt);
    this._explosions = this._explosions.filter(ex => !ex.done);
  }
}
