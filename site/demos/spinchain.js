/* Spin chain: one flipped spin (a magnon) spreading through a chain of quantum magnets.
   Model: XX chain in the one-flip sector = tight-binding hopping on N sites,
   H = -J sum(|n><n+1| + h.c.) + sum eps_n |n><n|, eps_n uniform in [-W/2, W/2], hbar = 1.
   Solved exactly by diagonalising the N x N matrix (Jacobi). */
(function () {
  'use strict';

  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Cyclic Jacobi for a real symmetric matrix. A is destroyed. Returns {vals, V} with V[i][k] = component i of eigenvector k.
  function jacobiEigen(A, n) {
    const V = [];
    for (let i = 0; i < n; i++) { V.push(new Float64Array(n)); V[i][i] = 1; }
    for (let sweep = 0; sweep < 80; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
      if (off < 1e-24) break;
      for (let p = 0; p < n; p++) {
        for (let q = p + 1; q < n; q++) {
          const apq = A[p][q];
          if (Math.abs(apq) < 1e-300) continue;
          const th = (A[q][q] - A[p][p]) / (2 * apq);
          const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
          const c = 1 / Math.sqrt(t * t + 1), s = t * c;
          for (let k = 0; k < n; k++) {
            const akp = A[k][p], akq = A[k][q];
            A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
          }
          for (let k = 0; k < n; k++) {
            const apk = A[p][k], aqk = A[q][k];
            A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
          }
          for (let k = 0; k < n; k++) {
            const vkp = V[k][p], vkq = V[k][q];
            V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
          }
        }
      }
    }
    const vals = new Float64Array(n);
    for (let i = 0; i < n; i++) vals[i] = A[i][i];
    return { vals, V };
  }

  QA.registerDemo({
    id: 'spinchain',
    title: 'A flipped spin racing down a chain',
    emoji: '⛓️',
    blurb: 'Flip one tiny magnet in a long row of magnets and watch the flip ripple outward, with a built-in speed limit.',
    explain:
      'Each column is one spin, a tiny quantum magnet. One spin starts flipped, and neighbours pass the flip back and forth (the "flip-flop" strength is J). ' +
      'Time runs downward, so the bright V is a "light cone": nothing gets out faster than 2J sites per unit of time. ' +
      'Random disorder W gives every site a different energy, and the wave gets stuck near home. That is Anderson localization. ' +
      'Simplified: only one flip ever exists (so the maths is exact), the chain is the XX model with ħ = 1, and the extra Ising (ZZ) term is left out because with a single flip it only nudges the two end sites.',
    tryThis: [
      'With no disorder, watch the flip hit the ends of the chain and bounce back.',
      'Raise disorder W above 3 and see the spread stop growing.',
      'Double J: the V opens twice as fast.',
    ],
    mount(root) {
      const S = { N: 31, J: 1, W: 0, start: 15, seed: 7, t: 0, playing: true };
      const TMAX = 15, R = 150;
      let E, V, heat, rand;
      const now = new Float64Array(40);
      const cr = new Float64Array(40), ci = new Float64Array(40);

      function newDisorder() {
        const r = mulberry(S.seed);
        rand = new Float64Array(40);
        for (let i = 0; i < 40; i++) rand[i] = r() - 0.5;
      }
      function probs(t, out, off) {
        const N = S.N, s = S.start;
        for (let k = 0; k < N; k++) {
          const ck = V[s][k];
          cr[k] = ck * Math.cos(E[k] * t);
          ci[k] = -ck * Math.sin(E[k] * t);
        }
        for (let i = 0; i < N; i++) {
          let re = 0, im = 0;
          const Vi = V[i];
          for (let k = 0; k < N; k++) { re += Vi[k] * cr[k]; im += Vi[k] * ci[k]; }
          out[off + i] = re * re + im * im;
        }
      }
      function build() {
        const N = S.N;
        const A = [];
        for (let i = 0; i < N; i++) A.push(new Float64Array(N));
        for (let i = 0; i < N; i++) {
          A[i][i] = S.W * rand[i];
          if (i + 1 < N) { A[i][i + 1] = -S.J; A[i + 1][i] = -S.J; }
        }
        const r = jacobiEigen(A, N);
        E = r.vals; V = r.V;
        heat = new Float64Array(R * N);
        for (let row = 0; row < R; row++) probs((TMAX * row) / (R - 1), heat, row * N);
      }
      newDisorder();
      build();

      const cv = QA.canvas(root, {
        aspect: 0.95, maxHeight: 560,
        label: 'Space-time map of where the flipped spin is likely to be, with time running downward, and a bar chart of the chances right now',
        draw(ctx, w, h) {
          const C = QA.colors(), N = S.N;
          const padL = 34, padR = 8, padT = 18;
          const barH = Math.max(50, h * 0.2), gap = 10, bottom = 30;
          const heatH = h - padT - barH - gap - bottom;
          const iw = w - padL - padR, cw = iw / N, rh = heatH / (R - 1);
          ctx.font = '11px system-ui, sans-serif';

          // heat map frame
          ctx.fillStyle = C.grid;
          ctx.fillRect(padL, padT, iw, heatH);
          const rNow = Math.min(R - 1, Math.floor((S.t / TMAX) * (R - 1)));
          ctx.fillStyle = C.a;
          for (let r = 0; r <= rNow; r++) {
            for (let i = 0; i < N; i++) {
              const p = heat[r * N + i];
              if (p < 2e-4) continue;
              ctx.globalAlpha = Math.min(1, Math.sqrt(p) * 1.5);
              ctx.fillRect(padL + i * cw, padT + r * rh - rh / 2, cw + 0.6, rh + 0.6);
            }
          }
          ctx.globalAlpha = 1;

          // speed-limit lines x = s +/- 2 J t
          ctx.save();
          ctx.beginPath(); ctx.rect(padL, padT, iw, heatH); ctx.clip();
          ctx.strokeStyle = C.muted; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
          const x0 = padL + (S.start + 0.5) * cw;
          const dx = 2 * S.J * TMAX * cw;
          ctx.beginPath();
          ctx.moveTo(x0, padT); ctx.lineTo(x0 - dx, padT + heatH);
          ctx.moveTo(x0, padT); ctx.lineTo(x0 + dx, padT + heatH);
          ctx.stroke();
          ctx.restore();

          // current-time cursor
          const yNow = padT + (S.t / TMAX) * heatH;
          ctx.strokeStyle = C.b; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(padL, yNow); ctx.lineTo(padL + iw, yNow); ctx.stroke();

          // start marker
          ctx.fillStyle = C.b;
          ctx.beginPath(); ctx.moveTo(x0 - 5, padT - 9); ctx.lineTo(x0 + 5, padT - 9); ctx.lineTo(x0, padT - 2); ctx.fill();

          // time axis
          ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          for (let tt = 0; tt <= TMAX; tt += 5) ctx.fillText(String(tt), padL - 5, padT + (tt / TMAX) * heatH);
          ctx.save(); ctx.translate(10, padT + heatH / 2); ctx.rotate(-Math.PI / 2);
          ctx.textAlign = 'center'; ctx.fillStyle = C.fg; ctx.fillText('time ↓', 0, 0); ctx.restore();

          // current profile bars
          probs(S.t, now, 0);
          let pmax = 0;
          for (let i = 0; i < N; i++) pmax = Math.max(pmax, now[i]);
          const top = Math.max(0.1, Math.ceil(pmax * 10) / 10);
          const by = padT + heatH + gap + barH;
          ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(padL, by); ctx.lineTo(padL + iw, by); ctx.stroke();
          ctx.fillStyle = C.b;
          for (let i = 0; i < N; i++) {
            const bh = (now[i] / top) * barH;
            ctx.fillRect(padL + i * cw + cw * 0.12, by - bh, cw * 0.76, bh);
          }
          ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          ctx.fillText(Math.round(top * 100) + '%', padL - 4, by - barH);
          ctx.fillText('0', padL - 4, by);
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText('1', padL + cw / 2, by + 3);
          ctx.fillText(String(N), padL + iw - cw / 2, by + 3);
          ctx.fillStyle = C.fg; ctx.textBaseline = 'bottom';
          ctx.fillText('site along the chain (bars: chance right now)', padL + iw / 2, h - 2);
        },
      });

      const panel = QA.ui.panel(root);
      const readout = QA.ui.readout(root);
      function updateText() {
        let m = 0, m2 = 0;
        probs(S.t, now, 0);
        for (let i = 0; i < S.N; i++) { const d = i - S.start; m += now[i] * d; m2 += now[i] * d * d; }
        const spread = Math.sqrt(Math.max(0, m2));
        let msg = 'Time ' + S.t.toFixed(1) + ': the flip is typically ' + spread.toFixed(1) +
          ' sites from where it started. The speed limit is 2J = ' + (2 * S.J).toFixed(1) + ' sites per unit of time.';
        if (S.W >= 2 * S.J && S.t > 5) msg += ' Disorder is holding it near home.';
        readout.set(msg);
      }
      const redraw = () => { cv.redraw(); updateText(); };
      const rebuild = () => { build(); redraw(); };

      QA.ui.slider(panel, { label: 'Flip-flop strength J', min: 0.2, max: 2, step: 0.05, value: S.J, format: (v) => v.toFixed(2), onInput: (v) => { S.J = v; rebuild(); } });
      QA.ui.slider(panel, { label: 'Disorder W', min: 0, max: 8, step: 0.1, value: S.W, format: (v) => v.toFixed(1), hint: '0 = perfect chain', onInput: (v) => { S.W = v; rebuild(); } });
      const startSl = QA.ui.slider(panel, { label: 'Starting site', min: 1, max: S.N, step: 1, value: S.start + 1, format: (v) => String(v), onInput: (v) => { S.start = Math.min(S.N - 1, v - 1); rebuild(); } });
      QA.ui.slider(panel, {
        label: 'Chain length N', min: 20, max: 40, step: 1, value: S.N, format: (v) => v + ' spins',
        onInput: (v) => {
          const mid = S.start === Math.floor((S.N - 1) / 2);
          S.N = v;
          startSl.input.max = v;
          if (mid || S.start > v - 1) S.start = Math.floor((v - 1) / 2);
          startSl.input.value = S.start + 1;
          startSl.input.dispatchEvent(new Event('input'));
        },
      });
      const restart = () => { S.t = QA.reducedMotion() ? TMAX : 0; S.playing = !QA.reducedMotion(); redraw(); };
      QA.ui.button(panel, { label: 'Restart', kind: 'primary', onClick: restart });
      QA.ui.button(panel, { label: 'New disorder', onClick: () => { S.seed++; newDisorder(); rebuild(); } });

      restart();
      const loop = QA.loop((dt) => {
        if (!S.playing) return;
        S.t += (dt * TMAX) / 10;
        if (S.t >= TMAX) { S.t = TMAX; S.playing = false; }
        redraw();
      });
      return () => { loop.stop(); cv.destroy(); };
    },
  });
})();
