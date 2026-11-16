/* Quantum Atlas cosmos: every paper is a star, every research area is a spiral arm.
   One engine drives the home-page hero and the full-screen map.
   three.js is loaded through the import map in index.html. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ---------- deterministic randomness so the galaxy looks the same every visit ---------- */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gauss(r) { const u = Math.max(1e-6, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/* ---------- soft round glow texture (fake bloom, cheap on phones) ---------- */
function glowTexture(size = 128, hard = 0.0) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.12 + hard, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const STAR_VERT = /* glsl */`
  attribute float size;
  attribute float alpha;
  attribute float phase;
  attribute vec3 color;
  uniform float uTime;
  uniform float uScale;
  uniform float uTwinkle;
  uniform float uIntro;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float e = 1.0 - pow(1.0 - uIntro, 3.0);
    float ang = (1.0 - e) * (3.0 + phase * 2.0);
    vec3 p = position * e;
    p.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p.xz;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float tw = 1.0 + uTwinkle * 0.35 * sin(uTime * 1.7 + phase * 6.2831);
    gl_PointSize = size * tw * uScale / max(1.0, -mv.z);
    gl_Position = projectionMatrix * mv;
    vColor = color;
    vAlpha = alpha * min(1.0, 0.25 + uIntro * 1.5);
  }`;
const STAR_FRAG = /* glsl */`
  uniform sampler2D uTex;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(uTex, gl_PointCoord);
    float core = smoothstep(0.18, 0.0, length(gl_PointCoord - 0.5));
    vec3 col = mix(vColor, vec3(1.0), core * 0.75);
    gl_FragColor = vec4(col * t.a, t.a) * vAlpha;
  }`;

/**
 * createCosmos(container, {
 *   papers: index rows, concepts: concepts.json, graph: graph.json (optional),
 *   mode: 'hero' | 'map', reducedMotion, onHover(paper|null, x, y), onSelect(paper|concept|null)
 * })
 */
export function createCosmos(container, opts) {
  const { papers, concepts } = opts;
  const hero = opts.mode === 'hero';
  const reduced = !!opts.reducedMotion;
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
  const subs = concepts.subfields;
  const subIndex = new Map(subs.map((s, i) => [s.id, i]));

  /* ---------- renderer / scene ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(mobile ? 1.5 : 2, devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  container.append(renderer.domElement);
  renderer.domElement.className = 'cosmos-canvas';
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', 'A galaxy where each glowing star is a recent quantum physics paper, grouped by research area.');
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0c0d10, hero ? 0.0045 : 0.0028);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 2000);
  camera.position.set(0, hero ? 70 : 95, hero ? 150 : 175);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.6;
  controls.minDistance = 12;
  controls.maxDistance = 420;
  controls.autoRotate = !reduced;
  controls.autoRotateSpeed = hero ? 0.35 : 0.18;
  controls.enablePan = !hero;
  controls.enableZoom = !hero;          // let the page scroll over the hero
  controls.zoomToCursor = true;
  if (hero && mobile) controls.enableRotate = false; // don't trap swipes on phones

  /* ---------- layout: subfields on two spiral arms, clusters inside, papers around ---------- */
  const N = papers.length;
  const ARMS = 2;
  const anchors = subs.map((s, i) => {
    const arm = i % ARMS, k = Math.floor(i / ARMS), per = Math.ceil(subs.length / ARMS);
    const t = (k + 0.6) / per;
    const r = 22 + t * 92;
    const a = arm * Math.PI + t * Math.PI * 1.55;
    return new THREE.Vector3(Math.cos(a) * r, (rng(hash(s.id))() - 0.5) * 8, Math.sin(a) * r);
  });
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  const alphas = new Float32Array(N).fill(1);
  const phases = new Float32Array(N);
  const col = new THREE.Color();
  const clusterOffset = new Map();
  const now = Date.now();
  papers.forEach((p, i) => {
    const r = rng(hash(p.id));
    const si = subIndex.has(p.s) ? subIndex.get(p.s) : 0;
    const base = anchors[si];
    let off = clusterOffset.get(p.g);
    if (!off) {
      const cr = rng(hash('cl' + p.g));
      off = p.g >= 0 ? new THREE.Vector3(gauss(cr) * 7, gauss(cr) * 2.5, gauss(cr) * 7) : new THREE.Vector3();
      clusterOffset.set(p.g, off);
    }
    const spread = p.g >= 0 ? 3.6 : 7.5;
    positions[i * 3] = base.x + off.x + gauss(r) * spread;
    positions[i * 3 + 1] = base.y + off.y + gauss(r) * spread * 0.45;
    positions[i * 3 + 2] = base.z + off.z + gauss(r) * spread;
    col.set(subs[si].color);
    col.offsetHSL(0, 0.15, 0.08);
    colors.set([col.r, col.g, col.b], i * 3);
    const ageDays = (now - Date.parse(p.d + 'T00:00:00Z')) / 864e5;
    const fresh = Math.max(0, 1 - ageDays / 30);
    sizes[i] = (mobile ? 5.5 : 6.5) * (0.7 + 0.5 * fresh + Math.min(0.9, Math.sqrt(p.k || 0) * 0.18));
    phases[i] = r();
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  const tex = glowTexture();
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tex }, uTime: { value: 0 }, uScale: { value: 300 }, uTwinkle: { value: reduced ? 0 : 1 }, uIntro: { value: opts.intro && !reduced ? 0 : 1 } },
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(geo, starMat);
  scene.add(stars);

  /* ---------- background dust + nebulae per research area ---------- */
  const dustN = mobile ? 1400 : 3200, dust = new Float32Array(dustN * 3), dr = rng(7);
  for (let i = 0; i < dustN; i++) {
    const u = dr() * 2 - 1, th = dr() * Math.PI * 2, rad = 350 + dr() * 500;
    dust[i * 3] = Math.sqrt(1 - u * u) * Math.cos(th) * rad;
    dust[i * 3 + 1] = u * rad * 0.6;
    dust[i * 3 + 2] = Math.sqrt(1 - u * u) * Math.sin(th) * rad;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  const dustMat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, color: 0x9aa1ab, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
  scene.add(new THREE.Points(dustGeo, dustMat));

  const nebTex = glowTexture(256, -0.08);
  const nebulae = subs.map((s, i) => {
    const m = new THREE.SpriteMaterial({ map: nebTex, color: new THREE.Color(s.color), transparent: true, opacity: 0.10, depthWrite: false, blending: THREE.AdditiveBlending });
    const sp = new THREE.Sprite(m);
    sp.position.copy(anchors[i]);
    const cnt = papers.filter((p) => p.s === s.id).length;
    const sc = 26 + Math.sqrt(cnt) * 2.2;
    sp.scale.set(sc, sc, 1);
    scene.add(sp);
    return sp;
  });
  // the glowing core of the galaxy
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: nebTex, color: 0xe9ebee, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  core.scale.set(70, 70, 1);
  scene.add(core);

  /* ---------- links for the selected star ---------- */
  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 64), 3));
  linkGeo.setDrawRange(0, 0);
  const linkMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const linkLines = new THREE.LineSegments(linkGeo, linkMat);
  scene.add(linkLines);
  const ringTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); g.strokeStyle = 'white'; g.lineWidth = 6;
    g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthWrite: false, depthTest: false }));
  ring.visible = false; ring.scale.set(5, 5, 1);
  scene.add(ring);
  const hoverRing = ring.clone(); hoverRing.material = ring.material.clone(); hoverRing.material.opacity = 0.6;
  scene.add(hoverRing);

  /* ---------- HTML labels for research areas (and ideas) ---------- */
  const labelLayer = document.createElement('div');
  labelLayer.className = 'cosmos-labels';
  container.append(labelLayer);
  const labels = subs.map((s, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cosmos-label';
    el.style.setProperty('--c', s.color);
    el.innerHTML = `<span>${s.emoji}</span>${s.name}`;
    el.addEventListener('click', () => opts.onArea && opts.onArea(s.id));
    labelLayer.append(el);
    return { el, pos: anchors[i].clone().add(new THREE.Vector3(0, 9, 0)), id: s.id };
  });
  let ideaLabels = [];
  function setIdeas(on) {
    ideaLabels.forEach((l) => l.el.remove());
    ideaLabels = [];
    if (!on) return;
    // each idea sits at the average position of the papers that mention it
    const acc = {};
    papers.forEach((p, i) => {
      if (alphas[i] < 0.5) return;
      for (const c of p.c.slice(0, 3)) {
        const a = (acc[c] = acc[c] || [0, 0, 0, 0]);
        a[0] += positions[i * 3]; a[1] += positions[i * 3 + 1]; a[2] += positions[i * 3 + 2]; a[3]++;
      }
    });
    const top = Object.entries(acc).filter(([, a]) => a[3] >= 4).sort((x, y) => y[1][3] - x[1][3]).slice(0, mobile ? 18 : 34);
    const max = top.length ? top[0][1][3] : 1;
    ideaLabels = top.map(([id, a]) => {
      const c = concepts.concepts.find((x) => x.id === id);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'cosmos-label idea';
      el.style.setProperty('--s', (0.75 + 0.5 * Math.sqrt(a[3] / max)).toFixed(2));
      el.textContent = c ? c.name : id;
      el.addEventListener('click', () => opts.onSelect && opts.onSelect({ concept: id }));
      labelLayer.append(el);
      return { el, pos: new THREE.Vector3(a[0] / a[3], a[1] / a[3] + 3, a[2] / a[3]), id };
    });
  }
  const showAreaLabels = opts.areaLabels !== false;
  labels.forEach((l) => { l.el.hidden = !showAreaLabels; });

  /* ---------- sizing ---------- */
  let W = 1, H = 1, inset = 0;
  function resize() {
    W = container.clientWidth || 1; H = container.clientHeight || 1;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // hero: push the galaxy beside the headline (right on wide screens, up on phones)
    if (hero && opts.offset !== false) {
      if (W > 900) camera.setViewOffset(W, H, -W * 0.27, -H * 0.03, W, H);
      else camera.setViewOffset(W, H, 0, H * 0.3, W, H);
    } else if (!hero && inset > 0 && W > 900) camera.setViewOffset(W, H, -inset / 2, 0, W, H);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    starMat.uniforms.uScale.value = H * 0.9 * renderer.getPixelRatio();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  /* ---------- picking by screen-space distance ---------- */
  const v = new THREE.Vector3();
  function pick(sx, sy, radius = mobile ? 26 : 16) {
    let best = -1, bd = radius * radius;
    for (let i = 0; i < N; i++) {
      if (alphas[i] < 0.3) continue;
      v.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]).project(camera);
      if (v.z > 1) continue;
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      const d = (x - sx) ** 2 + (y - sy) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  let hovered = -1, selected = -1, downAt = null;
  const local = (e) => { const r = renderer.domElement.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const onMove = (e) => {
    if (e.pointerType === 'touch') return;
    const [x, y] = local(e);
    mouse.tx = (x / W) * 2 - 1; mouse.ty = (y / H) * 2 - 1;
    const i = pick(x, y);
    if (i !== hovered) {
      hovered = i;
      renderer.domElement.style.cursor = i >= 0 ? 'pointer' : '';
      if (i >= 0) { hoverRing.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]); }
      hoverRing.visible = i >= 0 && i !== selected;
    }
    opts.onHover && opts.onHover(i >= 0 ? papers[i] : null, e.clientX, e.clientY);
  };
  const onDown = (e) => { downAt = local(e); idle = 0; };
  const onUp = (e) => {
    if (!downAt) return;
    const [x, y] = local(e);
    const moved = Math.hypot(x - downAt[0], y - downAt[1]);
    downAt = null;
    if (moved > 8) return;
    const i = pick(x, y);
    if (i >= 0) { select(i); opts.onSelect && opts.onSelect({ paper: papers[i] }); }
    else if (!hero) { select(-1); opts.onSelect && opts.onSelect(null); }
  };
  const onLeave = () => { hovered = -1; hoverRing.visible = false; opts.onHover && opts.onHover(null); mouse.tx = mouse.ty = 0; };
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointerleave', onLeave);

  /* ---------- selection, links and camera flights ---------- */
  const neighbours = (i) => {
    const out = [];
    if (!opts.graph) return out;
    for (const e of opts.graph.edges) {
      if (e[0] === i) out.push([e[1], e[2]]);
      else if (e[1] === i) out.push([e[0], e[2]]);
    }
    return out.sort((a, b) => b[1] - a[1]).slice(0, 32).map((x) => x[0]);
  };
  function select(i) {
    selected = i;
    ring.visible = i >= 0;
    hoverRing.visible = false;
    const arr = linkGeo.attributes.position.array;
    let k = 0;
    if (i >= 0) {
      ring.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      for (const j of neighbours(i)) {
        arr.set([positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2], positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]], k * 6);
        k++;
      }
    }
    linkGeo.attributes.position.needsUpdate = true;
    linkGeo.setDrawRange(0, k * 2);
  }
  let flight = null;
  function flyTo(target, dist = 38) {
    const to = target.clone();
    const dir = camera.position.clone().sub(controls.target).normalize();
    flight = { t: 0, fromT: controls.target.clone(), toT: to, fromP: camera.position.clone(), toP: to.clone().add(dir.multiplyScalar(dist)) };
    if (reduced) flight.t = 1;
  }
  function focusPaper(id) {
    const i = papers.findIndex((p) => p.id === id);
    if (i < 0) return false;
    select(i);
    flyTo(new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]), 30);
    return true;
  }
  function focusArea(id) {
    const i = subIndex.get(id);
    if (i == null) { flyHome(); return; }
    flyTo(anchors[i], 70);
  }
  function focusConcept(id) {
    const l = ideaLabels.find((x) => x.id === id);
    if (l) { flyTo(l.pos, 55); return; }
    let x = 0, y = 0, z = 0, n = 0;
    papers.forEach((p, i) => { if (p.c.includes(id)) { x += positions[i * 3]; y += positions[i * 3 + 1]; z += positions[i * 3 + 2]; n++; } });
    if (n) flyTo(new THREE.Vector3(x / n, y / n, z / n), 60);
  }
  function focusCluster(g) {
    let x = 0, y = 0, z = 0, n = 0;
    papers.forEach((p, i) => { if (p.g === g) { x += positions[i * 3]; y += positions[i * 3 + 1]; z += positions[i * 3 + 2]; n++; } });
    if (n) flyTo(new THREE.Vector3(x / n, y / n, z / n), 34 + Math.sqrt(n) * 2);
  }
  function flyHome() {
    flight = { t: reduced ? 1 : 0, fromT: controls.target.clone(), toT: new THREE.Vector3(), fromP: camera.position.clone(), toP: new THREE.Vector3(0, 95, 175) };
  }

  /* ---------- filtering ---------- */
  function setFilter(fn) {
    for (let i = 0; i < N; i++) alphas[i] = fn(papers[i]) ? 1 : 0.07;
    geo.attributes.alpha.needsUpdate = true;
    const visible = new Set(papers.filter((p, i) => alphas[i] > 0.5).map((p) => p.s));
    labels.forEach((l, i) => { l.el.classList.toggle('dim', !visible.has(l.id)); nebulae[i].material.opacity = visible.has(l.id) ? 0.10 : 0.02; });
    if (ideaLabels.length) setIdeas(true);
  }

  /* ---------- search constellation: real links between every matching paper ---------- */
  const baseSizes = sizes.slice();
  const conGeo = new THREE.BufferGeometry();
  const MAXSEG = 6000;
  conGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXSEG * 6), 3));
  conGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXSEG * 6), 3));
  conGeo.setDrawRange(0, 0);
  const conMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const conLines = new THREE.LineSegments(conGeo, conMat);
  scene.add(conLines);
  // dotted joins between separate figures: nearest matching papers, not a real link
  const joinGeo = new THREE.BufferGeometry();
  joinGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 6), 3));
  joinGeo.setDrawRange(0, 0);
  const joinMat = new THREE.LineDashedMaterial({ color: 0xe9ebee, dashSize: 1.4, gapSize: 1.4, transparent: true, opacity: 0.7, depthWrite: false, fog: false });
  const joinLines = new THREE.LineSegments(joinGeo, joinMat);
  scene.add(joinLines);
  let starLabels = [];
  const idIndex = new Map(papers.map((p, i) => [p.id, i]));
  /* ids: matching paper ids. Draws every graph edge whose two ends both match,
     enlarges the matches, names the best-connected ones and frames the whole figure. */
  function setConstellation(ids, o = {}) {
    starLabels.forEach((l) => l.el.remove());
    starLabels = [];
    sizes.set(baseSizes);
    const set = new Set();
    for (const id of ids || []) { const i = idIndex.get(id); if (i != null) set.add(i); }
    if (!set.size) {
      conGeo.setDrawRange(0, 0);
      joinGeo.setDrawRange(0, 0);
      geo.attributes.size.needsUpdate = true;
      return { papers: 0, links: 0, groups: 0, types: {} };
    }
    const pos = conGeo.attributes.position.array, colA = conGeo.attributes.color.array;
    const degree = new Map(), parent = new Map(), types = {};
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    set.forEach((i) => parent.set(i, i));
    let k = 0;
    for (const e of opts.graph ? opts.graph.edges : []) {
      if (!set.has(e[0]) || !set.has(e[1])) continue;
      degree.set(e[0], (degree.get(e[0]) || 0) + e[2]);
      degree.set(e[1], (degree.get(e[1]) || 0) + e[2]);
      parent.set(find(e[0]), find(e[1]));
      for (const [b, n] of [[1, 'ideas'], [2, 'authors'], [4, 'citations'], [8, 'references']]) if (e[3] & b) types[n] = (types[n] || 0) + 1;
      if (k >= MAXSEG) continue;
      const a = e[0], b = e[1];
      pos.set([positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2], positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]], k * 6);
      colA.set([colors[a * 3], colors[a * 3 + 1], colors[a * 3 + 2], colors[b * 3], colors[b * 3 + 1], colors[b * 3 + 2]], k * 6);
      k++;
    }
    conGeo.attributes.position.needsUpdate = true;
    conGeo.attributes.color.needsUpdate = true;
    conGeo.setDrawRange(0, k * 2);
    conMat.opacity = k > 600 ? 0.35 : k > 200 ? 0.55 : 0.85;
    set.forEach((i) => { sizes[i] = baseSizes[i] * 1.55; });
    geo.attributes.size.needsUpdate = true;
    const roots = new Set(); set.forEach((i) => roots.add(find(i)));
    // Kruskal over the separate figures by 3D distance, so the whole search reads as one constellation
    let jk = 0;
    if (roots.size > 1 && set.size <= 400) {
      const arr = [...set], pairs = [];
      const d2 = (a, b) => (positions[a * 3] - positions[b * 3]) ** 2 + (positions[a * 3 + 1] - positions[b * 3 + 1]) ** 2 + (positions[a * 3 + 2] - positions[b * 3 + 2]) ** 2;
      for (let x = 0; x < arr.length; x++) for (let y = x + 1; y < arr.length; y++) if (find(arr[x]) !== find(arr[y])) pairs.push([d2(arr[x], arr[y]), arr[x], arr[y]]);
      pairs.sort((u, w) => u[0] - w[0]);
      const jp = joinGeo.attributes.position.array;
      for (const [, a, b] of pairs) {
        const ra = find(a), rb = find(b);
        if (ra === rb) continue;
        parent.set(ra, rb);
        jp.set([positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2], positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]], jk * 6);
        if (++jk >= 399) break;
      }
    }
    joinGeo.attributes.position.needsUpdate = true;
    joinGeo.setDrawRange(0, jk * 2);
    joinLines.computeLineDistances();
    // name the brightest stars of the figure: the most-connected matches
    const hubs = [...set].sort((a, b) => (degree.get(b) || 0) - (degree.get(a) || 0) || baseSizes[b] - baseSizes[a]).slice(0, mobile ? 4 : 7);
    starLabels = hubs.map((i) => {
      const p = papers[i];
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'cosmos-label star';
      el.style.setProperty('--c', subs[subIndex.get(p.s) || 0].color);
      el.textContent = p.t.length > 48 ? p.t.slice(0, 46).replace(/\s+\S*$/, '') + '…' : p.t;
      el.title = p.t;
      el.addEventListener('click', () => { select(i); opts.onSelect && opts.onSelect({ paper: p }); });
      labelLayer.append(el);
      return { el, pos: new THREE.Vector3(positions[i * 3], positions[i * 3 + 1] + 2.2, positions[i * 3 + 2]), id: p.id };
    });
    if (o.fly !== false) {
      const c = new THREE.Vector3(); set.forEach((i) => c.add(new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])));
      c.divideScalar(set.size);
      // frame the bulk of the figure (80th percentile), so a few far-off matches don't push the camera out
      const ds = [...set].map((i) => c.distanceTo(new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]))).sort((x, y) => x - y);
      const r = ds[Math.floor((ds.length - 1) * 0.8)];
      controls.autoRotate = false; idle = 0;
      flyTo(c, Math.min(260, Math.max(30, r * (W < H ? 2.6 : 1.9) + 12)));
    }
    return { papers: set.size, links: k, joins: jk, groups: roots.size, types, hubs: hubs.map((i) => papers[i].id) };
  }

  /* ---------- render loop (pauses when hidden or scrolled away) ---------- */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let raf = 0, running = true, visible = true, idle = 0, last = performance.now(), introStart = 0;
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) loop(); }, { threshold: 0 });
  io.observe(container);
  const onVis = () => { if (!document.hidden) loop(); };
  document.addEventListener('visibilitychange', onVis);
  controls.addEventListener('start', () => { flight = null; controls.autoRotate = false; idle = 0; });
  controls.addEventListener('end', () => { idle = 0; });
  const project = (p) => { v.copy(p).project(camera); return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H, v.z]; };
  function placeLabels() {
    const all = starLabels.concat(showAreaLabels ? labels.concat(ideaLabels) : ideaLabels);
    const placed = [];
    for (const l of all) {
      const [x, y, z] = project(l.pos);
      const off = z > 1 || x < -50 || y < -20 || x > W + 50 || y > H + 20;
      if (off) { l.el.style.opacity = 0; l.el.style.pointerEvents = 'none'; continue; }
      const w = l.el.offsetWidth || 80, h = l.el.offsetHeight || 22;
      const box = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
      const clash = placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]));
      const dist = camera.position.distanceTo(l.pos);
      const fade = Math.max(0, Math.min(1, (340 - dist) / 120));
      l.el.style.transform = `translate(${x - w / 2}px, ${y - h / 2}px)`;
      const quiet = starLabels.length && !l.el.classList.contains('star') ? 0.28 : 1;  // let the constellation's names lead
      l.el.style.opacity = clash ? 0 : fade * quiet;
      l.el.style.pointerEvents = clash || fade < 0.3 ? 'none' : 'auto';
      if (!clash) placed.push(box);
    }
  }
  function loop() {
    if (!running || !visible || document.hidden) { raf = 0; return; }
    if (raf) return;
    raf = requestAnimationFrame(frame);
  }
  function frame(t) {
    raf = 0;
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    starMat.uniforms.uTime.value = t / 1000;
    if (starMat.uniforms.uIntro.value < 1) { introStart = introStart || t; starMat.uniforms.uIntro.value = Math.min(1, (t - introStart) / 2600); }
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / 1.6);
      const e = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
      controls.target.lerpVectors(flight.fromT, flight.toT, e);
      camera.position.lerpVectors(flight.fromP, flight.toP, e);
      if (flight.t >= 1) flight = null;
    }
    idle += dt;
    if (!hero && !reduced && idle > 12 && !flight && selected < 0 && !starLabels.length) controls.autoRotate = true;
    if (hero && !reduced) {
      mouse.x += (mouse.tx - mouse.x) * 0.04; mouse.y += (mouse.ty - mouse.y) * 0.04;
      stars.rotation.x = mouse.y * 0.06; stars.rotation.z = mouse.x * -0.04;
    }
    const pulse = 1 + 0.12 * Math.sin(t / 300);
    const sc = Math.max(3, camera.position.distanceTo(ring.position) * 0.06) * pulse;
    ring.scale.set(sc, sc, 1);
    hoverRing.scale.set(sc * 0.8, sc * 0.8, 1);
    controls.update();
    renderer.render(scene, camera);
    placeLabels();
    loop();
  }
  loop();

  return {
    setFilter, setIdeas, setConstellation, focusPaper, focusArea, focusConcept, focusCluster, flyHome,
    screenPos(id) { const i = papers.findIndex((p) => p.id === id); if (i < 0) return null; const [x, y] = project(new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])); const r = renderer.domElement.getBoundingClientRect(); return [x + r.left, y + r.top]; },
    select: (id) => { const i = papers.findIndex((p) => p.id === id); select(i); },
    setInset(px) { inset = px; resize(); },
    zoom(f) { const d = camera.position.clone().sub(controls.target).multiplyScalar(f); camera.position.copy(controls.target).add(d); idle = 0; },
    destroy() {
      running = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      controls.dispose(); geo.dispose(); conGeo.dispose(); conMat.dispose(); joinGeo.dispose(); joinMat.dispose(); starMat.dispose(); tex.dispose(); nebTex.dispose(); dustGeo.dispose(); renderer.dispose(); renderer.forceContextLoss();
      renderer.domElement.remove(); labelLayer.remove();
    },
  };
}

export function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}
