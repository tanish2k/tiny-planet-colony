/* =============================================================
   iso.js — isometric <-> screen coordinate math + the camera.
   The camera holds a pan offset (x,y) and a zoom level.
   ============================================================= */

const Camera = {
  x: 0,        // screen-space offset of grid origin
  y: 0,
  zoom: 1,
  minZoom: 0.5,
  maxZoom: 2.2,
};

const Iso = {
  /* Centre the camera so the whole grid sits in the middle of the canvas. */
  center(canvas) {
    const g = CONFIG.GRID;
    // middle tile of the grid in unscaled iso space
    const midX = 0; // (col-row) is 0 along the main diagonal
    const midY = ((g - 1)) * CONFIG.TILE_H / 2; // (col+row) midpoint
    Camera.x = canvas.clientWidth / 2 - midX * Camera.zoom;
    Camera.y = canvas.clientHeight / 2 - midY * Camera.zoom - 40;
  },

  /* Grid (col,row) -> screen pixel (top point of the tile diamond). */
  toScreen(col, row) {
    const sx = (col - row) * (CONFIG.TILE_W / 2);
    const sy = (col + row) * (CONFIG.TILE_H / 2);
    return {
      x: sx * Camera.zoom + Camera.x,
      y: sy * Camera.zoom + Camera.y,
    };
  },

  /* Screen pixel -> fractional grid (col,row). Floor for the tile index. */
  toGrid(px, py) {
    const x = (px - Camera.x) / Camera.zoom;
    const y = (py - Camera.y) / Camera.zoom;
    const a = x / (CONFIG.TILE_W / 2);
    const b = y / (CONFIG.TILE_H / 2);
    const col = (a + b) / 2;
    const row = (b - a) / 2;
    return { col: Math.floor(col), row: Math.floor(row) };
  },

  inBounds(col, row) {
    return col >= 0 && row >= 0 && col < CONFIG.GRID && row < CONFIG.GRID;
  },
};
