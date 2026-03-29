import { Controllable } from "../types";
import { Teleporter } from "../testMap";
import { GameMode, TAG_RADIUS } from "./gameMode";

const SABOTAGE_RANGE = 1.8;
const SABOTAGE_TIME  = 5;

export class HunterMode implements GameMode {
  readonly name = "Hunter";

  onStart(entities: Controllable[]) {
    entities.forEach(e => { e.setIt(false); e.setFrozen(false); });
    entities[Math.floor(Math.random() * entities.length)].setIt(true);
  }

  update(dt: number, entities: Controllable[], teleporters?: Teleporter[]) {
    // Normal tag transfer — hunter tags others and transfers role
    for (const hunter of entities) {
      if (!hunter.isIt) continue;
      for (const target of entities) {
        if (target === hunter || target.isIt || target.tagImmunity > 0) continue;
        if (hunter.position.distanceTo(target.position) <= TAG_RADIUS) {
          // Hunter changed — clear all sabotage state
          if (teleporters) {
            for (const tp of teleporters) {
              tp.sabotaged = false;
              tp.sabotageProgress = 0;
              if (tp.cooldown === 0) tp.sprite.visible = false;
            }
          }
          hunter.setIt(false);
          target.setIt(true);
          break;
        }
      }
    }

    if (!teleporters) return;

    const hunter = entities.find(e => e.isIt);
    if (!hunter) return;

    // Sabotage logic: hunter standing near a teleporter pad fills the sabotage bar
    for (const tp of teleporters) {
      if (tp.sabotaged) {
        // Keep TRAP indicator visible (cooldown display takes priority when on cooldown)
        if (tp.cooldown === 0) {
          tp.sprite.visible = true;
          this._drawTrapSprite(tp);
        }
        continue;
      }

      const cx = (tp.trigger.min.x + tp.trigger.max.x) / 2;
      const cz = (tp.trigger.min.z + tp.trigger.max.z) / 2;
      const hPos = hunter.position;
      const dx = hPos.x - cx;
      const dz = hPos.z - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist <= SABOTAGE_RANGE) {
        tp.sabotageProgress = (tp.sabotageProgress ?? 0) + dt;
        if (tp.cooldown === 0) {
          tp.sprite.visible = true;
          this._drawProgressSprite(tp, Math.min(1, tp.sabotageProgress / SABOTAGE_TIME));
        }
        if (tp.sabotageProgress >= SABOTAGE_TIME) {
          tp.sabotaged = true;
          tp.sabotageProgress = 0;
          if (tp.cooldown === 0) {
            tp.sprite.visible = true;
            this._drawTrapSprite(tp);
          }
        }
      } else if ((tp.sabotageProgress ?? 0) > 0) {
        tp.sabotageProgress = 0;
        if (tp.cooldown === 0) tp.sprite.visible = false;
      }
    }
  }

  getHud(local: Controllable) {
    if (local.isIt) {
      return "You are the HUNTER! Stand near teleporters to sabotage them!";
    }
    return "The hunter is coming — watch out for trapped teleporters!";
  }

  isRoundOver() { return false; }

  private _drawProgressSprite(tp: Teleporter, frac: number) {
    const ctx = tp.canvas.getContext("2d")!;
    const s = tp.canvas.width;
    ctx.clearRect(0, 0, s, s);

    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(s / 2, s / 2);
    ctx.arc(s / 2, s / 2, s / 2 - 4, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 120, 0, 0.75)";
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${s * 0.3}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", s / 2, s / 2);

    tp.texture.needsUpdate = true;
  }

  private _drawTrapSprite(tp: Teleporter) {
    const ctx = tp.canvas.getContext("2d")!;
    const s = tp.canvas.width;
    ctx.clearRect(0, 0, s, s);

    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(180, 0, 0, 0.85)";
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${s * 0.28}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("TRAP", s / 2, s / 2);

    tp.texture.needsUpdate = true;
  }
}
