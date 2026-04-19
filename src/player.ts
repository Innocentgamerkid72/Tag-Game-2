import * as THREE from "three";
import { InputHandler } from "./input";
import { makeItSprite } from "./tagUtils";
import { GRAVITY } from "./physics";

const MOVE_SPEED         = 8;
const SPRINT_SPEED       = 13.5;   // ~1.7× walk speed
const SPRINT_STAMINA_MAX = 3.0;    // seconds of full sprint
const STAMINA_REGEN_RATE = 0.45;   // seconds recharged per second (takes ~6.7s to refill)
const JUMP_FORCE         = 18;
const PLAYER_HEIGHT      = 1.8;
const PLAYER_RADIUS      = 0.4;

export const POUNCE_COOLDOWN_MAX = 4.0;  // seconds between pounces
const POUNCE_SPEED    = 32;              // forward burst speed
const POUNCE_DURATION = 0.32;            // seconds the lunge lasts

export class Player {
  mesh: THREE.Group;
  velocity = new THREE.Vector3();
  onGround    = false;
  isIt        = false;
  tagImmunity = 0;
  isFrozen    = false;
  isEliminated = false;
  isHuman      = true;
  speedBoost   = 1;
  knockbackTimer = 0;
  hp    = 100;
  lives = 3;

  /** Horizontal look angle (yaw) in radians. */
  yaw = 0;

  private _stamina  = SPRINT_STAMINA_MAX;
  private _sprinting = false;

  private _pounceCooldown = 0;
  private _pounceTimer    = 0;

  get stamina()        { return this._stamina; }
  get maxStamina()     { return SPRINT_STAMINA_MAX; }
  get isSprinting()    { return this._sprinting; }
  get isPouncing()     { return this._pounceTimer > 0; }
  get pounceCooldown() { return this._pounceCooldown; }

  /** Launch a forward lunge in the given direction. No-op if on cooldown. */
  pounce(dir: THREE.Vector3) {
    if (this._pounceCooldown > 0) return;
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    this.velocity.x      = flat.x * POUNCE_SPEED;
    this.velocity.z      = flat.z * POUNCE_SPEED;
    this.velocity.y      = Math.max(this.velocity.y, 7); // small upward kick
    this._pounceTimer    = POUNCE_DURATION;
    this._pounceCooldown = POUNCE_COOLDOWN_MAX;
    this.knockbackTimer  = POUNCE_DURATION; // keep movement code from overriding velocity
  }

  private _body: THREE.Mesh;
  private _head: THREE.Mesh;
  private _itSprite: THREE.Sprite;
  private _nameSprite: THREE.Sprite | null = null;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Group();

    // Body
    const bodyGeo = new THREE.CapsuleGeometry(PLAYER_RADIUS, PLAYER_HEIGHT - PLAYER_RADIUS * 2, 4, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0x4488ff });
    this._body = new THREE.Mesh(bodyGeo, mat);
    this._body.position.y = PLAYER_HEIGHT / 2;
    this._body.castShadow = true;
    this.mesh.add(this._body);

    // Head direction indicator
    const headGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffcc88 });
    this._head = new THREE.Mesh(headGeo, headMat);
    this._head.position.set(0, PLAYER_HEIGHT - 0.1, 0);
    this.mesh.add(this._head);

    // Nose (shows facing direction)
    const noseGeo = new THREE.ConeGeometry(0.07, 0.3, 6);
    const noseMat = new THREE.MeshLambertMaterial({ color: 0xff4444 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, PLAYER_HEIGHT - 0.1, -0.35);
    this.mesh.add(nose);

    // "IT" crown sprite (hidden until this player is it)
    this._itSprite = makeItSprite();
    this._itSprite.position.set(0, PLAYER_HEIGHT + 0.7, 0);
    this._itSprite.visible = false;
    this.mesh.add(this._itSprite);

    scene.add(this.mesh);
  }

  get position() {
    return this.mesh.position;
  }

  setIt(it: boolean) {
    // If becoming it while frozen, unfreeze first
    if (it && this.isFrozen) {
      this.setFrozen(false);
    }
    this.isIt = it;
    this._itSprite.visible = it;
    (this._body.material as THREE.MeshLambertMaterial).color.set(it ? 0xff2200 : 0x4488ff);
    if (it) this.tagImmunity = 0;
    else    this.tagImmunity = 2;
  }

  setFrozen(frozen: boolean) {
    this.isFrozen = frozen;
    if (frozen) {
      (this._body.material as THREE.MeshLambertMaterial).color.set(0x88ddff);
      this.velocity.x = 0;
      this.velocity.z = 0;
      // Leave velocity.y intact so the player keeps falling if mid-air
    } else {
      (this._body.material as THREE.MeshLambertMaterial).color.set(this.isIt ? 0xff2200 : 0x4488ff);
    }
  }

  setEliminated(v: boolean) {
    this.isEliminated = v;
    this.mesh.visible = !v;
    if (v) this.setFrozen(true);
  }

  setName(name: string) {
    if (this._nameSprite) {
      this.mesh.remove(this._nameSprite);
      this._nameSprite.material.map?.dispose();
      this._nameSprite.material.dispose();
    }
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 64;
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
    this._nameSprite = new THREE.Sprite(mat);
    this._nameSprite.scale.set(2.5, 0.6, 1);
    this._nameSprite.position.set(0, PLAYER_HEIGHT + 0.45, 0);
    this.mesh.add(this._nameSprite);
  }

  removeFromScene(scene: THREE.Scene) {
    scene.remove(this.mesh);
  }

  update(dt: number, input: InputHandler, colliders: THREE.Box3[], walls: THREE.Box3[], boundary = 22, groundY = 0, voidBoundary?: number) {
    if (this.isEliminated) return;
    if (this.tagImmunity > 0) this.tagImmunity = Math.max(0, this.tagImmunity - dt);

    if (this._pounceCooldown > 0) this._pounceCooldown = Math.max(0, this._pounceCooldown - dt);
    if (this._pounceTimer    > 0) this._pounceTimer    = Math.max(0, this._pounceTimer    - dt);

    if (this.isFrozen) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      // Still apply gravity so a frozen player falls in void maps
      this.velocity.y += GRAVITY * dt;
      this.mesh.position.addScaledVector(this.velocity, dt);
      this.onGround = false;
      if (this.mesh.position.y <= groundY) {
        this.mesh.position.y = groundY;
        this.velocity.y = 0;
        this.onGround = true;
      }
      this._resolvePlatforms(colliders, dt);
      this._resolveWalls(walls);
      const fp = this.mesh.position;
      if (voidBoundary !== undefined && (Math.abs(fp.x) > voidBoundary || Math.abs(fp.z) > voidBoundary)) {
        this.setEliminated(true);
      }
      return;
    }

    // Rotate player yaw with mouse
    this.yaw -= input.mouseDeltaX * 0.002;
    this.mesh.rotation.y = this.yaw;

    // Movement direction relative to yaw
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const moveDir = new THREE.Vector3();
    if (input.isDown("KeyW") || input.isDown("ArrowUp")) moveDir.add(forward);
    if (input.isDown("KeyS") || input.isDown("ArrowDown")) moveDir.sub(forward);
    if (input.isDown("KeyA") || input.isDown("ArrowLeft")) moveDir.sub(right);
    if (input.isDown("KeyD") || input.isDown("ArrowRight")) moveDir.add(right);

    if (moveDir.lengthSq() > 0) moveDir.normalize();

    // Sprint (Shift) — drains stamina while held, regens when released
    const wantSprint = input.isDown("ShiftLeft") && moveDir.lengthSq() > 0;
    if (wantSprint && this._stamina > 0) {
      this._sprinting = true;
      this._stamina   = Math.max(0, this._stamina - dt);
    } else {
      this._sprinting = false;
      this._stamina   = Math.min(SPRINT_STAMINA_MAX, this._stamina + STAMINA_REGEN_RATE * dt);
    }

    if (this.knockbackTimer > 0) {
      this.knockbackTimer = Math.max(0, this.knockbackTimer - dt);
    } else {
      const speed = this._sprinting ? SPRINT_SPEED : MOVE_SPEED;
      this.velocity.x = moveDir.x * speed * this.speedBoost;
      this.velocity.z = moveDir.z * speed * this.speedBoost;
    }

    // Jump
    if ((input.isDown("Space") || input.isDown("KeyE")) && this.onGround) {
      this.velocity.y = JUMP_FORCE;
      this.onGround = false;
    }

    // Gravity
    this.velocity.y += GRAVITY * dt;

    // Integrate position
    const delta = this.velocity.clone().multiplyScalar(dt);
    this.mesh.position.add(delta);

    // Ground collision
    this.onGround = false;
    if (this.mesh.position.y <= groundY) {
      this.mesh.position.y = groundY;
      this.velocity.y = 0;
      this.onGround = true;
    }

    // Platform collision (top-surface landing)
    this._resolvePlatforms(colliders, dt);

    // Wall collision (horizontal push-out)
    this._resolveWalls(walls);

    // Invisible boundary walls — hard stop on X/Z edges
    const p = this.mesh.position;

    // Void boundary: instant elimination when past the lethal perimeter
    if (voidBoundary !== undefined) {
      if (Math.abs(p.x) > voidBoundary || Math.abs(p.z) > voidBoundary) {
        this.setEliminated(true);
        return;
      }
    }

    if (p.x > boundary) { p.x = boundary; this.velocity.x = 0; }
    if (p.x < -boundary) { p.x = -boundary; this.velocity.x = 0; }
    if (p.z > boundary) { p.z = boundary; this.velocity.z = 0; }
    if (p.z < -boundary) { p.z = -boundary; this.velocity.z = 0; }

    // Fall-out reset (safety net for non-void maps)
    if (p.y < groundY - 15) {
      p.set(0, groundY + 2, 0);
      this.velocity.set(0, 0, 0);
    }
  }

  private _resolveWalls(walls: THREE.Box3[]) {
    const p = this.mesh.position;

    for (const box of walls) {
      // Only collide if player overlaps vertically with the wall
      if (p.y + PLAYER_HEIGHT < box.min.y || p.y > box.max.y) continue;

      // Find the closest point on the box to the player center in XZ
      const closestX = Math.max(box.min.x, Math.min(p.x, box.max.x));
      const closestZ = Math.max(box.min.z, Math.min(p.z, box.max.z));
      const dx = p.x - closestX;
      const dz = p.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
        const dist = Math.sqrt(distSq);
        if (dist > 0) {
          // Push player out along the shortest horizontal axis
          const overlap = PLAYER_RADIUS - dist;
          p.x += (dx / dist) * overlap;
          p.z += (dz / dist) * overlap;
        } else {
          // Player center is exactly inside — push out along smallest X overlap
          const overlapX = PLAYER_RADIUS + (p.x < (box.min.x + box.max.x) / 2
            ? p.x - box.min.x : box.max.x - p.x);
          p.x += overlapX;
        }
      }
    }
  }

  private _resolvePlatforms(colliders: THREE.Box3[], dt: number) {
    const feet = this.mesh.position.clone();

    for (const box of colliders) {
      // Horizontal bounds check with player radius
      const inX = feet.x > box.min.x - PLAYER_RADIUS && feet.x < box.max.x + PLAYER_RADIUS;
      const inZ = feet.z > box.min.z - PLAYER_RADIUS && feet.z < box.max.z + PLAYER_RADIUS;
      if (!inX || !inZ) continue;

      const topY = box.max.y;
      const prevY = feet.y - this.velocity.y * dt;

      // Land on top: was above (or at) the surface last frame, now at or below it.
      // Window is generous on the upper side so teleported players land immediately.
      if (prevY >= topY - 0.1 && feet.y <= topY + 0.5 && this.velocity.y <= 0) {
        this.mesh.position.y = topY;
        this.velocity.y = 0;
        this.onGround = true;
      }
    }
  }
}
