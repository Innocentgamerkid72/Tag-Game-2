import * as THREE from "three";
import { Controllable } from "../types";

const STUN_DURATION  = 3.0;  // seconds the entity stays frozen
const STUN_RADIUS    = 1.3;  // trigger radius (XZ distance)
const TRAP_COOLDOWN  = 9.0;  // per-entity immunity after being released

export class StunTrap {
  private readonly _cx: number;
  private readonly _cz: number;
  private readonly _groundY: number;
  private readonly _plateMat: THREE.MeshBasicMaterial;
  private _pulseT = 0;

  // Per-entity: how many seconds remain of being stunned by THIS trap
  private readonly _stunTimers  = new Map<Controllable, number>();
  // Per-entity: immunity cooldown so the trap can't instantly re-trigger
  private readonly _cooldowns   = new Map<Controllable, number>();

  constructor(
    _scene: THREE.Scene,
    x: number,
    y: number,
    z: number,
    add: <T extends THREE.Object3D>(o: T) => T,
  ) {
    this._cx = x;
    this._cz = z;
    this._groundY = y;

    const group = new THREE.Group();

    // Pressure plate — coloured disc flush with the floor
    this._plateMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(STUN_RADIUS, STUN_RADIUS, 0.08, 16),
      this._plateMat,
    );
    plate.position.y = 0.04;
    group.add(plate);

    // Warning ring (orange torus)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(STUN_RADIUS + 0.05, 0.09, 6, 20),
      new THREE.MeshBasicMaterial({ color: 0xff8800 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    group.add(ring);

    // Skull-like warning rune: two small cylinders forming an X
    const runeMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
    for (const angle of [Math.PI / 4, -Math.PI / 4]) {
      const rune = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, STUN_RADIUS * 1.3, 4),
        runeMat,
      );
      rune.rotation.z = angle;
      rune.position.y = 0.1;
      group.add(rune);
    }

    // Ominous red glow
    const light = new THREE.PointLight(0xff2200, 0.9, 5);
    light.position.y = 0.6;
    group.add(light);

    group.position.set(x, y, z);
    add(group);
  }

  update(dt: number, entities: Controllable[]) {
    // Pulse the plate colour
    this._pulseT += dt * 2.5;
    const pulse = 0.55 + 0.45 * Math.sin(this._pulseT);
    this._plateMat.color.setRGB(pulse, pulse * 0.05, 0);

    for (const e of entities) {
      if (e.isEliminated) continue;

      // ── Tick active stun ───────────────────────────────────────────────────────
      const stunLeft = this._stunTimers.get(e) ?? 0;
      if (stunLeft > 0) {
        const remaining = stunLeft - dt;
        if (remaining <= 0) {
          this._stunTimers.delete(e);
          if (e.isFrozen) e.setFrozen(false);
          this._cooldowns.set(e, TRAP_COOLDOWN);
        } else {
          this._stunTimers.set(e, remaining);
        }
        continue; // entity is currently stunned; skip trigger check
      }

      // ── Tick per-entity immunity cooldown ─────────────────────────────────────
      const cdLeft = this._cooldowns.get(e) ?? 0;
      if (cdLeft > 0) {
        this._cooldowns.set(e, cdLeft - dt);
        continue;
      }

      // ── Trigger check ─────────────────────────────────────────────────────────
      const dx = e.position.x - this._cx;
      const dz = e.position.z - this._cz;
      const distSq = dx * dx + dz * dz;
      const dy = e.position.y - this._groundY;

      // Must be within radius and within 1.8 units above the plate
      if (distSq <= STUN_RADIUS * STUN_RADIUS && dy >= -0.2 && dy <= 1.8) {
        e.setFrozen(true);
        this._stunTimers.set(e, STUN_DURATION);
      }
    }
  }
}
