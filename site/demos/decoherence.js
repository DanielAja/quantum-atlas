/* Decoherence: T1 relaxation and T2 dephasing of a qubit, shown on the Bloch sphere and as Ramsey fringes. */
(function () {
  const TMAX = 100; // µs shown
  const YAW = -0.55, PITCH = 0.3;

  // Free evolution after a π/2 pulse (rotating frame, detuning Δ in MHz, times in µs).
  // Solution of the Bloch equations starting from (1, 0, 0), with |0⟩ (ground) at z = +1:
  //   x = e^{−t/T2} cos(2πΔt), y = e^{−t/T2} sin(2πΔt), z = 1 − e^{−t/T1}.
  function bloch(t, T1, T2, det) {
    const e = Math.exp(-t / T2), a = 2 * Math.PI * det * t;
    return [e * Math.cos(a), e * Math.sin(a), 1 - Math.exp(-t / T1)];
  }
  // Ramsey: a second π/2 pulse maps x → −z, so P(1) = (1 + x)/2.
  const ramsey = (t, T2, det) => 0.5 * (1 + Math.exp(-t / T2) * Math.cos(2 * Math.PI * det * t));

  function proj(p, cx, cy, R) {
    const [x, y, z] = p;
    const x1 = x * Math.cos(YAW) - y * Math.sin(YAW), y1 = x * Math.sin(YAW) + y * Math.cos(YAW);
    const up = z * Math.cos(PITCH) - x1 * Math.sin(PITCH);
    const depth = x1 * Math.cos(PITCH) + z * Math.sin(PITCH);
    return [cx + R * y1, cy - R * up, depth];
  }

  QA.registerDemo({
    id: 'decoherence',
    title: 'Decoherence: how qubits forget',
    emoji: '🫧',
    blurb: 'A qubit slowly leaks its quantum information into the world around it, and the delicate superposition fades.',
    explain:
      'We tip the qubit onto the equator (a perfect superposition) and let it sit. Two clocks run down. ' +
      'T2 measures how fast the qubit forgets its phase, so the arrow shrinks toward the middle. ' +
      'T1 measures how fast it loses energy and falls back to 0 at the top. T2 can never be longer than 2 × T1. ' +
      'The lower plot is a Ramsey experiment: a second pulse turns the leftover phase into a 0-or-1 signal whose wiggles fade. ' +
      'Simplified: ideal instant pulses and simple exponential decay (the Bloch equations).',
    tryThis: [
      'Press play and watch the arrow spiral inward as it drifts to the top.',
      'Set the detuning to 0: the fringes vanish and you see the pure decay envelope.',
      'Change T1 only. The Ramsey wiggles do not change, but the arrow climbs at a different speed.',
    ],
    mount(root) {
      let T1 = 60, T2 = 40, det = 0.06, t = 30, playing = !QA.reducedMotion();
      let loop = null, driving = false;

      const sph = QA.canvas(root, {
        aspect: 0.62, maxHeight: 320,
        label: 'Bloch sphere showing the qubit arrow spiralling inward and upward as it loses coherence',
        draw: drawSphere,
      });
      const plt = QA.canvas(root, {
        aspect: 0.48, maxHeight: 260,
        label: 'Ramsey fringe plot: chance of measuring 1 against waiting time, with a decaying envelope',
        draw: drawPlot,
      });
      QA.legend(root, [
        { label: 'Ramsey signal P(1)', color: 'var(--c1, #6c4cf5)' },
        { label: 'envelope e^(−t/T2)', color: 'var(--muted, #6b6880)' },
      ]);
      const panel = QA.ui.panel(root);
      const us = (x) => x.toFixed(0) + ' µs';
      const sT1 = QA.ui.slider(panel, {
        label: 'Energy-loss time T1', min: 2, max: 100, step: 1, value: T1, format: us,
        onInput: (x) => { T1 = x; if (T2 > 2 * T1) sT2.set(2 * T1); update(); },
      });
      const sT2 = QA.ui.slider(panel, {
        label: 'Phase-memory time T2', min: 1, max: 200, step: 1, value: T2, format: us,
        hint: 'Can never exceed 2 × T1; the slider is held back if you try.',
        onInput: (x) => { if (x > 2 * T1) { sT2.set(2 * T1); return; } T2 = x; update(); },
      });
      QA.ui.slider(panel, {
        label: 'Detuning Δ (drive slightly off tune)', min: 0, max: 0.2, step: 0.005, value: det,
        format: (x) => (x * 1000).toFixed(0) + ' kHz', onInput: (x) => { det = x; update(); },
      });
      const sT = QA.ui.slider(panel, {
        label: 'Time since the first pulse', min: 0, max: TMAX, step: 0.01, value: t,
        format: (x) => x.toFixed(1) + ' µs', onInput: (x) => { t = x; update(driving); },
      });
      const playBtn = QA.ui.button(panel, { label: playing ? 'Pause' : 'Play', kind: 'primary', onClick: () => { playing = !playing; setLoop(); } });
      const readout = QA.ui.readout(root);

      let lastSpoken = -1;
      function update(fromLoop) {
        const coh = Math.exp(-t / T2);
        const tick = Math.floor(t / 10);
        if (!fromLoop || tick !== lastSpoken) {
          lastSpoken = tick;
          readout.set(
            `At t = ${t.toFixed(1)} µs, ${(coh * 100).toFixed(0)}% of the coherence is left (e^(−t/T2)). ` +
            `Ramsey signal P(1) = ${ramsey(t, T2, det).toFixed(2)}. ${((1 - Math.exp(-t / T1)) * 100).toFixed(0)}% of the way back to 0 by energy loss.`
          );
        }
        sph.redraw(); plt.redraw();
      }

      function setLoop() {
        playBtn.textContent = playing ? 'Pause' : 'Play';
        if (playing && !loop) {
          loop = QA.loop((dt) => {
            let nt = t + dt * (QA.reducedMotion() ? 3 : 12);
            if (nt > TMAX) nt = 0;
            t = nt;
            driving = true;
            sT.set(t); // moves the thumb and label; update() throttles the spoken readout
            driving = false;
          });
        }
        if (!playing && loop) { loop.stop(); loop = null; }
      }

      function drawSphere(ctx, w, h) {
        const C = QA.colors();
        const cx = w * 0.4, cy = h * 0.52, R = Math.min(w * 0.3, h * 0.4);
        ctx.fillStyle = QA.alpha(C.a, 0.05);
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill();
        ctx.strokeStyle = QA.alpha(C.muted, 0.6); ctx.lineWidth = 1.2; ctx.stroke();
        const circle = (f, col) => {
          let prev = proj(f(0), cx, cy, R);
          for (let i = 1; i <= 72; i++) {
            const cur = proj(f((i / 72) * 2 * Math.PI), cx, cy, R);
            ctx.strokeStyle = prev[2] + cur[2] > 0 ? col : QA.alpha(C.muted, 0.15);
            ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(cur[0], cur[1]); ctx.stroke();
            prev = cur;
          }
        };
        ctx.lineWidth = 1;
        circle((s) => [Math.cos(s), Math.sin(s), 0], QA.alpha(C.fg, 0.5));
        circle((s) => [Math.sin(s), 0, Math.cos(s)], QA.alpha(C.muted, 0.35));
        circle((s) => [0, Math.sin(s), Math.cos(s)], QA.alpha(C.muted, 0.35));
        ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = C.fg;
        let p = proj([0, 0, 1.18], cx, cy, R); ctx.fillText('|0⟩', p[0], p[1]);
        p = proj([0, 0, -1.18], cx, cy, R); ctx.fillText('|1⟩', p[0], p[1]);
        ctx.fillStyle = C.muted;
        p = proj([1.2, 0, 0], cx, cy, R); ctx.fillText('x', p[0], p[1]);
        p = proj([0, 1.2, 0], cx, cy, R); ctx.fillText('y', p[0], p[1]);

        // trajectory so far
        const N = 240;
        ctx.strokeStyle = QA.alpha(C.b, 0.7); ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const q = proj(bloch((t * i) / N, T1, T2, det), cx, cy, R);
          i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
        }
        ctx.stroke();
        // arrow
        const v = bloch(t, T1, T2, det);
        const o = proj([0, 0, 0], cx, cy, R), tip = proj(v, cx, cy, R);
        ctx.strokeStyle = C.a; ctx.fillStyle = C.a; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
        ctx.beginPath(); ctx.arc(tip[0], tip[1], 4.5, 0, 2 * Math.PI); ctx.fill();

        // coherence bar
        const coh = Math.exp(-t / T2);
        const bx = w * 0.82, bw = Math.min(26, w * 0.08), top = h * 0.15, bot = h * 0.85;
        ctx.fillStyle = QA.alpha(C.a, 0.15); ctx.fillRect(bx - bw / 2, top, bw, bot - top);
        ctx.fillStyle = C.a; ctx.fillRect(bx - bw / 2, bot - coh * (bot - top), bw, coh * (bot - top));
        ctx.fillStyle = C.fg; ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'top';
        ctx.fillText(Math.round(coh * 100) + '%', bx, bot + 3);
        ctx.fillStyle = C.muted; ctx.textBaseline = 'bottom';
        ctx.fillText('coherence', bx, top - 3);
      }

      function drawPlot(ctx, w, h) {
        const C = QA.colors();
        const P = QA.plot(ctx, w, h, { x: [0, TMAX], y: [0, 1], yticks: [0, 0.5, 1], xlabel: 'waiting time (µs)', ylabel: 'P(1)' });
        P.axes();
        const xs = [], ys = [], up = [], dn = [];
        const N = Math.max(300, Math.round(P.inner.w * 1.5));
        for (let i = 0; i <= N; i++) {
          const x = (TMAX * i) / N, e = Math.exp(-x / T2);
          xs.push(x); ys.push(ramsey(x, T2, det)); up.push(0.5 * (1 + e)); dn.push(0.5 * (1 - e));
        }
        P.line(xs, up, C.muted, 1.2, [4, 4]);
        P.line(xs, dn, C.muted, 1.2, [4, 4]);
        P.line(xs, ys, C.a, 2);
        ctx.strokeStyle = QA.alpha(C.fg, 0.5); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(P.X(t), P.Y(0)); ctx.lineTo(P.X(t), P.Y(1)); ctx.stroke();
        P.dot(t, ramsey(t, T2, det), 5, C.b);
      }

      setLoop();
      update();
      return () => { if (loop) loop.stop(); sph.destroy(); plt.destroy(); };
    },
  });
})();
