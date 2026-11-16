/* Quantum Atlas — single-page app (hash routes), no build step.
   Visual language: "The Spectrograph". Reading surfaces are a light photographic plate,
   the galaxy is the dark sky, and every colour is a real atomic emission line.
   The 3D galaxy lives in js/cosmos.js (ES module, loaded on demand). */
(function () {
  const QA = window.QA;
  const $app = document.getElementById('app');
  const D = { meta: null, index: [], concepts: null, graph: null, shards: {}, byId: new Map(), pos: new Map() };
  let cleanup = [];
  let figN = 0;
  const reduced = () => QA.reducedMotion();

  /* ---------------- utilities ---------------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getJSON = async (url) => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };
  const days = (iso) => Math.floor((Date.now() - new Date(iso + 'T00:00:00Z').getTime()) / 864e5);
  const ago = (iso) => { const d = days(iso); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 7 ? d + ' days ago' : d < 14 ? 'last week' : Math.round(d / 7) + ' weeks ago'; };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${+d} ${MON[+m - 1]} ${y}`; };
  const plural = (n, w) => n.toLocaleString() + ' ' + w + (n === 1 ? '' : 's');
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const toast = (msg) => { const t = QA.el('div', { class: 'toast', role: 'status', text: msg }); document.body.append(t); setTimeout(() => t.remove(), 2200); };
  const levelText = (l) => ['', 'gentle read', 'some maths', 'heavy maths'][l] || '';
  const hashStr = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

  /* interference fringes, the site's only texture: I(x) = cos²(πx/λ) · sinc²(x/w) */
  (function fringes() {
    const W = 600, bars = [];
    for (let x = 0; x < W; x += 2) {
      const u = (x - W / 2) / 70, env = u === 0 ? 1 : (Math.sin(Math.PI * u) / (Math.PI * u)) ** 2;
      const I = Math.cos((Math.PI * (x - W / 2)) / 11) ** 2 * env;
      if (I > 0.02) bars.push(`<rect x="${x}" y="0" width="2" height="22" fill-opacity="${I.toFixed(2)}"/>`);
    }
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} 22' preserveAspectRatio='none'><g fill='%2314161b'>${bars.join('').replace(/"/g, "'")}</g></svg>`;
    document.documentElement.style.setProperty('--fringe-img', `url("data:image/svg+xml,${svg.replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}")`);
  })();
  const fringe = (cls = '') => `<div class="fringes ${cls}" aria-hidden="true"></div>`;

  /* ---------------- per-visitor storage (never leaves the browser) ---------------- */
  const KEY = 'quantum-atlas:v1';
  const S = (() => {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { s = {}; }
    s.fav = s.fav || {}; s.views = s.views || {}; s.seen = s.seen || []; s.quiz = s.quiz || null;
    return s;
  })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } };
  const isFav = (id) => !!S.fav[id];
  const toggleFav = (id) => {
    const p = D.byId.get(id);
    if (S.fav[id]) delete S.fav[id];
    else { S.fav[id] = { t: p ? p.t : id, s: p ? p.s : '', d: p ? p.d : '', c: p ? p.c : [], at: new Date().toISOString().slice(0, 10) }; if (p) S.views[p.s] = (S.views[p.s] || 0) + 3; }
    save();
    return !!S.fav[id];
  };
  const noteView = (p) => { S.views[p.s] = (S.views[p.s] || 0) + 1; S.seen = [p.id].concat(S.seen.filter((x) => x !== p.id)).slice(0, 300); save(); };

  /* ---------------- data ---------------- */
  const sub = (id) => (D.concepts.subfields.find((s) => s.id === id) || { id, name: id, color: '#888', plain: '', phd: '', line: '', nm: 0 });
  const con = (id) => D.concepts.concepts.find((c) => c.id === id);
  const conName = (id) => (con(id) || { name: id }).name;
  async function loadCore() {
    const [meta, index, concepts] = await Promise.all([getJSON('data/meta.json'), getJSON('data/index.json'), getJSON('data/concepts.json')]);
    D.meta = meta; D.index = index; D.concepts = concepts;
    index.forEach((p, i) => { D.byId.set(p.id, p); D.pos.set(p.id, i); });
    document.getElementById('updated').textContent = `Last observation ${new Date(meta.updated).toISOString().replace('T', ' ').slice(0, 16)} UTC · ${meta.count.toLocaleString()} papers · ${meta.days}-day window`;
  }
  const loadGraph = async () => D.graph || (D.graph = await getJSON('data/graph.json'));
  const loadPaper = async (id) => {
    const p = D.byId.get(id);
    if (!p) return null;
    if (!D.shards[p.h]) D.shards[p.h] = await getJSON(`data/papers/${p.h}.json`);
    return D.shards[p.h][id];
  };

  /* ---------------- 3D galaxy loader ---------------- */
  let cosmosMod = null;
  const webgl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  async function galaxy(container, opts) {
    if (!webgl) { container.innerHTML = '<div class="fallback-sky"></div>'; return null; }
    try {
      cosmosMod = cosmosMod || (await import('./cosmos.js'));
      if (!container.isConnected) return null;
      await loadGraph();
      const g = cosmosMod.createCosmos(container, Object.assign({ papers: D.index, concepts: D.concepts, graph: D.graph, reducedMotion: reduced(), onHover: showTip }, opts));
      cleanup.push(() => g.destroy());
      return g;
    } catch (e) {
      console.warn('3D view unavailable', e);
      container.innerHTML = '<div class="fallback-sky"></div>';
      return null;
    }
  }
  const tip = QA.el('div', { class: 'tip', hidden: '' });
  document.body.append(tip);
  function showTip(p, x, y) {
    if (!p) { tip.hidden = true; return; }
    const s = sub(p.s);
    tip.style.setProperty('--c', s.color);
    tip.innerHTML = `<small>arXiv:${esc(p.id)} · ${esc(s.line)} ${s.nm} nm</small><b>${esc(p.t)}</b><small>${esc(s.name)} · ${ago(p.d)}</small>`;
    tip.hidden = false;
    tip.style.left = Math.min(x, innerWidth - 350) + 'px';
    tip.style.top = Math.min(y, innerHeight - 140) + 'px';
  }
  const diveTo = (g, id) => {
    tip.hidden = true;
    if (g && !reduced()) { g.focusPaper(id); setTimeout(() => { location.hash = '#/paper/' + id; }, 1100); }
    else location.hash = '#/paper/' + id;
  };

  /* ---------------- shared pieces ---------------- */
  const fieldTag = (id, full = true) => { const s = sub(id); return `<span class="tag" style="--c:${s.color}"><span class="line"></span>${esc(s.line)} ${s.nm}${full ? ` · ${esc(s.name)}` : ''}</span>`; };
  const conChip = (id) => `<a class="chip" href="#/learn/${esc(id)}">${esc(conName(id))}</a>`;
  const favBtn = (id) => `<button class="fav" type="button" data-fav="${esc(id)}" aria-pressed="${isFav(id)}" aria-label="Save this paper" title="Save">${isFav(id) ? '★' : '☆'}</button>`;
  function entry(p) {
    const s = sub(p.s), demo = QA.demos[p.m];
    return `<li class="entry" style="--c:${s.color}">
      <div class="side"><span class="line"></span><span class="id">arXiv:${esc(p.id)}</span><br>[${esc(p.pc || 'quant-ph')}] ${fmtDate(p.d)}<br>${plural(p.na, 'author')}${p.k ? ` · cited ${p.k}` : ''}</div>
      <div><h3><a href="#/paper/${esc(p.id)}">${esc(p.t)}</a></h3><p>${esc(p.x)}</p>
        <div class="mono" style="margin-top:6px">${esc(s.name)} · ${levelText(p.l)}${demo ? ` · fig: ${esc(demo.title.toLowerCase())}` : ''}</div></div>
      <div class="ideas">${p.c.slice(0, 4).map(conChip).join('')}</div>
      ${favBtn(p.id)}
    </li>`;
  }
  const toc = (list) => `<ol class="toc">${list.map(entry).join('')}</ol>`;
  function wireFavs(root) {
    root.querySelectorAll('[data-fav]').forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const on = toggleFav(b.dataset.fav);
      b.setAttribute('aria-pressed', on);
      b.textContent = b.classList.contains('btn') ? (on ? '★ saved' : '☆ save') : (on ? '★' : '☆');
      toast(on ? 'saved to your constellation' : 'removed from your constellation');
    }));
  }
  function mountDemo(parent, demoId, intro) {
    const demo = QA.demos[demoId];
    if (!demo) { parent.innerHTML = '<p class="muted">This figure is missing.</p>'; return; }
    figN += 1;
    const fig = QA.el('figure', { class: 'figure', style: 'margin:0', 'aria-label': `Figure ${figN}: ${demo.title}` });
    fig.innerHTML = `<div class="fig-head">${QA.glyph(demoId, 30)}<div><span class="mono">Fig. ${figN} · interactive</span><h3>${esc(demo.title)}</h3></div></div>`;
    const body = QA.el('div', { class: 'fig-body' });
    const stage = QA.el('div', { class: 'demo-stage' });
    body.append(stage);
    fig.append(body);
    const cap = QA.el('figcaption', { class: 'caption' });
    cap.innerHTML = `<b class="fig">Fig. ${figN}.</b>${esc(demo.blurb || '')} ${esc(demo.explain || '')}
      ${intro ? `<p class="note">${intro}</p>` : ''}
      ${demo.tryThis && demo.tryThis.length ? `<span class="label" style="margin-top:10px">try</span><ol class="try">${demo.tryThis.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>` : ''}`;
    fig.append(cap);
    parent.append(fig);
    try { const stop = demo.mount(stage); if (stop) cleanup.push(stop); } catch (e) { console.error(e); stage.innerHTML = '<p class="muted">Sorry, this figure hit a snag.</p>'; }
  }
  function setNav(name) {
    document.querySelectorAll('.nav a').forEach((a) => {
      if (a.getAttribute('href') === '#/' + name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function pickSurprise() {
    const recent = D.index.filter((p) => days(p.d) <= 10 && !S.seen.includes(p.id));
    const pool = recent.length ? recent : D.index;
    const subs = D.concepts.subfields.map((s) => s.id).filter((s) => pool.some((p) => p.s === s));
    const weights = subs.map((s) => 1 / (1 + (S.views[s] || 0)) ** 1.5);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0), pick = subs[0];
    for (let i = 0; i < subs.length; i++) { r -= weights[i]; if (r <= 0) { pick = subs[i]; break; } }
    const cands = pool.filter((p) => p.s === pick);
    return cands[Math.floor(Math.random() * cands.length)];
  }
  const secHead = (ket, title, sub2 = '', tools = '', h = 'h2') => `<div class="sec-head"><span class="ket">${ket}</span><${h}>${title}</${h}>${tools ? `<div class="tools">${tools}</div>` : ''}${sub2 ? `<p>${sub2}</p>` : ''}</div>`;

  /* the spectrum strip: every field drawn at its real emission wavelength */
  function spectrum(root, { onPick, active = '' } = {}) {
    const X = (nm) => ((nm - 380) / 320) * 1000;
    const subs = D.concepts.subfields.slice().sort((a, b) => a.nm - b.nm);
    const counts = D.meta.subfieldCounts;
    let ticks = '';
    for (let nm = 380; nm <= 700; nm += 10) {
      const major = nm % 50 === 0;
      ticks += `<line class="tick" x1="${X(nm)}" x2="${X(nm)}" y1="${major ? 52 : 56}" y2="60"/>${major ? `<text x="${X(nm)}" y="74" text-anchor="middle">${nm}</text>` : ''}`;
    }
    const ems = subs.map((s, i) => {
      const x = X(s.nm);
      return `<g class="em${active === s.id ? ' on' : ''}" data-sub="${s.id}" tabindex="0" role="button" aria-pressed="${active === s.id}" aria-label="${esc(s.line)} ${s.nm} nanometres: ${esc(s.name)}, ${counts[s.id] || 0} papers">
        <rect class="hit" x="${x - 9}" y="0" width="18" height="60"/>
        <line x1="${x}" x2="${x}" y1="${i % 2 ? 22 : 14}" y2="52" stroke="${s.color}"/>
        <text x="${x}" y="${i % 2 ? 18 : 10}" text-anchor="middle">${esc(s.line)}</text></g>`;
    }).join('');
    root.innerHTML = `<div class="spectrum${active ? ' filtering' : ''}"><svg viewBox="-20 0 1040 78" preserveAspectRatio="none" role="group" aria-label="Spectrum of research fields. Each line is a real atomic emission line.">${ticks}<text x="1020" y="74" text-anchor="end">nm</text>${ems}</svg></div>
      <div class="spectrum-caption" aria-live="polite"><span class="cap-text">Each field is a real emission line, drawn at its true wavelength. Hover to read it, click to filter.</span></div>`;
    const cap = root.querySelector('.cap-text');
    const strip = root.querySelector('.spectrum');
    const say = (id) => {
      if (!id) { cap.innerHTML = active ? `filtering: <b>${esc(sub(active).name)}</b> · click the line again to clear` : 'Each field is a real emission line, drawn at its true wavelength. Hover to read it, click to filter.'; return; }
      const s = sub(id);
      cap.innerHTML = `<b>${esc(s.line)} ${s.nm} nm</b> ${esc(s.lineWhy || '')} → <b>${esc(s.name)}</b> · ${plural(counts[id] || 0, 'paper')}`;
    };
    root.querySelectorAll('.em').forEach((g) => {
      const pick = () => {
        active = active === g.dataset.sub ? '' : g.dataset.sub;
        root.querySelectorAll('.em').forEach((x) => { x.classList.toggle('on', x.dataset.sub === active); x.setAttribute('aria-pressed', x.dataset.sub === active); });
        strip.classList.toggle('filtering', !!active);
        say(active);
        onPick && onPick(active);
      };
      g.addEventListener('pointerenter', () => say(g.dataset.sub));
      g.addEventListener('focus', () => say(g.dataset.sub));
      g.addEventListener('pointerleave', () => say(active));
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
    return { set(id) { active = id; root.querySelectorAll('.em').forEach((x) => { x.classList.toggle('on', x.dataset.sub === id); x.setAttribute('aria-pressed', x.dataset.sub === id); }); strip.classList.toggle('filtering', !!id); say(id); } };
  }

  /* ---------------- |explore⟩ ---------------- */
  const F = { q: '', sub: '', concept: '', when: '30', sort: 'new', shown: 30 };
  function paperOfTheDay() {
    const pool = D.index.filter((p) => days(p.d) <= 4 && p.l <= 2 && p.c.length >= 2);
    const list = pool.length ? pool : D.index;
    return list[hashStr(new Date().toISOString().slice(0, 10)) % list.length];
  }
  async function viewHome(params) {
    setNav('');
    if (params && params.has('q')) { F.q = params.get('q'); F.sub = ''; F.concept = ''; F.when = '999'; F.shown = 30; }
    const week = D.index.filter((p) => days(p.d) <= 7).length;
    const sc = D.meta.subfieldCounts;
    const potd = paperOfTheDay(), ps = sub(potd.s);
    const trend = D.meta.trending.slice(0, 12);
    const maxT = Math.max(1, ...trend.map((t) => t.week));
    const touch = matchMedia('(pointer: coarse)').matches;
    $app.innerHTML = `
      <section class="sky">
        <div class="hero">
          <div class="cosmos" id="hero-cosmos"></div>
          <div class="hero-readout" aria-hidden="true">papers <b>${D.meta.count.toLocaleString()}</b><br>this week <b>${week.toLocaleString()}</b><br>window <b>${D.meta.days} d</b><br>fields <b>${Object.keys(sc).length}</b><br>figures <b>${Object.keys(QA.demos).length}</b><br>last obs. <b>${new Date(D.meta.updated).toISOString().slice(11, 16)} UTC</b></div>
          <div class="hero-copy"><div class="wrap">
            <span class="mono">arXiv quant-ph + 8 categories · observed daily</span>
            <h1>The newest quantum physics, observed daily.</h1>
            <p class="lede">Every point of light is a paper from the last ${D.meta.days} days, placed among its field and lit in that field's own spectral colour. ${touch ? 'Tap one to open it' : 'Point at one to read its title, click to open it'} in plain words, and play with the idea behind it.</p>
            <div class="row"><button class="btn primary" id="dive" type="button">observe a random paper</button><a class="btn" href="#/fields">find your field</a><a class="btn" href="#/map">open the galaxy</a></div>
          </div></div>
        </div>
        <div id="spec"></div>
      </section>
      <div class="wrap doc">
        <section class="sec" aria-label="Paper of the day">
          ${secHead('|today⟩', 'Paper of the day', 'One fresh, readable paper chosen each day, with its idea set up as a figure you can play with.')}
          <div class="potd" style="--c:${ps.color}">
            <div>
              <div class="meta-line"><span class="id">arXiv:${esc(potd.id)}</span><span>[${esc(potd.pc || 'quant-ph')}]</span><span>${fmtDate(potd.d)}</span></div>
              <h3>${esc(potd.t)}</h3>
              <p class="nutshell">${esc(potd.x)}</p>
              <p style="margin-top:14px">${fieldTag(potd.s)}</p>
              <div class="row" style="margin-bottom:16px">${potd.c.slice(0, 4).map(conChip).join('')}</div>
              <div class="row"><a class="btn primary" href="#/paper/${esc(potd.id)}">read it in plain words</a><button class="btn" type="button" data-fav="${esc(potd.id)}" aria-pressed="${isFav(potd.id)}">${isFav(potd.id) ? '★ saved' : '☆ save'}</button></div>
            </div>
            <div id="potd-fig"></div>
          </div>
        </section>
        ${fringe()}
        <section class="sec" aria-label="Trending ideas">
          ${secHead('⟨trending|', D.meta.trendMode === 'rising' ? 'Rising this week' : 'What people are writing about', 'The ideas in the most papers over the last seven days, drawn as an intensity profile. Click one to filter the list below.')}
          <div class="profile">${trend.map((t) => `<button class="peak" type="button" data-concept="${esc(t.id)}" aria-pressed="${F.concept === t.id}"><span>${esc(conName(t.id))}${D.meta.trendMode === 'rising' && t.score >= 1.4 ? ' <span class="mono" style="color:var(--h-alpha)">↑</span>' : ''}</span><span class="bar" style="--w:${((100 * t.week) / maxT).toFixed(1)}%"></span><span class="n">${t.week}</span></button>`).join('')}</div>
        </section>
        ${fringe()}
        <section class="sec" aria-label="All recent papers" id="feed-section">
          ${secHead('|papers⟩', 'Table of contents', '', '<span id="count" class="mono" aria-live="polite"></span>')}
          <div class="toolbar">
            <label class="sr-only" for="q">Search papers</label>
            <input id="q" type="search" placeholder="search titles, ideas or authors — try “black hole”, “laser”, “error correction”" value="${esc(F.q)}">
            <div class="filters" role="group" aria-label="Filter by field">
              <button class="chip" type="button" data-sub="" aria-pressed="${!F.sub}">all fields</button>
              ${D.concepts.subfields.slice().sort((a, b) => a.nm - b.nm).filter((s) => sc[s.id]).map((s) => `<button class="chip" type="button" data-sub="${s.id}" aria-pressed="${F.sub === s.id}" style="--c:${s.color}"><span class="line"></span>${esc(s.name.toLowerCase())} <span class="n">${sc[s.id]}</span></button>`).join('')}
            </div>
            <div class="row">
              <label>window <select id="when"><option value="1">last day</option><option value="3">last 3 days</option><option value="7">last week</option><option value="30">last month</option><option value="999">everything</option></select></label>
              <label>order <select id="sort"><option value="new">newest first</option><option value="gentle">easiest to read</option><option value="cited">most cited</option><option value="random">shuffled</option></select></label>
              <span class="spacer"></span><a class="btn small" id="as-cons" href="#/map">draw as a constellation</a><button class="btn small" id="surprise" type="button">show me something different</button>
            </div>
          </div>
          <div id="feed"></div>
          <div class="row" style="justify-content:center;margin-top:24px"><button class="btn" id="more" type="button">more entries</button></div>
        </section>
      </div>`;
    const $q = $app.querySelector('#q'), $when = $app.querySelector('#when'), $sort = $app.querySelector('#sort');
    $when.value = F.when; $sort.value = F.sort;
    let shuffled = null, hero = null;
    const filterFn = (p) => days(p.d) <= +F.when && (!F.sub || p.s === F.sub || (p.s2 || []).includes(F.sub)) && (!F.concept || p.c.includes(F.concept));
    const draw = () => {
      const q = F.q.trim().toLowerCase();
      let list = D.index.filter(filterFn);
      if (q) {
        const terms = q.split(/\s+/);
        list = list.filter((p) => { const hay = (p.t + ' ' + p.x + ' ' + p.a.join(' ') + ' ' + p.c.map(conName).join(' ') + ' ' + sub(p.s).name + ' ' + p.id).toLowerCase(); return terms.every((t) => hay.includes(t)); });
      }
      if (F.sort === 'gentle') list = list.slice().sort((a, b) => a.l - b.l || b.d.localeCompare(a.d));
      if (F.sort === 'cited') list = list.slice().sort((a, b) => (b.k || 0) - (a.k || 0) || b.d.localeCompare(a.d));
      if (F.sort === 'random') { shuffled = shuffled || shuffle(list.slice()); const set = new Set(list); list = shuffled.filter((p) => set.has(p)); }
      const feed = $app.querySelector('#feed');
      feed.innerHTML = list.length ? toc(list.slice(0, F.shown)) : `<p class="empty">No entries match. Try fewer words or a wider window.</p>`;
      $app.querySelector('#as-cons').hidden = !F.q.trim();
      $app.querySelector('#as-cons').href = '#/map?q=' + encodeURIComponent(F.q.trim()) + (F.sub ? '&sub=' + F.sub : '');
      $app.querySelector('#count').textContent = plural(list.length, 'entry').replace('entrys', 'entries') + (F.concept ? ` · ${conName(F.concept)}` : '');
      $app.querySelector('#more').hidden = list.length <= F.shown;
      wireFavs(feed);
      $app.querySelectorAll('[data-sub]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.sub === F.sub));
      if (hero) { const ids = new Set(list.map((p) => p.id)); hero.setFilter((p) => ids.has(p.id)); }
    };
    const spec = spectrum($app.querySelector('#spec'), { active: F.sub, onPick: (id) => { F.sub = id; F.shown = 30; draw(); if (hero) { if (id) hero.focusArea(id); else hero.flyHome(); } } });
    $q.addEventListener('input', () => { F.q = $q.value; F.shown = 30; draw(); });
    $when.addEventListener('change', () => { F.when = $when.value; F.shown = 30; draw(); });
    $sort.addEventListener('change', () => { F.sort = $sort.value; shuffled = null; draw(); });
    $app.querySelectorAll('.filters [data-sub]').forEach((b) => b.addEventListener('click', () => { F.sub = b.dataset.sub; F.shown = 30; spec.set(F.sub); draw(); }));
    $app.querySelectorAll('[data-concept]').forEach((b) => b.addEventListener('click', () => {
      F.concept = F.concept === b.dataset.concept ? '' : b.dataset.concept; F.shown = 30;
      $app.querySelectorAll('[data-concept]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.concept === F.concept));
      draw();
      $app.querySelector('#feed-section').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' });
    }));
    $app.querySelector('#more').addEventListener('click', () => { F.shown += 30; draw(); });
    $app.querySelector('#surprise').addEventListener('click', () => { location.hash = '#/paper/' + pickSurprise().id; });
    mountDemo($app.querySelector('#potd-fig'), potd.m);
    wireFavs($app.querySelector('.potd'));
    draw();
    $app.querySelector('#dive').addEventListener('click', () => diveTo(hero, pickSurprise().id));
    hero = await galaxy($app.querySelector('#hero-cosmos'), { mode: 'hero', intro: true, areaLabels: false, onSelect: (sel) => sel && sel.paper && diveTo(hero, sel.paper.id), onArea: (id) => { location.hash = '#/fields/' + id; } });
    if (hero) draw();
  }

  /* ---------------- ⟨paper| ---------------- */
  const EDGE_WHY = [[1, 'shared ideas'], [2, 'same author'], [4, 'citation'], [8, 'shared references']];
  async function viewPaper(id) {
    setNav('');
    const p = D.byId.get(id);
    if (!p) {
      $app.innerHTML = `<div class="wrap page col">${QA.glyph('hep', 64)}<h1 style="margin-top:16px">This paper has left the window</h1><p>It is probably older than ${D.meta.days} days. You can still read it on <a href="https://arxiv.org/abs/${esc(id)}">arXiv:${esc(id)}</a>.</p><p><a class="btn" href="#/">back to the table of contents</a></p></div>`;
      return;
    }
    noteView(p);
    $app.innerHTML = '<div class="loading">collapsing the wavefunction…</div>';
    const [d] = await Promise.all([loadPaper(id), loadGraph()]);
    const s = d.summary, ai = d.ai, sf = sub(p.s);
    const dc = d.demoConcept ? con(d.demoConcept) : null;
    const authors = d.authors.join(', ') + (d.nauthors > d.authors.length ? ` and ${d.nauthors - d.authors.length} more` : '');
    const i = D.pos.get(id);
    const rel = D.graph.edges.filter((e) => e[0] === i || e[1] === i).map((e) => ({ j: e[0] === i ? e[1] : e[0], w: e[2], t: e[3] })).sort((a, b) => b.w - a.w).slice(0, 8);
    const bib = `@misc{${id.replace(/[^\w]/g, '')},\n  title = {${d.title}},\n  author = {${d.authors.join(' and ')}${d.nauthors > d.authors.length ? ' and others' : ''}},\n  year = {${d.published.slice(0, 4)}},\n  eprint = {${id}},\n  archivePrefix = {arXiv},\n  primaryClass = {${d.primary}},\n  doi = {${d.doi}}\n}`;
    $app.innerHTML = `
      <div class="wrap">
        <header class="paper-head" style="--c:${sf.color}">
          <div class="meta-line"><a href="#/">← contents</a><span class="id">arXiv:${esc(id)}</span><span>[${esc(d.primary)}]</span><span>submitted ${fmtDate(d.published)}</span>${fieldTag(p.s)}</div>
          <h1>${esc(d.title)}</h1>
          <p class="authors">${esc(authors)}</p>
          <div class="links">
            <a class="btn primary" href="https://arxiv.org/abs/${esc(id)}" target="_blank" rel="noopener">arXiv abstract ↗</a>
            <a class="btn" href="https://arxiv.org/pdf/${esc(id)}" target="_blank" rel="noopener">PDF ↗</a>
            <a class="btn" href="https://doi.org/${esc(d.doi)}" target="_blank" rel="noopener">doi:${esc(d.doi)} ↗</a>
            <a class="btn" href="https://www.semanticscholar.org/arxiv/${esc(id)}" target="_blank" rel="noopener">citations ↗</a>
            <button class="btn" type="button" data-fav="${esc(id)}" aria-pressed="${isFav(id)}">${isFav(id) ? '★ saved' : '☆ save'}</button>
            <button class="btn" type="button" id="cite">copy BibTeX</button>
            <a class="btn" href="#/map?focus=${esc(id)}">locate in the galaxy</a>
          </div>
          ${d.journal ? `<p class="mono" style="margin-top:14px">published in ${esc(d.journal)}</p>` : ''}
        </header>
        <div class="two" style="padding:32px 0 80px">
          <div class="stack">
            <div class="tabs" role="tablist" ${ai ? '' : 'hidden'}>
              <button class="chip" role="tab" type="button" data-tab="rule" aria-pressed="${!ai}">extracted summary</button>
              <button class="chip" role="tab" type="button" data-tab="ai" aria-pressed="${!!ai}">AI plain words</button>
            </div>
            <div data-pane="rule" class="stack" ${ai ? 'hidden' : ''} style="--c:${sf.color}">
              <div><span class="label">⟨in a nutshell|</span><p class="nutshell">${esc(s.tldr)}</p></div>
              <p style="margin:0">${esc(s.lead)} <span class="mono">(${levelText(s.level)})</span></p>
              ${s.context ? `<div><span class="label">the big picture</span><p style="margin:0">${esc(s.context)}</p></div>` : ''}
              <div><span class="label">main claims</span><ol class="claims">${s.claims.map((c) => `<li>${esc(c)}</li>`).join('')}</ol></div>
              ${s.impact ? `<div><span class="label">why it matters</span><p style="margin:0">${esc(s.impact)}</p></div>` : ''}
              <p class="note">Extracted automatically from the authors' own abstract: the sentences where they state results. Some jargon remains; the ideas below are explained in plain words.</p>
            </div>
            ${ai ? `<div data-pane="ai" class="stack" style="--c:${sf.color}">
              <div><span class="label">⟨in a nutshell|</span><p class="nutshell">${esc(ai.tldr)}</p></div>
              <p style="margin:0">${esc(ai.plain)}</p>
              <div><span class="label">main claims</span><ol class="claims">${(ai.claims || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ol></div>
              ${ai.why ? `<div><span class="label">why it matters</span><p style="margin:0">${esc(ai.why)}</p></div>` : ''}
              <p class="note">Written by an AI model (${esc(ai.model || 'Claude')}) from the abstract only. It can make mistakes; check the paper for anything important.</p>
            </div>` : ''}
            <details class="abstract"><summary>original abstract</summary><p>${esc(d.abstract)}</p>${d.comment ? `<p class="mono">comments: ${esc(d.comment)}</p>` : ''}<p class="mono">subjects: ${d.cats.map(esc).join(' · ')}</p></details>
            <div><span class="label">ideas in this paper</span>
            <div class="concept-list">${p.c.map((cid) => { const c = con(cid); if (!c) return ''; return `<div class="concept-item"><b><a href="#/learn/${esc(cid)}">${esc(c.name)}</a></b><span>${esc(c.plain)}</span></div>`; }).join('') || '<p class="muted">No tagged ideas yet.</p>'}</div></div>
          </div>
          <div class="stack sticky">
            <div id="demo-slot"></div>
            <div><span class="label">connected papers</span>
            <div class="related">${rel.map((r) => { const q = D.index[r.j]; const why = EDGE_WHY.filter(([b]) => r.t & b).map(([, t]) => t).join(' · '); return `<a href="#/paper/${esc(q.id)}"><small>arXiv:${esc(q.id)} · ${esc(why)}${r.t & 1 ? ': ' + q.c.filter((c) => p.c.includes(c)).slice(0, 2).map(conName).join(', ').toLowerCase() : ''}</small><b>${esc(q.t)}</b></a>`; }).join('') || '<p class="muted">No close links yet. Connections appear as more papers arrive.</p>'}</div></div>
          </div>
        </div>
      </div>`;
    const intro = dc ? `This paper is about <b>${esc(dc.name.toLowerCase())}</b>. ${esc(dc.plain)}` : `A core idea from ${esc(sf.name.toLowerCase())}.`;
    mountDemo($app.querySelector('#demo-slot'), p.m, intro);
    wireFavs($app);
    $app.querySelector('#cite').addEventListener('click', async () => { try { await navigator.clipboard.writeText(bib); toast('BibTeX copied'); } catch (e) { prompt('Copy this citation:', bib); } });
    $app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      $app.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      $app.querySelectorAll('[data-pane]').forEach((x) => { x.hidden = x.dataset.pane !== b.dataset.tab; });
    }));
    document.title = d.title + ' · Quantum Atlas';
  }

  /* ---------------- |galaxy⟩ ---------------- */
  async function viewMap(params) {
    setNav('map');
    await loadGraph();
    if (!webgl || params.get('flat') === '1') return viewFlatMap(params);
    const st = { sub: params.get('sub') || '', days: 45, ideas: params.has('concept'), q: params.get('q') || '' };
    $app.innerHTML = `<section class="map-page sky">
      <div class="cosmos" id="map-cosmos"></div>
      <div class="map-ui panel" id="map-ui">
        <div class="row map-collapse-row"><span class="mono" id="map-sum">|galaxy⟩ · ${D.meta.count.toLocaleString()} papers</span><span class="spacer"></span><button class="btn small map-collapse" type="button" id="ui-toggle" aria-expanded="true">hide</button></div>
        <h1>The galaxy</h1>
        <p class="mono" style="margin:0">drag to orbit · scroll or pinch to zoom · click a point. Lines join papers that share ideas, authors or references.</p>
        <form class="cons-search" id="cons-form" role="search">
          <label class="label" for="cons-q" style="margin:0">⟨search| draws a constellation</label>
          <div class="cons-row"><input id="cons-q" type="search" placeholder="e.g. black hole, Majorana, Lukin" value="${esc(st.q)}" autocomplete="off" spellcheck="false"><button class="btn small" type="submit">draw</button></div>
          <div class="cons-try mono">try: ${['entanglement entropy', 'surface code', 'Rydberg', 'gravitational waves', 'Floquet'].map((t) => `<button type="button" class="link" data-try="${t}">${t}</button>`).join(' · ')}</div>
          <div id="cons-out" aria-live="polite"></div>
        </form>
        <div class="filters" role="group" aria-label="Filter by field">
          <button class="chip" type="button" data-msub="">all fields</button>
          ${D.concepts.subfields.slice().sort((a, b) => a.nm - b.nm).map((s) => `<button class="chip" type="button" data-msub="${s.id}" style="--c:${s.color}"><span class="line"></span>${esc(s.name.toLowerCase())}</button>`).join('')}
        </div>
        <label class="mono" style="display:grid;gap:2px">window: last <output id="d-out">45 days</output><input type="range" id="d-in" min="1" max="45" value="45"></label>
        <div class="row"><button class="chip" type="button" id="ideas-btn" aria-pressed="${st.ideas}">show idea names</button><a class="chip" href="#/map?flat=1">flat view</a></div>
        <span class="label" style="margin:4px 0 0">clusters of related papers</span>
        <div class="clusters" id="clusters"></div>
      </div>
      <div class="map-panel panel" hidden aria-live="polite"></div>
      <div class="map-zoom"><button type="button" data-z="in" aria-label="Zoom in">+</button><button type="button" data-z="out" aria-label="Zoom out">−</button><button type="button" data-z="home" aria-label="Show the whole galaxy">⊙</button></div>
    </section>`;
    const panel = $app.querySelector('.map-panel');
    const ui = $app.querySelector('#map-ui');
    const toggle = $app.querySelector('#ui-toggle');
    let g = null;
    const syncInset = () => { if (g) g.setInset(ui.classList.contains('closed') ? 0 : ui.getBoundingClientRect().right); };
    const closeUI = () => { ui.classList.add('closed'); toggle.textContent = 'filters'; toggle.setAttribute('aria-expanded', 'false'); syncInset(); };
    if (innerWidth < 900) closeUI();
    toggle.addEventListener('click', () => { const c = ui.classList.toggle('closed'); toggle.textContent = c ? 'filters' : 'hide'; toggle.setAttribute('aria-expanded', !c); syncInset(); });
    function wire() {
      panel.querySelector('[data-close]').addEventListener('click', () => { panel.hidden = true; if (g) g.select(null); });
      panel.querySelectorAll('[data-goto]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); const p = D.byId.get(a.dataset.goto); if (g) g.focusPaper(p.id); showPaper(p); }));
      wireFavs(panel);
    }
    function showPaper(p) {
      const i = D.pos.get(p.id), s = sub(p.s);
      const nb = D.graph.edges.filter((e) => e[0] === i || e[1] === i).sort((a, b) => b[2] - a[2]).slice(0, 6).map((e) => D.index[e[0] === i ? e[1] : e[0]]);
      panel.hidden = false;
      panel.style.setProperty('--c', s.color);
      panel.innerHTML = `<div class="row"><span class="mono">arXiv:${esc(p.id)} · ${esc(s.line)} ${s.nm} nm</span><span class="spacer"></span>${favBtn(p.id)}<button class="btn small" type="button" data-close aria-label="Close">close</button></div>
        <h3 style="font-weight:500;font-size:1.35rem;line-height:1.2;margin:10px 0 6px">${esc(p.t)}</h3>
        <p class="mono" style="margin:0">${esc(p.a.join(', '))}${p.na > 3 ? ' et al.' : ''} · ${fmtDate(p.d)}</p>
        <p>${esc(p.x)}</p>
        <div class="row">${p.c.slice(0, 5).map(conChip).join('')}</div>
        <div class="row" style="margin:14px 0"><a class="btn primary small" href="#/paper/${esc(p.id)}">open the paper</a><a class="btn small" href="https://arxiv.org/abs/${esc(p.id)}" target="_blank" rel="noopener">arXiv ↗</a></div>
        ${nb.length ? `<span class="label">connected papers</span><div class="related">${nb.map((q) => `<a href="#" data-goto="${q.id}"><small>${esc(sub(q.s).name)}</small><b>${esc(q.t)}</b></a>`).join('')}</div>` : ''}`;
      wire();
    }
    function showConcept(cid) {
      const c = con(cid) || { name: cid, plain: '' };
      const ps = D.index.filter((p) => p.c.includes(cid));
      panel.hidden = false;
      panel.style.setProperty('--c', sub(c.subfield).color);
      panel.innerHTML = `<div class="row"><span class="mono">idea · ${ps.length} papers</span><span class="spacer"></span><button class="btn small" type="button" data-close aria-label="Close">close</button></div>
        <h3 style="font-weight:500;font-size:1.6rem;margin:8px 0">${esc(c.name)}</h3>
        <p>${esc(c.plain)}</p>
        <div class="row" style="margin-bottom:14px"><a class="btn small primary" href="#/learn/${esc(cid)}">learn it</a>${c.demo ? `<a class="btn small" href="#/play/${c.demo}">open its figure</a>` : ''}</div>
        <span class="label">recent papers</span><div class="related">${ps.slice(0, 6).map((p) => `<a href="#" data-goto="${p.id}"><small>arXiv:${esc(p.id)} · ${ago(p.d)}</small><b>${esc(p.t)}</b></a>`).join('')}</div>`;
      wire();
    }
    let cons = null;
    const matchQ = (p, terms) => { const hay = (p.t + ' ' + p.x + ' ' + p.a.join(' ') + ' ' + p.c.map(conName).join(' ') + ' ' + sub(p.s).name + ' ' + p.id).toLowerCase(); return terms.every((t) => hay.includes(t)); };
    const baseFn = (p) => days(p.d) <= st.days && (!st.sub || p.s === st.sub || (p.s2 || []).includes(st.sub));
    const drawCons = (fly) => {
      const out = $app.querySelector('#cons-out');
      const terms = st.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const hits = terms.length ? D.index.filter((p) => baseFn(p) && matchQ(p, terms)) : [];
      if (!g) return hits;
      const sum = $app.querySelector('#map-sum');
      if (!terms.length) { g.setConstellation([]); out.innerHTML = ''; cons = null; sum.textContent = `|galaxy⟩ · ${D.meta.count.toLocaleString()} papers`; return hits; }
      cons = g.setConstellation(hits.map((p) => p.id), { fly });
      sum.textContent = `⟨${st.q.trim()}| ${hits.length} stars · ${cons.links} links`;
      if (!hits.length) { out.innerHTML = `<p class="mono cons-none">no papers match “${esc(st.q)}”${st.sub || st.days < 45 ? ' with these filters' : ''}</p>`; return hits; }
      const tl = Object.entries(cons.types).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(' · ');
      const hubs = cons.hubs.map((id) => D.byId.get(id));
      out.innerHTML = `<div class="cons-stats"><span><b>${hits.length}</b> stars</span><span><b>${cons.links}</b> links</span><span><b>${cons.groups}</b> ${cons.groups === 1 ? 'figure' : 'figures'}</span></div>
        <p class="mono" style="margin:4px 0 0">${tl ? `solid lines: shared ${esc(tl)}` : 'no direct links between these papers yet'}${cons.joins ? `<br>dotted lines: nearest match between separate figures, not a link` : ''}</p>
        <span class="label" style="margin:10px 0 4px">brightest stars</span>
        <div class="cons-list">${hubs.map((p) => `<button type="button" data-cons="${esc(p.id)}" style="--c:${sub(p.s).color}"><span class="line"></span>${esc(p.t)}</button>`).join('')}</div>
        <div class="row" style="margin-top:8px"><button type="button" class="chip" id="cons-clear">clear</button><a class="chip" href="#/?q=${encodeURIComponent(st.q)}">read as a list</a></div>`;
      out.querySelectorAll('[data-cons]').forEach((b) => b.addEventListener('click', () => { const p = D.byId.get(b.dataset.cons); g.focusPaper(p.id); showPaper(p); if (innerWidth < 900) closeUI(); }));
      out.querySelector('#cons-clear').addEventListener('click', () => { st.q = ''; $app.querySelector('#cons-q').value = ''; history.replaceState(null, '', '#/map'); apply(); g.flyHome(); });
      return hits;
    };
    const form = $app.querySelector('#cons-form'), qIn = $app.querySelector('#cons-q');
    const runQ = () => { st.q = qIn.value; const u = new URLSearchParams(); if (st.q) u.set('q', st.q); if (st.sub) u.set('sub', st.sub); history.replaceState(null, '', '#/map' + (u.toString() ? '?' + u : '')); panel.hidden = true; if (g) g.select(null); apply(true); };
    form.addEventListener('submit', (e) => { e.preventDefault(); qIn.blur(); runQ(); if (innerWidth < 900 && st.q) closeUI(); });
    $app.querySelectorAll('[data-try]').forEach((b) => b.addEventListener('click', () => { qIn.value = b.dataset.try; runQ(); }));
    const apply = (fly) => {
      $app.querySelectorAll('[data-msub]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.msub === st.sub));
      const hits = drawCons(fly === true);
      const hitSet = st.q.trim() ? new Set(hits.map((p) => p.id)) : null;
      const fn = hitSet ? (p) => hitSet.has(p.id) : baseFn;
      if (g) g.setFilter(fn);
      const counts = {};
      for (const p of D.index) if (fn(p) && p.g >= 0) counts[p.g] = (counts[p.g] || 0) + 1;
      $app.querySelector('#clusters').innerHTML = Object.entries(counts).filter(([, k]) => k >= 3).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([cl, k]) => {
        const info = D.graph.clusters[cl];
        return `<button class="cluster" type="button" data-cl="${cl}" style="--c:${sub(info.subfield).color}"><span class="line"></span> ${info.concepts.map(conName).join(' · ')} <span class="mono">(${k})</span></button>`;
      }).join('') || '<p class="mono">no clusters in this window</p>';
      $app.querySelectorAll('[data-cl]').forEach((b) => b.addEventListener('click', () => { if (g) g.focusCluster(+b.dataset.cl); if (innerWidth < 900) closeUI(); }));
    };
    $app.querySelectorAll('[data-msub]').forEach((b) => b.addEventListener('click', () => { st.sub = b.dataset.msub; if (st.q.trim()) { apply(true); return; } apply(); if (g) { if (st.sub) g.focusArea(st.sub); else g.flyHome(); } }));
    const dIn = $app.querySelector('#d-in');
    dIn.addEventListener('input', () => { st.days = +dIn.value; $app.querySelector('#d-out').textContent = st.days === 1 ? '1 day' : st.days + ' days'; apply(); });
    $app.querySelector('#ideas-btn').addEventListener('click', (e) => { st.ideas = !st.ideas; e.currentTarget.setAttribute('aria-pressed', st.ideas); if (g) g.setIdeas(st.ideas); });
    $app.querySelectorAll('[data-z]').forEach((b) => b.addEventListener('click', () => { if (!g) return; if (b.dataset.z === 'home') g.flyHome(); else g.zoom(b.dataset.z === 'in' ? 0.7 : 1.4); }));
    apply();
    g = await galaxy($app.querySelector('#map-cosmos'), {
      mode: 'map', intro: !params.get('focus') && !params.get('concept'),
      onSelect: (sel) => { if (!sel) { panel.hidden = true; return; } tip.hidden = true; if (sel.paper) { g.focusPaper(sel.paper.id); showPaper(sel.paper); } else if (sel.concept) { g.focusConcept(sel.concept); showConcept(sel.concept); } },
      onArea: (id) => { st.sub = id; apply(); g.focusArea(id); },
    });
    if (!g) { if ($app.querySelector('#map-cosmos')) viewFlatMap(params); return; }
    syncInset();
    apply(!!st.q);
    if (st.ideas) g.setIdeas(true);
    const focus = params.get('focus'), concept = params.get('concept');
    if (focus && D.byId.get(focus)) setTimeout(() => { g.focusPaper(focus); showPaper(D.byId.get(focus)); }, 300);
    if (concept) setTimeout(() => { g.focusConcept(concept); showConcept(concept); }, 300);
    if (st.sub && !st.q) setTimeout(() => g.focusArea(st.sub), 300);
  }
  function viewFlatMap(params) {
    $app.innerHTML = `<div class="wrap page doc">${secHead('|galaxy⟩', 'The flat map', `Every dot is a paper; lines join papers that share ideas, authors or references.${webgl ? ' <a href="#/map">Back to the 3D galaxy</a>.' : ''}`, '', 'h1')}<div id="map-root"></div></div>`;
    cleanup.push(QA.mountMap($app.querySelector('#map-root'), {
      index: D.index, graph: D.graph, concepts: D.concepts, sub, conName, focus: params.get('focus'), concept: params.get('concept'), subFilter: params.get('sub') || '', esc, ago,
    }));
  }

  /* ---------------- |fields⟩ ---------------- */
  const QUIZ = [
    { q: 'What sounds like the most fun way to spend a day?', a: [
      ['Aligning lasers in a dark lab until something glows', ['atoms', 'optics', 'sensing']],
      ['Writing code that simulates a strange material', ['simulation', 'condensed', 'qml']],
      ['Proving a theorem on a whiteboard', ['information', 'computing', 'foundations']],
      ['Wiring a tiny chip that has to work at −273 °C', ['hardware', 'error-correction']]] },
    { q: 'Which question keeps you up at night?', a: [
      ['What happens to information inside a black hole?', ['hep']],
      ['Can we build a computer that never makes mistakes?', ['error-correction', 'computing']],
      ['What does measurement really mean?', ['foundations', 'open-systems']],
      ['Why do some materials conduct with zero resistance?', ['condensed']]] },
    { q: 'You would most like your work to…', a: [
      ['Make communication impossible to hack', ['communication']],
      ['Measure things more precisely than ever', ['sensing', 'atoms']],
      ['Help design new drugs or materials', ['simulation', 'condensed']],
      ['Change how we understand the universe', ['hep', 'foundations']]] },
    { q: 'Pick a tool:', a: [
      ['A pencil and a lot of paper', ['information', 'hep', 'foundations']],
      ['A big computer cluster', ['simulation', 'qml', 'condensed']],
      ['An optical table full of mirrors', ['optics', 'communication', 'atoms']],
      ['A dilution fridge and microwave electronics', ['hardware']]] },
    { q: 'How do you feel about lots of maths?', a: [
      ['Love it, the more abstract the better', ['hep', 'information', 'foundations']],
      ['Happy if it explains an experiment', ['open-systems', 'atoms', 'sensing']],
      ['I prefer algorithms and code', ['computing', 'qml', 'simulation']],
      ['I like it practical and hands-on', ['hardware', 'optics', 'error-correction']]] },
  ];
  async function viewFields() {
    setNav('fields');
    const sc = D.meta.subfieldCounts, total = D.index.length, maxC = Math.max(...Object.values(sc));
    const interest = {};
    for (const s of D.concepts.subfields) interest[s.id] = S.views[s.id] || 0;
    if (S.quiz) for (const [k, v] of Object.entries(S.quiz)) interest[k] = (interest[k] || 0) + v * 2;
    const maxI = Math.max(1, ...Object.values(interest));
    const ranked = D.concepts.subfields.slice().sort((a, b) => interest[b.id] - interest[a.id]);
    const untouched = D.concepts.subfields.filter((s) => !S.views[s.id] && sc[s.id]);
    const topConcepts = (sid) => { const c = {}; for (const p of D.index) if (p.s === sid && days(p.d) <= 14) for (const x of p.c.slice(0, 4)) c[x] = (c[x] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k); };
    const byNm = D.concepts.subfields.slice().sort((a, b) => a.nm - b.nm);
    $app.innerHTML = `
      <section class="sky">
        <div class="fields-hero"><div class="cosmos" id="f-cosmos"></div>
          <div class="copy"><div class="wrap"><span class="mono">|fields⟩ · a compass for choosing a PhD</span><h1 style="margin-top:8px">Find your field</h1><p class="muted" style="max-width:56ch;margin:6px 0 0">Fourteen regions of quantum physics, each lit by its own emission line. Point at a line or a row below and the galaxy turns to show where that field lives.</p></div></div>
        </div>
        <div id="spec"></div>
      </section>
      <div class="wrap doc" style="padding-bottom:80px">
        <section class="sec">
          ${secHead('|you⟩', 'Where might you fit?', 'Five quick questions, and a compass that fills in as you read and save papers. All of it stays in this browser.')}
          <div class="two">
            <form id="quiz" class="quiz box">${QUIZ.map((q, qi) => `<fieldset><legend>${qi + 1}. ${esc(q.q)}</legend><div class="opts">${q.a.map((a, ai) => `<label><input type="radio" name="q${qi}" value="${ai}" required><span>${esc(a[0])}</span></label>`).join('')}</div></fieldset>`).join('')}
              <button class="btn primary" type="submit">point my compass</button><div id="quiz-out" aria-live="polite"></div></form>
            <div class="box compass sticky"><span class="label">your compass</span>
              ${Object.values(interest).some((v) => v) ? ranked.map((s) => `<div class="item" style="--c:${s.color}">${QA.glyph(s.id, 22)}<div><small>${esc(s.name)}</small><div class="bar"><i style="width:${(100 * interest[s.id]) / maxI}%"></i></div></div><small class="mono">${interest[s.id]}</small></div>`).join('') : '<p class="muted">Empty for now. Read and save a few papers, or take the quiz, and this fills in.</p>'}
              ${untouched.length ? `<p style="margin-top:14px"><span class="label">not explored yet</span>${untouched.slice(0, 5).map((s) => `<a href="#/fields/${s.id}">${esc(s.name)}</a>`).join(' · ')}</p>` : ''}
              <button class="btn" type="button" id="surprise2">show me something different</button>
            </div>
          </div>
        </section>
        ${fringe()}
        <section class="sec">
          ${secHead('⟨fields|', 'The fourteen regions', 'Ordered by wavelength. How busy each one is right now, and what a PhD there tends to look like.')}
          <div class="field-table">${byNm.map((s) => `<a class="field-row" style="--c:${s.color}" href="#/fields/${s.id}" data-area="${s.id}">
            ${QA.glyph(s.id, 30)}
            <span class="wl"><span class="line"></span>${esc(s.line)}<br>${s.nm} nm</span>
            <span><h3>${esc(s.name)}</h3><p>${esc(s.plain)}</p></span>
            <span class="phd"><span class="label" style="margin:0">PhD life</span>${esc(s.phd)}</span>
            <span class="count">${plural(sc[s.id] || 0, 'paper')} · ${Math.round((100 * (sc[s.id] || 0)) / total)}%<span class="bar"><i style="width:${(100 * (sc[s.id] || 0)) / maxC}%"></i></span>${topConcepts(s.id).map(conName).join(', ').toLowerCase()}</span>
          </a>`).join('')}</div>
        </section>
      </div>`;
    $app.querySelector('#surprise2').addEventListener('click', () => { location.hash = '#/paper/' + pickSurprise().id; });
    let g = null;
    spectrum($app.querySelector('#spec'), { onPick: (id) => { if (g) { if (id) g.focusArea(id); else g.flyHome(); } } });
    const showQuiz = (scores, fly) => {
      const top = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 3);
      $app.querySelector('#quiz-out').innerHTML = `<span class="label" style="margin-top:18px">your closest fields</span><ol class="claims">${top.map(([k]) => `<li style="--c:${sub(k).color}"><a href="#/fields/${k}"><b>${esc(sub(k).name)}</b></a> ${fieldTag(k, false)}<br><small>${esc(sub(k).plain)}</small></li>`).join('')}</ol><p class="muted" style="font-size:.95rem">Just for fun. The real test: read a few papers in each and notice which ones you keep thinking about.</p>`;
      if (g && fly) { scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); g.focusArea(top[0][0]); }
    };
    $app.querySelector('#quiz').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target), scores = {};
      QUIZ.forEach((q, qi) => { const a = q.a[+fd.get('q' + qi)]; for (const s2 of a[1]) scores[s2] = (scores[s2] || 0) + 1; });
      S.quiz = scores; save(); showQuiz(scores, true);
    });
    if (S.quiz) showQuiz(S.quiz, false);
    g = await galaxy($app.querySelector('#f-cosmos'), { mode: 'hero', onSelect: (sel) => sel && sel.paper && diveTo(g, sel.paper.id), onArea: (id) => { location.hash = '#/fields/' + id; } });
    if (g) $app.querySelectorAll('[data-area]').forEach((a) => a.addEventListener('pointerenter', () => { if (scrollY < innerHeight * 1.5) g.focusArea(a.dataset.area); }));
  }
  function viewField(id) {
    setNav('fields');
    const s = sub(id);
    const list = D.index.filter((p) => p.s === id || (p.s2 || []).includes(id));
    const cc = {};
    for (const p of list) for (const c of p.c.slice(0, 5)) cc[c] = (cc[c] || 0) + 1;
    const top = Object.entries(cc).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const authors = {};
    for (const p of list) for (const a of p.a) authors[a] = (authors[a] || 0) + 1;
    const busy = Object.entries(authors).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 10);
    $app.innerHTML = `<div class="wrap doc" style="padding-bottom:80px">
      <header class="paper-head" style="--c:${s.color}">
        <div class="meta-line"><a href="#/fields">← all fields</a>${fieldTag(id, false)}<span>${esc(s.lineWhy || '')}</span><span>${plural(list.length, 'recent paper')}</span></div>
        <h1 style="display:flex;gap:16px;align-items:center">${QA.glyph(id, 48)}${esc(s.name)}</h1>
        <p class="authors" style="font-size:1.15rem;max-width:62ch">${esc(s.plain)}</p>
        <div class="links"><a class="btn primary" href="#/map?sub=${id}">locate in the galaxy</a><a class="btn" href="#/play/${s.demo}">open its figure</a></div>
      </header>
      <div class="two" style="padding-top:28px">
        <div class="stack">
          <div><span class="label">what a PhD here looks like</span><p style="margin:0">${esc(s.phd)}</p></div>
          <div><span class="label">ideas people are working on</span><div class="row" style="gap:2px 8px">${top.map(([c, n]) => `<a class="chip" href="#/learn/${c}">${esc(conName(c).toLowerCase())} <span class="n">${n}</span></a>`).join('')}</div></div>
          ${busy.length ? `<div><span class="label">busy authors this month</span><p class="muted" style="margin-top:0;font-size:.95rem">People with several new papers here. Their groups might be worth a look when you think about where to apply.</p><p>${busy.map(([a, n]) => `<a href="https://arxiv.org/search/?searchtype=author&query=${encodeURIComponent(a)}" target="_blank" rel="noopener">${esc(a)}</a> <span class="mono">(${n})</span>`).join(', ')}</p></div>` : ''}
        </div>
        <div id="demo-slot" class="sticky"></div>
      </div>
      <section class="sec">${secHead('|papers⟩', 'Recent papers in this field')}${toc(list.slice(0, 60))}</section></div>`;
    wireFavs($app);
    mountDemo($app.querySelector('#demo-slot'), s.demo);
  }

  /* ---------------- |play⟩ ---------------- */
  function viewPlay() {
    setNav('play');
    const u = {}; for (const p of D.index) u[p.m] = (u[p.m] || 0) + 1;
    $app.innerHTML = `<div class="wrap page doc">${secHead('|play⟩', 'Sixteen figures you can touch', 'Each one is a small working model of an idea. Move the sliders and watch the physics answer back. Every paper on the site points to the figure that best shows its main idea.', '', 'h1')}
      <div class="sheet-grid">${Object.values(QA.demos).map((d, i) => `<a class="plate-cell" href="#/play/${d.id}">${QA.glyph(d.id, 44)}<span class="mono">Fig. ${i + 1}</span><span><b>${esc(d.title)}</b><br><small>${esc(d.blurb || '')}</small></span><span class="mono">${plural(u[d.id] || 0, 'paper')}</span></a>`).join('')}</div></div>`;
  }
  function viewDemo(id) {
    setNav('play');
    const d = QA.demos[id];
    if (!d) { location.hash = '#/play'; return; }
    const related = D.index.filter((p) => p.m === id);
    const cons = D.concepts.concepts.filter((c) => c.demo === id);
    figN = Object.keys(QA.demos).indexOf(id);
    $app.innerHTML = `<div class="wrap page"><p class="meta-line" style="margin:0 0 18px"><a href="#/play">← all figures</a></p><div class="two"><div id="demo-slot"></div><div class="stack">
      <div><span class="label">ideas you can see here</span><div class="concept-list">${cons.map((c) => `<div class="concept-item"><b><a href="#/learn/${c.id}">${esc(c.name)}</a></b><span>${esc(c.plain)}</span></div>`).join('')}</div></div>
      <div><span class="label">papers using this idea (${related.length})</span><div class="related">${related.slice(0, 12).map((q) => `<a href="#/paper/${q.id}"><small>arXiv:${esc(q.id)} · ${esc(sub(q.s).name)}</small><b>${esc(q.t)}</b></a>`).join('') || '<p class="muted">None in the current window.</p>'}</div></div>
    </div></div></div>`;
    mountDemo($app.querySelector('#demo-slot'), id);
    document.title = d.title + ' · Quantum Atlas';
  }

  /* ---------------- |learn⟩ ---------------- */
  const PATH = ['qubit', 'superposition', 'interference', 'double-slit', 'measurement', 'entanglement', 'bell', 'decoherence', 'tunneling', 'oscillator', 'algorithms', 'qec'];
  const RESOURCES = [
    ['Quantum Country', 'https://quantum.country/', 'A free, beautifully written introduction to quantum computing that helps you remember what you read.'],
    ['IBM Quantum Learning', 'https://quantum.cloud.ibm.com/learning', 'Free courses, and you can run circuits on real quantum computers.'],
    ['The Feynman Lectures, Vol. III', 'https://www.feynmanlectures.caltech.edu/III_toc.html', "Feynman's classic quantum lectures, free online."],
    ['MIT OpenCourseWare 8.04', 'https://ocw.mit.edu/courses/8-04-quantum-physics-i-spring-2016/', 'A full university course: videos, notes and problem sets.'],
    ['PhET simulations', 'https://phet.colorado.edu/', 'More free physics simulations from the University of Colorado.'],
    ["John Preskill's notes", 'https://www.preskill.caltech.edu/ph229/', 'Classic graduate lecture notes on quantum information.'],
    ['Error Correction Zoo', 'https://errorcorrectionzoo.org/', 'A friendly catalogue of quantum error-correcting codes.'],
    ['Quantum Algorithm Zoo', 'https://quantumalgorithmzoo.org/', 'Known quantum algorithms and their speed-ups.'],
    ['Quantum (the journal)', 'https://quantum-journal.org/', 'An open-access journal where many of these papers end up.'],
    ['arXiv quant-ph', 'https://arxiv.org/list/quant-ph/new', 'The raw daily feed this site reads from.'],
  ];
  function viewLearn() {
    setNav('learn');
    const counts = D.graph ? D.graph.conceptCounts : {};
    $app.innerHTML = `<div class="wrap page doc">${secHead('|learn⟩', 'Start from zero', 'Twelve stops, in order. Each has a short explanation, a figure to play with and real papers that use the idea. No maths needed to start.', '', 'h1')}
      <div class="two"><ol class="path">${PATH.map((id) => { const c = con(id); return `<li><a href="#/learn/${id}"><span><b>${esc(c.name)}</b><small>${esc(c.plain)}</small></span>${QA.glyph(c.demo, 28)}</a></li>`; }).join('')}</ol>
      <div><span class="label">free places to go deeper</span><div style="border-top:1px solid var(--rule)">${RESOURCES.map(([n, u, t]) => `<a class="res" href="${u}" target="_blank" rel="noopener"><b>${esc(n)} ↗</b><small>${esc(t)}</small></a>`).join('')}</div></div></div>
      <section class="sec">${secHead('⟨glossary|', 'Every idea on the site', '', '<input type="search" id="gq" placeholder="find a word…" aria-label="Search the glossary" style="width:240px">')}
      <div class="glossary" id="gl"></div></section></div>`;
    const draw = (q) => {
      q = (q || '').toLowerCase();
      const list = D.concepts.concepts.filter((c) => !q || (c.name + ' ' + c.plain).toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
      $app.querySelector('#gl').innerHTML = list.map((c) => `<div class="gl"><h3><a href="#/learn/${c.id}">${esc(c.name)}</a></h3><p>${esc(c.plain)}</p>${fieldTag(c.subfield, false)} <span class="mono">· ${counts[c.id] || 0} papers</span></div>`).join('');
    };
    $app.querySelector('#gq').addEventListener('input', (e) => draw(e.target.value));
    draw('');
  }
  function viewConcept(id) {
    setNav('learn');
    const c = con(id);
    if (!c) { location.hash = '#/learn'; return; }
    const papers = D.index.filter((p) => p.c.includes(id));
    const step = PATH.indexOf(id);
    const next = step >= 0 && step < PATH.length - 1 ? con(PATH[step + 1]) : null;
    const s = sub(c.subfield);
    $app.innerHTML = `<div class="wrap doc" style="padding-bottom:80px">
      <header class="paper-head" style="--c:${s.color}">
        <div class="meta-line"><a href="#/learn">← learn</a>${fieldTag(c.subfield)}${step >= 0 ? `<span>stop ${step + 1} of ${PATH.length}</span>` : ''}</div>
        <h1>${esc(c.name)}</h1>
        <p class="nutshell" style="max-width:62ch">${esc(c.plain)}</p>
        <div class="links"><a class="btn" href="#/map?concept=${id}">locate in the galaxy</a>${c.links.map(([n, u]) => `<a class="btn" href="${u}" target="_blank" rel="noopener">${esc(n)} ↗</a>`).join('')}${next ? `<a class="btn primary" href="#/learn/${next.id}">next: ${esc(next.name.toLowerCase())}</a>` : ''}</div>
      </header>
      <div style="max-width:820px;padding-top:28px" id="demo-slot"></div>
      <section class="sec">${secHead('|papers⟩', 'Where it shows up now', plural(papers.length, 'recent paper') + ' use this idea.')}${toc(papers.slice(0, 30))}</section></div>`;
    wireFavs($app);
    mountDemo($app.querySelector('#demo-slot'), c.demo);
  }

  /* ---------------- |saved⟩ ---------------- */
  async function viewSaved() {
    setNav('saved');
    const ids = Object.keys(S.fav).sort((a, b) => (S.fav[b].at || '').localeCompare(S.fav[a].at || ''));
    const live = ids.filter((id) => D.byId.has(id));
    const gone = ids.filter((id) => !D.byId.has(id));
    $app.innerHTML = `<div class="wrap page doc">${secHead('|saved⟩', 'Your constellation', 'The papers you have starred, lit up in the galaxy. Stored only in this browser.', '', 'h1')}
      ${ids.length ? `${live.length && webgl ? '<div class="constellation"><div class="cosmos" id="s-cosmos"></div></div>' : ''}
      <div class="row" style="margin-bottom:18px"><button class="btn" id="exp" type="button">copy as text</button><button class="btn" id="expb" type="button">copy as BibTeX</button><button class="btn" id="clr" type="button">clear all</button></div>
      ${toc(live.map((id) => D.byId.get(id)))}
      ${gone.length ? `<span class="label" style="margin-top:22px">older than ${D.meta.days} days</span><div class="related">${gone.map((id) => `<a href="https://arxiv.org/abs/${esc(id)}" target="_blank" rel="noopener"><small>arXiv:${esc(id)}</small><b>${esc(S.fav[id].t)} ↗</b></a>`).join('')}</div>` : ''}`
      : `<div class="empty">${QA.glyph('hep', 56)}<p>No stars yet. Press ☆ on any paper and it will light up here.</p></div>`}</div>`;
    wireFavs($app);
    const copy = async (txt, msg) => { try { await navigator.clipboard.writeText(txt); toast(msg); } catch (e) { prompt('Copy:', txt); } };
    $app.querySelector('#exp')?.addEventListener('click', () => copy(ids.map((id) => `${S.fav[id].t}\nhttps://arxiv.org/abs/${id}`).join('\n\n'), 'list copied'));
    $app.querySelector('#expb')?.addEventListener('click', () => copy(ids.map((id) => `@misc{${id.replace(/[^\w]/g, '')},\n  title = {${S.fav[id].t}},\n  eprint = {${id}},\n  archivePrefix = {arXiv},\n  doi = {10.48550/arXiv.${id}}\n}`).join('\n\n'), 'BibTeX copied'));
    $app.querySelector('#clr')?.addEventListener('click', () => { if (confirm('Remove all saved papers from this browser?')) { S.fav = {}; save(); render(); } });
    const el = $app.querySelector('#s-cosmos');
    if (el) {
      const set = new Set(live);
      const g = await galaxy(el, { mode: 'hero', areaLabels: false, offset: false, onSelect: (sel) => sel && sel.paper && diveTo(g, sel.paper.id) });
      if (g) g.setFilter((p) => set.has(p.id));
    }
  }

  /* ---------------- about ---------------- */
  function viewAbout() {
    setNav('');
    const m = D.meta;
    const lines = D.concepts.subfields.slice().sort((a, b) => a.nm - b.nm);
    $app.innerHTML = `<div class="wrap page doc"><div class="col">${secHead('⟨about|', 'An instrument for reading new physics', '', '', 'h1')}
      <p style="font-size:1.15rem">Quantum Atlas is a free, open-source guide to the newest quantum physics research, made for curious people, students and anyone choosing a direction for a PhD. It started with one question: <i>out of everything happening in quantum physics, what excites me most?</i></p>
      <section class="sec">${secHead('|method⟩', 'How it works')}
      <ol class="claims">
        <li><b>Every day</b> a GitHub Actions job asks the <a href="https://info.arxiv.org/help/api/">arXiv API</a> for the newest papers in quant-ph, plus quantum-related papers in cond-mat, hep-th, gr-qc, physics.atom-ph and physics.optics, waiting politely between requests as arXiv asks.</li>
        <li>It tags each paper with ideas from a hand-written list of ${D.concepts.concepts.length} concepts and places it in one of ${D.concepts.subfields.length} fields.</li>
        <li>It writes an <b>extracted summary</b> by picking out the sentences where the authors state what they found. No paid AI is needed. If an API key is added, optional AI plain-language summaries appear in a labelled tab.</li>
        <li>It looks up reference lists on <a href="https://www.semanticscholar.org/product/api">Semantic Scholar</a> to find papers that cite each other or share references.</li>
        <li>It links papers that share ideas, authors or references, and groups them into clusters. In the galaxy each field is a region and each cluster a knot of points.</li>
      </ol>
      <p class="note">Right now: ${m.count.toLocaleString()} papers from the last ${m.days} days, ${m.withCitations} with reference data${m.withAI ? `, ${m.withAI} with AI summaries` : ''}.</p></section>
      <section class="sec">${secHead('|colour⟩', 'Why these colours?', 'The site uses no invented palette. Each field is drawn in the colour of a real atomic emission line, at its true wavelength.')}
      <div class="concept-list">${lines.map((s) => `<div class="concept-item" style="--c:${s.color}"><span class="tag"><span class="line" style="height:1.4em"></span>${esc(s.line)} ${s.nm} nm</span><span><b>${esc(s.name)}</b> · ${esc(s.lineWhy || '')}</span></div>`).join('')}</div>
      <p class="muted" style="font-size:.92rem">Wavelengths are converted to screen colour with a standard approximation; pure spectral colours lie outside what a screen can show, so they are close, not exact. The logo is the hydrogen Balmer series, Hδ Hγ Hβ Hα, at their true relative spacing. The fringe bands between sections are drawn from the double-slit intensity formula.</p></section>
      <section class="sec">${secHead('|caveats⟩', 'Please keep in mind')}
      <p>Summaries are automatic and can miss nuance or be wrong. Many arXiv papers are preprints that haven't been peer reviewed. Always read the original before relying on a claim. Figures show the textbook idea behind a paper, not the paper's own results.</p></section>
      <section class="sec">${secHead('|credits⟩', 'Credits')}
      <ul>
        <li>Paper data: <a href="https://arxiv.org">arXiv</a>. Thank you to arXiv for use of its open access interoperability. Abstracts belong to their authors; every page links to the original.</li>
        <li>Reference data: <a href="https://www.semanticscholar.org">Semantic Scholar</a> (Allen Institute for AI), under its API license.</li>
        <li>DOIs resolve through <a href="https://www.doi.org">doi.org</a>; arXiv DOIs are registered by <a href="https://datacite.org">DataCite</a>.</li>
        <li>3D graphics: <a href="https://threejs.org">three.js</a> (MIT License), loaded from <a href="https://www.jsdelivr.com">jsDelivr</a>.</li>
        <li>Type: <a href="https://fonts.google.com/specimen/STIX+Two+Text">STIX Two Text</a>, the typeface of scientific publishing, and <a href="https://fonts.google.com/specimen/IBM+Plex+Mono">IBM Plex Mono</a>, via Google Fonts (SIL Open Font License).</li>
        <li>Concept explanations link to <a href="https://www.wikipedia.org">Wikipedia</a> and other free resources.</li>
        <li>The figures, glyphs, galaxy, maps and site are written from scratch in plain JavaScript. Hosted free on <a href="https://pages.github.com">GitHub Pages</a>.</li>
      </ul></section>
      <section class="sec">${secHead('|privacy⟩', 'Your privacy')}<p>No accounts, no tracking, no cookies. Saved papers, your compass and quiz answers stay in your browser's local storage. The code is on <a href="https://github.com/DanielAja/quantum-atlas">GitHub</a>; ideas and fixes are welcome.</p></section></div></div>`;
  }

  /* ---------------- ⌘K search palette ---------------- */
  let palette = null;
  function openPalette(initial = '') {
    if (palette) return;
    const opener = document.activeElement;
    palette = QA.el('div', { class: 'palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search the atlas' });
    palette.innerHTML = `<div class="palette-box"><input type="text" placeholder="search papers, arXiv ids, ideas, fields, figures…" aria-label="Search" autocomplete="off" spellcheck="false"><div class="palette-results" role="listbox"></div><div class="palette-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div></div>`;
    document.body.append(palette);
    palette._opener = opener;
    const input = palette.querySelector('input'), res = palette.querySelector('.palette-results');
    let items = [], sel = 0;
    const pages = [['|explore⟩ table of contents', '#/', 'computing'], ['|galaxy⟩ the 3D map', '#/map', 'bloch'], ['|fields⟩ find your field', '#/fields', 'metrology'], ['|play⟩ all figures', '#/play', 'rabi'], ['|learn⟩ start from zero', '#/learn', 'oscillator'], ['|saved⟩ your constellation', '#/saved', 'page'], ['⟨about| method and credits', '#/about', 'foundations']];
    const mark = () => res.querySelectorAll('[data-k]').forEach((a) => { const on = +a.dataset.k === sel; a.setAttribute('aria-selected', on); if (on) a.scrollIntoView({ block: 'nearest' }); });
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const terms = q.split(/\s+/).filter(Boolean);
      const m = (s) => terms.every((t) => s.toLowerCase().includes(t));
      const groups = [];
      if (!q) groups.push(['go to', pages.map(([t, h, i]) => ({ t, h, i: QA.glyph(i, 18) }))], ['random', [{ t: 'observe a random paper', h: '#/paper/' + pickSurprise().id, i: QA.glyph('quantumwalk', 18) }]]);
      else {
        groups.push(['papers', D.index.filter((p) => m(p.id + ' ' + p.t + ' ' + p.a.join(' ') + ' ' + p.c.map(conName).join(' '))).slice(0, 7).map((p) => ({ t: p.t, h: '#/paper/' + p.id, i: `<span class="line" style="--c:${sub(p.s).color};height:1.1em"></span>` }))]);
        groups.push(['ideas', D.concepts.concepts.filter((c) => m(c.name + ' ' + c.plain)).slice(0, 4).map((c) => ({ t: c.name, h: '#/learn/' + c.id, i: QA.glyph(c.demo, 18) }))]);
        groups.push(['fields', D.concepts.subfields.filter((s) => m(s.name + ' ' + s.plain + ' ' + s.line)).slice(0, 3).map((s) => ({ t: s.name, h: '#/fields/' + s.id, i: QA.glyph(s.id, 18) }))]);
        groups.push(['figures', Object.values(QA.demos).filter((d) => m(d.title + ' ' + (d.blurb || ''))).slice(0, 3).map((d) => ({ t: d.title, h: '#/play/' + d.id, i: QA.glyph(d.id, 18) }))]);
        groups.push(['go to', pages.filter(([t]) => m(t)).map(([t, h, i]) => ({ t, h, i: QA.glyph(i, 18) }))]);
        groups.push(['galaxy', [{ t: `draw “${input.value.trim()}” as a constellation`, h: '#/map?q=' + encodeURIComponent(input.value.trim()), i: QA.glyph('bloch', 18) }]]);
      }
      items = [];
      res.innerHTML = groups.filter(([, l]) => l.length).map(([gname, l]) => `<div class="grp">${gname}</div>` + l.map((it) => { items.push(it); return `<a href="${it.h}" role="option" data-k="${items.length - 1}"><span class="ic">${it.i}</span><span class="t">${esc(it.t)}</span></a>`; }).join('')).join('') || '<p class="mono" style="padding:12px 18px">nothing in this part of the spectrum</p>';
      sel = 0; mark();
    };
    input.addEventListener('input', draw);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); mark(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); mark(); e.preventDefault(); }
      else if (e.key === 'Enter' && items[sel]) { const h = items[sel].h; closePalette(); location.hash = h; }
      else if (e.key === 'Tab') e.preventDefault();
    });
    res.addEventListener('click', (e) => { if (e.target.closest('a')) closePalette(); });
    palette.addEventListener('click', (e) => { if (e.target === palette) closePalette(); });
    input.value = initial;
    draw();
    input.focus();
  }
  function closePalette() {
    if (!palette) return;
    const o = palette._opener;
    palette.remove(); palette = null;
    if (o && o.focus) o.focus({ preventScroll: true });
  }
  document.getElementById('open-search').addEventListener('click', () => openPalette());
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName))) { e.preventDefault(); if (palette) closePalette(); else openPalette(); }
    else if (e.key === 'Escape') closePalette();
  });

  /* ---------------- router ---------------- */
  async function render() {
    cleanup.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
    cleanup = [];
    figN = 0;
    tip.hidden = true;
    if (palette) { palette.remove(); palette = null; }
    document.title = 'Quantum Atlas';
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const parts = path.split('/').map(decodeURIComponent);
    const params = new URLSearchParams(qs || '');
    document.body.dataset.route = parts[0] || 'home';
    window.scrollTo(0, 0);
    try {
      switch (parts[0]) {
        case '': await viewHome(params); break;
        case 'paper': await viewPaper(parts.slice(1).join('/')); break;
        case 'map': await viewMap(params); break;
        case 'fields': if (parts[1]) viewField(parts[1]); else await viewFields(); break;
        case 'play': if (parts[1]) viewDemo(parts[1]); else viewPlay(); break;
        case 'learn': await loadGraph().catch(() => {}); if (parts[1]) viewConcept(parts[1]); else viewLearn(); break;
        case 'saved': await viewSaved(); break;
        case 'about': viewAbout(); break;
        default: await viewHome();
      }
    } catch (e) {
      console.error(e);
      $app.innerHTML = `<div class="wrap page col">${QA.glyph('hep', 56)}<h2 style="margin-top:14px">Something went wrong</h2><p>${esc(e.message)}</p><p><a class="btn" href="#/">back to the contents</a></p></div>`;
    }
  }
  function route() {
    render();
    $app.focus({ preventScroll: true });
  }
  window.addEventListener('hashchange', route);
  loadCore().then(route).catch((e) => {
    console.error(e);
    $app.innerHTML = `<div class="wrap page col"><h2>Couldn't reach the data</h2><p>${esc(e.message)}</p><p>Try refreshing the page.</p></div>`;
  });
})();
