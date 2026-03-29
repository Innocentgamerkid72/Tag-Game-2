import * as THREE from "three";
import { Controllable } from "../types";

const BOUNCE_FORCE   = 32;   // enough to clear a 15-unit building
const SURFACE_HEIGHT = 0.35; // total height of the trampoline pad

export class Trampoline {
  private readonly _mesh: THREE.Group;
  private readonly _topY: number;
  private readonly _halfW: number;

  constructor(
    _scene: THREE.Scene,
    x: number, y: number, z: number,
    size: number,
    add: <T extends THREE.Object3D>(o: T) => T,
    colliders: THREE.Box3[],
  ) {
    this._topY  = y + SURFACE_HEIGHT;
    this._halfW = size / 2;

    this._mesh = new THREE.Group();

    // Frame (dark metal ring)
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const frame = new THREE.Mesh(
      new THREE.TorusGeometry(size / 2, 0.12, 6, 20),
      frameMat,
    );
    frame.rotation.x = Math.PI / 2;
    frame.position.y = SURFACE_HEIGHT;
    this._mesh.add(frame);

    // Springs — 8 small cylinders around the rim
    const springMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const s = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, SURFACE_HEIGHT, 4),
        springMat,
      );
      s.position.set(Math.cos(a) * size / 2, SURFACE_HEIGHT / 2, Math.sin(a) * size / 2);
      this._mesh.add(s);
    }

    // Bounce surface (bright green disc)
    const surface = new THREE.Mesh(
      new THREE.CylinderGeometry(size / 2 - 0.1, size / 2 - 0.1, 0.06, 16),
      new THREE.MeshBasicMaterial({ color: 0x22ee44 }),
    );
    surface.position.y = SURFACE_HEIGHT;
    this._mesh.add(surface);

    // Glow light underneath
    const light = new THREE.PointLight(0x22ff44, 1.2, 5);
    light.position.y = SURFACE_HEIGHT;
    this._mesh.add(light);

    this._mesh.position.set(x, y, z);
    add(this._mesh);

    // Thin collider so entities land on the surface
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - this._halfW, y, z - this._halfW),
      new THREE.Vector3(x + this._halfW, y + SURFACE_HEIGHT, z + this._halfW),
    ));
  }

  update(_dt: number, entities: Controllable[]) {
    const cx = this._mesh.position.x;
    const cz = this._mesh.position.z;

    for (const e of entities) {
      if (e.isEliminated) continue;
      const dx = Math.abs(e.position.x - cx);
      const dz = Math.abs(e.position.z - cz);
      if (dx > this._halfW + 0.5 || dz > this._halfW + 0.5) continue;
      // Entity is above the surface and not already moving upward
      if (e.position.y >= this._topY - 0.15 && e.position.y <= this._topY + 0.2 && e.velocity.y <= 1) {
        e.velocity.y = BOUNCE_FORCE;
      }
    }
  }
}
