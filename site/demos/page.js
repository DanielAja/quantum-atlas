/* Entanglement entropy and the Page curve.
   Page (1993): average entanglement entropy of an m x n_ split of a random pure state (m <= n_):
   S = sum_{j=n_+1}^{m n_} 1/j - (m-1)/(2 n_)   (nats), converted to bits here.
   For n <= 10 we also sample a Haar-random state and compute the exact entropy from the reduced density matrix. */
(function () {
  'use strict';

  function pageS(k, n) {
    const a = Math.min(k, n - k), b = n - a;
    const m = Math.pow(2, a), nn = Math.pow(2, b);
    let s = 0;
    for (let j = nn + 1; j <= m * nn; j++) s += 1 / j;
    s -= (m - 1) / (2 * nn);
    return Math.max(0, s / Math.LN2);
  }

  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Jacobi eigenvalues of a real symmetric matrix (destroyed).
  function eigvals(A, n) {
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
      if (off < 1e-26) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-300) continue;
        const th = (A[q][q] - A[p][p]) / (2 * apq);
        const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const x = A[k][p], y = A[k][q]; A[k][p] = c * x - s * y; A[k][q] = s * x + c * y; }
        for (let k = 0; k < n; k++) { const x = A[p][k], y = A[q][k]; A[p][k] = c * x - s * y; A[q][k] = s * x + c * y; }
      }
    }
    const v = [];
    for (let i = 0; i < n; i++) v.push(A[i][i]);
    return v;
  }

  // Exact entropy (bits) of the first k qubits of state (re, im) on n qubits.
  function sampledS(re, im, n, k) {
    if (k === 0 || k === n) return 0;
    const dA = 1 << k, dB = 1 << (n - k);
    const small = dA <= dB;
    const m = small ? dA : dB, o = small ? dB : dA;
    const idx = small ? (a, b) => a * dB + b : (a, b) => b * dB + a; // a runs over the smaller side
    // rho[a][a'] = sum_b psi[a,b] conj(psi[a',b]); embed Hermitian H = X + iY as [[X,-Y],[Y,X]]
    const M = [];
    for (let i = 0; i < 2 * m; i++) M.push(new Float64Array(2 * m));
    for (let a = 0; a < m; a++) for (let a2 = a; a2 < m; a2++) {
      let x = 0, y = 0;
      for (let b = 0; b < o; b++) {
        const i1 = idx(a, b), i2 = idx(a2, b);
        x += re[i1] * re[i2] + im[i1] * im[i2];
        y += im[i1] * re[i2] - re[i1] * im[i2];
      }
      M[a][a2] = x; M[a2][a] = x;
      M[m + a][m + a2] = x; M[m + a2][m + a] = x;
      M[a][m + a2] = -y; M[m + a2][a] = -y;
      M[m + a][a2] = y; M[a2][m + a] = y;
    }
    const ev = eigvals(M, 2 * m);
    let s = 0;
    for (const l of ev) if (l > 1e-14) s -= l * Math.log2(l);
    return s / 2; // every eigenvalue appears twice in the real embedding
  }

  QA.registerDemo({
    id: 'page',
    title: 'The Page curve: where does a black hole’s information go?',
    emoji: '🕳️',
    blurb: 'As a black hole slowly leaks away, the scrambled light it gives off first looks more and more random, then starts to carry the secrets back out.',
    explain:
      'Think of a black hole as n qubits in one big random quantum state. Bit by bit, qubits leave as radiation. "Entropy" here counts how many bits of the radiation are tangled up with what is still inside. ' +
      'It climbs while the radiation is the smaller part, peaks halfway (the "Page time"), then falls back to zero once everything has left, so no information is lost. ' +
      'Simplified: a toy random state of a few qubits, not real gravity. The curve is Page’s exact average formula; for up to 10 qubits the dots come from an actual random state.',
    tryThis: [
      'Press Evaporate and watch the entropy rise, then fall.',
      'Compare the curve with the dashed "most possible" tent: random states come very close.',
      'Press New random state: the dots barely move. Big random states all look alike.',
    ],
    mount(root) {
      const S = { n: 10, k: 3, seed: 3, playing: false };
      let pageVals = [], samp = null;

      function computePage() { pageVals = []; for (let k = 0; k <= S.n; k++) pageVals.push(pageS(k, S.n)); }
      function sample() {
        if (S.n > 10) { samp = null; return; }
        const r = mulberry(S.seed * 7919 + S.n), D = 1 << S.n;
        const re = new Float64Array(D), im = new Float64Array(D);
        let norm = 0;
        for (let i = 0; i < D; i++) {
          const u = Math.max(1e-12, r()), v = r(), rad = Math.sqrt(-2 * Math.log(u));
          re[i] = rad * Math.cos(2 * Math.PI * v); im[i] = rad * Math.sin(2 * Math.PI * v);
          norm += re[i] * re[i] + im[i] * im[i];
        }
        norm = Math.sqrt(norm);
        for (let i = 0; i < D; i++) { re[i] /= norm; im[i] /= norm; }
        samp = [];
        for (let k = 0; k <= S.n; k++) samp.push(sampledS(re, im, S.n, k));
      }
      computePage(); sample();

      const cv = QA.canvas(root, {
        aspect: 0.85, maxHeight: 460,
        label: 'A shrinking black hole giving off qubits, and a plot of the radiation entropy versus number of qubits radiated',
        draw(ctx, w, h) {
          const C = QA.colors(), n = S.n, k = S.k;
          const picH = Math.max(90, h * 0.3);
          // picture: black hole + radiation
          const cx = Math.min(w * 0.25, 90), cy = picH / 2 + 2;
          const R0 = Math.min(picH * 0.42, w * 0.18);
          const R = R0 * Math.sqrt(Math.max(0.02, (n - k) / n));
          ctx.fillStyle = C.fg;
          ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill();
          ctx.strokeStyle = C.d; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cx, cy, R + 3, 0, 2 * Math.PI); ctx.stroke();
          const inside = n - k;
          ctx.fillStyle = C.bg;
          for (let i = 0; i < inside; i++) {
            const a = (i / Math.max(1, inside)) * 2 * Math.PI, rr = R * (i % 2 ? 0.35 : 0.65);
            ctx.beginPath(); ctx.arc(cx + rr * Math.cos(a), cy + rr * Math.sin(a), Math.max(1.5, Math.min(4, R * 0.12)), 0, 2 * Math.PI); ctx.fill();
          }
          const x0 = cx + R0 + 18, x1 = w - 10;
          ctx.fillStyle = C.c;
          for (let i = 0; i < k; i++) {
            const t = (i + 0.5) / n;
            const x = x0 + t * (x1 - x0), y = cy + Math.sin(i * 2.3) * picH * 0.28;
            ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fill();
          }
          ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText('radiation: ' + k + ' qubit' + (k === 1 ? '' : 's'), x0, 2);
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText('black hole: ' + inside, cx, Math.min(picH - 12, cy + R0 + 4));

          // plot
          ctx.save(); ctx.translate(0, picH);
          const ph = h - picH;
          const pl = QA.plot(ctx, w, ph, { x: [0, n], y: [0, n / 2 + 0.6], xlabel: 'qubits radiated', ylabel: 'entropy (bits)', pad: { l: 44, t: 14 } });
          pl.axes();
          const xs = [], ys = [];
          for (let j = 0; j <= n; j++) { xs.push(j); ys.push(Math.min(j, n - j)); }
          pl.line(xs, ys, C.muted, 1.5, [5, 4]);
          pl.area(xs, pageVals, QA.alpha(C.a, 0.12));
          pl.line(xs, pageVals, C.a, 2.5);
          if (samp) for (let j = 0; j <= n; j++) pl.dot(j, samp[j], 3.5, C.c);
          ctx.strokeStyle = C.d; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.moveTo(pl.X(n / 2), pl.Y(0)); ctx.lineTo(pl.X(n / 2), pl.Y(n / 2 + 0.6)); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = C.d; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText('Page time', pl.X(n / 2) + 4, pl.inner.t);
          pl.dot(k, pageVals[k], 7, C.b);
          ctx.restore();
        },
      });
      const C0 = QA.colors();
      QA.legend(root, [{ label: 'Page’s average', color: C0.a }, { label: 'one random state', color: C0.c }, { label: 'most possible', color: C0.muted }, { label: 'now', color: C0.b }]);

      const panel = QA.ui.panel(root);
      const readout = QA.ui.readout(root);
      const update = () => {
        cv.redraw();
        const n = S.n, k = S.k, s = pageVals[k];
        let msg = k + ' of ' + n + ' qubits have escaped. The radiation’s entropy is ' + s.toFixed(2) + ' bits on average (the most possible is ' + Math.min(k, n - k) + ')';
        if (samp) msg += '; this random state gives ' + samp[k].toFixed(2);
        msg += '. ';
        if (k === 0) msg += 'Nothing has left yet.';
        else if (k < n / 2) msg += 'Still rising: so far the radiation looks completely random.';
        else if (k === n / 2) msg += 'This is the Page time, the peak.';
        else if (k < n) msg += 'Now falling: the radiation has started giving the information back.';
        else msg += 'All gone: the radiation is a pure state again, nothing was lost.';
        readout.set(msg);
      };
      let kSl;
      QA.ui.slider(panel, {
        label: 'Qubits in the black hole n', min: 6, max: 14, step: 1, value: S.n, format: (v) => String(v), hint: 'dots from a real random state for n ≤ 10',
        onInput: (v) => { S.n = v; computePage(); sample(); kSl.input.max = v; if (S.k > v) S.k = v; kSl.input.value = S.k; kSl.input.dispatchEvent(new Event('input')); },
      });
      kSl = QA.ui.slider(panel, { label: 'Qubits radiated k', min: 0, max: S.n, step: 1, value: S.k, format: (v) => String(v), onInput: (v) => { S.k = v; update(); } });
      const playBtn = QA.ui.button(panel, {
        label: 'Evaporate', kind: 'primary',
        onClick: () => {
          S.playing = !S.playing;
          if (S.playing && S.k >= S.n) kSl.set(0);
          playBtn.textContent = S.playing ? 'Pause' : 'Evaporate';
        },
      });
      QA.ui.button(panel, { label: 'New random state', onClick: () => { S.seed++; sample(); update(); } });
      let acc = 0;
      const loop = QA.loop((dt) => {
        if (!S.playing) return;
        acc += dt;
        if (acc >= (QA.reducedMotion() ? 1.2 : 0.6)) {
          acc = 0;
          if (S.k >= S.n) { S.playing = false; playBtn.textContent = 'Evaporate'; return; }
          kSl.set(S.k + 1);
        }
      });
      update();
      return () => { loop.stop(); cv.destroy(); };
    },
  });
})();
