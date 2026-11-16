# Quantum Atlas

**The newest quantum physics research, in plain words, with a hands-on demo for every paper and a map of how the ideas connect.**

Live site: https://danielaja.github.io/quantum-atlas/

Quantum Atlas reads the newest papers on arXiv every day and turns them into something a curious person can explore:

- **Discover**: fresh papers with a short summary, the main claims, and links to the arXiv page, the PDF and the DOI. Filter by research area, time and trending ideas, or press **🎲 Show me something different**.
- **Paper pages**: summary, main claims, "why it matters", the original abstract, plain explanations of every key idea, connected papers, a BibTeX citation, and an interactive demo of the paper's core idea.
- **Map**: an interactive graph of papers linked by shared ideas, shared authors, citations and shared references, with idea clusters you can light up. Switch to **Ideas** to see how concepts connect across the whole field.
- **Fields**: 14 regions of quantum physics, how busy each one is, what a PhD there tends to look like, a quick "where might you fit?" quiz, and a personal compass built from what you read and save.
- **Play**: 16 hands-on simulations (Bloch sphere, interferometer, double slit, Bell/CHSH test, tunnelling, harmonic oscillator, decoherence, Rabi oscillations, spin chain, quantum walk, BB84 key sharing, Grover search, error correction, quantum sensing, the Page curve, Bose–Einstein condensation).
- **Learn**: a beginner path, a searchable glossary, and free places to learn more.
- **Saved**: hearted papers, stored only in your browser, exportable as text or BibTeX.

It started as a tool for choosing a PhD direction, so breadth matters: besides `quant-ph` it reads quantum-related papers from `cond-mat.quant-gas`, `cond-mat.mes-hall`, `cond-mat.str-el`, `cond-mat.supr-con`, `hep-th`, `gr-qc`, `physics.atom-ph` and `physics.optics`.

## How it works

Everything is free and runs on GitHub: a static site on GitHub Pages and a daily GitHub Actions job.

```
.github/workflows/update.yml   daily job: fetch → build data → deploy to Pages
scripts/update.py              arXiv + Semantic Scholar → site/data/*.json (Python standard library only)
scripts/ai_summaries.py        OPTIONAL AI summaries, off unless ANTHROPIC_API_KEY is set
site/                          the website (plain HTML, CSS and JavaScript, no build step)
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
- **Fonts:** [Fraunces](https://fonts.google.com/specimen/Fraunces) and [Nunito](https://fonts.google.com/specimen/Nunito) via Google Fonts, SIL Open Font License 1.1.
- **Explanations** link to [Wikipedia](https://www.wikipedia.org), [Quantum Country](https://quantum.country), the [Error Correction Zoo](https://errorcorrectionzoo.org), the [Quantum Algorithm Zoo](https://quantumalgorithmzoo.org) and other free resources.
- **Hosting and automation:** GitHub Pages and GitHub Actions (`actions/checkout`, `actions/setup-python`, `actions/cache`, `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`).
- **Optional:** the [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python) (MIT) when AI summaries are switched on.

The site itself, the demos and the map are written from scratch in plain JavaScript with no third-party libraries.

Summaries are automatic and can be wrong, and many arXiv papers are not yet peer reviewed. Always check the original paper.

## Licence

Code: MIT (see `LICENSE`). Paper titles, abstracts and author names remain the property of their authors and are shown under arXiv's terms with links back to the source.
