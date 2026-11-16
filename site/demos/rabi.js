/* Rabi oscillations: a two-level atom driven by a laser or microwave field. */
(function () {
  const TMAX = 5; // µs
  const TAU = 2 * Math.PI;

  // f and d are the Rabi frequency and detuning in MHz (cycles per µs); angular values are 2π times these.
  // P_e(t) = Ω²/(Ω²+Δ²) · sin²(Ω′t/2), Ω′ = √(Ω²+Δ²). Damping (simplified): the oscillating part
  // decays as e^{−γt}, so P_e → half the peak value: P_e = A·(1 − e^{−γt} cos Ω′t)/2.
  function Pe(t, f, d, g) {
    const W = TAU * f, Dl = TAU * d, W2 = W * W + Dl * Dl;
    const A = W2 > 0 ? (W * W) / W2 : 0;
    return 0.5 * A * (1 - Math.exp(-g * t) * Math.cos(Math.sqrt(W2) * t));
  }
  const peak = (f, d) => (f * f) / (f * f + d * d);

  QA.registerDemo({
    id: 'rabi',
    title: 'Rabi oscillations: flipping an atom with light',
    emoji: '💡',
    blurb: 'Shine the right light on an atom and it swings smoothly back and forth between its low and high energy states.',
    explain:
      'A steady drive pushes the atom up to its excited state, then back down, over and over: these are Rabi oscillations. ' +
      'The Rabi frequency Ω is how hard you push. If the light is off-tune (detuning Δ), the swings get faster but never reach the top. ' +
      'Timing a pulse to exactly half a swing (a "π pulse") flips the atom completely; that is how qubits are switched. ' +
      'Simplified: an ideal two-level atom; damping is a simple fade of the swings toward half the peak.',
    tryThis: [
      'Press "π pulse": the marker sits exactly at the top of the first swing.',
      'Move the detuning away from zero. The swings speed up but get smaller.',
      'Add damping. The swings die out and the atom settles at half its peak.',
    ],
    mount(root) {
      let f = 1, d = 0, g = 0, t = 0.5, playing = false;
      let loop = null, driving = false;

      const c1 = QA.canvas(root, {
        aspect: 0.5, maxHeight: 280,
        label: 'Chance that the atom is excited against time, with the chosen time marked',
        draw: drawTime,
      });
      const c2 = QA.canvas(root, {
        aspect: 0.45, maxHeight: 250,
        label: 'Resonance curve: largest possible excitation against detuning, and excitation at the chosen time',
        draw: drawRes,
      });
      QA.legend(root, [
        { label: 'excitation over time', color: 'var(--c1, #6c4cf5)' },
        { label: 'best possible vs Δ', color: 'var(--c3, #12a3a0)' },
        { label: 'at the chosen time', color: 'var(--c2, #ff7a59)' },
      ]);
      const panel = QA.ui.panel(root);
      QA.ui.slider(panel, {
        label: 'Drive strength: Rabi frequency Ω/2π', min: 0.1, max: 3, step: 0.05, value: f,
        format: (x) => x.toFixed(2) + ' MHz', onInput: (x) => { f = x; update(); },
      });
      const sD = QA.ui.slider(panel, {
        label: 'Detuning Δ/2π (how off-tune the light is)', min: -5, max: 5, step: 0.05, value: d,
        format: (x) => (x > 0 ? '+' : '') + x.toFixed(2) + ' MHz', onInput: (x) => { d = x; update(); },
      });
      QA.ui.slider(panel, {
        label: 'Damping γ', min: 0, max: 2, step: 0.05, value: g,
        format: (x) => x.toFixed(2) + ' per µs', onInput: (x) => { g = x; update(); },
      });
      const sT = QA.ui.slider(panel, {
        label: 'Pulse length t', min: 0, max: TMAX, step: 0.005, value: t,
        format: (x) => x.toFixed(3) + ' µs', onInput: (x) => { t = x; update(driving); },
      });
      const row = QA.el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' });
      panel.append(row);
      QA.ui.button(row, {
        label: 'π pulse', kind: 'primary',
        onClick: () => { if (playing) toggle(); sD.set(0); sT.set(Math.min(TMAX, 1 / (2 * f))); },
      });
      const playBtn = QA.ui.button(row, { label: 'Play', onClick: () => toggle() });
      const readout = QA.ui.readout(root);

      function toggle() {
        playing = !playing;
        playBtn.textContent = playing ? 'Pause' : 'Play';
        if (playing && !loop) {
          loop = QA.loop((dt) => {
            let nt = t + dt * (QA.reducedMotion() ? 0.25 : 0.8);
            if (nt > TMAX) nt = 0;
            driving = true; sT.set(nt); driving = false;
          });
        } else if (!playing && loop) { loop.stop(); loop = null; }
      }

      let lastSpoken = -1;
      function update(fromLoop) {
        const p = Pe(t, f, d, g), A = peak(f, d);
        const tpi = 1 / (2 * f);
        const tick = Math.floor(t * 2);
        if (!fromLoop || tick !== lastSpoken) {
          lastSpoken = tick;
          let s = `After ${t.toFixed(3)} µs the atom is excited with ${(p * 100).toFixed(0)}% chance. `;
          s += `At this detuning it can never pass ${(A * 100).toFixed(0)}%.`;
          if (Math.abs(d) < 1e-9 && Math.abs(t - tpi) < 0.006) s += ' This is a π pulse: a complete flip.';
          readout.set(s);
        }
        c1.redraw(); c2.redraw();
      }

      function drawTime(ctx, w, h) {
        const C = QA.colors();
        const P = QA.plot(ctx, w, h, { x: [0, TMAX], y: [0, 1.05], yticks: [0, 0.5, 1], xlabel: 'time (µs)', ylabel: 'P(excited)' });
        P.axes();
        const xs = [], ys = [];
        const N = Math.max(400, Math.round(P.inner.w * 2));
        for (let i = 0; i <= N; i++) { const x = (TMAX * i) / N; xs.push(x); ys.push(Pe(x, f, d, g)); }
        const A = peak(f, d);
        P.line([0, TMAX], [A, A], QA.alpha(C.c, 0.8), 1, [4, 4]);
        P.area(xs, ys, QA.alpha(C.a, 0.12));
        P.line(xs, ys, C.a, 2);
        ctx.strokeStyle = QA.alpha(C.fg, 0.5); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(P.X(t), P.Y(0)); ctx.lineTo(P.X(t), P.Y(1.05)); ctx.stroke();
        P.dot(t, Pe(t, f, d, g), 5, C.b);
      }

      function drawRes(ctx, w, h) {
        const C = QA.colors();
        const P = QA.plot(ctx, w, h, { x: [-5, 5], y: [0, 1.05], yticks: [0, 0.5, 1], xlabel: 'detuning Δ/2π (MHz)', ylabel: 'P(excited)' });
        P.axes();
        const xs = [], ya = [], yt = [];
        for (let i = 0; i <= 400; i++) { const x = -5 + (10 * i) / 400; xs.push(x); ya.push(peak(f, x)); yt.push(Pe(t, f, x, g)); }
        P.area(xs, ya, QA.alpha(C.c, 0.1));
        P.line(xs, ya, C.c, 2);
        P.line(xs, yt, C.b, 1.6, [5, 3]);
        ctx.strokeStyle = QA.alpha(C.fg, 0.5); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(P.X(d), P.Y(0)); ctx.lineTo(P.X(d), P.Y(1.05)); ctx.stroke();
        P.dot(d, peak(f, d), 5, C.c);
        P.dot(d, Pe(t, f, d, g), 4, C.b);
      }

      update();
      return () => { if (loop) loop.stop(); c1.destroy(); c2.destroy(); };
    },
  });
})();
