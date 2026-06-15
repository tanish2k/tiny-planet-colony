/* =============================================================
   world.js — the living/dying planet.

   Two opposing forces play out across the terrain:
     · Terraforming  — you spend energy to seed life; lush tiles
       slowly green up and creep into bare rock around them.
     · Corruption    — the planet fights back. Nests bleed a slow
       blight outward that kills grass and chokes buildings.

   This is the heart of the new "slow environmental threat" loop.
   ============================================================= */

const World = {
  /* Seed a bare tile with life (player action). */
  seedTerraform(col, row) {
    const d = State.data;
    if (!Iso.inBounds(col, row)) return false;
    if (d.infest[row][col] > 0.3) {
      UI.toast('bad', '☣️', 'Corrupted ground', 'Purge the blight here before seeding life.');
      return false;
    }
    if (d.terra[row][col] >= 0.95) return false;
    if (d.energy < CONFIG.TERRAFORM_COST) {
      UI.toast('bad', '💸', 'Not enough power', `Terraforming needs ${CONFIG.TERRAFORM_COST}⚡.`);
      return false;
    }
    d.energy -= CONFIG.TERRAFORM_COST;
    d.terra[row][col] = Math.max(d.terra[row][col], 0.35);
    Render.flash(row, col, 'rgba(95,240,138,0.5)');
    return true;
  },

  /* Purge corruption from a tile (player action). */
  cleanse(col, row) {
    const d = State.data;
    if (!Iso.inBounds(col, row)) return false;
    if (d.infest[row][col] < 0.05) return false;
    // can't fully scrub a tile that still has a nest on it
    const onNest = d.nests.some(n => n.col === col && n.row === row);
    if (d.energy < CONFIG.CLEANSE_COST) {
      UI.toast('bad', '💸', 'Not enough power', `Purging needs ${CONFIG.CLEANSE_COST}⚡.`);
      return false;
    }
    d.energy -= CONFIG.CLEANSE_COST;
    d.infest[row][col] = Math.max(0, d.infest[row][col] - 0.5);
    Render.flash(row, col, 'rgba(120,200,255,0.5)');
    if (onNest && d.infest[row][col] < 0.4) {
      // beating it right down can destroy a nest
      d.nests = d.nests.filter(n => !(n.col === col && n.row === row));
      UI.toast('good', '🧨', 'Nest destroyed!', 'One source of the blight is gone.');
    }
    return true;
  },

  /* Per-tick simulation of both forces. */
  update(dt) {
    const d = State.data;
    if (d.status !== 'playing') return;
    const g = d.grid.length;
    const terra = d.terra, infest = d.infest;

    /* ---- terraforming: grow + spread + die under corruption ---- */
    for (let r = 0; r < g; r++) {
      for (let c = 0; c < g; c++) {
        if (infest[r][c] > 0.2) {
          // grass cannot survive corruption
          terra[r][c] = Math.max(0, terra[r][c] - dt * 0.3 * infest[r][c]);
        } else if (terra[r][c] > 0.05 && terra[r][c] < 1) {
          terra[r][c] = Math.min(1, terra[r][c] + dt * CONFIG.TERRAFORM_GROW);
        }
        // lush tiles slowly seed bare neighbours
        if (terra[r][c] > 0.85 && Math.random() < dt * CONFIG.TERRAFORM_SPREAD) {
          const n = this.neighbor(c, r, g);
          if (n && terra[n.r][n.c] < 0.05 && infest[n.r][n.c] < 0.2)
            terra[n.r][n.c] = 0.3;
        }
      }
    }

    /* ---- corruption: nests bleed, blight creeps outward ---- */
    if (d.time > CONFIG.INFEST_START_SECONDS) {
      for (const nest of d.nests) {
        infest[nest.row][nest.col] = Math.min(1, infest[nest.row][nest.col] + dt * CONFIG.INFEST_GROW * 2);
      }
      for (let r = 0; r < g; r++) {
        for (let c = 0; c < g; c++) {
          if (infest[r][c] > 0.25) {
            infest[r][c] = Math.min(1, infest[r][c] + dt * CONFIG.INFEST_GROW * 0.5);
            if (Math.random() < dt * CONFIG.INFEST_SPREAD * infest[r][c]) {
              const n = this.neighbor(c, r, g);
              if (n) infest[n.r][n.c] = Math.min(1, infest[n.r][n.c] + 0.25);
            }
          }
        }
      }
    }
  },

  neighbor(c, r, g) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const d = dirs[(Math.random() * 4) | 0];
    const nc = c + d[0], nr = r + d[1];
    if (nc < 0 || nr < 0 || nc >= g || nr >= g) return null;
    return { c: nc, r: nr };
  },

  /* Is the tile under a building corrupted enough to choke it? */
  isChoked(col, row) {
    return State.data.infest[row][col] > 0.5;
  },
};
