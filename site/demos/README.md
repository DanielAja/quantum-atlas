# Demo library

Each file in this folder is one interactive demo, written in plain JavaScript (no build step, no libraries).
The page loads `../js/demo-kit.js` first, then every demo file listed in `index.js`.

## Contract

```js
QA.registerDemo({
  id: 'bloch',                       // must match the file name and concepts.json "demo" field
  title: 'A qubit on the Bloch sphere',
  emoji: '🌐',                        // one emoji for cards
  blurb: 'One sentence a curious 14-year-old would understand.',
  explain: 'Two or three short sentences: what you are looking at and why it matters.',
  tryThis: ['Short prompt to try 1', 'Short prompt 2', 'Short prompt 3'],
  mount(root) {
    // root is an empty <div>. Build a canvas with QA.canvas(root, {...})
    // and controls with QA.ui.panel(root) + QA.ui.slider(...).
    // Return a cleanup function that stops animation loops and observers.
    return () => {};
  },
});
```

## Rules

- Physics must be correct (a simplified model is fine; say what is simplified in `explain`).
- Every slider changes the picture right away.
- Colours come from `QA.colors()` at draw time, so light and dark modes both work.
- Animations use `QA.loop` and respect `QA.reducedMotion()` (draw a still frame or slow down).
- Works at 320px wide. Touch-friendly. Canvas gets a meaningful `label` for screen readers, and a
  `QA.ui.readout` line states the key number in words.
- Keep the maths cheap enough to run at 60 fps on a phone.
