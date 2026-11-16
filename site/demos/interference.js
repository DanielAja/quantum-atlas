/* Mach–Zehnder interferometer: one photon, two paths, interference controlled by a phase. */
(function () {
  const D = Math.PI / 180;

  // Symmetric lossless beam splitter: transmitted amplitude t = √(1−R), reflected amplitude i·r with r = √R.
  // Photon enters BS1; arm A = reflected (gets phase φ), arm B = transmitted. Both BSs have reflectivity R.
  // D1 amplitude = A·t + B·(i r)   D2 amplitude = A·(i r) + B·t
  // ⇒ P1 = r1²t2² + t1²r2² + 2 r1 t1 r2 t2 cos φ, P2 = 1 − P1.
  function probs(phi, R, which) {
    const r = Math.sqrt(R), t = Math.sqrt(1 - R);
    const direct = r * r * t * t + t * t * r * r; // r1²t2² + t1²r2²
    const cross = which ? 0 : 2 * r * t * r * t * Math.cos(phi);
    const p1 = Math.max(0, Math.min(1, direct + cross));
    return [p1, 1 - p1];
  }

  QA.registerDemo({
    id: 'interference',
    title: 'One photon, two paths: the Mach–Zehnder interferometer',
    emoji: '🔀',
    blurb: 'A single particle of light takes both roads at once, and the two roads can cancel or add up.',
    explain:
      'The first half-silvered mirror splits the photon into two possible paths. The second one brings them back together. ' +
      'Because the photon really did "go both ways", the two paths interfere: a small delay φ in one arm decides which detector clicks. ' +
      'If you put a detector on one arm to learn which way it went, the interference is gone and each detector just gets its fair share. ' +
      'Simplified: ideal lossless mirrors, both splitters with the same reflectivity.',
    tryThis: [
      'Slide the phase φ from 0° to 180°: the photon switches from always D1 to always D2.',
      'Turn on the which-path detector. Now φ does nothing at all.',
      'Make the splitters very uneven (reflectivity near 10%). The swing between D1 and D2 gets weaker.',
    ],
    mount(root) {
      let phi = 0, R = 0.5, which = false;

      const dia = QA.canvas(root, {
        aspect: 0.56, maxHeight: 340,
        label: 'Diagram of a Mach–Zehnder interferometer: source, two beam splitters, two mirrors and two detectors, with beam brightness showing amplitude',
        draw: drawDiagram,
      });
      const plt = QA.canvas(root, {
        aspect: 0.48, maxHeight: 280,
        label: 'Plot of the chance of detector D1 and D2 clicking against the phase difference',
        draw: drawPlot,
      });
      QA.legend(root, [{ label: 'D1 (right)', color: 'var(--c1, #6c4cf5)' }, { label: 'D2 (top, dashed)', color: 'var(--c3, #12a3a0)' }]);
      const panel = QA.ui.panel(root);
      QA.ui.slider(panel, {
        label: 'Phase delay in the upper arm (φ)', min: 0, max: 360, step: 1, value: 0,
        format: (x) => x.toFixed(0) + '°',
        onInput: (x) => { phi = x * D; update(); },
      });
      QA.ui.slider(panel, {
        label: 'Beam-splitter reflectivity (both)', min: 0, max: 1, step: 0.01, value: 0.5,
        format: (x) => Math.round(x * 100) + '%',
        hint: '50% is a perfect half-silvered mirror',
        onInput: (x) => { R = x; update(); },
      });
      QA.ui.toggle(panel, {
        label: 'Which-path detector on the lower arm',
        value: false,
        onChange: (b) => { which = b; update(); },
      });
      const readout = QA.ui.readout(root);

      function update() {
        const [p1, p2] = probs(phi, R, which);
        const swing = 4 * R * (1 - R); // D1 ranges from 0 to 4R(1−R) as φ varies
        let s = `Detector D1 clicks ${(p1 * 100).toFixed(0)}% of the time, D2 ${(p2 * 100).toFixed(0)}%.`;
        if (which) s += ' The path is being watched, so there is no interference: the phase has no effect.';
        else s += ` Turning φ can move D1 anywhere between 0% and ${(swing * 100).toFixed(0)}%.`;
        readout.set(s);
        dia.redraw(); plt.redraw();
      }

      function beam(ctx, C, x0, y0, x1, y1, I) {
        const amp = Math.sqrt(Math.max(0, I));
        if (amp < 0.01) {
          ctx.strokeStyle = QA.alpha(C.muted, 0.25); ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
          return;
        }
        ctx.strokeStyle = QA.alpha(C.b, 0.12 * amp); ctx.lineWidth = 4 + 10 * I;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.strokeStyle = QA.alpha(C.b, 0.15 + 0.85 * amp); ctx.lineWidth = 1.5 + 3 * I;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }

      function drawDiagram(ctx, w, h) {
        const C = QA.colors();
        const [p1, p2] = probs(phi, R, which);
        const xL = w * 0.2, xR = w * 0.66, yT = h * 0.34, yB = h * 0.8;
        const src = [w * 0.03, yB], D1 = [w * 0.88, yT], D2 = [xR, h * 0.1];
        const s = Math.max(10, Math.min(w, h) * 0.07); // half-size of optics

        // beams
        beam(ctx, C, src[0], yB, xL, yB, 1);
        beam(ctx, C, xL, yB, xL, yT, R); // arm A up
        beam(ctx, C, xL, yT, xR, yT, R); // arm A across
        beam(ctx, C, xL, yB, xR, yB, 1 - R); // arm B across
        beam(ctx, C, xR, yB, xR, yT, 1 - R); // arm B up
        beam(ctx, C, xR, yT, D1[0], yT, p1);
        beam(ctx, C, xR, yT, xR, D2[1], p2);

        // optics: all tilted "/"
        const optic = (x, y, kind) => {
          ctx.lineWidth = kind === 'mirror' ? 4 : 2.5;
          ctx.strokeStyle = kind === 'mirror' ? C.fg : C.a;
          if (kind === 'bs') {
            ctx.fillStyle = QA.alpha(C.a, 0.15);
            ctx.fillRect(x - s * 0.7, y - s * 0.7, s * 1.4, s * 1.4);
          }
          ctx.beginPath(); ctx.moveTo(x - s * 0.8, y + s * 0.8); ctx.lineTo(x + s * 0.8, y - s * 0.8); ctx.stroke();
        };
        optic(xL, yB, 'bs'); optic(xL, yT, 'mirror'); optic(xR, yB, 'mirror'); optic(xR, yT, 'bs');

        // source
        ctx.fillStyle = C.d;
        ctx.beginPath(); ctx.arc(src[0] + 5, yB, 6, 0, 2 * Math.PI); ctx.fill();

        // phase shifter on arm A
        const px = (xL + xR) / 2;
        ctx.fillStyle = QA.alpha(C.d, 0.3); ctx.strokeStyle = C.d; ctx.lineWidth = 1.5;
        ctx.fillRect(px - s * 0.9, yT - s * 0.8, s * 1.8, s * 1.6);
        ctx.strokeRect(px - s * 0.9, yT - s * 0.8, s * 1.8, s * 1.6);
        ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = C.fg;
        ctx.fillText('φ = ' + Math.round(phi / D) + '°', px, yT - s * 0.9 - 2);

        // which-path detector on arm B
        if (which) {
          const wx = (xL + xR) / 2;
          ctx.strokeStyle = C.b; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(wx, yB + s * 1.6, s * 0.9, s * 0.5, 0, 0, 2 * Math.PI); ctx.stroke();
          ctx.fillStyle = C.b; ctx.beginPath(); ctx.arc(wx, yB + s * 1.6, s * 0.25, 0, 2 * Math.PI); ctx.fill();
          ctx.textBaseline = 'top'; ctx.fillStyle = C.fg; ctx.font = '11px system-ui, sans-serif';
          ctx.fillText('watching', wx, Math.min(h - 14, yB + s * 2.2));
        }

        // detectors
        const det = (x, y, p, lab, col, dx, dy) => {
          const r = s * 0.9;
          ctx.fillStyle = QA.alpha(col, 0.12 + 0.75 * p);
          ctx.strokeStyle = col; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
          ctx.fillStyle = C.fg; ctx.font = '12px system-ui, sans-serif';
          ctx.textAlign = dx > 0 ? 'left' : 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(lab + ' ' + Math.round(p * 100) + '%', x + dx * (r + 4), y + dy * (r + 10));
        };
        det(D1[0], D1[1], p1, 'D1', C.a, 0, 1);
        det(D2[0], D2[1], p2, 'D2', C.c, 1, 0);

        ctx.fillStyle = C.muted; ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('photon in', src[0], yB + 10);
      }

      function drawPlot(ctx, w, h) {
        const C = QA.colors();
        const P = QA.plot(ctx, w, h, {
          x: [0, 360], y: [0, 1], xticks: [0, 90, 180, 270, 360], yticks: [0, 0.5, 1],
          xlabel: 'phase difference φ (degrees)', ylabel: 'chance',
        });
        P.axes();
        const xs = [], y1 = [], y2 = [];
        for (let i = 0; i <= 180; i++) {
          const d = i * 2; xs.push(d);
          const [a, b] = probs(d * D, R, which); y1.push(a); y2.push(b);
        }
        P.line(xs, y1, C.a, 2.5);
        P.line(xs, y2, C.c, 2.5, [6, 4]);
        const xd = phi / D;
        ctx.strokeStyle = QA.alpha(C.fg, 0.5); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(P.X(xd), P.Y(0)); ctx.lineTo(P.X(xd), P.Y(1)); ctx.stroke();
        const [a, b] = probs(phi, R, which);
        P.dot(xd, a, 5, C.a); P.dot(xd, b, 5, C.c);
      }

      update();
      return () => { dia.destroy(); plt.destroy(); };
    },
  });
})();
