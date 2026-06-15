/* =============================================================
   config.js — all the tunable game data lives here.
   Buildings, tech tree, balance constants, grid size.
   Exposed as globals (CONFIG, BUILDINGS, TECHS).
   ============================================================= */

const CONFIG = {
  GRID: 12,            // grid is GRID x GRID tiles
  TILE_W: 64,          // isometric tile width  (pixels, unscaled)
  TILE_H: 32,          // isometric tile height (pixels, unscaled)

  TICK: 1.0,           // economy steps every 1 simulated second

  START: {
    energy: 80,
    oxygen: 80,
    science: 0,
    population: 5,
  },

  // Per-colonist upkeep, applied every second
  POP_OXYGEN_USE: 0.45,
  POP_ENERGY_USE: 0.20,

  // Population dynamics
  GROW_RATE: 0.25,     // colonists added / sec when thriving
  DIE_RATE:  0.80,     // colonists lost / sec when suffocating

  REFUND: 0.5,         // fraction of energy cost returned when demolishing

  // Storage capacities scale with what you build
  CAP_BASE: 60,
  CAP_PER_SOLAR: 30,   // each solar adds energy storage
  CAP_PER_OXY:   30,   // each oxygen plant adds oxygen storage
  CAP_PER_HOME:  10,   // homes add a little of both

  EVENT_MIN: 18,       // seconds between random events (min)
  EVENT_MAX: 38,       // seconds between random events (max)

  WIN_POP: 100,        // colonists needed to win

  // --- day / night cycle ---
  DAY_LENGTH: 120,     // real seconds for one full "Sol" (day-night cycle)
  SOLAR_NIGHT: 0.10,   // solar output multiplier at deep night

  MAX_AGENTS: 40,      // most colonist sprites drawn at once (perf cap)

  // --- session length ---
  // Designed for a ~20-minute run. Win by reclaiming the planet (green),
  // lose if the corruption overruns you or the colony suffocates.
  SESSION_SECONDS: 1200,   // ~20 minutes
  WIN_GREEN: 0.55,         // terraform 55% of the planet to win

  // --- terraforming (you start barren; grow life tile by tile) ---
  TERRAFORM_COST: 12,      // energy to seed one tile
  TERRAFORM_GROW: 0.10,    // green level gained / sec on a seeded tile
  TERRAFORM_SPREAD: 0.04,  // chance / sec a lush tile seeds a bare neighbour

  // --- the planet fights back (slow environmental corruption) ---
  INFEST_START_SECONDS: 45,// grace period before the blight stirs
  INFEST_GROW: 0.05,       // corruption gained / sec on an active tile
  INFEST_SPREAD: 0.06,     // chance / sec corruption creeps to a neighbour
  INFEST_CHOKE: 0.5,       // a corrupted building's output multiplier
  CLEANSE_COST: 8,         // energy to purge corruption from a tile
};

/* ---------------------------------------------------------------
   BUILDINGS — order here is the order shown in the build dock.
   cost      : what it costs to place
   capacity  : housing it adds (homes only)
   Production / consumption is computed in economy.js by type.
   --------------------------------------------------------------- */
const BUILDINGS = {
  solar: {
    key: 'solar',
    name: 'Solar Panel',
    icon: '☀️',
    desc: 'Generates Energy from the sun.',
    cost: { energy: 0, science: 0, },
    base: { energy: 4 },                 // +4 energy/s
    body: '#2e6bff', roof: '#7fd0ff',    // render colors
  },
  oxygen: {
    key: 'oxygen',
    name: 'Oxygen Plant',
    icon: '🫧',
    desc: 'Turns Energy into breathable Oxygen.',
    cost: { energy: 40, science: 0 },
    base: { oxygen: 3, energyUse: 2 },
    body: '#13a06b', roof: '#5ff0b0',
  },
  lab: {
    key: 'lab',
    name: 'Research Lab',
    icon: '🔬',
    desc: 'Produces Science (uses lots of Energy).',
    cost: { energy: 60, science: 0 },
    base: { science: 1, energyUse: 3 },
    body: '#7a3ff0', roof: '#c6a4ff',
  },
  home: {
    key: 'home',
    name: 'Colony Home',
    icon: '🏠',
    desc: 'Houses colonists. Small upkeep.',
    cost: { energy: 50, science: 0 },
    base: { energyUse: 1, oxygenUse: 1 },
    capacity: 8,                          // +8 max population
    body: '#d8602a', roof: '#ffb27f',
  },
  battery: {
    key: 'battery',
    name: 'Energy Storage',
    icon: '🔋',
    desc: 'Stores surplus Energy to survive the night.',
    cost: { energy: 45, science: 0 },
    base: {},                            // no production — pure storage
    storage: 150,                        // +150 max Energy
    body: '#caa12a', roof: '#ffe46b',
  },
};

/* ---------------------------------------------------------------
   TECHS — research upgrades. `effect` flags are read in economy.js
   and events.js. Win condition requires ALL of these done.
   --------------------------------------------------------------- */
const TECHS = {
  efficientSolar: {
    name: 'Photonic Cells', emoji: '☀️', cost: 50,
    desc: '+25% Energy from Solar Panels.',
  },
  denseAlgae: {
    name: 'Algae Vats', emoji: '🌿', cost: 75,
    desc: '+25% Oxygen production.',
  },
  quantumLab: {
    name: 'Quantum Computing', emoji: '🧠', cost: 110,
    desc: '+30% Science production.',
  },
  habDomes: {
    name: 'Habitation Domes', emoji: '🏙️', cost: 130,
    desc: '+50% housing in every Colony Home.',
  },
  fusionCells: {
    name: 'Fusion Reactors', emoji: '⚛️', cost: 160,
    desc: '+25% more Energy (stacks with Photonic Cells).',
  },
  terraforming: {
    name: 'Terraforming', emoji: '🌍', cost: 200,
    desc: 'Colonists need 30% less Oxygen.',
  },
  stormShield: {
    name: 'Storm Shields', emoji: '🛡️', cost: 150,
    desc: 'Dust storms are far weaker.',
  },
  nanoRepair: {
    name: 'Nano Repair Swarm', emoji: '🔧', cost: 175,
    desc: 'Buildings often survive meteor strikes.',
  },
};
