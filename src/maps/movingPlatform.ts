import * as THREE from "three";

export class MovingPlatform {
  private _mesh:        THREE.Mesh;
  private _collider:    THREE.Box3;
  private _halfW:       number;
  private _halfH:       number;
  private _halfD:       number;
  private _patrolA:     THREE.Vector3;
  private _patrolB:     THREE.Vector3;
  private _patrolDist:  number;
  private _t    = 0;
  private _dir  = 1;
  private _speed: number;

  /** Change in world position this frame — apply to entities standing on top. */
  readonly delta = new THREE.Vector3();

  constructor(
    patrolA: THREE.Vector3,
    patrolB: THREE.Vector3,
    w: number, h: number, d: number,
    color:  number,
    speed:  number,
    add:    (o: THREE.Object3D) => void,
    /** The map's colliders array — the platform's Box3 is pushed into it. */
    colliders: THREE.Box3[]
  ) {
    this._patrolA    = patrolA.clone();
    this._patrolB    = patrolB.clone();
    this._patrolDist = patrolA.distanceTo(patrolB);
    this._speed      = speed;
    this._halfW      = w / 2;
    this._halfH      = h / 2;
    this._halfD      = d / 2;

    this._mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color })
    );
    this._mesh.position.copy(patrolA);
    this._mesh.castShadow    = true;
    this._mesh.receiveShadow = true;
    add(this._mesh);

    this._collider = new THREE.Box3();
    this._refreshCollider();
    colliders.push(this._collider);
  }

  private _refreshCollider() {
    const p  = this._mesh.position;
    this._collider.set(
      new THREE.Vector3(p.x - this._halfW, p.y - this._halfH, p.z - this._halfD),
      new THREE.Vector3(p.x + this._halfW, p.y + this._halfH, p.z + this._halfD)
    );
  }

  /** Call once per frame BEFORE entity physics to move the platform. */
  preUpdate(dt: number) {
    if (this._patrolDist === 0) { this.delta.set(0, 0, 0); return; }

    const prev = this._mesh.position.clone();

    this._t += (dt * this._speed / this._patrolDist) * this._dir;
    if (this._t >= 1) { this._t = 1; this._dir = -1; }
    if (this._t <= 0) { this._t = 0; this._dir =  1; }

    this._mesh.position.lerpVectors(this._patrolA, this._patrolB, this._t);
    this.delta.subVectors(this._mesh.position, prev);
    this._refreshCollider();
  }

  /**
   * Returns true if `pos` (entity feet position) is on top of this platform.
   * Call AFTER entity physics so the position has been resolved.
   */
  isOnTop(pos: THREE.Vector3): boolean {
    const c = this._collider;
    const atTop = pos.y >= c.max.y - 0.15 && pos.y <= c.max.y + 0.25;
    const inXZ  = pos.x >= c.min.x - 0.25 && pos.x <= c.max.x + 0.25
               && pos.z >= c.min.z - 0.25 && pos.z <= c.max.z + 0.25;
    return atTop && inXZ;
  }
}
