import * as THREE from "three";
import { Controllable } from "../types";
import { GameMode } from "./gameMode";

const PUSH_RADIUS    = 1.4;
const PUSH_FORCE     = 22;
const PUSH_FORCE_UP  = 7;
const KNOCKBACK_TIME = 0.55;

export const TMF_MAX_HP    = 100;
export const TMF_MAX_LIVES = 3;
const BUMP_DAMAGE  = 22;
export const RESPAWN_IMMUNITY = 3.5; // seconds of tag immunity after respawn

// Respawn spots spread across all platform rings (y=2 = 1m above platform surface).
// Drawn from all 4 rings + the sky tier so players scatter around the full map.
const SPAWN_OFFSETS: THREE.Vector3[] = [
  // Main platform quadrants
  new THREE.Vector3( 8, 2,  8),
  new THREE.Vector3(-8, 2,  8),
  new THREE.Vector3( 8, 2, -8),
  new THREE.Vector3(-8, 2, -8),
  // Ring 1 cardinal (±34)
  new THREE.Vector3( 34, 2,  0),
  new THREE.Vector3(-34, 2,  0),
  new THREE.Vector3(  0, 2, 34),
  new THREE.Vector3(  0, 2,-34),
  // Ring 1 diagonal (±30)
  new THREE.Vector3( 30, 2,  30),
  new THREE.Vector3(-30, 2,  30),
  new THREE.Vector3( 30, 2, -30),
  new THREE.Vector3(-30, 2, -30),
  // Ring 2 cardinal (±57)
  new THREE.Vector3( 57, 2,  0),
  new THREE.Vector3(-57, 2,  0),
  new THREE.Vector3(  0, 2, 57),
  new THREE.Vector3(  0, 2,-57),
  // Ring 2 diagonal (±48)
  new THREE.Vector3( 48, 2,  48),
  new THREE.Vector3(-48, 2,  48),
  new THREE.Vector3( 48, 2, -48),
  new THREE.Vector3(-48, 2, -48),
  // Ring 3 cardinal (±81)
  new THREE.Vector3( 81, 2,  0),
  new THREE.Vector3(-81, 2,  0),
  new THREE.Vector3(  0, 2, 81),
  new THREE.Vector3(  0, 2,-81),
  // Ring 4 cardinal (±104)
  new THREE.Vector3( 104, 2,  0),
  new THREE.Vector3(-104, 2,  0),
  new THREE.Vector3(   0, 2, 104),
  new THREE.Vector3(   0, 2,-104),
  // Sky tier top (y=12)
  new THREE.Vector3(  0, 13,  0),
];

export class TomfooleryMode implements GameMode {
  readonly name = "Tomfoolery";
  readonly rare = true;

  private _graceTimer = 0;
  private _prevEliminated = new Set<Controllable>();

  onStart(entities: Controllable[]) {
    this._prevEliminated.clear();
    // Shuffle a subset of indices for initial spread
    const idxPool = SPAWN_OFFSETS.map((_, i) => i).sort(() => Math.random() - 0.5);
    entities.forEach((e, i) => {
      e.setIt(false);
      e.setFrozen(false);
      e.setEliminated(false);
      e.hp    = TMF_MAX_HP;
      e.lives = TMF_MAX_LIVES;
      const sp = SPAWN_OFFSETS[idxPool[i % idxPool.length]];
      e.position.set(sp.x, sp.y, sp.z);
      e.velocity.set(0, 0, 0);
    });
    this._graceTimer = 5;
  }

  update(dt: number, entities: Controllable[]) {
    // ── 1. Detect newly eliminated → spend a life or stay dead ───────────────
    for (const e of entities) {
      const wasElim = this._prevEliminated.has(e);
      if (e.isEliminated && !wasElim) {
        e.lives = Math.max(0, e.lives - 1);
        if (e.lives > 0) {
          // Respawn at a random platform spread across the map
          const sp = SPAWN_OFFSETS[Math.floor(Math.random() * SPAWN_OFFSETS.length)];
          e.setEliminated(false);
          e.setFrozen(false);
          e.position.set(sp.x, sp.y, sp.z);
          e.velocity.set(0, 0, 0);
          e.hp             = TMF_MAX_HP;
          e.tagImmunity    = RESPAWN_IMMUNITY;
          e.knockbackTimer = 0;
        }
      }
    }

    // Refresh prev-eliminated snapshot AFTER respawns so we don't re-trigger
    this._prevEliminated.clear();
    for (const e of entities) if (e.isEliminated) this._prevEliminated.add(e);

    // ── 2. Grace period ───────────────────────────────────────────────────────
    if (this._graceTimer > 0) this._graceTimer -= dt;

    // ── 3. Bump collision + HP damage ─────────────────────────────────────────
    const active = entities.filter(e => !e.isEliminated);
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i], b = active[j];
        if (a.knockbackTimer > 0 || b.knockbackTimer > 0) continue;
        if (a.tagImmunity   > 0 || b.tagImmunity   > 0) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > PUSH_RADIUS || dist < 0.01) continue;

        const nx = dx / dist, nz = dz / dist;

        b.velocity.x += nx * PUSH_FORCE;
        b.velocity.z += nz * PUSH_FORCE;
        b.velocity.y  = Math.max(b.velocity.y, PUSH_FORCE_UP);
        b.knockbackTimer = KNOCKBACK_TIME;
        b.tagImmunity    = Math.max(b.tagImmunity, KNOCKBACK_TIME);

        a.velocity.x -= nx * PUSH_FORCE;
        a.velocity.z -= nz * PUSH_FORCE;
        a.velocity.y  = Math.max(a.velocity.y, PUSH_FORCE_UP);
        a.knockbackTimer = KNOCKBACK_TIME;
        a.tagImmunity    = Math.max(a.tagImmunity, KNOCKBACK_TIME);

        // HP damage from bump — each hit deals BUMP_DAMAGE
        a.hp = Math.max(0, a.hp - BUMP_DAMAGE);
        b.hp = Math.max(0, b.hp - BUMP_DAMAGE);

        // HP 0 → eliminate (life decrement + respawn handled next frame)
        if (a.hp <= 0 && !a.isEliminated) { a.setEliminated(true); }
        if (b.hp <= 0 && !b.isEliminated) { b.setEliminated(true); }
      }
    }
  }

  getHud(local: Controllable, entities: Controllable[]) {
    const alive = entities.filter(e => !e.isEliminated).length;
    if (local.isEliminated && local.lives <= 0) return "You're out! Spectating...";
    if (local.isEliminated) return "Respawning...";
    const pct = Math.round((local.hp / TMF_MAX_HP) * 100);
    return `♥×${local.lives}  HP:${pct}%  |  Alive: ${alive}`;
  }

  isRoundOver(entities: Controllable[]): boolean {
    if (this._graceTimer > 0) return false;
    return entities.filter(e => !e.isEliminated).length <= 1;
  }
}
