import { Controllable } from "../types";
import { GameMode } from "./gameMode";

const PUSH_RADIUS    = 1.4;
const PUSH_FORCE     = 22;
const PUSH_FORCE_UP  = 7;
const KNOCKBACK_TIME = 0.55;

export class TomfooleryMode implements GameMode {
  readonly name = "Tomfoolery";
  readonly rare = true;

  private _graceTimer = 0;

  onStart(entities: Controllable[]) {
    entities.forEach(e => { e.setIt(false); e.setFrozen(false); e.setEliminated(false); });
    this._graceTimer = 5;
  }

  update(dt: number, entities: Controllable[]) {
    const active = entities.filter(e => !e.isEliminated);
    if (this._graceTimer > 0) this._graceTimer -= dt;

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
      }
    }
  }

  getHud(local: Controllable, entities: Controllable[]) {
    const alive = entities.filter(e => !e.isEliminated).length;
    if (local.isEliminated) return "You got knocked off! Spectating...";
    return `Knock everyone off the platform! Players alive: ${alive}`;
  }

  isRoundOver(entities: Controllable[]): boolean {
    if (this._graceTimer > 0) return false;
    return entities.filter(e => !e.isEliminated).length <= 1;
  }
}
