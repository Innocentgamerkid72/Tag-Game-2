// ── Network message types ─────────────────────────────────────────────────────
export type NetMsg =
  | { type: "state"; peerId: string; username: string;
      x: number; y: number; z: number;
      vx: number; vy: number; vz: number;
      yaw: number; isIt: boolean; isFrozen: boolean; isEliminated: boolean; }
  | { type: "tag";   peerId: string; taggerId: string; taggedId: string; }
  | { type: "leave"; peerId: string; };

// ── Relay server URL ──────────────────────────────────────────────────────────
// After deploying the server (see server/index.js), replace this with your URL.
// Example: "wss://tag-game-2.onrender.com"
const RELAY_URL = "wss://tag-game-2-server.onrender.com";

// ── NetworkManager ────────────────────────────────────────────────────────────
export class NetworkManager {
  readonly peerId:   string;
  readonly roomCode: string;

  private _ws: WebSocket | null = null;
  private _handler: ((msg: NetMsg) => void) | null = null;

  constructor() {
    this.peerId   = crypto.randomUUID();
    this.roomCode = NetworkManager._resolveRoomCode();
  }

  private static _resolveRoomCode(): string {
    const params = new URLSearchParams(window.location.search);
    let code = params.get("room");
    if (!code) {
      code = Math.random().toString(36).slice(2, 8).toUpperCase();
      params.set("room", code);
      window.history.replaceState({}, "", `?${params.toString()}`);
    }
    return code;
  }

  connect(handler: (msg: NetMsg) => void) {
    this._handler = handler;
    try {
      this._ws = new WebSocket(`${RELAY_URL}?room=${this.roomCode}`);
    } catch {
      return; // server unreachable — game runs solo
    }
    this._ws.onmessage = ({ data }) => {
      try {
        const msg = JSON.parse(data) as NetMsg;
        if (msg.peerId !== this.peerId) this._handler?.(msg);
      } catch { /* ignore malformed frames */ }
    };
    this._ws.onerror = () => { /* silently degrade to solo */ };
  }

  sendState(s: Omit<NetMsg & { type: "state" }, "type" | "peerId">) {
    this._send({ type: "state", peerId: this.peerId, ...s });
  }

  sendTag(taggerId: string, taggedId: string) {
    this._send({ type: "tag", peerId: this.peerId, taggerId, taggedId });
  }

  sendLeave() {
    this._send({ type: "leave", peerId: this.peerId });
  }

  private _send(msg: NetMsg) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(msg));
    }
  }
}
