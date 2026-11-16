/* Bell / CHSH test: quantum singlet correlations versus a local hidden-variable model. */
(function () {
  const D = Math.PI / 180;
  const SQ8 = 2 * Math.SQRT2;

  // Quantum singlet (spin-½ measured along directions in a plane): E = −V cos(θa − θb).
  const Eq = (da, V) => -V * Math.cos(da);
  // Local model: shared random angle λ (uniform). Alice answers sign(cos(a−λ)), Bob −sign(cos(b−λ)).
  // Averaging over λ gives the triangle wave E = −(1 − 2|Δ|/π), |Δ| folded into [0, π].
  const Ecl = (da) => {
    const t = Math.abs((((da % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    return -(1 - (2 * t) / Math.PI);
  };

  QA.registerDemo({
    id: 'chsh',
    title: 'Entanglement and the Bell test',
    emoji: '🔗',
    blurb: 'Two far-apart particles agree with each other more strongly than any hidden plan could arrange.',
    explain:
      'Alice and Bob each measure one particle of a pair, choosing between two settings. E is how often their answers match (+1) or clash (−1). ' +
      'Any "the answers were decided in advance" story (local hidden variables) keeps the combined score S at 2 or less. ' +
      'Entangled particles can reach 2√2 ≈ 2.83. Real experiments see this, which rules out such stories. ' +
      'Simplified: ideal detectors; noise is modelled by shrinking every correlation by the visibility V.',
    tryThis: [
      'Press "Best angles". S jumps to 2.83, past the classical limit.',
      'Switch the source to hidden variables with the same angles. S drops to exactly 2.',
      'Lower the visibility. Below about 71% the quantum advantage vanishes.',
    ],
    mount(root) {
      let A1 = 0, A2 = 90, B1 = 45, B2 = 135, V = 1, src = 'q';

      const top = QA.canvas(root, {
        aspect: 0.55, maxHeight: 300,
        label: 'Measurement dials for Alice and Bob, and a gauge showing the CHSH score S against the classical limit 2 and quantum maximum 2.83',
        draw: drawTop,
      });
      const plt = QA.canvas(root, {
        aspect: 0.5, maxHeight: 280,
        label: 'Correlation E against the angle between Alice and Bob, for the quantum and the hidden-variable model',
        draw: drawPlot,
      });
      QA.legend(root, [
        { label: 'quantum (entangled)', color: 'var(--c1, #6c4cf5)' },
        { label: 'hidden variables', color: 'var(--c3, #12a3a0)' },
        { label: 'your four pairs', color: 'var(--c2, #ff7a59)' },
      ]);
      const panel = QA.ui.panel(root);
      QA.ui.select(panel, {
        label: 'Particle source',
        options: [{ value: 'q', label: 'Entangled pair (quantum singlet)' }, { value: 'c', label: 'Classical hidden variables' }],
        value: 'q', onChange: (x) => { src = x; update(); },
      });
      const deg = (x) => x.toFixed(0) + '°';
      const sa = QA.ui.slider(panel, { label: "Alice's setting a", min: 0, max: 360, step: 1, value: A1, format: deg, onInput: (x) => { A1 = x; update(); } });
      const sa2 = QA.ui.slider(panel, { label: "Alice's setting a′", min: 0, max: 360, step: 1, value: A2, format: deg, onInput: (x) => { A2 = x; update(); } });
      const sb = QA.ui.slider(panel, { label: "Bob's setting b", min: 0, max: 360, step: 1, value: B1, format: deg, onInput: (x) => { B1 = x; update(); } });
      const sb2 = QA.ui.slider(panel, { label: "Bob's setting b′", min: 0, max: 360, step: 1, value: B2, format: deg, onInput: (x) => { B2 = x; update(); } });
      QA.ui.slider(panel, {
        label: 'Visibility V (quantum source only)', min: 0, max: 1, step: 0.01, value: 1,
        format: (x) => Math.round(x * 100) + '%', hint: 'Noise blurs the correlations: 100% is perfect',
        onInput: (x) => { V = x; update(); },
      });
      QA.ui.button(panel, {
        label: 'Best angles (0°, 90°, 45°, 135°)', kind: 'primary',
        onClick: () => { sa.set(0); sa2.set(90); sb.set(45); sb2.set(135); },
      });
      const readout = QA.ui.readout(root);

      const E = (a, b) => (src === 'q' ? Eq((a - b) * D, V) : Ecl((a - b) * D));
      const terms = () => [E(A1, B1), E(A1, B2), E(A2, B1), E(A2, B2)];
      const Sval = () => { const t = terms(); return Math.abs(t[0] - t[1] + t[2] + t[3]); };

      function update() {
        const S = Sval();
        let s = `S = ${S.toFixed(2)}. `;
        if (S > 2 + 1e-6) s += 'That is above 2, the classical limit: no hidden-variable story can produce this.';
        else s += 'That is 2 or less: a hidden-variable story could explain these results.';
        readout.set(s);
        top.redraw(); plt.redraw();
      }

      function dial(ctx, C, x, y, r, name, ang1, ang2, l1, l2, col) {
        ctx.strokeStyle = QA.alpha(C.muted, 0.5); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.stroke();
        ctx.strokeStyle = C.grid;
        ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
        const arrow = (ang, lab, dash) => {
          const ex = x + r * Math.cos(ang * D), ey = y - r * Math.sin(ang * D);
          ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.5; ctx.setLineDash(dash ? [4, 3] : []);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(ex, ey, 3.5, 0, 2 * Math.PI); ctx.fill();
          ctx.fillStyle = C.fg; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(lab, x + (r + 11) * Math.cos(ang * D), y - (r + 11) * Math.sin(ang * D));
        };
        arrow(ang1, l1, false); arrow(ang2, l2, true);
        ctx.fillStyle = C.muted; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(name, x, y + r + 16);
      }

      function drawTop(ctx, w, h) {
        const C = QA.colors();
        const r = Math.max(18, Math.min(w * 0.13, h * 0.2));
        const dy = r + 18;
        dial(ctx, C, w * 0.25, dy, r, 'Alice', A1, A2, 'a', 'a′', C.a);
        dial(ctx, C, w * 0.75, dy, r, 'Bob', B1, B2, 'b', 'b′', C.b);
        ctx.fillStyle = C.muted; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(src === 'q' ? 'entangled' : 'hidden plan', w / 2, dy - 8);
        ctx.fillText('⟵  ●  ⟶', w / 2, dy + 8);

        // numbers
        const t = terms();
        const f = (x) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2);
        const txt = `S = |${f(t[0])} − (${f(t[1])}) ${f(t[2])} ${f(t[3])}|`;
        let fs = 12;
        ctx.font = fs + 'px system-ui, sans-serif';
        while (ctx.measureText(txt).width > w - 16 && fs > 8) { fs--; ctx.font = fs + 'px system-ui, sans-serif'; }
        ctx.fillStyle = C.fg; ctx.textBaseline = 'alphabetic';
        const gy = h - 26;
        ctx.fillText(txt, w / 2, gy - 22);

        // gauge 0..3 (algebraic maximum is 4; quantum cannot pass 2√2)
        const S = Sval();
        const gx0 = 16, gx1 = w - 16, GX = (s) => gx0 + (Math.min(3, s) / 3) * (gx1 - gx0);
        const bh = 10;
        ctx.fillStyle = QA.alpha(C.muted, 0.15); ctx.fillRect(gx0, gy - bh / 2, gx1 - gx0, bh);
        ctx.fillStyle = QA.alpha(C.c, 0.18); ctx.fillRect(gx0, gy - bh / 2, GX(2) - gx0, bh);
        ctx.fillStyle = QA.alpha(C.a, 0.18); ctx.fillRect(GX(2), gy - bh / 2, GX(SQ8) - GX(2), bh);
        ctx.fillStyle = S > 2 + 1e-6 ? C.a : C.c;
        ctx.fillRect(gx0, gy - bh / 2 + 2, GX(S) - gx0, bh - 4);
        const mark = (s, lab, col) => {
          ctx.strokeStyle = col; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(GX(s), gy - bh); ctx.lineTo(GX(s), gy + bh); ctx.stroke();
          ctx.fillStyle = col; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'top';
          ctx.fillText(lab, GX(s), gy + bh + 1);
        };
        ctx.textAlign = 'center';
        mark(0, '0', C.muted);
        ctx.textAlign = 'right';
        mark(2, 'classical 2 ', C.c);
        mark(SQ8, 'quantum 2.83', C.a);
        ctx.fillStyle = C.fg; ctx.beginPath();
        ctx.moveTo(GX(S), gy - bh / 2 - 1); ctx.lineTo(GX(S) - 5, gy - bh / 2 - 8); ctx.lineTo(GX(S) + 5, gy - bh / 2 - 8); ctx.closePath(); ctx.fill();
      }

      function drawPlot(ctx, w, h) {
        const C = QA.colors();
        const P = QA.plot(ctx, w, h, {
          x: [0, 360], y: [-1, 1], xticks: [0, 90, 180, 270, 360], yticks: [-1, -0.5, 0, 0.5, 1],
          xlabel: 'angle between Alice and Bob (degrees)', ylabel: 'correlation E',
        });
        P.axes();
        const xs = [], yq = [], yc = [];
        for (let i = 0; i <= 180; i++) { const x = i * 2; xs.push(x); yq.push(Eq(x * D, V)); yc.push(Ecl(x * D)); }
        P.line(xs, yc, src === 'c' ? C.c : QA.alpha(C.c, 0.55), src === 'c' ? 2.5 : 1.5);
        P.line(xs, yq, src === 'q' ? C.a : QA.alpha(C.a, 0.55), src === 'q' ? 2.5 : 1.5);
        for (const [a, b] of [[A1, B1], [A1, B2], [A2, B1], [A2, B2]]) {
          const dd = ((a - b) % 360 + 360) % 360;
          P.dot(dd, E(a, b), 5, C.b);
        }
      }

      update();
      return () => { top.destroy(); plt.destroy(); };
    },
  });
})();
