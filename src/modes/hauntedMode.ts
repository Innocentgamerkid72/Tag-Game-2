import { Controllable } from "../types";
import { GameMode, TAG_RADIUS } from "./gameMode";

export class HauntedMode implements GameMode {
  readonly name = "Haunted";

  onStart(entities: Controllable[]) {
    entities.forEach(e => { e.setIt(false); e.setFrozen(false); });
    entities[Math.floor(Math.random() * entities.length)].setIt(true);
  }

  update(_dt: number, entities: Controllable[]) {
    for (const ghost of entities) {
      if (!ghost.isIt || ghost.isEliminated) continue;
      for (const target of entities) {
        if (target === ghost || target.isIt || target.isEliminated || target.tagImmunity > 0) continue;
        if (ghost.position.distanceTo(target.position) <= TAG_RADIUS + 0.3) {
          ghost.setIt(false);
          target.setIt(true);
          break;
        }
      }
    }
  }

  getHud(local: Controllable, entities: Controllable[]) {
    const survivors = entities.filter(e => !e.isIt && !e.isEliminated).length;
    if (local.isIt) return `YOU ARE THE GHOST — hunt them down! (${survivors} hiding)`;
    return "Stay away from the ghost!";
  }

  isRoundOver() { return false; }
}
