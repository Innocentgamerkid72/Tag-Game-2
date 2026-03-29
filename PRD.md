# Online Tag Game — Product Requirements Document

## Overview

A 3D online multiplayer tag game. Players compete in several game modes across themed maps featuring platforms, walls, and teleporters. The game runs in the browser using Three.js for 3D rendering and Socket.io for real-time multiplayer.

---

## Game Modes

| Mode | Description |
|---|---|
| **Tag** | One player is "it" and must tag others. First player tagged becomes "it". |
| **Freeze Tag** | Tagged players freeze in place. Teammates can unfreeze them by touching them. Last unfrozen team loses. |
| **Hot Potato** | One player holds the "potato". They must tag someone else before a timer runs out or they explode and are eliminated. |
| **Infection** | One infected player tags others, turning them infected. Last survivor wins. |
| **Tomfoolery** | A normal tag game but everyone getS one random weapon: a punching gun, pie cannon, belt, fish, and a gummy worm launcher. The punching gun can launch players close to the wielder upon activation with a signifcant amount of flinging power. The pie cannon can do the same as the punching gun but with longer ranger and less flinging power. The belt has a bit larger range than the punching gun and can cause players who get hit by it to get highlighted to everyone while also inverting the controls for 10 seconds. The fish can be thrown and if it lands on a player, that player cannot use his/her weapon until the person who owns the weapon touches the fish. After attacking, the player cannot attack until he/she retrieves the fish by running over it. The gummy worm launcher can launch gummy worms that will slap any other player, it can only launch 5 worms and can retrieve the worms by stepping over them. |
| **Hunter** | A normal tag game, but the tagger can set up traps that slow and keep non-hunters still and sabatoge teleporters  where it will take them to the hunter while also getting a slight speed increase. |

---

## Maps

### Grasslands
- **Background:** Daytime sky
- **Platforms:** 6–10 trees and clouds
- **Special:** Picnic table with a teleporter that launches players up to the clouds
- **Hazards:** None

### Retro City
- **Background:** Night sky with city skyline
- **Platforms:** Rooftops and trees
- **Props:** Non-moving parked cars
- **Special:** Moving cars on the road — colliding with the front of a car flings the player in the car's direction
- **Teleporters:** Disguised as sewer lids

### Space Ruins
- **Background:** Galactic/starfield
- **Platforms:** Floating debris
- **Teleporters:** Holes in debris platforms
- **Hazards:** 1–2 moving black holes that pull players in if too close; player is carried for 5 seconds then flung

---

## Map Creation System

Since map layouts are complex to generate or handcraft through code alone, maps are defined as **JSON config files** paired with a **visual in-browser editor**.

### Map JSON Format

Each map is a single JSON file describing all scene objects:

```json
{
  "id": "grasslands",
  "displayName": "Grasslands",
  "background": "skybox_day",
  "spawnPoints": [
    { "x": 0, "y": 1, "z": 0 },
    { "x": 5, "y": 1, "z": 5 }
  ],
  "objects": [
    {
      "type": "platform",
      "shape": "box",
      "position": { "x": 0, "y": 3, "z": -10 },
      "size": { "w": 4, "h": 0.5, "d": 4 },
      "texture": "wood"
    },
    {
      "type": "teleporter",
      "position": { "x": 2, "y": 0, "z": -5 },
      "destination": { "x": 0, "y": 12, "z": -10 },
      "visual": "picnic_table"
    },
    {
      "type": "hazard",
      "subtype": "moving_car",
      "path": [
        { "x": -20, "y": 0, "z": 0 },
        { "x": 20, "y": 0, "z": 0 }
      ],
      "speed": 8,
      "flingForce": 15
    },
    {
      "type": "hazard",
      "subtype": "black_hole",
      "position": { "x": 10, "y": 5, "z": 10 },
      "pullRadius": 6,
      "holdDuration": 5,
      "flingForce": 20,
      "patrolPath": [
        { "x": 10, "y": 5, "z": 10 },
        { "x": -10, "y": 5, "z": 10 }
      ]
    }
  ]
}
```

### Supported Object Types

| Type | Subtypes / Notes |
|---|---|
| `platform` | `box`, `cylinder`, `sphere` — static collidable surfaces |
| `prop` | Decorative non-collidable objects (trees, cars, clouds) |
| `teleporter` | Point A → Point B warp with optional visual disguise |
| `hazard` | `moving_car`, `black_hole`, `bounce_pad` — interactive hazards |
| `spawnPoint` | Player spawn locations |

### Visual Map Editor

A lightweight in-browser editor (toggle with `Tab` in dev builds) that lets you:

- **Place objects** by clicking in the scene
- **Move/scale/rotate** objects with gizmos
- **Set properties** (texture, hazard type, patrol path) in a sidebar panel
- **Export** the current scene to JSON with one button
- **Import** an existing JSON to continue editing

This means you build maps visually, then the exported JSON is what the game loads — no manual coordinate math needed.

---

## Implementation Strategy

Build the game in phases. Complete and test each phase before moving to the next.

### Phase 1 — Core Engine
**Goal:** A single player can move around a 3D scene.

- Set up project: Vite + Three.js
- Player capsule with keyboard movement (WASD)
- Third-person camera that follows the player
- Basic gravity and ground collision
- Jump mechanic

### Phase 2 — Platform & Collision System
**Goal:** Players can walk on platforms at different heights.

- Static platform collision using raycasting or a physics library (Rapier or Cannon-es)
- Load a hardcoded test map (a few boxes)
- Implement platform edge detection (no sliding off unexpectedly)

### Phase 3 — Map JSON Loader
**Goal:** The game loads map layouts from JSON files.

- Write a `MapLoader` that parses JSON and spawns Three.js objects
- Implement all object types: platform, prop, teleporter, spawn points
- Test by loading the Grasslands JSON

### Phase 4 — Visual Map Editor
**Goal:** Maps can be created and exported without writing JSON by hand.

- In-scene object picker and placement tool
- Transform gizmos (translate, rotate, scale)
- Sidebar UI for object properties
- Export/import JSON button

### Phase 5 — Hazards
**Goal:** Interactive map elements work correctly.

- Moving objects (cars) with path following and fling-on-collision
- Teleporters warp players with a short animation
- Black holes: pull radius, hold timer, fling logic

### Phase 6 — Networking
**Goal:** Multiple players see each other in real time.

- Node.js + Socket.io server
- Player join/leave events, room management
- Server-authoritative position sync (send input, server sends back state)
- Basic interpolation to smooth remote player movement

### Phase 7 — Game Modes
**Goal:** All six game modes are playable.

- Shared game state machine (waiting → in-game → round-end)
- Implement each mode's rules on the server
- Tag detection (proximity check server-side)
- UI overlays: timers, "you are it" indicators, player status

### Phase 8 — Chat & UI
**Goal:** Players can communicate and navigate the game.

- In-game text chat (Socket.io broadcast)
- Lobby screen: room list, map picker, mode selector
- HUD: player count, mode-specific info, minimap (optional)
- Player name tags above characters

### Phase 9 — Polish
**Goal:** The game feels good to play.

- All three maps built and tested
- Sound effects: footsteps, tag, teleport, fling
- Animations: run, idle, jump
- Visual feedback: tag flash, freeze effect, black hole distortion
- Performance optimization for 10+ concurrent players

---

## Tech Stack

| Layer | Choice |
|---|---|
| Renderer | Three.js |
| Physics | Rapier (WASM) or Cannon-es |
| Bundler | Vite |
| Networking | Socket.io (Node.js server) |
| Language | TypeScript |
| Hosting | Railway / Render (server) + Vercel (client) |
