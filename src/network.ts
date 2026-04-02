import Ably from "ably";

// ── Message types ─────────────────────────────────────────────────────────────
export type NetMsg =
  | { type: "state"; peerId: string; username: string;
      x: number; y: number; z: number;
      vx: number; vy: number; vz: number;
      yaw: number; isIt: boolean; isFrozen: boolean; isEliminated: boolean; }
  | { type: "tag";   peerId: string; taggerId: string; taggedId: string; }
  | { type: "leave"; peerId: string; };

const ABLY_KEY = "CTFlEA.V1yraA:sxcJVgiYCm20Ts4jknPPnR3nr6rwN1P-EBOECxWt8FI";

// ── NetworkManager ────────────────────────────────────────────────────────────
export class NetworkManager {
  readonly peerId:   string;
  readonly roomCode: string;

  private _channel: Ably.RealtimeChannel | null = null;
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
      const ably = new Ably.Realtime({ key: ABLY_KEY, clientId: this.peerId });
      this._channel = ably.channels.get(`tag-game-${this.roomCode}`);
      this._channel.subscribe((msg) => {
        try {
          const data = msg.data as NetMsg;
          if (data.peerId !== this.peerId) this._handler?.(data);
        } catch { /* ignore malformed */ }
      });
    } catch {
      /* silently degrade to solo if Ably is unreachable */
    }
  }

  sendState(s: Omit<NetMsg & { type: "state" }, "type" | "peerId">) {
    this._publish({ type: "state", peerId: this.peerId, ...s });
  }

  sendTag(taggerId: string, taggedId: string) {
    this._publish({ type: "tag", peerId: this.peerId, taggerId, taggedId });
  }

  sendLeave() {
    this._publish({ type: "leave", peerId: this.peerId });
  }

  private _publish(msg: NetMsg) {
    this._channel?.publish("msg", msg);
  }
}
