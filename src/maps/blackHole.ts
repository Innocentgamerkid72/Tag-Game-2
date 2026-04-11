import * as THREE from "three";
import { Controllable } from "../types";
import { GRAVITY } from "../physics";

const PULL_RADIUS    = 8.0;  // units — start being pulled
const CAPTURE_RADIUS = 2.2;  // units — captured and held
const HOLD_DURATION  = 3;    // seconds held before fling
const FLING_FORCE    = 28;   // units/s of fling velocity
const PATROL_SPEED   = 2.5;  // units/s along patrol path

export class BlackHole {
  private _mesh:  THREE.Group;
  private _rings: THREE.Mesh[];
  private _patrolA: THREE.Vector3;
  private _patrolB: THREE.Vector3;
  private _patrolDist: number;
  private _t   = 0;
  private _dir = 1;
  // entity → seconds it has been held
  private _captured = new Map<Controllable, number>();

  get position() { return this._mesh.position; }

  constructor(
    patrolA: THREE.Vector3,
    patrolB: THREE.Vector3,
    /** Pass the map's `add()` helper so the mesh is tracked for disposal. */
    add: (o: THREE.Object3D) => void
  ) {
    this._patrolA    = patrolA.clone();
    this._patrolB    = patrolB.clone();
    this._patrolDist = patrolA.distanceTo(patrolB);

    this._mesh = new THREE.Group();
    this._mesh.position.copy(patrolA);

    // ── Singularity core ─────────────────────────────────────────────────
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    this._mesh.add(core);

    // ── Accretion rings ───────────────────────────────────────────────────
    this._rings = [];
    const ringDefs = [
      { r: 1.7, tube: 0.09, color: 0x7700ee },
      { r: 2.6, tube: 0.07, color: 0x440099 },
      { r: 3.6, tube: 0.05, color: 0x220055 },
    ];
    for (let i = 0; i < ringDefs.length; i++) {
      const d    = ringDefs[i];
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(d.r, d.tube, 8, 64),
        new THREE.MeshBasicMaterial({ color: d.color })
      );
      ring.rotation.x = (Math.PI / 2.5) * i;
      ring.rotation.y = (Math.PI / 4.0) * i;
      this._mesh.add(ring);
      this._rings.push(ring);
    }

    // ── Outer distortion halo ─────────────────────────────────────────────
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(5, 0.03, 4, 80),
      new THREE.MeshBasicMaterial({ color: 0x110033, transparent: true, opacity: 0.6 })
    );
    this._mesh.add(halo);

    // ── Purple glow ───────────────────────────────────────────────────────
    const light = new THREE.PointLight(0x9900ff, 2.5, 14);
    this._mesh.add(light);

    add(this._mesh);
  }

  update(dt: number, entities: Controllable[]) {
    // ── Patrol (ping-pong) ────────────────────────────────────────────────
    if (this._patrolDist > 0) {
      this._t += (dt * PATROL_SPEED / this._patrolDist) * this._dir;
      if (this._t >= 1) { this._t = 1; this._dir = -1; }
      if (this._t <= 0) { this._t = 0; this._dir =  1; }
      this._mesh.position.lerpVectors(this._patrolA, this._patrolB, this._t);
    }

    // ── Ring spin ─────────────────────────────────────────────────────────
    for (let i = 0; i < this._rings.length; i++) {
      this._rings[i].rotation.z += dt * (0.9 + i * 0.55) * (i % 2 === 0 ? 1 : -1);
    }

    const bPos = this._mesh.position;

    // ── Per-entity interaction ────────────────────────────────────────────
    for (const e of entities) {
      if (e.isEliminated) {
        if (this._captured.has(e)) { this._captured.delete(e); e.setFrozen(false); }
        continue;
      }

      if (this._captured.has(e)) {
        // ── Hold phase: orbit entity tightly around singularity ───────────
        const held = this._captured.get(e)! + dt;
        this._captured.set(e, held);

        const angle = held * 2.2;
        e.position.set(
          bPos.x + Math.cos(angle) * 1.2,
          bPos.y + Math.sin(angle * 0.6) * 0.5,
          bPos.z + Math.sin(angle) * 1.2
        );

        // Pre-cancel the gravity that player.update will apply next frame
        // (velocity.y += GRAVITY*dt). This prevents downward drift and stops
        // _resolvePlatforms from snapping the captured entity to platforms
        // (which triggers only when velocity.y <= 0).
        e.velocity.set(0, -GRAVITY * dt, 0);
        e.tagImmunity = Math.max(e.tagImmunity, 0.15); // prevent tagging while held
        e.knockbackTimer = 0.15; // prevent input fighting the hold

        if (held >= HOLD_DURATION) {
          // ── Fling! ────────────────────────────────────────────────────
          this._captured.delete(e);
          e.setFrozen(false);
          // Fling radially outward from this black hole so the player is
          // never launched toward it (or the other black hole nearby).
          const flingDir = new THREE.Vector3()
            .subVectors(e.position, bPos)
            .normalize();
          // Guarantee a meaningful upward component even if the orbit
          // happened to be nearly horizontal.
          flingDir.y = Math.max(flingDir.y, 0.45);
          flingDir.normalize();
          e.velocity.copy(flingDir.multiplyScalar(FLING_FORCE));
          e.tagImmunity = Math.max(e.tagImmunity, 2.5); // brief immunity post-fling
          e.knockbackTimer = 0.6;
        }

      } else {
        const dist = e.position.distanceTo(bPos);

        if (dist < CAPTURE_RADIUS && !e.isFrozen) {
          // ── Capture ───────────────────────────────────────────────────
          this._captured.set(e, 0);
          e.setFrozen(true);
          e.velocity.set(0, -GRAVITY * dt, 0);

        } else if (dist < PULL_RADIUS && !this._isHeldByOther(e)) {
          // ── Gravitational pull (quadratic falloff — much stronger near center) ─
          const t        = 1 - dist / PULL_RADIUS;
          const strength = t * t * 26;
          const pullDir  = new THREE.Vector3().subVectors(bPos, e.position).normalize();
          e.velocity.addScaledVector(pullDir, strength * dt);
        }
      }
    }
  }

  /** True if this entity is currently held by any black hole (frozen by capture). */
  private _isHeldByOther(e: Controllable): boolean {
    // If the entity is frozen and we didn't capture it, another BH must have.
    // Don't apply pull — it would fight the other BH's orbit.
    return e.isFrozen;
  }
}
