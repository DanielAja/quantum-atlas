# Quantum Atlas

**Every new idea in quantum physics, as a galaxy you can fly through. The newest papers in plain words, with a hands-on demo for each one.**

Live site: https://danielaja.github.io/quantum-atlas/

Quantum Atlas reads the newest papers on arXiv every day and turns them into something a curious person can explore:

- **Explore**: a living 3D galaxy on the home page where every star is a paper (colour = field, brightness = freshness). Hover to peek, click to dive in. Below it: a daily *Star of the day* with its demo, a marquee of trending ideas, and the fresh-papers feed with search, field filters and sorting.
- **Galaxy**: the full-screen 3D map. Orbit, zoom, filter by field and time, light up idea clusters, show idea names floating over the regions where they appear, and click any star to see its connected papers (shared ideas, authors, citations, shared references). A flat 2D view is one click away and is used automatically without WebGL.
- **Paper pages**: summary, main claims, "why it matters", the original abstract, plain explanations of every key idea, connected papers, a BibTeX citation, links to arXiv, PDF and DOI, and the matching interactive demo.
- **Fields**: a PhD compass. 14 regions of quantum physics with how busy each is and what a PhD there looks like; hovering a field turns the galaxy to it, and a five-question quiz points the galaxy at your best match. Your personal compass fills in as you read and save.
- **Play**: 16 hands-on simulations (Bloch sphere, interferometer, double slit, Bell/CHSH test, tunnelling, harmonic oscillator, decoherence, Rabi oscillations, spin chain, quantum walk, BB84, Grover search, error correction, quantum sensing, the Page curve, Bose–Einstein condensation).
- **Learn**: a twelve-stop beginner's orbit, a searchable glossary and free places to go deeper.
- **Saved**: your hearted papers lit up as "your constellation", exportable as text or BibTeX. Stored only in your browser.
- **⌘K / "/"**: a search palette for papers, ideas, fields, demos and pages from anywhere.

It started as a tool for choosing a PhD direction, so breadth matters: besides `quant-ph` it reads quantum-related papers from `cond-mat.quant-gas`, `cond-mat.mes-hall`, `cond-mat.str-el`, `cond-mat.supr-con`, `hep-th`, `gr-qc`, `physics.atom-ph` and `physics.optics`.

## How it works

Everything is free and runs on GitHub: a static site on GitHub Pages and a daily GitHub Actions job.

```
.github/workflows/update.yml   daily job: fetch → build data → deploy to Pages
scripts/update.py              arXiv + Semantic Scholar → site/data/*.json (Python standard library only)
scripts/ai_summaries.py        OPTIONAL AI summaries, off unless ANTHROPIC_API_KEY is set
site/                          the website (plain HTML, CSS and JavaScript, no build step)
site/js/cosmos.js              the three.js galaxy (one Points draw call, additive glow sprites, no post-processing)
site/data/concepts.json        hand-written list of research areas and ideas (edit this to tune tagging)
site/demos/*.js                one file per interactive demo (see site/demos/README.md)
```

1. **Fetch.** `update.py` asks the [arXiv API](https://info.arxiv.org/help/api/) for the newest papers in each category, waiting at least 3 seconds between requests as arXiv asks.
2. **Tag.** Each paper is matched against the ideas in `concepts.json` (title matches count more than abstract matches), placed in a research area, and paired with the demo that best fits its main idea.
3. **Summarise.** A transparent rule-based summary: the sentences where the authors state results become the main claims, the opening sentence becomes "the big picture", and a closing sentence about impact becomes "why it matters". No paid AI is needed.
4. **Connect.** Reference lists come from the [Semantic Scholar API](https://www.semanticscholar.org/product/api) when available. Papers are linked when they share rare ideas, authors or references, or cite each other; label propagation groups them into idea clusters.
5. **Trend.** Ideas are compared week over week to find what's rising.
6. **Publish.** The `site/` folder is deployed to GitHub Pages. Generated data is not committed; the paper archive is kept between runs in the Actions cache, and if it's ever lost the next run simply re-fetches.

## Run it locally

```bash
python3 scripts/update.py          # first run fetches ~2,000 papers, takes ~5 minutes
python3 -m http.server 8000 --directory site
# open http://localhost:8000
```

`--offline` rebuilds from the cache without fetching. `--no-s2` skips Semantic Scholar.

## Optional settings (repository secrets and variables)

| Name | Kind | What it does |
|---|---|---|
| `S2_API_KEY` | secret | Your own [Semantic Scholar key](https://www.semanticscholar.org/product/api#api-key-form) for more reliable reference data. Without it, the shared free rate is used and some lookups are skipped. |
| `ANTHROPIC_API_KEY` | secret | Turns on AI plain-language summaries (shown in a separate, labelled tab). Costs money per paper; off by default. |
| `AI_MODEL` | variable | Model for AI summaries. Defaults to `claude-opus-5-5`; `claude-haiku-5-5` is much cheaper. |
| `AI_MAX` | variable | Papers summarised per run (default 40, newest first, each paper once). |

## Adding a demo or an idea

- New idea: add an entry to `concepts` in `site/data/concepts.json` with regex `patterns`, a one-sentence `plain` explanation, `links`, and the `demo` that shows it.
- New demo: copy the contract in `site/demos/README.md`, add a `<script>` tag in `site/index.html`.

## Credits

- **Paper data:** [arXiv](https://arxiv.org). Thank you to arXiv for use of its open access interoperability. Titles and abstracts belong to their authors; every page links to the original.
- **Reference and citation data:** [Semantic Scholar](https://www.semanticscholar.org) by the Allen Institute for AI, used under the [Semantic Scholar API License](https://www.semanticscholar.org/product/api/license).
- **DOIs:** resolved by [doi.org](https://www.doi.org); arXiv DOIs are registered with [DataCite](https://datacite.org).
- **3D:** [three.js](https://threejs.org) r186 (MIT License), loaded from [jsDelivr](https://www.jsdelivr.com) through an import map.
- **Fonts:** [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif), [Inter](https://fonts.google.com/specimen/Inter), [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) and [Unbounded](https://fonts.google.com/specimen/Unbounded) via Google Fonts, SIL Open Font License 1.1.
- **Design inspiration:** award-winning WebGL sites such as Igloo Inc, Lusion, Active Theory, NASA's Eyes and the Wikiverse/100,000 Stars galaxies.
- **Explanations** link to [Wikipedia](https://www.wikipedia.org), [Quantum Country](https://quantum.country), the [Error Correction Zoo](https://errorcorrectionzoo.org), the [Quantum Algorithm Zoo](https://quantumalgorithmzoo.org) and other free resources.
- **Hosting and automation:** GitHub Pages and GitHub Actions (`actions/checkout`, `actions/setup-python`, `actions/cache`, `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`).
- **Optional:** the [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python) (MIT) when AI summaries are switched on.

Apart from three.js, the site, demos and maps are written from scratch in plain JavaScript.

Summaries are automatic and can be wrong, and many arXiv papers are not yet peer reviewed. Always check the original paper.

## Licence

Code: MIT (see `LICENSE`). Paper titles, abstracts and author names remain the property of their authors and are shown under arXiv's terms with links back to the source.
