/* Quantum harmonic oscillator: energy ladder and Hermite-function wavefunctions (units ħ = m = 1). */
(function () {
  const XM = 7; // half-width of the window
  const NX = 360;
  const PI14 = Math.pow(Math.PI, -0.25);

  // Normalised eigenfunctions ψ_n(x) = (ω/π)^¼ H_n(ξ) e^{−ξ²/2} / √(2ⁿ n!), ξ = √ω x,
  // built with the stable recurrence φ_{n+1} = √(2/(n+1)) ξ φ_n − √(n/(n+1)) φ_{n−1}.
  function table(omega, nmax) {
    const xs = new Float64Array(NX + 1);
    const psi = [];
    for (let n = 0; n <= nmax; n++) psi.push(new Float64Array(NX + 1));
    const s = Math.sqrt(omega), norm = Math.pow(omega, 0.25);
    for (let i = 0; i <= NX; i++) {
      const x = -XM + (2 * XM * i) / NX;
      xs[i] = x;
      const xi = s * x;
      let pm = 0, p = PI14 * Math.exp(-xi * xi / 2);
      psi[0][i] = norm * p;
      for (let n = 0; n < nmax; n++) {
        const pn = Math.sqrt(2 / (n + 1)) * xi * p - Math.sqrt(n / (n + 1)) * pm;
        pm = p; p = pn;
        psi[n + 1][i] = norm * p;
      }
    }
    return { xs, psi };
  }

  QA.registerDemo({
    id: 'oscillator',
    title: 'The quantum spring (harmonic oscillator)',
    emoji: '🎚️',
    blurb: 'A particle on a spring can only hold certain energies, like the rungs of a ladder.',
    explain:
      'The bowl is the spring’s energy: the further from the middle, the steeper the climb. ' +
      'Quantum rules allow only evenly spaced energies, E = ħω(n + ½), so even the lowest rung is above zero. ' +
      'Each rung has its own wave; where the wave is big, you are likely to find the particle. ' +
      'Simplified: one particle, a perfect spring, units where ħ = m = 1.',
    tryThis: [
      'Count the places where the wave crosses zero. Level n has exactly n of them.',
      'Turn on the classical comparison at a high level. The quantum wiggles follow the classical curve on average.',
      'Stiffen the spring (bigger ω). The rungs spread apart and the waves get narrower.',
      'Turn on "mix with the next level" to see the blob slosh back and forth.',
    ],
    mount(root) {
      let n = 0, omega = 1, density = false, classical = false, mix = false, t = 0;
      let tab = table(omega, 11);
      let loop = null;

      const c = QA.canvas(root, {
        aspect: 0.72, maxHeight: 420,
        label: 'Parabola-shaped potential with evenly spaced energy levels and the chosen wavefunction drawn at its level',
        draw,
      });
      QA.legend(root, [
        { label: 'spring energy', color: 'var(--c4, #e8b10c)' },
        { label: 'quantum wave', color: 'var(--c1, #6c4cf5)' },
        { label: 'classical chance', color: 'var(--c2, #ff7a59)' },
      ]);
      const panel = QA.ui.panel(root);
      QA.ui.slider(panel, {
        label: 'Energy level n', min: 0, max: 10, step: 1, value: 0,
        format: (x) => x.toFixed(0), onInput: (x) => { n = Math.round(x); update(); },
      });
      QA.ui.slider(panel, {
        label: 'Spring stiffness ω', min: 0.5, max: 2, step: 0.05, value: 1,
        format: (x) => x.toFixed(2), onInput: (x) => { omega = x; tab = table(omega, 11); update(); },
      });
      QA.ui.toggle(panel, { label: 'Show chance |ψ|² instead of the wave ψ', value: false, onChange: (b) => { density = b; update(); } });
      QA.ui.toggle(panel, { label: 'Classical comparison', value: false, onChange: (b) => { classical = b; update(); } });
      QA.ui.toggle(panel, {
        label: 'Mix with the next level (sloshing)', value: false,
        onChange: (b) => { mix = b; t = 0; setLoop(); update(); },
      });
      const readout = QA.ui.readout(root);

      function setLoop() {
        if (mix && !loop) loop = QA.loop((dt) => { t += dt * (QA.reducedMotion() ? 0.3 : 1.5); c.redraw(); });
        if (!mix && loop) { loop.stop(); loop = null; }
      }

      function update() {
        const E = omega * (n + 0.5);
        let s;
        if (mix) {
          s = `Mixing levels ${n} and ${n + 1}: the blob swings back and forth once every 2π/ω = ${(2 * Math.PI / omega).toFixed(2)} time units. Average energy ${(omega * (n + 1)).toFixed(2)}.`;
        } else {
          s = `Level n = ${n}: energy E = ${(n + 0.5).toFixed(1)} ħω = ${E.toFixed(2)}. ` +
            (n === 0
              ? 'This is the lowest rung, and it is not zero: the particle can never sit perfectly still.'
              : `The wave crosses zero ${n} time${n > 1 ? 's' : ''}: spots where the particle is never found.`);
        }
        readout.set(s);
        c.redraw();
      }

      function draw(ctx, w, h) {
        const C = QA.colors();
        const Etop = omega * 11.8;
        const P = QA.plot(ctx, w, h, {
          x: [-XM, XM], y: [-0.9 * omega, Etop], xlabel: 'position x', ylabel: 'energy',
        });
        P.axes();
        const { xs, psi } = tab;

        // potential V = ½ ω² x²
        const vx = [], vy = [];
        for (let i = 0; i <= 200; i++) {
          const x = -XM + (2 * XM * i) / 200, V = 0.5 * omega * omega * x * x;
          if (V > Etop * 1.05) continue;
          vx.push(x); vy.push(V);
        }
        ctx.save();
        ctx.beginPath(); ctx.rect(P.inner.l, P.inner.t, P.inner.w, P.inner.h); ctx.clip();
        P.area(vx, vy, QA.alpha(C.d, 0.08), Etop);
        P.line(vx, vy, C.d, 2);

        // ladder
        for (let k = 0; k <= 10; k++) {
          const Ek = omega * (k + 0.5), A = Math.sqrt(2 * Ek) / omega;
          const on = mix ? k === n || k === n + 1 : k === n;
          P.line([-A, A], [Ek, Ek], on ? QA.alpha(C.fg, 0.7) : QA.alpha(C.muted, 0.35), on ? 1.4 : 1, on ? null : [3, 3]);
        }

        // wavefunction drawn at its energy level
        const amp = P.inner.h * (density ? 0.2 : 0.12);
        const Ebase = mix ? omega * (n + 1) : omega * (n + 0.5);
        const pn = psi[n], pm = psi[n + 1];
        const vals = new Float64Array(NX + 1);
        let vmax = 1e-9, dmax = 1e-9;
        const dt1 = omega * (n + 0.5) * t, dt2 = omega * (n + 1.5) * t;
        for (let i = 0; i <= NX; i++) {
          let v, dens;
          if (mix) {
            const a = pn[i], b = pm[i];
            dens = 0.5 * (a * a + b * b) + a * b * Math.cos(omega * t);
            v = density ? dens : (a * Math.cos(dt1) + b * Math.cos(dt2)) / Math.SQRT2;
            const bound = Math.abs(a) + Math.abs(b);
            vmax = Math.max(vmax, density ? bound * bound / 2 : bound / Math.SQRT2);
            dmax = Math.max(dmax, bound * bound / 2);
          } else {
            dens = pn[i] * pn[i];
            v = density ? dens : pn[i];
            vmax = Math.max(vmax, Math.abs(v));
            dmax = Math.max(dmax, dens);
          }
          vals[i] = v;
        }
        const py0 = P.Y(Ebase);
        if (density) {
          ctx.fillStyle = QA.alpha(C.a, 0.2);
          ctx.beginPath(); ctx.moveTo(P.X(xs[0]), py0);
          for (let i = 0; i <= NX; i++) ctx.lineTo(P.X(xs[i]), py0 - (amp * vals[i]) / vmax);
          ctx.lineTo(P.X(xs[NX]), py0); ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = C.a; ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let i = 0; i <= NX; i++) {
          const px = P.X(xs[i]), py = py0 - (amp * vals[i]) / vmax;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();

        // classical density 1/(π√(A² − x²)) on the same scale as |ψ|²
        if (classical) {
          const A = Math.sqrt(2 * Ebase) / omega;
          const kpx = amp / dmax; // px per unit density, matching |ψ|² drawn with density scale
          const capPx = amp * 1.6;
          ctx.strokeStyle = C.b; ctx.lineWidth = 1.8; ctx.setLineDash([5, 3]);
          ctx.beginPath();
          let started = false;
          for (let i = 0; i <= 400; i++) {
            const x = -A + (2 * A * (i + 0.5)) / 401;
            const pc = 1 / (Math.PI * Math.sqrt(Math.max(1e-12, A * A - x * x)));
            const py = py0 - Math.min(capPx, pc * kpx);
            started ? ctx.lineTo(P.X(x), py) : (ctx.moveTo(P.X(x), py), (started = true));
          }
          ctx.stroke(); ctx.setLineDash([]);
          // turning points
          ctx.fillStyle = C.b;
          for (const s of [-A, A]) { ctx.beginPath(); ctx.arc(P.X(s), py0, 3, 0, 2 * Math.PI); ctx.fill(); }
          if (!density) {
            ctx.fillStyle = C.muted; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
            ctx.fillText('tip: compare with |ψ|²', P.inner.l + P.inner.w - 4, P.inner.t + 4);
          }
        }
        ctx.restore();

        ctx.fillStyle = C.fg; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(mix ? `n = ${n} + ${n + 1}` : `n = ${n}`, P.inner.l + 4, P.inner.t + 14);
      }

      update();
      return () => { if (loop) loop.stop(); c.destroy(); };
    },
  });
})();
