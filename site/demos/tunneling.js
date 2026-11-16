/* Quantum tunnelling through a rectangular barrier: exact stationary solution for an electron. */
(function () {
  const KC = 5.1231; // √(2 m_e · 1 eV)/ħ in 1/nm: k = KC·√(E in eV)

  // Complex helpers
  const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const csc = (a, s) => [a[0] * s, a[1] * s];
  const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const cexp = (t) => [Math.cos(t), Math.sin(t)];

  // Inside the barrier the solution with value p and slope dp at x = w is
  // ψ(x) = p·Cf(s) + dp·Sf(s), s = x − w, where Cf/Sf are cos/sin (E > V0) or cosh/sinh (E < V0).
  function inside(E, V0) {
    const diff = E - V0;
    if (Math.abs(diff) < 1e-6) return { C: () => 1, S: (s) => s, dC: () => 0, dS: () => 1 };
    if (diff > 0) {
      const q = KC * Math.sqrt(diff);
      return { C: (s) => Math.cos(q * s), S: (s) => Math.sin(q * s) / q, dC: (s) => -q * Math.sin(q * s), dS: (s) => Math.cos(q * s) };
    }
    const kp = KC * Math.sqrt(-diff);
    return { C: (s) => Math.cosh(kp * s), S: (s) => Math.sinh(kp * s) / kp, dC: (s) => kp * Math.sinh(kp * s), dS: (s) => Math.cosh(kp * s) };
  }

  // Solve: region I  ψ = e^{ikx} + r e^{−ikx}; region II as above; region III ψ = t e^{ikx}.
  function solve(E, V0, w) {
    const k = KC * Math.sqrt(E);
    const f = inside(E, V0);
    // start from transmitted wave with unit amplitude, integrate back to x = 0
    const pw = cexp(k * w), dpw = cmul([0, k], cexp(k * w));
    const p0 = cadd(csc(pw, f.C(-w)), csc(dpw, f.S(-w)));
    const dp0 = cadd(csc(pw, f.dC(-w)), csc(dpw, f.dS(-w)));
    const q = cdiv(dp0, [0, k]);
    const A = csc(cadd(p0, q), 0.5), B = csc(cadd(p0, csc(q, -1)), 0.5);
    const t = cdiv([1, 0], A), r = cdiv(B, A);
    const T = t[0] * t[0] + t[1] * t[1];
    const psi = (x) => {
      if (x < 0) return cadd(cexp(k * x), cmul(r, cexp(-k * x)));
      if (x > w) return cmul(t, cexp(k * x));
      const s = x - w;
      return cmul(t, cadd(csc(pw, f.C(s)), csc(dpw, f.S(s))));
    };
    return { k, T, psi };
  }

  // Closed-form transmission (used for the T-vs-width curve; matches solve()).
  function Tformula(E, V0, w) {
    if (w <= 0) return 1;
    const diff = E - V0;
    if (Math.abs(diff) < 1e-6) { const k = KC * Math.sqrt(E); return 1 / (1 + (k * w) * (k * w) / 4); }
    if (diff < 0) { const s = Math.sinh(KC * Math.sqrt(-diff) * w); return 1 / (1 + (V0 * V0 * s * s) / (4 * E * -diff)); }
    const s = Math.sin(KC * Math.sqrt(diff) * w); return 1 / (1 + (V0 * V0 * s * s) / (4 * E * diff));
  }

  function inWords(T) {
    if (T > 0.995) return 'almost every electron gets through';
    if (T > 0.5) return `about ${Math.round(T * 100)} in 100 electrons get through`;
    if (T < 1e-15) return 'practically none get through';
    const n = 1 / T;
    const big = n >= 1e9 ? (n / 1e9).toPrecision(2) + ' billion' : n >= 1e6 ? (n / 1e6).toPrecision(2) + ' million' : Math.round(n).toLocaleString();
    return `about 1 in ${big} electrons gets through`;
  }

  QA.registerDemo({
    id: 'tunneling',
    title: 'Quantum tunnelling through a wall',
    emoji: '🚇',
    blurb: 'An electron can slip through a wall it does not have the energy to climb over.',
    explain:
      'An electron arrives from the left as a wave. Where the wall is higher than its energy, a ball would bounce back every time. ' +
      'The wave does not stop dead: it fades away inside the wall, and if the wall is thin, some of it reaches the other side. ' +
      'That leftover is the chance to tunnel. It shrinks very fast as the wall gets wider. ' +
      'Exact solution for one electron and a flat-topped barrier (energies in eV, distances in nanometres); real barriers have rounder shapes.',
    tryThis: [
      'Make the wall wider bit by bit. The chance to get through drops by a big factor each step.',
      'Raise the energy above the wall. Even then some electrons bounce back.',
      'Above the wall, look for widths where T hits 100%: the waves inside fit just right.',
    ],
    mount(root) {
      let E = 2, V0 = 4, w = 0.3, phase = 0;
      let showProb = true;
      let sol = solve(E, V0, w);
      let loop = null;

      const c = QA.canvas(root, {
        aspect: 0.6, maxHeight: 360,
        label: 'Potential barrier with the electron wavefunction drawn at its energy: incoming wave on the left, fading inside the barrier, transmitted wave on the right',
        draw,
      });
      QA.legend(root, [
        { label: 'barrier height', color: 'var(--c4, #e8b10c)' },
        { label: 'wave (real part)', color: 'var(--c1, #6c4cf5)' },
        { label: 'chance density |ψ|²', color: 'var(--c2, #ff7a59)' },
      ]);
      const tc = QA.canvas(root, {
        aspect: 0.42, maxHeight: 240,
        label: 'Transmission probability against barrier width on a logarithmic scale, with the current width marked',
        draw: drawT,
      });
      const panel = QA.ui.panel(root);
      QA.ui.slider(panel, {
        label: 'Electron energy E', min: 0.1, max: 10, step: 0.05, value: E,
        format: (x) => x.toFixed(2) + ' eV', onInput: (x) => { E = x; update(); },
      });
      QA.ui.slider(panel, {
        label: 'Wall height V₀', min: 0.5, max: 10, step: 0.1, value: V0,
        format: (x) => x.toFixed(1) + ' eV', onInput: (x) => { V0 = x; update(); },
      });
      QA.ui.slider(panel, {
        label: 'Wall width', min: 0.05, max: 2, step: 0.01, value: w,
        format: (x) => x.toFixed(2) + ' nm', onInput: (x) => { w = x; update(); },
      });
      QA.ui.toggle(panel, { label: 'Show chance density |ψ|²', value: true, onChange: (b) => { showProb = b; c.redraw(); } });
      const readout = QA.ui.readout(root);

      function update() {
        sol = solve(E, V0, w);
        const T = sol.T;
        const pct = T >= 0.01 ? (T * 100).toFixed(1) + '%' : T.toExponential(1).replace('e', '×10^');
        readout.set(
          `Transmission T = ${pct}: ${inWords(T)}. ` +
          (E < V0 ? 'A classical ball with this energy would never get over.' : 'A classical ball would always get over, yet some waves reflect.')
        );
        c.redraw(); tc.redraw();
      }

      function draw(ctx, w0, h) {
        const C = QA.colors();
        const Em = Math.max(E, V0);
        const xa = -2, xb = w + 2;
        const P = QA.plot(ctx, w0, h, {
          x: [xa, xb], y: [-0.5 * Em, 1.55 * Em], yticks: [], xlabel: 'position (nm)', ylabel: 'energy', pad: { l: 22 },
        });
        P.axes();
        // potential
        ctx.fillStyle = QA.alpha(C.d, 0.22);
        ctx.fillRect(P.X(0), P.Y(V0), P.X(w) - P.X(0), P.Y(0) - P.Y(V0));
        P.line([xa, 0, 0, w, w, xb], [0, 0, V0, V0, 0, 0], C.d, 2);
        // energy level
        P.line([xa, xb], [E, E], QA.alpha(C.fg, 0.45), 1, [5, 4]);
        ctx.fillStyle = C.fg; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText('E = ' + E.toFixed(2) + ' eV', P.X(xa) + 4, P.Y(E) - 2);
        ctx.fillStyle = C.d; ctx.textAlign = 'center';
        ctx.fillText('V₀', (P.X(0) + P.X(w)) / 2, P.Y(V0) - 2);

        // wavefunction drawn around the energy line
        const s = 0.22 * Em;
        const N = Math.max(300, Math.round(P.inner.w * 1.5));
        const xs = [], re = [], pr = [];
        const rot = cexp(-phase);
        for (let i = 0; i <= N; i++) {
          const x = xa + ((xb - xa) * i) / N;
          const p = sol.psi(x);
          xs.push(x);
          re.push(E + s * cmul(p, rot)[0]);
          pr.push(E + (s / 2) * (p[0] * p[0] + p[1] * p[1]));
        }
        if (showProb) {
          P.area(xs, pr, QA.alpha(C.b, 0.18), E);
          P.line(xs, pr, C.b, 1.6);
        }
        P.line(xs, re, C.a, 2);
        ctx.fillStyle = C.muted; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText('electron arrives from the left →', w0 - 14, 14);
      }

      function drawT(ctx, w0, h) {
        const C = QA.colors();
        const ws = [], ls = [];
        let lo = 0;
        for (let i = 0; i <= 200; i++) {
          const x = (2 * i) / 200; ws.push(x);
          const l = Math.log10(Math.max(1e-300, Tformula(E, V0, x)));
          ls.push(l); lo = Math.min(lo, l);
        }
        lo = Math.max(-30, Math.floor(lo) - (lo > -1 ? 1 : 0));
        if (lo > -1) lo = -1;
        const P = QA.plot(ctx, w0, h, {
          x: [0, 2], y: [lo, 0.2], xlabel: 'wall width (nm)', ylabel: 'log₁₀ T',
        });
        P.axes();
        P.line(ws, ls.map((l) => Math.max(lo, l)), C.a, 2);
        const lt = Math.max(lo, Math.log10(Math.max(1e-300, sol.T)));
        ctx.strokeStyle = QA.alpha(C.fg, 0.5); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(P.X(w), P.Y(lo)); ctx.lineTo(P.X(w), P.Y(0.2)); ctx.stroke();
        P.dot(w, lt, 5, C.b);
        ctx.fillStyle = C.muted; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText('−3 means 1 in 1000', w0 - 14, 14);
      }

      if (!QA.reducedMotion()) {
        loop = QA.loop((dt) => { phase += dt * 2.5; c.redraw(); });
      }
      update();
      return () => { if (loop) loop.stop(); c.destroy(); tc.destroy(); };
    },
  });
})();
