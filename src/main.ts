import * as THREE from "three";
import { InputHandler } from "./input";
import { Player } from "./player";
import { ThirdPersonCamera } from "./camera";
import { Teleporter } from "./testMap";
import { Controllable } from "./types";
import { RoundManager } from "./roundManager";
import { WeaponSystem, WEAPON_ORDER, DEFS, weaponCallbacks } from "./weapon";
import type { WeaponType } from "./weapon";
import { NetworkManager } from "./network";
import { RemotePlayer } from "./remotePlayer";
import type { NetMsg } from "./network";
import { TMF_MAX_HP, TMF_MAX_LIVES } from "./modes/tomfooleryMode";
import { INF_ZOMBIE_HP, INF_HEALTHY_HP, installInfectionCallbacks } from "./modes/infectionMode";
import { POUNCE_COOLDOWN_MAX } from "./player";
import { resetWeaponCallbacks } from "./weapon";
import { setViewModelWeapon, renderViewModel } from "./weaponViewModel";

// ── Renderer ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 50, 120);

// ── Lighting ──────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 1.0));

const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(20, 40, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 120;
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
scene.add(sun);

// ── Player & Camera ───────────────────────────────────────────────────────────
const player = new Player(scene);
player.position.set(0, 2, 8);

const thirdPersonCam = new ThirdPersonCamera();
const input = new InputHandler(renderer.domElement);
const weapon = new WeaponSystem();

// ── Tomfoolery world-space health bars ───────────────────────────────────────
interface TmfBar { sprite: THREE.Sprite; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; lastHp: number; lastLives: number; }
const tmfBars = new Map<Controllable, TmfBar>();

function _makeTmfBar(): TmfBar {
  const canvas = document.createElement("canvas");
  canvas.width = 128; canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.8, 0.45, 1);
  scene.add(sprite);
  return { sprite, canvas, ctx, tex, lastHp: -1, lastLives: -1 };
}

function _drawTmfBar(bar: TmfBar, hp: number, lives: number) {
  const { ctx, canvas, tex } = bar;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  // HP bar background
  ctx.fillStyle = "#222";
  ctx.beginPath(); ctx.roundRect(0, 0, W, 16, 3); ctx.fill();
  // HP bar fill
  const t = Math.max(0, hp / TMF_MAX_HP);
  ctx.fillStyle = t > 0.5 ? "#44ff44" : t > 0.25 ? "#ffcc00" : "#ff3300";
  ctx.beginPath(); ctx.roundRect(0, 0, Math.max(2, W * t), 16, 3); ctx.fill();
  // HP label
  ctx.fillStyle = "#fff";
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  ctx.fillText(`${hp}`, W / 2, 11);
  // Hearts row
  const heartSize = 13;
  const totalW = TMF_MAX_LIVES * (heartSize + 2);
  let hx = (W - totalW) / 2;
  for (let i = 0; i < TMF_MAX_LIVES; i++) {
    ctx.fillStyle = i < lives ? "#ff3355" : "#444";
    ctx.font = `${heartSize}px monospace`;
    ctx.textAlign = "left";
    ctx.fillText("♥", hx, 30);
    hx += heartSize + 2;
  }
  tex.needsUpdate = true;
  bar.lastHp = hp; bar.lastLives = lives;
}

function createTmfBars(entities: Controllable[]) {
  destroyTmfBars();
  for (const e of entities) {
    const bar = _makeTmfBar();
    _drawTmfBar(bar, e.hp, e.lives);
    tmfBars.set(e, bar);
  }
}

function destroyTmfBars() {
  for (const bar of tmfBars.values()) scene.remove(bar.sprite);
  tmfBars.clear();
}

// ── Infection world-space health bars ────────────────────────────────────────
interface InfBar { sprite: THREE.Sprite; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; lastHp: number; lastIsIt: boolean; }
const infBars = new Map<Controllable, InfBar>();

function _makeInfBar(): InfBar {
  const canvas = document.createElement("canvas");
  canvas.width = 128; canvas.height = 18;
  const ctx = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.8, 0.25, 1);
  scene.add(sprite);
  return { sprite, canvas, ctx, tex, lastHp: -1, lastIsIt: false };
}

function _drawInfBar(bar: InfBar, e: Controllable) {
  const { ctx, canvas, tex } = bar;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const maxHp = e.isIt ? INF_ZOMBIE_HP : INF_HEALTHY_HP;
  const t = Math.max(0, e.hp / maxHp);
  // Background
  ctx.fillStyle = "#222";
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, 3); ctx.fill();
  // Fill — zombies are green, healthy are blue
  ctx.fillStyle = e.isIt
    ? (t > 0.5 ? "#44ff44" : t > 0.25 ? "#ffcc00" : "#ff3300")
    : (t > 0.5 ? "#44aaff" : t > 0.25 ? "#ffcc00" : "#ff3300");
  ctx.beginPath(); ctx.roundRect(0, 0, Math.max(2, W * t), H, 3); ctx.fill();
  // Label
  ctx.fillStyle = "#fff";
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  ctx.fillText(`${Math.max(0, e.hp)}`, W / 2, H - 4);
  tex.needsUpdate = true;
  bar.lastHp = e.hp; bar.lastIsIt = e.isIt;
}

function createInfBars(entities: Controllable[]) {
  destroyInfBars();
  destroyTmfBars();
  for (const e of entities) {
    const bar = _makeInfBar();
    _drawInfBar(bar, e);
    infBars.set(e, bar);
  }
}

function destroyInfBars() {
  for (const bar of infBars.values()) scene.remove(bar.sprite);
  infBars.clear();
}

// ── Networking ────────────────────────────────────────────────────────────────
const network = new NetworkManager();
const remotePlayers    = new Map<string, RemotePlayer>();
const knownPeers       = new Set<string>(); // all peer IDs seen this session
const remoteUsernames  = new Map<string, string>(); // peerId → username (tracked pre-login)
const remoteAdmins     = new Set<string>(); // peerIds of remote players with admin

const roomCodeEl = document.getElementById("room-code");
if (roomCodeEl) {
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${network.roomCode}`;
  roomCodeEl.textContent = `🔗 ${shareUrl}`;
  roomCodeEl.addEventListener("click", () => {
    navigator.clipboard.writeText(shareUrl).catch(() => {});
    roomCodeEl.textContent = "✓ Copied!";
    setTimeout(() => { roomCodeEl.textContent = `🔗 ${shareUrl}`; }, 1500);
  });
}

function findCurrentItPeerId(): string | null {
  const lp = player as unknown as Controllable;
  if (lp.isIt) return network.peerId;
  for (const [id, rp] of remotePlayers) if (rp.isIt) return id;
  return null; // a bot is IT, or nobody yet
}

function applyItPeer(itPeerId: string) {
  // Set IT state for everyone based on the authoritative itPeerId
  const lp = player as unknown as Controllable;
  lp.setIt(itPeerId === network.peerId);
  if (lp.isIt) lp.tagImmunity = 0; else lp.tagImmunity = 2;
  for (const [id, rp] of remotePlayers) {
    rp.setIt(id === itPeerId);
    rp.tagImmunity = rp.isIt ? 0 : 2;
  }
  // No bots are IT when there are human players connected
  for (const bot of roundManager.bots) (bot as unknown as Controllable).setIt(false);
}

function handleNetMessage(msg: NetMsg) {
  if (msg.type === "state") {
    const isNewPeer = !remotePlayers.has(msg.peerId);
    knownPeers.add(msg.peerId);
    remoteUsernames.set(msg.peerId, msg.username);
    if (msg.isAdmin) remoteAdmins.add(msg.peerId); else remoteAdmins.delete(msg.peerId);
    let rp = remotePlayers.get(msg.peerId);
    if (!rp) {
      rp = new RemotePlayer(scene, msg.peerId, msg.username);
      remotePlayers.set(msg.peerId, rp);
    }
    rp.applyState(msg);
    // When a new peer joins mid-round, the host re-broadcasts who is IT
    // so the latejoiner doesn't keep their locally-chosen IT.
    if (isNewPeer && roundManager.mode.name !== "Tomfoolery") {
      const allIds = [network.peerId, ...knownPeers].sort();
      if (allIds[0] === network.peerId) { // I'm the host
        const itId = findCurrentItPeerId();
        if (itId) network.sendSetIt(itId, roundManager.roundId);
      }
    }
    return;
  }
  if (msg.type === "setit") {
    applyItPeer(msg.itPeerId);
    return;
  }
  if (msg.type === "tag") {
    const tagger = remotePlayers.get(msg.taggerId);
    const tagged  = remotePlayers.get(msg.taggedId);
    tagger?.setIt(false);
    if (tagger) tagger.tagImmunity = 2;
    tagged?.setIt(true);
    if (msg.taggerId === network.peerId) { (player as unknown as Controllable).setIt(false); player.tagImmunity = 2; }
    if (msg.taggedId  === network.peerId) (player as unknown as Controllable).setIt(true);
    return;
  }
  if (msg.type === "leave") {
    knownPeers.delete(msg.peerId);
    remoteUsernames.delete(msg.peerId);
    remoteAdmins.delete(msg.peerId);
    const rp = remotePlayers.get(msg.peerId);
    if (rp) { rp.removeFromScene(scene); remotePlayers.delete(msg.peerId); }
  }
}

network.connect(handleNetMessage);
window.addEventListener("beforeunload", () => network.sendLeave());

// ── HUD elements ─────────────────────────────────────────────────────────────
const timerEl    = document.getElementById("round-timer")!;
const modeEl     = document.getElementById("mode-name")!;
const statusEl   = document.getElementById("mode-status")!;
const coordsEl   = document.getElementById("coords")!;
const overlayEl   = document.getElementById("transition-overlay")!;

const weaponHudEl   = document.getElementById("weapon-hud")!;
const crosshairEl   = document.getElementById("crosshair")!;
const sprintBarWrap = document.getElementById("sprint-bar-wrap") as HTMLDivElement;
const sprintBarFill = document.getElementById("sprint-bar")      as HTMLDivElement;

// ── Teleporter timer sprite ───────────────────────────────────────────────────
const TELEPORT_COOLDOWN = 5;

function drawTimerSprite(tp: Teleporter) {
  const ctx = tp.canvas.getContext("2d")!;
  const s = tp.canvas.width;
  ctx.clearRect(0, 0, s, s);

  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fill();

  const frac = tp.cooldown / TELEPORT_COOLDOWN;
  ctx.beginPath();
  ctx.moveTo(s / 2, s / 2);
  ctx.arc(s / 2, s / 2, s / 2 - 4, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 80, 80, 0.5)";
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${s * 0.45}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(Math.ceil(tp.cooldown).toString(), s / 2, s / 2);

  tp.texture.needsUpdate = true;
}

// ── Round Manager ─────────────────────────────────────────────────────────────
const roundManager = new RoundManager(scene, player, timerEl, modeEl, statusEl, overlayEl);

// ── Login gate ────────────────────────────────────────────────────────────────
const loginOverlay  = document.getElementById("login-overlay")!;
const nicknameInput = document.getElementById("nickname-input") as HTMLInputElement;
const nicknameSubmit = document.getElementById("nickname-submit") as HTMLButtonElement;
const loginError    = document.getElementById("login-error")!;

const adminBtn   = document.getElementById("admin-btn")!;
const adminPanel = document.getElementById("admin-panel")!;

let gameStarted = false;
let adminSpeedActive = false;
let localUsername = "";
let _netTickAccum = 0;
const NET_TICK = 1 / 20; // broadcast at 20 Hz
let adminGiveUsedRound = -1;
// Bot weapon assignments for the current round: botIndex → WeaponType
const botGivenWeapons  = new Map<number, WeaponType>();
const botFireTimers    = new Map<number, number>();
const infBotCooldowns        = new Map<number, number>(); // per-bot weapon cooldown in infection mode
const infBotPounceCooldowns  = new Map<number, number>(); // per-bot pounce cooldown
const pounceHitSet           = new Set<Controllable>();   // entities already hit this pounce
const zombieRespawnTimers    = new Map<Controllable, number>(); // zombie → seconds until respawn
let lastRoundId = -1;
// Hunter mode — track bot It transitions

const ROW  = "width:100%;padding:6px 8px;cursor:pointer;font-family:monospace;font-size:0.8rem;border-radius:4px;margin-bottom:4px;text-align:left;";
const ROW_RED    = ROW + "background:#1a0a0a;color:#ff6666;border:1px solid #553333;";
const ROW_YELLOW = ROW + "background:#1a1a00;color:#ffcc44;border:1px solid #554400;";
const ROW_BLUE   = ROW + "background:#0a0a1a;color:#66aaff;border:1px solid #334466;";
const ROW_ICE    = ROW + "background:#0a1a1a;color:#88ddff;border:1px solid #336666;";
const ROW_SEL    = ROW + "background:#2a2a00;color:#ffee66;border:2px solid #ffcc00;font-weight:bold;";

function renderAdminPanel() {
  const mapNames  = roundManager.mapNames;
  const modeNames = roundManager.modeNames;

  const mapOpts  = mapNames.map((n, i)  => `<option value="${i}" ${i === roundManager.nextMapIdx  ? "selected" : ""}>${n}</option>`).join("");
  const modeOpts = modeNames.map((n, i) => `<option value="${i}" ${i === roundManager.nextModeIdx ? "selected" : ""}>${n}</option>`).join("");

  const selectStyle = "width:100%;padding:5px 6px;font-family:monospace;font-size:0.8rem;background:#111;color:#ccc;border:1px solid #444;border-radius:4px;margin-bottom:8px;";

  const botRows = roundManager.bots.map((bot, i) => {
    const frozen = (bot as unknown as { isFrozen: boolean }).isFrozen;
    return `<button id="adm-freeze-bot-${i}" style="${frozen ? ROW_SEL : ROW_ICE}">❄ ${bot.name} — ${frozen ? "Unfreeze" : "Freeze"}</button>`;
  }).join("");

  const speedStyle = adminSpeedActive ? ROW_SEL : ROW_YELLOW;

  const targetOpts = ["You", ...roundManager.bots.map(b => b.name)].map((n, i) =>
    `<option value="${i === 0 ? "player" : String(i - 1)}">${n}</option>`
  ).join("");

  const weaponOpts = WEAPON_ORDER.map(w =>
    `<option value="${w}">${DEFS[w].name}</option>`
  ).join("");

  adminPanel.innerHTML = `
    <div style="font-size:0.7rem;color:#ffcc00;letter-spacing:2px;margin-bottom:10px;border-bottom:1px solid #333;padding-bottom:6px;">⚙ ADMIN PANEL</div>

    <div style="font-size:0.7rem;color:#888;margin-bottom:4px;">ROUND</div>
    <button id="adm-force-end" style="${ROW_RED}">⏩ Force End Round</button>

    <div style="font-size:0.7rem;color:#888;margin:8px 0 4px;">NEXT MAP</div>
    <select id="adm-map-sel" style="${selectStyle}">${mapOpts}</select>

    <div style="font-size:0.7rem;color:#888;margin-bottom:4px;">NEXT MODE</div>
    <select id="adm-mode-sel" style="${selectStyle}">${modeOpts}</select>

    <div style="font-size:0.7rem;color:#888;margin:8px 0 4px;">SELF</div>
    <button id="adm-speed" style="${speedStyle}">⚡ Speed Boost — ${adminSpeedActive ? "ON" : "OFF"}</button>

    <div style="font-size:0.7rem;color:#888;margin:8px 0 4px;">FREEZE PLAYERS</div>
    <button id="adm-freeze-player" style="${(player as unknown as { isFrozen: boolean }).isFrozen ? ROW_SEL : ROW_BLUE}">❄ You — ${(player as unknown as { isFrozen: boolean }).isFrozen ? "Unfreeze" : "Freeze"}</button>
    ${botRows}

    <div style="font-size:0.7rem;color:#888;margin:8px 0 4px;">GIVE WEAPON</div>
    <select id="adm-give-target" style="${selectStyle}">${targetOpts}</select>
    <select id="adm-give-weapon" style="${selectStyle}">${weaponOpts}</select>
    <button id="adm-give-fire" ${adminGiveUsedRound === roundManager.roundId ? "disabled" : ""} style="${adminGiveUsedRound === roundManager.roundId ? ROW_SEL : ROW_BLUE}">${adminGiveUsedRound === roundManager.roundId ? "✓ Used this round" : "▶ Fire / Give"}</button>
  `;

  document.getElementById("adm-force-end")?.addEventListener("click", () => {
    roundManager.forceEndRound();
    adminPanel.style.display = "none";
    adminBtn.style.background = "#2a2a00";
  });

  document.getElementById("adm-map-sel")?.addEventListener("change", (e) => {
    roundManager.setNextMap(Number((e.target as HTMLSelectElement).value));
  });

  document.getElementById("adm-mode-sel")?.addEventListener("change", (e) => {
    roundManager.setNextMode(Number((e.target as HTMLSelectElement).value));
  });

  document.getElementById("adm-speed")?.addEventListener("click", () => {
    adminSpeedActive = !adminSpeedActive;
    renderAdminPanel();
  });

  document.getElementById("adm-freeze-player")?.addEventListener("click", () => {
    const p = player as unknown as { isFrozen: boolean; setFrozen: (v: boolean) => void };
    p.setFrozen(!p.isFrozen);
    renderAdminPanel();
  });

  roundManager.bots.forEach((bot, i) => {
    document.getElementById(`adm-freeze-bot-${i}`)?.addEventListener("click", () => {
      const b = bot as unknown as { isFrozen: boolean; setFrozen: (v: boolean) => void };
      b.setFrozen(!b.isFrozen);
      renderAdminPanel();
    });
  });

  document.getElementById("adm-give-fire")?.addEventListener("click", () => {
    if (adminGiveUsedRound === roundManager.roundId) return;
    const targetVal = (document.getElementById("adm-give-target") as HTMLSelectElement).value;
    const weaponVal = (document.getElementById("adm-give-weapon") as HTMLSelectElement).value as WeaponType;

    if (targetVal === "player") {
      // Equip the weapon so the player uses it themselves with LClick
      weapon.setWeapon(weaponVal);
    } else {
      // Store weapon for this bot — game loop will auto-fire it each cooldown
      const botIdx = Number(targetVal);
      botGivenWeapons.set(botIdx, weaponVal);
      botFireTimers.set(botIdx, 0);
    }
    adminGiveUsedRound = roundManager.roundId;
    renderAdminPanel();
  });
}

adminBtn.addEventListener("click", () => {
  const open = adminPanel.style.display === "none";
  adminPanel.style.display = open ? "block" : "none";
  adminBtn.style.background = open ? "#2a2a00" : "#111";
  if (open) renderAdminPanel();
});

function startGame(nickname: string) {
  localUsername = nickname;
  loginOverlay.style.display = "none";
  gameStarted = true;
  player.setName(nickname);
  const lower = nickname.toLowerCase();
  const nameQualifies = lower.includes("innocent") || lower.includes("kid") || lower.includes("lawrence");
  roundManager.isAdmin = nameQualifies && remoteAdmins.size < 2;
  if (roundManager.isAdmin) adminBtn.style.display = "block";
  roundManager.startRound();
}

nicknameSubmit.addEventListener("click", () => {
  const name = nicknameInput.value.trim();
  if (name.length < 2) {
    loginError.textContent = "Nickname must be at least 2 characters.";
    return;
  }
  // Reject duplicate nicknames
  const taken = [...remoteUsernames.values()].some(u => u.toLowerCase() === name.toLowerCase());
  if (taken) {
    loginError.textContent = "That nickname is already taken. Choose another.";
    return;
  }
  startGame(name);
});

nicknameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") nicknameSubmit.click();
});

nicknameInput.focus();

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  thirdPersonCam.onResize();
});


// ── Bot aim helpers ───────────────────────────────────────────────────────────
// Returns a normalised direction from `origin` that leads `target` based on
// projectile speed so shots land where the target will be, not where they are.
function aimWithLead(
  origin: THREE.Vector3,
  target: import("./types").Controllable,
  projectileSpeed: number,
): THREE.Vector3 {
  const dist = origin.distanceTo(target.position);
  const travelTime = projectileSpeed > 0 ? dist / projectileSpeed : 0;
  // Lead horizontal movement only — vertical is too unpredictable (jumping)
  const leadX = target.position.x + target.velocity.x * travelTime * 0.72;
  const leadZ = target.position.z + target.velocity.z * travelTime * 0.72;
  return new THREE.Vector3(
    leadX  - origin.x,
    target.position.y + 0.9 - origin.y,
    leadZ  - origin.z,
  ).normalize();
}

/** Apply random angular noise to a direction — returns a new normalised vector. */
function addAimNoise(dir: THREE.Vector3, maxAngle: number): THREE.Vector3 {
  if (maxAngle <= 0) return dir.clone().normalize();
  const axis = new THREE.Vector3(
    Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5,
  ).normalize();
  return dir.clone().applyAxisAngle(axis, (Math.random() * 2 - 1) * maxAngle).normalize();
}

/** Returns a random aim error for a bot shot.
 *  60 % of shots are fairly accurate; 40 % are noticeably off. */
function botShotAngle(): number {
  return Math.random() < 0.40
    ? Math.random() * 0.30 + 0.12   // bad shot  : ~7 – 24 degrees
    : Math.random() * 0.05;           // good shot : 0 – 3 degrees
}

// ── Game Loop ─────────────────────────────────────────────────────────────────
let prevTime = performance.now();

function gameLoop() {
  requestAnimationFrame(gameLoop);

  const now = performance.now();
  const dt = Math.min((now - prevTime) / 1000, 0.05);
  prevTime = now;

  input.flush();

  if (!gameStarted) {
    renderer.render(scene, thirdPersonCam.camera);
    return; // no viewmodel before login
  }

  const map = roundManager.map;
  const colliders = map ? map.colliders : [];
  const walls     = map ? map.walls     : [];
  const boundary  = map ? map.boundary  : 22;

  // Moving platforms must advance before entity physics so the updated colliders
  // are in place when player/bot positions are resolved.
  for (const mp of map?.movingPlatforms ?? []) mp.preUpdate(dt);

  player.update(dt, input, colliders, walls, boundary, map?.groundY ?? 0, map?.voidBoundary);

  // Remove stale remote players (disconnected peers)
  for (const [id, rp] of remotePlayers) {
    if (rp.isStale) { rp.removeFromScene(scene); remotePlayers.delete(id); }
    else rp.update(dt);
  }

  // Local entities only (bots stay local, remote players are separate)
  const localEntities: Controllable[] = [
    player as unknown as Controllable,
    ...roundManager.bots as unknown as Controllable[],
  ];

  // Full entity list for weapons, platforms, rendering
  const allEntities: Controllable[] = [
    ...localEntities,
    ...[...remotePlayers.values()],
  ];

  for (const bot of roundManager.bots) {
    bot.update(dt, colliders, walls, map ? map.teleporters : [], localEntities as unknown as { isIt: boolean; tagImmunity: number; isFrozen: boolean; position: THREE.Vector3 }[], map?.groundY ?? 0, map?.voidBoundary);
  }

  const playerIsHunter = roundManager.mode.name === "Hunter" && (player as unknown as Controllable).isIt;

  // Auto-fire weapons given to bots — targets nearest non-eliminated entity
  for (const [botIdx, weaponType] of botGivenWeapons) {
    const bot = roundManager.bots[botIdx];
    if (!bot || bot.isEliminated) { botGivenWeapons.delete(botIdx); continue; }

    const timer = (botFireTimers.get(botIdx) ?? 0) - dt;
    if (timer > 0) { botFireTimers.set(botIdx, timer); continue; }

    // Find nearest target
    let nearest: Controllable | null = null;
    let nearestDist = Infinity;
    for (const e of allEntities) {
      if ((e as unknown) === (bot as unknown) || e.isEliminated) continue;
      const d = bot.position.distanceTo(e.position);
      if (d < nearestDist) { nearestDist = d; nearest = e; }
    }
    if (nearest) {
      const origin = bot.position.clone().add(new THREE.Vector3(0, 1.4, 0));
      const dir = addAimNoise(aimWithLead(origin, nearest, DEFS[weaponType].speed), botShotAngle());
      origin.addScaledVector(dir, 0.6);
      weapon.fireAs(scene, origin, dir, bot as unknown as Controllable, weaponType);
    }
    botFireTimers.set(botIdx, DEFS[weaponType].cooldown);
  }

  // ── Infection bot weapon AI ───────────────────────────────────────────────────
  // Zombie bots bite nearby healthy; healthy bots use blaster at range / sword up close.
  if (roundManager.mode.name === "Infection") {
    for (let i = 0; i < roundManager.bots.length; i++) {
      const bot = roundManager.bots[i];
      if (bot.isEliminated) continue;
      const botC = bot as unknown as Controllable;

      const cd = (infBotCooldowns.get(i) ?? 0) - dt;
      infBotCooldowns.set(i, cd);
      if (cd > 0) continue;

      const origin = bot.position.clone().add(new THREE.Vector3(0, 1.4, 0));

      if (botC.isIt) {
        // Zombie bot — find nearest healthy player
        let nearest: Controllable | null = null;
        let nearestDist = Infinity;
        for (const e of allEntities) {
          if ((e as unknown) === (botC as unknown) || e.isEliminated || e.isIt) continue;
          const d = bot.position.distanceTo(e.position);
          if (d < nearestDist) { nearestDist = d; nearest = e; }
        }
        if (nearest) {
          const toTarget = new THREE.Vector3(
            nearest.position.x - bot.position.x, 0,
            nearest.position.z - bot.position.z,
          ).normalize();

          // Pounce at medium range (5–12 units) if cooldown ready
          const pcd = (infBotPounceCooldowns.get(i) ?? 0) - dt;
          infBotPounceCooldowns.set(i, Math.max(0, pcd));
          if (nearestDist > 5 && nearestDist < 12 && pcd <= 0) {
            botC.velocity.x    = toTarget.x * 32;
            botC.velocity.z    = toTarget.z * 32;
            botC.velocity.y    = Math.max(botC.velocity.y, 7);
            botC.knockbackTimer = 0.32;
            infBotPounceCooldowns.set(i, POUNCE_COOLDOWN_MAX);
            // Immediate bite check at pounce landing
            if (nearestDist < 4.5) {
              weaponCallbacks.onBiteHit(nearest);
              nearest.velocity.x    += toTarget.x * 10;
              nearest.velocity.z    += toTarget.z * 10;
              nearest.velocity.y     = Math.max(nearest.velocity.y, 6);
              nearest.knockbackTimer = 0.45;
              infBotCooldowns.set(i, DEFS.bite.cooldown);
            }
          }

          // Regular bite when close
          if (nearestDist < 3.2) {
            weaponCallbacks.onBiteHit(nearest);
            nearest.velocity.x    += toTarget.x * 7;
            nearest.velocity.z    += toTarget.z * 7;
            nearest.velocity.y     = Math.max(nearest.velocity.y, 4);
            nearest.knockbackTimer = 0.3;
            infBotCooldowns.set(i, DEFS.bite.cooldown);
          }
        }
      } else {
        // Healthy bot — attack the nearest zombie
        let nearest: Controllable | null = null;
        let nearestDist = Infinity;
        for (const e of allEntities) {
          if ((e as unknown) === (botC as unknown) || e.isEliminated || !e.isIt) continue;
          const d = bot.position.distanceTo(e.position);
          if (d < nearestDist) { nearestDist = d; nearest = e; }
        }
        if (nearest) {
          if (nearestDist < 3.5) {
            // Sword swing: immediate hit check
            const toTarget = new THREE.Vector3(
              nearest.position.x - bot.position.x, 0,
              nearest.position.z - bot.position.z,
            ).normalize();
            const dmg = weaponCallbacks.onSwordHit(nearest);
            if (dmg > 0) nearest.hp = Math.max(0, nearest.hp - dmg);
            nearest.velocity.x    += toTarget.x * 38;
            nearest.velocity.z    += toTarget.z * 38;
            nearest.velocity.y     = Math.max(nearest.velocity.y, 12);
            nearest.knockbackTimer = 0.7;
            infBotCooldowns.set(i, DEFS.sword.cooldown);
          } else if (nearestDist < 14) {
            // Blaster: lead-aimed projectile with aim variance
            const dir = addAimNoise(aimWithLead(origin, nearest, DEFS.blaster.speed), botShotAngle());
            weapon.fireAs(scene, origin.clone().addScaledVector(dir, 0.6), dir, botC, "blaster");
            infBotCooldowns.set(i, DEFS.blaster.cooldown);
          }
        }
      }
    }
  }

  // Carry entities that are standing on a moving platform
  for (const mp of map?.movingPlatforms ?? []) {
    for (const e of allEntities) {
      if (!e.isEliminated && mp.isOnTop(e.position)) {
        e.position.add(mp.delta);
      }
    }
  }

  // Falling platforms — update AFTER entity physics so positions are settled
  for (const fp of map?.fallingPlatforms ?? []) {
    fp.preUpdate(dt, allEntities);
  }

  thirdPersonCam.update(player.position, player.yaw, input);

  const isTomfoolery = roundManager.mode.name === "Tomfoolery";
  const isInfection  = roundManager.mode.name === "Infection";
  const isInfectionZombie  = isInfection && (player as unknown as Controllable).isIt;
  const isInfectionHealthy = isInfection && !(player as unknown as Controllable).isIt;

  // Weapons active for: Tomfoolery, Infection (both sides), admin-given, Hunter IT
  const weaponsActive = isTomfoolery || isInfectionHealthy || isInfectionZombie || adminGiveUsedRound === roundManager.roundId || playerIsHunter;

  // Force zombie into bite weapon every frame
  if (isInfectionZombie) weapon.setWeapon("bite");

  // ── Zombie pounce (player) ────────────────────────────────────────────────────
  if (isInfectionZombie && !player.isEliminated) {
    // Right-click triggers pounce
    if (input.mouseRightPressed) {
      const dir = new THREE.Vector3();
      thirdPersonCam.camera.getWorldDirection(dir);
      player.pounce(dir);
      pounceHitSet.clear();
    }
    // While airborne from pounce, hit any healthy entity in range
    if (player.isPouncing) {
      for (const e of allEntities) {
        if (e.isIt || e.isEliminated || pounceHitSet.has(e)) continue;
        if (player.position.distanceTo(e.position) < 2.2) {
          pounceHitSet.add(e);
          weaponCallbacks.onBiteHit(e);
          const push = new THREE.Vector3(
            e.position.x - player.position.x, 0,
            e.position.z - player.position.z,
          ).normalize();
          e.velocity.x    += push.x * 10;
          e.velocity.z    += push.z * 10;
          e.velocity.y     = Math.max(e.velocity.y, 6);
          e.knockbackTimer = 0.45;
        }
      }
    } else {
      pounceHitSet.clear();
    }
  }

  // ── Crosshair ─────────────────────────────────────────────────────────────────
  const WEAPON_COLORS: Record<string, string> = {
    rocket: "#ff2200", freeze: "#44aaff", shotgun: "#ffee33",
    sword: "#aaddff", blaster: "#00ff44", bite: "#ff3300",
  };
  if (weaponsActive && input.pointerLocked && !player.isEliminated) {
    crosshairEl.style.display = "block";
    crosshairEl.style.color = WEAPON_COLORS[weapon.type] ?? "rgba(255,255,255,0.9)";
  } else {
    crosshairEl.style.display = "none";
  }

  // ── Sprint bar ────────────────────────────────────────────────────────────────
  {
    const st  = player.stamina / player.maxStamina;
    const pct = Math.round(st * 100);
    const full = st >= 1;
    // Visible while sprinting or stamina is not full
    sprintBarWrap.style.opacity = (player.isSprinting || !full) ? "1" : "0";
    sprintBarFill.style.width   = `${pct}%`;
    sprintBarFill.style.background =
      st > 0.5 ? "#44ff88" : st > 0.2 ? "#ffcc44" : "#ff4444";
  }

  if (weaponsActive) {
    if (isInfectionZombie) {
      // Zombie — locked to bite, no switching
    } else if (isInfectionHealthy) {
      // Healthy in infection — only sword (1) and blaster (5)
      if (input.isDown("Digit1")) weapon.setWeapon(WEAPON_ORDER[0]);
      if (input.isDown("Digit5")) weapon.setWeapon(WEAPON_ORDER[4]);
    } else {
      // Normal weapon switching — keys 1-5
      const weaponKeys = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"];
      for (let i = 0; i < weaponKeys.length; i++) {
        if (input.isDown(weaponKeys[i])) weapon.setWeapon(WEAPON_ORDER[i]);
      }
    }

    // Fire on left click
    if (input.mouseLeftPressed && !player.isEliminated) {
      const dir = new THREE.Vector3();
      thirdPersonCam.camera.getWorldDirection(dir);
      const origin = player.position.clone().add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(dir, 0.6);
      weapon.fire(scene, origin, dir, player as unknown as import("./types").Controllable);
    }

    // Weapon HUD
    if (isInfectionZombie) {
      // Zombie HUD — bite + pounce slots
      const pcd  = player.pounceCooldown;
      const pcdPct = Math.round((1 - pcd / POUNCE_COOLDOWN_MAX) * 100);
      const pounceReady = pcd <= 0;
      const pounceLabel = pounceReady
        ? "[RMB] Pounce"
        : `[RMB] Pounce (${pcd.toFixed(1)}s)`;
      weaponHudEl.innerHTML = `
        <div style="
          padding:6px 14px;font-family:monospace;font-size:13px;border-radius:6px;
          background:#ff220033;border:2px solid #ff2200;color:#ff2200;font-weight:bold;text-align:center;
        ">[LMB] Bite</div>
        <div style="
          padding:6px 14px;font-family:monospace;font-size:13px;border-radius:6px;
          background:${pounceReady ? "#ff660033" : "rgba(0,0,0,0.45)"};
          border:2px solid ${pounceReady ? "#ff6600" : "rgba(255,255,255,0.2)"};
          color:${pounceReady ? "#ff6600" : "rgba(255,255,255,0.4)"};
          font-weight:${pounceReady ? "bold" : "normal"};text-align:center;
        ">${pounceLabel}${pounceReady ? "" : `<div style="font-size:10px;margin-top:3px;color:#ffcc44;">${"█".repeat(Math.round(pcdPct/10))}${"░".repeat(10-Math.round(pcdPct/10))} ${pcdPct}%</div>`}</div>`;
    } else if (isInfectionHealthy) {
      // Healthy HUD — show only sword and blaster
      const infSlots: [WeaponType, number][] = [
        [WEAPON_ORDER[0], 1],  // sword → key 1
        [WEAPON_ORDER[4], 5],  // blaster → key 5
      ];
      weaponHudEl.innerHTML = infSlots.map(([w, keyNum]) => {
        const active = w === weapon.type;
        const col = WEAPON_COLORS[w] ?? "#ffffff";
        const def = DEFS[w];
        const label = def.name.split(" ")[0];
        let ammoLine = "";
        if (active && def.maxAmmo !== -1) {
          const cur = weapon.ammo;
          if (weapon.isReloading) {
            const pct = Math.round(weapon.reloadProgress * 100);
            const filled = Math.round(weapon.reloadProgress * 10);
            const bar = "█".repeat(filled) + "░".repeat(10 - filled);
            ammoLine = `<div style="font-size:10px;margin-top:3px;color:#ffcc44;">${bar} ${pct}%</div>`;
          } else {
            const pips = "●".repeat(cur) + "○".repeat(def.maxAmmo - cur);
            ammoLine = `<div style="font-size:10px;margin-top:3px;letter-spacing:1px;color:${cur === 0 ? "#ff4444" : col};">${pips}</div>`;
          }
        }
        return `<div style="
          padding:6px 14px;font-family:monospace;font-size:13px;border-radius:6px;
          background:${active ? col + "33" : "rgba(0,0,0,0.45)"};
          border:2px solid ${active ? col : "rgba(255,255,255,0.2)"};
          color:${active ? col : "rgba(255,255,255,0.5)"};
          font-weight:${active ? "bold" : "normal"};text-align:center;
        ">[${keyNum}] ${label}${ammoLine}</div>`;
      }).join("");
    } else {
      weaponHudEl.innerHTML = WEAPON_ORDER.map((w, i) => {
        const active = w === weapon.type;
        const col = WEAPON_COLORS[w] ?? "#ffffff";
        const def = DEFS[w];
        const label = def.name.split(" ")[0];
        const keyNum = i + 1;

        // Ammo / reload display (only for the active slot)
        let ammoLine = "";
        if (active && def.maxAmmo !== -1) {
          const cur = weapon.ammo;
          if (weapon.isReloading) {
            const pct = Math.round(weapon.reloadProgress * 100);
            const filled = Math.round(weapon.reloadProgress * 10);
            const bar = "█".repeat(filled) + "░".repeat(10 - filled);
            ammoLine = `<div style="font-size:10px;margin-top:3px;color:#ffcc44;">${bar} ${pct}%</div>`;
          } else {
            const pips = "●".repeat(cur) + "○".repeat(def.maxAmmo - cur);
            const outOfAmmo = cur === 0;
            ammoLine = `<div style="font-size:10px;margin-top:3px;letter-spacing:1px;color:${outOfAmmo ? "#ff4444" : col};">${pips}</div>`;
          }
        }

        return `<div style="
          padding:6px 14px;font-family:monospace;font-size:13px;border-radius:6px;
          background:${active ? col + "33" : "rgba(0,0,0,0.45)"};
          border:2px solid ${active ? col : "rgba(255,255,255,0.2)"};
          color:${active ? col : "rgba(255,255,255,0.5)"};
          font-weight:${active ? "bold" : "normal"};
          text-align:center;
        ">[${keyNum}] ${label}${ammoLine}</div>`;
      }).join("");
    }
  } else {
    weaponHudEl.innerHTML = "";
  }

  weapon.update(dt, scene, player as unknown as Controllable, allEntities, colliders, walls);

  // Round manager only handles local entities — bots don't interact with remote players
  roundManager.update(dt, localEntities);

  // ── Zombie respawn timers (infection mode) ────────────────────────────────────
  if (roundManager.mode.name === "Infection") {
    const boundary = (map?.boundary ?? 22) - 4;

    // Detect newly dead zombies and start their respawn timer
    for (const e of localEntities) {
      if (!e.isIt || e.isEliminated || zombieRespawnTimers.has(e)) continue;
      if (e.hp <= 0) {
        e.setEliminated(true);
        zombieRespawnTimers.set(e, 3.0);
      }
    }

    // Tick timers and respawn when done
    for (const [zombie, remaining] of zombieRespawnTimers) {
      const next = remaining - dt;
      if (next <= 0) {
        zombieRespawnTimers.delete(zombie);
        zombie.hp = INF_ZOMBIE_HP;
        zombie.setEliminated(false);
        zombie.setFrozen(false);
        zombie.velocity.set(0, 0, 0);
        zombie.position.set(
          (Math.random() * 2 - 1) * boundary,
          2,
          (Math.random() * 2 - 1) * boundary,
        );
      } else {
        zombieRespawnTimers.set(zombie, next);
      }
    }

    // Override status line while the local player is waiting to respawn
    const lpc = player as unknown as Controllable;
    if (lpc.isIt && lpc.isEliminated) {
      const t = zombieRespawnTimers.get(lpc) ?? 0;
      statusEl.textContent = `DEAD — respawning in ${t.toFixed(1)}s…`;
    }
  }

  // Detect new round AFTER update() so _buildRound() changes are visible immediately.
  // This lets us override mode.onStart()'s local IT pick on the very same frame.
  if (roundManager.roundId !== lastRoundId) {
    lastRoundId = roundManager.roundId;
    botGivenWeapons.clear();
    botFireTimers.clear();
    infBotCooldowns.clear();
    infBotPounceCooldowns.clear();
    pounceHitSet.clear();
    zombieRespawnTimers.clear();
    weapon.setWeapon("sword");
    weapon.resetAmmo();

    // Create/destroy world-space health bars each round
    if (roundManager.mode.name === "Tomfoolery") {
      createTmfBars(localEntities);
      resetWeaponCallbacks();
    } else if (roundManager.mode.name === "Infection") {
      createInfBars(localEntities);
      installInfectionCallbacks();
    } else {
      destroyTmfBars();
      destroyInfBars();
      resetWeaponCallbacks();
    }

    // Host picks who is IT and broadcasts; non-host waits for setit.
    if (knownPeers.size > 0 && roundManager.mode.name !== "Tomfoolery") {
      const allIds = [network.peerId, ...knownPeers].sort();
      const isHost = allIds[0] === network.peerId;
      if (isHost) {
        const itPeerId = allIds[roundManager.roundId % allIds.length];
        applyItPeer(itPeerId);
        network.sendSetIt(itPeerId, roundManager.roundId);
      } else {
        // Clear all local IT flags and wait for the host's setit message
        (player as unknown as Controllable).setIt(false);
        (player as unknown as Controllable).tagImmunity = 2;
        for (const rp of remotePlayers.values()) { rp.setIt(false); rp.tagImmunity = 2; }
        for (const bot of roundManager.bots) (bot as unknown as Controllable).setIt(false);
      }
    }
  }

  // If multiple human players are IT, resolve conflict: lowest peerId keeps IT
  if (knownPeers.size > 0 && roundManager.mode.name !== "Tomfoolery") {
    const lp = player as unknown as Controllable;
    const humanIts: string[] = [];
    if (lp.isIt) humanIts.push(network.peerId);
    for (const [id, rp] of remotePlayers) if (rp.isIt) humanIts.push(id);
    if (humanIts.length > 1) {
      humanIts.sort();
      applyItPeer(humanIts[0]);
    }
  }

  // Cross-player tag detection (local ↔ remote) — handled here, not by roundManager
  const lp = player as unknown as Controllable;
  if (!lp.isEliminated && lp.tagImmunity <= 0) {
    for (const [id, rp] of remotePlayers) {
      if (rp.isEliminated) continue;
      if (lp.position.distanceTo(rp.position) > 1.5) continue;
      if (lp.isIt && rp.tagImmunity <= 0) {
        lp.setIt(false); lp.tagImmunity = 2;
        rp.setIt(true);  rp.tagImmunity = 0;
        network.sendTag(network.peerId, id);
        break;
      } else if (rp.isIt && !lp.isIt && rp.tagImmunity <= 0) {
        rp.setIt(false); rp.tagImmunity = 2;
        lp.setIt(true);  lp.tagImmunity = 0;
        network.sendTag(id, network.peerId);
        break;
      }
    }
  }

  // Broadcast local player state at 20 Hz
  if (gameStarted) {
    _netTickAccum += dt;
    if (_netTickAccum >= NET_TICK) {
      _netTickAccum = 0;
      const p = player as unknown as Controllable;
      network.sendState({
        username:     localUsername,
        isAdmin:      roundManager.isAdmin,
        x: p.position.x, y: p.position.y, z: p.position.z,
        vx: p.velocity.x, vy: p.velocity.y, vz: p.velocity.z,
        yaw:          player.yaw,
        isFrozen:     p.isFrozen,
        isEliminated: p.isEliminated,
      });
    }
  }

  // Admin speed boost applied after round manager resets speedBoost each frame
  if (adminSpeedActive && !player.isEliminated && !player.isFrozen) {
    player.speedBoost *= 2;
  }

  const feet = new THREE.Vector3(player.position.x, player.position.y + 0.1, player.position.z);
  roundManager.updateTeleporters(dt, feet, player, drawTimerSprite);

  const p = player.position;
  coordsEl.textContent = `x:${p.x.toFixed(1)}  y:${p.y.toFixed(1)}  z:${p.z.toFixed(1)}  ${input.pointerLocked ? "" : "[click to capture mouse]"}`;

  // ── Tomfoolery HUD + world-space bars ─────────────────────────────────────
  const tmfHudEl  = document.getElementById("tmf-hud")!;
  const tmfLivesEl = document.getElementById("tmf-lives")!;
  const tmfHpBar   = document.getElementById("tmf-hp-bar") as HTMLDivElement;
  const tmfHpText  = document.getElementById("tmf-hp-text")!;

  if (isTomfoolery) {
    tmfHudEl.style.display = "block";
    const lpc = player as unknown as Controllable;
    const hp    = Math.max(0, lpc.hp);
    const lives = Math.max(0, lpc.lives);
    const pct   = Math.round((hp / TMF_MAX_HP) * 100);
    // Hearts
    tmfLivesEl.textContent = "♥".repeat(lives) + "♡".repeat(Math.max(0, TMF_MAX_LIVES - lives));
    tmfLivesEl.style.color = lives >= 2 ? "#ff3355" : lives === 1 ? "#ff8800" : "#666";
    // HP bar
    tmfHpBar.style.width   = `${pct}%`;
    tmfHpBar.style.background = pct > 50 ? "#44ff44" : pct > 25 ? "#ffcc00" : "#ff3300";
    tmfHpText.textContent  = `${hp} / ${TMF_MAX_HP} HP`;

    // World-space bars above each entity
    for (const [e, bar] of tmfBars) {
      if (e.hp !== bar.lastHp || e.lives !== bar.lastLives) {
        _drawTmfBar(bar, e.hp, e.lives);
      }
      bar.sprite.visible = !e.isEliminated;
      if (!e.isEliminated) {
        bar.sprite.position.set(e.position.x, e.position.y + 2.85, e.position.z);
      }
    }
  } else if (isInfection) {
    tmfHudEl.style.display = "none";
    for (const bar of tmfBars.values()) bar.sprite.visible = false;
    // World-space HP bars for Infection mode
    for (const [e, bar] of infBars) {
      if (e.hp !== bar.lastHp || e.isIt !== bar.lastIsIt) {
        _drawInfBar(bar, e);
      }
      bar.sprite.visible = !e.isEliminated;
      if (!e.isEliminated) {
        bar.sprite.position.set(e.position.x, e.position.y + 2.85, e.position.z);
      }
    }
  } else {
    tmfHudEl.style.display = "none";
    for (const bar of tmfBars.values()) bar.sprite.visible = false;
    for (const bar of infBars.values()) bar.sprite.visible = false;
  }

  // Show weapon viewmodel when weapons are active and player isn't eliminated
  setViewModelWeapon(weaponsActive && !player.isEliminated ? weapon.type : null);

  renderer.autoClear = true;
  renderer.render(scene, thirdPersonCam.camera);
  renderer.autoClear = false;
  renderViewModel(renderer, window.innerWidth / window.innerHeight);
  renderer.autoClear = true;
}

gameLoop();
