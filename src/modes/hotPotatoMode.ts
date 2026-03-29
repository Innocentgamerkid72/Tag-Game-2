import { Controllable } from "../types";
import { GameMode, TAG_RADIUS } from "./gameMode";

const POTATO_TIMER = 12;
/** Speed added per second of holding (e.g. 0.05 = +5%/s, capped at +60%). */
const HOLD_SPEED_RATE = 0.05;
const HOLD_SPEED_CAP  = 1.6;

export class HotPotatoMode implements GameMode {
  readonly name = "Hot Potato";
  private _potatoTimer = POTATO_TIMER;
  private _holdTime    = 0;
  private _prevHolder  : Controllable | null = null;

  onStart(entities: Controllable[]) {
    entities.forEach(e => { e.setIt(false); e.setFrozen(false); e.setEliminated(false); });
    entities[Math.floor(Math.random() * entities.length)].setIt(true);
    this._potatoTimer = POTATO_TIMER;
    this._holdTime    = 0;
    this._prevHolder  = null;
  }

  update(dt: number, entities: Controllable[]) {
    const active = entities.filter(e => !e.isEliminated);
    const holder = active.find(e => e.isIt);
    if (!holder) return;

    // Track how long the current holder has held the potato
    if (holder !== this._prevHolder) {
      this._holdTime   = 0;
      this._prevHolder = holder;
    }
    this._holdTime += dt;

    // Progressive speed buff — stacks multiplicatively with the last-10s boost
    // (roundManager already set holder.speedBoost before calling update())
    const holdFactor = Math.min(HOLD_SPEED_CAP, 1 + this._holdTime * HOLD_SPEED_RATE);
    holder.speedBoost *= holdFactor;

    // Holder tries to pass the potato voluntarily
    for (const target of active) {
      if (target === holder || target.isIt || target.tagImmunity > 0) continue;
      if (holder.position.distanceTo(target.position) <= TAG_RADIUS) {
        holder.setIt(false);
        target.setIt(true);
        // Preserve remaining time — only explosion resets the timer
        return;
      }
    }

    // Tick down the potato timer
    this._potatoTimer -= dt;
    if (this._potatoTimer <= 0) {
      // Holder is eliminated — held it too long!
      holder.setIt(false);
      holder.setEliminated(true);
      this._holdTime   = 0;
      this._prevHolder = null;

      // Pass potato to a random surviving player
      const survivors = entities.filter(e => !e.isEliminated);
      if (survivors.length > 0) {
        survivors[Math.floor(Math.random() * survivors.length)].setIt(true);
      }
      this._potatoTimer = POTATO_TIMER;
    }
  }

  getHud(local: Controllable, entities: Controllable[]) {
    const active = entities.filter(e => !e.isEliminated);
    const remaining = `(${active.length} left)`;
    if (local.isEliminated) return "You were eliminated! Spectating...";
    const holdFactor = Math.min(HOLD_SPEED_CAP, 1 + this._holdTime * HOLD_SPEED_RATE);
    const pct = Math.round((holdFactor - 1) * 100);
    if (local.isIt) {
      return `HOT POTATO! Pass it — ${Math.ceil(this._potatoTimer)}s until BOOM! +${pct}% speed ${remaining}`;
    }
    return `Stay away from the potato holder! ${Math.ceil(this._potatoTimer)}s ${remaining}`;
  }

  isRoundOver(entities: Controllable[]): boolean {
    const active = entities.filter(e => !e.isEliminated);
    if (active.length <= 1) return true;
    if (!active.some(e => e.isHuman)) return true;
    return false;
  }
}
