"""Cut the Forest & Ash skin out of its original green-screen sheets.

Usage: python3 scripts/build-forest-ash.py [--preview DIR]

Sources (kept, never edited): art/forest-ash/source/*.jpg
Outputs (committed, shipped):  web/src/assets/forest-ash/*.webp
                               web/src/ui/forestAshData.ts (placements + traced spill outlines)

What it does, per sheet:
  1. Keys out the bright green: a pixel's "greenness" (G - max(R, B)) against the measured screen
     colour gives its alpha; a thin band around the screen is unmixed (colour = (pixel - (1-a)*key)/a)
     so edges keep their own colour, then any remaining green spill is clamped. Grass keeps its
     yellow-green because only the band next to the screen is touched, and the clamp there allows
     the local foliage's own greenness.
  2. Splits the sheet into its sprites (empty rows/columns between them).
  3. Fits the sprite's hex: flat-top, sides = R. Regular tiles use their left/right points and flat
     bottom edge; the two homes use their bottom edge and the sheet's common R.
  4. Writes each sprite at one scale (OUT_R px per hex radius) with all its overhang kept: grass tips,
     the tree, the volcano's smoke.
  5. Traces the part of the sprite OUTSIDE its own hex (the spill) as polygons, in board units around
     the hex centre (the board's hex radius is S = 30). The board uses them to cut highlights around
     the art and to draw the traced rim. Computed here once, so nothing is traced at runtime.

Deterministic: same sources, same outputs.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "art" / "forest-ash" / "source"
OUT = ROOT / "web" / "src" / "assets" / "forest-ash"
DATA = ROOT / "web" / "src" / "ui" / "forestAshData.ts"

S = 30.0  # the board's hex radius in board units (web/src/ui/geom.ts)
GOLD_R = 300  # gold frames: a 600 px hex in their atlas
OUT_R = 96  # exported pixels per hex radius: a hex is 192 px wide (phones show ~50 CSS px x DPR 3)
SQ3 = math.sqrt(3)


# ---------------------------------------------------------------- keying

def dilate(mask: np.ndarray, n: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(n):
        m = out.copy()
        m[1:, :] |= out[:-1, :]
        m[:-1, :] |= out[1:, :]
        m[:, 1:] |= out[:, :-1]
        m[:, :-1] |= out[:, 1:]
        out = m
    return out


def spread(values: np.ndarray, known: np.ndarray, n: int) -> np.ndarray:
    """Fill unknown pixels with the mean of known neighbours, n rings outward."""
    v = np.where(known, values, 0.0)
    k = known.astype(np.float64)
    for _ in range(n):
        acc = np.zeros_like(v)
        cnt = np.zeros_like(k)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            acc += np.roll(np.roll(v * k, dy, 0), dx, 1)
            cnt += np.roll(np.roll(k, dy, 0), dx, 1)
        fill = (k == 0) & (cnt > 0)
        v = np.where(fill, acc / np.maximum(cnt, 1), v)
        k = np.where(fill, 1.0, k)
    return v


# ---------------------------------------------------------------- splitting

def runs(on: np.ndarray, min_len: int = 8) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    start = None
    for i, v in enumerate(list(on) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= min_len:
                out.append((start, i))
            start = None
    return out


def split(alpha: np.ndarray, rows: int, cols: int) -> list[tuple[int, int, int, int]]:
    """Sprite boxes (x0, y0, x1, y1), row-major."""
    row_on = (alpha > 0.1).sum(axis=1) > 2
    bands = runs(row_on, 30)
    assert len(bands) == rows, f"expected {rows} rows, found {bands}"
    boxes = []
    for y0, y1 in bands:
        prof = (alpha[y0:y1] > 0.5).sum(axis=0)
        segs = runs(prof > 0, 30)
        while len(segs) < cols:
            # Touching neighbours: cut the widest run at its thinnest column.
            i = max(range(len(segs)), key=lambda j: segs[j][1] - segs[j][0])
            a, b = segs[i]
            w = b - a
            lo, hi = a + w // 4, b - w // 4
            cut = lo + int(np.argmin(prof[lo:hi]))
            segs[i:i + 1] = [(a, cut), (cut, b)]
        assert len(segs) == cols, f"expected {cols} columns, found {segs}"
        for x0, x1 in segs:
            boxes.append((x0, y0, x1, y1))
    return boxes


# ---------------------------------------------------------------- hex fit

def solid(alpha: np.ndarray) -> np.ndarray:
    return alpha > 0.5


def fit_regular(alpha: np.ndarray) -> tuple[float, float, float]:
    """(cx, cy, R) of a flat-top hex sprite whose left/right points and bottom edge are clean."""
    m = solid(alpha)
    ys = np.where(m.any(axis=1))[0]
    widths = m.sum(axis=1)
    # The bottom edge: the lowest row that is still a broad run (rounded corners taper it).
    full = np.where(widths > 0.3 * widths.max())[0]
    bottom = float(full.max()) + 1.0
    # The left/right points: the widest rows of the lower half (grass tips only rise above the top).
    lower = ys[ys > (ys.min() + ys.max()) / 2]
    left = min(int(np.where(m[y])[0].min()) for y in lower)
    right = max(int(np.where(m[y])[0].max()) for y in lower) + 1
    R = (right - left) / 2.0
    cx = (left + right) / 2.0
    cy = bottom - SQ3 / 2.0 * R
    return cx, cy, R


def fit_iou(alpha: np.ndarray, R: float | None = None, lower: bool = False) -> tuple[float, float, float]:
    """(cx, cy, R) of the flat-top hex that best overlaps the painted area (intersection over
    union), searched coarse to fine. Sprays, drips and leaves are small next to a whole hex, so
    they barely move it, unlike edge-based fits. `R` fixed: only the centre is searched. `lower`:
    only the lower part counts (homes, whose top is a tree, a plume or a reactor)."""
    m = alpha > 0.5
    ys, xs = np.nonzero(m)
    gx, gy = (xs.min() + xs.max()) / 2.0, (ys.min() + ys.max()) / 2.0
    r0 = R if R else (xs.max() - xs.min()) / 2.0
    if R:
        gy = ys.max() - SQ3 / 2 * R
    region = np.ones_like(m)
    if lower:
        region[: int(ys.max() - 0.75 * SQ3 * r0)] = False

    def score(cx, cy, r):
        h = hex_mask(m.shape, cx, cy, r) & region
        mm = m & region
        return (h & mm).sum() / max(1, (h | mm).sum())

    best = (score(gx, gy, r0), gx, gy, r0)
    for step in (8.0, 4.0, 2.0, 1.0, 0.5):
        improved = True
        while improved:
            improved = False
            _, cx, cy, r = best
            for dx, dy, dr in ((step, 0, 0), (-step, 0, 0), (0, step, 0), (0, -step, 0), (0, 0, step), (0, 0, -step)):
                if R and dr:
                    continue
                cand = (score(cx + dx, cy + dy, r + dr), cx + dx, cy + dy, r + dr)
                if cand[0] > best[0] + 1e-6:
                    best, improved = cand, True
    return best[1], best[2], best[3]


def fit_by_bottom(alpha: np.ndarray, R: float) -> tuple[float, float, float]:
    """(cx, cy, R) from the bottom edge only (the homes: tree and smoke hide the sides)."""
    m = solid(alpha)
    widths = m.sum(axis=1)
    rows = np.where(widths > 0.25 * R)[0]
    bottom = float(rows.max()) + 1.0
    # Average the bottom edge's centre over a few rows just above it (antialiasing, rounding).
    centres = []
    for y in range(int(bottom) - 12, int(bottom) - 2):
        xs = np.where(m[y])[0]
        if len(xs):
            centres.append((xs.min() + xs.max() + 1) / 2.0)
    cx = float(np.median(centres))
    return cx, bottom - SQ3 / 2.0 * R, R


def hex_mask(shape: tuple[int, int], cx: float, cy: float, R: float, scale: float = 1.0) -> np.ndarray:
    """Flat-top hex (points left/right) at (cx, cy), circumradius R*scale."""
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w]
    x = np.abs(xx + 0.5 - cx)
    y = np.abs(yy + 0.5 - cy)
    r = R * scale
    return (y <= SQ3 / 2 * r) & (SQ3 * x + y <= SQ3 * r)


# ---------------------------------------------------------------- contour tracing

def trace(mask: np.ndarray) -> list[list[tuple[float, float]]]:
    """Outer boundaries of the mask's components as closed pixel-corner polygons (marching edges)."""
    h, w = mask.shape
    m = np.zeros((h + 2, w + 2), bool)
    m[1:-1, 1:-1] = mask
    # Directed boundary edges with the filled side on the left (clockwise in image coordinates).
    edges: dict[tuple[int, int], list[tuple[int, int]]] = {}

    def add(a, b):
        edges.setdefault(a, []).append(b)

    ys, xs = np.nonzero(m)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if not m[y - 1, x]:
            add((x, y), (x + 1, y))
        if not m[y, x + 1]:
            add((x + 1, y), (x + 1, y + 1))
        if not m[y + 1, x]:
            add((x + 1, y + 1), (x, y + 1))
        if not m[y, x - 1]:
            add((x, y + 1), (x, y))
    loops = []
    while edges:
        start = next(iter(edges))
        loop = [start]
        cur = start
        while True:
            nxt_list = edges[cur]
            nxt = nxt_list.pop()
            if not nxt_list:
                del edges[cur]
            if nxt == start:
                break
            loop.append(nxt)
            cur = nxt
            if cur not in edges:
                break
        if len(loop) >= 4:
            loops.append([(x - 1.0, y - 1.0) for x, y in loop])
    return loops


def area(poly) -> float:
    s = 0.0
    for i in range(len(poly)):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % len(poly)]
        s += x0 * y1 - x1 * y0
    return s / 2.0


def simplify(pts, eps):
    """Douglas-Peucker on a closed ring."""
    if len(pts) < 4:
        return pts

    def dp(seq):
        if len(seq) < 3:
            return seq
        (x0, y0), (x1, y1) = seq[0], seq[-1]
        dx, dy = x1 - x0, y1 - y0
        n = math.hypot(dx, dy) or 1e-9
        best, idx = -1.0, 0
        for i in range(1, len(seq) - 1):
            px, py = seq[i]
            d = abs(dy * px - dx * py + x1 * y0 - y1 * x0) / n
            if d > best:
                best, idx = d, i
        if best <= eps:
            return [seq[0], seq[-1]]
        return dp(seq[: idx + 1])[:-1] + dp(seq[idx:])

    # Split the ring at its two farthest-apart points so both halves are open chains.
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    a = dp(pts[: far + 1])
    b = dp(pts[far:] + [pts[0]])
    return a[:-1] + b[:-1]


def chaikin(pts, passes=3):
    """Corner cutting on a closed ring: a polyline becomes a smooth curve (owner, 2026-11-14:
    "the trace line of the tree or the spill should be smoother by quite a bit")."""
    for _ in range(passes):
        n = len(pts)
        out = []
        for i in range(n):
            (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % n]
            out.append((0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1))
            out.append((0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1))
        pts = out
    return pts


def spline_points(pts, steps=6):
    """Sample the closed quadratic B-spline whose control points are `pts` (curve through the
    midpoints of the control polygon's sides)."""
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        a = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
        c = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
        for k in range(steps):
            t = k / steps
            out.append(((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * p1[0] + t * t * c[0],
                        (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * p1[1] + t * t * c[1]))
    return out


def spline_path(pts, ocx, ocy, u):
    """The same curve as an SVG path: M at the first midpoint, then one Q per control point."""
    def P(x, y):
        return f"{(x - ocx) * u:.1f},{(y - ocy) * u:.1f}"
    n = len(pts)
    mid = lambda i: ((pts[i][0] + pts[(i + 1) % n][0]) / 2, (pts[i][1] + pts[(i + 1) % n][1]) / 2)
    d = "M" + P(*mid(n - 1))
    for i in range(n):
        d += "Q" + P(*pts[i]) + " " + P(*mid(i))
    return d + "Z"


COVER_DEBUG: list[int] = []


def covers(rings, need, own):
    """True when the curves (plus the sprite's own hex) contain every pixel in `need`."""
    from PIL import ImageDraw
    h, w = need.shape
    img = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(img)
    for pts in rings:
        d.polygon(spline_points(pts), fill=255)
    inside = np.asarray(img) > 0
    # Containment with the margin: the art grown by 3 px must still be inside the curve.
    # (where the curve meets the hex edge it may round in: the home hex itself is no neighbour)
    miss = dilate(need, 3) & ~inside & ~dilate(own, 4)
    COVER_DEBUG.append(int(miss.sum()))
    return int(miss.sum()) <= 2


def smooth(pts, passes=2):
    """Chaikin-free light smoothing: average each vertex with its neighbours (staircase -> curve)."""
    for _ in range(passes):
        n = len(pts)
        pts = [((pts[i - 1][0] + 2 * pts[i][0] + pts[(i + 1) % n][0]) / 4.0,
                (pts[i - 1][1] + 2 * pts[i][1] + pts[(i + 1) % n][1]) / 4.0) for i in range(n)]
    return pts


# ---------------------------------------------------------------- sprites

SHEETS = {
    # name: (file, rows, cols, keying band px, has green art of its own)
    "forest": ("forest.jpg", 2, 5, 3, True),
    "ash": ("ash.jpg", 2, 5, 5, False),
    "rocks": ("rocks.jpg", 1, 5, 4, False),
    "gold-a": ("gold-frame-a.jpg", 1, 1, 26, False),
    "gold-b": ("gold-frame-b.jpg", 1, 1, 26, False),
    # Water and Toxic (owner, 2026-11-14): same rules. Teal water and yellow-green slime are the
    # art's own colours, so the lenient (foliage) key keeps them.
    "water": ("water.webp", 2, 5, 4, True),
    "toxic": ("toxic.webp", 2, 5, 3, True),
}


def load(name):
    file, rows, cols, band, foliage = SHEETS[name]
    rgb = np.asarray(Image.open(SRC / file).convert("RGB"))
    rgba = key_sheet(rgb, band, foliage=foliage)
    boxes = split(rgba[..., 3] / 255.0, rows, cols)
    return rgba, boxes


def components(mask: np.ndarray) -> list[np.ndarray]:
    """Connected components (8-neighbour) as boolean masks, largest first."""
    h, w = mask.shape
    seen = np.zeros_like(mask)
    flat = mask.ravel()
    out = []
    for start in np.flatnonzero(flat):
        if seen.flat[start]:
            continue
        stack = [int(start)]
        seen.flat[start] = True
        pix = []
        while stack:
            i = stack.pop()
            pix.append(i)
            y, x = divmod(i, w)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w:
                        j = yy * w + xx
                        if flat[j] and not seen.flat[j]:
                            seen.flat[j] = True
                            stack.append(j)
        m = np.zeros(h * w, bool)
        m[pix] = True
        out.append(m.reshape(h, w))
    out.sort(key=lambda m: -int(m.sum()))
    return out


def key_sheet(rgb: np.ndarray, band: int, core: float = 150.0, foliage: bool = True) -> np.ndarray:
    """RGBA float (0..255) with the green screen removed."""
    px = rgb.astype(np.float64)
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    gp = g - np.maximum(r, b)
    bg = (gp > core) & (g > 170)
    # The screen colour, measured (JPEG shifts it a little per sheet).
    K = px[bg].mean(axis=0)
    gK = float(K[1] - max(K[0], K[2]))
    edge = dilate(bg, band) & ~bg
    inner = ~bg & ~edge
    gF = spread(gp, inner, band + 3)
    gF = np.minimum(gF, gK - 40)  # a foreground is never as green as the screen
    alpha = np.ones(gp.shape)
    alpha[bg] = 0.0
    a = np.clip((gK - gp) / np.maximum(gK - gF, 1.0), 0.0, 1.0)
    alpha = np.where(edge, a, alpha)
    # Edge colour: a semi-transparent edge pixel takes the colour of the solid art right next to it
    # (spread outward from the interior), never a value "unmixed" from the green. Unmixing turns
    # soft edges muddy (dark-red rims on the gold, yellow-green halos); colour extension cannot
    # leave any green or dark fringe, and the alpha alone carries the antialiasing.
    out = px.copy()
    solid_px = inner | (edge & (alpha > 0.92))
    ext = np.dstack([spread(px[..., c], solid_px, band + 4) for c in range(3)])
    out = np.where((edge & ~solid_px)[..., None], ext, out)
    if not foliage:
        # Nothing on this sheet is green (ash, smoke, rock, gold): green left anywhere is the screen
        # caught in a pocket (the smoke's curl) or blended into an edge. It turns transparent in
        # proportion to how green it is, and what remains loses its green cast.
        g2 = out[..., 1] - np.maximum(out[..., 0], out[..., 2])
        alpha = np.minimum(alpha, np.clip(1.0 - (gp - 14.0) / 90.0, 0.0, 1.0))
        out[..., 1] = np.where(g2 > 6, np.maximum(out[..., 0], out[..., 2]) + 6, out[..., 1])
    alpha = np.where(alpha < 0.08, 0.0, alpha)
    # Grains: isolated specks the key left behind (JPEG noise on the screen) are cleared.
    for m in components(alpha > 0)[1:]:
        if m.sum() < 40:
            alpha[m] = 0.0
    rgba = np.dstack([out, alpha * 255.0])
    return rgba


def crop(rgba, box, pad=6):
    """The sprite's box, without slivers of its neighbours: pieces touching the crop's sides that
    are not the sprite itself are cleared (soft wisps inside the box stay)."""
    x0, y0, x1, y1 = box
    h, w = rgba.shape[:2]
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(w, x1 + pad), min(h, y1 + pad)
    c = rgba[y0:y1, x0:x1].copy()
    comps = components(c[..., 3] > 2)
    for m in comps[1:]:
        ys, xs = np.nonzero(m)
        if xs.min() <= pad or xs.max() >= m.shape[1] - 1 - pad:
            c[m] = 0
    return c


def export(name: str, rgba: np.ndarray, cx: float, cy: float, R: float, quality: int = 86,
           spill: bool = True, min_spill_area_px: float = 6.0, out_r: int = OUT_R, write: bool = True):
    """Scale so R -> out_r, write webp, return placement + spill outline in board units."""
    k = out_r / R
    a = rgba[..., 3]
    ys, xs = np.nonzero(a > 3)
    # Bounds: the art's own extent and the full hex, so the hex is always inside the picture.
    x0 = min(xs.min(), math.floor(cx - R)) - 2
    x1 = max(xs.max() + 1, math.ceil(cx + R)) + 2
    y0 = min(ys.min(), math.floor(cy - SQ3 / 2 * R)) - 2
    y1 = max(ys.max() + 1, math.ceil(cy + SQ3 / 2 * R)) + 2
    hh, ww = rgba.shape[:2]
    canvas = np.zeros((y1 - y0, x1 - x0, 4))
    sx0, sy0 = max(0, x0), max(0, y0)
    sx1, sy1 = min(ww, x1), min(hh, y1)
    canvas[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = rgba[sy0:sy1, sx0:sx1]
    # Premultiply for resampling, then un-premultiply (no dark/green fringes from transparent pixels).
    pm = canvas.copy()
    pm[..., :3] *= pm[..., 3:4] / 255.0
    W = max(1, round((x1 - x0) * k))
    H = max(1, round((y1 - y0) * k))
    chans = [Image.fromarray(pm[..., i].astype(np.float32), mode="F").resize((W, H), Image.LANCZOS) for i in range(4)]
    res = np.dstack([np.asarray(c) for c in chans])
    al = np.clip(res[..., 3], 0, 255)
    rgb = np.where(al[..., None] > 0.5, res[..., :3] * 255.0 / np.maximum(al[..., None], 1e-3), 0)
    out = np.dstack([np.clip(rgb, 0, 255), al]).round().astype(np.uint8)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.webp"
    if write:
        Image.fromarray(out, "RGBA").save(path, "WEBP", quality=quality, method=6, exact=False)
    # Where the hex centre sits in the exported picture, in exported pixels.
    ocx = (cx - x0) * k
    ocy = (cy - y0) * k
    u = S / out_r  # board units per exported pixel
    place = {
        "x": round(-ocx * u, 3), "y": round(-ocy * u, 3),
        "w": round(W * u, 3), "h": round(H * u, 3),
    }
    spill_paths: list[str] = []
    reach: list[str] = []
    if spill:
        # The outline sits just OUTSIDE the art, soft edge included: every painted pixel of the
        # canopy or smoke is inside the cut, so no green is ever under a highlight (owner,
        # 2026-11-14). It is drawn as one continuous curve through a few control points (a
        # quadratic B-spline: "even smoother"), and checked: the curve is rasterised back and must
        # contain the art; if it does not, the outline grows a pixel and is traced again.
        def leaves(loop):  # a piece that really leaves the hex (not fitting slack along an edge)
            return any(not hex_mask((1, 1), pcx - px + 0.5, pcy - py + 0.5, OUT_R, 1.035)[0, 0] for px, py in loop)
        P = 24  # trace on a padded canvas: an outline may reach past the picture's own edge
        pcx, pcy = ocx + P, ocy + P
        art = np.pad(out[..., 3] > 12, P)
        own = hex_mask(art.shape, pcx, pcy, OUT_R, 1.0)
        need = art & ~own
        # Only the pieces that really leave the hex (the canopy, the smoke), never the 1-2 px of
        # soft edge or fitting slack that runs along every side.
        far = ~hex_mask(art.shape, pcx, pcy, OUT_R, 1.04)
        keep = np.zeros_like(need)
        for comp in components(need):
            if (comp & far).any():
                keep |= comp
        need = keep
        # Only the three cells ABOVE a home are ever cut (owner, 2026-11-14: "ONLY on 3 tiles on
        # top around it, bottom 3 stay untouched"): the trace keeps what lies above the hex's
        # centre line.
        above = np.zeros_like(need)
        above[: max(0, int(pcy)), :] = True
        need &= above
        # Grown 5 px (~1.6 board units): wider than half the thickest highlight line (2.4 units), so
        # the rim drawn on this outline lies wholly outside the tree or smoke, soft edge and all.
        grow = 5
        while True:
            # Grow only what really leaves the hex: the in-hex art never pushes into a neighbour.
            outside = dilate(need, grow) & ~own
            loops = [l for l in trace(outside) if area(l) > min_spill_area_px and leaves(l)]
            rings = []
            for loop in loops:
                # Light smoothing: the curve follows the canopy's own bumps, minus the pixel steps.
                pts = simplify(smooth(loop, 5), 1.3)
                if len(pts) >= 3:
                    rings.append(pts)
            if not need.any() or covers(rings, need, own) or grow >= 14:
                break
            grow += 1
        print(f"  {name}: outline grown {grow}px, {len(rings)} piece(s), misses {COVER_DEBUG[-12:]}")
        COVER_DEBUG.clear()
        for pts in rings:
            spill_paths.append(spline_path(pts, pcx, pcy, u))
        # Which neighbour cells the spill reaches (flat-top screen directions).
        dirs = {
            "n": (0.0, -SQ3), "s": (0.0, SQ3),
            "ne": (1.5, -SQ3 / 2), "nw": (-1.5, -SQ3 / 2),
            "se": (1.5, SQ3 / 2), "sw": (-1.5, SQ3 / 2),
        }
        for d, (dx, dy) in dirs.items():
            cell = hex_mask(outside.shape, pcx + dx * OUT_R, pcy + dy * OUT_R, OUT_R, 0.97)
            if d in ("n", "ne", "nw") and (outside & cell).sum() > min_spill_area_px:
                reach.append(d)
    return {"file": path.name, **place, "spill": "".join(spill_paths), "reach": reach}, out


def main(preview: Path | None):
    entries: dict[str, dict] = {}
    previews: list[tuple[str, np.ndarray]] = []

    # Forest + Ash: 9 ground variations and the home (last in the second row) each.
    for sheet, home in (("forest", "tree"), ("ash", "volcano"), ("water", "whirlpool"), ("toxic", "reactor")):
        rgba, boxes = load(sheet)
        if sheet == "forest":
            rgba = calm(rgba, sat=0.78, light=0.94)
        crops = [crop(rgba, b) for b in boxes]
        fits = [fit_iou(c[..., 3] / 255.0) for c in crops[:9]]
        R = float(np.median([f[2] for f in fits]))
        for i, (c, f) in enumerate(zip(crops[:9], fits)):
            # Each tile is fitted to its own painted size (one is drawn ~2% larger than its siblings);
            # the sheet's median R is only for the homes, whose sides are hidden.
            cx, cy, own_R = f
            # Ground tiles: their grass tips simply lie over the cell above; only the homes are traced
            # (owner, 2026-11-14: "they don't have to be included in the selection trace - just home tiles").
            e, img = export(f"{sheet}-{i + 1:02d}", c, cx, cy, own_R, spill=False)
            entries[f"{sheet}-{i + 1:02d}"] = e
            previews.append((f"{sheet}-{i + 1:02d}", img))
        cx, cy, _ = fit_iou(crops[9][..., 3] / 255.0, R, lower=True)
        e, img = export(f"home-{home}", crops[9], cx, cy, R, quality=88)
        entries[f"home-{home}"] = e
        previews.append((f"home-{home}", img))

    # Rocks: clusters, not hexes. Each is fitted so its width spans the full hex width, centred on
    # its own visual mass. Bumps may stick out past the hex (owner, 2026-11-13: "if the stones are
    # sticking out outside of the hex shape - let them"); like the grass, they are not traced.
    rgba, boxes = load("rocks")
    for i, b in enumerate(boxes):
        c = crop(rgba, b)
        m = solid(c[..., 3] / 255.0)
        ys, xs = np.nonzero(m)
        w = xs.max() - xs.min() + 1
        R = w / (2 * 1.02)
        cx = (xs.min() + xs.max() + 1) / 2.0
        cy = (ys.min() + ys.max() + 1) / 2.0 + 0.04 * R  # a touch low: the clusters read as sitting
        e, img = export(f"rock-{i + 1:02d}", c, cx, cy, R, spill=False)
        entries[f"rock-{i + 1:02d}"] = e
        previews.append((f"rock-{i + 1:02d}", img))

    # Gold frames: the outer edge of the solid frame (not its glow) is fitted to the hex. Exported
    # larger (a 600 px hex) into one atlas: the board stretches its crop by ~2% (a 6 px pad), as before.
    golds = []
    for name in ("gold-a", "gold-b"):
        rgba, boxes = load(name)
        c = crop(rgba, boxes[0], pad=40)
        c = calm(clean_gold(c), sat=0.72, light=0.92)
        m = c[..., 3] > 0.92 * 255
        ys, xs = np.nonzero(m)
        cx = (xs.min() + xs.max() + 1) / 2.0
        cy = (ys.min() + ys.max() + 1) / 2.0
        Rx = (xs.max() - xs.min() + 1) / 2.0
        Ry = (ys.max() - ys.min() + 1) / SQ3
        # The two references are drawn a little squat; stretch them onto the exact hex.
        sy = Rx / Ry
        if abs(sy - 1) > 1e-3:
            H, W = c.shape[:2]
            pm = c.copy()
            pm[..., :3] *= pm[..., 3:4] / 255.0
            chans = [Image.fromarray(pm[..., i].astype(np.float32), mode="F").resize((W, round(H * sy)), Image.LANCZOS) for i in range(4)]
            res = np.dstack([np.asarray(ch) for ch in chans])
            al = np.clip(res[..., 3], 0, 255)
            rgb = np.where(al[..., None] > 0.5, res[..., :3] * 255.0 / np.maximum(al[..., None], 1e-3), 0)
            c = np.dstack([np.clip(rgb, 0, 255), al])
            cy *= sy
        e, img = export(name, c, cx, cy, Rx, spill=False, out_r=GOLD_R, write=False)
        golds.append((e, img))

    # One atlas for both frames (the board crops it with a nested <svg> viewBox, as before). Each
    # crop is the hex's exact bounding box in atlas pixels; the frame art sits inside it.
    pad = 8
    cells = []
    x = 0
    H = max(img.shape[0] for _, img in golds) + 2 * pad
    atlas = np.zeros((H, sum(img.shape[1] + 2 * pad for _, img in golds), 4), np.uint8)
    for e, img in golds:
        atlas[pad:pad + img.shape[0], x + pad:x + pad + img.shape[1]] = img
        k = GOLD_R / S
        ocx, ocy = x + pad - e["x"] * k, pad - e["y"] * k
        cells.append((round(ocx - GOLD_R, 2), round(ocy - SQ3 / 2 * GOLD_R, 2), 2 * GOLD_R, round(SQ3 * GOLD_R, 2)))
        x += img.shape[1] + 2 * pad
    Image.fromarray(atlas, "RGBA").save(OUT / "gold-frames.webp", "WEBP", quality=88, method=6)
    gold = {"w": atlas.shape[1], "h": atlas.shape[0], "crops": cells}
    for name, img_e in zip(("gold-a", "gold-b"), golds):
        e, img = img_e
        # the contact sheet shows them at the tiles' scale
        small = np.asarray(Image.fromarray(img, "RGBA").resize((round(img.shape[1] * OUT_R / GOLD_R), round(img.shape[0] * OUT_R / GOLD_R)), Image.LANCZOS))
        entries[name] = e
        previews.append((name, small))

    write_data(entries, gold, build_backgrounds())
    if preview:
        write_preview(preview, previews, entries)


def calm(rgba: np.ndarray, sat: float, light: float) -> np.ndarray:
    """A more natural, less flashy tone (owner, 2026-11-14: "a bit too intense - make it look a
    bit more natural"): saturation scaled about each pixel's own luminance, and the brightest
    values eased down a little (shadows untouched). Hue and painted detail stay as drawn."""
    out = rgba.copy()
    rgb = out[..., :3]
    lum = (0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2])[..., None]
    rgb = lum + (rgb - lum) * sat
    rgb = 255.0 * (np.clip(rgb, 0, 255) / 255.0) ** (1.0 / light)
    out[..., :3] = np.clip(rgb, 0, 255)
    return out


def box_blur(a: np.ndarray, r: int, passes: int = 3) -> np.ndarray:
    for _ in range(passes):
        for axis in (0, 1):
            c = np.cumsum(np.pad(a, [(r + 1, r) if i == axis else (0, 0) for i in range(2)], mode="edge"), axis=axis)
            a = (np.take(c, range(2 * r + 1, c.shape[axis]), axis=axis) - np.take(c, range(0, c.shape[axis] - 2 * r - 1), axis=axis)) / (2 * r + 1)
    return a


def clean_gold(c: np.ndarray) -> np.ndarray:
    """The frame's stones at a crisp edge, without the painted halo.

    The painted glow was a soft yellow over the green screen: any key leaves it muddy. The stones
    keep their painted pixels; the glow comes from the board's own gold-frame glow (style.css,
    `.gold-frame`), as for the frames before (owner, 2026-11-13)."""
    a = c[..., 3] / 255.0
    # A crisp but antialiased edge: the stones' solid core, feathered over ~1.5 px.
    hard = np.clip((a - 0.55) / 0.35, 0.0, 1.0)
    for m in components(hard > 0)[1:]:
        if m.sum() < 400:
            hard[m] = 0.0
    solid_px = hard > 0.99
    ext = np.dstack([spread(c[..., i], solid_px, 6) for i in range(3)])
    rgb = np.where((hard < 0.99)[..., None], ext, c[..., :3])
    # The hole inside the frame: everything not reachable from the picture's border.
    outside = ~(hard > 0)
    comps = components(outside)
    hole = np.zeros_like(outside)
    for m in comps:
        ys, xs = np.nonzero(m)
        if not (ys.min() == 0 or xs.min() == 0 or ys.max() == m.shape[0] - 1 or xs.max() == m.shape[1] - 1):
            hole |= m
    glow = np.zeros_like(hard)
    glow = np.where(hole, 0.0, glow)
    G = np.array([255.0, 198.0, 92.0])
    out_a = hard + glow * (1 - hard)
    out_rgb = (rgb * hard[..., None] + G * (glow * (1 - hard))[..., None]) / np.maximum(out_a, 1e-3)[..., None]
    return np.dstack([np.clip(out_rgb, 0, 255), out_a * 255.0])


BG_W = 1100  # exported background width (a board hex radius is then ~100 px, like the tiles)
BACKGROUNDS = ("cocoa", "lichen", "cinder", "clay", "slate")


def build_backgrounds() -> list[str]:
    """The board backgrounds: each sheet is a painted radius-3 board (37 flat-top hexes, each with
    its own tone) on green. Cut to the board's exact outline box (11 radii wide, 7 sqrt(3) radii
    tall), the colour carried outward past the edge (so a bent rim never shows green or nothing),
    and saved opaque. The board lays it so every painted hex sits on its own cell."""
    names = []
    for name in BACKGROUNDS:
        src = SRC / "backgrounds" / f"{name}.webp"
        if not src.exists():
            continue
        rgba = key_sheet(np.asarray(Image.open(src).convert("RGB")), 3, foliage=True)
        a = rgba[..., 3] > 128
        ys, xs = np.nonzero(a)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        c = rgba[y0:y1, x0:x1]
        H = round(BG_W * (y1 - y0) / (x1 - x0))
        small = np.dstack([np.asarray(Image.fromarray(c[..., i].astype(np.float32), mode="F").resize((BG_W, H), Image.LANCZOS)) for i in range(4)])
        known = small[..., 3] > 250
        rgb = np.dstack([spread(small[..., i], known, 60) for i in range(3)])
        Image.fromarray(np.clip(rgb, 0, 255).round().astype(np.uint8), "RGB").save(OUT / f"bg-{name}.webp", "WEBP", quality=80, method=6)
        print(f"  bg-{name}: {BG_W}x{H} from {x1 - x0}x{y1 - y0}")
        names.append(name)
    return names


def write_data(entries: dict[str, dict], gold: dict, backgrounds: list[str]):
    lines = [
        "// GENERATED by scripts/build-forest-ash.py from art/forest-ash/source/*.jpg. Do not edit.",
        "//",
        "// The Forest & Ash skin's sprites: where each picture sits around its hex centre (board units,",
        "// hex radius S = 30, flat-top: points left and right), and the outline of the part that spills",
        "// OUT of its own hex (grass tips, the tree, the smoke), traced once at build time. `reach` lists",
        "// the neighbouring cells that spill lands on, as screen directions.",
        "",
        "export type SpillDir = 'n' | 's' | 'ne' | 'nw' | 'se' | 'sw';",
        "export type ForestAshSprite = {",
        "  /** Top-left of the picture relative to the hex centre, and its size (board units). */",
        "  x: number; y: number; w: number; h: number;",
        "  /** The spill outside the sprite's own hex, as an SVG path around the hex centre ('' = none). */",
        "  spill: string;",
        "  /** The neighbouring cells that spill reaches. */",
        "  reach: readonly SpillDir[];",
        "};",
        "",
        "export const FOREST_ASH_GEOMETRY = {",
    ]
    for name, e in entries.items():
        if name.startswith("gold-"):
            continue
        reach = "[" + ", ".join(f"'{r}'" for r in e["reach"]) + "]"
        lines.append(f"  '{name}': {{ x: {e['x']}, y: {e['y']}, w: {e['w']}, h: {e['h']}, reach: {reach},")
        lines.append(f"    spill: '{e['spill']}' }},")
    lines.append("} as const satisfies Record<string, ForestAshSprite>;")
    lines.append("")
    lines.append("export type ForestAshName = keyof typeof FOREST_ASH_GEOMETRY;")
    lines.append("")
    lines.append("/** gold-frames.webp: its size and, per frame, the hex's exact bounding box in atlas pixels. */")
    lines.append(f"export const GOLD_ATLAS_SIZE = {{ w: {gold['w']}, h: {gold['h']} }} as const;")
    crops = ", ".join(f"[{c[0]}, {c[1]}, {c[2]}, {c[3]}]" for c in gold["crops"])
    lines.append("/** Board backgrounds (bg-<name>.webp): a painted radius-3 board, cut to its outline box. */")
    lines.append("export const BACKGROUND_NAMES = [" + ", ".join(f"'{n}'" for n in backgrounds) + "] as const;")
    lines.append(f"export const GOLD_FRAME_HEX_BOXES: readonly (readonly [number, number, number, number])[] = [{crops}];")
    lines.append("")
    DATA.write_text("\n".join(lines))


def write_preview(dir: Path, previews, entries):
    """Contact sheet: every sprite on a checkerboard with its fitted hex and traced spill."""
    from PIL import ImageDraw
    dir.mkdir(parents=True, exist_ok=True)
    cell = 300
    cols = 6
    rows = math.ceil(len(previews) / cols)
    sheet = Image.new("RGBA", (cols * cell, rows * cell), (40, 40, 40, 255))
    d0 = ImageDraw.Draw(sheet)
    for i in range(0, cols * cell, 20):
        for j in range(0, rows * cell, 20):
            if (i // 20 + j // 20) % 2:
                d0.rectangle([i, j, i + 19, j + 19], fill=(70, 70, 70, 255))
    for n, (name, img) in enumerate(previews):
        e = entries[name]
        ox = (n % cols) * cell + cell // 2
        oy = (n // cols) * cell + cell // 2 + 20
        k = OUT_R / S
        im = Image.fromarray(img, "RGBA")
        sheet.alpha_composite(im, (round(ox + e["x"] * k), round(oy + e["y"] * k)))
        d = ImageDraw.Draw(sheet)
        pts = [(ox + OUT_R * math.cos(math.radians(60 * j)), oy + OUT_R * math.sin(math.radians(60 * j))) for j in range(6)]
        d.polygon(pts, outline=(0, 200, 255, 255))
        for part in e["spill"].split("Z"):
            if not part:
                continue
            import re as _re
            ps = [(float(a) * k, float(b) * k) for a, b in _re.findall(r"(-?[\d.]+),(-?[\d.]+)", part)]
            d.line([(ox + x, oy + y) for x, y in ps] + [(ox + ps[0][0], oy + ps[0][1])], fill=(255, 0, 200, 255), width=2)
        d.text((ox - cell // 2 + 6, oy - cell // 2 - 16), f"{name} {','.join(e['reach'])}", fill=(255, 255, 255, 255))
    sheet.save(dir / "forest-ash-contact.png")


if __name__ == "__main__":
    args = sys.argv[1:]
    prev = Path(args[args.index("--preview") + 1]) if "--preview" in args else None
    main(prev)
