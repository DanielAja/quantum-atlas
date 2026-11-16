/* BB84 quantum key distribution with an intercept-resend eavesdropper and channel noise.
   Each photon has a fixed set of random draws (seeded PRNG) so moving a slider only changes what the slider controls. */
(function () {
  'use strict';
  const MAXN = 1024;
  const COUNTS = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
  const THRESH = 0.11;

  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function draws(seed) {
    const r = mulberry(seed), out = [];
    for (let i = 0; i < MAXN; i++) {
      out.push({
        aBit: r() < 0.5 ? 1 : 0, aBasis: r() < 0.5 ? 1 : 0, bBasis: r() < 0.5 ? 1 : 0,
        eveU: r(), eBasis: r() < 0.5 ? 1 : 0, eCoin: r() < 0.5 ? 1 : 0, bCoin: r() < 0.5 ? 1 : 0, noiseU: r(),
      });
    }
    return out;
  }
  // basis 0 = "+" (vertical/horizontal), 1 = "x" (diagonal)
  function run(D, n, eve, noise) {
    const rows = [];
    let sifted = 0, errors = 0;
    for (let i = 0; i < n; i++) {
      const d = D[i];
      let basis = d.aBasis, bit = d.aBit;
      const caught = d.eveU < eve;
      if (caught) {
        const eBit = d.eBasis === basis ? bit : d.eCoin; // wrong basis: random result
        basis = d.eBasis; bit = eBit;                    // Eve resends what she saw
      }
      let bBit = d.bBasis === basis ? bit : d.bCoin;
      if (d.noiseU < noise) bBit ^= 1;                   // channel noise flips the bit
      const keep = d.bBasis === d.aBasis;
      const err = keep && bBit !== d.aBit;
      if (keep) { sifted++; if (err) errors++; }
      rows.push({ d, caught, bBit, keep, err });
    }
    return { rows, sifted, errors, qber: sifted ? errors / sifted : 0 };
  }

  QA.registerDemo({
    id: 'bb84',
    title: 'Sharing a secret key with light (BB84)',
    emoji: '🔑',
    blurb: 'Alice sends Bob single particles of light to build a secret code. If a spy peeks, the peeking itself leaves marks.',
    explain:
      'Alice sends each photon in one of two "bases": straight (+) or diagonal (×). Bob guesses a basis to measure in. They then say out loud which bases they used (never the bits) and keep only the matches: that is the sifted key. ' +
      'A spy, Eve, must guess bases too. When she guesses wrong she scrambles the photon, so about 25% of the kept bits disagree if she reads every one. ' +
      'If the error rate is under about 11%, the key can still be cleaned up and made secret. Simplified: perfect single photons, and Alice and Bob compare the whole sifted key instead of a sample.',
    tryThis: [
      'Set Eve to 100% and check that the error rate lands near 25%.',
      'Find how much Eve can listen before the key becomes unsafe.',
      'Add channel noise with Eve at 0%: even honest errors count against you.',
    ],
    mount(root) {
      const S = { idx: 2, eve: 0, noise: 0, seed: 4 };
      let D = draws(S.seed), res;

      const cv = QA.canvas(root, {
        aspect: 0.95, maxHeight: 460,
        label: 'Photon-by-photon table of Alice bits and bases, Eve interceptions, Bob bases and results, and an error-rate gauge',
        draw(ctx, w, h) {
          const C = QA.colors();
          const n = COUNTS[S.idx];
          const labW = w < 420 ? 58 : 76;
          const colW = Math.max(18, Math.min(30, (w - labW - 6) / 16));
          const perRow = Math.floor((w - labW - 6) / colW);
          const bands = Math.min(2, Math.ceil(n / perRow));
          const shown = Math.min(n, perRow * bands);
          const gaugeH = 74;
          const nRows = 6;
          const bandGap = 12;
          const rowH = Math.min(26, (h - gaugeH - 16 - bandGap * (bands - 1)) / (bands * nRows));
          const labels = ['Alice bit', 'Sent', 'Eve', 'Bob basis', 'Bob got', 'Keep?'];
          ctx.textBaseline = 'middle';
          const fs = Math.max(10, Math.min(13, rowH * 0.6));

          for (let b = 0; b < bands; b++) {
            const y0 = 6 + b * (nRows * rowH + bandGap);
            ctx.font = (w < 420 ? 10 : 11) + 'px system-ui, sans-serif';
            ctx.fillStyle = C.muted; ctx.textAlign = 'left';
            for (let r = 0; r < nRows; r++) ctx.fillText(labels[r], 0, y0 + (r + 0.5) * rowH);
            for (let c = 0; c < perRow; c++) {
              const i = b * perRow + c;
              if (i >= shown) break;
              const R = res.rows[i], d = R.d;
              const cx = labW + (c + 0.5) * colW;
              const cy = (r) => y0 + (r + 0.5) * rowH;
              if (R.keep) { ctx.fillStyle = C.grid; ctx.fillRect(cx - colW / 2 + 1, y0, colW - 2, nRows * rowH); }
              ctx.font = '600 ' + fs + 'px system-ui, sans-serif';
              ctx.textAlign = 'center';
              ctx.fillStyle = C.fg; ctx.fillText(String(d.aBit), cx, cy(0));
              // polarisation glyph: + basis: 0 = |, 1 = -; x basis: 0 = /, 1 = \
              const L = Math.min(colW, rowH) * 0.34;
              const ang = d.aBasis === 0 ? (d.aBit ? 0 : Math.PI / 2) : (d.aBit ? -Math.PI / 4 : Math.PI / 4);
              ctx.strokeStyle = C.a; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
              ctx.beginPath();
              ctx.moveTo(cx - L * Math.cos(ang), cy(1) + L * Math.sin(ang));
              ctx.lineTo(cx + L * Math.cos(ang), cy(1) - L * Math.sin(ang));
              ctx.stroke();
              if (R.caught) {
                ctx.fillStyle = C.d;
                ctx.beginPath(); ctx.arc(cx, cy(2), Math.min(colW, rowH) * 0.26, 0, 2 * Math.PI); ctx.fill();
                ctx.fillStyle = C.bg; ctx.font = '700 ' + (fs - 2) + 'px system-ui, sans-serif';
                ctx.fillText('E', cx, cy(2) + 0.5);
                ctx.font = '600 ' + fs + 'px system-ui, sans-serif';
              }
              ctx.fillStyle = C.fg; ctx.fillText(d.bBasis ? '×' : '+', cx, cy(3));
              ctx.fillStyle = R.err ? C.b : R.keep ? C.c : C.muted;
              ctx.fillText(String(R.bBit), cx, cy(4));
              ctx.fillStyle = R.keep ? C.c : C.muted;
              ctx.fillText(R.keep ? '✓' : '·', cx, cy(5));
            }
          }

          // gauge
          ctx.font = '11px system-ui, sans-serif';
          const gy = h - gaugeH + 22, gx = 8, gw = w - 16, gh = 14, gmax = 0.35;
          const GX = (q) => gx + Math.min(1, q / gmax) * gw;
          ctx.fillStyle = C.fg; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
          ctx.fillText('Error rate in kept bits' + (shown < n ? '   (table shows ' + shown + ' of ' + n + ' photons)' : ''), gx, gy - 4);
          ctx.fillStyle = C.grid; ctx.fillRect(gx, gy, gw, gh);
          ctx.fillStyle = res.qber < THRESH ? C.c : C.b;
          ctx.fillRect(gx, gy, GX(res.qber) - gx, gh);
          ctx.strokeStyle = C.fg; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(GX(THRESH), gy - 3); ctx.lineTo(GX(THRESH), gy + gh + 3); ctx.stroke();
          ctx.strokeStyle = C.muted; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(GX(0.25), gy - 3); ctx.lineTo(GX(0.25), gy + gh + 3); ctx.stroke();
          ctx.setLineDash([]);
          ctx.textBaseline = 'top'; ctx.fillStyle = C.muted;
          ctx.textAlign = 'center';
          ctx.fillText('11% safe limit', Math.max(gx + 36, GX(THRESH)), gy + gh + 5);
          ctx.fillText('25%: Eve reads all', Math.min(gx + gw - 50, GX(0.25)), gy + gh + 19);
          ctx.textAlign = 'left';
          ctx.fillText('0%', gx, gy + gh + 19);
        },
      });
      const C0 = QA.colors();
      QA.legend(root, [
        { label: 'photon polarisation', color: C0.a },
        { label: 'Eve intercepted', color: C0.d },
        { label: 'kept and correct', color: C0.c },
        { label: 'kept but wrong', color: C0.b },
      ]);

      const panel = QA.ui.panel(root);
      const readout = QA.ui.readout(root);
      const update = () => {
        res = run(D, COUNTS[S.idx], S.eve, S.noise);
        cv.redraw();
        const pct = (res.qber * 100).toFixed(1);
        let msg = 'Kept ' + res.sifted + ' of ' + COUNTS[S.idx] + ' bits; ' + res.errors + ' disagree, an error rate of ' + pct + '%. ';
        if (res.sifted < 8) msg += 'Too few bits to judge: send more photons.';
        else if (res.qber < THRESH) msg += 'That is under the 11% line, so the key can be made safe.';
        else msg += 'That is over the 11% line: Alice and Bob throw this key away, someone (or something) is spoiling it.';
        readout.set(msg);
      };
      QA.ui.slider(panel, { label: 'Photons sent', min: 0, max: COUNTS.length - 1, step: 1, value: S.idx, format: (v) => String(COUNTS[v]), onInput: (v) => { S.idx = v; update(); } });
      QA.ui.slider(panel, { label: 'Eve intercepts', min: 0, max: 1, step: 0.01, value: S.eve, format: (v) => Math.round(v * 100) + '%', hint: 'she measures and resends in a random basis', onInput: (v) => { S.eve = v; update(); } });
      QA.ui.slider(panel, { label: 'Channel noise', min: 0, max: 0.15, step: 0.005, value: S.noise, format: (v) => (v * 100).toFixed(1) + '%', onInput: (v) => { S.noise = v; update(); } });
      QA.ui.button(panel, { label: 'Send new photons', kind: 'primary', onClick: () => { S.seed++; D = draws(S.seed); update(); } });
      update();
      return () => cv.destroy();
    },
  });
})();
