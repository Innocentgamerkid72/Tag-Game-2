import * as THREE from "three";

export interface Controllable {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  isIt: boolean;
  tagImmunity: number;
  isFrozen: boolean;
  isEliminated: boolean;
  isHuman: boolean;
  speedBoost: number;
  knockbackTimer: number;
  hp: number;
  lives: number;
  setIt(v: boolean): void;
  setFrozen(frozen: boolean): void;
  setEliminated(v: boolean): void;
  removeFromScene(scene: THREE.Scene): void;
}
