import * as THREE from "three";
import { Player } from "./player";
import { Bot, resetBotIndex } from "./bot";
import { Controllable } from "./types";
import { GameMode } from "./modes/gameMode";
import { TagMode } from "./modes/tagMode";
import { FreezeTagMode } from "./modes/freezeTagMode";
import { HotPotatoMode } from "./modes/hotPotatoMode";
import { InfectionMode } from "./modes/infectionMode";
import { HunterMode } from "./modes/hunterMode";
import { TomfooleryMode } from "./modes/tomfooleryMode";
import { buildTestMap, MapResult, Teleporter } from "./testMap";
import { buildRetroCity } from "./maps/retroCity";
import { buildSpaceRuins } from "./maps/spaceRuins";
import { buildTomfooleryMap } from "./maps/tomfooleryMap";
import { setGravity } from "./physics";

const ROUND_TIME = 60;
const TRANSITION_TIME = 10; // longer so admin has time to pick
const HUMAN_PLAYERS = 1;
const BOT_NAMES = ["Alpha", "Bravo", "Charlie"];

const MAP_BUILDERS = [buildTestMap, buildRetroCity, buildSpaceRuins, buildTomfooleryMap];
const MAP_NAMES    = ["Grasslands", "Retro City", "Space Ruins", "Void Arena"];
// Indices for the exclusive Tomfoolery pairing
const TOMFOOLERY_MAP_IDX  = 3;
const TOMFOOLERY_MODE_IDX = 5;
const MODES: GameMode[] = [new TagMode(), new FreezeTagMode(), new HotPotatoMode(), new InfectionMode(), new HunterMode(), new TomfooleryMode()];

export class RoundManager {
  private _timer = ROUND_TIME;
  private _roundId = 0;
  get roundId() { return this._roundId; }
  private _mapIdx = 0;
  private _modeIdx = 0;
  private _transitioning = false;
  private _allEntities: Controllable[] = [];
  private _transitionTimer = 0;
  private _currentMap: MapResult | null = null;
  private _bots: Bot[] = [];
  private _mode: GameMode = MODES[0];
  // Admin overrides — null means use random pick
  private _adminMapIdx:  number | null = null;
  private _adminModeIdx: number | null = null;
  isAdmin = false;

  constructor(
    private _scene: THREE.Scene,
    private _player: Player,
    private _timerEl: HTMLElement,
    private _modeEl: HTMLElement,
    private _statusEl: HTMLElement,
    private _overlayEl: HTMLElement,
  ) {}

  get bots() { return this._bots; }
  get map() { return this._currentMap; }
  get mode() { return this._mode; }
  get mapNames() { return MAP_NAMES; }
  get modeNames() { return MODES.map(m => m.name); }
  get nextMapIdx()  { return this._adminMapIdx  ?? this._mapIdx; }
  get nextModeIdx() { return this._adminModeIdx ?? this._modeIdx; }
  setNextMap(idx: number | null)  { this._adminMapIdx  = idx; }
  setNextMode(idx: number | null) { this._adminModeIdx = idx; }

  startRound() {
    try {
      this._buildRound();
    } catch (e) {
      document.body.innerHTML += `<div style="position:fixed;top:0;left:0;width:100%;background:red;color:white;font-size:20px;z-index:99999;padding:20px;font-family:monospace;white-space:pre-wrap;">CRASH IN _buildRound:\n${e}</div>`;
    }
  }

  forceEndRound() {
    this._timer = 0;
  }

  update(dt: number, allEntities: Controllable[]) {
    if (this._transitioning) {
      this._transitionTimer -= dt;
      // Update the live countdown shown in the overlay
      const countdown = document.getElementById("adm-countdown");
      if (countdown) countdown.textContent = String(Math.max(1, Math.ceil(this._transitionTimer)));
      if (this._transitionTimer <= 0) {
        this._transitioning = false;
        this._overlayEl.style.display = "none";
        try {
          this._buildRound();
        } catch (e) {
          document.body.innerHTML += `<div style="position:fixed;top:0;left:0;width:100%;background:red;color:white;font-size:20px;z-index:99999;padding:20px;font-family:monospace;white-space:pre-wrap;">CRASH IN _buildRound:\n${e}</div>`;
        }
      }
      return;
    }

    this._timer -= dt;
    const timeLeft = Math.max(0, Math.ceil(this._timer));
    this._timerEl.textContent = String(timeLeft);
    this._timerEl.style.color = timeLeft <= 10 ? "#ff4444" : "#ffffff";

    this._allEntities = allEntities;

    // Speed buff for IT entities in the last 10 seconds
    const lastSeconds = this._timer <= 10;
    for (const e of allEntities) {
      e.speedBoost = (lastSeconds && e.isIt) ? 1.4 : 1;
    }

    this._modeEl.textContent = this._mode.name;
    this._statusEl.textContent = this._mode.getHud(this._player as unknown as Controllable, allEntities);

    this._mode.update(dt, allEntities, this._currentMap?.teleporters);

    // Map hazards (black holes, etc.)
    if (this._currentMap?.hazards) {
      for (const h of this._currentMap.hazards) h.update(dt, allEntities);
    }

    // Void death — eliminate anyone who has fallen below the map's death floor
    const fallDeathY = this._currentMap?.fallDeathY;
    if (fallDeathY !== undefined) {
      for (const e of allEntities) {
        if (!e.isEliminated && e.position.y < fallDeathY) {
          console.warn(`[fallDeath] entity eliminated at y=${e.position.y.toFixed(2)}, fallDeathY=${fallDeathY}`);
          e.setEliminated(true);
        }
      }
    }

    if (this._timer <= 0 || this._mode.isRoundOver(allEntities)) {
      const active = allEntities.filter(e => !e.isEliminated);
      console.log(`[RoundOver] timer=${this._timer.toFixed(1)}, active=${active.length}`);
      this._startTransition();
    }
  }

  updateTeleporters(dt: number, playerFeet: THREE.Vector3, player: Player, drawSprite: (tp: Teleporter) => void) {
    const map = this._currentMap;
    if (!map) return;
    for (const tp of map.teleporters) {
      if (tp.cooldown > 0) {
        tp.cooldown = Math.max(0, tp.cooldown - dt);
        drawSprite(tp);
        if (tp.cooldown === 0) tp.sprite.visible = false;
      }
      if (tp.cooldown === 0 && tp.trigger.containsPoint(playerFeet)) {
        if (tp.sabotaged && !player.isIt) {
          // Sabotaged teleporter — redirect non-hunter to hunter's position.
          // Only use hunter's position if they're alive and above the void floor.
          const safeFloor = (this._currentMap?.fallDeathY ?? -Infinity) + 2;
          const hunter = this._allEntities.find(
            e => e.isIt && !e.isEliminated && e.position.y >= safeFloor
          );
          if (hunter) {
            player.position.copy(hunter.position);
            // Land the player slightly above the hunter so they don't clip into them
            player.position.y = Math.max(hunter.position.y + 0.1, safeFloor);
          } else {
            // Hunter is in the void or doesn't exist — use normal destination instead
            player.position.copy(tp.destination);
          }
          tp.sabotaged = false;
          tp.sabotageProgress = 0;
        } else {
          player.position.copy(tp.destination);
        }
        player.velocity.set(0, 0, 0);
        tp.cooldown = 5;
        if (tp.link) tp.link.cooldown = 5;
        tp.sprite.visible = true;
        drawSprite(tp);
        if (tp.link) { tp.link.sprite.visible = true; drawSprite(tp.link); }
      }
    }
  }

  private _startTransition() {
    this._transitioning = true;
    this._transitionTimer = TRANSITION_TIME;

    // If admin pre-selected a mode, bake it in; otherwise pick randomly
    if (this._adminModeIdx !== null) {
      this._modeIdx = this._adminModeIdx;
      this._adminModeIdx = null;
    } else {
      let nextMode = this._modeIdx;
      for (let tries = 0; tries < 20; tries++) {
        const candidate = (this._modeIdx + 1 + Math.floor(Math.random() * (MODES.length - 1))) % MODES.length;
        if (MODES[candidate].rare && Math.random() > 0.2) continue;
        nextMode = candidate;
        break;
      }
      this._modeIdx = nextMode;
    }

    // If admin pre-selected a map, bake it in; otherwise pick randomly
    if (this._adminMapIdx !== null) {
      this._mapIdx = this._adminMapIdx;
      this._adminMapIdx = null;
    } else {
      let nextMap = this._mapIdx;
      if (this._modeIdx === TOMFOOLERY_MODE_IDX) {
        nextMap = TOMFOOLERY_MAP_IDX;
      } else {
        for (let tries = 0; tries < 20; tries++) {
          const candidate = (this._mapIdx + 1 + Math.floor(Math.random() * (MAP_BUILDERS.length - 1))) % MAP_BUILDERS.length;
          if (candidate === TOMFOOLERY_MAP_IDX) continue;
          nextMap = candidate;
          break;
        }
      }
      this._mapIdx = nextMap;
    }

    this._renderAdminOverlay();
    this._overlayEl.style.display = "flex";
    // Keep the old map + bots alive so they remain visible behind the overlay.
    // They are cleaned up at the start of _buildRound.
  }

  private _renderAdminOverlay() {
    const btnBase =
      "margin:3px;padding:6px 10px;cursor:pointer;font-family:monospace;" +
      "font-size:0.85rem;border:2px solid #555;background:#1a1a2e;color:#ccc;" +
      "border-radius:4px;";
    const btnSel =
      "margin:3px;padding:6px 10px;cursor:pointer;font-family:monospace;" +
      "font-size:0.85rem;border:2px solid #ffcc00;background:#2a2a00;color:#ffee66;" +
      "border-radius:4px;font-weight:bold;";

    const mapBtns = MAP_NAMES.map((name, i) =>
      `<button id="adm-map-${i}" style="${i === this._modeIdx && this._adminMapIdx === i ? btnSel : btnBase}" data-map="${i}">${name}</button>`
    ).join("");

    const modeBtns = MODES.map((m, i) =>
      `<button id="adm-mode-${i}" style="${btnBase}" data-mode="${i}">${m.name}${m.rare ? " ★" : ""}</button>`
    ).join("");

    const nextMapName  = MAP_NAMES[this._adminMapIdx  ?? this._mapIdx];
    const nextModeName = MODES[this._adminModeIdx ?? this._modeIdx].name;

    const adminPanel = this.isAdmin ? `
      <button id="adm-toggle" style="margin-top:14px;padding:5px 14px;cursor:pointer;font-family:monospace;font-size:0.75rem;border:1px solid #555;background:#111;color:#ffcc00;border-radius:4px;letter-spacing:1px;">⚙ ADMIN</button>
      <div id="adm-panel" style="display:none;margin-top:10px;padding:14px 20px;background:rgba(0,0,0,0.5);border:1px solid #444;border-radius:8px;max-width:560px">
        <div style="font-size:0.8rem;color:#ffcc00;letter-spacing:2px;margin-bottom:10px">PICK NEXT ROUND</div>
        <div style="font-size:0.75rem;color:#999;margin-bottom:4px">MAP</div>
        <div style="margin-bottom:10px">${mapBtns}</div>
        <div style="font-size:0.75rem;color:#999;margin-bottom:4px">MODE</div>
        <div>${modeBtns}</div>
        <div style="margin-top:10px;font-size:0.7rem;color:#666">Leave unselected to use the random pick.</div>
      </div>
      <div style="margin-top:10px;font-size:1rem;color:#888">Starting in <span id="adm-countdown">${TRANSITION_TIME}</span>s…</div>
    ` : `<div style="margin-top:12px;font-size:1rem;color:#888">Starting in <span id="adm-countdown">${TRANSITION_TIME}</span>s…</div>`;

    this._overlayEl.innerHTML = `
      <div style="font-size:2.5rem;font-weight:bold">ROUND OVER!</div>
      <div id="adm-next" style="font-size:1.1rem;margin-top:8px;color:#aaddff">
        Next: <b>${nextModeName}</b> on <b>${nextMapName}</b>
      </div>
      ${adminPanel}`;

    // Wire up admin buttons after the DOM updates
    if (this.isAdmin) {
      setTimeout(() => {
        const toggle = document.getElementById("adm-toggle");
        const panel  = document.getElementById("adm-panel");
        if (toggle && panel) {
          toggle.addEventListener("click", () => {
            const open = panel.style.display === "none";
            panel.style.display = open ? "block" : "none";
            toggle.style.background = open ? "#2a2a00" : "#111";
          });
        }
        for (let i = 0; i < MAP_NAMES.length; i++) {
          const btn = document.getElementById(`adm-map-${i}`);
          if (!btn) continue;
          btn.addEventListener("click", () => {
            this._adminMapIdx = i;
            this._refreshAdminHighlights();
          });
        }
        for (let i = 0; i < MODES.length; i++) {
          const btn = document.getElementById(`adm-mode-${i}`);
          if (!btn) continue;
          btn.addEventListener("click", () => {
            this._adminModeIdx = i;
            this._refreshAdminHighlights();
          });
        }
      }, 0);
    }
  }

  private _refreshAdminHighlights() {
    const btnBase =
      "margin:3px;padding:6px 10px;cursor:pointer;font-family:monospace;" +
      "font-size:0.85rem;border:2px solid #555;background:#1a1a2e;color:#ccc;" +
      "border-radius:4px;";
    const btnSel =
      "margin:3px;padding:6px 10px;cursor:pointer;font-family:monospace;" +
      "font-size:0.85rem;border:2px solid #ffcc00;background:#2a2a00;color:#ffee66;" +
      "border-radius:4px;font-weight:bold;";

    for (let i = 0; i < MAP_NAMES.length; i++) {
      const btn = document.getElementById(`adm-map-${i}`);
      if (btn) btn.style.cssText = i === this._adminMapIdx ? btnSel : btnBase;
    }
    for (let i = 0; i < MODES.length; i++) {
      const btn = document.getElementById(`adm-mode-${i}`);
      if (btn) btn.style.cssText = i === this._adminModeIdx ? btnSel : btnBase;
    }

    const nextEl = document.getElementById("adm-next");
    if (nextEl) {
      const mapName  = MAP_NAMES[this._adminMapIdx  ?? this._mapIdx];
      const modeName = MODES[this._adminModeIdx ?? this._modeIdx].name;
      nextEl.innerHTML = `Next: <b>${modeName}</b> on <b>${mapName}</b>`;
    }
  }

  private _buildRound() {
    this._timer = ROUND_TIME;
    this._roundId++;
    resetBotIndex();
    console.log(`[RoundManager] _buildRound: mapIdx=${this._mapIdx}, modeIdx=${this._modeIdx}`);

    // Apply any admin overrides from the transition picker
    if (this._adminModeIdx !== null) this._modeIdx = this._adminModeIdx;
    if (this._adminMapIdx  !== null) this._mapIdx  = this._adminMapIdx;
    this._adminModeIdx = null;
    this._adminMapIdx  = null;

    // Tear down the previous round now (kept alive during transition for visuals)
    if (this._currentMap) { this._currentMap.dispose(); this._currentMap = null; }
    for (const bot of this._bots) bot.removeFromScene(this._scene);
    this._bots = [];

    // Build map
    this._currentMap = MAP_BUILDERS[this._mapIdx](this._scene);
    const { background, gravity } = this._currentMap;
    this._scene.background = new THREE.Color(background);
    // Reset fog: sky-blue fog for normal maps, none for void maps
    const mapGroundY = this._currentMap.groundY;
    this._scene.fog = (mapGroundY === undefined || mapGroundY >= -10)
      ? new THREE.Fog(0x87ceeb, 50, 120)
      : null;
    setGravity(gravity);

    // Spawn player — use map-specific position if defined
    const sp = this._currentMap.spawnPos;
    this._player.position.set(sp?.x ?? 0, sp?.y ?? 3, sp?.z ?? 8);
    this._player.velocity.set(0, 0, 0);
    this._player.setEliminated(false);
    this._player.setIt(false);
    this._player.setFrozen(false);

    // Spawn bots (use botBoundary for waypoint clamping if the map defines it)
    const botCount    = Math.max(0, 4 - HUMAN_PLAYERS);
    const botBoundary = this._currentMap.botBoundary ?? this._currentMap.boundary;
    for (let i = 0; i < botCount; i++) {
      const bot = new Bot(this._scene, BOT_NAMES[i], botBoundary);
      // If the map defines a spawn point, place bots around it so they
      // start on the platform rather than at a random position.
      if (this._currentMap.spawnPos) {
        const s = this._currentMap.spawnPos;
        const botY = this._currentMap.botSpawnY ?? s.y;
        const angle = (i / botCount) * Math.PI * 2;
        bot.position.set(
          s.x + Math.cos(angle) * 1.5,
          botY,
          s.z + Math.sin(angle) * 1.5,
        );
        bot.velocity.set(0, 0, 0);
      }
      console.log(`[Bot ${i}] spawned at`, bot.position.x.toFixed(2), bot.position.y.toFixed(2), bot.position.z.toFixed(2));
      this._bots.push(bot);
    }

    // Init mode
    this._mode = MODES[this._modeIdx];
    const allEntities: Controllable[] = [this._player as unknown as Controllable, ...this._bots as unknown as Controllable[]];
    this._mode.onStart(allEntities);
  }
}
