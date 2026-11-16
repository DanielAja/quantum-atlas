/* Double slit: Fraunhofer intensity pattern plus particles landing one at a time. */
(function () {
  const YMAX = 40; // half-width of the screen window, mm
  const MAXDOTS = 6000;

  // Approximate RGB for a visible wavelength in nm (for colouring the dots).
  function waveRGB(nm) {
    let r = 0, g = 0, b = 0;
    if (nm < 440) { r = (440 - nm) / 60; b = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { g = 1; b = (510 - nm) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = (645 - nm) / 65; }
    else r = 1;
    const f = nm < 420 ? 0.4 + 0.6 * (nm - 380) / 40 : nm > 680 ? 0.4 + 0.6 * (700 - nm) / 20 : 1;
    const c = (x) => Math.round(255 * Math.pow(Math.max(0, x * f), 0.8));
    return `rgb(${c(r)},${c(g)},${c(b)})`;
  }

  const sinc = (x) => (Math.abs(x) < 1e-8 ? 1 : Math.sin(x) / x);

  QA.registerDemo({
    id: 'doubleslit',
    title: 'The double-slit experiment',
    emoji: '🌊',
    blurb: 'Fire particles one by one at two thin slits and, slowly, a striped wave pattern appears.',
    explain:
      'Each particle lands in a single spot, but where it lands follows the rules of a wave passing through both slits at once. ' +
      'The stripes come from the two slits interfering; the broad hump around them comes from each slit on its own. ' +
      'If you watch which slit each particle uses, the stripes disappear. ' +
      'Simplified: the far-screen (Fraunhofer) formula, I(y) ∝ sinc²(π a y / λL) × cos²(π d y / λL), using sin θ ≈ y/L.',
    tryThis: [
      'Watch the dots for a while: random at first, then stripes appear.',
      'Move the slits closer together: the stripes spread apart.',
      'Turn on "watch which slit" and reset. Only the single broad glow is left.',
      'Change the colour (wavelength): red light makes wider stripes than blue.',
    ],
    mount(root) {
      let lam = 550, d = 50, a = 8, L = 1, watch = false; // nm, µm, µm, m
      const dots = new Float32Array(MAXDOTS * 2);
      let n = 0, acc = 0, elapsed = 0, lastTick = 0;
      let loop = null;

      const c = QA.canvas(root, {
        aspect: 0.85, maxHeight: 460,
        label: 'Intensity pattern on the screen above, and a strip where individual particles land below',
        draw,
      });
      const panel = QA.ui.panel(root);
      QA.ui.slider(panel, {
        label: 'Wavelength (colour)', min: 380, max: 700, step: 5, value: lam,
        format: (x) => x.toFixed(0) + ' nm', onInput: (x) => { lam = x; changed(); },
      });
      QA.ui.slider(panel, {
        label: 'Slit separation d', min: 25, max: 100, step: 1, value: d,
        format: (x) => x.toFixed(0) + ' µm', onInput: (x) => { d = x; changed(); },
      });
      QA.ui.slider(panel, {
        label: 'Slit width a', min: 2, max: 20, step: 0.5, value: a,
        format: (x) => x.toFixed(1) + ' µm', onInput: (x) => { a = x; changed(); },
      });
      QA.ui.slider(panel, {
        label: 'Distance to screen L', min: 0.5, max: 2.5, step: 0.05, value: L,
        format: (x) => x.toFixed(2) + ' m', onInput: (x) => { L = x; changed(); },
      });
      QA.ui.toggle(panel, {
        label: 'Watch which slit each particle goes through',
        value: false, onChange: (b) => { watch = b; changed(); },
      });
      QA.ui.button(panel, { label: 'Reset the screen', onClick: () => changed() });
      const readout = QA.ui.readout(root);

      // Intensity at screen position y (mm). Normalised so the no-watching peak is 1.
      // Watching: incoherent sum of the two single-slit patterns (identical in the far field) = ½ sinc².
      function I(y) {
        const s = (y * 1e-3) / Math.hypot(L, y * 1e-3); // sin θ
        const k = Math.PI / (lam * 1e-9);
        const env = Math.pow(sinc(k * a * 1e-6 * s), 2);
        return watch ? 0.5 * env : env * Math.pow(Math.cos(k * d * 1e-6 * s), 2);
      }
      function sample() {
        const Imax = watch ? 0.5 : 1;
        for (let tries = 0; tries < 400; tries++) {
          const y = (Math.random() * 2 - 1) * YMAX;
          if (Math.random() * Imax < I(y)) return y;
        }
        return (Math.random() * 2 - 1) * YMAX * 0.05;
      }
      function addDots(k) {
        for (let i = 0; i < k && n < MAXDOTS; i++) {
          dots[2 * n] = sample();
          dots[2 * n + 1] = Math.random();
          n++;
        }
      }

      function changed() {
        n = 0; acc = 0; elapsed = 0; lastTick = 0;
        if (QA.reducedMotion()) addDots(2000);
        update();
      }

      function update() {
        const fringe = (lam * 1e-9 * L) / (d * 1e-6) * 1e3; // mm
        const env = (lam * 1e-9 * L) / (a * 1e-6) * 1e3; // first dark spot of the envelope, mm
        const count = n.toLocaleString();
        readout.set(
          watch
            ? `No stripes: watching the slits leaves one broad glow, dark first at ±${env.toFixed(1)} mm. ${count} particles have landed.`
            : `Bright stripes are ${fringe.toFixed(1)} mm apart (λL/d). ${count} particles have landed.`
        );
        c.redraw();
      }

      function draw(ctx, w, h) {
        const C = QA.colors();
        const hp = Math.round(h * 0.62);
        const P = QA.plot(ctx, w, hp, {
          x: [-YMAX, YMAX], y: [0, 1.05], yticks: [0, 0.5, 1],
          xlabel: 'position on the screen (mm)', ylabel: 'brightness', pad: { b: 32 },
        });
        P.axes();
        const N = Math.max(200, Math.round(P.inner.w * 2));
        const xs = new Array(N + 1), ys = new Array(N + 1), es = new Array(N + 1);
        const wsave = watch;
        for (let i = 0; i <= N; i++) {
          const y = -YMAX + (2 * YMAX * i) / N;
          xs[i] = y; ys[i] = I(y);
          watch = true; es[i] = 2 * I(y); watch = wsave; // single-slit envelope, peak 1
        }
        P.area(xs, ys, QA.alpha(C.a, 0.18));
        P.line(xs, ys, C.a, 1.6);
        if (!watch) P.line(xs, es, QA.alpha(C.muted, 0.8), 1, [4, 4]);

        // particle screen (always dark, like a real detector screen)
        const sx = P.inner.l, sw = P.inner.w;
        const sy = hp + 6, sh = h - sy - 4;
        ctx.fillStyle = '#0c0b16';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = C.grid; ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
        ctx.fillStyle = waveRGB(lam);
        const sz = n > 3000 ? 1.5 : 2;
        for (let i = 0; i < n; i++) {
          const px = sx + ((dots[2 * i] + YMAX) / (2 * YMAX)) * sw;
          const py = sy + 2 + dots[2 * i + 1] * (sh - 4);
          ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(n ? n.toLocaleString() + ' hits' : 'waiting for particles…', sx + 5, sy + 4);
        ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(watch ? '' : 'dashed: one slit alone', w - 12, 11 + 10);
      }

      if (QA.reducedMotion()) {
        addDots(2000);
      } else {
        loop = QA.loop((dt) => {
          if (n >= MAXDOTS || !dt) return;
          elapsed += dt;
          const rate = Math.min(600, 6 + elapsed * elapsed * 12); // starts slow: one at a time
          acc += rate * dt;
          const k = Math.floor(acc);
          if (k > 0) {
            acc -= k; addDots(k);
            // refresh the spoken readout only every 2 s; redraw every frame
            if (Math.floor(elapsed / 2) !== lastTick || n >= MAXDOTS) { lastTick = Math.floor(elapsed / 2); update(); } else c.redraw();
          }
        });
      }
      update();
      return () => { if (loop) loop.stop(); c.destroy(); };
    },
  });
})();
