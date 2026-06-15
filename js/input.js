/* =============================================================
   input.js — unified pointer input (mouse + touch).
   - drag to pan the camera
   - wheel / pinch to zoom
   - tap an empty tile to place the selected building
   - tap a building with nothing selected to inspect it
   ============================================================= */

const Input = {
  canvas: null,
  pointers: new Map(),   // id -> {x,y}
  dragging: false,
  moved: false,
  last: null,
  pinchDist: 0,

  init(canvas) {
    this.canvas = canvas;
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup',   e => this.up(e));
    canvas.addEventListener('pointercancel', e => this.up(e));
    canvas.addEventListener('pointerleave', () => { Render.hover = null; });
    canvas.addEventListener('wheel', e => this.wheel(e), { passive: false });
  },

  pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  },

  down(e) {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, this.pos(e));
    this.moved = false;

    if (this.pointers.size === 1) {
      this.dragging = true;
      this.last = this.pos(e);
    } else if (this.pointers.size === 2) {
      this.pinchDist = this.twoFingerDist();
    }
  },

  move(e) {
    const p = this.pos(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);

    // hover tile (mouse only — touch has no hover)
    if (e.pointerType === 'mouse' && this.pointers.size === 0) {
      Render.hover = Iso.toGrid(p.x, p.y);
      return;
    }

    if (this.pointers.size === 2) {
      // pinch zoom around the midpoint
      const d = this.twoFingerDist();
      if (this.pinchDist > 0) {
        const mid = this.twoFingerMid();
        this.zoomAt(mid.x, mid.y, d / this.pinchDist);
      }
      this.pinchDist = d;
      this.moved = true;
      return;
    }

    if (this.dragging && this.last) {
      const dx = p.x - this.last.x;
      const dy = p.y - this.last.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.moved = true;
      Camera.x += dx;
      Camera.y += dy;
      this.last = p;
      Render.hover = Iso.toGrid(p.x, p.y);
    }
  },

  up(e) {
    const p = this.pointers.get(e.pointerId) || this.pos(e);
    this.pointers.delete(e.pointerId);

    if (this.pointers.size < 2) this.pinchDist = 0;

    if (this.pointers.size === 0) {
      this.dragging = false;
      // a tap (no real drag) is a build/inspect action
      if (!this.moved) this.tap(p.x, p.y);
      this.last = null;
    }
  },

  tap(x, y) {
    const { col, row } = Iso.toGrid(x, y);
    if (!Iso.inBounds(col, row)) return;
    UI.onTileTap(col, row);
  },

  wheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const p = this.pos(e);
    this.zoomAt(p.x, p.y, factor);
  },

  /* Zoom keeping the world point under (sx,sy) fixed on screen. */
  zoomAt(sx, sy, factor) {
    const z0 = Camera.zoom;
    const z1 = clamp(z0 * factor, Camera.minZoom, Camera.maxZoom);
    const k = z1 / z0;
    // keep the cursor anchored
    Camera.x = sx - (sx - Camera.x) * k;
    Camera.y = sy - (sy - Camera.y) * k;
    Camera.zoom = z1;
  },

  twoFingerDist() {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  },
  twoFingerMid() {
    const pts = [...this.pointers.values()];
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  },
};
