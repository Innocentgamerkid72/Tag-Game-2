import * as THREE from "three";
import { Controllable } from "./types";
import { makeItSprite } from "./tagUtils";
import type { NetMsg } from "./network";
import { buildHumanoid, setHumanoidShirtColor, updateHumanoidAnimation, HumanoidParts } from "./humanoidMesh";

const SHIRT_DEFAULT = 0xee7700;
const SHIRT_IT      = 0xdd1100;
const SHIRT_FROZEN  = 0x88ddff;

const PLAYER_HEIGHT = 1.8;
const LERP_SPEED    = 12; // lerp factor (higher = snappier)

export class RemotePlayer implements Controllable {
  // ── Controllable ──────────────────────────────────────────────────────────
  readonly position: THREE.Vector3;
  readonly velocity = new THREE.Vector3();
  isIt         = false;
  tagImmunity  = 0;
  isFrozen     = false;
  isEliminated = false;
  isHuman      = true;
  speedBoost   = 1;
  knockbackTimer = 0;
  hp    = 100;
  lives = 3;

  readonly peerId: string;

  private readonly _mesh:     THREE.Group;
  private readonly _humanoid: HumanoidParts;
  private readonly _itSprite: THREE.Sprite;
  private readonly _scene:    THREE.Scene;
  private readonly _targetPos = new THREE.Vector3();
  private _lastSeen  = 0;
  private _walkCycle = 0;

  constructor(scene: THREE.Scene, peerId: string, username: string) {
    this.peerId = peerId;
    this._scene = scene;

    this._mesh = new THREE.Group();

    this._humanoid = buildHumanoid(SHIRT_DEFAULT);
    this._mesh.add(this._humanoid.group);

    this._itSprite = makeItSprite();
    this._itSprite.position.set(0, PLAYER_HEIGHT + 0.7, 0);
    this._itSprite.visible = false;
    this._mesh.add(this._itSprite);

    // Nameplate
    this._mesh.add(RemotePlayer._makeNameSprite(username));

    this.position = this._mesh.position;
    this._targetPos.copy(this._mesh.position);

    scene.add(this._mesh);
  }

  // ── Controllable methods ──────────────────────────────────────────────────
  setIt(v: boolean) {
    this.isIt = v;
    this._itSprite.visible = v;
    setHumanoidShirtColor(this._humanoid, v ? SHIRT_IT : SHIRT_DEFAULT);
    this.tagImmunity = v ? 0 : 2;
  }

  setFrozen(frozen: boolean) {
    this.isFrozen = frozen;
    setHumanoidShirtColor(this._humanoid, frozen ? SHIRT_FROZEN : (this.isIt ? SHIRT_IT : SHIRT_DEFAULT));
  }

  setEliminated(v: boolean) {
    this.isEliminated = v;
    this._mesh.visible = !v;
  }

  removeFromScene(_scene: THREE.Scene) {
    this._scene.remove(this._mesh);
  }

  // ── Network state ─────────────────────────────────────────────────────────
  applyState(msg: NetMsg & { type: "state" }) {
    this._targetPos.set(msg.x, msg.y, msg.z);
    this.velocity.set(msg.vx, msg.vy, msg.vz);
    this._mesh.rotation.y = msg.yaw;
    this._lastSeen = performance.now();

    // isIt is NOT applied from state — only explicit tag events change IT status
    // This prevents both clients overwriting each other's IT at round start
    if (msg.isFrozen !== this.isFrozen)           this.setFrozen(msg.isFrozen);
    if (msg.isEliminated !== this.isEliminated)   this.setEliminated(msg.isEliminated);
  }

  update(dt: number) {
    this.position.lerp(this._targetPos, Math.min(1, LERP_SPEED * dt));
    if (this.tagImmunity > 0) this.tagImmunity = Math.max(0, this.tagImmunity - dt);

    const horizSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    this._walkCycle += horizSpeed * dt * 2.5;
    updateHumanoidAnimation(this._humanoid, this._walkCycle, this.velocity.y > 2, horizSpeed > 10, horizSpeed);
  }

  /** True when no update received for >3 s — peer disconnected. */
  get isStale() { return performance.now() - this._lastSeen > 3000; }

  // ── Private ───────────────────────────────────────────────────────────────
  private static _makeNameSprite(name: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 10);
    ctx.fill();
    ctx.fillStyle = "#ffcc88";
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.5, 0.6, 1);
    sprite.position.set(0, PLAYER_HEIGHT + 0.45, 0);
    return sprite;
  }
}
