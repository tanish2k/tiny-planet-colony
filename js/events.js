/* =============================================================
   events.js — random world events that keep the colony on edge.
   Events.update(dt) counts down a timer and fires an event.
   Each event returns a toast descriptor for the UI.
   ============================================================= */

const Events = {

  update(dt) {
    const d = State.data;
    if (d.status !== 'playing') return;

    // tick down an active dust storm
    if (d.storm) {
      d.storm.timeLeft -= dt;
      if (d.storm.timeLeft <= 0) {
        d.storm = null;
        UI.toast('info', '🌤️', 'Storm Cleared', 'Solar panels back to full power.');
      }
    }

    d.nextEvent -= dt;
    if (d.nextEvent <= 0) {
      d.nextEvent = rand(CONFIG.EVENT_MIN, CONFIG.EVENT_MAX);
      this.fire();
    }
  },

  /* Pick and apply a random event. */
  fire() {
    const roll = Math.random();
    if (roll < 0.30)      this.dustStorm();
    else if (roll < 0.55) this.meteor();
    else if (roll < 0.78) this.supplyDrop();
    else                  this.breakthrough();
  },

  /* ---- Dust Storm: weakens solar output for a while ---- */
  dustStorm() {
    const d = State.data;
    const shielded = d.techs.stormShield;
    d.storm = {
      timeLeft: rand(10, 16),
      factor: shielded ? 0.65 : 0.30,   // multiply solar output
    };
    UI.toast('bad', '🌪️', 'Dust Storm!',
      shielded ? 'Shields hold — solar only dips a little.'
               : 'Solar power is badly reduced.');
  },

  /* ---- Meteor Strike: destroys a random building ---- */
  meteor() {
    const d = State.data;
    const tiles = [];
    for (let r = 0; r < d.grid.length; r++)
      for (let c = 0; c < d.grid[r].length; c++)
        if (d.grid[r][c]) tiles.push([r, c]);

    if (tiles.length === 0) { this.supplyDrop(); return; }

    const [r, c] = tiles[(Math.random() * tiles.length) | 0];

    // Nano Repair Swarm gives a 60% chance to save the building.
    if (d.techs.nanoRepair && Math.random() < 0.6) {
      UI.toast('info', '☄️', 'Meteor Strike!',
        'Nano-swarm repaired the damage in time!');
      Render.flash(r, c, '#9fd0ff');
      return;
    }

    const key = d.grid[r][c];
    d.grid[r][c] = null;
    UI.toast('bad', '☄️', 'Meteor Strike!',
      `A ${BUILDINGS[key].name} was destroyed!`);
    Render.flash(r, c, '#ff7a59');
  },

  /* ---- Supply Drop: free resources, sometimes a colonist ---- */
  supplyDrop() {
    const d = State.data;
    const e = Math.round(rand(30, 70));
    const o = Math.round(rand(30, 70));
    d.energy += e;
    d.oxygen += o;
    let extra = '';
    if (Math.random() < 0.5) {
      const newcomers = 1 + ((Math.random() * 2) | 0);
      d.population += newcomers;
      extra = ` and ${newcomers} new colonist${newcomers > 1 ? 's' : ''}`;
    }
    UI.toast('good', '📦', 'Supply Drop!',
      `+${e}⚡  +${o}🫧${extra}.`);
  },

  /* ---- Research Breakthrough: bonus science ---- */
  breakthrough() {
    const d = State.data;
    const bonus = Math.round(30 + d.population * 0.8);
    d.science += bonus;
    UI.toast('good', '💡', 'Breakthrough!',
      `Eureka! +${bonus}🔬 Science.`);
  },
};
