import { Controllable } from "../types";
import { GameMode, TAG_RADIUS } from "./gameMode";

export class FreezeTagMode implements GameMode {
  readonly name = "Freeze Tag";

  onStart(entities: Controllable[]) {
    entities.forEach(e => { e.setIt(false); e.setFrozen(false); });
    entities[Math.floor(Math.random() * entities.length)].setIt(true);
  }

  update(_dt: number, entities: Controllable[]) {
    const tagger = entities.find(e => e.isIt);
    if (!tagger) return;

    for (const target of entities) {
      if (target === tagger || target.isIt || target.tagImmunity > 0) continue;
      if (tagger.position.distanceTo(target.position) <= TAG_RADIUS) {
        target.setFrozen(true);
      }
    }

    // Non-frozen, non-it players can unfreeze frozen teammates by touching them
    for (const rescuer of entities) {
      if (rescuer.isIt || rescuer.isFrozen) continue;
      for (const frozen of entities) {
        if (!frozen.isFrozen || frozen.isIt) continue;
        if (rescuer.position.distanceTo(frozen.position) <= TAG_RADIUS) {
          frozen.setFrozen(false);
        }
      }
    }
  }

  getHud(local: Controllable, entities: Controllable[]) {
    if (local.isIt) return "Freeze everyone!";
    if (local.isFrozen) return "FROZEN — wait for a teammate to unfreeze you!";
    const frozenCount = entities.filter(e => !e.isIt && e.isFrozen).length;
    const totalNonIt = entities.filter(e => !e.isIt).length;
    return `Run! Unfreeze teammates. Frozen: ${frozenCount}/${totalNonIt}`;
  }

  isRoundOver(entities: Controllable[]) {
    const nonIt = entities.filter(e => !e.isIt);
    if (nonIt.length === 0) return false;
    return nonIt.every(e => e.isFrozen);
  }
}
