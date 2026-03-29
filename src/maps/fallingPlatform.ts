import * as THREE from "three";
import { Controllable } from "../types";

const WARN_TIME = 3.0; // seconds before the platform drops

export class FallingPlatform {
  private readonly _mesh:      THREE.Mesh;
  private readonly _mat:       THREE.MeshLambertMaterial;
  private readonly _collider:  THREE.Box3;
  private readonly _colliders: THREE.Box3[];
  private readonly _basePos:   THREE.Vector3;
  private readonly _baseColor: number;
  private readonly _halfW: number;
  private readonly _halfD: number;

  private _state:     "idle" | "triggered" | "falling" = "idle";
  private _timer      = WARN_TIME;
  private _shakeAccum = 0;

  /** Always zero — kept so the main loop can treat these like MovingPlatforms. */
  readonly delta = new THREE.Vector3();

  constructor(
    x: number, y: number, z: number,
    w: number, h: number, d: number,
    color: number,
    add: (o: THREE.Object3D) => void,
    colliders: THREE.Box3[],
  ) {
    this._baseColor = color;
    this._halfW = w / 2;
    this._halfD = d / 2;
    this._basePos = new THREE.Vector3(x, y + h / 2, z);

    this._mat  = new THREE.MeshLambertMaterial({ color });
    this._mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this._mat);
    this._mesh.position.copy(this._basePos);
    this._mesh.castShadow    = true;
    this._mesh.receiveShadow = true;
    add(this._mesh);

    this._collider = new THREE.Box3(
      new THREE.Vector3(x - w / 2, y,     z - d / 2),
      new THREE.Vector3(x + w / 2, y + h, z + d / 2),
    );
    colliders.push(this._collider);
    this._colliders = colliders;
  }

  isOnTop(pos: THREE.Vector3): boolean {
    if (this._state === "falling") return false;
    const c = this._collider;
    return pos.y >= c.max.y - 0.15 && pos.y <= c.max.y + 0.25
        && pos.x >= c.min.x - 0.25 && pos.x <= c.max.x + 0.25
        && pos.z >= c.min.z - 0.25 && pos.z <= c.max.z + 0.25;
  }

  /** Call AFTER entity physics each frame so entity positions are settled. */
  preUpdate(dt: number, entities: Controllable[]) {
    this.delta.set(0, 0, 0);

    if (this._state === "idle") {
      for (const e of entities) {
        if (!e.isEliminated && this.isOnTop(e.position)) {
          this._state = "triggered";
          this._timer = WARN_TIME;
          break;
        }
      }
      return;
    }

    if (this._state === "triggered") {
      this._timer      -= dt;
      this._shakeAccum += dt;

      const progress  = 1 - this._timer / WARN_TIME; // 0 → 1
      const shakeAmp  = progress * 0.14;
      const shake     = Math.sin(this._shakeAccum * 22) * shakeAmp;
      this._mesh.position.x = this._basePos.x + shake;

      // Flash between warm orange and bright red, faster near the end
      const flashFreq = 2 + progress * 12;
      const flashOn   = Math.sin(this._shakeAccum * flashFreq * Math.PI * 2) > 0;
      this._mat.color.set(flashOn ? 0xff2200 : 0xff8800);

      if (this._timer <= 0) {
        const idx = this._colliders.indexOf(this._collider);
        if (idx !== -1) this._colliders.splice(idx, 1);
        this._state = "falling";
      }
      return;
    }

    // Falling — animate the mesh plummeting
    this._mesh.position.y -= 18 * dt;
    this._mesh.rotation.x += 1.5 * dt;
    this._mesh.rotation.z += 0.8 * dt;
  }
}
