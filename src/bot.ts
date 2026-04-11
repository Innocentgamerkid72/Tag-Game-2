import * as THREE from "three";
import { Teleporter } from "./testMap";
import { makeItSprite } from "./tagUtils";
import { GRAVITY } from "./physics";

const MOVE_SPEED     = 7;
const CHASE_SPEED    = 9;     // faster when "it"
const FLEE_SPEED     = 8.5;   // faster when running away
const JUMP_FORCE     = 18;
const PLAYER_HEIGHT  = 1.8;
const PLAYER_RADIUS  = 0.4;
const WAYPOINT_RADIUS   = 1.5;
const WAYPOINT_TIMEOUT  = 5;
const TELEPORT_COOLDOWN = 5;
const JUMP_HEIGHT_THRESH = 0.8;  // jump if target or obstacle is this much higher
const STUCK_TIME         = 0.6;  // seconds without progress before jumping

const SAFE_DIST  = 14;   // start fleeing when "it" is within this range
const PANIC_DIST =  5;   // panic-flee and seek teleporter when this close

const BOT_COLOURS = [0xff5533, 0x33dd55, 0xffcc00, 0xcc44ff];
let _botIndex = 0;

export function resetBotIndex() { _botIndex = 0; }

export type Trackable = {
  isIt: boolean;
  tagImmunity: number;
  isFrozen: boolean;
  position: THREE.Vector3;
  velocity?: THREE.Vector3;
};

export class Bot {
  mesh: THREE.Group;
  velocity     = new THREE.Vector3();
  yaw          = Math.random() * Math.PI * 2;
  onGround     = false;
  isIt         = false;
  tagImmunity  = 0;
  isFrozen     = false;
  isEliminated = false;
  isHuman      = false;
  speedBoost     = 1;
  knockbackTimer = 0;
  hp    = 100;
  lives = 3;

  private _baseColor  : number;
  private _body        : THREE.Mesh;
  private _itSprite    : THREE.Sprite;
  private _waypoint    = new THREE.Vector3();
  private _wpTimer     = 0;
  private _boundary    = 22;
  private _stuckTimer  = 0;
  private _prevPos     = new THREE.Vector3();
  private _target      : Trackable | null = null;
  private _fleeing     = false;

  readonly name: string;

  constructor(scene: THREE.Scene, name: string, boundary = 22) {
    this.name       = name;
    this._boundary  = boundary;
    this._baseColor = BOT_COLOURS[_botIndex % BOT_COLOURS.length];
    _botIndex++;

    this.mesh = new THREE.Group();

    // Body
    this._body = new THREE.Mesh(
      new THREE.CapsuleGeometry(PLAYER_RADIUS, PLAYER_HEIGHT - PLAYER_RADIUS * 2, 4, 8),
      new THREE.MeshLambertMaterial({ color: this._baseColor })
    );
    this._body.position.y = PLAYER_HEIGHT / 2;
    this._body.castShadow = true;
    this.mesh.add(this._body);

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xffcc88 })
    );
    head.position.set(0, PLAYER_HEIGHT - 0.1, 0);
    this.mesh.add(head);

    // Nose
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.3, 6),
      new THREE.MeshLambertMaterial({ color: 0xff4444 })
    );
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, PLAYER_HEIGHT - 0.1, -0.35);
    this.mesh.add(nose);

    // "IT" badge (higher so it doesn't overlap the name tag)
    this._itSprite = makeItSprite();
    this._itSprite.position.set(0, PLAYER_HEIGHT + 1.2, 0);
    this._itSprite.visible = false;
    this.mesh.add(this._itSprite);

    // Name tag
    const nameSprite = this._makeNameSprite(name);
    nameSprite.position.set(0, PLAYER_HEIGHT + 0.55, 0);
    this.mesh.add(nameSprite);

    this.mesh.position.set(
      (Math.random() - 0.5) * 20,
      2,
      (Math.random() - 0.5) * 20
    );
    this._pickWaypoint();
    scene.add(this.mesh);
  }

  get position() { return this.mesh.position; }

  setIt(it: boolean) {
    // If becoming it while frozen, unfreeze first
    if (it && this.isFrozen) {
      this.setFrozen(false);
    }
    this.isIt = it;
    this._itSprite.visible = it;
    (this._body.material as THREE.MeshLambertMaterial).color.set(
      it ? 0xff2200 : this._baseColor
    );
    this.tagImmunity = it ? 0 : 2;
  }

  setFrozen(frozen: boolean) {
    this.isFrozen = frozen;
    if (frozen) {
      (this._body.material as THREE.MeshLambertMaterial).color.set(0x88ddff);
      this.velocity.x = 0;
      this.velocity.z = 0;
    } else {
      (this._body.material as THREE.MeshLambertMaterial).color.set(this.isIt ? 0xff2200 : this._baseColor);
    }
  }

  setEliminated(v: boolean) {
    this.isEliminated = v;
    this.mesh.visible = !v;
    if (v) {
      this.velocity.set(0, 0, 0);
      this.isFrozen = true;
    }
  }

  removeFromScene(scene: THREE.Scene) {
    scene.remove(this.mesh);
  }

  update(
    dt: number,
    colliders: THREE.Box3[],
    walls: THREE.Box3[],
    teleporters: Teleporter[],
    others: Trackable[],
    groundY = 0,
    voidBoundary?: number
  ) {
    if (this.isEliminated) return;
    if (this.tagImmunity > 0) this.tagImmunity = Math.max(0, this.tagImmunity - dt);

    if (this.isFrozen) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      // Still apply gravity so bots on platform edges fall naturally
      this.velocity.y += GRAVITY * dt;
      this.mesh.position.addScaledVector(this.velocity, dt);

      const p = this.mesh.position;
      if (p.y <= groundY) { p.y = groundY; this.velocity.y = 0; this.onGround = true; }
      this._resolvePlatforms(colliders, dt);
      this._resolveWalls(walls);
      return;
    }

    this._wpTimer -= dt;

    const p = this.mesh.position;

    // ── Strategic AI ────────────────────────────────────────────────────────
    let moveSpeed = MOVE_SPEED;
    this._fleeing = false;

    if (this.isIt) {
      // ── Chase: pick the best intercept target ──────────────────────────
      // Score = approach bonus / distance: prefer targets moving toward us
      // and closer targets.
      let bestScore = -1;
      let target: Trackable | null = null;

      for (const other of others) {
        if (other === (this as unknown as Trackable)) continue;
        if (other.isIt || other.tagImmunity > 0 || other.isFrozen) continue;
        const toOther = new THREE.Vector3().subVectors(other.position, p).setY(0);
        const dist = toOther.length();
        if (dist < 0.01) continue;
        // Bonus when target is moving toward us (dot product negative = converging)
        const tv = other.velocity ?? new THREE.Vector3();
        const approach = -toOther.dot(new THREE.Vector3(tv.x, 0, tv.z)) / (dist + 0.1);
        const score = (1 + Math.max(0, approach) * 0.4) / (dist + 1);
        if (score > bestScore) { bestScore = score; target = other; }
      }

      if (target) {
        this._target = target;
        // Predictive intercept: lead based on target's horizontal velocity
        const toTarget = new THREE.Vector3().subVectors(target.position, p).setY(0);
        const dist = toTarget.length();
        const tv = target.velocity ?? new THREE.Vector3();
        const predictTime = Math.min(dist / CHASE_SPEED, 0.7);
        const lead = new THREE.Vector3(
          target.position.x + tv.x * predictTime * 0.65,
          target.position.y,
          target.position.z + tv.z * predictTime * 0.65,
        );
        this._waypoint.copy(lead);
        this._wpTimer = 0.25;
        moveSpeed = CHASE_SPEED;
      } else {
        this._target = null;
        this._maybePickWaypoint();
      }

    } else {
      // ── Flee: accumulate repulsion from ALL "it" entities ─────────────
      const itEntities: Trackable[] = others.filter(
        o => o !== (this as unknown as Trackable) && o.isIt
      );

      if (itEntities.length > 0) {
        let closestDist = Infinity;
        for (const it of itEntities) {
          closestDist = Math.min(closestDist, p.distanceTo(it.position));
        }

        if (closestDist < SAFE_DIST) {
          moveSpeed = FLEE_SPEED;
          this._fleeing = true;

          // Sum repulsion vectors from every "it" entity + boundary walls
          const flee = new THREE.Vector3();
          for (const it of itEntities) {
            const push = new THREE.Vector3().subVectors(p, it.position).setY(0);
            const dist = push.length();
            if (dist > 0) flee.addScaledVector(push.normalize(), 1 / (dist + 0.1));
          }

          const WALL_MARGIN = 8;
          const b = this._boundary;
          if (p.x >  b - WALL_MARGIN) flee.x -= (p.x  - (b - WALL_MARGIN)) / WALL_MARGIN;
          if (p.x < -b + WALL_MARGIN) flee.x += (-b + WALL_MARGIN - p.x)   / WALL_MARGIN;
          if (p.z >  b - WALL_MARGIN) flee.z -= (p.z  - (b - WALL_MARGIN)) / WALL_MARGIN;
          if (p.z < -b + WALL_MARGIN) flee.z += (-b + WALL_MARGIN - p.z)   / WALL_MARGIN;

          if (flee.lengthSq() > 0) flee.normalize();
          const fleeTarget = p.clone().addScaledVector(flee, 10);

          if (closestDist < PANIC_DIST) {
            // Extreme panic: always update flee waypoint and seek teleporter
            this._waypoint.copy(fleeTarget);
            this._wpTimer = 0.2;
            this._seekEscapeTeleporter(teleporters);
          } else if (this._wpTimer <= 0) {
            // Mid-range and waypoint stale: prefer an elevated platform to escape onto
            if (!this._seekElevatedPlatform(colliders)) {
              this._waypoint.copy(fleeTarget);
              this._wpTimer = 0.2;
            }
          }
          // Else: keep heading to current waypoint (platform or previous flee target)
        } else {
          // Far from IT — try to rescue frozen teammates
          this._target = null;
          if (!this._rescueFrozen(others)) {
            this._maybePickWaypoint();
          }
        }
      } else {
        // No IT visible — rescue frozen teammates or wander
        this._target = null;
        if (!this._rescueFrozen(others)) {
          this._maybePickWaypoint();
        }
      }
    }

    // ── Steer toward waypoint ────────────────────────────────────────────
    const dx = this._waypoint.x - p.x;
    const dz = this._waypoint.z - p.z;
    const distToWP = Math.sqrt(dx * dx + dz * dz);

    if (distToWP > 0.1) {
      this.yaw = Math.atan2(-dx, -dz);
      this.mesh.rotation.y = this.yaw;
    }

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    if (this.knockbackTimer > 0) {
      this.knockbackTimer = Math.max(0, this.knockbackTimer - dt);
    } else {
      this.velocity.x = forward.x * moveSpeed * this.speedBoost;
      this.velocity.z = forward.z * moveSpeed * this.speedBoost;
    }

    // ── Smart jumping ────────────────────────────────────────────────────
    if (this.onGround) {
      // Use waypoint height when fleeing to platforms; target height when chasing
      const targetY = this._target ? this._target.position.y : this._waypoint.y;
      const heightDiff = targetY - p.y;
      const shouldJumpForHeight = heightDiff > JUMP_HEIGHT_THRESH;

      const movedDist = p.distanceTo(this._prevPos);
      if (movedDist < 0.05 && distToWP > WAYPOINT_RADIUS) {
        this._stuckTimer += dt;
      } else {
        this._stuckTimer = 0;
      }
      // When fleeing, jump much sooner to hop onto platforms
      const stuckThreshold = this._fleeing ? 0.15 : STUCK_TIME;
      const shouldJumpStuck = this._stuckTimer > stuckThreshold;

      if (shouldJumpForHeight || shouldJumpStuck) {
        this.velocity.y  = JUMP_FORCE;
        this.onGround    = false;
        this._stuckTimer = 0;
      }
    }
    this._prevPos.copy(p);

    // ── Physics ──────────────────────────────────────────────────────────
    this.velocity.y += GRAVITY * dt;
    p.addScaledVector(this.velocity, dt);

    this.onGround = false;
    if (p.y <= groundY) { p.y = groundY; this.velocity.y = 0; this.onGround = true; }

    this._resolvePlatforms(colliders, dt);
    this._resolveWalls(walls);

    // Void boundary: instant elimination when past the lethal perimeter
    if (voidBoundary !== undefined) {
      if (Math.abs(p.x) > voidBoundary || Math.abs(p.z) > voidBoundary) {
        this.setEliminated(true);
        return;
      }
    }

    const b = this._boundary;
    if (this.knockbackTimer <= 0) {
      if (p.x >  b) { p.x =  b; this.velocity.x = 0; this._pickWaypoint(); }
      if (p.x < -b) { p.x = -b; this.velocity.x = 0; this._pickWaypoint(); }
      if (p.z >  b) { p.z =  b; this.velocity.z = 0; this._pickWaypoint(); }
      if (p.z < -b) { p.z = -b; this.velocity.z = 0; this._pickWaypoint(); }
    }

    if (p.y < groundY - 15) { p.set(0, groundY + 2, 0); this.velocity.set(0, 0, 0); }

    // ── Teleporters ──────────────────────────────────────────────────────
    const feet = new THREE.Vector3(p.x, p.y + 0.1, p.z);
    for (const tp of teleporters) {
      if (tp.cooldown > 0) continue;
      if (!tp.trigger.containsPoint(feet)) continue;

      if (tp.sabotaged && !this.isIt) {
        // Redirect to the hunter (IT entity)
        const hunter = others.find(o => o.isIt);
        if (hunter) {
          p.copy(hunter.position);
        } else {
          p.copy(tp.destination);
        }
        tp.sabotaged = false;
        tp.sabotageProgress = 0;
        tp.sprite.visible = false;
      } else {
        p.copy(tp.destination);
      }

      this.velocity.set(0, 0, 0);
      tp.cooldown = TELEPORT_COOLDOWN;
      if (tp.link) tp.link.cooldown = TELEPORT_COOLDOWN;
      this._pickWaypoint();
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private _maybePickWaypoint() {
    const dx = this._waypoint.x - this.mesh.position.x;
    const dz = this._waypoint.z - this.mesh.position.z;
    if (Math.sqrt(dx * dx + dz * dz) < WAYPOINT_RADIUS || this._wpTimer <= 0) {
      this._pickWaypoint();
    }
  }

  private _pickWaypoint() {
    const b = this._boundary - 2;
    this._waypoint.set(
      (Math.random() - 0.5) * b * 2,
      0,
      (Math.random() - 0.5) * b * 2
    );
    this._wpTimer = WAYPOINT_TIMEOUT;
  }

  /** Move toward a frozen teammate to unfreeze them; returns true if found. */
  private _rescueFrozen(others: Trackable[]): boolean {
    let closestFrozen: Trackable | null = null;
    let closestDist = Infinity;
    for (const other of others) {
      if (other === (this as unknown as Trackable)) continue;
      if (!other.isFrozen || other.isIt) continue;
      const d = this.mesh.position.distanceTo(other.position);
      if (d < closestDist) { closestDist = d; closestFrozen = other; }
    }
    if (closestFrozen) {
      this._waypoint.copy(closestFrozen.position);
      this._wpTimer = 1.0;
      return true;
    }
    return false;
  }

  /** Aim for a reachable elevated platform to escape onto; returns true if one was found. */
  private _seekElevatedPlatform(colliders: THREE.Box3[]): boolean {
    const p = this.mesh.position;
    let bestScore = -1;
    let bestX = 0, bestZ = 0, bestY = 0;

    for (const box of colliders) {
      const topY = box.max.y;
      const heightAbove = topY - p.y;
      if (heightAbove < 0.5 || heightAbove > 6.5) continue; // must be above but jumpable

      const cx = (box.min.x + box.max.x) / 2;
      const cz = (box.min.z + box.max.z) / 2;
      const hDist = Math.sqrt((cx - p.x) ** 2 + (cz - p.z) ** 2);
      if (hDist > 9) continue; // too far away

      // Prefer higher platforms (harder for IT to follow) that are also reachable
      const score = heightAbove / (hDist + 1);
      if (score > bestScore) {
        bestScore = score;
        bestX = cx; bestZ = cz; bestY = topY;
      }
    }

    if (bestScore > 0) {
      this._waypoint.set(bestX, bestY, bestZ);
      this._wpTimer = 2.0;
      return true;
    }
    return false;
  }

  private _seekEscapeTeleporter(teleporters: Teleporter[]) {
    let bestDist = 6;
    let bestTp: Teleporter | null = null;
    for (const tp of teleporters) {
      if (tp.cooldown > 0) continue;
      const cx = (tp.trigger.min.x + tp.trigger.max.x) / 2;
      const cz = (tp.trigger.min.z + tp.trigger.max.z) / 2;
      const d  = this.mesh.position.distanceTo(new THREE.Vector3(cx, this.mesh.position.y, cz));
      if (d < bestDist) { bestDist = d; bestTp = tp; }
    }
    if (bestTp) {
      const cx = (bestTp.trigger.min.x + bestTp.trigger.max.x) / 2;
      const cz = (bestTp.trigger.min.z + bestTp.trigger.max.z) / 2;
      this._waypoint.set(cx, 0, cz);
      this._wpTimer = 2;
    }
  }

  private _resolvePlatforms(colliders: THREE.Box3[], dt: number) {
    const feet = this.mesh.position.clone();
    for (const box of colliders) {
      const inX = feet.x > box.min.x - PLAYER_RADIUS && feet.x < box.max.x + PLAYER_RADIUS;
      const inZ = feet.z > box.min.z - PLAYER_RADIUS && feet.z < box.max.z + PLAYER_RADIUS;
      if (!inX || !inZ) continue;
      const topY = box.max.y;
      const prevY = feet.y - this.velocity.y * dt;
      if (prevY >= topY - 0.1 && feet.y <= topY + 0.5 && this.velocity.y <= 0) {
        this.mesh.position.y = topY;
        this.velocity.y = 0;
        this.onGround   = true;
      }
    }
  }

  private _resolveWalls(walls: THREE.Box3[]) {
    const p = this.mesh.position;
    for (const box of walls) {
      if (p.y + PLAYER_HEIGHT < box.min.y || p.y > box.max.y) continue;
      const cx = Math.max(box.min.x, Math.min(p.x, box.max.x));
      const cz = Math.max(box.min.z, Math.min(p.z, box.max.z));
      const dx = p.x - cx, dz = p.z - cz;
      const distSq = dx * dx + dz * dz;
      if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
        const dist = Math.sqrt(distSq);
        if (dist > 0) {
          p.x += (dx / dist) * (PLAYER_RADIUS - dist);
          p.z += (dz / dist) * (PLAYER_RADIUS - dist);
        }
        this._pickWaypoint();
      }
    }
  }

  private _makeNameSprite(name: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width  = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 10);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.5, 0.6, 1);
    return sprite;
  }
}
