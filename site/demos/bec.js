/* Bose-Einstein condensation of an ideal Bose gas in a 3-D harmonic trap.
   Tc = 0.94 hbar w N^(1/3) / kB; N0/N = 1 - (T/Tc)^3 below Tc.
   Time-of-flight picture (long expansion, ideal gas): thermal cloud is a Gaussian of variance ∝ kB T,
   condensate is the expanded ground state, a Gaussian of variance ∝ hbar w / 2, so sigma0/sigma_th = sqrt(hbar w / (2 kB T)). */
(function () {
  'use strict';
  const HBAR_OVER_KB = 7.6382e-12; // K s

  function rgb(c) {
    c = String(c).trim();
    if (c[0] === '#') {
      let h = c.slice(1);
      if (h.length === 3) h = h.split('').map((x) => x + x).join('');
      const n = parseInt(h.slice(0, 6), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = c.match(/[\d.]+/g);
    return m ? [+m[0], +m[1], +m[2]] : [0, 0, 0];
  }
  const fmtT = (nk) => (nk >= 1000 ? (nk / 1000).toFixed(nk >= 10000 ? 0 : 2) + ' µK' : nk >= 10 ? Math.round(nk) + ' nK' : nk.toFixed(1) + ' nK');
  const fmtN = (lv) => { const n = Math.pow(10, lv); return n >= 1e6 ? +(n / 1e6).toPrecision(2) + ' million' : Math.round(n / 1000).toLocaleString('en-US') + ' thousand'; };

  QA.registerDemo({
    id: 'bec',
    title: 'Bose–Einstein condensate: atoms that act as one',
    emoji: '🧊',
    blurb: 'Cool a cloud of atoms to a whisker above absolute zero and many of them suddenly pile into the very same quantum state.',
    explain:
      'Atoms are held in a magnetic or laser "bowl" (the trap). Below a critical temperature Tc, a big share of them drop into the bowl’s lowest state together: a Bose–Einstein condensate. ' +
      'Experiments switch the trap off and photograph the cloud as it spreads. Hot atoms fly out into a wide, soft cloud; condensed atoms barely move, so they show up as a sharp spike in the middle. ' +
      'Simplified: atoms that do not push on each other (an ideal gas) in a round trap, and Tc from the large-N formula. Real condensates are a bit wider because the atoms repel.',
    tryThis: [
      'Slide the temperature down past Tc and watch the spike appear.',
      'Add more atoms: Tc goes up, as N to the power 1/3.',
      'Make the trap tighter (higher frequency): Tc rises too.',
    ],
    mount(root) {
      const S = { lT: Math.log10(300), lN: 6, f: 100 };
      const T = () => Math.pow(10, S.lT);
      const Natoms = () => Math.pow(10, S.lN);
      const Tc = () => 0.94 * HBAR_OVER_KB * 2 * Math.PI * S.f * Math.cbrt(Natoms()) * 1e9; // nK
      const frac = (x) => (x < 1 ? 1 - x * x * x : 0);

      const cv = QA.canvas(root, {
        aspect: 0.5, maxHeight: 260,
        label: 'Fraction of atoms in the condensate versus temperature divided by the critical temperature',
        draw(ctx, w, h) {
          const C = QA.colors();
          const pl = QA.plot(ctx, w, h, { x: [0, 2], y: [0, 1], xlabel: 'temperature ÷ Tc', ylabel: 'in condensate', pad: { l: 46 } });
          pl.axes();
          const xs = [], ys = [];
          for (let i = 0; i <= 200; i++) { const x = (2 * i) / 200; xs.push(x); ys.push(frac(x)); }
          pl.area(xs, ys, QA.alpha(C.a, 0.15));
          pl.line(xs, ys, C.a, 2.5);
          ctx.strokeStyle = C.d; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(pl.X(1), pl.Y(0)); ctx.lineTo(pl.X(1), pl.Y(1)); ctx.stroke(); ctx.setLineDash([]);
          ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = C.d; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText('Tc', pl.X(1) + 4, pl.inner.t + 2);
          const x = T() / Tc();
          pl.dot(Math.min(2, x), frac(x), 7, C.b);
        },
      });

      const RES = 150, L = 3.2; // image half-width in units of the thermal width at Tc
      const off = document.createElement('canvas');
      off.width = RES; off.height = RES;
      const octx = off.getContext('2d');
      const img = octx.createImageData(RES, RES);

      const cv2 = QA.canvas(root, {
        aspect: 0.85, maxHeight: 460,
        label: 'Simulated time-of-flight picture of the atom cloud, and a side profile showing the wide thermal cloud and the narrow condensate spike',
        draw(ctx, w, h) {
          const C = QA.colors();
          const x = T() / Tc(), f0 = frac(x), fth = 1 - f0;
          const sth = Math.sqrt(Math.max(1e-6, x));                       // thermal width / thermal width at Tc
          const s0 = Math.sqrt(1 / (2 * 0.94 * Math.cbrt(Natoms())));    // condensate width, same units
          // column density relative to the thermal peak at Tc
          const nAt = (r2) => fth / (sth * sth) * Math.exp(-r2 / (2 * sth * sth)) + (f0 / (s0 * s0)) * Math.exp(-r2 / (2 * s0 * s0));
          const K = 8, norm = Math.log(1 + K * 6);
          const bg = rgb(C.bg), ca = rgb(C.a), cd = rgb(C.d);
          const d = img.data;
          for (let j = 0; j < RES; j++) {
            const yy = -L + (2 * L * (j + 0.5)) / RES;
            for (let i = 0; i < RES; i++) {
              const xx = -L + (2 * L * (i + 0.5)) / RES;
              const v = Math.min(1, Math.log(1 + K * nAt(xx * xx + yy * yy)) / norm);
              let r, g, b;
              if (v < 0.6) { const t = v / 0.6; r = bg[0] + (ca[0] - bg[0]) * t; g = bg[1] + (ca[1] - bg[1]) * t; b = bg[2] + (ca[2] - bg[2]) * t; }
              else { const t = (v - 0.6) / 0.4; r = ca[0] + (cd[0] - ca[0]) * t; g = ca[1] + (cd[1] - ca[1]) * t; b = ca[2] + (cd[2] - ca[2]) * t; }
              const o = 4 * (j * RES + i);
              d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
            }
          }
          octx.putImageData(img, 0, 0);
          const profH = Math.max(60, h * 0.26);
          const side = Math.min(w - 16, h - profH - 26);
          const ix = (w - side) / 2, iy = 4;
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(off, ix, iy, side, side);
          ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.strokeRect(ix, iy, side, side);
          ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText('photo after release', ix + 4, iy + 4);

          // 1-D profile (integrated along one direction)
          const py0 = iy + side + 16, py1 = h - 4, pw = side;
          const prof = (xx, which) => {
            const th = fth / sth * Math.exp(-xx * xx / (2 * sth * sth));
            const c0 = f0 / s0 * Math.exp(-xx * xx / (2 * s0 * s0));
            return which === 0 ? th : th + c0;
          };
          let pmax = 0;
          const P = 300, tot = [], thm = [];
          for (let i = 0; i <= P; i++) { const xx = -L + (2 * L * i) / P; tot.push(prof(xx, 1)); thm.push(prof(xx, 0)); pmax = Math.max(pmax, tot[i]); }
          const PX = (i) => ix + (pw * i) / P, PY = (v) => py1 - (v / pmax) * (py1 - py0);
          ctx.fillStyle = QA.alpha(C.a, 0.25);
          ctx.beginPath(); ctx.moveTo(PX(0), py1);
          for (let i = 0; i <= P; i++) ctx.lineTo(PX(i), PY(thm[i]));
          ctx.lineTo(PX(P), py1); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = C.b; ctx.lineWidth = 2; ctx.beginPath();
          for (let i = 0; i <= P; i++) i ? ctx.lineTo(PX(i), PY(tot[i])) : ctx.moveTo(PX(i), PY(tot[i]));
          ctx.stroke();
          ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(ix, py1); ctx.lineTo(ix + pw, py1); ctx.stroke();
          ctx.fillStyle = C.muted; ctx.textBaseline = 'bottom';
          ctx.fillText('side view: shaded = thermal atoms', ix, py0 - 1);
        },
      });
      const C0 = QA.colors();
      QA.legend(root, [{ label: 'thermal cloud', color: C0.a }, { label: 'dense condensate', color: C0.d }, { label: 'total profile', color: C0.b }]);

      const panel = QA.ui.panel(root);
      const readout = QA.ui.readout(root);
      const update = () => {
        cv.redraw(); cv2.redraw();
        const tc = Tc(), x = T() / tc, f0 = frac(x);
        let msg = 'Critical temperature Tc ≈ ' + fmtT(tc) + '. At ' + fmtT(T()) + ' (' + x.toFixed(2) + ' × Tc), ';
        if (f0 <= 0) msg += 'there is no condensate: the gas is an ordinary hot cloud.';
        else if (f0 > 0.995) msg += 'almost all the atoms share one quantum state.';
        else msg += 'about ' + Math.round(f0 * 100) + '% of the atoms share one quantum state.';
        readout.set(msg);
      };
      QA.ui.slider(panel, { label: 'Temperature', min: 0, max: Math.log10(3000), step: 0.005, value: S.lT, format: (v) => fmtT(Math.pow(10, v)), hint: '1 nK is a billionth of a degree above absolute zero', onInput: (v) => { S.lT = v; update(); } });
      QA.ui.slider(panel, { label: 'Atoms N', min: 3, max: 7, step: 0.05, value: S.lN, format: fmtN, onInput: (v) => { S.lN = v; update(); } });
      QA.ui.slider(panel, { label: 'Trap frequency', min: 10, max: 500, step: 1, value: S.f, format: (v) => v + ' Hz', hint: 'higher = tighter bowl', onInput: (v) => { S.f = v; update(); } });
      update();
      return () => { cv.destroy(); cv2.destroy(); };
    },
  });
})();
