import * as THREE from "three";
import { Controllable } from "../types";

const CAR_SPEED     = 9;    // units/s along road
const KNOCK_FORCE   = 38;   // units/s applied in travel direction on hit
const KNOCK_UP      = 14;   // units/s upward on hit
const HIT_HALF_LEN  = 1.2;  // half-length of car along travel axis
const HIT_HALF_W    = 0.65; // half-width of car perpendicular to travel
const HIT_HEIGHT    = 1.8;  // max entity y to be struck
const HIT_COOLDOWN  = 2.0;  // seconds before same car can hit same entity again
// Only entities in FRONT of the car (in the driving direction) get flung.
// "along" = dot(entityOffset, driveDir), so along > 0 means ahead of the car.
const HIT_FRONT_REACH = HIT_HALF_LEN + 0.8; // extra forward reach

export class MovingCar {
  private _group:   THREE.Group;
  private _axis:    "x" | "z";
  private _min:     number;
  private _max:     number;
  private _val:     number;   // current coord along travel axis
  private _fixed:   number;   // fixed coord on the other axis
  private _yOffset: number;   // vertical offset (e.g. for elevated roads)
  private _dir:     1 | -1;
  private _cooldowns = new Map<Controllable, number>();

  constructor(
    axis:     "x" | "z",
    startVal: number,
    fixedVal: number,
    min:      number,
    max:      number,
    startDir: 1 | -1,
    color:    number,
    add:      (o: THREE.Object3D) => void,
    yOffset = 0
  ) {
    this._axis    = axis;
    this._val     = startVal;
    this._fixed   = fixedVal;
    this._min     = min;
    this._max     = max;
    this._dir     = startDir;
    this._yOffset = yOffset;

    this._group = new THREE.Group();

    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.7, 0.9),
      new THREE.MeshLambertMaterial({ color })
    );
    body.position.y = 0.55;
    this._group.add(body);

    // Cabin (slightly lighter shade)
    const cabinColor = Math.min(0xffffff, color + 0x111111);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.55, 0.82),
      new THREE.MeshLambertMaterial({ color: cabinColor })
    );
    cabin.position.set(-0.1, 1.05, 0);
    this._group.add(cabin);

    // Headlight glow
    const headlight = new THREE.PointLight(0xffee88, 0.9, 6);
    headlight.position.set(0.95, 0.6, 0);
    this._group.add(headlight);

    this._applyTransform();
    add(this._group);
  }

  private _applyTransform() {
    if (this._axis === "x") {
      this._group.position.set(this._val, this._yOffset, this._fixed);
      this._group.rotation.y = this._dir > 0 ? 0 : Math.PI;
    } else {
      this._group.position.set(this._fixed, this._yOffset, this._val);
      this._group.rotation.y = this._dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }

  update(dt: number, entities: Controllable[]) {
    // Tick down cooldowns
    for (const [e, t] of this._cooldowns) {
      const remaining = t - dt;
      if (remaining <= 0) this._cooldowns.delete(e);
      else this._cooldowns.set(e, remaining);
    }

    // Advance position
    this._val += this._dir * CAR_SPEED * dt;
    if (this._val >= this._max) { this._val = this._max; this._dir = -1; }
    if (this._val <= this._min) { this._val = this._min; this._dir =  1; }
    this._applyTransform();

    // Hit detection
    const cp = this._group.position;
    for (const e of entities) {
      if (e.isEliminated || this._cooldowns.has(e)) continue;
      if (Math.abs(e.position.y - this._yOffset) > HIT_HEIGHT) continue;

      let along: number, perp: number;
      if (this._axis === "x") {
        along = (e.position.x - cp.x) * this._dir;
        perp  = Math.abs(e.position.z - cp.z);
      } else {
        along = (e.position.z - cp.z) * this._dir;
        perp  = Math.abs(e.position.x - cp.x);
      }

      // Only fling entities that are in front of the car (along the driving direction)
      if (along > 0 && along < HIT_FRONT_REACH && perp < HIT_HALF_W) {
        if (this._axis === "x") e.velocity.x = this._dir * KNOCK_FORCE;
        else                    e.velocity.z = this._dir * KNOCK_FORCE;
        e.velocity.y = Math.max(e.velocity.y, KNOCK_UP);
        e.tagImmunity = Math.max(e.tagImmunity, 2.0);
        this._cooldowns.set(e, HIT_COOLDOWN);
      }
    }
  }
}
