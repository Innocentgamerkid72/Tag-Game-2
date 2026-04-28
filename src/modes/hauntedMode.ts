import { Controllable } from "../types";
import { GameMode } from "./gameMode";

export class HauntedMode implements GameMode {
  readonly name = "Haunted";

  onStart(entities: Controllable[]) {
    entities.forEach(e => { e.setIt(false); e.setFrozen(false); e.setEliminated(false); });
    entities[Math.floor(Math.random() * entities.length)].setIt(true);
  }

  update(_dt: number, _entities: Controllable[]) {
    // Ghost kills via dagger (handled in main.ts weapon system — no proximity tag here)
  }

  getHud(local: Controllable, entities: Controllable[]) {
    const survivors = entities.filter(e => !e.isIt && !e.isEliminated).length;
    if (local.isIt) {
      return `YOU ARE THE GHOST — stab survivors from BEHIND with [LMB]! (${survivors} left)`;
    }
    return `Hide and keep the ghost in sight — it can only stab from BEHIND! (${survivors} survivors)`;
  }

  isRoundOver(_entities: Controllable[]) {
    // Round ends when the ghost has eliminated all survivors
    return _entities.filter(e => !e.isIt && !e.isEliminated).length === 0;
  }
}
