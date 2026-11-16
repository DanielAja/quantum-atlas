/* Discrete-time quantum walk on a line vs a classical random walk.
   Coin C(theta) = [[cos, sin],[sin, -cos]] (theta = 45 deg is the Hadamard coin), then L moves left, R moves right.
   Classical comparison: fair coin, binomial distribution, spread sqrt(t). */
(function () {
  'use strict';
  const M = 100, W = 2 * M + 1;

  // log factorials for the binomial
  const lf = new Float64Array(M + 2);
  for (let i = 1; i <= M + 1; i++) lf[i] = lf[i - 1] + Math.log(i);
  function classical(t) {
    const P = new Float64Array(W);
    for (let k = 0; k <= t; k++) {
      const x = 2 * k - t;
      P[x + M] = Math.exp(lf[t] - lf[k] - lf[t - k] - t * Math.LN2);
    }
    return P;
  }

  function quantumAll(thetaDeg, init) {
    const th = (thetaDeg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
    let lr = new Float64Array(W), li = new Float64Array(W), rr = new Float64Array(W), ri = new Float64Array(W);
    const r2 = Math.SQRT1_2;
    if (init === 'L') lr[M] = 1;
    else if (init === 'R') rr[M] = 1;
    else { lr[M] = r2; ri[M] = r2; } // (|L> + i|R>)/sqrt2
    const dists = [], sig = new Float64Array(M + 1);
    const record = (t) => {
      const P = new Float64Array(W);
      let m = 0, m2 = 0;
      for (let j = 0; j < W; j++) {
        const p = lr[j] * lr[j] + li[j] * li[j] + rr[j] * rr[j] + ri[j] * ri[j];
        P[j] = p; const x = j - M; m += p * x; m2 += p * x * x;
      }
      dists.push(P);
      sig[t] = Math.sqrt(Math.max(0, m2 - m * m));
    };
    record(0);
    for (let t = 1; t <= M; t++) {
      const nlr = new Float64Array(W), nli = new Float64Array(W), nrr = new Float64Array(W), nri = new Float64Array(W);
      for (let j = 0; j < W; j++) {
        if (!(lr[j] || li[j] || rr[j] || ri[j])) continue;
        const aLr = c * lr[j] + s * rr[j], aLi = c * li[j] + s * ri[j];
        const aRr = s * lr[j] - c * rr[j], aRi = s * li[j] - c * ri[j];
        if (j > 0) { nlr[j - 1] += aLr; nli[j - 1] += aLi; }
        if (j < W - 1) { nrr[j + 1] += aRr; nri[j + 1] += aRi; }
      }
      lr = nlr; li = nli; rr = nrr; ri = nri;
      record(t);
    }
    return { dists, sig };
  }

  QA.registerDemo({
    id: 'quantumwalk',
    title: 'Quantum walk vs coin-flip walk',
    emoji: '🚶',
    blurb: 'A walker flips a coin to decide left or right. Make the coin quantum and the walker spreads out much, much faster.',
    explain:
      'A normal walker flips a coin each step and drifts slowly: after t steps it is typically √t steps from home. ' +
      'A quantum walker takes every path at once, and the paths interfere, cancelling in the middle and piling up near the edges. Its spread grows in step with t. ' +
      'This speed-up is a building block for quantum search algorithms. Simplified: one walker on a line, no noise; the classical walker always uses a fair coin.',
    tryThis: [
      'Press Play and compare the two spread curves below.',
      'Start in |L⟩ and see the walk lean to one side.',
      'Turn the coin angle toward 85° and watch the quantum walker slow down.',
    ],
    mount(root) {
      const S = { T: 60, theta: 45, init: 'S', playing: false };
      let Q = quantumAll(S.theta, S.init);
      const Cl = [];
      for (let t = 0; t <= M; t++) Cl.push(classical(t));

      const cv = QA.canvas(root, {
        aspect: 0.6, maxHeight: 360,
        label: 'Chance of finding the walker at each position: quantum bars versus classical curve',
        draw(ctx, w, h) {
          const C = QA.colors(), T = S.T;
          const P = Q.dists[T], Pc = Cl[T];
          const span = Math.max(10, T) * 1.05;
          let ymax = 0;
          for (let j = 0; j < W; j++) ymax = Math.max(ymax, P[j], Pc[j]);
          const pl = QA.plot(ctx, w, h, { x: [-span, span], y: [0, ymax * 1.1], xlabel: 'position', ylabel: 'chance', pad: { l: 46 } });
          pl.axes();
          const bw = Math.max(1, (pl.X(1) - pl.X(0)) * 1.6);
          ctx.fillStyle = QA.alpha(C.a, 0.85);
          for (let x = -T; x <= T; x += 2) {
            const p = P[x + M];
            if (p <= 0) continue;
            ctx.fillRect(pl.X(x) - bw / 2, pl.Y(p), bw, pl.Y(0) - pl.Y(p));
          }
          const xs = [], ys = [];
          for (let x = -T; x <= T; x += 2) { xs.push(x); ys.push(Pc[x + M]); }
          if (xs.length > 1) pl.line(xs, ys, C.b, 2.5);
          else pl.dot(0, 1, 4, C.b);
        },
      });
      QA.legend(root, [{ label: 'quantum walker', color: QA.colors().a }, { label: 'coin-flip walker', color: QA.colors().b }]);

      const cv2 = QA.canvas(root, {
        aspect: 0.38, maxHeight: 220,
        label: 'Spread of each walker versus number of steps',
        draw(ctx, w, h) {
          const C = QA.colors();
          const ymax = Math.max(12, Q.sig[M]) * 1.08;
          const pl = QA.plot(ctx, w, h, { x: [0, M], y: [0, ymax], xlabel: 'steps', ylabel: 'spread', pad: { l: 46 } });
          pl.axes();
          const xs = [], yq = [], yc = [];
          for (let t = 0; t <= M; t++) { xs.push(t); yq.push(Q.sig[t]); yc.push(Math.sqrt(t)); }
          pl.line(xs, yq, C.a, 2.5);
          pl.line(xs, yc, C.b, 2.5);
          pl.dot(S.T, Q.sig[S.T], 5, C.a);
          pl.dot(S.T, Math.sqrt(S.T), 5, C.b);
        },
      });

      const panel = QA.ui.panel(root);
      const readout = QA.ui.readout(root);
      const update = () => {
        cv.redraw(); cv2.redraw();
        const q = Q.sig[S.T], c = Math.sqrt(S.T);
        let msg = 'After ' + S.T + ' steps: the quantum walker is spread over about ' + q.toFixed(1) +
          ' sites, the coin-flip walker over about ' + c.toFixed(1) + '.';
        if (S.T >= 4 && c > 0) msg += ' The quantum one is ' + (q / c).toFixed(1) + '× more spread out.';
        readout.set(msg);
      };
      const recompute = () => { Q = quantumAll(S.theta, S.init); update(); };

      const stepSl = QA.ui.slider(panel, { label: 'Steps', min: 0, max: M, step: 1, value: S.T, format: (v) => String(v), onInput: (v) => { S.T = v; update(); } });
      QA.ui.slider(panel, { label: 'Coin angle', min: 5, max: 85, step: 1, value: S.theta, format: (v) => v + '°', hint: '45° is the fair Hadamard coin', onInput: (v) => { S.theta = v; recompute(); } });
      QA.ui.select(panel, {
        label: 'Starting coin',
        options: [
          { value: 'S', label: 'balanced (|L⟩ + i|R⟩)/√2' },
          { value: 'L', label: '|L⟩ (left)' },
          { value: 'R', label: '|R⟩ (right)' },
        ],
        value: S.init, onChange: (v) => { S.init = v; recompute(); },
      });
      let acc = 0;
      const playBtn = QA.ui.button(panel, {
        label: 'Play', kind: 'primary',
        onClick: () => {
          if (QA.reducedMotion()) { stepSl.set(M); return; }
          S.playing = !S.playing;
          if (S.playing && S.T >= M) stepSl.set(0);
          playBtn.textContent = S.playing ? 'Pause' : 'Play';
        },
      });
      const loop = QA.loop((dt) => {
        if (!S.playing) return;
        acc += dt * 20;
        if (acc >= 1) {
          const n = Math.floor(acc); acc -= n;
          const nt = Math.min(M, S.T + n);
          stepSl.set(nt);
          if (nt >= M) { S.playing = false; playBtn.textContent = 'Play'; }
        }
      });
      update();
      return () => { loop.stop(); cv.destroy(); cv2.destroy(); };
    },
  });
})();
