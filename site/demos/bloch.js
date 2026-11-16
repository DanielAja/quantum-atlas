/* Bloch sphere: a single qubit as an arrow on a sphere, with gates as rotations. */
(function () {
  const D = Math.PI / 180;
  const fromAngles = (th, ph) => [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];

  // Rodrigues rotation of vector v about unit axis n by angle a (right-hand rule).
  function rotate(v, n, a) {
    const c = Math.cos(a), s = Math.sin(a);
    const dot = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
    const cr = [n[1] * v[2] - n[2] * v[1], n[2] * v[0] - n[0] * v[2], n[0] * v[1] - n[1] * v[0]];
    return [0, 1, 2].map((i) => v[i] * c + cr[i] * s + n[i] * dot * (1 - c));
  }

  // Each gate U = exp(-i a n·σ/2) (up to a global phase) turns the Bloch arrow by angle a about axis n.
  const R2 = Math.SQRT1_2;
  const GATES = {
    X: { n: [1, 0, 0], a: Math.PI, tip: 'X: half-turn about the x axis (a quantum NOT)' },
    Y: { n: [0, 1, 0], a: Math.PI, tip: 'Y: half-turn about the y axis' },
    Z: { n: [0, 0, 1], a: Math.PI, tip: 'Z: half-turn about the z axis (flips the phase)' },
    H: { n: [R2, 0, R2], a: Math.PI, tip: 'H (Hadamard): half-turn about the x+z diagonal' },
    S: { n: [0, 0, 1], a: Math.PI / 2, tip: 'S: quarter-turn about z' },
    T: { n: [0, 0, 1], a: Math.PI / 4, tip: 'T: eighth-turn about z' },
  };

  QA.registerDemo({
    id: 'bloch',
    title: 'A qubit on the Bloch sphere',
    emoji: '🌐',
    blurb: 'A qubit is like an arrow that can point anywhere on a globe, not just at the North or South Pole.',
    explain:
      'The top of the sphere is the state 0 and the bottom is 1. Anywhere else is a superposition: a blend of both. ' +
      'How far the arrow tilts (θ) sets the odds of reading 0 or 1, and the direction around the equator (φ) is the phase, ' +
      'which you cannot see in one measurement but which changes how the qubit interferes later. Quantum gates simply turn the arrow. ' +
      'Simplified: this is one ideal qubit with no noise.',
    tryThis: [
      'Start at the top (θ = 0°) and press H: the arrow lies on the equator, a 50/50 coin.',
      'Press H twice. You are back where you started.',
      'Put the arrow on the equator and press T or S a few times: the odds never change, only the phase.',
      'Drag the sphere to look at it from another side.',
    ],
    mount(root) {
      let v = fromAngles(60 * D, 30 * D);
      let phKeep = 30 * D;
      let yaw = -0.55, pitch = 0.32;
      let anim = null; // {v0, n, a, p}
      let loop = null;
      let syncing = false;

      const c = QA.canvas(root, {
        aspect: 0.62, maxHeight: 380,
        label: 'Bloch sphere with the qubit state arrow, and bars for the chance of measuring 0 or 1',
        draw,
      });
      const panel = QA.ui.panel(root);
      const sTh = QA.ui.slider(panel, {
        label: 'Tilt from 0 toward 1 (θ)', min: 0, max: 180, step: 1, value: 60,
        format: (x) => x.toFixed(0) + '°',
        onInput: (x) => { if (syncing) return; finish(); v = fromAngles(x * D, sPh.value * D); update(); },
      });
      const sPh = QA.ui.slider(panel, {
        label: 'Phase: turn around the equator (φ)', min: 0, max: 360, step: 1, value: 30,
        format: (x) => x.toFixed(0) + '°',
        onInput: (x) => { if (syncing) return; finish(); phKeep = x * D; v = fromAngles(sTh.value * D, x * D); update(); },
      });
      const gateRow = QA.el('div', { class: 'demo-buttons', style: 'display:flex;flex-wrap:wrap;gap:6px' });
      panel.append(gateRow);
      for (const g of Object.keys(GATES)) {
        const b = QA.ui.button(gateRow, { label: g, onClick: () => applyGate(g) });
        b.title = GATES[g].tip;
        b.setAttribute('aria-label', GATES[g].tip);
      }
      QA.ui.button(gateRow, {
        label: 'Reset to 0', onClick: () => { finish(); v = [0, 0, 1]; syncSliders(); update(); },
      });
      const readout = QA.ui.readout(root);

      function syncSliders() {
        const th = Math.acos(Math.max(-1, Math.min(1, v[2])));
        if (Math.hypot(v[0], v[1]) > 1e-6) phKeep = (Math.atan2(v[1], v[0]) + 2 * Math.PI) % (2 * Math.PI);
        syncing = true;
        sTh.set(th / D);
        sPh.set(phKeep / D);
        syncing = false;
      }

      function finish() {
        if (!anim) return;
        const a = anim; anim = null;
        v = rotate(a.v0, a.n, a.a);
        if (loop) { loop.stop(); loop = null; }
        syncSliders();
      }

      function applyGate(g) {
        finish();
        const G = GATES[g];
        if (QA.reducedMotion()) {
          v = rotate(v, G.n, G.a);
          syncSliders(); update();
          return;
        }
        anim = { v0: v.slice(), n: G.n, a: G.a, p: 0 };
        const dur = 0.35 + 0.4 * (G.a / Math.PI);
        loop = QA.loop((dt) => {
          if (!anim) return;
          anim.p = Math.min(1, anim.p + dt / dur);
          const e = anim.p < 0.5 ? 2 * anim.p * anim.p : 1 - Math.pow(-2 * anim.p + 2, 2) / 2;
          v = rotate(anim.v0, anim.n, anim.a * e);
          if (anim.p >= 1) finish();
          update();
        });
      }

      function update() {
        const p0 = (1 + v[2]) / 2, p1 = 1 - p0;
        const th = Math.acos(Math.max(-1, Math.min(1, v[2])));
        const ph = Math.hypot(v[0], v[1]) > 1e-6 ? (Math.atan2(v[1], v[0]) / D + 360) % 360 : phKeep / D;
        const pct = (x) => (100 * x).toFixed(x > 0.001 && x < 0.999 ? 1 : 0) + '%';
        const a0 = Math.cos(th / 2), a1 = Math.sin(th / 2);
        readout.set(
          `If you measure now: 0 with ${pct(p0)} chance (P(0) = cos²(θ/2)), 1 with ${pct(p1)}. ` +
          `State: ${a0.toFixed(2)}|0⟩ + ${a1.toFixed(2)}·e^(i·${ph.toFixed(0)}°)|1⟩.`
        );
        c.redraw();
      }

      function proj(p, cx, cy, R) {
        const [x, y, z] = p;
        const cyw = Math.cos(yaw), syw = Math.sin(yaw);
        const x1 = x * cyw - y * syw, y1 = x * syw + y * cyw;
        const cp = Math.cos(pitch), sp = Math.sin(pitch);
        const up = z * cp - x1 * sp;
        const depth = x1 * cp + z * sp;
        return [cx + R * y1, cy - R * up, depth];
      }

      function draw(ctx, w, h) {
        const C = QA.colors();
        const cx = w * 0.35, cy = h * 0.5;
        const R = Math.min(w * 0.28, h * 0.4);

        // body
        const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
        g.addColorStop(0, QA.alpha(C.a, 0.12));
        g.addColorStop(1, QA.alpha(C.a, 0.03));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill();
        ctx.strokeStyle = QA.alpha(C.muted, 0.6); ctx.lineWidth = 1.2;
        ctx.stroke();

        // great circles: draw back half faint, front half stronger
        const circle = (f, col, wFront) => {
          const N = 72;
          let prev = proj(f(0), cx, cy, R);
          for (let i = 1; i <= N; i++) {
            const cur = proj(f((i / N) * 2 * Math.PI), cx, cy, R);
            const front = prev[2] + cur[2] > 0;
            ctx.strokeStyle = front ? col : QA.alpha(C.muted, 0.18);
            ctx.lineWidth = front ? wFront : 1;
            ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(cur[0], cur[1]); ctx.stroke();
            prev = cur;
          }
        };
        for (const p0 of [0, 45, 90, 135]) {
          const ph = p0 * D;
          circle((t) => [Math.sin(t) * Math.cos(ph), Math.sin(t) * Math.sin(ph), Math.cos(t)], QA.alpha(C.muted, 0.35), 1);
        }
        for (const lat of [-45, 45]) {
          const z = Math.sin(lat * D), r = Math.cos(lat * D);
          circle((t) => [r * Math.cos(t), r * Math.sin(t), z], QA.alpha(C.muted, 0.25), 1);
        }
        circle((t) => [Math.cos(t), Math.sin(t), 0], QA.alpha(C.fg, 0.55), 1.4);

        // axes
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const axes = [
          { a: [0, 0, 1], label: '|0⟩' }, { a: [0, 0, -1], label: '|1⟩' },
          { a: [1, 0, 0], label: 'x' }, { a: [0, 1, 0], label: 'y' },
        ];
        for (const ax of axes) {
          const p1 = proj(ax.a, cx, cy, R), p2 = proj(ax.a.map((q) => q * 1.2), cx, cy, R);
          const o = proj([0, 0, 0], cx, cy, R);
          ctx.strokeStyle = QA.alpha(C.muted, 0.45); ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = ax.label.length > 1 ? C.fg : C.muted;
          ctx.fillText(ax.label, p2[0], p2[1]);
        }

        // rotation axis while a gate animates
        if (anim) {
          const pa = proj(anim.n.map((q) => q * 1.25), cx, cy, R), pb = proj(anim.n.map((q) => -q * 1.25), cx, cy, R);
          ctx.strokeStyle = C.d; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
          ctx.setLineDash([]);
        }

        // state arrow with shadow on the equator plane
        const o = proj([0, 0, 0], cx, cy, R);
        const tip = proj(v, cx, cy, R);
        const sh = proj([v[0], v[1], 0], cx, cy, R);
        ctx.strokeStyle = QA.alpha(C.b, 0.5); ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(sh[0], sh[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
        ctx.setLineDash([]);
        const front = tip[2] >= -0.05;
        ctx.strokeStyle = front ? C.b : QA.alpha(C.b, 0.6);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
        const ang = Math.atan2(tip[1] - o[1], tip[0] - o[0]);
        const len = Math.hypot(tip[0] - o[0], tip[1] - o[1]);
        if (len > 8) {
          ctx.beginPath();
          ctx.moveTo(tip[0], tip[1]);
          ctx.lineTo(tip[0] - 10 * Math.cos(ang - 0.4), tip[1] - 10 * Math.sin(ang - 0.4));
          ctx.lineTo(tip[0] - 10 * Math.cos(ang + 0.4), tip[1] - 10 * Math.sin(ang + 0.4));
          ctx.closePath(); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(tip[0], tip[1], 4, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = C.fg; ctx.beginPath(); ctx.arc(o[0], o[1], 2.5, 0, 2 * Math.PI); ctx.fill();

        // probability bars
        const p0 = (1 + v[2]) / 2, p1 = 1 - p0;
        const bx0 = w * 0.7, bx1 = w - 10;
        const top = h * 0.14, bot = h * 0.82, bh = bot - top;
        const bw = Math.min(40, (bx1 - bx0) * 0.34);
        const xs = [bx0 + (bx1 - bx0) * 0.27, bx0 + (bx1 - bx0) * 0.73];
        ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx0, bot); ctx.lineTo(bx1, bot); ctx.stroke();
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('chance', (bx0 + bx1) / 2, top - 4);
        [[p0, '0', C.a], [p1, '1', C.c]].forEach(([p, lab, col], i) => {
          ctx.fillStyle = QA.alpha(col, 0.18);
          ctx.fillRect(xs[i] - bw / 2, top, bw, bh);
          ctx.fillStyle = col;
          ctx.fillRect(xs[i] - bw / 2, bot - p * bh, bw, p * bh);
          ctx.fillStyle = C.fg; ctx.textBaseline = 'top';
          ctx.font = '12px system-ui, sans-serif';
          ctx.fillText(lab, xs[i], bot + 4);
          ctx.font = '11px system-ui, sans-serif';
          ctx.fillText(Math.round(p * 100) + '%', xs[i], bot + 19);
        });

        ctx.fillStyle = C.muted; ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText('drag to turn', 6, h - 4);
      }

      // drag to rotate the view
      const cv = c.canvas;
      cv.style.touchAction = 'pan-y';
      cv.style.cursor = 'grab';
      let drag = null;
      const onDown = (e) => { drag = { x: e.clientX, y: e.clientY, yaw, pitch }; try { cv.setPointerCapture(e.pointerId); } catch (_) {} };
      const onMove = (e) => {
        if (!drag) return;
        yaw = drag.yaw + (e.clientX - drag.x) * 0.008;
        pitch = Math.max(-1.3, Math.min(1.3, drag.pitch + (e.clientY - drag.y) * 0.008));
        c.redraw();
      };
      const onUp = () => { drag = null; };
      cv.addEventListener('pointerdown', onDown);
      cv.addEventListener('pointermove', onMove);
      cv.addEventListener('pointerup', onUp);
      cv.addEventListener('pointercancel', onUp);

      update();
      return () => {
        if (loop) loop.stop();
        c.destroy();
        cv.removeEventListener('pointerdown', onDown);
        cv.removeEventListener('pointermove', onMove);
        cv.removeEventListener('pointerup', onUp);
        cv.removeEventListener('pointercancel', onUp);
      };
    },
  });
})();
