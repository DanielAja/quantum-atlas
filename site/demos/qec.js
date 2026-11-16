/* Quantum error correction: repetition code with majority vote, and a surface-code rule of thumb.
   Repetition (bit flips only, exact): p_L = sum_{k > d/2} C(d,k) p^k (1-p)^(d-k).
   Rule of thumb: p_L ~ 0.1 (p / p_th)^((d+1)/2), p_th ~ 1%. */
(function () {
  'use strict';
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const pow10 = (e) => (e === 0 ? '1' : e === 1 ? '10' : '10' + String(e).split('').map((c) => SUP[c]).join(''));
  const lgf = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };

  function repL(p, d) {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let s = 0;
    for (let k = Math.floor(d / 2) + 1; k <= d; k++) s += Math.exp(lgf(d) - lgf(k) - lgf(d - k) + k * Math.log(p) + (d - k) * Math.log(1 - p));
    return Math.min(1, s);
  }
  const PTH = 0.01;
  const surfL = (p, d) => Math.min(1, 0.1 * Math.pow(p / PTH, (d + 1) / 2));

  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const oneIn = (q) => {
    if (q >= 0.5) return 'about half the time';
    if (q < 1e-15) return 'almost never (less than 1 time in a million billion)';
    const n = 1 / q;
    const r = n < 100 ? n.toFixed(n < 10 ? 1 : 0) : Number(n.toPrecision(2)).toLocaleString('en-US');
    return 'about 1 time in ' + r;
  };

  QA.registerDemo({
    id: 'qec',
    title: 'Error correction: many weak qubits make one strong one',
    emoji: '🛡️',
    blurb: 'Copy one bit onto several qubits and take a vote: if each copy is good enough, more copies means far fewer mistakes.',
    explain:
      'Qubits make mistakes. A repetition code spreads one bit over d qubits; at the end a majority vote decides the answer. It only fails if more than half the copies flipped. ' +
      'Below a "threshold" error rate, adding qubits makes the protected bit much safer; above it, adding qubits makes things worse. For this simple code the curves cross at 50%. ' +
      'Real quantum computers use the surface code, which also fixes phase errors but has a much lower threshold, about 1%. Simplified: the repetition code only fixes bit flips, and the surface-code line is a rough rule of thumb, not an exact formula.',
    tryThis: [
      'Set p to 1% and slide d from 1 to 15: the logical error plunges.',
      'Push p above 50% and see bigger codes do worse.',
      'Switch to the surface-code rule and find where its curves cross (near 1%).',
    ],
    mount(root) {
      const S = { lp: -2, d: 5, mode: 'rep' };
      const p = () => Math.pow(10, S.lp);
      const fL = (q, d) => (S.mode === 'rep' ? repL(q, d) : surfL(q, d));

      const cv = QA.canvas(root, {
        aspect: 0.7, maxHeight: 380,
        label: 'Log-log plot of logical error rate versus physical error rate for several code sizes',
        draw(ctx, w, h) {
          const C = QA.colors();
          const X0 = -4, X1 = 0, Y0 = -15, Y1 = 0;
          const pl = QA.plot(ctx, w, h, { x: [X0, X1], y: [Y0, Y1], xticks: [], yticks: [], xlabel: 'physical error p (each qubit)', ylabel: 'logical error', pad: { l: 50, b: 36, t: 10 } });
          // log axes
          ctx.save();
          ctx.strokeStyle = C.grid; ctx.fillStyle = C.muted; ctx.font = '11px system-ui, sans-serif'; ctx.lineWidth = 1;
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          for (let e = X0; e <= X1; e++) {
            ctx.beginPath(); ctx.moveTo(pl.X(e), pl.Y(Y0)); ctx.lineTo(pl.X(e), pl.Y(Y1)); ctx.stroke();
            ctx.fillText(pow10(e), pl.X(e), pl.Y(Y0) + 4);
          }
          ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          const ystep = h < 260 ? 5 : 3;
          for (let e = Y0; e <= Y1; e += ystep) {
            ctx.beginPath(); ctx.moveTo(pl.X(X0), pl.Y(e)); ctx.lineTo(pl.X(X1), pl.Y(e)); ctx.stroke();
            ctx.fillText(pow10(e), pl.X(X0) - 5, pl.Y(e));
          }
          ctx.restore();
          pl.axes();
          ctx.save();
          ctx.beginPath(); ctx.rect(pl.inner.l, pl.inner.t, pl.inner.w, pl.inner.h); ctx.clip();
          // threshold line
          const th = S.mode === 'rep' ? Math.log10(0.5) : Math.log10(PTH);
          ctx.strokeStyle = C.d; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(pl.X(th), pl.Y(Y0)); ctx.lineTo(pl.X(th), pl.Y(Y1)); ctx.stroke();
          ctx.setLineDash([]);
          const ds = [1, 3, 5, 9, 15];
          if (ds.indexOf(S.d) < 0) ds.push(S.d);
          for (const d of ds) {
            const xs = [], ys = [];
            for (let i = 0; i <= 160; i++) {
              const lx = X0 + ((X1 - X0) * i) / 160;
              const v = fL(Math.min(0.999, Math.pow(10, lx)), d);
              xs.push(lx); ys.push(v > 0 ? Math.max(Y0 - 1, Math.log10(v)) : Y0 - 1);
            }
            const cur = d === S.d;
            pl.line(xs, ys, cur ? C.b : QA.alpha(C.a, 0.25 + d / 30), cur ? 3 : 1.5);
            const lab = ys.findIndex((y) => y > Y0 + 0.5);
            if (!cur && lab > 0 && lab < 150) {
              ctx.fillStyle = C.muted; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
              ctx.fillText('d=' + d, pl.X(xs[lab]) + 3, pl.Y(Y0 + 0.8));
            }
          }
          // break-even line p_L = p
          pl.line([X0, X1], [X0, X1], C.muted, 1, [2, 3]);
          const q = p(), vL = fL(q, S.d);
          pl.dot(S.lp, vL > 0 ? Math.max(Y0, Math.log10(vL)) : Y0, 6, C.b);
          ctx.restore();
          ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = C.d; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
          ctx.fillText('threshold', pl.X(th) - 4, pl.inner.t + 4);
        },
      });
      const C0 = QA.colors();
      QA.legend(root, [{ label: 'your code size d', color: C0.b }, { label: 'other sizes', color: C0.a }, { label: 'threshold', color: C0.d }, { label: 'no gain (p_L = p)', color: C0.muted }]);

      // animated repetition-code trials
      const ROWS = 9;
      let trials = [], tally = { n: 0, raw: 0, code: 0 }, rnd = mulberry(42);
      const resetTrials = () => { trials = []; tally = { n: 0, raw: 0, code: 0 }; };
      const addTrial = () => {
        const q = p(), bits = [];
        let flips = 0;
        for (let i = 0; i < S.d; i++) { const f = rnd() < q; bits.push(f); if (f) flips++; }
        const fail = flips > S.d / 2;
        trials.unshift({ bits, fail });
        if (trials.length > ROWS) trials.pop();
        tally.n++; if (bits[0]) tally.raw++; if (fail) tally.code++;
      };
      const cv2 = QA.canvas(root, {
        aspect: 0.5, maxHeight: 260,
        label: 'Animated rows of qubits: each row is one try, flipped qubits are highlighted, and the majority vote result is shown at the right',
        draw(ctx, w, h) {
          const C = QA.colors();
          const top = 18, right = 34, bottom = 22;
          const cs = Math.min((w - right - 8) / S.d, (h - top - bottom) / ROWS);
          const gx = (w - right - cs * S.d) / 2;
          ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = C.fg; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText('Repetition code live: ' + S.d + ' qubits per try, newest on top', 4, 2);
          for (let r = 0; r < trials.length; r++) {
            const T = trials[r], y = top + r * cs;
            for (let i = 0; i < S.d; i++) {
              ctx.fillStyle = T.bits[i] ? C.b : QA.alpha(C.c, 0.35);
              ctx.fillRect(gx + i * cs + 1, y + 1, cs - 2, cs - 2);
            }
            ctx.fillStyle = T.fail ? C.b : C.c;
            ctx.font = '700 ' + Math.max(11, Math.min(16, cs * 0.8)) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(T.fail ? '✗' : '✓', gx + S.d * cs + right / 2, y + cs / 2);
            ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          }
          ctx.fillStyle = C.muted; ctx.textBaseline = 'bottom';
          ctx.fillText(tally.n + ' tries: one bare qubit failed ' + tally.raw + '×, the voted bit failed ' + tally.code + '×', 4, h - 2);
        },
      });

      const panel = QA.ui.panel(root);
      const readout = QA.ui.readout(root);
      const update = () => {
        cv.redraw(); cv2.redraw();
        const q = p(), vL = fL(q, S.d);
        let msg = 'Each qubit fails ' + oneIn(q) + '. With d = ' + S.d + (S.mode === 'rep' ? ' and a majority vote' : ' (surface-code rule of thumb)') +
          ', the protected bit fails ' + oneIn(vL) + '.';
        if (vL > 0 && q < 0.5 && vL < q) msg += ' That is ' + Number((q / vL).toPrecision(2)).toLocaleString('en-US') + '× better.';
        else if (vL > q && S.d > 1) msg += ' That is worse than one bare qubit: we are above threshold.';
        readout.set(msg);
      };
      QA.ui.slider(panel, {
        label: 'Physical error p', min: -4, max: Math.log10(0.7), step: 0.01, value: S.lp,
        format: (v) => { const q = Math.pow(10, v) * 100; return (q < 0.1 ? q.toFixed(3) : q < 1 ? q.toFixed(2) : q < 10 ? q.toFixed(1) : q.toFixed(0)) + '%'; },
        onInput: (v) => { S.lp = v; resetTrials(); update(); },
      });
      QA.ui.slider(panel, { label: 'Code distance d', min: 1, max: 15, step: 2, value: S.d, format: (v) => v + ' qubits', onInput: (v) => { S.d = v; resetTrials(); update(); } });
      QA.ui.select(panel, {
        label: 'Formula',
        options: [{ value: 'rep', label: 'Repetition code (exact, bit flips)' }, { value: 'surf', label: 'Surface code (rule of thumb)' }],
        value: S.mode, onChange: (v) => { S.mode = v; update(); },
      });
      let acc = 0;
      const rm = QA.reducedMotion();
      if (rm) for (let i = 0; i < ROWS; i++) addTrial();
      const loop = QA.loop((dt) => {
        acc += dt;
        const every = rm ? 1.5 : 0.25;
        if (acc >= every) { acc = 0; addTrial(); cv2.redraw(); }
      });
      update();
      return () => { loop.stop(); cv.destroy(); cv2.destroy(); };
    },
  });
})();
