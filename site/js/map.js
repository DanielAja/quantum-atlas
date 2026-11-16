/* Interactive map of papers and ideas: force layout on a canvas, no libraries. */
(function () {
  const QA = window.QA;

  QA.mountMap = function (root, X) {
    const { index, graph, concepts, sub, conName, esc, ago } = X;
    const daysOld = (iso) => Math.floor((Date.now() - new Date(iso + 'T00:00:00Z').getTime()) / 864e5);
    const st = {
      mode: X.concept ? 'ideas' : 'papers',
      sub: X.subFilter || '',
      days: 14, q: '', cluster: -1, selected: null, hover: null,
    };
    if (X.focus) { const p = index.find((x) => x.id === X.focus); if (p) st.days = Math.max(st.days, Math.min(45, daysOld(p.d) + 1)); }

    root.innerHTML = `
      <div class="toolbar">
        <div class="row">
          <div class="row" role="group" aria-label="What to show">
            <button class="chip" type="button" data-mode="papers">🔵 Papers</button>
            <button class="chip" type="button" data-mode="ideas">💡 Ideas</button>
          </div>
          <span class="spacer"></span>
          <label class="row" style="gap:6px">Last <input type="range" id="m-days" min="1" max="45" step="1" value="${st.days}" style="width:140px" aria-label="How many days back"> <output id="m-days-out"></output></label>
        </div>
        <div class="chips-scroll" role="group" aria-label="Filter by research area">
          <button class="chip" type="button" data-msub="">All areas</button>
          ${concepts.subfields.map((s) => `<button class="chip" type="button" data-msub="${s.id}"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</button>`).join('')}
        </div>
        <input type="search" id="m-q" placeholder="Find a paper or idea on the map…" aria-label="Find on the map">
      </div>
      <div class="map-wrap">
        <canvas class="map-canvas" role="img" aria-label="Map of research papers and how they connect. Use the cluster list below for a text version."></canvas>
        <div class="map-zoom"><button type="button" data-z="in" aria-label="Zoom in">+</button><button type="button" data-z="out" aria-label="Zoom out">−</button><button type="button" data-z="fit" aria-label="Fit everything">⤢</button></div>
        <div class="card map-panel" hidden aria-live="polite"></div>
        <div class="card map-help muted" id="m-stat"></div>
      </div>
      <div class="legend-row" id="m-legend"></div>
      <h2 id="cl-h">Idea clusters</h2>
      <p class="muted">Groups of papers that keep linking to each other. Tap one to light it up on the map.</p>
      <div class="clusters" id="m-clusters"></div>`;

    const canvas = root.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const panel = root.querySelector('.map-panel');
    let W = 0, H = 0, dpr = 1;
    const view = { x: 0, y: 0, k: 1 };
    let nodes = [], links = [], alpha = 0, raf = 0, alive = true, autoFit = false;

    /* ---------- data for current filters ---------- */
    function filtered() {
      return index.map((p, i) => ({ p, i })).filter(({ p }) => daysOld(p.d) <= st.days && (!st.sub || p.s === st.sub || (p.s2 || []).includes(st.sub)));
    }
    function buildPapers() {
      let list = filtered();
      const CAP = 750;
      if (list.length > CAP) {
        const keep = list.slice(0, CAP);
        if (X.focus && !keep.some((x) => x.p.id === X.focus)) { const f = list.find((x) => x.p.id === X.focus); if (f) keep.push(f); }
        list = keep;
      }
      const at = new Map(list.map((x, k) => [x.i, k]));
      const ncl = graph.clusters.length || 1;
      nodes = list.map(({ p, i }, k) => {
        const cl = graph.cluster[i];
        const ang = cl >= 0 ? (cl / ncl) * Math.PI * 2 * 2.618 : Math.random() * 6.28;
        const rad = cl >= 0 ? 80 + 22 * Math.sqrt(cl) * 6 : 380;
        return { kind: 'paper', id: p.id, p, i, cl, r: 4 + Math.min(4, Math.sqrt(p.k || 0) * 0.8), color: sub(p.s).color,
          x: Math.cos(ang) * rad + (Math.random() - 0.5) * 60, y: Math.sin(ang) * rad + (Math.random() - 0.5) * 60, vx: 0, vy: 0, deg: 0 };
      });
      links = [];
      for (const [a, b, w, t] of graph.edges) {
        const A = at.get(a), B = at.get(b);
        if (A == null || B == null) continue;
        links.push({ s: nodes[A], t: nodes[B], w, type: t });
        nodes[A].deg++; nodes[B].deg++;
      }
    }
    function buildIdeas() {
      const list = filtered();
      const count = {}, co = {};
      for (const { p } of list) {
        const cs = [...new Set(p.c.slice(0, 5))].sort();
        for (const c of cs) count[c] = (count[c] || 0) + 1;
        for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) { const k = cs[a] + '|' + cs[b]; co[k] = (co[k] || 0) + 1; }
      }
      const max = Math.max(1, ...Object.values(count));
      nodes = Object.entries(count).map(([id, n], k, arr) => {
        const c = concepts.concepts.find((x) => x.id === id);
        const ang = (k / arr.length) * Math.PI * 2;
        return { kind: 'idea', id, n, c, r: 7 + 26 * Math.sqrt(n / max), color: sub(c ? c.subfield : '').color,
          x: Math.cos(ang) * 260, y: Math.sin(ang) * 260, vx: 0, vy: 0, deg: 0 };
      });
      const byId = new Map(nodes.map((n) => [n.id, n]));
      links = Object.entries(co).filter(([, n]) => n >= 2).map(([k, n]) => { const [a, b] = k.split('|'); return { s: byId.get(a), t: byId.get(b), w: n, type: 1 }; })
        .filter((l) => l.s && l.t)
        // keep links that are strong relative to how common both ideas are
        .map((l) => ({ ...l, lift: l.w / Math.sqrt(l.s.n * l.t.n) }))
        .sort((a, b) => b.lift - a.lift).slice(0, 220);
      for (const l of links) { l.s.deg++; l.t.deg++; }
    }
    function rebuild(keepView) {
      st.selected = null; st.hover = null; panel.hidden = true;
      if (st.mode === 'papers') buildPapers(); else buildIdeas();
      alpha = 1;
      for (let i = 0; i < (QA.reducedMotion() ? 400 : 120); i++) tick();
      if (!keepView) { fit(); autoFit = !(X.focus || X.concept); }
      kick();
      updateUI();
    }

    /* ---------- physics ---------- */
    function tick() {
      const n = nodes.length;
      if (!n) return;
      const ideas = st.mode === 'ideas';
      const cell = ideas ? 160 : 50, rep = ideas ? 9000 : 380;
      const grid = new Map();
      for (const a of nodes) {
        const key = Math.floor(a.x / cell) + ',' + Math.floor(a.y / cell);
        (grid.get(key) || grid.set(key, []).get(key)).push(a);
      }
      for (const a of nodes) {
        const gx = Math.floor(a.x / cell), gy = Math.floor(a.y / cell);
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
          const bucket = grid.get(gx + dx + ',' + (gy + dy));
          if (!bucket) continue;
          for (const b of bucket) {
            if (b === a) continue;
            let x = a.x - b.x, y = a.y - b.y, d2 = x * x + y * y;
            if (d2 < 0.01) { x = Math.random() - 0.5; y = Math.random() - 0.5; d2 = 0.5; }
            const d = Math.sqrt(d2), minD = ideas ? a.r + b.r + 26 : a.r + b.r + 4;
            const f = (rep * alpha) / d2;
            a.vx += (x * f * 0.5) / d; a.vy += (y * f * 0.5) / d;
            if (d < minD) { const push = ((minD - d) / d) * (ideas ? 0.25 : 0.1); a.x += x * push; a.y += y * push; }
          }
        }
      }
      const L = ideas ? 170 : 34;
      for (const l of links) {
        const x = l.t.x - l.s.x, y = l.t.y - l.s.y, d = Math.sqrt(x * x + y * y) || 1;
        const strength = ideas ? 0.04 * Math.min(1, l.lift * 3) : Math.min(0.12, 0.02 * l.w) / Math.sqrt(Math.min(l.s.deg, l.t.deg) || 1);
        const f = (d - L) * strength * alpha;
        const fx = (x / d) * f, fy = (y / d) * f;
        l.s.vx += fx; l.s.vy += fy; l.t.vx -= fx; l.t.vy -= fy;
      }
      // pull papers toward the middle of their idea cluster so groups separate
      if (!ideas) {
        const cen = {};
        for (const a of nodes) if (a.cl >= 0) { const c = (cen[a.cl] = cen[a.cl] || [0, 0, 0]); c[0] += a.x; c[1] += a.y; c[2]++; }
        for (const a of nodes) if (a.cl >= 0) { const c = cen[a.cl]; a.vx += (c[0] / c[2] - a.x) * 0.05 * alpha; a.vy += (c[1] / c[2] - a.y) * 0.05 * alpha; }
        // and push whole clusters apart
        const cs = Object.entries(cen).map(([k, c]) => ({ k: +k, x: c[0] / c[2], y: c[1] / c[2], n: c[2] }));
        const shift = {};
        for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
          const A = cs[i], B = cs[j], x = A.x - B.x, y = A.y - B.y, d = Math.sqrt(x * x + y * y) || 1;
          const want = 14 * (Math.sqrt(A.n) + Math.sqrt(B.n));
          if (d < want) {
            const f = ((want - d) / d) * 0.08 * alpha;
            (shift[A.k] = shift[A.k] || [0, 0]); (shift[B.k] = shift[B.k] || [0, 0]);
            shift[A.k][0] += x * f; shift[A.k][1] += y * f; shift[B.k][0] -= x * f; shift[B.k][1] -= y * f;
          }
        }
        for (const a of nodes) { const sh = shift[a.cl]; if (sh) { a.vx += sh[0]; a.vy += sh[1]; } }
      }
      // gentle pull to the middle, stronger for loners
      for (const a of nodes) { const g = (a.deg ? 0.006 : 0.02) * alpha; a.vx -= a.x * g; a.vy -= a.y * g; }
      for (const a of nodes) {
        if (a.fixed) { a.vx = a.vy = 0; continue; }
        a.vx *= 0.6; a.vy *= 0.6;
        a.x += Math.max(-30, Math.min(30, a.vx)); a.y += Math.max(-30, Math.min(30, a.vy));
      }
      alpha *= 0.985;
    }
    function kick() { if (!raf && alive) raf = requestAnimationFrame(frame); }
    function frame() {
      raf = 0;
      if (!alive) return;
      if (alpha > 0.02) { tick(); if (!QA.reducedMotion()) tick(); }
      if (autoFit && (alpha <= 0.02 || alpha < 0.3)) { autoFit = alpha > 0.02; fit(); }
      draw();
      if (alpha > 0.02) kick();
    }

    /* ---------- view ---------- */
    const toScreen = (n) => [(n.x - view.x) * view.k + W / 2, (n.y - view.y) * view.k + H / 2];
    const toWorld = (sx, sy) => [(sx - W / 2) / view.k + view.x, (sy - H / 2) / view.k + view.y];
    function fit(subset) {
      const ns = subset && subset.length ? subset : nodes;
      if (!ns.length) return;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const n of ns) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
      view.x = (x0 + x1) / 2; view.y = (y0 + y1) / 2;
      view.k = Math.min(3, 0.85 * Math.min(W / Math.max(60, x1 - x0), H / Math.max(60, y1 - y0)));
      draw();
    }
    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      draw();
    }

    const matchQ = (n) => {
      if (!st.q) return false;
      const q = st.q.toLowerCase();
      return n.kind === 'paper' ? (n.p.t + ' ' + n.p.a.join(' ')).toLowerCase().includes(q) : (n.c ? n.c.name : n.id).toLowerCase().includes(q);
    };
    function draw() {
      if (!W) return;
      const C = QA.colors();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const sel = st.selected;
      const nb = new Set();
      if (sel) for (const l of links) { if (l.s === sel) nb.add(l.t); if (l.t === sel) nb.add(l.s); }
      const hasQ = !!st.q, hasCl = st.cluster >= 0;
      const dim = (n) => (sel && n !== sel && !nb.has(n)) || (hasQ && !matchQ(n)) || (hasCl && n.cl !== st.cluster);
      // links
      ctx.lineWidth = 1;
      for (const l of links) {
        const on = sel && (l.s === sel || l.t === sel);
        const faded = dim(l.s) || dim(l.t);
        if (faded && !on) { if (sel || hasQ || hasCl) continue; }
        const [x1, y1] = toScreen(l.s), [x2, y2] = toScreen(l.t);
        ctx.strokeStyle = on ? QA.alpha(C.a, 0.9) : (l.type & 4 ? QA.alpha(C.b, 0.45) : l.type & 2 ? QA.alpha(C.c, 0.4) : C.grid);
        ctx.lineWidth = on ? 2 : st.mode === 'ideas' ? 0.5 + 3 * Math.min(1, l.lift) : 1;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      // nodes
      const rk = st.mode === 'ideas' ? Math.max(0.6, Math.min(1.6, view.k)) : Math.max(0.7, Math.min(2.2, Math.sqrt(view.k)));
      for (const n of nodes) {
        const [x, y] = toScreen(n);
        if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
        const d = dim(n);
        ctx.globalAlpha = d ? 0.15 : 1;
        ctx.fillStyle = n.color;
        ctx.beginPath(); ctx.arc(x, y, n.r * rk, 0, Math.PI * 2); ctx.fill();
        if (n === sel || n === st.hover || (hasQ && matchQ(n))) { ctx.strokeStyle = C.fg; ctx.lineWidth = 2.5; ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
      // labels
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = (txt, x, y, size, weight = 700) => {
        ctx.font = `${weight} ${size}px Nunito, system-ui, sans-serif`;
        ctx.lineWidth = 4; ctx.strokeStyle = C.bg; ctx.strokeText(txt, x, y);
        ctx.fillStyle = C.fg; ctx.fillText(txt, x, y);
      };
      if (st.mode === 'ideas') {
        const placed = [];
        const order = nodes.slice().sort((a, b) => (b === sel) - (a === sel) || nb.has(b) - nb.has(a) || b.n - a.n);
        ctx.font = '700 12px Nunito, system-ui, sans-serif';
        for (const n of order) {
          if (dim(n) && n !== sel) continue;
          const [x, y] = toScreen(n);
          const txt = n.c ? n.c.name : n.id, ly = y + n.r * rk + 10;
          const w = ctx.measureText(txt).width + 6, box = [x - w / 2, ly - 8, x + w / 2, ly + 8];
          if (placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
          placed.push(box);
          label(txt, x, ly, 12);
        }
      } else {
        // cluster labels at the middle of each group
        if (!sel && !hasQ && view.k < 2.2) {
          const acc = {};
          for (const n of nodes) if (n.cl >= 0) { const a = (acc[n.cl] = acc[n.cl] || { x: 0, y: 0, k: 0 }); a.x += n.x; a.y += n.y; a.k++; }
          const placed = [];
          const order = Object.entries(acc).sort((p, q) => q[1].k - p[1].k);
          for (const [cl, a] of order) {
            if (a.k < 8 || (hasCl && +cl !== st.cluster)) continue;
            const info = graph.clusters[cl];
            const [x, y] = toScreen({ x: a.x / a.k, y: a.y / a.k });
            const txt = info.concepts.slice(0, 2).map(conName).join(' + ');
            const size = 12 + Math.min(4, a.k / 30);
            ctx.font = `800 ${size}px Nunito, system-ui, sans-serif`;
            const w = ctx.measureText(txt).width + 8, h = size + 6;
            const box = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
            if (placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
            placed.push(box);
            label(txt, x, y, size, 800);
          }
        }
        for (const n of [st.hover, sel].filter(Boolean)) {
          const [x, y] = toScreen(n);
          const t = n.p.t.length > 60 ? n.p.t.slice(0, 58) + '…' : n.p.t;
          label(t, Math.max(120, Math.min(W - 120, x)), y - n.r * rk - 12, 12);
        }
      }
    }

    /* ---------- panel ---------- */
    function showPanel(n) {
      if (!n) { panel.hidden = true; return; }
      panel.hidden = false;
      const nbrs = links.filter((l) => l.s === n || l.t === n).map((l) => ({ o: l.s === n ? l.t : l.s, l })).sort((a, b) => b.l.w - a.l.w);
      if (n.kind === 'paper') {
        const p = n.p, s = sub(p.s);
        panel.innerHTML = `<div class="row"><span class="tag" style="background:${s.color}">${s.emoji} ${esc(s.name)}</span><span class="spacer"></span><button class="btn small" type="button" data-close aria-label="Close">✕</button></div>
          <h3 style="margin:.5em 0 .3em"><a href="#/paper/${esc(p.id)}">${esc(p.t)}</a></h3>
          <small class="muted">${esc(p.a.join(', '))}${p.na > 3 ? ' et al.' : ''} · ${ago(p.d)}</small>
          <p>${esc(p.x)}</p>
          <div class="row">${p.c.slice(0, 5).map((c) => `<a class="chip" href="#/learn/${c}">${esc(conName(c))}</a>`).join('')}</div>
          <p class="row" style="margin-top:10px"><a class="btn primary small" href="#/paper/${esc(p.id)}">Open summary & demo</a><a class="btn small" href="https://arxiv.org/abs/${esc(p.id)}" target="_blank" rel="noopener">arXiv ↗</a></p>
          ${nbrs.length ? `<b>Linked to ${nbrs.length} paper${nbrs.length > 1 ? 's' : ''}</b><div class="related">${nbrs.slice(0, 6).map(({ o, l }) => `<a href="#" data-goto="${o.id}"><b>${esc(o.p.t)}</b><small>${[l.type & 1 && 'shared ideas', l.type & 2 && 'same author', l.type & 4 && 'citation', l.type & 8 && 'shared references'].filter(Boolean).join(' · ')}</small></a>`).join('')}</div>` : '<p class="muted">No strong links in this view yet.</p>'}`;
      } else {
        const c = n.c || { name: n.id, plain: '' };
        const papers = filtered().filter(({ p }) => p.c.includes(n.id)).slice(0, 6);
        panel.innerHTML = `<div class="row"><b style="font-size:1.1rem">${esc(c.name)}</b><span class="spacer"></span><button class="btn small" type="button" data-close aria-label="Close">✕</button></div>
          <p>${esc(c.plain)}</p><p class="muted">${n.n} papers in this view.</p>
          ${nbrs.length ? `<b>Often appears with</b><div class="row" style="margin:6px 0 10px">${nbrs.slice(0, 8).map(({ o }) => `<button class="chip" type="button" data-goto="${o.id}">${esc(o.c ? o.c.name : o.id)}</button>`).join('')}</div>` : ''}
          <b>Recent papers</b><div class="related">${papers.map(({ p }) => `<a href="#/paper/${esc(p.id)}"><b>${esc(p.t)}</b><small>${ago(p.d)}</small></a>`).join('')}</div>
          <p class="row"><a class="btn small primary" href="#/learn/${esc(n.id)}">Learn about it</a><button class="btn small" type="button" data-show-papers="${esc(n.id)}">Show these papers</button></p>`;
      }
      panel.querySelector('[data-close]').addEventListener('click', () => select(null));
      panel.querySelectorAll('[data-goto]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); const o = nodes.find((x) => x.id === a.dataset.goto); if (o) { select(o); center(o); } }));
      panel.querySelector('[data-show-papers]')?.addEventListener('click', (e) => {
        st.q = ''; root.querySelector('#m-q').value = conName(e.target.dataset.showPapers);
        st.mode = 'papers'; rebuild(); st.q = root.querySelector('#m-q').value; draw();
      });
    }
    function select(n) { st.selected = n; showPanel(n); draw(); }
    function center(n) { view.x = n.x; view.y = n.y; view.k = Math.max(view.k, st.mode === 'ideas' ? 1 : 1.6); draw(); }

    /* ---------- input ---------- */
    const pointers = new Map();
    let drag = null, moved = 0, pinch0 = null;
    const pick = (sx, sy) => {
      let best = null, bd = 18 * 18;
      const rk = st.mode === 'ideas' ? Math.max(0.6, Math.min(1.6, view.k)) : Math.max(0.7, Math.min(2.2, Math.sqrt(view.k)));
      for (const n of nodes) {
        const [x, y] = toScreen(n);
        const d = (x - sx) ** 2 + (y - sy) ** 2, rr = Math.max(bd, (n.r * rk + 4) ** 2);
        if (d < rr && d < (best ? best.d : Infinity)) best = { n, d };
      }
      return best && best.n;
    };
    const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.addEventListener('pointerdown', (e) => {
      autoFit = false;
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      moved = 0;
      if (pointers.size === 1) {
        const [sx, sy] = local(e);
        const n = pick(sx, sy);
        drag = n ? { node: n } : { pan: [sx, sy, view.x, view.y] };
        if (n) n.fixed = true;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: view.k };
        if (drag && drag.node) drag.node.fixed = false;
        drag = null;
      }
      canvas.classList.add('dragging');
    });
    canvas.addEventListener('pointermove', (e) => {
      const [sx, sy] = local(e);
      if (!pointers.has(e.pointerId)) {
        const h = pick(sx, sy);
        if (h !== st.hover) { st.hover = h; draw(); }
        return;
      }
      const prev = pointers.get(e.pointerId);
      moved += Math.abs(sx - prev[0]) + Math.abs(sy - prev[1]);
      pointers.set(e.pointerId, [sx, sy]);
      if (pinch0 && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        view.k = Math.max(0.1, Math.min(8, (pinch0.k * Math.hypot(a[0] - b[0], a[1] - b[1])) / pinch0.d));
        draw();
      } else if (drag && drag.node && moved > 4) {
        const [wx, wy] = toWorld(sx, sy);
        drag.node.x = wx; drag.node.y = wy; alpha = Math.max(alpha, 0.25); kick();
      } else if (drag && drag.pan) {
        const [x0, y0, vx, vy] = drag.pan;
        view.x = vx - (sx - x0) / view.k; view.y = vy - (sy - y0) / view.k; draw();
      }
    });
    const end = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (drag && drag.node) drag.node.fixed = false;
      if (pointers.size === 0) {
        if (moved < 6) { const [sx, sy] = local(e); select(pick(sx, sy)); }
        drag = null; pinch0 = null; canvas.classList.remove('dragging');
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      autoFit = false;
      const [sx, sy] = local(e);
      const [wx, wy] = toWorld(sx, sy);
      view.k = Math.max(0.1, Math.min(8, view.k * Math.exp(-e.deltaY * 0.0015)));
      view.x = wx - (sx - W / 2) / view.k; view.y = wy - (sy - H / 2) / view.k;
      draw();
    }, { passive: false });
    root.querySelectorAll('[data-z]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.z === 'fit') fit(); else { view.k = Math.max(0.1, Math.min(8, view.k * (b.dataset.z === 'in' ? 1.4 : 1 / 1.4))); draw(); }
    }));

    /* ---------- toolbar ---------- */
    function updateUI() {
      root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === st.mode));
      root.querySelectorAll('[data-msub]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.msub === st.sub));
      root.querySelector('#m-days-out').textContent = st.days === 1 ? '1 day' : st.days + ' days';
      const shown = st.mode === 'papers' ? `${nodes.length} papers · ${links.length} links` : `${nodes.length} ideas · ${links.length} links`;
      root.querySelector('#m-stat').textContent = shown;
      const lg = root.querySelector('#m-legend');
      const C = QA.colors();
      const present = new Set(nodes.map((n) => (n.kind === 'paper' ? n.p.s : n.c && n.c.subfield)));
      lg.innerHTML = concepts.subfields.filter((s) => present.has(s.id)).map((s) => `<span><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('') +
        (st.mode === 'papers' ? `<span><i style="display:inline-block;width:18px;height:3px;background:${C.b}"></i>citation</span><span><i style="display:inline-block;width:18px;height:3px;background:${C.c}"></i>same author</span><span><i style="display:inline-block;width:18px;height:3px;background:${C.muted}"></i>shared ideas</span>` : '');
      // clusters in the current view
      const counts = {};
      for (const n of nodes) if (n.kind === 'paper' && n.cl >= 0) counts[n.cl] = (counts[n.cl] || 0) + 1;
      const box = root.querySelector('#m-clusters');
      root.querySelector('#cl-h').hidden = st.mode !== 'papers';
      root.querySelector('#cl-h').nextElementSibling.hidden = st.mode !== 'papers';
      box.hidden = st.mode !== 'papers';
      box.innerHTML = Object.entries(counts).filter(([, k]) => k >= 3).sort((a, b) => b[1] - a[1]).slice(0, 24).map(([cl, k]) => {
        const info = graph.clusters[cl], s = sub(info.subfield);
        const sample = nodes.filter((n) => n.cl === +cl).slice(0, 2).map((n) => n.p.t);
        return `<button class="card cluster" type="button" data-cl="${cl}" aria-pressed="${st.cluster === +cl}"><b>${s.emoji} ${info.concepts.map(conName).join(' · ')}</b><br><small class="muted">${k} papers · mostly ${esc(s.name)}</small><br><small>${sample.map((t) => '• ' + esc(t.length > 70 ? t.slice(0, 68) + '…' : t)).join('<br>')}</small></button>`;
      }).join('');
      box.querySelectorAll('[data-cl]').forEach((b) => b.addEventListener('click', () => {
        st.cluster = st.cluster === +b.dataset.cl ? -1 : +b.dataset.cl;
        box.querySelectorAll('[data-cl]').forEach((x) => x.setAttribute('aria-pressed', +x.dataset.cl === st.cluster));
        if (st.cluster >= 0) { fit(nodes.filter((n) => n.cl === st.cluster)); canvas.scrollIntoView({ behavior: 'smooth', block: 'center' }); } else draw();
      }));
    }
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { if (st.mode !== b.dataset.mode) { st.mode = b.dataset.mode; st.cluster = -1; rebuild(); } }));
    root.querySelectorAll('[data-msub]').forEach((b) => b.addEventListener('click', () => { st.sub = b.dataset.msub; st.cluster = -1; rebuild(); }));
    const $days = root.querySelector('#m-days');
    let dT = 0;
    $days.addEventListener('input', () => { st.days = +$days.value; root.querySelector('#m-days-out').textContent = st.days + ' days'; clearTimeout(dT); dT = setTimeout(() => rebuild(), 250); });
    root.querySelector('#m-q').addEventListener('input', (e) => {
      st.q = e.target.value.trim();
      const hits = st.q ? nodes.filter(matchQ) : [];
      if (hits.length === 1) { select(hits[0]); center(hits[0]); } else if (hits.length) fit(hits); else draw();
    });

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    rebuild();
    if (X.focus) { const n = nodes.find((x) => x.id === X.focus); if (n) setTimeout(() => { select(n); center(n); }, 50); }
    if (X.concept) { const n = nodes.find((x) => x.id === X.concept); if (n) setTimeout(() => { select(n); center(n); }, 50); }

    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); };
  };
})();
