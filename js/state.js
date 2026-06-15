/* =============================================================
   state.js — the game state + localStorage save / load.
   `State` is the single source of truth for the simulation.
   ============================================================= */

const SAVE_KEY = 'tinyPlanetColony.save.v1';

const State = {
  data: null,

  /* Build a brand new colony. */
  fresh() {
    const g = CONFIG.GRID;
    // grid[row][col] = building key | null
    const grid = Array.from({ length: g }, () => Array(g).fill(null));
    // terrain layers — the planet starts BARREN. No grass until you grow it.
    const terra  = Array.from({ length: g }, () => Array(g).fill(0)); // 0=rock .. 1=lush
    const infest = Array.from({ length: g }, () => Array(g).fill(0)); // 0=clean .. 1=corrupted

    this.data = {
      grid, terra, infest,
      energy:  CONFIG.START.energy,
      oxygen:  CONFIG.START.oxygen,
      science: CONFIG.START.science,
      population: CONFIG.START.population,

      techs: {},          // techKey -> true when researched
      time: 0,            // seconds survived
      daytime: 0.25,      // 0..1 clock; 0=midnight, 0.5=noon (start at dawn)
      paused: false,
      nextEvent: rand(CONFIG.EVENT_MIN, CONFIG.EVENT_MAX),
      storm: null,        // { timeLeft, factor } while a dust storm rages
      status: 'playing',  // 'playing' | 'won' | 'lost'
      nests: [],          // corruption sources {col,row}

      // transient rates, refreshed every tick (handy for the HUD)
      rates: { energy: 0, oxygen: 0, science: 0 },
    };

    // A small starter base near the middle, on a tiny patch of seeded ground.
    const m = Math.floor(g / 2);
    this.place(m,     m,     'home');
    this.place(m - 1, m,     'solar');
    this.place(m,     m - 1, 'oxygen');
    // give the starter tiles a faint head start of life
    for (const [c, r] of [[m, m], [m - 1, m], [m, m - 1]]) terra[r][c] = 0.4;

    // seed a couple of corruption nests at the far corners of the map
    this.data.nests = [{ col: 1, row: 1 }, { col: g - 2, row: g - 2 }];
    return this.data;
  },

  /* Place a building (no cost check — caller validates). */
  place(col, row, key) {
    this.data.grid[row][col] = key;
  },

  /* Count buildings of each type by scanning the grid. */
  counts() {
    const c = { solar: 0, oxygen: 0, lab: 0, home: 0, battery: 0 };
    const grid = this.data.grid;
    for (let r = 0; r < grid.length; r++)
      for (let col = 0; col < grid[r].length; col++) {
        const k = grid[r][col];
        if (k) c[k]++;
      }
    return c;
  },

  /* Max population = base + housing from homes (with tech bonus). */
  capacity() {
    const homes = this.counts().home;
    const per = BUILDINGS.home.capacity * (this.data.techs.habDomes ? 1.5 : 1);
    return Math.floor(5 + homes * per);
  },

  allTechsDone() {
    return Object.keys(TECHS).every(k => this.data.techs[k]);
  },

  /* Fraction of the planet that is lush (terraformed, not corrupted). */
  greenFraction() {
    const { terra, infest } = this.data;
    const g = terra.length;
    let lush = 0;
    for (let r = 0; r < g; r++)
      for (let c = 0; c < g; c++)
        if (terra[r][c] > 0.6 && infest[r][c] < 0.3) lush++;
    return lush / (g * g);
  },

  /* Average corruption across the planet (for the HUD threat meter). */
  corruptionFraction() {
    const inf = this.data.infest;
    const g = inf.length;
    let sum = 0;
    for (let r = 0; r < g; r++) for (let c = 0; c < g; c++) sum += inf[r][c];
    return sum / (g * g);
  },

  /* ---------------- persistence ---------------- */
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
      return true;
    } catch (e) {
      console.warn('Save failed', e);
      return false;
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || !d.grid) return false;
      // ensure forward-compatible fields exist
      d.rates = d.rates || { energy: 0, oxygen: 0, science: 0 };
      d.techs = d.techs || {};
      if (typeof d.daytime !== 'number') d.daytime = 0.25;
      // forward-compat: old saves had no terrain layers
      const g = d.grid.length;
      if (!d.terra)  d.terra  = Array.from({ length: g }, () => Array(g).fill(0));
      if (!d.infest) d.infest = Array.from({ length: g }, () => Array(g).fill(0));
      if (!d.nests)  d.nests  = [{ col: 1, row: 1 }, { col: g - 2, row: g - 2 }];
      this.data = d;
      return true;
    } catch (e) {
      console.warn('Load failed', e);
      return false;
    }
  },

  hasSave() {
    return !!localStorage.getItem(SAVE_KEY);
  },

  clear() {
    localStorage.removeItem(SAVE_KEY);
  },
};

/* tiny helper: random float in [a,b) */
function rand(a, b) { return a + Math.random() * (b - a); }
