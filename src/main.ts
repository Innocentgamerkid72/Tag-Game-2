import * as THREE from "three";
import { InputHandler } from "./input";
import { Player } from "./player";
import { ThirdPersonCamera } from "./camera";
import { Teleporter } from "./testMap";
import { Controllable } from "./types";
import { RoundManager } from "./roundManager";
import { WeaponSystem, WEAPON_ORDER, DEFS } from "./weapon";
import type { WeaponType } from "./weapon";
import { NetworkManager } from "./network";
import { RemotePlayer } from "./remotePlayer";
import type { NetMsg } from "./network";

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
weapon.setLocalPlayer(player as unknown as import("./types").Controllable);

// ── Networking ────────────────────────────────────────────────────────────────
const network = new NetworkManager();
const remotePlayers = new Map<string, RemotePlayer>();

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

function handleNetMessage(msg: NetMsg) {
  if (msg.type === "state") {
    let rp = remotePlayers.get(msg.peerId);
    if (!rp) {
      rp = new RemotePlayer(scene, msg.peerId, msg.username);
      remotePlayers.set(msg.peerId, rp);
    }
    rp.applyState(msg);
    return;
  }
  if (msg.type === "tag") {
    const tagger = remotePlayers.get(msg.taggerId);
    const tagged  = remotePlayers.get(msg.taggedId);
    tagger?.setIt(false);
    tagged?.setIt(true);
    if (msg.taggerId === network.peerId) (player as unknown as Controllable).setIt(false);
    if (msg.taggedId  === network.peerId) (player as unknown as Controllable).setIt(true);
    return;
  }
  if (msg.type === "leave") {
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
const flashEl     = document.getElementById("flash-overlay") as HTMLDivElement;
const weaponHudEl = document.getElementById("weapon-hud")!;

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
const botGivenWeapons = new Map<number, WeaponType>();
const botFireTimers   = new Map<number, number>();
let lastRoundId = -1;
// Hunter mode — track bot It transitions
const hunterBotTimers     = new Map<number, number>();
const hunterBotWeaponIdx  = new Map<number, number>();
const HUNTER_WEAPONS: WeaponType[] = ["beartrap", "flashbang"];
let prevPlayerIsHunter = false;

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
  roundManager.isAdmin = lower.includes("innocent") || lower.includes("kid") || lower.includes("lawrence");
  if (roundManager.isAdmin) adminBtn.style.display = "block";
  roundManager.startRound();
}

nicknameSubmit.addEventListener("click", () => {
  const name = nicknameInput.value.trim();
  if (name.length < 2) {
    loginError.textContent = "Nickname must be at least 2 characters.";
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


// ── Bot aim helper ────────────────────────────────────────────────────────────
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
    return;
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

  // Build the full entity list before bot updates so bots can see the player
  const allEntities: Controllable[] = [
    player as unknown as Controllable,
    ...roundManager.bots as unknown as Controllable[],
    ...[...remotePlayers.values()],
  ];

  for (const bot of roundManager.bots) {
    bot.update(dt, colliders, walls, map ? map.teleporters : [], allEntities as unknown as { isIt: boolean; tagImmunity: number; isFrozen: boolean; position: THREE.Vector3 }[], map?.groundY ?? 0, map?.voidBoundary);
  }

  // Detect new round — clear all given weapons so they don't carry over
  if (roundManager.roundId !== lastRoundId) {
    lastRoundId = roundManager.roundId;
    botGivenWeapons.clear();
    botFireTimers.clear();
    hunterBotTimers.clear();
    hunterBotWeaponIdx.clear();
    prevPlayerIsHunter = false;
    weapon.setWeapon("blaster");
  }

  const isHunterMode     = roundManager.mode.name === "Hunter";
  const playerIsHunter   = isHunterMode && (player as unknown as Controllable).isIt;

  // Auto-equip beartrap the moment the player becomes the hunter
  if (playerIsHunter && !prevPlayerIsHunter) weapon.setWeapon("beartrap");
  prevPlayerIsHunter = playerIsHunter;

  // Hunter bots auto-fire beartrap / flashbang alternately at nearest target
  if (isHunterMode) {
    for (let i = 0; i < roundManager.bots.length; i++) {
      const bot = roundManager.bots[i];
      if (!(bot as unknown as Controllable).isIt || bot.isEliminated) continue;

      const timer = (hunterBotTimers.get(i) ?? 0) - dt;
      if (timer > 0) { hunterBotTimers.set(i, timer); continue; }

      const wIdx      = (hunterBotWeaponIdx.get(i) ?? 0) % HUNTER_WEAPONS.length;
      const wType     = HUNTER_WEAPONS[wIdx];
      hunterBotWeaponIdx.set(i, wIdx + 1);

      let nearest: Controllable | null = null;
      let nearestDist = Infinity;
      for (const e of allEntities) {
        if ((e as unknown) === (bot as unknown as Controllable) || e.isEliminated) continue;
        const d = bot.position.distanceTo(e.position);
        if (d < nearestDist) { nearestDist = d; nearest = e; }
      }
      if (nearest) {
        const origin = bot.position.clone().add(new THREE.Vector3(0, 1.4, 0));
        // Bear traps are thrown low; flashbangs can arc — use flat horizontal lead
        const dir = aimWithLead(origin, nearest, 10).setY(0).normalize();
        origin.addScaledVector(dir, 0.6);
        weapon.fireAs(scene, origin, dir, bot as unknown as Controllable, wType);
      }
      hunterBotTimers.set(i, DEFS[wType].cooldown);
    }
  }

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
      const dir = aimWithLead(origin, nearest, DEFS[weaponType].speed);
      origin.addScaledVector(dir, 0.6);
      weapon.fireAs(scene, origin, dir, bot as unknown as Controllable, weaponType);
    }
    botFireTimers.set(botIdx, DEFS[weaponType].cooldown);
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

  // Weapons are active in Tomfoolery, when admin gave one, or when player is the hunter
  const weaponsActive = isTomfoolery || adminGiveUsedRound === roundManager.roundId || playerIsHunter;

  // Provide current-frame context so hitscan weapons (laser) can resolve hits
  weapon.setContext(allEntities, colliders, walls);

  if (weaponsActive) {
    if (playerIsHunter) {
      // Hunter: only beartrap (6) and flashbang (7) are available
      if (input.isDown("Digit6")) weapon.setWeapon("beartrap");
      if (input.isDown("Digit7")) weapon.setWeapon("flashbang");
    } else {
      // Weapon switching — keys 1-7
      const weaponKeys = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7"];
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
    const WEAPON_COLORS: Record<string, string> = {
      blaster: "#ff6600", rocket: "#ff2200", freeze: "#44aaff", shotgun: "#ffee33",
      sword: "#aaddff", beartrap: "#cc7722", flashbang: "#eeeeff",
    };
    const hudWeapons: WeaponType[] = playerIsHunter ? HUNTER_WEAPONS : WEAPON_ORDER;
    weaponHudEl.innerHTML = hudWeapons.map((w, i) => {
      const active = w === weapon.type;
      const col = WEAPON_COLORS[w];
      const label = DEFS[w].name.split(" ")[0];
      const keyNum = playerIsHunter ? (i === 0 ? 6 : 7) : i + 1;
      return `<div style="
        padding:6px 14px;font-family:monospace;font-size:13px;border-radius:6px;
        background:${active ? col + "33" : "rgba(0,0,0,0.45)"};
        border:2px solid ${active ? col : "rgba(255,255,255,0.2)"};
        color:${active ? col : "rgba(255,255,255,0.5)"};
        font-weight:${active ? "bold" : "normal"};
      ">[${keyNum}] ${label}</div>`;
    }).join("");
  } else {
    weaponHudEl.innerHTML = "";
  }

  weapon.update(dt, scene, player as unknown as Controllable, allEntities, colliders, walls, map?.groundY ?? 0);

  // Snapshot isIt before round manager runs tag detection
  const prevLocalIsIt = (player as unknown as Controllable).isIt;
  const prevRemoteIsIt = new Map<string, boolean>();
  for (const [id, rp] of remotePlayers) prevRemoteIsIt.set(id, rp.isIt);

  roundManager.update(dt, allEntities);

  // Broadcast tag events when local round manager detects a tag involving a remote player
  if (prevLocalIsIt && !(player as unknown as Controllable).isIt) {
    // Local player was "it" and tagged someone — find the newly-it remote player
    for (const [id, rp] of remotePlayers) {
      if (!prevRemoteIsIt.get(id) && rp.isIt) {
        network.sendTag(network.peerId, id);
        break;
      }
    }
  }
  for (const [id, rp] of remotePlayers) {
    const wasIt = prevRemoteIsIt.get(id) ?? false;
    if (wasIt && !rp.isIt && !(player as unknown as Controllable).isIt && prevLocalIsIt === false
        && (player as unknown as Controllable).isIt) {
      // Remote was "it" and tagged local player
      network.sendTag(id, network.peerId);
    }
  }

  // Broadcast local player state at 20 Hz
  if (gameStarted) {
    _netTickAccum += dt;
    if (_netTickAccum >= NET_TICK) {
      _netTickAccum = 0;
      const p = player as unknown as Controllable;
      network.sendState({
        username:    localUsername,
        x: p.position.x, y: p.position.y, z: p.position.z,
        vx: p.velocity.x, vy: p.velocity.y, vz: p.velocity.z,
        yaw:         player.yaw,
        isIt:        p.isIt,
        isFrozen:    p.isFrozen,
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


  // Flashbang screen overlay
  flashEl.style.opacity = String(weapon.flashIntensity.toFixed(3));

  renderer.render(scene, thirdPersonCam.camera);
}

gameLoop();
