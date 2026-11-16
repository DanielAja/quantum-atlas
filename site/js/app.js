/* Quantum Atlas: single-page app (hash routes), no build step. */
(function () {
  const QA = window.QA;
  const $app = document.getElementById('app');
  const D = { meta: null, index: [], concepts: null, graph: null, shards: {}, byId: new Map(), pos: new Map() };
  let cleanup = [];

  /* ---------------- utilities ---------------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getJSON = async (url) => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };
  const days = (iso) => Math.floor((Date.now() - new Date(iso + 'T00:00:00Z').getTime()) / 864e5);
  const ago = (iso) => { const d = days(iso); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 7 ? d + ' days ago' : d < 14 ? 'last week' : Math.round(d / 7) + ' weeks ago'; };
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const toast = (msg) => { const t = QA.el('div', { class: 'toast', role: 'status', text: msg }); document.body.append(t); setTimeout(() => t.remove(), 2200); };
  const levelText = (l) => ['', 'Gentle read', 'Some maths', 'Heavy maths'][l] || '';
  const levelDots = (l) => '●'.repeat(l) + '○'.repeat(3 - l);

  /* ---------------- local storage (per visitor, never sent anywhere) ---------------- */
  const KEY = 'quantum-atlas:v1';
  const S = (() => {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { s = {}; }
    s.fav = s.fav || {}; s.views = s.views || {}; s.seen = s.seen || []; s.quiz = s.quiz || null;
    return s;
  })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode: fine */ } };
  const isFav = (id) => !!S.fav[id];
  const toggleFav = (id) => {
    const p = D.byId.get(id);
    if (S.fav[id]) delete S.fav[id];
    else { S.fav[id] = { t: p ? p.t : id, s: p ? p.s : '', d: p ? p.d : '', c: p ? p.c : [], at: new Date().toISOString().slice(0, 10) }; if (p) S.views[p.s] = (S.views[p.s] || 0) + 3; }
    save();
    return !!S.fav[id];
  };
  const noteView = (p) => {
    S.views[p.s] = (S.views[p.s] || 0) + 1;
    S.seen = [p.id].concat(S.seen.filter((x) => x !== p.id)).slice(0, 300);
    save();
  };

  /* ---------------- theme ---------------- */
  const themeBtn = document.getElementById('theme');
  const applyTheme = (t) => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };
  try { applyTheme(localStorage.getItem('quantum-atlas:theme')); } catch (e) {}
  themeBtn.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const t = dark ? 'light' : 'dark';
    applyTheme(t);
    try { localStorage.setItem('quantum-atlas:theme', t); } catch (e) {}
    route(); // redraw canvases with new colours
  });

  /* ---------------- data ---------------- */
  const sub = (id) => (D.concepts.subfields.find((s) => s.id === id) || { id, name: id, emoji: '•', color: '#888', plain: '' });
  const con = (id) => D.concepts.concepts.find((c) => c.id === id);
  const conName = (id) => (con(id) || { name: id }).name;
  async function loadCore() {
    const [meta, index, concepts] = await Promise.all([getJSON('data/meta.json'), getJSON('data/index.json'), getJSON('data/concepts.json')]);
    D.meta = meta; D.index = index; D.concepts = concepts;
    index.forEach((p, i) => { D.byId.set(p.id, p); D.pos.set(p.id, i); });
    const u = document.getElementById('updated');
    u.textContent = `Last updated ${new Date(meta.updated).toLocaleString()} · ${meta.count} papers from the last ${meta.days} days.`;
  }
  const loadGraph = async () => D.graph || (D.graph = await getJSON('data/graph.json'));
  const loadPaper = async (id) => {
    const p = D.byId.get(id);
    if (!p) return null;
    if (!D.shards[p.h]) D.shards[p.h] = await getJSON(`data/papers/${p.h}.json`);
    return D.shards[p.h][id];
  };

  /* ---------------- shared bits ---------------- */
  const subTag = (id) => { const s = sub(id); return `<span class="tag" style="background:${s.color}">${s.emoji} ${esc(s.name)}</span>`; };
  const conChip = (id) => `<a class="chip" href="#/learn/${esc(id)}">${esc(conName(id))}</a>`;
  const favBtn = (id) => `<button class="fav" type="button" data-fav="${esc(id)}" aria-pressed="${isFav(id)}" aria-label="Save this paper" title="Save">${isFav(id) ? '♥' : '♡'}</button>`;
  function paperCard(p) {
    const demo = QA.demos[p.m];
    return `<article class="card pcard">
      <div class="meta">${subTag(p.s)}<span>${ago(p.d)}</span>${p.k ? `<span>· cited ${p.k}×</span>` : ''}<span class="spacer"></span>${favBtn(p.id)}</div>
      <h3><a href="#/paper/${esc(p.id)}">${esc(p.t)}</a></h3>
      <p>${esc(p.x)}</p>
      <div class="meta"><span class="level" title="${levelText(p.l)}">${levelDots(p.l)} ${levelText(p.l)}</span>${demo ? `<span>· ${demo.emoji} demo: ${esc(demo.title)}</span>` : ''}</div>
      <div class="chips">${p.c.slice(0, 4).map(conChip).join('')}</div>
    </article>`;
  }
  function wireFavs(root) {
    root.querySelectorAll('[data-fav]').forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const on = toggleFav(b.dataset.fav);
      b.setAttribute('aria-pressed', on); b.textContent = on ? '♥' : '♡';
      toast(on ? 'Saved to your list' : 'Removed from your list');
    }));
  }
  function mountDemo(parent, demoId, intro) {
    const demo = QA.demos[demoId];
    if (!demo) { parent.innerHTML = '<p class="muted">This demo is still loading or missing.</p>'; return () => {}; }
    const box = QA.el('section', { class: 'card demo', 'aria-label': 'Interactive demo: ' + demo.title });
    box.innerHTML = `<div class="demo-head"><span class="emoji" aria-hidden="true">${demo.emoji || '🔬'}</span><div><h3>${esc(demo.title)}</h3><small>${esc(demo.blurb || '')}</small></div></div>
      ${intro ? `<p class="note" style="margin-top:10px">${intro}</p>` : ''}`;
    const stage = QA.el('div', { class: 'demo-stage' });
    box.append(stage);
    const after = QA.el('div');
    after.innerHTML = `${demo.explain ? `<p style="margin-top:12px">${esc(demo.explain)}</p>` : ''}
      ${demo.tryThis && demo.tryThis.length ? `<b>Try this</b><ul class="try">${demo.tryThis.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`;
    box.append(after);
    parent.append(box);
    let stop = () => {};
    try { stop = demo.mount(stage) || (() => {}); } catch (e) { console.error(e); stage.innerHTML = '<p class="muted">Sorry, this demo hit a snag.</p>'; }
    return stop;
  }
  function setNav(name) {
    document.querySelectorAll('.nav a').forEach((a) => {
      const on = a.getAttribute('href') === '#/' + name || (name === '' && a.getAttribute('href') === '#/');
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function surprise() {
    // Prefer subfields you have looked at least, so you see something different.
    const recent = D.index.filter((p) => days(p.d) <= 10 && !S.seen.includes(p.id));
    const pool = recent.length ? recent : D.index;
    const counts = {};
    for (const s of D.concepts.subfields) counts[s.id] = S.views[s.id] || 0;
    const subs = D.concepts.subfields.map((s) => s.id).filter((s) => pool.some((p) => p.s === s));
    const weights = subs.map((s) => 1 / (1 + counts[s]) ** 1.5);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0), pick = subs[0];
    for (let i = 0; i < subs.length; i++) { r -= weights[i]; if (r <= 0) { pick = subs[i]; break; } }
    const cands = pool.filter((p) => p.s === pick);
    const p = cands[Math.floor(Math.random() * cands.length)];
    location.hash = '#/paper/' + p.id;
  }

  /* ---------------- Discover ---------------- */
  const F = { q: '', sub: '', concept: '', when: '30', sort: 'new', shown: 30 };
  function viewDiscover() {
    setNav('');
    const week = D.index.filter((p) => days(p.d) <= 7).length;
    const nSub = Object.keys(D.meta.subfieldCounts).length;
    const sc = D.meta.subfieldCounts;
    $app.innerHTML = `
      <section class="hero">
        <div>
          <h1>What's new in quantum physics?</h1>
          <p class="lede">Every day this site reads the newest papers on arXiv and turns them into plain words, a hands-on demo and a map of how the ideas connect. Explore freely, save what sparks your interest, and find the corner of quantum physics that's yours.</p>
          <div class="row"><button class="btn primary" id="surprise" type="button">🎲 Show me something different</button><a class="btn" href="#/fields">🧭 Find your field</a><a class="btn" href="#/map">🕸️ See the map</a></div>
        </div>
        <div class="hero-stats">
          <div class="card stat"><b>${week}</b><span>papers this week</span></div>
          <div class="card stat"><b>${nSub}</b><span>research areas</span></div>
          <div class="card stat"><b>${Object.keys(QA.demos).length}</b><span>hands-on demos</span></div>
        </div>
      </section>
      <section aria-labelledby="trend-h"><h2 id="trend-h">🔥 ${D.meta.trendMode === 'rising' ? 'Trending this week' : 'Most talked-about this week'}</h2>
        <p class="muted">${D.meta.trendMode === 'rising' ? 'Ideas showing up more often than usual.' : 'The ideas in the most papers over the last seven days.'} Tap one to filter.</p>
        <div class="trend">${D.meta.trending.slice(0, 12).map((t) => `<button class="chip" type="button" data-concept="${esc(t.id)}" aria-pressed="${F.concept === t.id}">${esc(conName(t.id))} <span class="n">${t.week}</span>${t.score >= 1.4 ? ' <span class="up" aria-label="rising">▲</span>' : ''}</button>`).join('')}</div>
      </section>
      <section aria-labelledby="feed-h">
        <h2 id="feed-h">📰 Fresh papers</h2>
        <div class="toolbar">
          <label class="sr-only" for="q">Search papers</label>
          <input id="q" type="search" placeholder="Search titles, ideas or authors… (try “black hole” or “laser”)" value="${esc(F.q)}">
          <div class="chips-scroll" role="group" aria-label="Filter by research area">
            <button class="chip" type="button" data-sub="" aria-pressed="${!F.sub}">All areas</button>
            ${D.concepts.subfields.filter((s) => sc[s.id]).map((s) => `<button class="chip" type="button" data-sub="${s.id}" aria-pressed="${F.sub === s.id}"><span class="dot" style="background:${s.color}"></span>${esc(s.name)} <span class="n">${sc[s.id]}</span></button>`).join('')}
          </div>
          <div class="row">
            <label>When <select id="when"><option value="1">Last day</option><option value="3">Last 3 days</option><option value="7">Last week</option><option value="30">Last month</option><option value="999">Everything</option></select></label>
            <label>Sort <select id="sort"><option value="new">Newest first</option><option value="gentle">Easiest to read</option><option value="cited">Most cited</option><option value="random">Shuffle</option></select></label>
            <span class="spacer"></span><span id="count" class="muted" aria-live="polite"></span>
          </div>
        </div>
        <div id="feed" class="grid"></div>
        <div class="row" style="justify-content:center;margin-top:18px"><button class="btn" id="more" type="button">Show more</button></div>
      </section>`;
    const $q = $app.querySelector('#q'), $when = $app.querySelector('#when'), $sort = $app.querySelector('#sort');
    $when.value = F.when; $sort.value = F.sort;
    let shuffled = null;
    const draw = () => {
      const q = F.q.trim().toLowerCase();
      let list = D.index.filter((p) => days(p.d) <= +F.when);
      if (F.sub) list = list.filter((p) => p.s === F.sub || (p.s2 || []).includes(F.sub));
      if (F.concept) list = list.filter((p) => p.c.includes(F.concept));
      if (q) {
        const terms = q.split(/\s+/);
        list = list.filter((p) => {
          const hay = (p.t + ' ' + p.x + ' ' + p.a.join(' ') + ' ' + p.c.map(conName).join(' ') + ' ' + sub(p.s).name).toLowerCase();
          return terms.every((t) => hay.includes(t));
        });
      }
      if (F.sort === 'gentle') list = list.slice().sort((a, b) => a.l - b.l || b.d.localeCompare(a.d));
      if (F.sort === 'cited') list = list.slice().sort((a, b) => (b.k || 0) - (a.k || 0) || b.d.localeCompare(a.d));
      if (F.sort === 'random') { shuffled = shuffled || shuffle(list.slice()); list = shuffled.filter((p) => list.includes(p)); }
      const feed = $app.querySelector('#feed');
      feed.innerHTML = list.slice(0, F.shown).map(paperCard).join('') || `<div class="empty">No papers match. Try fewer words or a wider time range.</div>`;
      $app.querySelector('#count').textContent = plural(list.length, 'paper') + (F.concept ? ` about ${conName(F.concept)}` : '');
      $app.querySelector('#more').hidden = list.length <= F.shown;
      wireFavs(feed);
    };
    $q.addEventListener('input', () => { F.q = $q.value; F.shown = 30; draw(); });
    $when.addEventListener('change', () => { F.when = $when.value; F.shown = 30; draw(); });
    $sort.addEventListener('change', () => { F.sort = $sort.value; shuffled = null; draw(); });
    $app.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => {
      F.sub = b.dataset.sub; F.shown = 30;
      $app.querySelectorAll('[data-sub]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw();
    }));
    $app.querySelectorAll('[data-concept]').forEach((b) => b.addEventListener('click', () => {
      F.concept = F.concept === b.dataset.concept ? '' : b.dataset.concept; F.shown = 30;
      $app.querySelectorAll('[data-concept]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.concept === F.concept)); draw();
    }));
    $app.querySelector('#more').addEventListener('click', () => { F.shown += 30; draw(); });
    $app.querySelector('#surprise').addEventListener('click', surprise);
    draw();
  }

  /* ---------------- Paper ---------------- */
  const EDGE_WHY = [[1, 'shares ideas'], [2, 'same author'], [4, 'cites or is cited'], [8, 'shares references']];
  async function viewPaper(id) {
    setNav('');
    const p = D.byId.get(id);
    if (!p) {
      $app.innerHTML = `<div class="narrow"><h1>Paper not found</h1><p>This paper may have rolled off the ${D.meta.days}-day window. You can still read it on <a href="https://arxiv.org/abs/${esc(id)}">arXiv</a>.</p><p><a href="#/">Back to the newest papers</a></p></div>`;
      return;
    }
    noteView(p);
    $app.innerHTML = '<div class="loading">Opening the paper…</div>';
    const [d] = await Promise.all([loadPaper(id), loadGraph()]);
    const s = d.summary, ai = d.ai;
    const sf = sub(p.s);
    const demo = QA.demos[p.m];
    const dc = d.demoConcept ? con(d.demoConcept) : null;
    const authors = d.authors.join(', ') + (d.nauthors > d.authors.length ? ` and ${d.nauthors - d.authors.length} more` : '');
    // related papers from the graph
    const i = D.pos.get(id);
    const rel = D.graph.edges.filter((e) => e[0] === i || e[1] === i).map((e) => ({ j: e[0] === i ? e[1] : e[0], w: e[2], t: e[3] })).sort((a, b) => b.w - a.w).slice(0, 8);
    const bib = `@misc{${id.replace(/[^\w]/g, '')},\n  title = {${d.title}},\n  author = {${d.authors.join(' and ')}${d.nauthors > d.authors.length ? ' and others' : ''}},\n  year = {${d.published.slice(0, 4)}},\n  eprint = {${id}},\n  archivePrefix = {arXiv},\n  primaryClass = {${d.primary}},\n  doi = {${d.doi}}\n}`;
    $app.innerHTML = `
      <article>
        <div class="paper-head">
          <p class="row"><a href="#/">← All papers</a></p>
          <div class="row">${subTag(p.s)}${(p.s2 || []).map(subTag).join('')}<span class="muted">${esc(d.published)} · ${ago(d.published)}</span></div>
          <h1>${esc(d.title)}</h1>
          <p class="authors">${esc(authors)}</p>
          <div class="links">
            <a class="btn primary" href="https://arxiv.org/abs/${esc(id)}" target="_blank" rel="noopener">📄 Read on arXiv</a>
            <a class="btn" href="https://arxiv.org/pdf/${esc(id)}" target="_blank" rel="noopener">⬇️ PDF</a>
            <a class="btn" href="https://doi.org/${esc(d.doi)}" target="_blank" rel="noopener">🔗 DOI${d.publishedDoi ? ' (journal)' : ''}</a>
            <a class="btn" href="https://www.semanticscholar.org/arxiv/${esc(id)}" target="_blank" rel="noopener">🔎 Citations</a>
            ${favBtn(id).replace('class="fav"', 'class="btn fav-btn"').replace(/>(♥|♡)</, (m, h) => `>${h} ${isFav(id) ? 'Saved' : 'Save'}<`)}
            <button class="btn" type="button" id="cite">📋 Copy citation</button>
            <a class="btn" href="#/map?focus=${esc(id)}">🕸️ Show on map</a>
          </div>
          ${d.journal ? `<p class="muted">Published in: ${esc(d.journal)}</p>` : ''}
        </div>
        <div class="two">
          <div>
            <div class="tabs" role="tablist" ${ai ? '' : 'hidden'}>
              <button class="chip" role="tab" type="button" data-tab="rule" aria-pressed="${!ai}">Quick summary</button>
              <button class="chip" role="tab" type="button" data-tab="ai" aria-pressed="${!!ai}">AI plain-language</button>
            </div>
            <div data-pane="rule" ${ai ? 'hidden' : ''}>
              <h2 style="margin-top:.4em">In a nutshell</h2>
              <p class="card nutshell">${esc(s.tldr)}</p>
              <p>${esc(s.lead)} <span class="muted">(${levelDots(s.level)} ${levelText(s.level)})</span></p>
              ${s.context ? `<h3>The big picture</h3><p>${esc(s.context)}</p>` : ''}
              <h3>Main claims</h3>
              <ul class="claims">${s.claims.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
              ${s.impact ? `<h3>Why it matters</h3><p>${esc(s.impact)}</p>` : ''}
              <p class="note">This summary was put together automatically from the authors' own abstract, picking out the sentences where they state their results. It keeps their words, so some jargon remains; the idea cards below explain the key terms.</p>
            </div>
            ${ai ? `<div data-pane="ai">
              <h2 style="margin-top:.4em">In a nutshell</h2>
              <p class="card nutshell">${esc(ai.tldr)}</p>
              <p>${esc(ai.plain)}</p>
              <h3>Main claims</h3><ul class="claims">${(ai.claims || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
              ${ai.why ? `<h3>Why it matters</h3><p>${esc(ai.why)}</p>` : ''}
              <p class="note">Written by an AI model (${esc(ai.model || 'Claude')}) from the abstract only. It can make mistakes, so check the paper for anything important.</p>
            </div>` : ''}
            <details class="abstract card pad" style="margin-top:14px"><summary>Read the original abstract</summary><p>${esc(d.abstract)}</p>${d.comment ? `<p class="muted">Author note: ${esc(d.comment)}</p>` : ''}<p class="muted">arXiv categories: ${d.cats.map(esc).join(', ')}</p></details>
            <h2>Ideas in this paper</h2>
            <div class="concept-list">${p.c.map((cid) => { const c = con(cid); if (!c) return ''; return `<div class="card concept-item"><b><a href="#/learn/${esc(cid)}">${esc(c.name)}</a></b><span>${esc(c.plain)}</span></div>`; }).join('') || '<p class="muted">No tagged ideas yet.</p>'}</div>
          </div>
          <div>
            <h2 style="margin-top:.4em">Play with the idea</h2>
            <div id="demo-slot"></div>
            <h2>Connected papers</h2>
            <div class="card related">${rel.map((r) => { const q = D.index[r.j]; const why = EDGE_WHY.filter(([b]) => r.t & b).map(([, t]) => t).join(' · '); return `<a href="#/paper/${esc(q.id)}"><b>${esc(q.t)}</b><small>${sub(q.s).emoji} ${esc(why)}${r.t & 1 ? ': ' + q.c.filter((c) => p.c.includes(c)).slice(0, 3).map(conName).join(', ') : ''}</small></a>`; }).join('') || '<p class="pad muted">No close links yet. As more papers arrive, connections appear here.</p>'}</div>
          </div>
        </div>
      </article>`;
    const intro = dc ? `This paper is about <b>${esc(dc.name)}</b>. ${esc(dc.plain)} The demo below lets you see that idea in action.` : `A demo of a core idea in ${esc(sf.name.toLowerCase())}.`;
    cleanup.push(mountDemo($app.querySelector('#demo-slot'), p.m, intro));
    wireFavs($app);
    $app.querySelector('.fav-btn')?.addEventListener('click', (e) => { const b = e.currentTarget; setTimeout(() => { b.textContent = (isFav(id) ? '♥ Saved' : '♡ Save'); }, 0); });
    $app.querySelector('#cite').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(bib); toast('BibTeX citation copied'); } catch (e) { prompt('Copy this citation:', bib); }
    });
    $app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      $app.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      $app.querySelectorAll('[data-pane]').forEach((x) => { x.hidden = x.dataset.pane !== b.dataset.tab; });
    }));
    document.title = d.title + ' · Quantum Atlas';
  }

  /* ---------------- Map ---------------- */
  async function viewMap(params) {
    setNav('map');
    $app.innerHTML = '<div class="loading">Drawing the map…</div>';
    await loadGraph();
    $app.innerHTML = `<h1>The map of ideas</h1>
      <p class="muted narrow">Every dot is a paper, and lines join papers that share ideas, authors or references. Papers that talk about the same things gather into clusters. Switch to <b>Ideas</b> to see how the big concepts link up. Drag to move, pinch or scroll to zoom, tap a dot to learn more.</p>
      <div id="map-root"></div>`;
    cleanup.push(QA.mountMap($app.querySelector('#map-root'), {
      index: D.index, graph: D.graph, concepts: D.concepts, sub, conName, focus: params.get('focus'), concept: params.get('concept'), subFilter: params.get('sub') || '', esc, ago,
    }));
  }

  /* ---------------- Fields / PhD compass ---------------- */
  const QUIZ = [
    { q: 'What sounds like the most fun way to spend a day?', a: [
      ['Aligning lasers in a dark lab until something glows', ['atoms', 'optics', 'sensing']],
      ['Writing code that simulates a strange material', ['simulation', 'condensed', 'qml']],
      ['Proving a theorem on a whiteboard', ['information', 'computing', 'foundations']],
      ['Building and wiring a tiny chip that has to work at -273 °C', ['hardware', 'error-correction']] ] },
    { q: 'Which question keeps you up at night?', a: [
      ['What happens to information inside a black hole?', ['hep']],
      ['Can we build a computer that never makes mistakes?', ['error-correction', 'computing']],
      ['What does measurement really mean?', ['foundations', 'open-systems']],
      ['Why do some materials conduct with zero resistance?', ['condensed']] ] },
    { q: 'You would most like your work to…', a: [
      ['Make communication impossible to hack', ['communication']],
      ['Measure things more precisely than ever before', ['sensing', 'atoms']],
      ['Help design new drugs or materials', ['simulation', 'condensed']],
      ['Change how we understand the universe', ['hep', 'foundations']] ] },
    { q: 'Pick a tool:', a: [
      ['A pencil and a lot of paper', ['information', 'hep', 'foundations']],
      ['A big computer cluster', ['simulation', 'qml', 'condensed']],
      ['An optical table full of mirrors', ['optics', 'communication', 'atoms']],
      ['A dilution fridge and microwave electronics', ['hardware']] ] },
    { q: 'How do you feel about lots of maths?', a: [
      ['Love it, the more abstract the better', ['hep', 'information', 'foundations']],
      ['Happy with it if it explains an experiment', ['open-systems', 'atoms', 'sensing']],
      ['I prefer algorithms and code', ['computing', 'qml', 'simulation']],
      ['I like it practical and hands-on', ['hardware', 'optics', 'error-correction']] ] },
  ];
  function viewFields() {
    setNav('fields');
    const sc = D.meta.subfieldCounts, total = D.index.length;
    const maxC = Math.max(...Object.values(sc));
    const interest = {};
    for (const s of D.concepts.subfields) interest[s.id] = S.views[s.id] || 0;
    if (S.quiz) for (const [k, v] of Object.entries(S.quiz)) interest[k] = (interest[k] || 0) + v * 2;
    const maxI = Math.max(1, ...Object.values(interest));
    const ranked = D.concepts.subfields.slice().sort((a, b) => interest[b.id] - interest[a.id]);
    const untouched = D.concepts.subfields.filter((s) => !S.views[s.id] && sc[s.id]);
    const topConcepts = (sid) => {
      const c = {};
      for (const p of D.index) if (p.s === sid && days(p.d) <= 14) for (const x of p.c.slice(0, 4)) c[x] = (c[x] || 0) + 1;
      return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
    };
    $app.innerHTML = `<h1>Find your field 🧭</h1>
      <p class="muted narrow">Quantum physics is a big country. Here are its main regions, how busy each one is right now, and what doing a PhD there tends to look like. Your compass on the right fills in as you read and save papers. It lives only in this browser.</p>
      <div class="two">
        <div class="card pad quiz"><h2 style="margin-top:0">Quick quiz: where might you fit?</h2>
          <form id="quiz">${QUIZ.map((q, qi) => `<fieldset><legend>${qi + 1}. ${esc(q.q)}</legend>${q.a.map((a, ai) => `<label><input type="radio" name="q${qi}" value="${ai}" required> <span>${esc(a[0])}</span></label>`).join('')}</fieldset>`).join('')}
          <button class="btn primary" type="submit">See my matches</button></form>
          <div id="quiz-out" aria-live="polite"></div>
        </div>
        <div class="card compass"><h2 style="margin-top:0">Your compass</h2>
          ${Object.values(interest).some((v) => v) ? ranked.map((s) => `<div class="item" style="--sf:${s.color}"><span aria-hidden="true">${s.emoji}</span><div><small>${esc(s.name)}</small><div class="bar"><i style="width:${(100 * interest[s.id]) / maxI}%"></i></div></div><small>${interest[s.id]}</small></div>`).join('') : '<p class="muted">Nothing yet. Open a few papers or take the quiz and this will show where your curiosity points.</p>'}
          ${untouched.length ? `<p style="margin-top:14px"><b>Not explored yet:</b> ${untouched.slice(0, 5).map((s) => `<a href="#/fields/${s.id}">${s.emoji} ${esc(s.name)}</a>`).join(', ')}</p>` : ''}
          <button class="btn" type="button" id="surprise2">🎲 Show me something different</button>
        </div>
      </div>
      <h2>The regions of quantum physics</h2>
      <div class="grid">${D.concepts.subfields.map((s) => `<a class="card field" style="--sf:${s.color};text-decoration:none;color:inherit" href="#/fields/${s.id}">
          <h3><span aria-hidden="true">${s.emoji}</span> ${esc(s.name)}</h3>
          <p style="margin:0">${esc(s.plain)}</p>
          <small><b>PhD life:</b> ${esc(s.phd)}</small>
          <div><small>${plural(sc[s.id] || 0, 'paper')} in the last ${D.meta.days} days (${Math.round((100 * (sc[s.id] || 0)) / total)}%)</small><div class="bar"><i style="width:${(100 * (sc[s.id] || 0)) / maxC}%"></i></div></div>
          <small>Hot right now: ${topConcepts(s.id).map(conName).join(', ') || '—'}</small>
        </a>`).join('')}</div>`;
    $app.querySelector('#surprise2').addEventListener('click', surprise);
    const showQuiz = (scores) => {
      const top = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 3);
      $app.querySelector('#quiz-out').innerHTML = `<h3>Your top matches</h3><ol>${top.map(([k]) => `<li><a href="#/fields/${k}">${sub(k).emoji} ${esc(sub(k).name)}</a> · ${esc(sub(k).plain)}</li>`).join('')}</ol><p class="muted">Just for fun: the best way to know is to read a few papers in each and see which ones you can't stop thinking about.</p>`;
    };
    $app.querySelector('#quiz').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target), scores = {};
      QUIZ.forEach((q, qi) => { const a = q.a[+fd.get('q' + qi)]; for (const s of a[1]) scores[s] = (scores[s] || 0) + 1; });
      S.quiz = scores; save(); showQuiz(scores);
    });
    if (S.quiz) showQuiz(S.quiz);
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
    $app.innerHTML = `<p><a href="#/fields">← All fields</a></p>
      <h1>${s.emoji} ${esc(s.name)}</h1>
      <div class="two"><div><p style="font-size:1.1rem">${esc(s.plain)}</p><p><b>What a PhD here looks like:</b> ${esc(s.phd)}</p>
        <div class="row"><a class="btn primary" href="#/map?sub=${id}">🕸️ See it on the map</a><a class="btn" href="#/play/${s.demo}">${QA.demos[s.demo]?.emoji || '🔬'} Try its demo</a></div>
        <h2>Ideas people are working on</h2><div class="row">${top.map(([c, n]) => `<a class="chip" href="#/learn/${c}">${esc(conName(c))} <span class="n">${n}</span></a>`).join('')}</div>
        ${busy.length ? `<h2>Busy authors this month</h2><p class="muted">People with several new papers here. Their groups could be worth a look when you think about where to apply.</p><p>${busy.map(([a, n]) => `<a href="https://arxiv.org/search/?searchtype=author&query=${encodeURIComponent(a)}" target="_blank" rel="noopener">${esc(a)}</a> (${n})`).join(', ')}</p>` : ''}
      </div><div id="demo-slot"></div></div>
      <h2>${plural(list.length, 'recent paper')}</h2><div class="grid" id="flist">${list.slice(0, 60).map(paperCard).join('')}</div>`;
    wireFavs($app);
    cleanup.push(mountDemo($app.querySelector('#demo-slot'), s.demo));
  }

  /* ---------------- Play ---------------- */
  function demoUsage() { const u = {}; for (const p of D.index) u[p.m] = (u[p.m] || 0) + 1; return u; }
  function viewPlay() {
    setNav('play');
    const u = demoUsage();
    const demos = Object.values(QA.demos);
    $app.innerHTML = `<h1>Play 🎛️</h1><p class="muted narrow">Hands-on mini labs. Move the sliders and watch quantum physics respond. Each paper on this site links to the demo that best matches its main idea.</p>
      <div class="grid tight">${demos.map((d) => `<a class="card dcard" href="#/play/${d.id}"><span class="emoji" aria-hidden="true">${d.emoji || '🔬'}</span><b>${esc(d.title)}</b><small>${esc(d.blurb || '')}</small><small class="muted">${plural(u[d.id] || 0, 'recent paper')}</small></a>`).join('')}</div>`;
  }
  function viewDemo(id) {
    setNav('play');
    const d = QA.demos[id];
    if (!d) { location.hash = '#/play'; return; }
    const related = D.index.filter((p) => p.m === id);
    const cons = D.concepts.concepts.filter((c) => c.demo === id);
    $app.innerHTML = `<p><a href="#/play">← All demos</a></p><div class="two"><div id="demo-slot"></div><div>
      <h2 style="margin-top:.2em">Ideas you can see here</h2><div class="concept-list">${cons.map((c) => `<div class="card concept-item"><b><a href="#/learn/${c.id}">${esc(c.name)}</a></b>${esc(c.plain)}</div>`).join('')}</div>
      <h2>Papers that use this idea (${related.length})</h2><div class="card related">${related.slice(0, 12).map((q) => `<a href="#/paper/${q.id}"><b>${esc(q.t)}</b><small>${sub(q.s).emoji} ${esc(sub(q.s).name)} · ${ago(q.d)}</small></a>`).join('') || '<p class="pad muted">None in the current window.</p>'}</div>
    </div></div>`;
    cleanup.push(mountDemo($app.querySelector('#demo-slot'), id));
    document.title = d.title + ' · Quantum Atlas';
  }

  /* ---------------- Learn ---------------- */
  const PATH = ['qubit', 'superposition', 'interference', 'double-slit', 'measurement', 'entanglement', 'bell', 'decoherence', 'tunneling', 'oscillator', 'algorithms', 'qec'];
  const RESOURCES = [
    ['Quantum Country', 'https://quantum.country/', 'A free, beautifully written intro to quantum computing that helps you remember what you read.'],
    ['IBM Quantum Learning', 'https://quantum.cloud.ibm.com/learning', 'Free courses, and you can run circuits on real quantum computers.'],
    ['The Feynman Lectures, Volume III', 'https://www.feynmanlectures.caltech.edu/III_toc.html', 'Feynman\'s classic quantum lectures, free to read online.'],
    ['MIT OpenCourseWare 8.04', 'https://ocw.mit.edu/courses/8-04-quantum-physics-i-spring-2016/', 'A full university quantum physics course: videos, notes and problem sets.'],
    ['PhET simulations', 'https://phet.colorado.edu/', 'More free, playful physics simulations from the University of Colorado.'],
    ['John Preskill\'s notes', 'https://www.preskill.caltech.edu/ph229/', 'Classic graduate lecture notes on quantum information and computation.'],
    ['Error Correction Zoo', 'https://errorcorrectionzoo.org/', 'A friendly catalogue of quantum error-correcting codes.'],
    ['Quantum Algorithm Zoo', 'https://quantumalgorithmzoo.org/', 'A list of known quantum algorithms and their speed-ups.'],
    ['Quantum (the journal)', 'https://quantum-journal.org/', 'An open-access journal where many of these papers end up, free to read.'],
    ['arXiv quant-ph listing', 'https://arxiv.org/list/quant-ph/new', 'The raw daily feed this site reads from.'],
  ];
  function viewLearn() {
    setNav('learn');
    const counts = D.graph ? D.graph.conceptCounts : null;
    const cnt = (id) => (counts ? counts[id] || 0 : D.index.filter((p) => p.c.includes(id)).length);
    $app.innerHTML = `<h1>Learn 📚</h1><p class="muted narrow">New to quantum physics? Follow the path below. Each step has a short explanation, a demo to play with and real papers that use the idea. No maths needed to start.</p>
      <h2>Start here</h2><div class="path">${PATH.map((id) => { const c = con(id); const d = QA.demos[c.demo]; return `<a class="card step" style="display:block;text-decoration:none;color:inherit" href="#/learn/${id}"><b>${esc(c.name)}</b> ${d ? `<small>· ${d.emoji} ${esc(d.title)}</small>` : ''}<br><span class="muted">${esc(c.plain)}</span></a>`; }).join('')}</div>
      <h2>Glossary</h2><input type="search" id="gq" placeholder="Find a word…" aria-label="Search the glossary">
      <div class="glossary" id="gl" style="margin-top:12px"></div>
      <h2>Free places to learn more</h2><div class="grid tight">${RESOURCES.map(([n, u, t]) => `<a class="card dcard" href="${u}" target="_blank" rel="noopener"><b>${esc(n)} ↗</b><small>${esc(t)}</small></a>`).join('')}</div>`;
    const draw = (q) => {
      q = (q || '').toLowerCase();
      const list = D.concepts.concepts.filter((c) => !q || (c.name + ' ' + c.plain).toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
      $app.querySelector('#gl').innerHTML = list.map((c) => `<div class="card gl"><h3><a href="#/learn/${c.id}">${esc(c.name)}</a></h3><p style="margin:0 0 6px">${esc(c.plain)}</p><small>${sub(c.subfield).emoji} ${esc(sub(c.subfield).name)} · ${plural(cnt(c.id), 'recent paper')}</small></div>`).join('');
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
    $app.innerHTML = `<p><a href="#/learn">← Learn</a></p><h1>${esc(c.name)}</h1>
      <div class="two"><div>
        <p class="card nutshell">${esc(c.plain)}</p>
        <p>${subTag(c.subfield)}</p>
        <h3>Read more</h3><ul>${c.links.map(([n, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${esc(n)} ↗</a></li>`).join('')}</ul>
        <div class="row"><a class="btn" href="#/map?concept=${id}">🕸️ Where it sits on the map</a>${next ? `<a class="btn primary" href="#/learn/${next.id}">Next step: ${esc(next.name)} →</a>` : ''}</div>
      </div><div id="demo-slot"></div></div>
      <h2>${plural(papers.length, 'recent paper')} using this idea</h2><div class="grid">${papers.slice(0, 30).map(paperCard).join('')}</div>`;
    wireFavs($app);
    cleanup.push(mountDemo($app.querySelector('#demo-slot'), c.demo));
  }

  /* ---------------- Saved ---------------- */
  function viewSaved() {
    setNav('saved');
    const ids = Object.keys(S.fav).sort((a, b) => (S.fav[b].at || '').localeCompare(S.fav[a].at || ''));
    const card = (id) => D.byId.get(id) ? paperCard(D.byId.get(id)) : `<article class="card pcard"><div class="meta">${S.fav[id].s ? subTag(S.fav[id].s) : ''}<span class="spacer"></span>${favBtn(id)}</div><h3><a href="https://arxiv.org/abs/${esc(id)}" target="_blank" rel="noopener">${esc(S.fav[id].t)} ↗</a></h3><p>Older than ${D.meta.days} days, so it now lives on arXiv.</p></article>`;
    $app.innerHTML = `<h1>Saved ♥</h1><p class="muted narrow">Papers you've hearted. They're stored only in this browser, on this device.</p>
      ${ids.length ? `<div class="row" style="margin-bottom:14px"><button class="btn" id="exp" type="button">📋 Copy list as text</button><button class="btn" id="expb" type="button">📋 Copy as BibTeX</button><button class="btn" id="clr" type="button">Clear all</button></div><div class="grid">${ids.map(card).join('')}</div>` : '<div class="empty card pad">Nothing saved yet. Tap ♡ on any paper to keep it here.</div>'}`;
    wireFavs($app);
    const copy = async (txt, msg) => { try { await navigator.clipboard.writeText(txt); toast(msg); } catch (e) { prompt('Copy:', txt); } };
    $app.querySelector('#exp')?.addEventListener('click', () => copy(ids.map((id) => `${S.fav[id].t}\nhttps://arxiv.org/abs/${id}`).join('\n\n'), 'List copied'));
    $app.querySelector('#expb')?.addEventListener('click', () => copy(ids.map((id) => `@misc{${id.replace(/[^\w]/g, '')},\n  title = {${S.fav[id].t}},\n  eprint = {${id}},\n  archivePrefix = {arXiv},\n  doi = {10.48550/arXiv.${id}}\n}`).join('\n\n'), 'BibTeX copied'));
    $app.querySelector('#clr')?.addEventListener('click', () => { if (confirm('Remove all saved papers from this browser?')) { S.fav = {}; save(); viewSaved(); } });
  }

  /* ---------------- About ---------------- */
  function viewAbout() {
    setNav('about');
    const m = D.meta;
    $app.innerHTML = `<div class="narrow"><h1>About Quantum Atlas</h1>
      <p>Quantum Atlas is a free, open-source guide to the newest quantum physics research, made for curious people, students and anyone choosing a direction for a PhD. It was started to answer one question: <i>out of everything happening in quantum physics, what excites me most?</i></p>
      <h2>How it works</h2>
      <ol>
        <li><b>Every day</b> a GitHub Actions job asks the <a href="https://info.arxiv.org/help/api/">arXiv API</a> for the newest papers in quant-ph, plus quantum-related papers in cond-mat (quantum gases, mesoscale, strongly correlated, superconductivity), hep-th, gr-qc, physics.atom-ph and physics.optics. It waits politely between requests, as arXiv asks.</li>
        <li>It tags each paper with ideas from a hand-written list of ${D.concepts.concepts.length} concepts and sorts it into one of ${D.concepts.subfields.length} research areas.</li>
        <li>It writes a <b>quick summary</b> by picking out the sentences where the authors state what they found. No paid AI is needed. If the site owner adds an API key, an optional step also writes AI plain-language summaries, clearly labelled.</li>
        <li>It looks up reference lists on <a href="https://www.semanticscholar.org/product/api">Semantic Scholar</a> (when available) to find papers that cite each other or share references.</li>
        <li>It links papers that share ideas, authors or references, and groups them into clusters for the map.</li>
      </ol>
      <p class="note">Right now: ${m.count} papers from the last ${m.days} days, ${m.withCitations} with reference data${m.withAI ? `, ${m.withAI} with AI summaries` : ''}. Last updated ${new Date(m.updated).toLocaleString()}.</p>
      <h2>Please keep in mind</h2>
      <p>Summaries are automatic and can miss nuance or get things wrong. Many arXiv papers are preprints that haven't been peer reviewed yet. Always read the original paper before relying on a claim. The demos show the core textbook idea behind a paper, not the paper's own results.</p>
      <h2>Credits</h2>
      <ul>
        <li>Paper data: <a href="https://arxiv.org">arXiv</a>. Thank you to arXiv for use of its open access interoperability. Abstracts belong to their authors; each page links to the original.</li>
        <li>Reference and citation data: <a href="https://www.semanticscholar.org">Semantic Scholar</a> (Allen Institute for AI), under its API license.</li>
        <li>DOIs resolve through <a href="https://www.doi.org">doi.org</a>; arXiv DOIs are registered by <a href="https://datacite.org">DataCite</a>.</li>
        <li>Fonts: <a href="https://fonts.google.com/specimen/Fraunces">Fraunces</a> and <a href="https://fonts.google.com/specimen/Nunito">Nunito</a> via Google Fonts (SIL Open Font License).</li>
        <li>Concept explanations link to <a href="https://www.wikipedia.org">Wikipedia</a> and other free resources.</li>
        <li>All demos, the map and the site code are written from scratch in plain JavaScript, with no other libraries. Hosted free on <a href="https://pages.github.com">GitHub Pages</a>.</li>
      </ul>
      <h2>Your privacy</h2><p>No accounts, no tracking, no cookies. Saved papers, your compass and quiz answers stay in your browser's local storage.</p>
      <h2>Open source</h2><p>The code is on <a href="https://github.com/DanielAja/quantum-atlas">GitHub</a>. Ideas and fixes are welcome.</p></div>`;
  }

  /* ---------------- router ---------------- */
  async function route() {
    cleanup.forEach((f) => { try { f(); } catch (e) {} });
    cleanup = [];
    document.title = 'Quantum Atlas';
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const parts = path.split('/').map(decodeURIComponent);
    const params = new URLSearchParams(qs || '');
    try {
      switch (parts[0]) {
        case '': viewDiscover(); break;
        case 'paper': await viewPaper(parts.slice(1).join('/')); break;
        case 'map': await viewMap(params); break;
        case 'fields': parts[1] ? viewField(parts[1]) : viewFields(); break;
        case 'play': parts[1] ? viewDemo(parts[1]) : viewPlay(); break;
        case 'learn': await loadGraph().catch(() => {}); parts[1] ? viewConcept(parts[1]) : viewLearn(); break;
        case 'saved': viewSaved(); break;
        case 'about': viewAbout(); break;
        default: viewDiscover();
      }
    } catch (e) {
      console.error(e);
      $app.innerHTML = `<div class="empty"><h2>Something went wrong</h2><p>${esc(e.message)}</p><p><a href="#/">Go home</a></p></div>`;
    }
    if (!parts[0] || parts[0] !== 'paper') window.scrollTo(0, 0);
    else window.scrollTo(0, 0);
    $app.focus({ preventScroll: true });
  }

  window.addEventListener('hashchange', route);
  loadCore().then(route).catch((e) => {
    console.error(e);
    $app.innerHTML = `<div class="empty"><h2>Couldn't load the papers</h2><p>${esc(e.message)}</p><p>Try refreshing the page.</p></div>`;
  });
})();
