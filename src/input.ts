export class InputHandler {
  readonly keys: Set<string> = new Set();
  mouseDeltaX = 0;
  mouseDeltaY = 0;
  mouseLeftPressed  = false;
  mouseRightPressed = false;

  private _rawDeltaX    = 0;
  private _rawDeltaY    = 0;
  private _rawMouseLeft  = false;
  private _rawMouseRight = false;
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

    // Mouse buttons — captured only when pointer is locked
    window.addEventListener("mousedown", (e) => {
      if (!this._pointerLocked) return;
      if (e.button === 0) this._rawMouseLeft  = true;
      if (e.button === 2) this._rawMouseRight = true;
    });
    // Prevent right-click context menu from appearing in-game
    window.addEventListener("contextmenu", (e) => e.preventDefault());

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
    this.mouseDeltaX      = this._rawDeltaX;
    this.mouseDeltaY      = this._rawDeltaY;
    this.mouseLeftPressed  = this._rawMouseLeft;
    this.mouseRightPressed = this._rawMouseRight;
    this._rawDeltaX    = 0;
    this._rawDeltaY    = 0;
    this._rawMouseLeft  = false;
    this._rawMouseRight = false;
  }

  isDown(code: string) {
    return this.keys.has(code);
  }

  get pointerLocked() {
    return this._pointerLocked;
  }
}
