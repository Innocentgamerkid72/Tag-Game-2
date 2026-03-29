import * as THREE from "three";

/** Floating "IT" crown sprite shown above whoever is it. */
export function makeItSprite(): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width  = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;

  // Badge background
  ctx.fillStyle = "rgba(255, 40, 0, 0.85)";
  ctx.beginPath();
  ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 8);
  ctx.fill();

  // Text
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("IT", canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.2, 0.6, 1);
  return sprite;
}
