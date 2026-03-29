import { Controllable } from "../types";
import { GameMode, TAG_RADIUS } from "./gameMode";

export class InfectionMode implements GameMode {
  readonly name = "Infection";

  onStart(entities: Controllable[]) {
    entities.forEach(e => { e.setIt(false); e.setFrozen(false); });
    entities[Math.floor(Math.random() * entities.length)].setIt(true);
  }

  update(_dt: number, entities: Controllable[]) {
    // Infected (isIt) players spread infection on touch — stay infected
    for (const infected of entities) {
      if (!infected.isIt) continue;
      for (const target of entities) {
        if (target.isIt || target.tagImmunity > 0) continue;
        if (infected.position.distanceTo(target.position) <= TAG_RADIUS) {
          target.setIt(true);
        }
      }
    }
  }

  getHud(local: Controllable, entities: Controllable[]) {
    const infectedCount = entities.filter(e => e.isIt).length;
    const healthyCount = entities.filter(e => !e.isIt).length;
    if (local.isIt) {
      return `INFECTED! Spread it! ${healthyCount} healthy remain.`;
    }
    return `Stay healthy! ${infectedCount} infected, ${healthyCount} healthy.`;
  }

  isRoundOver(entities: Controllable[]) {
    return entities.every(e => e.isIt);
  }
}
