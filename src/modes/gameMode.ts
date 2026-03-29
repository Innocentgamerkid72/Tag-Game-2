import { Controllable } from "../types";
import { Teleporter } from "../testMap";

export const TAG_RADIUS = 1.5;

export interface GameMode {
  readonly name: string;
  readonly rare?: boolean;
  onStart(entities: Controllable[]): void;
  update(dt: number, entities: Controllable[], teleporters?: Teleporter[]): void;
  getHud(local: Controllable, entities: Controllable[]): string;
  isRoundOver(entities: Controllable[]): boolean;
}
