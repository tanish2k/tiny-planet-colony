/* =============================================================
   ui.js — all DOM-side interface: HUD, build dock, research panel,
   toasts, win/lose overlay, and the control buttons.
   ============================================================= */

const UI = {
  el: {},

  init() {
    // cache elements
    this.el.energyVal = q('#res-energy .res-val');
    this.el.energyRate = q('#res-energy .res-rate');
    this.el.oxygenVal = q('#res-oxygen .res-val');
    this.el.oxygenRate = q('#res-oxygen .res-rate');
    this.el.scienceVal = q('#res-science .res-val');
    this.el.scienceRate = q('#res-science .res-rate');
    this.el.popVal = q('#res-pop .res-val');
    this.el.popRate = q('#res-pop .res-rate');

    this.el.dock = q('#dock');
    this.el.hint = q('#build-hint');
    this.el.toasts = q('#toasts');
    this.el.techPanel = q('#tech-panel');
    this.el.techList = q('#tech-list');
    this.el.overlay = q('#overlay');
    this.el.btnSpeed = q('#btn-speed');

    this.buildDock();
    this.bindControls();
  },

  /* ---------------- build dock ---------------- */
  buildDock() {
    this.el.dock.innerHTML = '';
    for (const key of Object.keys(BUILDINGS)) {
      const b = BUILDINGS[key];
      const btn = document.createElement('button');
      btn.className = 'build-btn';
      btn.dataset.key = key;
      btn.innerHTML = `
        <span class="b-icon">${b.icon}</span>
        <span class="b-name">${b.name}</span>
        <span class="b-cost"></span>`;
      btn.addEventListener('click', () => this.selectBuild(key));
      this.el.dock.appendChild(btn);
    }

    // Terrain tools at the end of the dock
    const terra = document.createElement('button');
    terra.className = 'build-btn tool-terra';
    terra.dataset.act = 'terra';
    terra.innerHTML = `
      <span class="b-icon">🌱</span>
      <span class="b-name">Terraform</span>
      <span class="b-cost">${CONFIG.TERRAFORM_COST}⚡ / tile</span>`;
    terra.addEventListener('click', () => this.selectTool('terra'));
    this.el.dock.appendChild(terra);

    const cleanse = document.createElement('button');
    cleanse.className = 'build-btn tool-cleanse';
    cleanse.dataset.act = 'cleanse';
    cleanse.innerHTML = `
      <span class="b-icon">🧪</span>
      <span class="b-name">Purge</span>
      <span class="b-cost">${CONFIG.CLEANSE_COST}⚡ / tile</span>`;
    cleanse.addEventListener('click', () => this.selectTool('cleanse'));
    this.el.dock.appendChild(cleanse);

    const dem = document.createElement('button');
    dem.className = 'build-btn tool-demolish';
    dem.dataset.act = 'demolish';
    dem.innerHTML = `
      <span class="b-icon">🚧</span>
      <span class="b-name">Demolish</span>
      <span class="b-cost">refund 50%</span>`;
    dem.addEventListener('click', () => this.selectDemolish());
    this.el.dock.appendChild(dem);
  },

  selectTool(tool) {
    Render.selected = null;
    Render.demolish = false;
    this.hideInfo();
    Render.tool = (Render.tool === tool) ? null : tool;
    this.refreshDock();
    if (Render.tool) {
      this.el.hint.classList.remove('hidden');
      this.el.hint.textContent = tool === 'terra'
        ? 'Tap bare rock to seed life — it spreads on its own'
        : 'Tap corrupted ground to purge the blight';
    } else this.el.hint.classList.add('hidden');
  },

  selectBuild(key) {
    Render.demolish = false;
    Render.tool = null;
    this.hideInfo();
    Render.selected = (Render.selected === key) ? null : key;
    this.refreshDock();
    if (Render.selected) {
      this.el.hint.classList.remove('hidden');
      this.el.hint.textContent = `Tap a tile to build ${BUILDINGS[key].name} — tap again to cancel`;
    } else {
      this.el.hint.classList.add('hidden');
    }
  },

  selectDemolish() {
    Render.selected = null;
    Render.tool = null;
    this.hideInfo();
    Render.demolish = !Render.demolish;
    this.refreshDock();
    if (Render.demolish) {
      this.el.hint.classList.remove('hidden');
      this.el.hint.textContent = 'Tap a building to demolish it (50% energy refunded)';
    } else {
      this.el.hint.classList.add('hidden');
    }
  },

  cancelTools() {
    Render.selected = null;
    Render.demolish = false;
    Render.tool = null;
    this.el.hint.classList.add('hidden');
    this.refreshDock();
  },

  refreshDock() {
    for (const btn of this.el.dock.children) {
      const act = btn.dataset.act;
      if (act) {  // a tool button (terraform / purge / demolish)
        const on = act === 'demolish' ? Render.demolish : Render.tool === act;
        btn.classList.toggle('selected', on);
        continue;
      }
      const key = btn.dataset.key;
      const b = BUILDINGS[key];
      btn.classList.toggle('selected', Render.selected === key);
      const afford = Economy.canAfford(key);
      btn.classList.toggle('cant', !afford);
      // cost label
      const parts = [];
      if (b.cost.energy)  parts.push(costSpan('⚡', b.cost.energy, State.data.energy));
      if (b.cost.science) parts.push(costSpan('🔬', b.cost.science, State.data.science));
      if (parts.length === 0) parts.push('<span class="ok">Free</span>');
      q('.b-cost', btn).innerHTML = parts.join(' ');
    }
  },

  /* ---------------- tile interaction ---------------- */
  onTileTap(col, row) {
    // tapping during the landing cinematic skips it
    if (Game.intro && Game.intro.active) { Game.skipIntro(); return; }

    const grid = State.data.grid;
    const key = Render.selected;

    if (Render.tool === 'terra') { World.seedTerraform(col, row); this.refreshDock(); return; }
    if (Render.tool === 'cleanse') { World.cleanse(col, row); this.refreshDock(); return; }

    if (Render.demolish) {
      const k = grid[row][col];
      if (!k) return;
      const refund = Math.round((BUILDINGS[k].cost.energy || 0) * CONFIG.REFUND);
      grid[row][col] = null;
      State.data.energy += refund;
      Render.flash(row, col, 'rgba(255,107,107,0.6)');
      this.toast('info', '🚧', 'Demolished', `${BUILDINGS[k].name} removed. +${refund}⚡ refunded.`);
      this.refreshDock();
      return;
    }

    if (key) {
      // build mode
      if (grid[row][col]) {
        this.toast('bad', '🚧', 'Occupied', 'That tile already has a building.');
        return;
      }
      if (!Economy.canAfford(key)) {
        this.toast('bad', '💸', 'Too expensive', `Not enough resources for a ${BUILDINGS[key].name}.`);
        return;
      }
      Economy.pay(key);
      State.place(col, row, key);
      Render.flash(row, col, 'rgba(95,240,138,0.6)');
      this.refreshDock();
    } else {
      // inspect mode — open the info panel for a tapped building
      const k = grid[row][col];
      if (k) { Render.selectedTile = { col, row }; this.showInfo(); }
      else  { Render.selectedTile = null; this.hideInfo(); }
    }
  },

  /* ---------------- building info panel ---------------- */
  showInfo() {
    const t = Render.selectedTile;
    if (!t) return;
    const k = State.data.grid[t.row][t.col];
    if (!k) { this.hideInfo(); return; }
    const b = BUILDINGS[k];
    q('#info-icon').textContent = b.icon;
    q('#info-name').textContent = b.name;
    q('#info-desc').textContent = b.desc;
    q('#info-panel').classList.remove('hidden');
    this.refreshInfo();
  },

  refreshInfo() {
    const panel = q('#info-panel');
    if (panel.classList.contains('hidden')) return;
    const t = Render.selectedTile;
    if (!t || !State.data.grid[t.row][t.col]) { this.hideInfo(); return; }
    const k = State.data.grid[t.row][t.col];
    const m = Economy.mults();
    const rows = [];
    if (k === 'solar') {
      const out = (BUILDINGS.solar.base.energy * m.energy * Economy.sun().factor);
      rows.push(stat('⚡ Energy', `+${out.toFixed(1)}/s`, 'up'));
      rows.push(stat('☀️ Sunlight', `${Math.round(Economy.sun().light * 100)}%`, ''));
    } else if (k === 'oxygen') {
      rows.push(stat('🫧 Oxygen', `+${(BUILDINGS.oxygen.base.oxygen * m.oxygen).toFixed(1)}/s`, 'up'));
      rows.push(stat('⚡ Energy', `-${BUILDINGS.oxygen.base.energyUse}/s`, 'down'));
    } else if (k === 'lab') {
      rows.push(stat('🔬 Science', `+${(BUILDINGS.lab.base.science * m.science).toFixed(1)}/s`, 'up'));
      rows.push(stat('⚡ Energy', `-${BUILDINGS.lab.base.energyUse}/s`, 'down'));
    } else if (k === 'home') {
      const per = BUILDINGS.home.capacity * (State.data.techs.habDomes ? 1.5 : 1);
      rows.push(stat('🧑‍🚀 Housing', `+${per}`, 'up'));
      rows.push(stat('⚡ Energy', `-${BUILDINGS.home.base.energyUse}/s`, 'down'));
      rows.push(stat('🫧 Oxygen', `-${BUILDINGS.home.base.oxygenUse}/s`, 'down'));
    } else if (k === 'battery') {
      rows.push(stat('⚡ Storage', `+${BUILDINGS.battery.storage}`, 'up'));
      rows.push(stat('🌙 Use', 'Banks power for night', ''));
    }
    q('#info-stats').innerHTML = rows.join('');
  },

  hideInfo() {
    Render.selectedTile = null;
    q('#info-panel').classList.add('hidden');
  },

  /* ---------------- HUD numbers ---------------- */
  updateHUD() {
    const d = State.data;
    const cap = Economy.capacities();
    set(this.el.energyVal, fmtNum(d.energy));
    set(this.el.oxygenVal, fmtNum(d.oxygen));
    set(this.el.scienceVal, fmtNum(d.science));
    set(this.el.popVal, `${Math.floor(d.population)}`);

    this.rate(this.el.energyRate, d.rates.energy, `${Math.floor(d.energy)}/${cap.energy}`);
    this.rate(this.el.oxygenRate, d.rates.oxygen, `${Math.floor(d.oxygen)}/${cap.oxygen}`);
    set(this.el.scienceRate, `+${d.rates.science.toFixed(1)}/s`);
    this.el.scienceRate.className = 'res-rate up';
    set(this.el.popRate, `/ ${State.capacity()}`);

    // objective: planet reclaimed vs corruption
    const green = State.greenFraction();
    const threat = State.corruptionFraction();
    set(q('#obj-green'), `${Math.round(green * 100)}%`);
    set(q('#obj-threat'), `${Math.round(threat * 100)}%`);
    const greenEl = q('#objective .green'), threatEl = q('#objective .threat');
    if (greenEl) greenEl.classList.toggle('hit', green >= CONFIG.WIN_GREEN);
    if (threatEl) threatEl.classList.toggle('danger', threat >= 0.5);

    // research progress badge
    const done = Object.keys(TECHS).filter(k => d.techs[k]).length;
    const total = Object.keys(TECHS).length;
    const badge = q('#tech-badge');
    if (badge) {
      badge.textContent = `${done}/${total}`;
      badge.classList.toggle('done', done === total);
    }

    // day/night clock
    this.updateClock(d);

    // keep an open info panel live
    this.refreshInfo();
  },

  updateClock(d) {
    const sol = Math.floor(d.time / CONFIG.DAY_LENGTH) + 1;
    const t = d.daytime;
    let icon, phase;
    if (t < 0.22 || t >= 0.95) { icon = '🌙'; phase = 'Night'; }
    else if (t < 0.32) { icon = '🌅'; phase = 'Dawn'; }
    else if (t < 0.68) { icon = '☀️'; phase = 'Day'; }
    else if (t < 0.80) { icon = '🌇'; phase = 'Dusk'; }
    else { icon = '🌆'; phase = 'Evening'; }
    set(q('#clock-icon'), icon);
    set(q('#clock-text'), `Sol ${sol} · ${phase}`);
  },

  /* Pulse a resource pill + warn (throttled) when collapse is near. */
  checkWarnings() {
    const d = State.data;
    if (d.status !== 'playing') return;
    const lowOxy = d.oxygen < 15 && d.rates.oxygen < 0;
    const lowEng = d.energy < 15 && d.rates.energy < 0;

    q('#res-oxygen').classList.toggle('danger', lowOxy);
    q('#res-energy').classList.toggle('danger', lowEng);

    // throttle the spoken warning to once every ~8s
    if ((lowOxy || lowEng) && (d.time - (this._lastWarn || -99)) > 8) {
      this._lastWarn = d.time;
      if (lowOxy) this.toast('bad', '⚠️', 'Oxygen Critical!', 'Build an Oxygen Plant — colonists will start dying!');
      else        this.toast('bad', '⚠️', 'Power Critical!', 'Build a Solar Panel — plants are shutting down!');
    }
  },

  setSpeedLabel(speed) {
    const btn = q('#btn-ff');
    if (!btn) return;
    btn.textContent = `${speed}×`;
    btn.classList.toggle('fast', speed > 1);
  },

  rate(el, v, capText) {
    const sign = v >= 0 ? '+' : '';
    el.textContent = `${sign}${v.toFixed(1)}/s`;
    el.className = 'res-rate ' + (v >= 0.05 ? 'up' : v <= -0.05 ? 'down' : '');
    el.title = capText;
  },

  /* ---------------- research panel ---------------- */
  toggleTech() {
    const hidden = this.el.techPanel.classList.toggle('hidden');
    if (!hidden) this.buildTechList();
  },

  buildTechList() {
    this.el.techList.innerHTML = '';
    for (const key of Object.keys(TECHS)) {
      const t = TECHS[key];
      const done = !!State.data.techs[key];
      const afford = State.data.science >= t.cost;
      const row = document.createElement('div');
      row.className = 'tech' + (done ? ' done' : '');
      row.innerHTML = `
        <div class="t-emoji">${t.emoji}</div>
        <div class="t-body"><b>${t.name}</b><p>${t.desc}</p></div>
        <button class="t-buy" ${done || !afford ? 'disabled' : ''}>
          ${done ? '✓ Done' : `🔬 ${t.cost}`}
        </button>`;
      if (!done) {
        q('.t-buy', row).addEventListener('click', () => this.research(key));
      }
      this.el.techList.appendChild(row);
    }
  },

  research(key) {
    const t = TECHS[key];
    if (State.data.techs[key] || State.data.science < t.cost) return;
    State.data.science -= t.cost;
    State.data.techs[key] = true;
    this.toast('info', t.emoji, 'Researched!', t.name + ' unlocked.');
    this.buildTechList();
    this.refreshDock();
  },

  /* ---------------- toasts ---------------- */
  toast(kind, icon, title, text) {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.innerHTML = `<span class="t-icon">${icon}</span>
      <span class="t-text"><b>${title}</b><span>${text}</span></span>`;
    this.el.toasts.appendChild(t);
    setTimeout(() => t.remove(), 4600);
    // cap the stack
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  },

  /* ---------------- overlay (win/lose) ---------------- */
  showOverlay() {
    const d = State.data;
    const won = d.status === 'won';
    const green = Math.round(State.greenFraction() * 100);
    q('#overlay-title').textContent = won ? '🌍 Planet Reclaimed' : '💀 Colony Lost';
    q('#overlay-msg').textContent = won
      ? `You turned ${green}% of a dead world green and held back the blight — in ${fmtTime(d.time)}. The planet is yours.`
      : `${d.lossReason || 'The colony fell.'} You held on for ${fmtTime(d.time)}.`;
    this.el.overlay.classList.remove('hidden');
  },

  hideOverlay() { this.el.overlay.classList.add('hidden'); },

  /* ---------------- controls ---------------- */
  bindControls() {
    this.el.btnSpeed.addEventListener('click', () => Game.togglePause());
    q('#btn-ff').addEventListener('click', () => Game.cycleSpeed());
    q('#btn-tech').addEventListener('click', () => this.toggleTech());
    q('#tech-close').addEventListener('click', () => this.toggleTech());
    q('#btn-save').addEventListener('click', () => {
      Game.save();
      this.toast('good', '💾', 'Saved', 'Colony progress stored locally.');
    });
    q('#btn-reset').addEventListener('click', () => {
      if (confirm('Abandon this colony and start a new one?')) Game.newGame();
    });
    q('#overlay-btn').addEventListener('click', () => Game.newGame());

    // info panel controls
    q('#info-close').addEventListener('click', () => this.hideInfo());
    q('#info-demolish').addEventListener('click', () => {
      const t = Render.selectedTile;
      if (!t) return;
      const k = State.data.grid[t.row][t.col];
      if (!k) { this.hideInfo(); return; }
      const refund = Math.round((BUILDINGS[k].cost.energy || 0) * CONFIG.REFUND);
      State.data.grid[t.row][t.col] = null;
      State.data.energy += refund;
      Render.flash(t.row, t.col, 'rgba(255,107,107,0.6)');
      this.toast('info', '🚧', 'Demolished', `${BUILDINGS[k].name} removed. +${refund}⚡ refunded.`);
      this.hideInfo();
      this.refreshDock();
    });

    // Keyboard shortcuts (desktop)
    window.addEventListener('keydown', (e) => {
      if (e.key === ' ') { e.preventDefault(); Game.togglePause(); }
      else if (e.key === 'Escape') {
        this.cancelTools();
        this.hideInfo();
        if (!this.el.techPanel.classList.contains('hidden')) this.toggleTech();
      }
      else if (e.key >= '1' && e.key <= '4') {
        this.selectBuild(Object.keys(BUILDINGS)[+e.key - 1]);
      }
    });
  },

  setPauseIcon(paused) {
    this.el.btnSpeed.textContent = paused ? '▶' : '⏸';
  },
};

/* ---------------- small DOM helpers ---------------- */
function q(sel, root = document) { return root.querySelector(sel); }
function set(el, txt) { if (el.textContent !== txt) el.textContent = txt; }
function costSpan(icon, need, have) {
  const cls = have >= need ? 'ok' : 'no';
  return `<span class="${cls}">${icon}${need}</span>`;
}
function stat(label, value, cls) {
  return `<div class="info-row"><span>${label}</span><b class="${cls}">${value}</b></div>`;
}
function fmtNum(n) {
  n = Math.floor(n);
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 10000)   return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return `${n}`;
}
function fmtTime(s) {
  s = Math.floor(s);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}
