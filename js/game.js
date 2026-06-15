/* =============================================================
   game.js — bootstraps everything and runs the loops.

   IMPORTANT: the simulation is driven by a setInterval timer, NOT
   requestAnimationFrame. Browsers PAUSE requestAnimationFrame while
   a tab is in the background / not focused, which would freeze the
   whole colony. A timer keeps the economy ticking regardless, so the
   game is always playable. requestAnimationFrame is used only for
   smooth drawing while the tab is visible.
   Autosaves every 10 seconds.
   ============================================================= */

const Game = {
  canvas: null,
  lastSim: 0,      // wall-clock timestamp of the last sim step
  lastDraw: 0,
  acc: 0,          // accumulated real time for the fixed sim tick
  saveAcc: 0,
  running: false,
  centered: false, // camera centred once the canvas has a real size
  speed: 1,        // fast-forward multiplier (1 / 2 / 3)
  simTimer: null,
  intro: null,     // landing cinematic state {active,t,...}

  init() {
    this.canvas = document.getElementById('world');
    UI.init();
    Render.init(this.canvas);
    Input.init(this.canvas);

    // continue an existing colony, or start fresh (with a landing cinematic)
    if (State.hasSave() && State.load()) {
      UI.toast('info', '💾', 'Welcome back', 'Loaded your saved colony.');
    } else {
      State.fresh();
      this.startIntro();
    }

    UI.setPauseIcon(State.data.paused);
    UI.setSpeedLabel(this.speed);
    UI.refreshDock();
    Colonists.reset();
    Colonists.sync();

    this.running = true;
    this.lastSim = performance.now();
    this.lastDraw = this.lastSim;

    // Simulation timer — fires ~5x/sec and keeps running in the background.
    this.simTimer = setInterval(() => this.simStep(), 200);
    // Drawing loop — only paints when the tab is visible.
    requestAnimationFrame(t => this.drawLoop(t));

    // On refocus, avoid a giant catch-up jump.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { this.lastSim = performance.now(); this.lastDraw = this.lastSim; }
    });
  },

  /* Start the rocket-landing cinematic on a brand-new colony. */
  startIntro() {
    this.intro = { active: true, t: 0, dur: 4.4, land: 2.2, leave: 3.2, landed: false };
  },

  skipIntro() {
    if (!this.intro || !this.intro.active) return;
    this.touchdown();
    this.intro.active = false;
  },

  /* Fires the instant the ship sets down: dust, lights on, crew out. */
  touchdown() {
    if (this.intro.landed) return;
    this.intro.landed = true;
    const m = Math.floor(CONFIG.GRID / 2);
    for (const [c, r] of [[m, m], [m - 1, m], [m, m - 1]])
      Render.flash(r, c, 'rgba(255,220,120,0.6)');
    UI.toast('info', '🚀', 'Touchdown', 'Welcome to the surface, Commander. Build to survive.');
  },

  /* Advance the economy using real elapsed wall-clock time. */
  simStep() {
    const now = performance.now();
    let dt = (now - this.lastSim) / 1000;
    this.lastSim = now;
    dt = Math.min(dt, 1.0);            // cap catch-up after long stalls

    // economy is frozen until the ship has landed
    if (this.intro && this.intro.active) return;

    if (!State.data.paused && State.data.status === 'playing') {
      this.acc += dt * this.speed;     // fast-forward scales simulated time
      while (this.acc >= CONFIG.TICK) {
        this.tick(CONFIG.TICK);
        this.acc -= CONFIG.TICK;
      }
      this.saveAcc += dt;
      if (this.saveAcc >= 10) { this.save(); this.saveAcc = 0; }
    }

    if (State.data.status !== 'playing' && this.running) {
      this.running = false;
      this.save();
      UI.showOverlay();
    }
  },

  /* Paint + HUD. Runs every animation frame while the tab is visible. */
  drawLoop(now) {
    const dt = Math.min(0.1, (now - this.lastDraw) / 1000);
    this.lastDraw = now;

    // Centre the camera once the canvas actually has a laid-out size.
    if (!this.centered && this.canvas.clientWidth > 0) {
      Iso.center(this.canvas);
      this.centered = true;
    }

    // advance the landing cinematic
    if (this.intro && this.intro.active) {
      this.intro.t += dt;
      if (!this.intro.landed && this.intro.t >= this.intro.land) this.touchdown();
      if (this.intro.t >= this.intro.dur) this.intro.active = false;
    }

    if (!State.data.paused && State.data.status === 'playing' && !(this.intro && this.intro.active))
      Colonists.update(dt);
    Render.draw(dt);
    UI.updateHUD();
    UI.checkWarnings();

    requestAnimationFrame(t => this.drawLoop(t));
  },

  /* One simulation second. */
  tick(dt) {
    State.data.time += dt;
    Economy.step(dt);
    World.update(dt);
    Events.update(dt);
    Colonists.sync();
  },

  togglePause() {
    if (State.data.status !== 'playing') return;
    State.data.paused = !State.data.paused;
    UI.setPauseIcon(State.data.paused);
  },

  cycleSpeed() {
    const steps = [1, 2, 3];
    this.speed = steps[(steps.indexOf(this.speed) + 1) % steps.length];
    // un-pause when the player bumps the speed
    if (State.data.paused) { State.data.paused = false; UI.setPauseIcon(false); }
    UI.setSpeedLabel(this.speed);
  },

  save() {
    if (State.data) State.save();
  },

  newGame() {
    State.clear();
    State.fresh();
    Iso.center(this.canvas);
    Render.selected = null;
    Render.selectedTile = null;
    Colonists.reset();
    Colonists.sync();
    UI.hideInfo();
    UI.hideOverlay();
    UI.refreshDock();
    UI.setPauseIcon(false);
    UI.el.hint.classList.add('hidden');
    this.running = true;
    this.acc = 0;
    this.saveAcc = 0;
    this.speed = 1;
    this.lastSim = performance.now();
    this.lastDraw = this.lastSim;
    UI.setSpeedLabel(1);
    this.startIntro();
  },
};

window.addEventListener('DOMContentLoaded', () => Game.init());
