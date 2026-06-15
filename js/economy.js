/* =============================================================
   economy.js — the resource simulation.
   Economy.step(dt) advances the colony by `dt` seconds:
   produces/consumes resources, grows or starves the population,
   and checks win/lose conditions.
   ============================================================= */

const Economy = {

  /* Production / consumption multipliers from researched tech. */
  mults() {
    const t = State.data.techs;
    return {
      energy:  1 + (t.efficientSolar ? 0.25 : 0) + (t.fusionCells ? 0.25 : 0),
      oxygen:  1 + (t.denseAlgae ? 0.25 : 0),
      science: 1 + (t.quantumLab ? 0.30 : 0),
      oxyUse:  t.terraforming ? 0.70 : 1,
    };
  },

  /* Sun state for the current time of day.
     light: 0 (deep night) .. 1 (noon)  — used for sky + solar output. */
  sun(daytime = State.data.daytime) {
    // elevation: -1 at midnight, +1 at noon
    const elev = Math.sin(daytime * Math.PI * 2 - Math.PI / 2);
    const light = clamp(elev * 0.5 + 0.5, 0, 1);
    const factor = CONFIG.SOLAR_NIGHT + (1 - CONFIG.SOLAR_NIGHT) * light;
    return { elev, light, factor };
  },

  /* Compute the instantaneous per-second rates (before stockpile clamping).
     Returns everything the step + HUD need. */
  rates() {
    const d = State.data;
    // Effective counts treat a corrupted building as only partly working.
    const c = this.effectiveCounts();
    const m = this.mults();
    const pop = Math.max(0, d.population);

    // Solar output depends on time of day AND dust storms.
    const stormFactor = d.storm ? d.storm.factor : 1;
    const dayFactor = this.sun().factor;

    const energyProd = c.solar * BUILDINGS.solar.base.energy * m.energy * stormFactor * dayFactor;
    const energyUse =
      c.oxygen * BUILDINGS.oxygen.base.energyUse +
      c.lab    * BUILDINGS.lab.base.energyUse +
      c.home   * BUILDINGS.home.base.energyUse +
      pop * CONFIG.POP_ENERGY_USE;

    const oxygenProdRaw = c.oxygen * BUILDINGS.oxygen.base.oxygen * m.oxygen;
    const oxygenUse =
      c.home * BUILDINGS.home.base.oxygenUse +
      pop * CONFIG.POP_OXYGEN_USE * m.oxyUse;

    const scienceProdRaw = c.lab * BUILDINGS.lab.base.science * m.science;

    return { c, energyProd, energyUse, oxygenProdRaw, oxygenUse, scienceProdRaw };
  },

  /* Building counts where corrupted buildings contribute only a fraction. */
  effectiveCounts() {
    const c = { solar: 0, oxygen: 0, lab: 0, home: 0, battery: 0 };
    const grid = State.data.grid;
    for (let r = 0; r < grid.length; r++)
      for (let col = 0; col < grid[r].length; col++) {
        const k = grid[r][col];
        if (!k) continue;
        c[k] += World.isChoked(col, r) ? CONFIG.INFEST_CHOKE : 1;
      }
    return c;
  },

  capacities() {
    const c = State.counts();
    return {
      energy: CONFIG.CAP_BASE + c.solar  * CONFIG.CAP_PER_SOLAR + c.home * CONFIG.CAP_PER_HOME
              + c.battery * BUILDINGS.battery.storage,
      oxygen: CONFIG.CAP_BASE + c.oxygen * CONFIG.CAP_PER_OXY   + c.home * CONFIG.CAP_PER_HOME,
    };
  },

  step(dt) {
    const d = State.data;
    if (d.status !== 'playing') return;

    // advance the day/night clock
    d.daytime = (d.daytime + dt / CONFIG.DAY_LENGTH) % 1;

    const R = this.rates();
    const cap = this.capacities();

    /* --- ENERGY ---
       If demand outstrips supply + stockpile, we get a "brownout":
       oxygen and science plants only run at the energy they can get. */
    const energyAvail = d.energy + R.energyProd * dt;
    const energyNeed = R.energyUse * dt;
    let brownout = 1;
    if (energyNeed > 0) brownout = clamp(energyAvail / energyNeed, 0, 1);

    d.energy = clamp(energyAvail - energyNeed, 0, cap.energy);

    /* --- OXYGEN --- plants throttled by available energy (brownout). */
    const oxygenProd = R.oxygenProdRaw * brownout;
    const oxygenNet = oxygenProd - R.oxygenUse;
    let newOxygen = d.oxygen + oxygenNet * dt;

    let suffocating = false;
    if (newOxygen < 0) {
      suffocating = true;
      newOxygen = 0;
    }
    d.oxygen = clamp(newOxygen, 0, cap.oxygen);

    /* --- SCIENCE --- also throttled by brownout. */
    const scienceProd = R.scienceProdRaw * brownout;
    d.science += scienceProd * dt;

    /* --- POPULATION --- */
    const capacity = State.capacity();
    if (suffocating) {
      // not enough oxygen -> colonists are lost
      const deficit = R.oxygenUse - oxygenProd;            // how short we are
      const severity = clamp(deficit / Math.max(1, R.oxygenUse), 0.2, 1);
      d.population -= CONFIG.DIE_RATE * severity * dt;
    } else if (oxygenNet > 0.1 && brownout > 0.95 && d.population < capacity) {
      // thriving: surplus oxygen, stable power, room to grow
      const room = clamp(capacity - d.population, 0, 1);   // ease off near cap
      d.population += CONFIG.GROW_RATE * room * dt;
    }
    d.population = Math.max(0, d.population);

    /* stash rates for the HUD */
    d.rates = {
      energy:  R.energyProd - R.energyUse,
      oxygen:  oxygenProd - R.oxygenUse,
      science: scienceProd,
    };

    /* --- WIN / LOSE ---
       Win  : reclaim enough of the planet (terraform it green).
       Lose : the colony suffocates, or the corruption overruns everything. */
    if (d.population <= 0) {
      d.population = 0;
      d.status = 'lost';
      d.lossReason = 'The last colonist is gone. The colony fell silent.';
    } else if (State.corruptionFraction() >= 0.85) {
      d.status = 'lost';
      d.lossReason = 'The blight consumed the planet. Nothing survives here now.';
    } else if (State.greenFraction() >= CONFIG.WIN_GREEN) {
      d.status = 'won';
    }
  },

  /* Can the player currently afford a building? */
  canAfford(key) {
    const cost = BUILDINGS[key].cost;
    return State.data.energy >= (cost.energy || 0) &&
           State.data.science >= (cost.science || 0);
  },

  pay(key) {
    const cost = BUILDINGS[key].cost;
    State.data.energy  -= (cost.energy  || 0);
    State.data.science -= (cost.science || 0);
  },
};

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
