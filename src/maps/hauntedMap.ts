import * as THREE from "three";
import { MapResult, Teleporter } from "../testMap";

const BOUNDARY = 38;

export function buildHauntedMap(scene: THREE.Scene): MapResult {
  const colliders: THREE.Box3[] = [];
  const walls:     THREE.Box3[] = [];
  const teleporters: Teleporter[] = [];

  const _objs: THREE.Object3D[] = [];
  function add<T extends THREE.Object3D>(o: T): T { scene.add(o); _objs.push(o); return o; }

  scene.fog = new THREE.FogExp2(0x0a0616, 0.048);

  // Ground — dark earth
  const ground = add(new THREE.Mesh(
    new THREE.PlaneGeometry(BOUNDARY * 2, BOUNDARY * 2),
    new THREE.MeshLambertMaterial({ color: 0x100c08 }),
  ));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;

  // Dim moonlit ambient — dark purple, just enough to outline silhouettes
  add(new THREE.AmbientLight(0x3a2550, 1.1));

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function wall(x: number, z: number, w: number, h: number, d: number, color: number) {
    const mesh = add(new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color }),
    ));
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    walls.push(new THREE.Box3().setFromObject(mesh));
  }

  /** Flat-top platform: wall sides + walkable top. */
  function platform(x: number, z: number, w: number, d: number, h: number, color: number) {
    wall(x, z, w, h, d, color);
    const top = add(new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.3, d),
      new THREE.MeshLambertMaterial({ color }),
    ));
    top.position.set(x, h + 0.15, z);
    colliders.push(new THREE.Box3().setFromObject(top));
  }

  // Outdoor street lamppost — tall iron post with a glowing lamp head
  function lantern(x: number, z: number, y = 4.5) {
    // Weighted base
    const base = add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.18, 0.22, 6),
      new THREE.MeshLambertMaterial({ color: 0x1c1c1c }),
    ));
    base.position.set(x, 0.11, z);
    // Main post
    const post = add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.07, y, 6),
      new THREE.MeshLambertMaterial({ color: 0x222222 }),
    ));
    post.position.set(x, y / 2, z);
    // Short arm angled outward from the top
    const arm = add(new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.65),
      new THREE.MeshLambertMaterial({ color: 0x222222 }),
    ));
    arm.position.set(x, y, z + 0.32);
    // Lamp housing (glowing)
    const lamp = add(new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.30, 0.36),
      new THREE.MeshBasicMaterial({ color: 0xffdd55 }),
    ));
    lamp.position.set(x, y - 0.22, z + 0.64);
    // Cap shade above lamp
    const shade = add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.26, 0.09, 6),
      new THREE.MeshLambertMaterial({ color: 0x1c1c1c }),
    ));
    shade.position.set(x, y - 0.05, z + 0.64);
    // Strong warm point light
    const light = add(new THREE.PointLight(0xffaa44, 5.336, 22));
    light.position.set(x, y - 0.3, z + 0.64);

    // Collider so players (and the FP camera) can't walk into the post/lamp head
    walls.push(new THREE.Box3(
      new THREE.Vector3(x - 0.2, 0, z - 0.2),
      new THREE.Vector3(x + 0.2, y + 0.2, z + 0.95),
    ));
  }

  /** Dead tree: trunk + bare branching arms. */
  function deadTree(x: number, z: number, h = 7) {
    const trunk = add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.28, h, 6),
      new THREE.MeshLambertMaterial({ color: 0x1c1208 }),
    ));
    trunk.position.set(x, h / 2, z);
    trunk.castShadow = true;
    walls.push(new THREE.Box3(
      new THREE.Vector3(x - 0.3, 0, z - 0.3),
      new THREE.Vector3(x + 0.3, h, z + 0.3),
    ));
    // Two branches
    for (const [bx, bz, ang] of [[-0.5, 0, 0.4], [0.5, 0, -0.4]] as [number, number, number][]) {
      const branch = add(new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.1, 2.5, 5),
        new THREE.MeshLambertMaterial({ color: 0x1c1208 }),
      ));
      branch.position.set(x + bx * 1.2, h * 0.72, z + bz * 1.2);
      branch.rotation.z = ang;
      branch.castShadow = true;
    }
  }

  /** Tombstone: short wall slab. */
  function tombstone(x: number, z: number, w = 0.9, h = 1.4, rotY = 0) {
    const mesh = add(new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 0.22),
      new THREE.MeshLambertMaterial({ color: 0x3a3832 }),
    ));
    mesh.position.set(x, h / 2, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    walls.push(new THREE.Box3().setFromObject(mesh));
  }

  // ── Iron fence perimeter ──────────────────────────────────────────────────
  const FW = BOUNDARY * 2, FH = 5.5, FT = 0.5;
  wall(  0, -BOUNDARY, FW,      FH, FT, 0x1a1a1a);
  wall(  0,  BOUNDARY, FW,      FH, FT, 0x1a1a1a);
  wall(-BOUNDARY, 0,   FT, FH, FW,      0x1a1a1a);
  wall( BOUNDARY, 0,   FT, FH, FW,      0x1a1a1a);

  // ── Central Church ────────────────────────────────────────────────────────────
  const STONE = 0x2d2820, STONE2 = 0x221e18;
  const CW = 12, CD = 14, CH = 7;    // nave: width × depth × height
  const doorW = 3.5;
  const halfDW = (CW - doorW) / 2;   // 4.25 — wall slab each side of door

  // Box with its bottom face at yBase (for elevated structures)
  function wallAt(x: number, yBase: number, z: number, w: number, h: number, d: number, color: number, isWall = true) {
    const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color })));
    m.position.set(x, yBase + h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    (isWall ? walls : colliders).push(new THREE.Box3().setFromObject(m));
  }

  // Nave walls (N/S have door gaps; E/W solid)
  wall(-CW/2 + halfDW/2, -CD/2, halfDW, CH, 0.55, STONE);  // N left
  wall( CW/2 - halfDW/2, -CD/2, halfDW, CH, 0.55, STONE);  // N right
  wall(-CW/2 + halfDW/2,  CD/2, halfDW, CH, 0.55, STONE);  // S left
  wall( CW/2 - halfDW/2,  CD/2, halfDW, CH, 0.55, STONE);  // S right
  // E and W walls — broken walk-through window at z=0, decorative windows at z=±4.2
  const GAP_Z   = 0.95;  // half-width of broken window opening in z (total = 1.9u)
  const GAP_Y   = 1.9;   // passable height of broken window
  const T       = 0.55;  // wall thickness
  const BOARD_C = 0x3a2c1a, GLASS_C = 0x1a2a44, FRAME_C = 0x2a1e10;

  // Visual-only mesh (no collision)
  function vis(x: number, y: number, z: number, w: number, h: number, d: number, color: number, transparent = false, opacity = 1.0) {
    const m = add(new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      transparent
        ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity })
        : new THREE.MeshLambertMaterial({ color }),
    ));
    m.position.set(x, y, z);
    return m;
  }

  for (const wx of [-CW / 2, CW / 2]) {
    const segLen = CD / 2 - GAP_Z;         // 6.05 — length of each solid section
    const segCZ  = (CD / 2 + GAP_Z) / 2;  // 3.975 — centre z of each solid section

    // Solid sections flanking the gap
    wall(wx, -segCZ, T, CH, segLen, STONE);
    wall(wx,  segCZ, T, CH, segLen, STONE);
    // Upper strip above the broken window (y: GAP_Y → CH)
    wallAt(wx, GAP_Y, 0, T, CH - GAP_Y, GAP_Z * 2, STONE);

    // ── Decorative intact windows at z = ±4.2 ──────────────────────────────
    const gx = wx + (wx < 0 ? T / 2 - 0.06 : -(T / 2 - 0.06));  // inner wall face
    for (const wz of [-4.2, 4.2]) {
      vis(gx,  3.00, wz, 0.08, 2.00, 1.35, GLASS_C, true, 0.70);  // glass pane
      vis(wx,  4.06, wz, T + 0.1, 0.18, 1.55, FRAME_C);            // top rail
      vis(wx,  1.94, wz, T + 0.1, 0.18, 1.55, FRAME_C);            // bottom rail
      vis(wx,  3.00, wz - 0.75, T + 0.1, 2.38, 0.16, FRAME_C);    // left post
      vis(wx,  3.00, wz + 0.75, T + 0.1, 2.38, 0.16, FRAME_C);    // right post
      vis(wx,  3.00, wz, T + 0.1, 0.12, 1.35, FRAME_C);            // cross-bar
    }

    // ── Broken window frame remnants at z = 0 ──────────────────────────────
    vis(wx, GAP_Y + 0.13, 0,              T + 0.1, 0.26, GAP_Z * 2 + 0.1, FRAME_C); // top jamb
    vis(wx, GAP_Y / 2,    -(GAP_Z + 0.05), T + 0.1, GAP_Y, 0.15, FRAME_C);          // left jamb
    vis(wx, GAP_Y / 2,      GAP_Z + 0.05,  T + 0.1, GAP_Y, 0.15, FRAME_C);          // right jamb

    // Boards nailed across the outside face
    const ox = wx + (wx < 0 ? -(T / 2 + 0.09) : T / 2 + 0.09);
    ([
      [0.55,  0.38], [1.35, -0.30], [0.92, 0.12],
    ] as [number, number][]).forEach(([by, rot]) => {
      const b = add(new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.11, GAP_Z * 2 + 0.3),
        new THREE.MeshLambertMaterial({ color: BOARD_C }),
      ));
      b.position.set(ox, by, 0);
      b.rotation.z = rot;
    });
    // Broken glass shards
    ([[-0.45, 0.25], [0.32, 1.38], [0.05, 0.88]] as [number, number][]).forEach(([sz, sy]) => {
      const s = add(new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.28, 0.15),
        new THREE.MeshBasicMaterial({ color: 0x88aacc, transparent: true, opacity: 0.55 }),
      ));
      s.position.set(ox, sy, sz);
      s.rotation.z = sz * 1.4;
    });
  }

  // Arch lintels above doorways
  wallAt(0, CH - 1.4, -CD / 2, doorW + 0.3, 1.4, 0.6, STONE);
  wallAt(0, CH - 1.4,  CD / 2, doorW + 0.3, 1.4, 0.6, STONE);

  // ── Door in N opening (opens outward, hinged left) ─────────────────────────
  vis(-doorW / 2 - 0.16, CH / 2, -CD / 2, 0.32, CH, 0.42, FRAME_C);  // left post
  vis( doorW / 2 + 0.16, CH / 2, -CD / 2, 0.32, CH, 0.42, FRAME_C);  // right post

  const doorH   = CH - 1.5;
  const doorGrp = add(new THREE.Group());
  doorGrp.position.set(-doorW / 2, 0, -CD / 2);
  doorGrp.rotation.y = Math.PI / 5;  // ≈ 36° open, swings outward

  const doorPanel = new THREE.Mesh(
    new THREE.BoxGeometry(doorW - 0.15, doorH, 0.12),
    new THREE.MeshLambertMaterial({ color: 0x3a2812 }),
  );
  doorPanel.position.set((doorW - 0.15) / 2, doorH / 2, 0);
  doorGrp.add(doorPanel);
  for (let py = 0.35; py < doorH; py += 0.75) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(doorW - 0.25, 0.06, 0.14),
      new THREE.MeshLambertMaterial({ color: 0x2e2010 }),
    );
    plank.position.set((doorW - 0.15) / 2, py, -0.13);
    doorGrp.add(plank);
  }
  // Gothic buttresses flanking E and W walls
  for (const bz of [-5, 0, 5]) {
    wallAt(-CW/2 - 0.55, 0, bz, 0.55, CH * 0.85, 1.4, STONE);
    wallAt( CW/2 + 0.55, 0, bz, 0.55, CH * 0.85, 1.4, STONE);
  }
  // Nave roof — walkable platform
  platform(0, 0, CW, CD, CH, STONE2);

  // Bell tower atop the nave (centred)
  const TW = 4.2, TD = 4.2, TH = 5;
  wallAt( 0,    CH, -TD/2, TW,  TH, 0.5, STONE);  // N face
  wallAt( 0,    CH,  TD/2, TW,  TH, 0.5, STONE);  // S face
  wallAt(-TW/2, CH,  0,    0.5, TH, TD,  STONE);  // W face
  wallAt( TW/2, CH,  0,    0.5, TH, TD,  STONE);  // E face
  // Tower roof slab (walkable)
  wallAt(0, CH + TH, 0, TW, 0.35, TD, STONE2, false);

  // Steeple — 4-sided pyramid
  const spire = add(new THREE.Mesh(
    new THREE.CylinderGeometry(0, 2.0, 5.5, 4),
    new THREE.MeshLambertMaterial({ color: 0x1a1210 }),
  ));
  spire.position.set(0, CH + TH + 0.35 + 2.75, 0);
  spire.rotation.y = Math.PI / 4;

  // Cross at the peak
  const crossY = CH + TH + 0.35 + 5.5;
  const vb = add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 0.2), new THREE.MeshLambertMaterial({ color: 0x3a2a18 })));
  vb.position.set(0, crossY + 1.3, 0);
  const hb = add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 0.2), new THREE.MeshLambertMaterial({ color: 0x3a2a18 })));
  hb.position.set(0, crossY + 1.8, 0);

  // Interior lantern + warm orange glow
  lantern(0, 0, 2.2);
  const cLight = add(new THREE.PointLight(0xff8833, 2.5, 20));
  cLight.position.set(0, 3.5, 0);

  // ── Burial mounds (low raised platforms) ─────────────────────────────────
  platform(-18, -14, 6, 3, 1.2, 0x181008);
  platform( 16,  12, 5, 3, 1.0, 0x181008);
  platform(-14,  18, 3, 6, 1.2, 0x181008);
  platform( 20, -16, 3, 5, 1.0, 0x181008);

  // ── Tombstone clusters ────────────────────────────────────────────────────
  const stones: [number, number, number?, number?, number?][] = [
    // NW cluster
    [-24, -20], [-22, -18, 0.8, 1.2, 0.2], [-26, -22, 1.1, 1.5, -0.1],
    [-20, -24, 0.7, 1.1, 0.3], [-28, -18, 1.0, 1.6, 0.1],
    // NE cluster
    [ 22, -18], [ 24, -22, 0.8, 1.2, -0.2], [ 20, -20, 1.0, 1.5, 0.15],
    [ 26, -24, 0.7, 1.1, 0.2], [ 28, -18, 1.1, 1.4, -0.1],
    // SW cluster
    [-22,  20], [-24,  22, 1.0, 1.3, 0.1], [-20,  24, 0.8, 1.6, -0.2],
    [-28,  22, 0.7, 1.1, 0.3], [-26,  18, 1.1, 1.5, -0.1],
    // SE cluster
    [ 22,  20], [ 24,  22, 0.9, 1.2, 0.2], [ 20,  24, 1.1, 1.5, -0.15],
    [ 28,  22, 0.7, 1.1, 0.1], [ 26,  18, 1.0, 1.4, -0.2],
    // Mid scattered
    [-8, -28, 0.8, 1.2], [8, -28, 1.0, 1.5, 0.2], [0, -32, 0.9, 1.3, -0.1],
    [-8,  28, 0.8, 1.2], [8,  28, 1.0, 1.5, 0.2], [0,  32, 0.9, 1.3,  0.1],
    [-32, -6], [ 32, -6, 0.9, 1.5, 0.1], [-32, 8, 1.1, 1.3], [32, 8],
  ];
  for (const [x, z, w, h, r] of stones) tombstone(x, z, w, h, r);

  // ── Inner iron fence corridors (funnel approaches to mausoleum) ──────────
  // N/S approach flanks
  wall(-14, -12, 0.3, 4.0, 10, 0x1e1e1e);
  wall( 14, -12, 0.3, 4.0, 10, 0x1e1e1e);
  wall(-14,  12, 0.3, 4.0, 10, 0x1e1e1e);
  wall( 14,  12, 0.3, 4.0, 10, 0x1e1e1e);
  // Short cross-stubs E/W of church doorways
  wall(-10, -2, 4, 3.5, 0.3, 0x1e1e1e);
  wall(-10,  2, 4, 3.5, 0.3, 0x1e1e1e);
  wall( 10, -2, 4, 3.5, 0.3, 0x1e1e1e);
  wall( 10,  2, 4, 3.5, 0.3, 0x1e1e1e);

  // ── Stone crypt fragments (L-walls in 4 mid-zones) ───────────────────────
  wall(-18, -20, 8, 3.5, 0.5, 0x2c2824);
  wall(-22, -17, 0.5, 3.5, 6,  0x2c2824);
  wall( 18, -20, 8, 3.5, 0.5, 0x2c2824);
  wall( 22, -17, 0.5, 3.5, 6,  0x2c2824);
  wall(-18,  20, 8, 3.5, 0.5, 0x2c2824);
  wall(-22,  17, 0.5, 3.5, 6,  0x2c2824);
  wall( 18,  20, 8, 3.5, 0.5, 0x2c2824);
  wall( 22,  17, 0.5, 3.5, 6,  0x2c2824);

  // ── Hedge dividers (E/W blocking walls with central gap) ─────────────────
  wall( 24, -7, 0.5, 2.2,  8, 0x162010);
  wall( 24,  7, 0.5, 2.2,  8, 0x162010);
  wall(-24, -7, 0.5, 2.2,  8, 0x162010);
  wall(-24,  7, 0.5, 2.2,  8, 0x162010);
  // N/S hedge rows with gap at centre (two halves each)
  wall( -9, -22, 8, 2.2, 0.5, 0x162010);
  wall(  9, -22, 8, 2.2, 0.5, 0x162010);
  wall( -9,  22, 8, 2.2, 0.5, 0x162010);
  wall(  9,  22, 8, 2.2, 0.5, 0x162010);

  // ── Mid-area tombstone rows (low barriers in open ground) ─────────────────
  for (const [tx, tz] of [
    [-4,-15],[0,-15],[4,-15], [-4,15],[0,15],[4,15],
    [-15,-4],[-15,0],[-15,4], [15,-4],[15,0],[15,4],
    [-8,-8],[8,8],[-8,8],[8,-8],
  ] as [number,number][]) tombstone(tx, tz, 0.9, 1.4);

  // ── Additional stone crypt walls (inner maze near mausoleum) ─────────────────
  // NW quadrant passage walls
  wall( -6, -8,  6, 3.0, 0.4, 0x2c2824);
  wall(-10, -6,  0.4, 3.0,  8, 0x2c2824);
  // NE quadrant passage walls
  wall(  6, -8,  6, 3.0, 0.4, 0x2c2824);
  wall( 10, -6,  0.4, 3.0,  8, 0x2c2824);
  // SW quadrant passage walls
  wall( -6,  8,  6, 3.0, 0.4, 0x2c2824);
  wall(-10,  6,  0.4, 3.0,  8, 0x2c2824);
  // SE quadrant passage walls
  wall(  6,  8,  6, 3.0, 0.4, 0x2c2824);
  wall( 10,  6,  0.4, 3.0,  8, 0x2c2824);

  // ── Outer broken ring walls ───────────────────────────────────────────────────
  wall(-28,   0, 0.4, 4.5, 12, 0x2a2420);
  wall( 28,   0, 0.4, 4.5, 12, 0x2a2420);
  wall(  0, -28, 12,  4.5, 0.4, 0x2a2420);
  wall(  0,  28, 12,  4.5, 0.4, 0x2a2420);
  wall(-28, -10, 0.4, 4.5,  8, 0x2a2420);
  wall(-28,  10, 0.4, 4.5,  8, 0x2a2420);
  wall( 28, -10, 0.4, 4.5,  8, 0x2a2420);
  wall( 28,  10, 0.4, 4.5,  8, 0x2a2420);

  // ── Extra low tomb slabs (mid-map barriers) ────────────────────────────────────
  for (const [tx, tz, tr] of [
    [ -5,-20, 0.10], [  5,-20,-0.10], [ -5, 20, 0.20], [  5, 20,-0.20],
    [-20, -5, 0.00], [-20,  5, 0.15], [ 20, -5, 0.00], [ 20,  5,-0.10],
    [ -2,-10, 0.05], [  2, 10,-0.05], [-10,  2, 0.10], [ 10, -2,-0.10],
  ] as [number,number,number][]) tombstone(tx, tz, 1.1, 0.7, tr);

  // ── Dead trees ────────────────────────────────────────────────────────────
  deadTree(-12, -10, 7);
  deadTree( 12,  10, 8);
  deadTree(-10,  12, 6.5);
  deadTree( 10, -12, 7.5);
  deadTree(-30, -10, 8);
  deadTree( 30,  10, 7);
  deadTree(-10,  30, 8);
  deadTree( 10, -30, 7);

  // ── Lampposts — mid-map ring ──────────────────────────────────────────────
  lantern(-16,  -2);
  lantern( 16,   2);
  lantern( -2,  16);
  lantern(  2, -16);
  lantern(-28,  28);
  lantern( 28, -28);
  lantern(-20, -20);
  lantern( 20,  20);

  // ── Lampposts flanking the church ─────────────────────────────────────────
  lantern(-2.5, -10.5);   lantern( 2.5, -10.5);   // N approach
  lantern(-2.5,  10.5);   lantern( 2.5,  10.5);   // S approach
  lantern(-9.5,   0);     lantern( 9.5,   0);      // E and W sides of nave

  // ── Lampposts on outer corridors ─────────────────────────────────────────
  lantern(-22,  -5);      lantern( 22,   5);       // diagonal outer
  lantern(  5, -22);      lantern( -5,  22);       // diagonal outer
  lantern(-22,  12);      lantern( 22, -12);       // far flanks

  // ── Mid-corridor L-walls (blind-corner ambush spots in each quadrant) ──────
  wall(-5, -13, 7, 3.0, 0.4, 0x28241e);
  wall(-8,  -9, 0.4, 3.0, 7,  0x28241e);
  wall( 5, -13, 7, 3.0, 0.4, 0x28241e);
  wall( 8,  -9, 0.4, 3.0, 7,  0x28241e);
  wall(-5,  13, 7, 3.0, 0.4, 0x28241e);
  wall(-8,   9, 0.4, 3.0, 7,  0x28241e);
  wall( 5,  13, 7, 3.0, 0.4, 0x28241e);
  wall( 8,   9, 0.4, 3.0, 7,  0x28241e);

  // ── Outer choke-point stubs (narrow the edge lanes) ───────────────────────
  wall(-21,  -5, 0.4, 3.0, 8, 0x28241e);
  wall(-21,   5, 0.4, 3.0, 8, 0x28241e);
  wall( 21,  -5, 0.4, 3.0, 8, 0x28241e);
  wall( 21,   5, 0.4, 3.0, 8, 0x28241e);
  wall( -5, -21, 8, 3.0, 0.4, 0x28241e);
  wall(  5, -21, 8, 3.0, 0.4, 0x28241e);
  wall( -5,  21, 8, 3.0, 0.4, 0x28241e);
  wall(  5,  21, 8, 3.0, 0.4, 0x28241e);

  return {
    colliders, walls, teleporters,
    boundary: BOUNDARY,
    botBoundary: 30,
    gravity: -28,
    background: 0x0a0616,
    dispose() {
      for (const o of _objs) {
        scene.remove(o);
        (o as THREE.Mesh).geometry?.dispose();
        ((o as THREE.Mesh).material as THREE.Material)?.dispose();
      }
    },
  };
}
