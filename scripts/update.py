#!/usr/bin/env python3
"""Fetch the newest quantum physics papers and build the site's data files.

Free, open sources only:
  * arXiv API (https://info.arxiv.org/help/api/) - titles, abstracts, authors.
    We wait 3+ seconds between requests and use one connection, as arXiv asks.
  * Semantic Scholar Graph API (optional, https://www.semanticscholar.org/product/api)
    - reference lists and citation counts. Works without a key at a low shared
    rate; set S2_API_KEY to use your own key. Failures are skipped quietly.

Summaries are written by simple, transparent rules (no paid AI needed).
If ANTHROPIC_API_KEY is set, scripts/ai_summaries.py can add AI-written
plain-language summaries on top. The site works without them.

Python 3.9+, standard library only.
Usage: python3 scripts/update.py [--seed] [--no-s2] [--offline]
"""
import argparse
import datetime as dt
import hashlib
import html
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE_DATA = os.path.join(ROOT, "site", "data")
CACHE_DIR = os.path.join(ROOT, "cache")
ARCHIVE = os.path.join(CACHE_DIR, "papers-archive.json")
S2_CACHE = os.path.join(CACHE_DIR, "s2.json")
AI_CACHE = os.path.join(CACHE_DIR, "ai-summaries.json")
CONCEPTS = os.path.join(SITE_DATA, "concepts.json")
N_SHARDS = 32
KEEP_DAYS = 45
MAX_PAPERS = 2200
UA = "QuantumAtlas/1.0 (open-source research digest; https://github.com/DanielAja/quantum-atlas)"

# (category, papers per daily run, papers when seeding)
CATEGORIES = [
    ("quant-ph", 400, 1600),
    ("cond-mat.quant-gas", 60, 200),
    ("cond-mat.mes-hall", 80, 250),
    ("cond-mat.str-el", 80, 250),
    ("cond-mat.supr-con", 40, 120),
    ("hep-th", 80, 250),
    ("gr-qc", 40, 120),
    ("physics.atom-ph", 60, 200),
    ("physics.optics", 60, 200),
]
ARXIV_API = "https://export.arxiv.org/api/query"
ATOM = "{http://www.w3.org/2005/Atom}"
ARXIV_NS = "{http://arxiv.org/schemas/atom}"

_last_arxiv = 0.0


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def http_get(url, headers=None, data=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def arxiv_query(params, tries=5):
    """One arXiv API call, politely spaced (>= 3.1 s apart), with retries."""
    global _last_arxiv
    url = ARXIV_API + "?" + urllib.parse.urlencode(params)
    for attempt in range(tries):
        wait = 3.1 - (time.time() - _last_arxiv)
        if wait > 0:
            time.sleep(wait)
        _last_arxiv = time.time()
        try:
            body = http_get(url, timeout=90)
            root = ET.fromstring(body)
            entries = root.findall(ATOM + "entry")
            # arXiv sometimes answers with an empty page under load; retry those.
            total = root.find("{http://a9.com/-/spec/opensearch/1.1/}totalResults")
            if not entries and total is not None and int(total.text or 0) > int(params.get("start", 0)):
                raise RuntimeError("empty page")
            return entries
        except (urllib.error.URLError, ET.ParseError, RuntimeError, TimeoutError) as e:
            back = 10 * (attempt + 1)
            log(f"  arXiv retry {attempt + 1}/{tries} in {back}s: {e}")
            time.sleep(back)
    return []


def parse_entry(e):
    raw_id = e.findtext(ATOM + "id", "")
    m = re.search(r"abs/(.+?)(v\d+)?$", raw_id)
    if not m:
        return None
    aid = m.group(1)
    title = re.sub(r"\s+", " ", e.findtext(ATOM + "title", "")).strip()
    abstract = re.sub(r"\s+", " ", e.findtext(ATOM + "summary", "")).strip()
    authors = [re.sub(r"\s+", " ", a.findtext(ATOM + "name", "")).strip() for a in e.findall(ATOM + "author")]
    cats = [c.get("term") for c in e.findall(ATOM + "category") if c.get("term")]
    prim = e.find(ARXIV_NS + "primary_category")
    primary = prim.get("term") if prim is not None else (cats[0] if cats else "")
    doi = e.findtext(ARXIV_NS + "doi") or ""
    journal = e.findtext(ARXIV_NS + "journal_ref") or ""
    comment = e.findtext(ARXIV_NS + "comment") or ""
    return {
        "id": aid,
        "title": title,
        "abstract": abstract,
        "authors": authors,
        "cats": cats,
        "primary": primary,
        "published": e.findtext(ATOM + "published", "")[:10],
        "updated": e.findtext(ATOM + "updated", "")[:10],
        "doi": doi.strip(),
        "journal": re.sub(r"\s+", " ", journal).strip(),
        "comment": re.sub(r"\s+", " ", comment).strip()[:200],
    }


def fetch_category(cat, n):
    out = []
    page = 200
    for start in range(0, n, page):
        entries = arxiv_query({
            "search_query": f"cat:{cat}",
            "sortBy": "submittedDate",
            "sortOrder": "descending",
            "start": start,
            "max_results": min(page, n - start),
        })
        got = [p for p in (parse_entry(x) for x in entries) if p]
        out.extend(got)
        log(f"  {cat}: +{len(got)} (start {start})")
        if len(got) < min(page, n - start) // 2:
            break
    return out


# ---------------------------------------------------------------- text tools
GREEK = {
    "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "epsilon": "ε", "varepsilon": "ε", "zeta": "ζ",
    "eta": "η", "theta": "θ", "kappa": "κ", "lambda": "λ", "mu": "μ", "nu": "ν", "xi": "ξ", "pi": "π",
    "rho": "ρ", "sigma": "σ", "tau": "τ", "phi": "φ", "varphi": "φ", "chi": "χ", "psi": "ψ", "omega": "ω",
    "Gamma": "Γ", "Delta": "Δ", "Theta": "Θ", "Lambda": "Λ", "Sigma": "Σ", "Phi": "Φ", "Psi": "Ψ", "Omega": "Ω",
    "hbar": "ħ", "sim": "~", "approx": "≈", "times": "×", "cdot": "·", "leq": "≤", "le": "≤", "geq": "≥",
    "ge": "≥", "pm": "±", "infty": "∞", "rightarrow": "→", "to": "→", "langle": "⟨", "rangle": "⟩",
    "propto": "∝", "ll": "≪", "gg": "≫", "neq": "≠", "partial": "∂", "nabla": "∇", "ell": "ℓ", "sqrt": "√",
    "dagger": "†", "otimes": "⊗", "mathbb": "", "mathcal": "", "mathrm": "", "text": "", "textit": "",
    "textbf": "", "emph": "", "mathbf": "", "mathsf": "", "operatorname": "", "left": "", "right": "",
    "big": "", "Big": "", "%": "%", "rm": "", "it": "", "bf": "", "log": "log", "ln": "ln", "exp": "exp",
}


def clean_tex(s):
    s = html.unescape(s)

    def fix_math(m):
        t = m.group(1)
        t = re.sub(r"\\([A-Za-z]+)", lambda k: GREEK.get(k.group(1), k.group(1)), t)
        t = re.sub(r"\^\{([^{}]*)\}", r"^\1", t)
        t = re.sub(r"_\{([^{}]*)\}", r"_\1", t)
        t = t.replace("{", "").replace("}", "").replace("\\", "")
        return t.strip()

    s = re.sub(r"\$\$?([^$]+)\$\$?", fix_math, s)
    s = re.sub(r"\\(?:emph|textit|textbf|text)\{([^{}]*)\}", r"\1", s)
    s = re.sub(r"\\([A-Za-z]+)", lambda k: GREEK.get(k.group(1), k.group(1)), s)
    s = s.replace("~", " ").replace("{", "").replace("}", "").replace("\\", "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


ABBREV = ["e.g.", "i.e.", "et al.", "Fig.", "Figs.", "Eq.", "Eqs.", "vs.", "approx.", "Ref.", "Refs.", "resp.", "cf.", "etc.", "Sec.", "No."]


def sentences(text):
    t = text
    for i, a in enumerate(ABBREV):
        t = t.replace(a, a.replace(".", f"§{i}§"))
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9(\[\"'“])", t)
    out = []
    for p in parts:
        for i, a in enumerate(ABBREV):
            p = p.replace(a.replace(".", f"§{i}§"), a)
        p = p.strip()
        if len(p) > 3:
            out.append(p)
    return out


CLAIM_RE = re.compile(
    r"\b(we|our|here|this (?:work|paper|letter|article|study)|these results|results)\b.*?\b("
    r"show|demonstrat|find|found|prove|propose|introduc|report|observ|achiev|present|develop|establish|"
    r"derive|reveal|identify|obtain|realiz|realis|construct|provide|predict|measure|uncover|design|"
    r"implement|confirm|discover|enable|outperform|reduc|improv)",
    re.I,
)
STRONG_RE = re.compile(r"\b(show|demonstrat|find|found|prove|achiev|observ|report|reveal|establish|outperform|discover)", re.I)
IMPACT_RE = re.compile(r"\b(pave|enabl|open[s]? (?:up|the|a|new)|application|implication|useful|important|promising|potential|prospect|future|toward|paving|step)\b", re.I)
NUM_RE = re.compile(r"\b\d+(\.\d+)?\s?(%|percent|times|fold|orders? of magnitude|dB|qubits|km|μs|ms|ns|K\b|mK|nK|Hz|kHz|MHz|GHz)")


def they(s):
    s = re.sub(r"^(?:Here,?|In this (?:work|paper|letter|article|study),?|In this work we|Here we)\s+we\b", "They", s, flags=re.I)
    s = re.sub(r"^We\b", "They", s)
    s = re.sub(r"\bwe\b", "they", s)
    s = re.sub(r"\bWe\b", "They", s)
    s = re.sub(r"\bour\b", "their", s)
    s = re.sub(r"\bOur\b", "Their", s)
    s = re.sub(r"\bus\b", "them", s)
    s = re.sub(r"^Here,?\s+", "", s)
    return s[:1].upper() + s[1:]


def shorten(s, words=34):
    w = s.split()
    if len(w) <= words:
        return s
    cut = " ".join(w[:words])
    for sep in ["; ", ", which", ", where", ", and ", " by ", ", "]:
        i = cut.rfind(sep)
        if i > len(cut) * 0.5:
            return cut[:i].rstrip(",;") + "…"
    return cut + "…"


# --------------------------------------------------------------- concepts
def load_concepts():
    with open(CONCEPTS) as f:
        c = json.load(f)
    for con in c["concepts"]:
        con["_re"] = [re.compile(p, re.I) for p in con["patterns"]]
    return c


CAT_SUBFIELD = {
    "hep-th": "hep", "gr-qc": "hep", "hep-ph": "hep", "hep-lat": "hep", "astro-ph.CO": "hep",
    "cond-mat.quant-gas": "atoms", "physics.atom-ph": "atoms", "physics.optics": "optics",
    "cond-mat.str-el": "condensed", "cond-mat.mes-hall": "condensed", "cond-mat.supr-con": "condensed",
    "cond-mat.stat-mech": "open-systems", "physics.chem-ph": "simulation", "cs.LG": "qml", "cs.CR": "communication",
    "cs.ET": "hardware", "cs.DS": "computing", "cs.CC": "computing", "math-ph": "foundations",
}


def tag_paper(p, C):
    title, abstract = p["title"], p["abstract"]
    tl, al = title.lower(), abstract.lower()
    scores = {}
    for con in C["concepts"]:
        s = 0
        for rx in con["_re"]:
            s += 3 * len(rx.findall(tl)) + len(rx.findall(al))
        if s:
            scores[con["id"]] = s
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    concepts = [k for k, _ in ranked[:8]]
    byid = {c["id"]: c for c in C["concepts"]}
    sub = Counter()
    for k, s in ranked[:8]:
        sub[byid[k]["subfield"]] += min(s, 6)
    for i, cat in enumerate([p["primary"]] + [c for c in p["cats"] if c != p["primary"]]):
        if cat in CAT_SUBFIELD:
            sub[CAT_SUBFIELD[cat]] += 5 if i == 0 else 2
    subfield = sub.most_common(1)[0][0] if sub else "information"
    subs2 = [k for k, v in sub.most_common(3) if v >= 3 and k != subfield][:2]
    # demo: best-scoring concept with a demo, else the subfield's demo
    demo = None
    for k, _ in ranked:
        if byid[k].get("demo"):
            demo = byid[k]["demo"]
            demo_concept = k
            break
    if not demo:
        sf = next(s for s in C["subfields"] if s["id"] == subfield)
        demo, demo_concept = sf["demo"], None
    return concepts, subfield, subs2, demo, demo_concept, scores


def reading_level(abstract):
    math_bits = abstract.count("$") // 2
    words = re.findall(r"[A-Za-z][A-Za-z-]+", abstract)
    long_ratio = sum(1 for w in words if len(w) >= 11) / max(1, len(words))
    score = math_bits * 0.6 + long_ratio * 40
    return 1 if score < 4 else 2 if score < 8 else 3


def summarise(p, C, concepts, subfield):
    abstract = clean_tex(p["abstract"])
    sents = sentences(abstract)
    claims, context, impact = [], [], None
    for i, s in enumerate(sents):
        if CLAIM_RE.search(s) or (NUM_RE.search(s) and i > 0):
            claims.append(s)
        elif i < 2:
            context.append(s)
    if sents and IMPACT_RE.search(sents[-1]) and len(sents) > 2:
        impact = sents[-1]
    if not claims:
        claims = sents[1:4] if len(sents) > 1 else sents[:1]
    if not context and sents and sents[0] not in claims:
        context = [sents[0]]
    claims = [they(clean) for clean in claims[:4]]
    if impact:
        impact_t = they(impact)
        claims = [c for c in claims if c != impact_t] or claims
    def claim_score(c):
        sc = 0
        if STRONG_RE.search(c):
            sc += 2
        if NUM_RE.search(c):
            sc += 1
        if re.match(r"^(They|Their)\b.*\b(this|these|such|it)\b", c) and not STRONG_RE.search(c):
            sc -= 1
        return sc
    best = max(claims, key=claim_score) if claims else (sents[0] if sents else p["title"])
    best = re.sub(r"^They (?:show|demonstrate|find|prove|report|reveal|establish|observe|argue|confirm|predict)(?:ed)? that (?:the |a |an )?", lambda m: m.group(0)[len(m.group(0).split(" that ")[0]) + 6:], best)
    tldr = shorten(best[:1].upper() + best[1:])
    byid = {c["id"]: c for c in C["concepts"]}
    sf = next(s for s in C["subfields"] if s["id"] == subfield)
    names = [byid[c]["name"].lower() for c in concepts[:3]]
    if names:
        about = ", ".join(names[:-1]) + (" and " if len(names) > 1 else "") + names[-1]
        lead = f"A {sf['name'].lower()} paper about {about}."
    else:
        lead = f"A {sf['name'].lower()} paper."
    return {
        "tldr": tldr,
        "lead": lead,
        "context": shorten(context[0], 45) if context else "",
        "claims": [shorten(c, 45) for c in claims],
        "impact": shorten(they(impact), 40) if impact else "",
        "level": reading_level(p["abstract"]),
    }


# ------------------------------------------------------ Semantic Scholar
def s2_enrich(papers, cache, max_new=600):
    """Fill cache[id] = {"c": citationCount, "r": [ref ids], "t": fetched-date}."""
    key = os.environ.get("S2_API_KEY", "").strip()
    today = dt.date.today()
    todo = []
    for p in papers:
        c = cache.get(p["id"])
        if c is None:
            todo.append(p["id"])
        else:
            age = (today - dt.date.fromisoformat(c["t"])).days
            # retry papers S2 hadn't indexed, and refresh citation counts weekly
            if (c.get("miss") and age >= 2) or age >= 7:
                todo.append(p["id"])
    todo = todo[:max_new]
    if not todo:
        return
    log(f"Semantic Scholar: looking up {len(todo)} papers")
    url = "https://api.semanticscholar.org/graph/v1/paper/batch?fields=citationCount,references.externalIds,references.paperId"
    headers = {"Content-Type": "application/json"}
    if key:
        headers["x-api-key"] = key
    fails = 0
    for i in range(0, len(todo), 100):
        chunk = todo[i:i + 100]
        body = json.dumps({"ids": ["ARXIV:" + x for x in chunk]}).encode()
        for attempt in range(4):
            try:
                res = json.loads(http_get(url, headers=headers, data=body, timeout=60))
                break
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    time.sleep(15 * (attempt + 1))
                    continue
                res = None
                break
            except Exception:
                res = None
                time.sleep(5)
        else:
            res = None
        if res is None:
            fails += 1
            if fails >= 3:
                log("  Semantic Scholar unavailable right now; skipping the rest (will retry next run)")
                return
            continue
        for aid, item in zip(chunk, res):
            if not item:
                cache[aid] = {"t": today.isoformat(), "miss": True}
                continue
            refs = []
            for r in item.get("references") or []:
                ext = (r.get("externalIds") or {})
                if ext.get("ArXiv"):
                    refs.append("a:" + ext["ArXiv"])
                elif r.get("paperId"):
                    refs.append("s:" + r["paperId"][:12])
            cache[aid] = {"t": today.isoformat(), "c": item.get("citationCount") or 0, "r": refs}
        time.sleep(1.5 if key else 3.5)


# ----------------------------------------------------------------- graph
def norm_author(a):
    parts = re.sub(r"[^\w\s-]", "", a).lower().split()
    if not parts:
        return ""
    return parts[0][:1] + " " + parts[-1]


def build_graph(papers, s2):
    n = len(papers)
    idx = {p["id"]: i for i, p in enumerate(papers)}
    # concept similarity weighted by rarity (IDF)
    df = Counter(c for p in papers for c in set(p["concepts"]))
    idf = {c: math.log(1 + n / (1 + df[c])) for c in df}
    inv = defaultdict(list)
    for i, p in enumerate(papers):
        for c in p["concepts"][:6]:
            inv[c].append(i)
    pair = defaultdict(lambda: [0.0, 0])  # (i,j) -> [weight, type bits]
    for c, members in inv.items():
        if len(members) > 400:  # too common to be informative on its own
            members = members[:400]
        w = idf[c]
        for a in range(len(members)):
            for b in range(a + 1, len(members)):
                k = (members[a], members[b])
                pair[k][0] += w
                pair[k][1] |= 1
    # shared authors
    ainv = defaultdict(list)
    for i, p in enumerate(papers):
        for a in set(norm_author(x) for x in p["authors"][:30]):
            if a:
                ainv[a].append(i)
    for a, members in ainv.items():
        if 2 <= len(members) <= 40:
            for x in range(len(members)):
                for y in range(x + 1, len(members)):
                    k = (members[x], members[y])
                    pair[k][0] += 3.0
                    pair[k][1] |= 2
    # citations between papers on the site, and shared references
    rinv = defaultdict(list)
    for i, p in enumerate(papers):
        refs = (s2.get(p["id"]) or {}).get("r") or []
        for r in refs:
            if r.startswith("a:"):
                j = idx.get(r[2:])
                if j is not None and j != i:
                    k = (min(i, j), max(i, j))
                    pair[k][0] += 5.0
                    pair[k][1] |= 4
            rinv[r].append(i)
    for r, members in rinv.items():
        if 2 <= len(members) <= 60:
            for x in range(len(members)):
                for y in range(x + 1, len(members)):
                    k = (members[x], members[y])
                    pair[k][0] += 1.2
                    pair[k][1] |= 8
    # keep each paper's strongest links so the map stays readable
    nbrs = defaultdict(list)
    for (i, j), (w, t) in pair.items():
        nbrs[i].append((w, j, t))
        nbrs[j].append((w, i, t))
    keep = {}
    for i, lst in nbrs.items():
        lst.sort(reverse=True)
        for w, j, t in lst[:6]:
            if w < 2.0 and not (t & 6):
                continue
            k = (min(i, j), max(i, j))
            keep[k] = (round(w, 2), t)
    edges = [[i, j, w, t] for (i, j), (w, t) in keep.items()]
    # clusters by weighted label propagation (deterministic order)
    adj = defaultdict(list)
    for i, j, w, t in edges:
        adj[i].append((j, w))
        adj[j].append((i, w))
    label = list(range(n))
    order = sorted(range(n), key=lambda i: papers[i]["id"])
    for _ in range(15):
        changed = 0
        for i in order:
            if not adj[i]:
                continue
            votes = Counter()
            for j, w in adj[i]:
                votes[label[j]] += w
            best = max(votes.items(), key=lambda kv: (kv[1], -kv[0]))[0]
            if best != label[i]:
                label[i] = best
                changed += 1
        if not changed:
            break
    groups = defaultdict(list)
    for i, l in enumerate(label):
        groups[l].append(i)
    clusters = []
    for l, members in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        if len(members) < 4:
            continue
        cc = Counter(c for m in members for c in papers[m]["concepts"][:4])
        sc = Counter(papers[m]["subfield"] for m in members)
        clusters.append({"concepts": [c for c, _ in cc.most_common(3)], "subfield": sc.most_common(1)[0][0], "size": len(members), "members": members})
    cl_of = [-1] * n
    for ci, c in enumerate(clusters[:40]):
        for m in c["members"]:
            cl_of[m] = ci
    for c in clusters:
        del c["members"]
    # concept co-occurrence map ("ideas map")
    co = Counter()
    for p in papers:
        cs = sorted(set(p["concepts"][:5]))
        for a in range(len(cs)):
            for b in range(a + 1, len(cs)):
                co[(cs[a], cs[b])] += 1
    concept_edges = [[a, b, k] for (a, b), k in co.most_common(400) if k >= 3]
    return {"edges": edges, "cluster": cl_of, "clusters": clusters[:40], "conceptEdges": concept_edges, "conceptCounts": dict(df)}


def trending(papers, today):
    """Ideas appearing more often this week than in the weeks before.

    Only compares days that every arXiv category we read fully covers, so a
    category we only started reading recently doesn't look like a trend."""
    starts = defaultdict(lambda: "9999")
    for p in papers:
        src = p.get("src") or p["primary"]
        starts[src] = min(starts[src], p["published"])
    common = max(starts.values()) if starts else today.isoformat()
    common = dt.date.fromisoformat(common) + dt.timedelta(days=1)
    base_days = max(0, (today - dt.timedelta(days=7) - common).days)
    recent, before = Counter(), Counter()
    for p in papers:
        pub = dt.date.fromisoformat(p["published"])
        age = (today - pub).days
        for c in p["concepts"][:5]:
            if age <= 7:
                recent[c] += 1
            elif pub >= common:
                before[c] += 1
    out = []
    for c, r in recent.items():
        base = before[c] * 7.0 / base_days if base_days >= 5 else r  # weekly average
        score = (r + 1) / (base + 2)
        out.append({"id": c, "week": r, "avg": round(base, 1), "score": round(score, 2)})
    out.sort(key=lambda x: (-x["score"], -x["week"]))
    return out[:20], ("rising" if base_days >= 5 else "popular")


# ----------------------------------------------------------------- main
def shard_of(aid):
    return int(hashlib.md5(aid.encode()).hexdigest(), 16) % N_SHARDS


def load_json(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json(path, obj, pretty=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        if pretty:
            json.dump(obj, f, ensure_ascii=False, indent=1)
        else:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", action="store_true", help="fetch a bigger first batch")
    ap.add_argument("--no-s2", action="store_true", help="skip Semantic Scholar")
    ap.add_argument("--offline", action="store_true", help="rebuild from cache only")
    args = ap.parse_args()

    C = load_concepts()
    archive = {p["id"]: p for p in load_json(ARCHIVE, [])}
    seed = args.seed or len(archive) < 200
    if not args.offline:
        for cat, daily, seeding in CATEGORIES:
            n = seeding if seed else daily
            log(f"arXiv {cat}: fetching up to {n}")
            for p in fetch_category(cat, n):
                p["src"] = cat
                old = archive.get(p["id"])
                if old and old.get("updated") == p["updated"]:
                    continue
                if old and old.get("src"):
                    p["src"] = old["src"]
                archive[p["id"]] = p

    today = dt.date.today()
    cutoff = today - dt.timedelta(days=KEEP_DAYS)
    papers = []
    for p in archive.values():
        try:
            pub = dt.date.fromisoformat(p["published"])
        except ValueError:
            continue
        if pub < cutoff:
            continue
        text = (p["title"] + " " + p["abstract"]).lower()
        concepts, subfield, subs2, demo, demo_concept, scores = tag_paper(p, C)
        # outside quant-ph, keep only papers that are clearly about quantum physics
        if "quant-ph" not in p["cats"] and "quantum" not in text and sum(scores.values()) < 4:
            continue
        q = dict(p)
        q.update(concepts=concepts, subfield=subfield, subfields2=subs2, demo=demo, demoConcept=demo_concept)
        q["summary"] = summarise(p, C, concepts, subfield)
        papers.append(q)
    papers.sort(key=lambda p: (p["published"], p["id"]), reverse=True)
    papers = papers[:MAX_PAPERS]
    write_json(ARCHIVE, sorted((p for p in archive.values() if p["published"] >= cutoff.isoformat()), key=lambda p: p["id"]))
    log(f"{len(papers)} papers in the last {KEEP_DAYS} days")
    if not papers:
        log("No papers found: stopping so the live site keeps its last good data.")
        sys.exit(1)

    s2 = load_json(S2_CACHE, {})
    if not args.no_s2 and not args.offline:
        try:
            s2_enrich(papers, s2)
        except Exception as e:  # never let an optional source break the build
            log(f"Semantic Scholar step failed: {e}")
    live = {p["id"] for p in papers}
    s2 = {k: v for k, v in s2.items() if k in live}
    write_json(S2_CACHE, s2)

    ai = load_json(AI_CACHE, {})
    graph = build_graph(papers, s2)

    # light index for lists + shards with full detail
    index, shards = [], defaultdict(dict)
    for i, p in enumerate(papers):
        s2i = s2.get(p["id"]) or {}
        aisum = ai.get(p["id"])
        index.append({
            "id": p["id"],
            "t": clean_tex(p["title"]),
            "a": p["authors"][:3],
            "na": len(p["authors"]),
            "d": p["published"],
            "s": p["subfield"],
            "s2": p["subfields2"],
            "c": p["concepts"][:6],
            "m": p["demo"],
            "x": (aisum or {}).get("tldr") or p["summary"]["tldr"],
            "l": p["summary"]["level"],
            "k": s2i.get("c"),
            "g": graph["cluster"][i],
            "ai": 1 if aisum else 0,
            "h": shard_of(p["id"]),
            "pc": p["primary"],
        })
        doi = p["doi"] or ("10.48550/arXiv." + p["id"])
        shards[shard_of(p["id"])][p["id"]] = {
            "title": clean_tex(p["title"]),
            "authors": p["authors"][:25],
            "nauthors": len(p["authors"]),
            "abstract": p["abstract"],
            "cats": p["cats"],
            "primary": p["primary"],
            "published": p["published"],
            "updated": p["updated"],
            "doi": doi,
            "publishedDoi": bool(p["doi"]),
            "journal": p["journal"],
            "comment": p["comment"],
            "summary": p["summary"],
            "ai": aisum,
            "demoConcept": p["demoConcept"],
            "citations": s2i.get("c"),
            "nrefs": len(s2i.get("r") or []),
        }

    write_json(os.path.join(SITE_DATA, "index.json"), index)
    for k in range(N_SHARDS):
        write_json(os.path.join(SITE_DATA, "papers", f"{k}.json"), shards.get(k, {}))
    write_json(os.path.join(SITE_DATA, "graph.json"), graph)
    counts = Counter(p["subfield"] for p in papers)
    trend_list, trend_mode = trending(papers, today)
    meta = {
        "updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(papers),
        "days": KEEP_DAYS,
        "shards": N_SHARDS,
        "subfieldCounts": dict(counts),
        "trending": trend_list,
        "trendMode": trend_mode,
        "withCitations": sum(1 for p in papers if (s2.get(p["id"]) or {}).get("r")),
        "withAI": sum(1 for p in papers if p["id"] in ai),
        "categories": [c for c, _, _ in CATEGORIES],
    }
    write_json(os.path.join(SITE_DATA, "meta.json"), meta, pretty=True)
    log(f"Done: {len(papers)} papers, {len(graph['edges'])} links, {len(graph['clusters'])} clusters")


if __name__ == "__main__":
    main()
