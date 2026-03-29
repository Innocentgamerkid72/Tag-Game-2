import * as THREE from "three";
import { InputHandler } from "./input";

const CAM_DISTANCE = 8;
const CAM_HEIGHT_OFFSET = 2.5;
const MIN_PITCH = -0.4; // radians
const MAX_PITCH = 1.0;

export class ThirdPersonCamera {
  camera: THREE.PerspectiveCamera;
  pitch = 0.3; // vertical angle

  constructor() {
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
  }

  update(targetPosition: THREE.Vector3, yaw: number, input: InputHandler) {
    // Adjust pitch with mouse Y
    this.pitch += input.mouseDeltaY * 0.002;
    this.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.pitch));

    // Orbit position behind player
    const x = targetPosition.x + Math.sin(yaw) * Math.cos(this.pitch) * CAM_DISTANCE;
    const y = targetPosition.y + CAM_HEIGHT_OFFSET + Math.sin(this.pitch) * CAM_DISTANCE;
    const z = targetPosition.z + Math.cos(yaw) * Math.cos(this.pitch) * CAM_DISTANCE;

    this.camera.position.set(x, y, z);
    this.camera.lookAt(
      targetPosition.x,
      targetPosition.y + CAM_HEIGHT_OFFSET * 0.6,
      targetPosition.z
    );
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
