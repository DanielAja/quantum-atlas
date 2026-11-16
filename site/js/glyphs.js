/* Physics glyphs: hand-drawn line icons for every field and demo (replaces emoji).
   Each is a 24×24 drawing of the real object or diagram behind the idea. */
(function () {
  const QA = (window.QA = window.QA || {});
  const P = {
    /* ---- fields ---- */
    // a two-qubit circuit: wires, a gate box and a CNOT
    computing: '<path d="M2 8h20M2 16h20"/><rect x="5" y="5" width="5" height="6" rx="1"/><circle cx="15" cy="8" r="1.4" fill="currentColor"/><path d="M15 8v8"/><circle cx="15" cy="16" r="2.4"/><path d="M12.6 16h4.8"/>',
    // a surface-code patch: data qubits on a lattice with one stabiliser plaquette
    'error-correction': '<path d="M4 4h16v16H4zM12 4v16M4 12h16"/><path d="M4 4l8 8M12 4l8 8" opacity=".35"/><g fill="currentColor"><circle cx="4" cy="4" r="1.3"/><circle cx="12" cy="4" r="1.3"/><circle cx="20" cy="4" r="1.3"/><circle cx="4" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="20" cy="12" r="1.3"/><circle cx="4" cy="20" r="1.3"/><circle cx="12" cy="20" r="1.3"/><circle cx="20" cy="20" r="1.3"/></g>',
    // two particles joined by an entangling wave
    information: '<circle cx="5" cy="12" r="3"/><circle cx="19" cy="12" r="3"/><path d="M8 12c1.2-3 2.3-3 3.5 0s2.3 3 3.5 0"/>',
    // photon polarisations in two bases (BB84)
    communication: '<path d="M4 3v8M2 5l2-2 2 2M2 9l2 2 2-2"/><path d="M9 10l6-6M9 7V10h3M15 7V4h-3"/><path d="M2 18h17"/><path d="M17 15l3 3-3 3"/><circle cx="7" cy="18" r="1.3" fill="currentColor"/>',
    // Ramsey fringes under a slowly decaying envelope
    sensing: '<path d="M2 12c1 -7 2 -7 3 0s2 7 3 0 2 -6 3 0 2 6 3 0 2 -4 3 0 2 4 3 0 1.5 -2 2 0"/><path d="M2 4.5c6 1 12 4 20 7" opacity=".4"/>',
    // a beam splitter cube with transmitted and reflected beams
    optics: '<rect x="8" y="8" width="8" height="8"/><path d="M8 16l8-8"/><path d="M1 12h7M16 12h7M12 8V1" /><path d="M20 10l2 2-2 2M10 3l2-2 2 2"/>',
    // atoms sitting in the wells of an optical lattice
    atoms: '<path d="M1 17c2.5 0 2.5-8 5.5-8s3 8 5.5 8 2.5-8 5.5-8 2.5 8 5.5 8"/><circle cx="6.5" cy="13" r="1.8" fill="currentColor"/><circle cx="17.5" cy="13" r="1.8" fill="currentColor"/><path d="M1 21h22" opacity=".4"/>',
    // an antiferromagnetic spin chain
    condensed: '<path d="M4 16V6M2 8l2-2 2 2M10 6v10M8 14l2 2 2-2M16 16V6M14 8l2-2 2 2M22 6v10M20 14l2 2 2-2" transform="translate(-1 0)"/><path d="M2 20h20" opacity=".4"/>',
    // a transmon: two capacitor pads joined by a Josephson junction (×)
    hardware: '<rect x="2" y="7" width="7" height="10" rx="1.5"/><rect x="15" y="7" width="7" height="10" rx="1.5"/><path d="M9 12h6"/><path d="M10.6 10.4l2.8 3.2M13.4 10.4l-2.8 3.2"/>',
    // a Bloch vector spiralling into the centre (relaxation)
    'open-systems': '<circle cx="12" cy="12" r="10" opacity=".35"/><path d="M12 2c5.5 0 9 4 9 9 0 4.5-3.5 7.5-7.5 7.5-3.8 0-6-2.8-6-6s2.4-5 4.8-5 3.7 1.6 3.7 3.6-1.3 3-2.8 3-2-1-2-2"/>',
    // the double slit: a barrier and the fringe pattern behind it
    foundations: '<path d="M7 2v6M7 10v4M7 16v6"/><path d="M15 3v18" opacity=".4"/><g fill="currentColor"><rect x="17" y="10.5" width="5" height="3" rx="1"/><rect x="17" y="6" width="3.5" height="2" rx="1" opacity=".7"/><rect x="17" y="16" width="3.5" height="2" rx="1" opacity=".7"/><rect x="17" y="2.5" width="2" height="1.6" rx=".8" opacity=".4"/><rect x="17" y="19.9" width="2" height="1.6" rx=".8" opacity=".4"/></g><path d="M1 12h4" />',
    // a Feynman diagram: two fermion lines exchanging a photon
    hep: '<path d="M3 4l5 8-5 8M21 4l-5 8 5 8"/><path d="M8 12c.7-1.6 1.3-1.6 2 0s1.3 1.6 2 0 1.3-1.6 2 0 1.3 1.6 2 0"/><circle cx="8" cy="12" r="1.2" fill="currentColor"/><circle cx="16" cy="12" r="1.2" fill="currentColor"/>',
    // a small molecule with a Trotter-step bracket
    simulation: '<circle cx="7" cy="14" r="3"/><circle cx="17" cy="9" r="3"/><circle cx="17" cy="19" r="2"/><path d="M9.7 12.7l4.6-2.4M9.8 15.3l5.4 2.7"/><path d="M3 3h3M3 3v4M21 3h-3M21 3v4" opacity=".5"/>',
    // a tiny neural network whose nodes are Bloch spheres
    qml: '<circle cx="4" cy="7" r="2"/><circle cx="4" cy="17" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="20" cy="12" r="2.4"/><path d="M6 7.5l4-2M6 8l4 3.4M6 16l4-3.2M6 16.5l4 2M14 5.8l4 5M14 12h3.6M14 18.2l4-5"/>',

    /* ---- demos ---- */
    bloch: '<circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="10" ry="3.4" opacity=".45"/><path d="M12 12l5-7"/><circle cx="17" cy="5" r="1.5" fill="currentColor"/><path d="M12 2v20" opacity=".25"/>',
    interference: '<path d="M1 6h4h14v12M5 6v12h14h4M19 18v5" /><path d="M3.5 4.5l3 3M17.5 16.5l3 3" stroke-width="2.4"/><path d="M17.5 4.5l3 3M3.5 16.5l3 3" stroke-width="2.4" opacity=".5"/>',
    doubleslit: '<path d="M8 2v7M8 11v2M8 15v7"/><path d="M1 12h4"/><path d="M14 4c3 2 3 14 0 16M17 6c2 2 2 10 0 12M20 8c1 2 1 6 0 8" opacity=".6"/>',
    chsh: '<circle cx="5" cy="12" r="3.5"/><circle cx="19" cy="12" r="3.5"/><path d="M5 12l2.5-2.5M19 12l-1-3.4"/><path d="M8.5 12h7" stroke-dasharray="1.5 2"/>',
    tunneling: '<path d="M1 18h8V6h6v12h8"/><path d="M1 12c1.2-3 2.3-3 3.5 0s2.3 3 3.5 0" /><path d="M9 12c2 -1 4 -.6 6 0" opacity=".45"/><path d="M15 12c1 -.8 1.6 -.8 2.4 0s1.4 .8 2.2 0 1.4 -.8 2.4 0" opacity=".7"/>',
    oscillator: '<path d="M3 3c2 15 16 15 18 0"/><path d="M7.2 9.5h9.6M5.4 6.2h13.2M9.2 12.7h5.6" opacity=".6"/><circle cx="12" cy="16.3" r="1.2" fill="currentColor"/>',
    decoherence: '<circle cx="12" cy="12" r="10" opacity=".35"/><path d="M12 12m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" stroke-dasharray="2 2.4"/><circle cx="12" cy="12" r="3.5" stroke-dasharray="1.2 1.8"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    rabi: '<path d="M2 18c2.5-14 5-14 7.5 0s5 14 7.5 0 3-12 5-6" /><path d="M2 21h20M2 3v18" opacity=".4"/>',
    spinchain: '<path d="M12 3v18M3 21L12 12l9 9" opacity=".5"/><g fill="currentColor"><circle cx="12" cy="4" r="1.5"/><circle cx="9" cy="8.5" r="1.2"/><circle cx="15" cy="8.5" r="1.2"/><circle cx="6" cy="14" r="1"/><circle cx="18" cy="14" r="1"/><circle cx="4" cy="19" r=".9"/><circle cx="20" cy="19" r=".9"/></g>',
    quantumwalk: '<path d="M2 20h20" opacity=".4"/><path d="M3 20v-3M5 20v-2M7 20v-1M9 20v-4M11 20v-1M13 20v-1M15 20v-4M17 20v-1M19 20v-2M21 20v-3" stroke-width="2"/><path d="M12 3l-7 10M12 3l7 10" opacity=".5"/>',
    bb84: '<rect x="3" y="10" width="18" height="11" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/><path d="M9 15.5h6M12 13v5" />',
    grover: '<path d="M2 21h20" opacity=".4"/><path d="M4 21v-3M7 21v-3M10 21v-3M13 21V4M16 21v-3M19 21v-3" stroke-width="2"/><path d="M2 15.5h20" stroke-dasharray="1.5 2" opacity=".6"/>',
    qec: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><g fill="currentColor"><circle cx="9" cy="10" r="1.2"/><circle cx="15" cy="10" r="1.2"/><circle cx="12" cy="15" r="1.2"/></g><path d="M9 10l3 5 3-5" opacity=".5"/>',
    metrology: '<circle cx="12" cy="12" r="10" opacity=".4"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
    page: '<path d="M2 20L12 6l10 14" /><path d="M2 20h20" opacity=".4"/><path d="M12 6v14" stroke-dasharray="1.5 2" opacity=".6"/><circle cx="12" cy="6" r="1.4" fill="currentColor"/>',
    bec: '<path d="M2 20h20" opacity=".4"/><path d="M3 20c3-1 4-6 6-6s2 -10 3 -10 1 10 3 10 3 5 6 6"/><path d="M5 20c2-.5 3-3 4.5-3.3M19 20c-2-.5-3-3-4.5-3.3" opacity=".5"/>',
  };
  QA.glyph = function (name, size = 24, cls = 'glyph') {
    const body = P[name] || '<circle cx="12" cy="12" r="4"/>';
    return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  };
  QA.glyphNames = Object.keys(P);
})();
