export class InputHandler {
  readonly keys: Set<string> = new Set();
  mouseDeltaX = 0;
  mouseDeltaY = 0;
  mouseLeftPressed = false;

  private _rawDeltaX = 0;
  private _rawDeltaY = 0;
  private _rawMouseLeft = false;
  private _pointerLocked = false;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      // Don't intercept input while a text field is focused (e.g. login box)
      if (document.activeElement instanceof HTMLInputElement) return;
      this.keys.add(e.code);
      e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });

    canvas.addEventListener("click", () => {
      canvas.requestPointerLock();
    });

    // Left-click fires weapon when pointer is locked
    window.addEventListener("mousedown", (e) => {
      if (e.button === 0 && this._pointerLocked) this._rawMouseLeft = true;
    });

    document.addEventListener("pointerlockchange", () => {
      this._pointerLocked = document.pointerLockElement === canvas;
    });

    document.addEventListener("mousemove", (e) => {
      if (!this._pointerLocked) return;
      this._rawDeltaX += e.movementX;
      this._rawDeltaY += e.movementY;
    });
  }

  /** Call once per frame to consume accumulated mouse deltas and clicks. */
  flush() {
    this.mouseDeltaX = this._rawDeltaX;
    this.mouseDeltaY = this._rawDeltaY;
    this.mouseLeftPressed = this._rawMouseLeft;
    this._rawDeltaX = 0;
    this._rawDeltaY = 0;
    this._rawMouseLeft = false;
  }

  isDown(code: string) {
    return this.keys.has(code);
  }

  get pointerLocked() {
    return this._pointerLocked;
  }
}
