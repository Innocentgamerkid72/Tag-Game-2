import { Controllable } from "../types";
import { GameMode, TAG_RADIUS } from "./gameMode";

export class TagMode implements GameMode {
  readonly name = "Tag";

  onStart(entities: Controllable[]) {
    entities.forEach(e => { e.setIt(false); e.setFrozen(false); });
    entities[Math.floor(Math.random() * entities.length)].setIt(true);
  }

  update(_dt: number, entities: Controllable[]) {
    for (const tagger of entities) {
      if (!tagger.isIt) continue;
      for (const target of entities) {
        if (target === tagger || target.isIt || target.tagImmunity > 0) continue;
        if (tagger.position.distanceTo(target.position) <= TAG_RADIUS) {
          tagger.setIt(false);
          target.setIt(true);
          break;
        }
      }
    }
  }

  getHud(local: Controllable) {
    return local.isIt ? "You are IT! Tag someone!" : "Run!";
  }

  isRoundOver() { return false; }
}
