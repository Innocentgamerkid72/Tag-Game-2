import * as THREE from "three";

const PUDDLE_RADIUS   = 2.6;
const PUDDLE_DURATION = 10.0;   // seconds before puddle vanishes
const SLOW_FACTOR     = 0.38;   // speedBoost multiplier while inside puddle

export class AcidPuddle {
  readonly x: number;
  readonly z: number;
  readonly radiusSq = PUDDLE_RADIUS * PUDDLE_RADIUS;
  private _duration  = PUDDLE_DURATION;
  private readonly _mesh:  THREE.Mesh;
  private readonly _inner: THREE.Mesh;
  private readonly _light: THREE.PointLight;
  private _pulseT = 0;

  get isExpired() { return this._duration <= 0; }

  constructor(private readonly _scene: THREE.Scene, x: number, y: number, z: number) {
    this.x = x;
    this.z = z;

    // Outer puddle disc
    this._mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(PUDDLE_RADIUS, PUDDLE_RADIUS, 0.07, 20),
      new THREE.MeshBasicMaterial({ color: 0x22dd00, transparent: true, opacity: 0.55 }),
    );
    this._mesh.position.set(x, y + 0.035, z);
    _scene.add(this._mesh);

    // Inner dark core (toxic look)
    this._inner = new THREE.Mesh(
      new THREE.CylinderGeometry(PUDDLE_RADIUS * 0.55, PUDDLE_RADIUS * 0.55, 0.08, 14),
      new THREE.MeshBasicMaterial({ color: 0x005500, transparent: true, opacity: 0.75 }),
    );
    this._inner.position.set(x, y + 0.04, z);
    _scene.add(this._inner);

    // Toxic glow
    this._light = new THREE.PointLight(0x44ff11, 0.8, 6);
    this._light.position.set(x, y + 0.6, z);
    _scene.add(this._light);
  }

  /** Returns false once the puddle has fully expired. */
  update(dt: number): boolean {
    this._duration -= dt;
    if (this._duration <= 0) return false;

    this._pulseT += dt * 3;
    const pulse = 0.55 + 0.45 * Math.sin(this._pulseT);

    // Fade in last 2.5 seconds
    const fade = Math.min(1, this._duration / 2.5);
    (this._mesh.material  as THREE.MeshBasicMaterial).opacity = 0.55 * fade;
    (this._inner.material as THREE.MeshBasicMaterial).opacity = 0.75 * fade * pulse;
    this._light.intensity = 0.8 * fade;

    return true;
  }

  /** Returns true if the XZ position falls inside the puddle's slow zone. */
  containsXZ(x: number, z: number): boolean {
    const dx = x - this.x;
    const dz = z - this.z;
    return dx * dx + dz * dz <= this.radiusSq;
  }

  get slowFactor() { return SLOW_FACTOR; }

  dispose() {
    this._scene.remove(this._mesh);
    this._scene.remove(this._inner);
    this._scene.remove(this._light);
    (this._mesh.material  as THREE.MeshBasicMaterial).dispose();
    (this._inner.material as THREE.MeshBasicMaterial).dispose();
    this._mesh.geometry.dispose();
    this._inner.geometry.dispose();
  }
}
