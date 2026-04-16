import { Controllable } from "../types";
import { GameMode } from "./gameMode";

// ── Infection-mode constants ──────────────────────────────────────────────────
export const INF_ZOMBIE_HP  = 200;
export const INF_HEALTHY_HP = 100;

/** Hits required to zombify a healthy player. */
const HITS_TO_INFECT = 3;

/** Freeze/stun duration multiplier applied to zombies. */
const ZOMBIE_FREEZE_MULT = 0.5;

/** HP dealt per sword hit to a zombie (25% damage reduction applied). */
const SWORD_DMG_VS_ZOMBIE = 30;

/** HP dealt per blaster shot to a zombie (25% damage reduction applied). */
const BLASTER_DMG_VS_ZOMBIE = 15;

// Module-level so both InfectionMode and installInfectionCallbacks can share it
const _infectionHits = new Map<Controllable, number>();

export class InfectionMode implements GameMode {
  readonly name = "Infection";

  /** Track which zombies have been fully eliminated (HP reached 0). */
  private _deadZombies = new Set<Controllable>();

  onStart(entities: Controllable[]) {
    _infectionHits.clear();
    this._deadZombies.clear();
    entities.forEach(e => {
      e.setIt(false);
      e.setFrozen(false);
      e.hp = INF_HEALTHY_HP;
    });
    // Pick one random zombie
    const zombie = entities[Math.floor(Math.random() * entities.length)];
    zombie.setIt(true);
    zombie.hp = INF_ZOMBIE_HP;
  }

  update(_dt: number, entities: Controllable[]) {
    const zombies = entities.filter(e => e.isIt && !e.isEliminated);

    // ── Zombie HP → eliminate when dead ──────────────────────────────────────
    for (const zombie of zombies) {
      if (zombie.hp <= 0 && !this._deadZombies.has(zombie)) {
        this._deadZombies.add(zombie);
        zombie.setEliminated(true);
      }
    }
  }

  getHud(local: Controllable, entities: Controllable[]) {
    const infectedCount = entities.filter(e => e.isIt).length;
    const healthyCount  = entities.filter(e => !e.isIt && !e.isEliminated).length;
    if (local.isIt) {
      const hitsLeft = local.hp > 0
        ? `HP: ${local.hp}/${INF_ZOMBIE_HP}`
        : "ELIMINATED";
      return `ZOMBIE! [${hitsLeft}]  Infect ${healthyCount} remaining!`;
    }
    const myHits = _infectionHits.get(local) ?? 0;
    const hitsLeft = HITS_TO_INFECT - myHits;
    return `Stay healthy! ${infectedCount} zombies, ${healthyCount} healthy. (${hitsLeft} bites before zombified)`;
  }

  isRoundOver(entities: Controllable[]) {
    // Round ends when all players are either zombies or eliminated
    return entities.every(e => e.isIt || e.isEliminated);
  }
}

// ── Weapon callbacks wired up for Infection mode ──────────────────────────────
// Called from main.ts when the mode starts/ends.
import type { WeaponType } from "../weapon";
import { weaponCallbacks } from "../weapon";

export function installInfectionCallbacks() {
  // Zombies take halved freeze duration
  weaponCallbacks.freezeDurMult = (target: Controllable) =>
    target.isIt ? ZOMBIE_FREEZE_MULT : 1;

  // Direct projectile hit damage — only sword+blaster deal damage to zombies (25% reduction applied)
  weaponCallbacks.onProjectileHit = (target: Controllable, wType: WeaponType) => {
    if (!target.isIt) return 0; // only deal HP damage to zombies
    if (wType === "blaster") return BLASTER_DMG_VS_ZOMBIE;
    return 0;
  };

  // No splash (rocket/freeze not available to healthy in infection)
  weaponCallbacks.onSplashHit = () => 0;

  // Sword swing damage to zombies (25% reduction)
  weaponCallbacks.onSwordHit = (target: Controllable) =>
    target.isIt ? SWORD_DMG_VS_ZOMBIE : 0;

  // Bite: track hits per healthy — 3 bites converts to zombie
  weaponCallbacks.onBiteHit = (target: Controllable) => {
    if (target.isIt || target.isEliminated) return;
    const hits = (_infectionHits.get(target) ?? 0) + 1;
    if (hits >= HITS_TO_INFECT) {
      _infectionHits.delete(target);
      target.setIt(true);
      target.hp = INF_ZOMBIE_HP;
      target.tagImmunity = 1.5;
    } else {
      _infectionHits.set(target, hits);
    }
  };
}
