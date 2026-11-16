/* Demo kit: tiny helpers shared by every interactive demo.
   Each demo file calls QA.registerDemo({...}). See site/demos/README.md. */
(function () {
  const QA = (window.QA = window.QA || {});
  QA.demos = QA.demos || {};

  QA.registerDemo = function (def) {
    if (!def || !def.id || typeof def.mount !== 'function') throw new Error('bad demo');
    QA.demos[def.id] = def;
  };

  const css = (name, fallback) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  };
  // Theme-aware colours, read fresh each draw so dark mode works.
  QA.colors = () => ({
    fg: css('--fg', '#1d1b2e'),
    muted: css('--muted', '#6b6880'),
    grid: css('--grid', 'rgba(0,0,0,0.08)'),
    bg: css('--card', '#fff'),
    a: css('--c1', '#6c4cf5'),
    b: css('--c2', '#ff7a59'),
    c: css('--c3', '#12a3a0'),
    d: css('--c4', '#e8b10c'),
  });

  /* ---------- controls ---------- */
  const el = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const kid of [].concat(kids)) if (kid) n.append(kid);
    return n;
  };
  QA.el = el;
  let uid = 0;

  QA.ui = {
    /** Panel that holds controls. Returns the element. */
    panel(parent) {
      const p = el('div', { class: 'demo-controls' });
      parent.append(p);
      return p;
    },
    /** Range slider. opts: {label, min, max, step, value, format(v), onInput(v), hint} */
    slider(parent, o) {
      const id = 'qa-s' + ++uid;
      const out = el('output', { for: id });
      const input = el('input', {
        type: 'range', id, min: o.min, max: o.max, step: o.step ?? 'any', value: o.value,
      });
      const fmt = o.format || ((v) => (+v).toFixed(2));
      const sync = () => { out.textContent = fmt(+input.value); };
      input.addEventListener('input', () => { sync(); o.onInput && o.onInput(+input.value); });
      sync();
      const wrap = el('div', { class: 'ctl ctl-slider' }, [
        el('label', { for: id }, [el('span', { text: o.label }), out]),
        input,
        o.hint ? el('small', { text: o.hint }) : null,
      ]);
      parent.append(wrap);
      return {
        get value() { return +input.value; },
        set(v) { input.value = v; sync(); o.onInput && o.onInput(+input.value); },
        input,
      };
    },
    /** Select. opts: {label, options:[{value,label}], value, onChange(v)} */
    select(parent, o) {
      const id = 'qa-sel' + ++uid;
      const s = el('select', { id });
      for (const op of o.options) s.append(el('option', { value: op.value, text: op.label }));
      if (o.value != null) s.value = o.value;
      s.addEventListener('change', () => o.onChange && o.onChange(s.value));
      parent.append(el('div', { class: 'ctl' }, [el('label', { for: id, text: o.label }), s]));
      return s;
    },
    /** Button. opts: {label, onClick, kind:'primary'|'ghost'} */
    button(parent, o) {
      const b = el('button', { type: 'button', class: 'btn ' + (o.kind || 'ghost'), text: o.label, onclick: o.onClick });
      parent.append(b);
      return b;
    },
    /** Checkbox toggle. opts: {label, value, onChange(bool)} */
    toggle(parent, o) {
      const id = 'qa-t' + ++uid;
      const c = el('input', { type: 'checkbox', id });
      c.checked = !!o.value;
      c.addEventListener('change', () => o.onChange && o.onChange(c.checked));
      parent.append(el('div', { class: 'ctl ctl-toggle' }, [c, el('label', { for: id, text: o.label })]));
      return c;
    },
    /** Live readout line. Returns {set(text)} */
    readout(parent, initial = '') {
      const r = el('div', { class: 'demo-readout', 'aria-live': 'polite', text: initial });
      parent.append(r);
      return { set: (t) => { r.textContent = t; }, el: r };
    },
  };

  /* ---------- canvas ---------- */
  /**
   * Responsive, HiDPI canvas. draw(ctx, w, h) is called on resize and by redraw().
   * aspect = height / width. Returns {canvas, ctx, redraw, width, height, destroy}.
   */
  QA.canvas = function (parent, { aspect = 0.6, maxHeight = 420, label = 'Interactive chart', draw } = {}) {
    const canvas = el('canvas', { role: 'img', 'aria-label': label, class: 'demo-canvas' });
    parent.append(canvas);
    const ctx = canvas.getContext('2d');
    const api = { canvas, ctx, width: 0, height: 0, draw };
    const size = () => {
      const w = Math.max(200, canvas.parentElement.clientWidth || 300);
      const h = Math.min(maxHeight, Math.round(w * aspect));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      api.width = w; api.height = h;
    };
    api.redraw = () => {
      if (!api.width) size();
      ctx.clearRect(0, 0, api.width, api.height);
      api.draw && api.draw(ctx, api.width, api.height);
    };
    const ro = new ResizeObserver(() => { size(); api.redraw(); });
    ro.observe(parent);
    size();
    api.destroy = () => ro.disconnect();
    return api;
  };

  /** Animation loop that stops when destroyed or tab hidden. step(dt seconds, t). */
  QA.loop = function (step) {
    let raf = 0, last = 0, running = true;
    const tick = (ts) => {
      if (!running) return;
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
      last = ts;
      step(dt, ts / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return { stop() { running = false; cancelAnimationFrame(raf); }, get running() { return running; } };
  };

  QA.reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Simple 2-D plot frame. Maps data coords to pixels and draws axes.
   * opts: {x:[min,max], y:[min,max], pad:{l,r,t,b}, xlabel, ylabel, xticks, yticks}
   * Returns {X(x), Y(y), axes(), line(xs, ys, color, width), area(...), dot(x,y,r,color), inner}
   */
  QA.plot = function (ctx, w, h, o) {
    const pad = Object.assign({ l: 44, r: 12, t: 12, b: 34 }, o.pad || {});
    const [x0, x1] = o.x, [y0, y1] = o.y;
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    const X = (x) => pad.l + ((x - x0) / (x1 - x0)) * iw;
    const Y = (y) => pad.t + ih - ((y - y0) / (y1 - y0)) * ih;
    const C = QA.colors();
    const nice = (a, b, n) => {
      const span = b - a, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
      const st = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
      const out = [];
      for (let v = Math.ceil(a / st) * st; v <= b + 1e-9; v += st) out.push(+v.toFixed(10));
      return out;
    };
    const fmt = (v) => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(0) : +v.toPrecision(3) + '');
    return {
      X, Y, inner: { l: pad.l, t: pad.t, w: iw, h: ih },
      axes() {
        ctx.save();
        ctx.strokeStyle = C.grid; ctx.fillStyle = C.muted; ctx.lineWidth = 1;
        ctx.font = '11px system-ui, sans-serif';
        const xt = o.xticks || nice(x0, x1, Math.max(2, Math.floor(iw / 70)));
        const yt = o.yticks || nice(y0, y1, Math.max(2, Math.floor(ih / 45)));
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        for (const t of xt) {
          const px = X(t);
          ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, pad.t + ih); ctx.stroke();
          ctx.fillText(fmt(t), px, pad.t + ih + 4);
        }
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        for (const t of yt) {
          const py = Y(t);
          ctx.beginPath(); ctx.moveTo(pad.l, py); ctx.lineTo(pad.l + iw, py); ctx.stroke();
          ctx.fillText(fmt(t), pad.l - 5, py);
        }
        ctx.fillStyle = C.fg;
        if (o.xlabel) { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(o.xlabel, pad.l + iw / 2, h - 2); }
        if (o.ylabel) {
          ctx.translate(11, pad.t + ih / 2); ctx.rotate(-Math.PI / 2);
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.ylabel, 0, 0);
        }
        ctx.restore();
      },
      line(xs, ys, color, width = 2, dash) {
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; if (dash) ctx.setLineDash(dash);
        ctx.beginPath();
        for (let i = 0; i < xs.length; i++) { const px = X(xs[i]), py = Y(ys[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.stroke(); ctx.restore();
      },
      area(xs, ys, color, base = 0) {
        ctx.save(); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(X(xs[0]), Y(base));
        for (let i = 0; i < xs.length; i++) ctx.lineTo(X(xs[i]), Y(ys[i]));
        ctx.lineTo(X(xs[xs.length - 1]), Y(base)); ctx.closePath(); ctx.fill(); ctx.restore();
      },
      dot(x, y, r, color) { ctx.save(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(x), Y(y), r, 0, 2 * Math.PI); ctx.fill(); ctx.restore(); },
    };
  };

  /** Legend row drawn as HTML under a canvas. items: [{label, color}] */
  QA.legend = function (parent, items) {
    const box = el('div', { class: 'demo-legend' });
    for (const it of items) box.append(el('span', {}, [el('i', { style: 'background:' + it.color }), document.createTextNode(it.label)]));
    parent.append(box);
    return box;
  };

  QA.alpha = (hex, a) => {
    if (hex.startsWith('rgb')) return hex.replace(/rgba?\(([^)]+)\)/, (m, s) => `rgba(${s.split(',').slice(0, 3).join(',')},${a})`);
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  /* ---------- tiny complex-number helpers for simulations ---------- */
  QA.cx = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1]],
    mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
    scale: (a, s) => [a[0] * s, a[1] * s],
    abs2: (a) => a[0] * a[0] + a[1] * a[1],
    exp: (th) => [Math.cos(th), Math.sin(th)],
  };
})();
