/* =============================================================
   render.js — draws the world.

   New look: a grim, barren chunk of alien planet floating in space.
   The ground is CURVED (dome) and sits on a thick rock slab, so it
   reads as standing on a real world rather than a flat sheet. The
   surface starts as bare rock — grass only appears where you have
   terraformed, and a sickly blight spreads from corruption nests.
   The camera is stable: no bobbing, no drift.
   ============================================================= */

const Render = {
  canvas: null, ctx: null, dpr: 1,
  hover: null, selected: null, demolish: false, tool: null,  // tool: 'terra' | 'cleanse'
  selectedTile: null,
  flashes: [], anim: 0,
  dust: [], fx: [],

  CURVE: 60,         // how strongly the ground bows (planet curvature)
  SLAB: 46,          // thickness of the rock slab beneath the colony

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.seedDust();
  },

  flash(row, col, color) { this.flashes.push({ col, row, color, t: 1 }); },

  hw() { return (CONFIG.TILE_W / 2) * Camera.zoom; },
  hh() { return (CONFIG.TILE_H / 2) * Camera.zoom; },

  /* dome lift (px) at a continuous grid coord — bows the centre upward */
  lift(fx, fy) {
    const cc = CONFIG.GRID / 2;
    const dx = fx - cc, dy = fy - cc;
    const maxd = 2 * cc * cc;
    const t = Math.min(1, (dx * dx + dy * dy) / maxd);
    return this.CURVE * (1 - t) * Camera.zoom;
  },

  /* continuous grid coord -> screen point, on the curved surface */
  screenAt(fx, fy) {
    return {
      x: (fx - fy) * this.hw() + Camera.x,
      y: (fx + fy) * this.hh() + Camera.y - this.lift(fx, fy),
    };
  },

  /* four curved corners + centre of a tile */
  corners(col, row) {
    const top = this.screenAt(col, row);
    const right = this.screenAt(col + 1, row);
    const bottom = this.screenAt(col + 1, row + 1);
    const left = this.screenAt(col, row + 1);
    const c = this.screenAt(col + 0.5, row + 0.5);
    return { top, right, bottom, left, cx: c.x, cy: c.y, hw: this.hw(), hh: this.hh() };
  },

  /* =============================================================
     MAIN DRAW
     ============================================================= */
  draw(dt) {
    const ctx = this.ctx;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    this.anim += dt;
    const sun = Economy.sun();

    this.drawSky(W, H, sun);
    this.drawStars(W, H);
    this.drawDistantWorlds(W, H, sun);
    this.updateAndDrawDust(dt, W, H);

    const g = CONFIG.GRID, grid = State.data.grid;

    this.drawSlab();                              // the rock chunk beneath

    for (let r = 0; r < g; r++)
      for (let c = 0; c < g; c++) this.drawTile(c, r, sun);

    // during the landing cinematic, hide the colony until the ship sets down
    const intro = (typeof Game !== 'undefined') ? Game.intro : null;
    const introActive = intro && intro.active;
    const baseHidden = introActive && !intro.landed;

    if (!baseHidden && this.hover && Iso.inBounds(this.hover.col, this.hover.row))
      this.drawHighlight(this.hover.col, this.hover.row);
    if (!baseHidden && this.selectedTile && grid[this.selectedTile.row][this.selectedTile.col])
      this.drawSelectMarker(this.selectedTile.col, this.selectedTile.row);

    // depth-sorted entities: nests + buildings + colonists
    if (!baseHidden) {
      const draws = [];
      for (const n of State.data.nests) draws.push({ depth: n.col + n.row + 0.9, kind: 'n', n });
      for (let r = 0; r < g; r++)
        for (let c = 0; c < g; c++)
          if (grid[r][c]) draws.push({ depth: c + r + 1, kind: 'b', c, r, key: grid[r][c] });
      for (const a of Colonists.agents) draws.push({ depth: a.x + a.y, kind: 'a', a });
      draws.sort((p, q) => p.depth - q.depth);
      for (const d of draws) {
        if (d.kind === 'b') this.drawBuilding(d.c, d.r, d.key, 1, sun);
        else if (d.kind === 'a') this.drawColonist(d.a);
        else this.drawNest(d.n);
      }
    }

    // the landing rocket plays over everything during the cinematic
    if (introActive) this.drawLander(intro);

    this.spawnEffects(dt);
    this.updateAndDrawFx(dt);

    this.flashes = this.flashes.filter(f => f.t > 0);
    for (const f of this.flashes) { this.drawFlash(f); f.t -= dt * 1.6; }

    if (State.data.storm) {
      ctx.fillStyle = `rgba(150,110,70,${0.18 + 0.05 * Math.sin(this.anim * 4)})`;
      ctx.fillRect(0, 0, W, H);
    }
    const night = 1 - sun.light;
    if (night > 0.02) { ctx.fillStyle = `rgba(8,6,20,${night * 0.4})`; ctx.fillRect(0, 0, W, H); }
    this.drawVignette(W, H);
  },

  /* ---------------- grim sky ---------------- */
  drawSky(W, H, sun) {
    const ctx = this.ctx;
    const top = mix([6, 7, 16], [20, 26, 44], sun.light);       // near-black -> cold slate
    const bot = mix([24, 14, 18], [70, 44, 38], sun.light);     // dim rust haze at horizon
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, rgb(top));
    grad.addColorStop(1, rgb(bot));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  },

  drawStars(W, H) {
    const ctx = this.ctx;
    ctx.save();
    for (let i = 0; i < 110; i++) {
      const x = ((i * 73 + 13) % 100) / 100 * W;
      const y = ((i * 911 + 7) % 100) / 100 * H * 0.65;
      const tw = 0.5 + 0.5 * Math.sin(this.anim * 1.5 + i);
      ctx.globalAlpha = 0.25 + 0.45 * tw;
      ctx.fillStyle = i % 9 === 0 ? '#9fb6d6' : '#cdd6e6';
      ctx.fillRect(x, y, i % 13 === 0 ? 2 : 1, 1);
    }
    ctx.restore();
  },

  /* a dim sun and a brooding gas giant on the horizon */
  drawDistantWorlds(W, H, sun) {
    const ctx = this.ctx;
    // dim red sun
    const t = State.data.daytime;
    const ang = (t - 0.25) * Math.PI * 2;
    const sx = W / 2 + Math.sin(ang) * W * 0.45;
    const sy = H * 0.4 - Math.cos(ang) * H * 0.34;
    if (sun.elev > -0.15) {
      ctx.save();
      const glow = ctx.createRadialGradient(sx, sy, 2, sx, sy, 60);
      glow.addColorStop(0, 'rgba(255,150,90,0.5)');
      glow.addColorStop(1, 'rgba(255,150,90,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(sx, sy, 60, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8884a';
      ctx.beginPath(); ctx.arc(sx, sy, 16, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // a large, dim planet looming in the upper corner
    ctx.save();
    ctx.globalAlpha = 0.5;
    const px = W * 0.84, py = H * 0.12, pr = Math.min(W, H) * 0.16;
    ctx.fillStyle = '#3a2e3a';
    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#241c26';
    ctx.beginPath(); ctx.ellipse(px + pr * 0.25, py - pr * 0.1, pr * 0.7, pr * 0.22, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  /* ---------------- the rock slab (planet chunk) ---------------- */
  drawSlab() {
    const ctx = this.ctx;
    const g = CONFIG.GRID;
    const slab = this.SLAB * Camera.zoom;
    const left = this.screenAt(0, g);
    const bottom = this.screenAt(g, g);
    const right = this.screenAt(g, 0);

    // front cliff faces (the visible sides of the chunk)
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(right.x, right.y + slab);
    ctx.lineTo(bottom.x, bottom.y + slab * 1.3);
    ctx.lineTo(left.x, left.y + slab);
    ctx.closePath();
    ctx.fillStyle = '#352b28';
    ctx.fill();

    // strata shading on the two faces
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.moveTo(bottom.x, bottom.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(right.x, right.y + slab);
    ctx.lineTo(bottom.x, bottom.y + slab * 1.3);
    ctx.closePath();
    ctx.fill();

    // a few rocky chips hanging off the bottom edge
    ctx.fillStyle = '#2a221f';
    for (let i = 0; i < 7; i++) {
      const tt = i / 6;
      const x = left.x + (bottom.x - left.x) * tt;
      const y = left.y + (bottom.y - left.y) * tt + slab + 4;
      ctx.beginPath(); ctx.ellipse(x, y, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
  },

  /* ---------------- ground tiles ---------------- */
  diamond(p) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(p.top.x, p.top.y);
    ctx.lineTo(p.right.x, p.right.y);
    ctx.lineTo(p.bottom.x, p.bottom.y);
    ctx.lineTo(p.left.x, p.left.y);
    ctx.closePath();
  },

  drawTile(col, row, sun) {
    const ctx = this.ctx;
    const p = this.corners(col, row);
    const terra = State.data.terra[row][col];
    const infest = State.data.infest[row][col];

    // barren rock base, faintly varied like real regolith
    const h = ((col * 73856093) ^ (row * 19349663)) >>> 0;
    const v = (h % 16) - 8;
    let color = [78 + v, 68 + v, 60 + v];          // dark dusty rock
    color = mix(color, [54, 132, 74], Math.min(1, terra));   // muted alien green
    color = mix(color, [120, 58, 128], Math.min(1, infest)); // sickly corruption

    const lightTint = 0.42 + 0.58 * sun.light;     // grim even at noon
    this.diamond(p);
    ctx.fillStyle = rgb(color.map(x => x * lightTint));
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (!State.data.grid[row][col]) this.drawTileDetail(col, row, p, terra, infest, h);
  },

  drawTileDetail(col, row, p, terra, infest, h) {
    const ctx = this.ctx, z = Camera.zoom, cx = p.cx, cy = p.cy;
    if (infest > 0.4) {
      // corruption tendrils / spore pods
      const pulse = 0.6 + 0.4 * Math.sin(this.anim * 3 + h);
      ctx.fillStyle = `rgba(180,90,200,${0.5 * pulse})`;
      ctx.beginPath(); ctx.arc(cx, cy - 2 * z, 4 * z, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a2a66';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.arc(cx + i * 4 * z, cy, 1.6 * z, 0, Math.PI * 2); ctx.fill();
      }
    } else if (terra > 0.55) {
      // tufts of life
      ctx.strokeStyle = '#3c8f52';
      ctx.lineWidth = 1.4 * z;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * 3 * z, cy + 1 * z);
        ctx.lineTo(cx + i * 3 * z, cy - 5 * z);
        ctx.stroke();
      }
    } else if (h % 100 < 22) {
      // barren rocks / craters
      if (h % 2) {
        ctx.fillStyle = '#5a514a';
        ctx.beginPath(); ctx.ellipse(cx, cy, 6 * z, 3.4 * z, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6d635b';
        ctx.beginPath(); ctx.ellipse(cx - 1.5 * z, cy - 1.5 * z, 3 * z, 1.8 * z, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1.5 * z;
        ctx.beginPath(); ctx.ellipse(cx, cy, 5 * z, 3 * z, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
  },

  /* ---------------- highlights ---------------- */
  drawHighlight(col, row) {
    const ctx = this.ctx;
    const p = this.corners(col, row);
    const occupied = !!State.data.grid[row][col];
    this.diamond(p);
    if (this.demolish) {
      ctx.fillStyle = occupied ? 'rgba(255,107,107,0.4)' : 'rgba(255,255,255,0.06)';
      ctx.fill(); ctx.strokeStyle = occupied ? '#ff6b6b' : 'rgba(255,255,255,0.35)';
    } else if (this.tool === 'terra') {
      ctx.fillStyle = 'rgba(95,240,138,0.32)'; ctx.fill(); ctx.strokeStyle = '#5ff08a';
    } else if (this.tool === 'cleanse') {
      ctx.fillStyle = 'rgba(120,200,255,0.32)'; ctx.fill(); ctx.strokeStyle = '#78c8ff';
    } else if (this.selected) {
      const ok = !occupied && Economy.canAfford(this.selected);
      ctx.fillStyle = ok ? 'rgba(95,240,138,0.4)' : 'rgba(255,107,107,0.4)';
      ctx.fill(); ctx.strokeStyle = ok ? '#5ff08a' : '#ff6b6b';
    } else { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; }
    ctx.lineWidth = 2; ctx.stroke();
    if (this.selected && !occupied && !this.demolish && !this.tool)
      this.drawBuilding(col, row, this.selected, 0.5, Economy.sun());
  },

  drawSelectMarker(col, row) {
    const ctx = this.ctx;
    const p = this.corners(col, row);
    this.diamond(p);
    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]); ctx.lineDashOffset = -this.anim * 12;
    ctx.stroke(); ctx.setLineDash([]);
  },

  drawFlash(f) {
    const ctx = this.ctx;
    const p = this.corners(f.col, f.row);
    ctx.globalAlpha = Math.max(0, f.t);
    this.diamond(p); ctx.fillStyle = f.color; ctx.fill();
    ctx.globalAlpha = 1;
  },

  /* ---------------- corruption nest ---------------- */
  drawNest(n) {
    const ctx = this.ctx, z = Camera.zoom;
    const p = this.corners(n.col, n.row);
    const cx = p.cx, baseY = p.cy;
    const pulse = 0.7 + 0.3 * Math.sin(this.anim * 2.5 + n.col);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(cx, baseY + 2 * z, 14 * z, 7 * z, 0, 0, Math.PI * 2); ctx.fill();
    // bulbous mound
    ctx.fillStyle = '#3c1c46';
    ctx.beginPath(); ctx.ellipse(cx, baseY - 4 * z, 13 * z, 9 * z, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a2a66';
    ctx.beginPath(); ctx.ellipse(cx, baseY - 7 * z, 8 * z, 6 * z, 0, 0, Math.PI * 2); ctx.fill();
    // glowing maw
    ctx.fillStyle = `rgba(210,110,230,${0.6 * pulse})`;
    ctx.beginPath(); ctx.arc(cx, baseY - 8 * z, 3.5 * z, 0, Math.PI * 2); ctx.fill();
    // horns
    ctx.strokeStyle = '#2a1230'; ctx.lineWidth = 2 * z;
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 8 * z, baseY - 6 * z);
      ctx.lineTo(cx + i * 11 * z, baseY - 16 * z);
      ctx.stroke();
    }
  },

  /* =============================================================
     BUILDINGS — stable (no bob)
     ============================================================= */
  drawBuilding(col, row, key, alpha, sun) {
    const ctx = this.ctx;
    const p = this.corners(col, row);
    const z = Camera.zoom;
    const cx = p.cx, baseY = p.cy;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx, baseY + 3 * z, p.hw * 0.6, p.hh * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    if (key === 'solar') this.drawSolar(cx, baseY, z, sun);
    else if (key === 'oxygen') this.drawOxygen(cx, baseY, z);
    else if (key === 'lab') this.drawLab(cx, baseY, z);
    else if (key === 'home') this.drawHome(cx, baseY, z, sun);
    else if (key === 'battery') this.drawBattery(cx, baseY, z);
    // corruption choke marker
    if (State.data.grid[row][col] && World.isChoked(col, row)) {
      ctx.globalAlpha = alpha * (0.5 + 0.3 * Math.sin(this.anim * 4));
      ctx.fillStyle = '#d26ee6';
      ctx.font = `${12 * z}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('☣', cx, baseY - 30 * z);
    }
    ctx.globalAlpha = 1;
  },

  drawSolar(cx, baseY, z, sun) {
    const ctx = this.ctx;
    ctx.strokeStyle = '#2c3142'; ctx.lineWidth = 2 * z;
    ctx.beginPath();
    ctx.moveTo(cx - 8 * z, baseY); ctx.lineTo(cx - 6 * z, baseY - 12 * z);
    ctx.moveTo(cx + 8 * z, baseY); ctx.lineTo(cx + 6 * z, baseY - 12 * z);
    ctx.stroke();
    const w = 17 * z, top = baseY - 24 * z;
    ctx.beginPath();
    ctx.moveTo(cx - w, top + 6 * z); ctx.lineTo(cx + w, top - 2 * z);
    ctx.lineTo(cx + w, top + 9 * z); ctx.lineTo(cx - w, top + 17 * z);
    ctx.closePath();
    ctx.fillStyle = '#1a2b54'; ctx.fill();
    ctx.strokeStyle = 'rgba(110,150,210,0.5)'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const fx = cx - w + (2 * w) * (i / 4);
      ctx.beginPath();
      ctx.moveTo(fx, top + 6 * z - 8 * z * (i / 4));
      ctx.lineTo(fx, top + 17 * z - 8 * z * (i / 4));
      ctx.stroke();
    }
  },

  drawOxygen(cx, baseY, z) {
    const ctx = this.ctx;
    ctx.fillStyle = '#0a5c3e';
    roundRect(ctx, cx - 12 * z, baseY - 12 * z, 24 * z, 14 * z, 4 * z); ctx.fill();
    ctx.fillStyle = 'rgba(70,190,140,0.5)';
    ctx.beginPath(); ctx.arc(cx, baseY - 12 * z, 12 * z, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(180,220,200,0.7)'; ctx.lineWidth = 1.5 * z;
    ctx.beginPath(); ctx.arc(cx, baseY - 12 * z, 12 * z, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.ellipse(cx - 4 * z, baseY - 17 * z, 3 * z, 5 * z, -0.5, 0, Math.PI * 2); ctx.fill();
  },

  drawLab(cx, baseY, z) {
    const ctx = this.ctx;
    ctx.fillStyle = '#46278f';
    ctx.beginPath(); ctx.arc(cx, baseY - 8 * z, 13 * z, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#552fb0';
    roundRect(ctx, cx - 13 * z, baseY - 9 * z, 26 * z, 9 * z, 2 * z); ctx.fill();
    ctx.fillStyle = 'rgba(160,120,220,0.85)';
    roundRect(ctx, cx - 9 * z, baseY - 7 * z, 18 * z, 4 * z, 2 * z); ctx.fill();
    const mastTop = baseY - 21 * z;
    ctx.strokeStyle = '#9a86cc'; ctx.lineWidth = 1.8 * z;
    ctx.beginPath(); ctx.moveTo(cx, baseY - 19 * z); ctx.lineTo(cx, mastTop); ctx.stroke();
    const a = Math.sin(this.anim * 1.2) * 0.5;
    ctx.save(); ctx.translate(cx, mastTop); ctx.rotate(a);
    ctx.fillStyle = '#c9bdee';
    ctx.beginPath(); ctx.ellipse(0, -2 * z, 6 * z, 3 * z, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const blink = 0.5 + 0.5 * Math.sin(this.anim * 5);
    ctx.globalAlpha = (ctx.globalAlpha) * blink;
    ctx.fillStyle = '#ff4a6a';
    ctx.beginPath(); ctx.arc(cx + 10 * z, baseY - 16 * z, 1.8 * z, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  },

  drawBattery(cx, baseY, z) {
    const ctx = this.ctx;
    // a pair of cells with a charge gauge that fills with stored energy
    const charge = (() => {
      const cap = Economy.capacities().energy;
      return cap > 0 ? Math.min(1, State.data.energy / cap) : 0;
    })();
    for (let i = 0; i < 2; i++) {
      const x = cx - 9 * z + i * 12 * z;
      ctx.fillStyle = '#3a3322';
      roundRect(ctx, x - 4 * z, baseY - 20 * z, 8 * z, 20 * z, 2 * z); ctx.fill();
      // charge fill
      const fillH = 18 * z * charge;
      ctx.fillStyle = '#ffe04a';
      roundRect(ctx, x - 3 * z, baseY - 1 * z - fillH, 6 * z, fillH, 1.5 * z); ctx.fill();
      // terminal cap
      ctx.fillStyle = '#7a6a2a';
      roundRect(ctx, x - 2.5 * z, baseY - 22 * z, 5 * z, 3 * z, 1 * z); ctx.fill();
    }
    // bolt glyph
    ctx.globalAlpha = (ctx.globalAlpha) * (0.6 + 0.4 * Math.sin(this.anim * 3));
    ctx.fillStyle = '#fff6c0';
    ctx.font = `${11 * z}px serif`;
    ctx.textAlign = 'center';
    ctx.fillText('⚡', cx, baseY - 9 * z);
    ctx.globalAlpha = 1;
  },

  /* ---------------- landing rocket cinematic ---------------- */
  drawLander(intro) {
    const ctx = this.ctx, z = Camera.zoom;
    const m = CONFIG.GRID / 2;
    const land = this.screenAt(m, m);
    const cx = land.x, groundY = land.y;
    const H = this.canvas.clientHeight;
    const rh = 64 * z, rw = 18 * z;

    // vertical position of the ship's base across the cinematic phases
    let yBase, burning;
    if (intro.t < intro.land) {
      const p = intro.t / intro.land;
      const e = 1 - Math.pow(1 - p, 3);              // ease-out descent
      yBase = (groundY - H - 200) + (H + 200) * e;
      burning = true;
    } else if (intro.t < intro.leave) {
      yBase = groundY; burning = false;             // sat down, engines cut
    } else {
      const p = (intro.t - intro.leave) / (intro.dur - intro.leave);
      yBase = groundY - (H + 300) * (p * p * p);    // ease-in lift off
      burning = true;
    }

    // landing pad glow on the ground
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ffcf5a'; ctx.lineWidth = 2 * z;
    ctx.beginPath(); ctx.ellipse(cx, groundY, 26 * z, 13 * z, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // exhaust flame + dust
    if (burning) {
      const flick = 0.7 + Math.random() * 0.5;
      const fl = (22 + Math.random() * 10) * z * flick;
      const grad = ctx.createLinearGradient(cx, yBase, cx, yBase + fl);
      grad.addColorStop(0, '#fff2b0');
      grad.addColorStop(0.5, '#ff9a3c');
      grad.addColorStop(1, 'rgba(255,80,30,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx - 6 * z, yBase);
      ctx.lineTo(cx + 6 * z, yBase);
      ctx.lineTo(cx, yBase + fl);
      ctx.closePath(); ctx.fill();
      if (Math.abs(yBase - groundY) < 130 * z && this.fx.length < 90) {
        this.fx.push({ x: cx + (Math.random() - 0.5) * 40 * z, y: groundY,
          vy: -4 - Math.random() * 4, vx: (Math.random() - 0.5) * 30, life: 1, max: 1.2,
          r: 3 + Math.random() * 3, type: 'smoke' });
      }
    }

    // body
    ctx.fillStyle = '#dfe3ec';
    roundRect(ctx, cx - rw / 2, yBase - rh, rw, rh, 8 * z); ctx.fill();
    ctx.fillStyle = '#b9bfcc';
    roundRect(ctx, cx - rw / 2, yBase - rh, rw * 0.4, rh, 8 * z); ctx.fill();
    // nose cone
    ctx.fillStyle = '#d8552a';
    ctx.beginPath();
    ctx.moveTo(cx - rw / 2, yBase - rh + 2 * z);
    ctx.lineTo(cx + rw / 2, yBase - rh + 2 * z);
    ctx.lineTo(cx, yBase - rh - 16 * z);
    ctx.closePath(); ctx.fill();
    // window
    ctx.fillStyle = '#5fc8ff';
    ctx.beginPath(); ctx.arc(cx, yBase - rh + 16 * z, 4 * z, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(cx - 1.3 * z, yBase - rh + 14.5 * z, 1.4 * z, 0, Math.PI * 2); ctx.fill();
    // fins
    ctx.fillStyle = '#c0481f';
    ctx.beginPath();
    ctx.moveTo(cx - rw / 2, yBase - 14 * z); ctx.lineTo(cx - rw / 2 - 8 * z, yBase);
    ctx.lineTo(cx - rw / 2, yBase); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + rw / 2, yBase - 14 * z); ctx.lineTo(cx + rw / 2 + 8 * z, yBase);
    ctx.lineTo(cx + rw / 2, yBase); ctx.closePath(); ctx.fill();
  },

  drawHome(cx, baseY, z, sun) {
    const ctx = this.ctx;
    ctx.fillStyle = '#b8b0a2';
    roundRect(ctx, cx - 13 * z, baseY - 20 * z, 26 * z, 20 * z, 7 * z); ctx.fill();
    ctx.fillStyle = '#a8501f';
    roundRect(ctx, cx - 13 * z, baseY - 20 * z, 26 * z, 8 * z, 7 * z); ctx.fill();
    ctx.fillRect(cx - 13 * z, baseY - 14 * z, 26 * z, 3 * z);
    ctx.fillStyle = '#5a3422';
    roundRect(ctx, cx - 4 * z, baseY - 11 * z, 8 * z, 11 * z, 3 * z); ctx.fill();
    const glow = 1 - sun.light;
    ctx.fillStyle = glow > 0.35 ? '#ffc24a' : '#7fa9c6';
    if (glow > 0.35) { ctx.shadowColor = '#ffc24a'; ctx.shadowBlur = 7 * z * glow; }
    ctx.beginPath(); ctx.arc(cx + 7 * z, baseY - 9 * z, 2.6 * z, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  },

  /* =============================================================
     COLONISTS
     ============================================================= */
  drawColonist(a) {
    const ctx = this.ctx, z = Camera.zoom;
    const s = this.screenAt(a.x, a.y);
    const walking = a.state === 'walk';
    const bob = walking ? Math.abs(Math.sin(this.anim * 8 + a.phase)) * 2 * z : 0;
    const x = s.x, y = s.y - bob;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(x, s.y + 1 * z, 4 * z, 2 * z, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.scale(a.flip, 1);
    const stride = walking ? Math.sin(this.anim * 8 + a.phase) * 2 * z : 0;
    ctx.strokeStyle = '#b6bccb'; ctx.lineWidth = 1.6 * z;
    ctx.beginPath();
    ctx.moveTo(-1.5 * z, -2 * z); ctx.lineTo(-1.5 * z + stride, 1 * z);
    ctx.moveTo(1.5 * z, -2 * z);  ctx.lineTo(1.5 * z - stride, 1 * z);
    ctx.stroke();
    ctx.fillStyle = '#d8dbe6';
    roundRect(ctx, -3.2 * z, -9 * z, 6.4 * z, 8 * z, 2.4 * z); ctx.fill();
    ctx.fillStyle = '#9aa2b4';
    roundRect(ctx, -4.6 * z, -8 * z, 1.8 * z, 5 * z, 1 * z); ctx.fill();
    ctx.fillStyle = '#eef0f6';
    ctx.beginPath(); ctx.arc(0, -11 * z, 3.6 * z, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `hsl(${a.hue},55%,45%)`;
    ctx.beginPath(); ctx.arc(0.6 * z, -11 * z, 2.2 * z, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(-0.2 * z, -11.8 * z, 0.8 * z, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  /* =============================================================
     PARTICLES
     ============================================================= */
  seedDust() {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    this.dust = [];
    for (let i = 0; i < 34; i++)
      this.dust.push({ x: Math.random() * W, y: Math.random() * H,
        vx: 6 + Math.random() * 14, vy: -2 + Math.random() * 4,
        r: 0.6 + Math.random() * 1.4, a: 0.1 + Math.random() * 0.22 });
  },
  updateAndDrawDust(dt, W, H) {
    const ctx = this.ctx;
    for (const p of this.dust) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x > W + 5) p.x = -5;
      if (p.y < -5) p.y = H + 5; else if (p.y > H + 5) p.y = -5;
      ctx.globalAlpha = p.a; ctx.fillStyle = '#b9a89a';
      ctx.fillRect(p.x, p.y, p.r, p.r);
    }
    ctx.globalAlpha = 1;
  },

  spawnEffects(dt) {
    if (this.fx.length > 90) return;
    const grid = State.data.grid;
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < grid[r].length; c++) {
        const k = grid[r][c];
        if (k === 'oxygen' && Math.random() < dt * 1.2) {
          const p = this.corners(c, r);
          this.fx.push({ x: p.cx + (Math.random() - 0.5) * 8, y: p.cy - 22 * Camera.zoom,
            vy: -8 - Math.random() * 6, vx: (Math.random() - 0.5) * 4, life: 1, max: 1.4,
            r: 2 + Math.random() * 2, type: 'smoke' });
        }
      }
    // spores drifting up from heavily corrupted tiles
    const inf = State.data.infest;
    for (const n of State.data.nests) {
      if (Math.random() < dt * 1.5) {
        const p = this.corners(n.col, n.row);
        this.fx.push({ x: p.cx + (Math.random() - 0.5) * 12, y: p.cy - 8 * Camera.zoom,
          vy: -6 - Math.random() * 5, vx: (Math.random() - 0.5) * 5, life: 1, max: 1.6,
          r: 1.6, type: 'spore' });
      }
    }
  },

  updateAndDrawFx(dt) {
    const ctx = this.ctx, z = Camera.zoom;
    this.fx = this.fx.filter(p => p.life > 0);
    for (const p of this.fx) {
      p.life -= dt / p.max; p.x += p.vx * dt; p.y += p.vy * dt;
      const a = Math.max(0, p.life);
      if (p.type === 'smoke') {
        ctx.globalAlpha = a * 0.4; ctx.fillStyle = '#c8cdd4';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * z * (1.4 - p.life * 0.6), 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.globalAlpha = a * 0.8; ctx.fillStyle = '#c78ad6';
        ctx.fillRect(p.x, p.y, p.r * z, p.r * z);
      }
    }
    ctx.globalAlpha = 1;
  },

  drawVignette(W, H) {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  },
};

/* ---------------- utils ---------------- */
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function mix(a, b, t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function rgb(c) { return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }
