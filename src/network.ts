import { Realtime, type RealtimeChannel, type Message } from "ably";

// ── Message types ─────────────────────────────────────────────────────────────
export type NetMsg =
  | { type: "state"; peerId: string; username: string; isAdmin: boolean;
      x: number; y: number; z: number;
      vx: number; vy: number; vz: number;
      yaw: number; isFrozen: boolean; isEliminated: boolean; }
  | { type: "tag";   peerId: string; taggerId: string; taggedId: string; }
  | { type: "setit"; peerId: string; itPeerId: string; roundId: number; }
  | { type: "leave"; peerId: string; };

const ABLY_KEY = "CTFlEA.V1yraA:sxcJVgiYCm20Ts4jknPPnR3nr6rwN1P-EBOECxWt8FI";

// Small status indicator shown in-game
function setStatus(text: string, color = "#aaaaaa") {
  const el = document.getElementById("net-status");
  if (el) { el.textContent = text; el.style.color = color; }
}

// ── NetworkManager ────────────────────────────────────────────────────────────
export class NetworkManager {
  readonly peerId:   string;
  readonly roomCode: string;

  private _channel: RealtimeChannel | null = null;
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
    setStatus("Connecting…", "#ffcc44");

    let ably: Realtime;
    try {
      ably = new Realtime({ key: ABLY_KEY, clientId: this.peerId });
    } catch (e) {
      setStatus(`Init error: ${e}`, "#ff4444");
      return;
    }

    ably.connection.on("connected", () => setStatus("Online ✓", "#44ff88"));
    ably.connection.on("failed",    (err) => setStatus(`Failed: ${err?.reason?.message ?? err}`, "#ff4444"));
    ably.connection.on("disconnected", () => setStatus("Disconnected", "#ff8844"));
    ably.connection.on("suspended",    () => setStatus("Suspended", "#ff8844"));

    this._channel = ably.channels.get(`tag-game-${this.roomCode}`);
    this._channel.subscribe((msg: Message) => {
      try {
        const data = msg.data as NetMsg;
        if (data.peerId !== this.peerId) this._handler?.(data);
      } catch { /* ignore malformed */ }
    });
  }

  sendState(s: Omit<NetMsg & { type: "state" }, "type" | "peerId">) {
    this._publish({ type: "state", peerId: this.peerId, ...s });
  }

  sendTag(taggerId: string, taggedId: string) {
    this._publish({ type: "tag", peerId: this.peerId, taggerId, taggedId });
  }

  sendSetIt(itPeerId: string, roundId: number) {
    this._publish({ type: "setit", peerId: this.peerId, itPeerId, roundId });
  }

  sendLeave() {
    this._publish({ type: "leave", peerId: this.peerId });
  }

  private _publish(msg: NetMsg) {
    this._channel?.publish("msg", msg);
  }
}
