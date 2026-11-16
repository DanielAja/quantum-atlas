/* Quantum sensing: standard quantum limit vs squeezing vs Heisenberg (GHZ) limit.
   SQL: dphi = 1/sqrt(nu N); squeezed: e^{-r}/sqrt(nu N) (never below Heisenberg); GHZ: 1/(N sqrt(nu)).
   Simple dephasing: each probe keeps coherence e^{-gamma}; a GHZ state of N probes keeps e^{-N gamma}.
   Uncertainty is divided by that fringe contrast. */
(function () {
  'use strict';
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const pow10 = (e) => (e === 0 ? '1' : e === 1 ? '10' : '10' + String(e).split('').map((c) => SUP[c]).join(''));
  const fmtN = (v) => { const n = Math.round(Math.pow(10, v)); return String(n); };
  const fmtPhi = (x) => (x >= 0.1 ? x.toFixed(2) : x >= 0.001 ? x.toPrecision(2) : x.toExponential(1));

  QA.registerDemo({
    id: 'metrology',
    title: 'Quantum sensors: beating the noise limit',
    emoji: '🎯',
    blurb: 'Many atoms working as a team can measure tiny changes far more sharply than the same atoms working alone.',
    explain:
      'A sensor reads a tiny "phase" shift, a twist caused by a magnetic field, gravity or time. With N independent atoms the error shrinks like 1/√N: the standard quantum limit. ' +
      'Squeezed atoms share their noise cleverly and do better. Fully entangled GHZ atoms act as one giant atom that twists N times faster, reaching the Heisenberg limit 1/N. ' +
      'The catch: entanglement is fragile, and a GHZ state loses its signal N times faster too. Simplified: ideal readout, a single simple dephasing rate, and squeezing treated as a fixed noise reduction.',
    tryThis: [
      'Pick GHZ with 100 probes and compare its error with independent probes.',
      'Add a little decoherence and watch the GHZ curve turn back up.',
      'Look at the fringe: the GHZ wiggle is N times narrower.',
    ],
    mount(root) {
      const S = { lN: 2, lnu: 1, mode: 'ghz', db: 10, gamma: 0 };
      const N = () => Math.round(Math.pow(10, S.lN));
      const nu = () => Math.round(Math.pow(10, S.lnu));
      function dphi(mode, n, v) {
        const g = S.gamma;
        if (mode === 'ind') return 1 / (Math.exp(-g) * Math.sqrt(v * n));
        if (mode === 'sq') {
          const er = Math.pow(10, -S.db / 20);
          return Math.max(er / Math.sqrt(v * n), 1 / (n * Math.sqrt(v))) / Math.exp(-g);
        }
        return 1 / (n * Math.exp(-n * g) * Math.sqrt(v));
      }

      const cv = QA.canvas(root, {
        aspect: 0.62, maxHeight: 340,
        label: 'Log-log plot of phase uncertainty versus number of probes for independent, squeezed and GHZ probes',
        draw(ctx, w, h) {
          const C = QA.colors(), v = nu();
          const Y1 = Math.ceil(Math.log10(1 / Math.sqrt(v)) + 0.6), Y0 = Math.floor(Math.log10(1 / (1000 * Math.sqrt(v))) - 0.3);
          const pl = QA.plot(ctx, w, h, { x: [0, 3], y: [Y0, Y1], xticks: [], yticks: [], xlabel: 'number of probes N', ylabel: 'error Δφ (rad)', pad: { l: 50, b: 36, t: 10 } });
          ctx.save();
          ctx.strokeStyle = C.grid; ctx.fillStyle = C.muted; ctx.font = '11px system-ui, sans-serif'; ctx.lineWidth = 1;
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          for (let e = 0; e <= 3; e++) { ctx.beginPath(); ctx.moveTo(pl.X(e), pl.Y(Y0)); ctx.lineTo(pl.X(e), pl.Y(Y1)); ctx.stroke(); ctx.fillText(pow10(e), pl.X(e), pl.Y(Y0) + 4); }
          ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          const ys = Y1 - Y0 > 5 ? 2 : 1;
          for (let e = Y1; e >= Y0; e -= ys) { ctx.beginPath(); ctx.moveTo(pl.X(0), pl.Y(e)); ctx.lineTo(pl.X(3), pl.Y(e)); ctx.stroke(); ctx.fillText(pow10(e), pl.X(0) - 5, pl.Y(e)); }
          ctx.restore();
          pl.axes();
          ctx.save(); ctx.beginPath(); ctx.rect(pl.inner.l, pl.inner.t, pl.inner.w, pl.inner.h); ctx.clip();
          const modes = [['ind', C.a], ['sq', C.c], ['ghz', C.b]];
          for (const [m, col] of modes) {
            const xs = [], yv = [];
            for (let i = 0; i <= 150; i++) { const lx = (3 * i) / 150; xs.push(lx); yv.push(Math.min(Y1 + 2, Math.log10(dphi(m, Math.pow(10, lx), v)))); }
            pl.line(xs, yv, m === S.mode ? col : QA.alpha(col, 0.45), m === S.mode ? 3 : 1.5);
          }
          const cur = Math.log10(dphi(S.mode, N(), v));
          pl.dot(S.lN, Math.min(Y1, cur), 6, S.mode === 'ind' ? C.a : S.mode === 'sq' ? C.c : C.b);
          ctx.restore();
        },
      });
      const C0 = QA.colors();
      QA.legend(root, [{ label: 'independent (1/√N)', color: C0.a }, { label: 'squeezed', color: C0.c }, { label: 'GHZ (1/N)', color: C0.b }]);

      const cv2 = QA.canvas(root, {
        aspect: 0.42, maxHeight: 230,
        label: 'Ramsey fringe: chance of reading 0 versus phase, for one probe and for an N-probe GHZ state',
        draw(ctx, w, h) {
          const C = QA.colors(), n = N();
          const half = Math.PI * Math.min(1, 6 / n);
          const pl = QA.plot(ctx, w, h, { x: [-half, half], y: [0, 1], xlabel: 'phase φ (rad)' + (half < Math.PI ? ', zoomed in' : ''), ylabel: 'chance', pad: { l: 46 } });
          pl.axes();
          const xs = [], y1 = [], yg = [];
          const c1 = Math.exp(-S.gamma), cg = Math.exp(-n * S.gamma);
          for (let i = 0; i <= 400; i++) {
            const x = -half + (2 * half * i) / 400;
            xs.push(x); y1.push((1 + c1 * Math.cos(x)) / 2); yg.push((1 + cg * Math.cos(n * x)) / 2);
          }
          pl.line(xs, y1, C.a, 2.5);
          pl.line(xs, yg, C.b, 2.5);
          ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText('GHZ of ' + n + ' wiggles ' + n + '× faster', pl.inner.l + 4, pl.inner.t + 2);
        },
      });

      QA.legend(root, [{ label: 'one probe', color: C0.a }, { label: 'GHZ of N probes', color: C0.b }]);

      const panel = QA.ui.panel(root);
      const readout = QA.ui.readout(root);
      const update = () => {
        cv.redraw(); cv2.redraw();
        const n = N(), v = nu(), ind = dphi('ind', n, v), mine = dphi(S.mode, n, v);
        const name = S.mode === 'ind' ? 'independent' : S.mode === 'sq' ? 'squeezed' : 'GHZ';
        let msg = n + ' probes × ' + v + ' repeats: independent probes give an error of ±' + fmtPhi(ind) + ' rad';
        if (S.mode === 'ind') msg += ' (the standard quantum limit).';
        else {
          const r = ind / mine;
          msg += '; ' + name + ' gives ±' + fmtPhi(mine) + ' rad, ' + (r >= 1 ? r.toFixed(r < 10 ? 1 : 0) + '× sharper.' : (1 / r).toFixed(1) + '× worse.');
        }
        if (S.mode === 'ghz' && S.gamma > 0) msg += ' With this much noise the best GHZ size is about ' + Math.round(1 / S.gamma) + ' probes.';
        readout.set(msg);
      };
      QA.ui.slider(panel, { label: 'Probes N', min: 0, max: 3, step: 0.01, value: S.lN, format: fmtN, onInput: (v) => { S.lN = v; update(); } });
      QA.ui.slider(panel, { label: 'Repeats ν', min: 0, max: 3, step: 0.01, value: S.lnu, format: fmtN, hint: 'how many times the measurement is repeated', onInput: (v) => { S.lnu = v; update(); } });
      QA.ui.select(panel, {
        label: 'Teamwork (entanglement)',
        options: [{ value: 'ind', label: 'Independent probes' }, { value: 'sq', label: 'Squeezed' }, { value: 'ghz', label: 'GHZ (fully entangled)' }],
        value: S.mode, onChange: (v) => { S.mode = v; update(); },
      });
      QA.ui.slider(panel, { label: 'Squeezing', min: 0, max: 20, step: 0.5, value: S.db, format: (v) => v.toFixed(1) + ' dB', hint: 'noise cut by 10^(dB/20)', onInput: (v) => { S.db = v; update(); } });
      QA.ui.slider(panel, { label: 'Decoherence γ', min: 0, max: 0.05, step: 0.001, value: S.gamma, format: (v) => v.toFixed(3), hint: 'signal lost per probe during one measurement', onInput: (v) => { S.gamma = v; update(); } });
      update();
      return () => { cv.destroy(); cv2.destroy(); };
    },
  });
})();
