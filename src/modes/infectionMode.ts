import { Controllable } from "../types";
import { GameMode } from "./gameMode";

// ── Infection-mode constants ──────────────────────────────────────────────────
export const INF_ZOMBIE_HP  = 200;
export const INF_HEALTHY_HP = 100;

/** Hits required to zombify a healthy player (regular / speedy / trapper). */
export const HITS_TO_INFECT = 3;

/** Freeze/stun duration multiplier applied to zombies. */
const ZOMBIE_FREEZE_MULT = 0.5;

/** HP dealt per sword hit to a zombie (25% damage reduction applied). */
const SWORD_DMG_VS_ZOMBIE = 30;

/** HP dealt per blaster shot to a zombie (25% damage reduction applied). */
const BLASTER_DMG_VS_ZOMBIE = 15;

// Exported so main.ts can override onBiteHit with class-aware logic.
export const infectionHits = new Map<Controllable, number>();

export class InfectionMode implements GameMode {
  readonly name = "Infection";

  onStart(entities: Controllable[]) {
    infectionHits.clear();
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

  update(_dt: number, _entities: Controllable[]) {
    // Zombie death + respawn is handled by main.ts (3-second timer + random position)
  }

  getHud(local: Controllable, entities: Controllable[]) {
    const infectedCount = entities.filter(e => e.isIt).length;
    const healthyCount  = entities.filter(e => !e.isIt && !e.isEliminated).length;
    if (local.isIt) {
      return `ZOMBIE! [HP: ${Math.max(0, local.hp)}/${INF_ZOMBIE_HP}]  Infect ${healthyCount} remaining!`;
    }
    const myHits  = infectionHits.get(local) ?? 0;
    const hitsLeft = HITS_TO_INFECT - myHits;
    return `Stay healthy! ${infectedCount} zombies, ${healthyCount} healthy. (${hitsLeft} bites before zombified)`;
  }

  isRoundOver(entities: Controllable[]) {
    return entities.every(e => e.isIt || e.isEliminated);
  }
}

// ── Weapon callbacks wired up for Infection mode ──────────────────────────────
import type { WeaponType } from "../weapon";
import { weaponCallbacks } from "../weapon";

export function installInfectionCallbacks() {
  weaponCallbacks.freezeDurMult = (target: Controllable) =>
    target.isIt ? ZOMBIE_FREEZE_MULT : 1;

  weaponCallbacks.onProjectileHit = (target: Controllable, wType: WeaponType) => {
    if (!target.isIt) return 0;
    if (wType === "blaster") return BLASTER_DMG_VS_ZOMBIE;
    return 0;
  };

  weaponCallbacks.onSplashHit = () => 0;

  weaponCallbacks.onSwordHit = (target: Controllable) =>
    target.isIt ? SWORD_DMG_VS_ZOMBIE : 0;

  // Default bite handler — main.ts replaces this with a zombie-class-aware version.
  weaponCallbacks.onBiteHit = (target: Controllable, _shooter?: Controllable) => {
    if (target.isIt || target.isEliminated) return;
    const hits = (infectionHits.get(target) ?? 0) + 1;
    if (hits >= HITS_TO_INFECT) {
      infectionHits.delete(target);
      target.setIt(true);
      target.hp = INF_ZOMBIE_HP;
      target.tagImmunity = 1.5;
    } else {
      infectionHits.set(target, hits);
    }
  };
}
