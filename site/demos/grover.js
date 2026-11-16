/* Grover search on n qubits, exact state-vector simulation (all amplitudes stay real).
   One iteration = oracle (flip the sign of the marked item) + diffusion (reflect every amplitude about the mean). */
(function () {
  'use strict';

  QA.registerDemo({
    id: 'grover',
    title: 'Grover search: finding a needle faster',
    emoji: '🔎',
    blurb: 'A quantum computer can find one hidden item among N in about √N tries instead of about N/2.',
    explain:
      'Every bar is one item, and its height is its "amplitude": square it to get the chance of seeing that item. ' +
      'Each round does two moves. The oracle flips the hidden item upside down, then every bar is mirrored about the average (dashed line). That pushes the hidden one up a little more each round. ' +
      'Go past the best number of rounds and the chance drops again. Simplified: a perfect, noise-free computer with exactly one marked item.',
    tryThis: [
      'Press Step slowly and watch the flip, then the mirror about the dashed line.',
      'Keep going past the best round and see the chance fall.',
      'Set 10 qubits (1024 items): about 25 rounds instead of about 512 guesses.',
    ],
    mount(root) {
      const S = { n: 4, marked: 5, k: 0, half: false, playing: false };
      let amps, theta, kopt, kmax;

      function params() {
        const N = 1 << S.n;
        theta = Math.asin(1 / Math.sqrt(N));
        kopt = Math.max(0, Math.round(Math.PI / (4 * theta) - 0.5));
        kmax = Math.max(4, Math.ceil(Math.PI / (2 * theta)));
      }
      function simulate() {
        const N = 1 << S.n;
        amps = new Float64Array(N).fill(1 / Math.sqrt(N));
        const rounds = S.k + (S.half ? 1 : 0);
        for (let r = 0; r < rounds; r++) {
          amps[S.marked] = -amps[S.marked];
          if (r === S.k) break; // half step: oracle only
          let mean = 0;
          for (let i = 0; i < N; i++) mean += amps[i];
          mean /= N;
          for (let i = 0; i < N; i++) amps[i] = 2 * mean - amps[i];
        }
      }
      const meanAmp = () => { let m = 0; for (let i = 0; i < amps.length; i++) m += amps[i]; return m / amps.length; };

      const cv = QA.canvas(root, {
        aspect: 0.55, maxHeight: 320,
        label: 'Bar chart of the amplitude of every item, with the marked item highlighted and the average shown as a dashed line',
        draw(ctx, w, h) {
          const C = QA.colors(), N = amps.length;
          let amax = 0;
          for (let i = 0; i < N; i++) amax = Math.max(amax, Math.abs(amps[i]));
          const ym = amax * 1.15;
          const pl = QA.plot(ctx, w, h, { x: [0, N], y: [-ym, ym], xlabel: 'items (' + N + ' of them)', ylabel: 'amplitude', xticks: [], pad: { l: 46, b: 22 } });
          pl.axes();
          const bw = (pl.X(1) - pl.X(0));
          ctx.fillStyle = QA.alpha(C.a, 0.7);
          for (let i = 0; i < N; i++) {
            if (i === S.marked) continue;
            const y = pl.Y(Math.max(0, amps[i])), y2 = pl.Y(Math.min(0, amps[i]));
            ctx.fillRect(pl.X(i) + (N <= 64 ? bw * 0.1 : 0), y, N <= 64 ? bw * 0.8 : bw + 0.3, y2 - y);
          }
          const mw = Math.max(4, bw * 0.8);
          const mx = pl.X(S.marked + 0.5) - mw / 2;
          ctx.fillStyle = C.b;
          const am = amps[S.marked];
          ctx.fillRect(mx, pl.Y(Math.max(0, am)), mw, pl.Y(Math.min(0, am)) - pl.Y(Math.max(0, am)));
          // zero line and mean line
          ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(pl.X(0), pl.Y(0)); ctx.lineTo(pl.X(N), pl.Y(0)); ctx.stroke();
          const m = meanAmp();
          ctx.strokeStyle = C.fg; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(pl.X(0), pl.Y(m)); ctx.lineTo(pl.X(N), pl.Y(m)); ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = C.fg; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
          ctx.fillText('average', pl.X(N) - 2, pl.Y(m) - 2);
          ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = C.muted;
          ctx.fillText(S.half ? 'oracle just flipped the hidden item; next: mirror about the average' : 'after ' + S.k + ' full round' + (S.k === 1 ? '' : 's'), pl.inner.l + 4, pl.inner.t + 2);
        },
      });

      const cv2 = QA.canvas(root, {
        aspect: 0.4, maxHeight: 230,
        label: 'Chance of finding the hidden item versus number of rounds, with the best round marked',
        draw(ctx, w, h) {
          const C = QA.colors();
          const pl = QA.plot(ctx, w, h, { x: [0, kmax], y: [0, 1], xlabel: 'rounds', ylabel: 'chance', pad: { l: 46 } });
          pl.axes();
          ctx.strokeStyle = C.c; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(pl.X(kopt), pl.Y(0)); ctx.lineTo(pl.X(kopt), pl.Y(1)); ctx.stroke();
          ctx.setLineDash([]);
          const xs = [], ys = [];
          for (let i = 0; i <= 200; i++) { const x = (kmax * i) / 200; xs.push(x); ys.push(Math.pow(Math.sin((2 * x + 1) * theta), 2)); }
          pl.line(xs, ys, QA.alpha(C.a, 0.6), 2);
          for (let k = 0; k <= kmax; k++) pl.dot(k, Math.pow(Math.sin((2 * k + 1) * theta), 2), kmax > 30 ? 2 : 3, C.a);
          pl.dot(S.k, Math.pow(Math.sin((2 * S.k + 1) * theta), 2), 6, C.b);
          ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = C.c; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText('best: ' + kopt, pl.X(kopt) + 4, pl.inner.t + 2);
        },
      });
      const C0 = QA.colors();
      QA.legend(root, [{ label: 'hidden item', color: C0.b }, { label: 'other items', color: C0.a }, { label: 'best number of rounds', color: C0.c }]);

      const panel = QA.ui.panel(root);
      const readout = QA.ui.readout(root);
      let kSl, mSl;
      const update = () => {
        simulate(); cv.redraw(); cv2.redraw();
        const N = amps.length;
        const p = amps[S.marked] * amps[S.marked];
        readout.set(
          'After ' + S.k + ' round' + (S.k === 1 ? '' : 's') + ', looking finds the hidden item ' + (p * 100).toFixed(1) + '% of the time. ' +
          'Best is ' + kopt + ' rounds (about π/4·√N = ' + ((Math.PI / 4) * Math.sqrt(N)).toFixed(1) + '). ' +
          'Checking items one by one would take about ' + ((N + 1) / 2).toFixed(1) + ' looks on average.'
        );
      };
      QA.ui.slider(panel, {
        label: 'Qubits n', min: 2, max: 10, step: 1, value: S.n, format: (v) => v + ' (N = ' + (1 << v) + ' items)',
        onInput: (v) => {
          S.n = v; params();
          const N = 1 << v;
          mSl.input.max = N - 1;
          if (S.marked > N - 1) S.marked = N - 1;
          mSl.input.value = S.marked; mSl.input.dispatchEvent(new Event('input'));
          kSl.input.max = kmax;
          S.k = Math.min(S.k, kmax); S.half = false; kSl.input.value = S.k; kSl.input.dispatchEvent(new Event('input'));
        },
      });
      params();
      mSl = QA.ui.slider(panel, { label: 'Hidden item', min: 0, max: (1 << S.n) - 1, step: 1, value: S.marked, format: (v) => '#' + v, onInput: (v) => { S.marked = v; update(); } });
      kSl = QA.ui.slider(panel, { label: 'Rounds', min: 0, max: kmax, step: 1, value: S.k, format: (v) => String(v), onInput: (v) => { S.k = v; S.half = false; update(); } });
      const step = () => {
        if (!S.half) { if (S.k >= kmax) return false; S.half = true; update(); }
        else { S.half = false; S.k++; kSl.input.value = S.k; kSl.input.dispatchEvent(new Event('input')); }
        return true;
      };
      QA.ui.button(panel, { label: 'Step (half a round)', kind: 'primary', onClick: () => { S.playing = false; step(); } });
      const playBtn = QA.ui.button(panel, {
        label: 'Play', onClick: () => {
          if (QA.reducedMotion()) { kSl.set(kopt); return; }
          S.playing = !S.playing;
          if (S.playing && S.k >= kmax) kSl.set(0);
          playBtn.textContent = S.playing ? 'Pause' : 'Play';
        },
      });
      QA.ui.button(panel, { label: 'Reset', onClick: () => { S.playing = false; playBtn.textContent = 'Play'; kSl.set(0); } });
      let acc = 0;
      const loop = QA.loop((dt) => {
        if (!S.playing) return;
        acc += dt;
        const every = Math.max(0.08, 0.6 * Math.min(1, 6 / kmax));
        if (acc >= every) { acc = 0; if (!step()) { S.playing = false; playBtn.textContent = 'Play'; } }
      });
      update();
      return () => { loop.stop(); cv.destroy(); cv2.destroy(); };
    },
  });
})();
