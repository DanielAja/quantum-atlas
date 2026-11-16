/* Quantum Atlas — single-page app (hash routes), no build step.
   The 3D galaxy lives in js/cosmos.js (ES module, loaded on demand). */
(function () {
  const QA = window.QA;
  const $app = document.getElementById('app');
  const D = { meta: null, index: [], concepts: null, graph: null, shards: {}, byId: new Map(), pos: new Map() };
  let cleanup = [];
  const reduced = () => QA.reducedMotion();

  /* ---------------- utilities ---------------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getJSON = async (url) => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };
  const days = (iso) => Math.floor((Date.now() - new Date(iso + 'T00:00:00Z').getTime()) / 864e5);
  const ago = (iso) => { const d = days(iso); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 7 ? d + ' days ago' : d < 14 ? 'last week' : Math.round(d / 7) + ' weeks ago'; };
  const hoursAgo = (iso) => { const h = Math.round((Date.now() - Date.parse(iso)) / 36e5); return h < 1 ? 'just now' : h < 24 ? h + 'h ago' : Math.round(h / 24) + 'd ago'; };
  const plural = (n, w) => n.toLocaleString() + ' ' + w + (n === 1 ? '' : 's');
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const toast = (msg) => { const t = QA.el('div', { class: 'toast', role: 'status', text: msg }); document.body.append(t); setTimeout(() => t.remove(), 2200); };
  const levelText = (l) => ['', 'Gentle read', 'Some maths', 'Heavy maths'][l] || '';
  const levelDots = (l) => '●'.repeat(l) + '○'.repeat(3 - l);
  const hashStr = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

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
  const sub = (id) => (D.concepts.subfields.find((s) => s.id === id) || { id, name: id, emoji: '•', color: '#888', plain: '', phd: '' });
  const con = (id) => D.concepts.concepts.find((c) => c.id === id);
  const conName = (id) => (con(id) || { name: id }).name;
  async function loadCore() {
    const [meta, index, concepts] = await Promise.all([getJSON('data/meta.json'), getJSON('data/index.json'), getJSON('data/concepts.json')]);
    D.meta = meta; D.index = index; D.concepts = concepts;
    index.forEach((p, i) => { D.byId.set(p.id, p); D.pos.set(p.id, i); });
    document.getElementById('updated').textContent = `Last updated ${new Date(meta.updated).toLocaleString()} · ${meta.count.toLocaleString()} papers from the last ${meta.days} days`;
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
    tip.innerHTML = `<span class="tag" style="--c:${s.color}">${esc(s.name)}</span><b>${esc(p.t)}</b><small class="muted">${ago(p.d)} · click to dive in</small>`;
    tip.hidden = false;
    tip.style.left = Math.min(x, innerWidth - 330) + 'px';
    tip.style.top = Math.min(y, innerHeight - 140) + 'px';
  }
  const diveTo = (g, id) => {
    tip.hidden = true;
    if (g && !reduced()) { g.focusPaper(id); setTimeout(() => { location.hash = '#/paper/' + id; }, 1150); }
    else location.hash = '#/paper/' + id;
  };

  /* ---------------- shared pieces ---------------- */
  const subTag = (id) => { const s = sub(id); return `<span class="tag" style="--c:${s.color}">${esc(s.name)}</span>`; };
  const conChip = (id) => `<a class="chip" href="#/learn/${esc(id)}">${esc(conName(id))}</a>`;
  const favBtn = (id) => `<button class="fav" type="button" data-fav="${esc(id)}" aria-pressed="${isFav(id)}" aria-label="Save this paper" title="Save">${isFav(id) ? '♥' : '♡'}</button>`;
  function paperCard(p) {
    const demo = QA.demos[p.m];
    return `<article class="glass pcard reveal" style="--c:${sub(p.s).color}">
      <div class="meta">${subTag(p.s)}<span>${ago(p.d)}</span>${p.k ? `<span>· cited ${p.k}×</span>` : ''}<span class="spacer"></span>${favBtn(p.id)}</div>
      <h3><a href="#/paper/${esc(p.id)}">${esc(p.t)}</a></h3>
      <p>${esc(p.x)}</p>
      <div class="meta"><span title="${levelText(p.l)}">${levelDots(p.l)} ${levelText(p.l)}</span>${demo ? `<span>· ${demo.emoji} ${esc(demo.title)}</span>` : ''}</div>
      <div class="chips">${p.c.slice(0, 4).map(conChip).join('')}</div>
    </article>`;
  }
  function wireFavs(root) {
    root.querySelectorAll('[data-fav]').forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const on = toggleFav(b.dataset.fav);
      b.setAttribute('aria-pressed', on);
      b.textContent = b.classList.contains('btn') ? (on ? '♥ Saved' : '♡ Save') : (on ? '♥' : '♡');
      toast(on ? 'Added to your constellation' : 'Removed from your constellation');
    }));
  }
  function mountDemo(parent, demoId, intro) {
    const demo = QA.demos[demoId];
    if (!demo) { parent.innerHTML = '<p class="muted">This demo is missing.</p>'; return; }
    const box = QA.el('section', { class: 'glass demo', 'aria-label': 'Interactive demo: ' + demo.title });
    box.innerHTML = `<div class="demo-head"><span class="emoji" aria-hidden="true">${demo.emoji || '🔬'}</span><div><span class="label" style="margin:0">Interactive demo</span><h3>${esc(demo.title)}</h3></div></div>
      <p style="margin:12px 0 0;color:#c9cdee">${esc(demo.blurb || '')}</p>
      ${intro ? `<p class="note">${intro}</p>` : ''}`;
    const stage = QA.el('div', { class: 'demo-stage' });
    box.append(stage);
    const after = QA.el('div');
    after.innerHTML = `${demo.explain ? `<p style="margin-top:14px">${esc(demo.explain)}</p>` : ''}
      ${demo.tryThis && demo.tryThis.length ? `<span class="label" style="margin-top:12px">Try this</span><ul class="try">${demo.tryThis.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`;
    box.append(after);
    parent.append(box);
    try { const stop = demo.mount(stage); if (stop) cleanup.push(stop); } catch (e) { console.error(e); stage.innerHTML = '<p class="muted">Sorry, this demo hit a snag.</p>'; }
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
  function reveal(root) {
    const els = root.querySelectorAll('.reveal:not(.in)');
    if (reduced() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -6% 0px' });
    els.forEach((e, i) => { e.style.transitionDelay = Math.min(i % 6, 5) * 60 + 'ms'; io.observe(e); });
    cleanup.push(() => io.disconnect());
  }

  /* ---------------- EXPLORE (home) ---------------- */
  const F = { q: '', sub: '', concept: '', when: '30', sort: 'new', shown: 24 };
  function starOfTheDay() {
    const pool = D.index.filter((p) => days(p.d) <= 4 && p.l <= 2 && p.c.length >= 2);
    const list = pool.length ? pool : D.index;
    return list[hashStr(new Date().toISOString().slice(0, 10)) % list.length];
  }
  async function viewHome() {
    setNav('');
    const week = D.index.filter((p) => days(p.d) <= 7).length;
    const sc = D.meta.subfieldCounts;
    const star = starOfTheDay();
    const trend = D.meta.trending.slice(0, 14);
    const signal = (t) => `<button class="glass signal" type="button" data-concept="${esc(t.id)}" aria-pressed="${F.concept === t.id}"><b>${esc(conName(t.id))}</b><span>${t.week} papers${D.meta.trendMode === 'rising' && t.score >= 1.4 ? ' <span class="up">▲ rising</span>' : ''}</span></button>`;
    $app.innerHTML = `
      <section class="hero" aria-label="Galaxy of recent papers">
        <div class="cosmos" id="hero-cosmos"></div>
        <div class="hero-copy"><div class="wrap">
          <div class="kicker"><span class="live"></span>Live from arXiv · updated ${hoursAgo(D.meta.updated)}</div>
          <h1>Every new idea in quantum physics, <em>as a galaxy.</em></h1>
          <p class="lede">Each star is a paper from the last ${D.meta.days} days, coloured by its field and brighter when it's fresh. ${matchMedia('(pointer: coarse)').matches ? 'Tap a star to dive in.' : 'Hover to peek, click to dive in.'} Every one comes in plain words with a hands-on demo.</p>
          <div class="row"><button class="btn primary" id="dive" type="button">✦ Dive into a random star</button><a class="btn" href="#/fields">⌖ Find your field</a><a class="btn" href="#/map">◎ Open the full galaxy</a></div>
        </div></div>
        <div class="hero-hud">
          <div class="stat"><b>${D.meta.count.toLocaleString()}</b><span>stars (papers)</span></div>
          <div class="stat"><b>${week.toLocaleString()}</b><span>born this week</span></div>
          <div class="stat"><b>${Object.keys(sc).length}</b><span>research fields</span></div>
          <div class="stat"><b>${Object.keys(QA.demos).length}</b><span>playable demos</span></div>
        </div>
        <div class="scroll-hint" aria-hidden="true">SCROLL ↓</div>
      </section>
      <div class="wrap">
        <section class="section" aria-labelledby="sotd-h">
          <div class="section-head reveal"><div><span class="kicker">✦ Star of the day</span><h2 id="sotd-h">Today's <em>signal</em></h2></div><p>One fresh, readable paper picked each day, with its idea ready to play with.</p></div>
          <article class="glass sotd reveal" style="--c:${sub(star.s).color}">
            <div class="copy">
              ${subTag(star.s)}
              <h3>${esc(star.t)}</h3>
              <p style="color:#c9cdee">${esc(star.x)}</p>
              <div class="row" style="margin:4px 0 12px">${star.c.slice(0, 4).map(conChip).join('')}</div>
              <div class="row" style="margin-top:auto"><a class="btn primary" href="#/paper/${esc(star.id)}">Read it in plain words →</a>${favBtn(star.id)}</div>
            </div>
            <div class="demo-slot" id="sotd-demo"></div>
          </article>
        </section>
        <section class="section" aria-labelledby="trend-h">
          <div class="section-head reveal"><div><span class="kicker">⟁ ${D.meta.trendMode === 'rising' ? 'Rising this week' : 'Most talked-about this week'}</span><h2 id="trend-h">What the field is <em>buzzing</em> about</h2></div><p>Tap an idea to filter the papers below.</p></div>
        </section>
      </div>
      <div class="marquee reveal"><div class="marquee-track">${trend.map(signal).join('')}${trend.map(signal).join('').replace(/<button /g, '<button tabindex="-1" aria-hidden="true" ')}</div></div>
      <div class="wrap">
        <section class="section" aria-labelledby="feed-h" id="feed-section">
          <div class="section-head reveal"><div><span class="kicker">☄ Fresh papers</span><h2 id="feed-h">The <em>newest</em> arrivals</h2></div><span class="spacer"></span><span id="count" class="mono" aria-live="polite"></span></div>
          <div class="glass toolbar">
            <label class="sr-only" for="q">Search papers</label>
            <input id="q" type="search" placeholder="Search titles, ideas or authors… try “black hole” or “laser”" value="${esc(F.q)}">
            <div class="chips-scroll" role="group" aria-label="Filter by field">
              <button class="chip" type="button" data-sub="" aria-pressed="${!F.sub}">All fields</button>
              ${D.concepts.subfields.filter((s) => sc[s.id]).map((s) => `<button class="chip" type="button" data-sub="${s.id}" aria-pressed="${F.sub === s.id}"><span class="dot" style="background:${s.color};color:${s.color}"></span>${esc(s.name)} <span class="n">${sc[s.id]}</span></button>`).join('')}
            </div>
            <div class="row">
              <label>When <select id="when"><option value="1">Last day</option><option value="3">Last 3 days</option><option value="7">Last week</option><option value="30">Last month</option><option value="999">Everything</option></select></label>
              <label>Sort <select id="sort"><option value="new">Newest first</option><option value="gentle">Easiest to read</option><option value="cited">Most cited</option><option value="random">Shuffle</option></select></label>
              <span class="spacer"></span><button class="btn small" id="surprise" type="button">🎲 Something different</button>
            </div>
          </div>
          <div id="feed" class="grid"></div>
          <div class="row" style="justify-content:center;margin-top:24px"><button class="btn" id="more" type="button">Load more stars</button></div>
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
        list = list.filter((p) => { const hay = (p.t + ' ' + p.x + ' ' + p.a.join(' ') + ' ' + p.c.map(conName).join(' ') + ' ' + sub(p.s).name).toLowerCase(); return terms.every((t) => hay.includes(t)); });
      }
      if (F.sort === 'gentle') list = list.slice().sort((a, b) => a.l - b.l || b.d.localeCompare(a.d));
      if (F.sort === 'cited') list = list.slice().sort((a, b) => (b.k || 0) - (a.k || 0) || b.d.localeCompare(a.d));
      if (F.sort === 'random') { shuffled = shuffled || shuffle(list.slice()); const set = new Set(list); list = shuffled.filter((p) => set.has(p)); }
      const feed = $app.querySelector('#feed');
      feed.innerHTML = list.slice(0, F.shown).map(paperCard).join('') || `<div class="empty">No stars match. Try fewer words or a wider time range.</div>`;
      $app.querySelector('#count').textContent = plural(list.length, 'paper') + (F.concept ? ` · ${conName(F.concept)}` : '');
      $app.querySelector('#more').hidden = list.length <= F.shown;
      wireFavs(feed); reveal(feed);
      if (hero) { const ids = new Set(list.map((p) => p.id)); hero.setFilter((p) => ids.has(p.id)); }
    };
    $q.addEventListener('input', () => { F.q = $q.value; F.shown = 24; draw(); });
    $when.addEventListener('change', () => { F.when = $when.value; F.shown = 24; draw(); });
    $sort.addEventListener('change', () => { F.sort = $sort.value; shuffled = null; draw(); });
    $app.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => {
      F.sub = b.dataset.sub; F.shown = 24;
      $app.querySelectorAll('[data-sub]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw();
    }));
    $app.querySelectorAll('[data-concept]').forEach((b) => b.addEventListener('click', () => {
      F.concept = F.concept === b.dataset.concept ? '' : b.dataset.concept; F.shown = 24;
      $app.querySelectorAll('[data-concept]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.concept === F.concept));
      draw();
      $app.querySelector('#feed-section').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' });
    }));
    $app.querySelector('#more').addEventListener('click', () => { F.shown += 24; draw(); });
    $app.querySelector('#surprise').addEventListener('click', () => { location.hash = '#/paper/' + pickSurprise().id; });
    mountDemo($app.querySelector('#sotd-demo'), star.m);
    wireFavs($app.querySelector('.sotd'));
    draw();
    reveal($app);
    $app.querySelector('#dive').addEventListener('click', () => diveTo(hero, pickSurprise().id));
    hero = await galaxy($app.querySelector('#hero-cosmos'), { mode: 'hero', intro: true, areaLabels: false, onSelect: (sel) => sel && sel.paper && diveTo(hero, sel.paper.id), onArea: (id) => { location.hash = '#/fields/' + id; } });
    if (hero) draw();
  }

  /* ---------------- PAPER ---------------- */
  const EDGE_WHY = [[1, 'shares ideas'], [2, 'same author'], [4, 'cites or is cited'], [8, 'shares references']];
  async function viewPaper(id) {
    setNav('');
    const p = D.byId.get(id);
    if (!p) {
      $app.innerHTML = `<div class="wrap page narrow"><span class="kicker">Lost in space</span><h1>This star has faded</h1><p>The paper may be older than ${D.meta.days} days. You can still read it on <a href="https://arxiv.org/abs/${esc(id)}">arXiv</a>.</p><p><a class="btn" href="#/">Back to the galaxy</a></p></div>`;
      return;
    }
    noteView(p);
    $app.innerHTML = '<div class="loading">Diving in…</div>';
    const [d] = await Promise.all([loadPaper(id), loadGraph()]);
    const s = d.summary, ai = d.ai, sf = sub(p.s);
    const dc = d.demoConcept ? con(d.demoConcept) : null;
    const authors = d.authors.join(', ') + (d.nauthors > d.authors.length ? ` and ${d.nauthors - d.authors.length} more` : '');
    const i = D.pos.get(id);
    const rel = D.graph.edges.filter((e) => e[0] === i || e[1] === i).map((e) => ({ j: e[0] === i ? e[1] : e[0], w: e[2], t: e[3] })).sort((a, b) => b.w - a.w).slice(0, 8);
    const bib = `@misc{${id.replace(/[^\w]/g, '')},\n  title = {${d.title}},\n  author = {${d.authors.join(' and ')}${d.nauthors > d.authors.length ? ' and others' : ''}},\n  year = {${d.published.slice(0, 4)}},\n  eprint = {${id}},\n  archivePrefix = {arXiv},\n  primaryClass = {${d.primary}},\n  doi = {${d.doi}}\n}`;
    $app.innerHTML = `
      <header class="paper-hero" style="--c:${sf.color}"><div class="wrap">
        <div class="row"><a class="chip" href="#/">← Explore</a>${subTag(p.s)}${(p.s2 || []).map(subTag).join('')}<span class="mono">${esc(d.published)} · ${ago(d.published)}</span></div>
        <h1>${esc(d.title)}</h1>
        <p class="authors">${esc(authors)}</p>
        <div class="links">
          <a class="btn primary" href="https://arxiv.org/abs/${esc(id)}" target="_blank" rel="noopener">Read on arXiv ↗</a>
          <a class="btn" href="https://arxiv.org/pdf/${esc(id)}" target="_blank" rel="noopener">PDF ↗</a>
          <a class="btn" href="https://doi.org/${esc(d.doi)}" target="_blank" rel="noopener">DOI${d.publishedDoi ? ' (journal)' : ''} ↗</a>
          <a class="btn" href="https://www.semanticscholar.org/arxiv/${esc(id)}" target="_blank" rel="noopener">Citations ↗</a>
          <button class="btn" type="button" data-fav="${esc(id)}" aria-pressed="${isFav(id)}">${isFav(id) ? '♥ Saved' : '♡ Save'}</button>
          <button class="btn" type="button" id="cite">Copy citation</button>
          <a class="btn" href="#/map?focus=${esc(id)}">◎ Find it in the galaxy</a>
        </div>
        ${d.journal ? `<p class="mono" style="margin-top:14px">Published in ${esc(d.journal)}</p>` : ''}
      </div></header>
      <div class="wrap" style="padding-bottom:80px">
        <div class="two">
          <div class="stack">
            <div class="tabs" role="tablist" ${ai ? '' : 'hidden'}>
              <button class="chip" role="tab" type="button" data-tab="rule" aria-pressed="${!ai}">Quick summary</button>
              <button class="chip" role="tab" type="button" data-tab="ai" aria-pressed="${!!ai}">AI plain words</button>
            </div>
            <div data-pane="rule" class="stack" ${ai ? 'hidden' : ''}>
              <span class="label">In a nutshell</span>
              <p class="glass nutshell reveal">${esc(s.tldr)}</p>
              <p>${esc(s.lead)} <span class="mono">(${levelDots(s.level)} ${levelText(s.level)})</span></p>
              ${s.context ? `<div class="reveal"><span class="label">The big picture</span><p>${esc(s.context)}</p></div>` : ''}
              <div class="reveal"><span class="label">Main claims</span><ol class="claims">${s.claims.map((c) => `<li>${esc(c)}</li>`).join('')}</ol></div>
              ${s.impact ? `<div class="reveal"><span class="label">Why it matters</span><p>${esc(s.impact)}</p></div>` : ''}
              <p class="note">Put together automatically from the authors' own abstract, picking the sentences where they state results. Some jargon remains; the idea cards below explain the key words.</p>
            </div>
            ${ai ? `<div data-pane="ai" class="stack">
              <span class="label">In a nutshell</span>
              <p class="glass nutshell">${esc(ai.tldr)}</p>
              <p>${esc(ai.plain)}</p>
              <div><span class="label">Main claims</span><ol class="claims">${(ai.claims || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ol></div>
              ${ai.why ? `<div><span class="label">Why it matters</span><p>${esc(ai.why)}</p></div>` : ''}
              <p class="note">Written by an AI model (${esc(ai.model || 'Claude')}) from the abstract only. It can make mistakes; check the paper for anything important.</p>
            </div>` : ''}
            <details class="abstract glass pad"><summary>Read the original abstract</summary><p>${esc(d.abstract)}</p>${d.comment ? `<p class="muted">Author note: ${esc(d.comment)}</p>` : ''}<p class="mono">arXiv: ${d.cats.map(esc).join(' · ')}</p></details>
            <div><span class="label">Ideas in this paper</span>
            <div class="concept-list">${p.c.map((cid) => { const c = con(cid); if (!c) return ''; return `<div class="glass concept-item reveal"><b><a href="#/learn/${esc(cid)}">${esc(c.name)} →</a></b><span style="color:#c0c5ea">${esc(c.plain)}</span></div>`; }).join('') || '<p class="muted">No tagged ideas yet.</p>'}</div></div>
          </div>
          <div class="stack sticky">
            <div id="demo-slot"></div>
            <div><span class="label">Connected stars</span>
            <div class="glass related" style="padding:6px">${rel.map((r) => { const q = D.index[r.j]; const why = EDGE_WHY.filter(([b]) => r.t & b).map(([, t]) => t).join(' · '); return `<a href="#/paper/${esc(q.id)}"><span class="tag" style="--c:${sub(q.s).color}">${esc(sub(q.s).name)}</span><b style="display:block;margin-top:4px">${esc(q.t)}</b><small>${esc(why)}${r.t & 1 ? ': ' + q.c.filter((c) => p.c.includes(c)).slice(0, 3).map(conName).join(', ') : ''}</small></a>`; }).join('') || '<p class="pad muted">No close links yet. Connections appear as more papers arrive.</p>'}</div></div>
          </div>
        </div>
      </div>`;
    const intro = dc ? `This paper is about <b>${esc(dc.name)}</b>. ${esc(dc.plain)}` : `A core idea from ${esc(sf.name.toLowerCase())}.`;
    mountDemo($app.querySelector('#demo-slot'), p.m, intro);
    wireFavs($app);
    $app.querySelector('#cite').addEventListener('click', async () => { try { await navigator.clipboard.writeText(bib); toast('BibTeX citation copied'); } catch (e) { prompt('Copy this citation:', bib); } });
    $app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      $app.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      $app.querySelectorAll('[data-pane]').forEach((x) => { x.hidden = x.dataset.pane !== b.dataset.tab; });
    }));
    reveal($app);
    document.title = d.title + ' · Quantum Atlas';
  }

  /* ---------------- GALAXY (3D map) ---------------- */
  async function viewMap(params) {
    setNav('map');
    await loadGraph();
    if (!webgl || params.get('flat') === '1') return viewFlatMap(params);
    const st = { sub: params.get('sub') || '', days: 45, ideas: params.has('concept') };
    $app.innerHTML = `<section class="map-page">
      <div class="cosmos" id="map-cosmos"></div>
      <div class="map-ui glass" id="map-ui">
        <div class="row map-collapse-row"><span class="kicker" style="margin:0">◎ The galaxy</span><span class="spacer"></span><button class="btn small map-collapse" type="button" id="ui-toggle" aria-expanded="true">Hide</button></div>
        <h1>Fly through <em>${D.meta.count.toLocaleString()}</em> papers</h1>
        <p class="muted" style="margin:0;font-size:.88rem">Drag to orbit, scroll or pinch to zoom, click a star. Lines show papers that share ideas, authors or references.</p>
        <div class="chips-scroll" role="group" aria-label="Filter by field">
          <button class="chip" type="button" data-msub="">All fields</button>
          ${D.concepts.subfields.map((s) => `<button class="chip" type="button" data-msub="${s.id}"><span class="dot" style="background:${s.color};color:${s.color}"></span>${esc(s.name)}</button>`).join('')}
        </div>
        <label class="mono" style="display:grid;gap:4px">Published in the last <output id="d-out">45 days</output><input type="range" id="d-in" min="1" max="45" value="45"></label>
        <div class="row"><button class="chip" type="button" id="ideas-btn" aria-pressed="${st.ideas}">✶ Show idea names</button><a class="chip" href="#/map?flat=1">▦ Flat view</a></div>
        <span class="label" style="margin-top:6px">Idea clusters</span>
        <div class="clusters" id="clusters"></div>
      </div>
      <div class="map-panel glass" hidden aria-live="polite"></div>
      <div class="map-zoom"><button class="glass" type="button" data-z="in" aria-label="Zoom in">+</button><button class="glass" type="button" data-z="out" aria-label="Zoom out">−</button><button class="glass" type="button" data-z="home" aria-label="Show the whole galaxy">⤢</button></div>
    </section>`;
    const panel = $app.querySelector('.map-panel');
    const ui = $app.querySelector('#map-ui');
    const toggle = $app.querySelector('#ui-toggle');
    const closeUI = () => { ui.classList.add('closed'); toggle.textContent = 'Filters'; toggle.setAttribute('aria-expanded', 'false'); };
    if (innerWidth < 900) closeUI();
    toggle.addEventListener('click', () => { const c = ui.classList.toggle('closed'); toggle.textContent = c ? 'Filters' : 'Hide'; toggle.setAttribute('aria-expanded', !c); });
    let g = null;
    function wire() {
      panel.querySelector('[data-close]').addEventListener('click', () => { panel.hidden = true; g && g.select(null); });
      panel.querySelectorAll('[data-goto]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); const p = D.byId.get(a.dataset.goto); g && g.focusPaper(p.id); showPaper(p); }));
      wireFavs(panel);
    }
    function showPaper(p) {
      const i = D.pos.get(p.id);
      const nb = D.graph.edges.filter((e) => e[0] === i || e[1] === i).sort((a, b) => b[2] - a[2]).slice(0, 6).map((e) => D.index[e[0] === i ? e[1] : e[0]]);
      panel.hidden = false;
      panel.innerHTML = `<div class="row">${subTag(p.s)}<span class="spacer"></span><button class="btn small" type="button" data-close aria-label="Close">✕</button></div>
        <h3 style="font-family:var(--serif);font-weight:400;font-size:1.6rem;line-height:1.1;margin:12px 0 6px">${esc(p.t)}</h3>
        <p class="mono" style="margin:0">${esc(p.a.join(', '))}${p.na > 3 ? ' et al.' : ''} · ${ago(p.d)}</p>
        <p style="color:#c9cdee">${esc(p.x)}</p>
        <div class="row">${p.c.slice(0, 5).map(conChip).join('')}</div>
        <div class="row" style="margin:16px 0"><a class="btn primary small" href="#/paper/${esc(p.id)}">Dive in →</a><a class="btn small" href="https://arxiv.org/abs/${esc(p.id)}" target="_blank" rel="noopener">arXiv ↗</a>${favBtn(p.id)}</div>
        ${nb.length ? `<span class="label">Connected stars</span><div class="related">${nb.map((q) => `<a href="#" data-goto="${q.id}"><b>${esc(q.t)}</b><small>${esc(sub(q.s).name)}</small></a>`).join('')}</div>` : ''}`;
      wire();
    }
    function showConcept(cid) {
      const c = con(cid) || { name: cid, plain: '' };
      const ps = D.index.filter((p) => p.c.includes(cid));
      panel.hidden = false;
      panel.innerHTML = `<div class="row"><span class="kicker" style="margin:0">✶ Idea</span><span class="spacer"></span><button class="btn small" type="button" data-close aria-label="Close">✕</button></div>
        <h3 style="font-family:var(--serif);font-weight:400;font-size:1.8rem;margin:8px 0">${esc(c.name)}</h3>
        <p style="color:#c9cdee">${esc(c.plain)}</p><p class="mono">${ps.length} papers</p>
        <div class="row" style="margin-bottom:14px"><a class="btn small primary" href="#/learn/${esc(cid)}">Learn it →</a>${c.demo ? `<a class="btn small" href="#/play/${c.demo}">Play the demo</a>` : ''}</div>
        <span class="label">Recent papers</span><div class="related">${ps.slice(0, 6).map((p) => `<a href="#" data-goto="${p.id}"><b>${esc(p.t)}</b><small>${ago(p.d)}</small></a>`).join('')}</div>`;
      wire();
    }
    const apply = () => {
      $app.querySelectorAll('[data-msub]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.msub === st.sub));
      const fn = (p) => days(p.d) <= st.days && (!st.sub || p.s === st.sub || (p.s2 || []).includes(st.sub));
      if (g) g.setFilter(fn);
      const counts = {};
      for (const p of D.index) if (fn(p) && p.g >= 0) counts[p.g] = (counts[p.g] || 0) + 1;
      $app.querySelector('#clusters').innerHTML = Object.entries(counts).filter(([, k]) => k >= 3).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([cl, k]) => {
        const info = D.graph.clusters[cl];
        return `<button class="cluster" type="button" data-cl="${cl}"><span class="tag" style="--c:${sub(info.subfield).color}">${k} papers</span><br>${info.concepts.map(conName).join(' · ')}</button>`;
      }).join('') || '<p class="muted">No clusters in this view.</p>';
      $app.querySelectorAll('[data-cl]').forEach((b) => b.addEventListener('click', () => { if (g) g.focusCluster(+b.dataset.cl); if (innerWidth < 900) closeUI(); }));
    };
    $app.querySelectorAll('[data-msub]').forEach((b) => b.addEventListener('click', () => { st.sub = b.dataset.msub; apply(); if (g) { if (st.sub) g.focusArea(st.sub); else g.flyHome(); } }));
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
    apply();
    if (st.ideas) g.setIdeas(true);
    const focus = params.get('focus'), concept = params.get('concept');
    if (focus && D.byId.get(focus)) setTimeout(() => { g.focusPaper(focus); showPaper(D.byId.get(focus)); }, 300);
    if (concept) setTimeout(() => { g.focusConcept(concept); showConcept(concept); }, 300);
    if (st.sub) setTimeout(() => g.focusArea(st.sub), 300);
  }
  function viewFlatMap(params) {
    $app.innerHTML = `<div class="wrap flat-wrap page"><div class="section-head"><div><span class="kicker">▦ Flat view</span><h2>The map of <em>ideas</em></h2></div><p>Every dot is a paper; lines join papers that share ideas, authors or references.${webgl ? ' <a href="#/map">Back to 3D →</a>' : ''}</p></div><div id="map-root"></div></div>`;
    cleanup.push(QA.mountMap($app.querySelector('#map-root'), {
      index: D.index, graph: D.graph, concepts: D.concepts, sub, conName, focus: params.get('focus'), concept: params.get('concept'), subFilter: params.get('sub') || '', esc, ago,
    }));
  }

  /* ---------------- FIELDS ---------------- */
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
    $app.innerHTML = `
      <section class="fields-hero"><div class="cosmos" id="f-cosmos"></div>
        <div class="copy"><div class="wrap"><span class="kicker">⌖ The PhD compass</span><h1>Find <em>your</em> field</h1><p class="muted" style="max-width:52ch">Quantum physics is a big sky. Each glowing region above is a field. Hover a card below and the galaxy turns to show you where it lives.</p></div></div>
      </section>
      <div class="wrap" style="padding-bottom:80px">
        <div class="two" style="margin-top:30px">
          <div class="glass pad quiz reveal"><span class="kicker">5 quick questions</span><h2>Where might you <em>fit?</em></h2>
            <form id="quiz">${QUIZ.map((q, qi) => `<fieldset><legend>${qi + 1}. ${esc(q.q)}</legend><div class="opts">${q.a.map((a, ai) => `<label><input type="radio" name="q${qi}" value="${ai}" required><span>${esc(a[0])}</span></label>`).join('')}</div></fieldset>`).join('')}
            <button class="btn primary" type="submit">Point my compass</button></form>
            <div id="quiz-out" aria-live="polite"></div>
          </div>
          <div class="glass pad compass reveal sticky"><span class="kicker">Your compass</span><h2>Where your <em>curiosity</em> points</h2>
            ${Object.values(interest).some((v) => v) ? ranked.map((s) => `<div class="item" style="--c:${s.color}"><span aria-hidden="true">${s.emoji}</span><div><small>${esc(s.name)}</small><div class="bar"><i style="width:${(100 * interest[s.id]) / maxI}%"></i></div></div><small class="mono">${interest[s.id]}</small></div>`).join('') : '<p class="muted">Empty for now. Read and save a few papers, or take the quiz, and this fills in. It lives only in your browser.</p>'}
            ${untouched.length ? `<p style="margin-top:14px"><b>Unexplored:</b> ${untouched.slice(0, 5).map((s) => `<a href="#/fields/${s.id}">${esc(s.name)}</a>`).join(', ')}</p>` : ''}
            <button class="btn" type="button" id="surprise2">🎲 Show me something different</button>
          </div>
        </div>
        <section class="section"><div class="section-head reveal"><div><span class="kicker">14 regions</span><h2>The map of <em>quantum physics</em></h2></div><p>How busy each field is right now, and what a PhD there tends to look like.</p></div>
        <div class="grid">${D.concepts.subfields.map((s) => `<a class="glass field reveal" style="--c:${s.color}" href="#/fields/${s.id}" data-area="${s.id}">
            <span class="tag" style="--c:${s.color}">${plural(sc[s.id] || 0, 'paper')} · ${Math.round((100 * (sc[s.id] || 0)) / total)}%</span>
            <h3><span aria-hidden="true">${s.emoji}</span> ${esc(s.name)}</h3>
            <p>${esc(s.plain)}</p>
            <div class="bar"><i style="width:${(100 * (sc[s.id] || 0)) / maxC}%"></i></div>
            <small><b style="color:var(--fg)">PhD life:</b> ${esc(s.phd)}</small>
            <small class="mono">Hot: ${topConcepts(s.id).map(conName).join(' · ') || '—'}</small>
          </a>`).join('')}</div></section>
      </div>`;
    $app.querySelector('#surprise2').addEventListener('click', () => { location.hash = '#/paper/' + pickSurprise().id; });
    let g = null;
    const showQuiz = (scores, fly) => {
      const top = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 3);
      $app.querySelector('#quiz-out').innerHTML = `<span class="label" style="margin-top:18px">Your top matches</span><div class="stack" style="gap:8px">${top.map(([k], i) => `<a class="glass pad" style="display:block;color:var(--fg)" href="#/fields/${k}"><span class="tag" style="--c:${sub(k).color}">#${i + 1}</span><b style="display:block;font-family:var(--serif);font-weight:400;font-size:1.4rem">${sub(k).emoji} ${esc(sub(k).name)}</b><small class="muted">${esc(sub(k).plain)}</small></a>`).join('')}</div><p class="muted">Just for fun. The real test: read a few papers in each and notice which ones you can't stop thinking about.</p>`;
      if (g && fly) { scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); g.focusArea(top[0][0]); }
    };
    $app.querySelector('#quiz').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target), scores = {};
      QUIZ.forEach((q, qi) => { const a = q.a[+fd.get('q' + qi)]; for (const s2 of a[1]) scores[s2] = (scores[s2] || 0) + 1; });
      S.quiz = scores; save(); showQuiz(scores, true);
    });
    if (S.quiz) showQuiz(S.quiz, false);
    reveal($app);
    g = await galaxy($app.querySelector('#f-cosmos'), { mode: 'hero', onSelect: (sel) => sel && sel.paper && diveTo(g, sel.paper.id), onArea: (id) => { location.hash = '#/fields/' + id; } });
    if (g) $app.querySelectorAll('[data-area]').forEach((a) => a.addEventListener('pointerenter', () => g.focusArea(a.dataset.area)));
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
    $app.innerHTML = `<header class="paper-hero" style="--c:${s.color}"><div class="wrap">
        <div class="row"><a class="chip" href="#/fields">← All fields</a><span class="tag" style="--c:${s.color}">${plural(list.length, 'recent paper')}</span></div>
        <h1>${s.emoji} ${esc(s.name)}</h1><p style="font-size:1.15rem;max-width:60ch;color:#c9cdee">${esc(s.plain)}</p>
        <div class="links"><a class="btn primary" href="#/map?sub=${id}">◎ Fly to it in the galaxy</a><a class="btn" href="#/play/${s.demo}">${QA.demos[s.demo] ? QA.demos[s.demo].emoji : '◐'} Play its demo</a></div>
      </div></header>
      <div class="wrap" style="padding-bottom:80px"><div class="two"><div class="stack">
        <div class="glass pad reveal"><span class="label">What a PhD here looks like</span><p style="margin:0">${esc(s.phd)}</p></div>
        <div class="reveal"><span class="label">Ideas people are working on</span><div class="row">${top.map(([c, n]) => `<a class="chip" href="#/learn/${c}">${esc(conName(c))} <span class="n">${n}</span></a>`).join('')}</div></div>
        ${busy.length ? `<div class="reveal"><span class="label">Busy authors this month</span><p class="muted" style="margin-top:0">People with several new papers here. Their groups might be worth a look when you think about where to apply.</p><p>${busy.map(([a, n]) => `<a href="https://arxiv.org/search/?searchtype=author&query=${encodeURIComponent(a)}" target="_blank" rel="noopener">${esc(a)}</a> <span class="mono">(${n})</span>`).join(', ')}</p></div>` : ''}
      </div><div id="demo-slot" class="sticky"></div></div>
      <section class="section"><div class="section-head"><div><span class="kicker">Recent papers</span><h2>Fresh from the <em>field</em></h2></div></div><div class="grid">${list.slice(0, 60).map(paperCard).join('')}</div></section></div>`;
    wireFavs($app);
    mountDemo($app.querySelector('#demo-slot'), s.demo);
    reveal($app);
  }

  /* ---------------- PLAY ---------------- */
  function viewPlay() {
    setNav('play');
    const u = {}; for (const p of D.index) u[p.m] = (u[p.m] || 0) + 1;
    $app.innerHTML = `<div class="wrap page"><div class="section-head"><div><span class="kicker">◐ The playground</span><h1>Touch the <em>weird</em></h1></div><p>Sixteen mini-labs. Move the sliders and watch quantum physics answer back. Every paper on the site links to the one that best shows its main idea.</p></div>
      <div class="grid tight">${Object.values(QA.demos).map((d) => `<a class="glass dcard reveal" href="#/play/${d.id}"><span class="emoji" aria-hidden="true">${d.emoji || '◐'}</span><b>${esc(d.title)}</b><small>${esc(d.blurb || '')}</small><span class="mono" style="margin-top:auto">${plural(u[d.id] || 0, 'paper')} use this</span></a>`).join('')}</div></div>`;
    reveal($app);
  }
  function viewDemo(id) {
    setNav('play');
    const d = QA.demos[id];
    if (!d) { location.hash = '#/play'; return; }
    const related = D.index.filter((p) => p.m === id);
    const cons = D.concepts.concepts.filter((c) => c.demo === id);
    $app.innerHTML = `<div class="wrap page"><div class="row" style="margin-bottom:18px"><a class="chip" href="#/play">← All demos</a></div><div class="two"><div id="demo-slot"></div><div class="stack">
      <div><span class="label">Ideas you can see here</span><div class="concept-list">${cons.map((c) => `<div class="glass concept-item reveal"><b><a href="#/learn/${c.id}">${esc(c.name)} →</a></b><span style="color:#c0c5ea">${esc(c.plain)}</span></div>`).join('')}</div></div>
      <div><span class="label">Papers using this idea (${related.length})</span><div class="glass related" style="padding:6px">${related.slice(0, 12).map((q) => `<a href="#/paper/${q.id}"><span class="tag" style="--c:${sub(q.s).color}">${esc(sub(q.s).name)}</span><b style="display:block;margin-top:4px">${esc(q.t)}</b><small>${ago(q.d)}</small></a>`).join('') || '<p class="pad muted">None in the current window.</p>'}</div></div>
    </div></div></div>`;
    mountDemo($app.querySelector('#demo-slot'), id);
    reveal($app);
    document.title = d.title + ' · Quantum Atlas';
  }

  /* ---------------- LEARN ---------------- */
  const PATH = ['qubit', 'superposition', 'interference', 'double-slit', 'measurement', 'entanglement', 'bell', 'decoherence', 'tunneling', 'oscillator', 'algorithms', 'qec'];
  const RESOURCES = [
    ['Quantum Country', 'https://quantum.country/', 'A free, beautifully written intro to quantum computing that helps you remember what you read.'],
    ['IBM Quantum Learning', 'https://quantum.cloud.ibm.com/learning', 'Free courses, and you can run circuits on real quantum computers.'],
    ['The Feynman Lectures, Vol. III', 'https://www.feynmanlectures.caltech.edu/III_toc.html', "Feynman's classic quantum lectures, free online."],
    ['MIT OpenCourseWare 8.04', 'https://ocw.mit.edu/courses/8-04-quantum-physics-i-spring-2016/', 'A full university quantum physics course: videos, notes and problem sets.'],
    ['PhET simulations', 'https://phet.colorado.edu/', 'More free, playful physics simulations from the University of Colorado.'],
    ["John Preskill's notes", 'https://www.preskill.caltech.edu/ph229/', 'Classic graduate lecture notes on quantum information.'],
    ['Error Correction Zoo', 'https://errorcorrectionzoo.org/', 'A friendly catalogue of quantum error-correcting codes.'],
    ['Quantum Algorithm Zoo', 'https://quantumalgorithmzoo.org/', 'Known quantum algorithms and their speed-ups.'],
    ['Quantum (the journal)', 'https://quantum-journal.org/', 'An open-access journal where many of these papers end up.'],
    ['arXiv quant-ph', 'https://arxiv.org/list/quant-ph/new', 'The raw daily feed this site reads from.'],
  ];
  function viewLearn() {
    setNav('learn');
    const counts = D.graph ? D.graph.conceptCounts : {};
    $app.innerHTML = `<div class="wrap page"><div class="section-head"><div><span class="kicker">☰ Learn</span><h1>Start from <em>zero</em></h1></div><p>New to quantum physics? Follow the orbit below. Each stop has a short explanation, a demo to play with and real papers that use the idea. No maths needed to start.</p></div>
      <div class="two"><div><span class="label">The beginner's orbit</span><div class="path">${PATH.map((id, i) => { const c = con(id); const d = QA.demos[c.demo]; return `<a class="glass step reveal" data-n="${i + 1}" href="#/learn/${id}"><b>${esc(c.name)}</b>${d ? ` <span class="mono">· ${d.emoji} demo</span>` : ''}<br><span style="color:#c0c5ea">${esc(c.plain)}</span></a>`; }).join('')}</div></div>
      <div class="stack sticky"><span class="label">Free places to go deeper</span>${RESOURCES.map(([n, u, t]) => `<a class="glass concept-item" href="${u}" target="_blank" rel="noopener"><b style="color:var(--fg)">${esc(n)} ↗</b><small class="muted">${esc(t)}</small></a>`).join('')}</div></div>
      <section class="section"><div class="section-head"><div><span class="kicker">Glossary</span><h2>Every <em>idea</em> on the site</h2></div><span class="spacer"></span><input type="search" id="gq" placeholder="Find a word…" aria-label="Search the glossary" style="max-width:320px"></div>
      <div class="glossary" id="gl"></div></section></div>`;
    const draw = (q) => {
      q = (q || '').toLowerCase();
      const list = D.concepts.concepts.filter((c) => !q || (c.name + ' ' + c.plain).toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
      $app.querySelector('#gl').innerHTML = list.map((c) => `<div class="glass gl"><h3><a href="#/learn/${c.id}">${esc(c.name)}</a></h3><p style="margin:4px 0 8px;color:#c0c5ea">${esc(c.plain)}</p><span class="tag" style="--c:${sub(c.subfield).color}">${esc(sub(c.subfield).name)} · ${counts[c.id] || 0}</span></div>`).join('');
    };
    $app.querySelector('#gq').addEventListener('input', (e) => draw(e.target.value));
    draw('');
    reveal($app);
  }
  function viewConcept(id) {
    setNav('learn');
    const c = con(id);
    if (!c) { location.hash = '#/learn'; return; }
    const papers = D.index.filter((p) => p.c.includes(id));
    const step = PATH.indexOf(id);
    const next = step >= 0 && step < PATH.length - 1 ? con(PATH[step + 1]) : null;
    const s = sub(c.subfield);
    $app.innerHTML = `<header class="paper-hero" style="--c:${s.color}"><div class="wrap">
        <div class="row"><a class="chip" href="#/learn">← Learn</a>${subTag(c.subfield)}${step >= 0 ? `<span class="mono">Stop ${step + 1} of ${PATH.length}</span>` : ''}</div>
        <h1>${esc(c.name)}</h1><p class="glass nutshell" style="max-width:820px;margin-top:10px">${esc(c.plain)}</p>
        <div class="links"><a class="btn" href="#/map?concept=${id}">◎ Where it shines in the galaxy</a>${c.links.map(([n, u]) => `<a class="btn" href="${u}" target="_blank" rel="noopener">${esc(n)} ↗</a>`).join('')}${next ? `<a class="btn primary" href="#/learn/${next.id}">Next: ${esc(next.name)} →</a>` : ''}</div>
      </div></header>
      <div class="wrap" style="padding-bottom:80px"><div id="demo-slot"></div>
      <section class="section"><div class="section-head"><div><span class="kicker">${plural(papers.length, 'recent paper')}</span><h2>Where it shows up <em>now</em></h2></div></div><div class="grid">${papers.slice(0, 30).map(paperCard).join('')}</div></section></div>`;
    wireFavs($app);
    mountDemo($app.querySelector('#demo-slot'), c.demo);
    reveal($app);
  }

  /* ---------------- SAVED ---------------- */
  async function viewSaved() {
    setNav('saved');
    const ids = Object.keys(S.fav).sort((a, b) => (S.fav[b].at || '').localeCompare(S.fav[a].at || ''));
    const card = (id) => D.byId.get(id) ? paperCard(D.byId.get(id)) : `<article class="glass pcard reveal"><div class="meta">${S.fav[id].s ? subTag(S.fav[id].s) : ''}<span class="spacer"></span>${favBtn(id)}</div><h3><a href="https://arxiv.org/abs/${esc(id)}" target="_blank" rel="noopener">${esc(S.fav[id].t)} ↗</a></h3><p>Older than ${D.meta.days} days, so it now lives on arXiv.</p></article>`;
    const live = ids.filter((id) => D.byId.has(id));
    $app.innerHTML = `<div class="wrap page"><div class="section-head"><div><span class="kicker">♡ Saved</span><h1>Your <em>constellation</em></h1></div><p>The papers you've hearted, lit up in the galaxy. Stored only in this browser.</p></div>
      ${ids.length ? `${live.length && webgl ? '<div class="constellation glass"><div class="cosmos" id="s-cosmos"></div></div>' : ''}
      <div class="row" style="margin-bottom:18px"><button class="btn" id="exp" type="button">Copy as text</button><button class="btn" id="expb" type="button">Copy as BibTeX</button><button class="btn" id="clr" type="button">Clear all</button></div><div class="grid">${ids.map(card).join('')}</div>`
      : '<div class="glass pad empty">No stars yet. Tap ♡ on any paper and it will light up here.</div>'}</div>`;
    wireFavs($app);
    const copy = async (txt, msg) => { try { await navigator.clipboard.writeText(txt); toast(msg); } catch (e) { prompt('Copy:', txt); } };
    $app.querySelector('#exp')?.addEventListener('click', () => copy(ids.map((id) => `${S.fav[id].t}\nhttps://arxiv.org/abs/${id}`).join('\n\n'), 'List copied'));
    $app.querySelector('#expb')?.addEventListener('click', () => copy(ids.map((id) => `@misc{${id.replace(/[^\w]/g, '')},\n  title = {${S.fav[id].t}},\n  eprint = {${id}},\n  archivePrefix = {arXiv},\n  doi = {10.48550/arXiv.${id}}\n}`).join('\n\n'), 'BibTeX copied'));
    $app.querySelector('#clr')?.addEventListener('click', () => { if (confirm('Remove all saved papers from this browser?')) { S.fav = {}; save(); render(); } });
    reveal($app);
    const el = $app.querySelector('#s-cosmos');
    if (el) {
      const set = new Set(live);
      const g = await galaxy(el, { mode: 'hero', areaLabels: false, offset: false, onSelect: (sel) => sel && sel.paper && diveTo(g, sel.paper.id) });
      if (g) g.setFilter((p) => set.has(p.id));
    }
  }

  /* ---------------- ABOUT ---------------- */
  function viewAbout() {
    setNav('');
    const m = D.meta;
    $app.innerHTML = `<div class="wrap page narrow"><span class="kicker">About</span><h1>A telescope for <em>new ideas</em></h1>
      <p style="font-size:1.1rem;color:#c9cdee">Quantum Atlas is a free, open-source guide to the newest quantum physics research, made for curious people, students and anyone choosing a direction for a PhD. It started with one question: <i>out of everything happening in quantum physics, what excites me most?</i></p>
      <h2>How it works</h2>
      <ol class="claims">
        <li><b>Every day</b> a GitHub Actions job asks the <a href="https://info.arxiv.org/help/api/">arXiv API</a> for the newest papers in quant-ph, plus quantum-related papers in cond-mat, hep-th, gr-qc, physics.atom-ph and physics.optics, waiting politely between requests as arXiv asks.</li>
        <li>It tags each paper with ideas from a hand-written list of ${D.concepts.concepts.length} concepts and places it in one of ${D.concepts.subfields.length} fields.</li>
        <li>It writes a <b>quick summary</b> by picking out the sentences where the authors state what they found. No paid AI is needed. If an API key is added, optional AI plain-language summaries appear in a labelled tab.</li>
        <li>It looks up reference lists on <a href="https://www.semanticscholar.org/product/api">Semantic Scholar</a> to find papers that cite each other or share references.</li>
        <li>It links papers that share ideas, authors or references and groups them into clusters. In the galaxy, each field is a glowing region and each cluster a knot of stars.</li>
      </ol>
      <p class="note">Right now: ${m.count.toLocaleString()} papers from the last ${m.days} days, ${m.withCitations} with reference data${m.withAI ? `, ${m.withAI} with AI summaries` : ''}. Updated ${new Date(m.updated).toLocaleString()}.</p>
      <h2>Please keep in mind</h2>
      <p>Summaries are automatic and can miss nuance or be wrong. Many arXiv papers are preprints that haven't been peer reviewed. Always read the original before relying on a claim. Demos show the textbook idea behind a paper, not the paper's own results.</p>
      <h2>Credits</h2>
      <ul>
        <li>Paper data: <a href="https://arxiv.org">arXiv</a>. Thank you to arXiv for use of its open access interoperability. Abstracts belong to their authors; every page links to the original.</li>
        <li>Reference data: <a href="https://www.semanticscholar.org">Semantic Scholar</a> (Allen Institute for AI), under its API license.</li>
        <li>DOIs resolve through <a href="https://www.doi.org">doi.org</a>; arXiv DOIs are registered by <a href="https://datacite.org">DataCite</a>.</li>
        <li>3D graphics: <a href="https://threejs.org">three.js</a> (MIT License), loaded from <a href="https://www.jsdelivr.com">jsDelivr</a>.</li>
        <li>Fonts: <a href="https://fonts.google.com/specimen/Instrument+Serif">Instrument Serif</a>, <a href="https://fonts.google.com/specimen/Inter">Inter</a>, <a href="https://fonts.google.com/specimen/JetBrains+Mono">JetBrains Mono</a> and <a href="https://fonts.google.com/specimen/Unbounded">Unbounded</a> via Google Fonts (SIL Open Font License).</li>
        <li>Concept explanations link to <a href="https://www.wikipedia.org">Wikipedia</a> and other free resources.</li>
        <li>Demos, the galaxy, the map and the site are written from scratch in plain JavaScript. Hosted free on <a href="https://pages.github.com">GitHub Pages</a>.</li>
      </ul>
      <h2>Your privacy</h2><p>No accounts, no tracking, no cookies. Saved papers, your compass and quiz answers stay in your browser's local storage.</p>
      <h2>Open source</h2><p>The code is on <a href="https://github.com/DanielAja/quantum-atlas">GitHub</a>. Ideas and fixes are welcome.</p></div>`;
  }

  /* ---------------- ⌘K search palette ("telescope") ---------------- */
  let palette = null;
  function openPalette(initial = '') {
    if (palette) return;
    const opener = document.activeElement;
    palette = QA.el('div', { class: 'palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search the atlas' });
    palette.innerHTML = `<div class="glass palette-box"><input type="text" placeholder="Search papers, ideas, fields, demos…" aria-label="Search" autocomplete="off" spellcheck="false"><div class="palette-results" role="listbox"></div><div class="palette-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div></div>`;
    document.body.append(palette);
    palette._opener = opener;
    const input = palette.querySelector('input'), res = palette.querySelector('.palette-results');
    let items = [], sel = 0;
    const pages = [['Explore the galaxy', '#/', '✦'], ['Full 3D galaxy', '#/map', '◎'], ['Find your field (quiz)', '#/fields', '⌖'], ['All demos', '#/play', '◐'], ['Learn from zero', '#/learn', '☰'], ['Saved papers', '#/saved', '♡'], ['About and credits', '#/about', 'ⓘ']];
    const mark = () => res.querySelectorAll('[data-k]').forEach((a) => { const on = +a.dataset.k === sel; a.setAttribute('aria-selected', on); if (on) a.scrollIntoView({ block: 'nearest' }); });
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const terms = q.split(/\s+/).filter(Boolean);
      const m = (s) => terms.every((t) => s.toLowerCase().includes(t));
      const groups = [];
      if (!q) groups.push(['Go to', pages.map(([t, h, i]) => ({ t, h, i }))], ['Feeling lucky', [{ t: 'Surprise me with a paper', h: '#/paper/' + pickSurprise().id, i: '🎲' }]]);
      else {
        groups.push(['Papers', D.index.filter((p) => m(p.t + ' ' + p.a.join(' ') + ' ' + p.c.map(conName).join(' '))).slice(0, 7).map((p) => ({ t: p.t, h: '#/paper/' + p.id, i: `<span class="dot" style="background:${sub(p.s).color};color:${sub(p.s).color}"></span>` }))]);
        groups.push(['Ideas', D.concepts.concepts.filter((c) => m(c.name + ' ' + c.plain)).slice(0, 4).map((c) => ({ t: c.name, h: '#/learn/' + c.id, i: '✶' }))]);
        groups.push(['Fields', D.concepts.subfields.filter((s) => m(s.name + ' ' + s.plain)).slice(0, 3).map((s) => ({ t: s.name, h: '#/fields/' + s.id, i: s.emoji }))]);
        groups.push(['Demos', Object.values(QA.demos).filter((d) => m(d.title + ' ' + (d.blurb || ''))).slice(0, 3).map((d) => ({ t: d.title, h: '#/play/' + d.id, i: d.emoji }))]);
        groups.push(['Go to', pages.filter(([t]) => m(t)).map(([t, h, i]) => ({ t, h, i }))]);
      }
      items = [];
      res.innerHTML = groups.filter(([, l]) => l.length).map(([gname, l]) => `<div class="grp">${gname}</div>` + l.map((it) => { items.push(it); return `<a href="${it.h}" role="option" data-k="${items.length - 1}"><span class="ic">${it.i}</span><span class="t">${esc(it.t)}</span></a>`; }).join('')).join('') || '<p class="pad muted">Nothing found in this corner of the sky.</p>';
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

  /* ---------------- ambient interaction ---------------- */
  const glow = document.querySelector('.cursor-glow');
  if (matchMedia('(pointer: fine)').matches && !reduced()) {
    addEventListener('pointermove', (e) => {
      glow.style.left = e.clientX + 'px'; glow.style.top = e.clientY + 'px';
      const card = e.target.closest && e.target.closest('.pcard');
      if (card) { const r = card.getBoundingClientRect(); card.style.setProperty('--mx', e.clientX - r.left + 'px'); card.style.setProperty('--my', e.clientY - r.top + 'px'); }
    }, { passive: true });
  } else glow.hidden = true;

  /* ---------------- router ---------------- */
  async function render() {
    cleanup.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
    cleanup = [];
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
        case '': await viewHome(); break;
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
      $app.innerHTML = `<div class="wrap page empty"><h2>Something went wrong</h2><p>${esc(e.message)}</p><p><a class="btn" href="#/">Go home</a></p></div>`;
    }
  }
  function route() {
    if (document.startViewTransition && !reduced()) {
      // animate the swap of the page only; the 3D galaxy keeps loading afterwards
      const vt = document.startViewTransition(() => Promise.race([render(), new Promise((r) => setTimeout(r, 350))]));
      vt.ready.catch(() => {}); vt.finished.catch(() => {}); if (vt.updateCallbackDone) vt.updateCallbackDone.catch(() => {});
    } else render();
    $app.focus({ preventScroll: true });
  }
  window.addEventListener('hashchange', route);
  loadCore().then(route).catch((e) => {
    console.error(e);
    $app.innerHTML = `<div class="wrap page empty"><h2>Couldn't reach the telescope</h2><p>${esc(e.message)}</p><p>Try refreshing the page.</p></div>`;
  });
})();
