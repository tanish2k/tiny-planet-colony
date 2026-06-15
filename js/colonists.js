/* =============================================================
   colonists.js — the little astronauts wandering the colony.
   These are purely visual life: their count tracks population
   (capped for performance). They stroll between buildings,
   pause to "work", then move on. Not persisted — rebuilt on load.
   ============================================================= */

const Colonists = {
  agents: [],
  visorHues: [180, 200, 280, 320, 40, 140],  // visor colors for variety

  /* Keep the agent count in step with the population. */
  sync() {
    const want = Math.min(Math.floor(State.data.population), CONFIG.MAX_AGENTS);
    while (this.agents.length < want) this.spawn();
    while (this.agents.length > want) this.agents.pop();
  },

  spawn() {
    const start = this.randomBuildingTile() || this.randomTile();
    this.agents.push({
      x: start.col + 0.5,
      y: start.row + 0.5,
      tx: start.col + 0.5,
      ty: start.row + 0.5,
      speed: 0.6 + Math.random() * 0.5,   // tiles / second
      state: 'idle',
      timer: Math.random() * 2,
      hue: this.visorHues[(Math.random() * this.visorHues.length) | 0],
      phase: Math.random() * Math.PI * 2, // bob offset
      flip: 1,
    });
    this.retarget(this.agents[this.agents.length - 1]);
  },

  update(dt) {
    if (State.data.status !== 'playing' || State.data.paused) {
      // still let them finish a step subtly? keep them frozen when paused
    }
    for (const a of this.agents) {
      if (a.state === 'idle') {
        a.timer -= dt;
        if (a.timer <= 0) this.retarget(a);
        continue;
      }
      // walk toward target
      const dx = a.tx - a.x;
      const dy = a.ty - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.04) {
        a.x = a.tx; a.y = a.ty;
        a.state = 'idle';
        a.timer = 1 + Math.random() * 3;   // pause / "work"
        continue;
      }
      const step = Math.min(dist, a.speed * dt);
      a.x += (dx / dist) * step;
      a.y += (dy / dist) * step;
      // face left/right based on screen-x movement (iso: col-row)
      a.flip = (dx - dy) >= 0 ? 1 : -1;
    }
  },

  retarget(a) {
    const t = (Math.random() < 0.7 && this.randomBuildingTile()) || this.randomTile();
    // aim for a spot near the tile centre, slightly scattered
    a.tx = t.col + 0.3 + Math.random() * 0.4;
    a.ty = t.row + 0.3 + Math.random() * 0.4;
    a.state = 'walk';
  },

  randomTile() {
    const g = CONFIG.GRID;
    return { col: (Math.random() * g) | 0, row: (Math.random() * g) | 0 };
  },

  randomBuildingTile() {
    const grid = State.data.grid;
    const tiles = [];
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < grid[r].length; c++)
        if (grid[r][c]) tiles.push({ col: c, row: r });
    if (!tiles.length) return null;
    return tiles[(Math.random() * tiles.length) | 0];
  },

  reset() { this.agents = []; },
};
