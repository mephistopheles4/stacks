"""PROTOTYPE for #593: an original hand-knotted rug, designed knot by knot.

  blender -b --factory-startup -P packages/site/room-prototype-593/rug_pattern.py -- --out <png> [--px 8] [--seed 7]

The design is ours: a madder field of quartered octagonal medallions (after the Turkmen gul,
as on the Met's Yomut main carpets) inside a black border carrying a peony vine (after
Victorian floral rugs). Nothing is traced from any rug.

It is drawn on the knot grid itself, so every edge steps the way a knotted pile does, from ten
"dyes". Then each knot is drawn as a small tuft, and the dye lots drift row by row (abrash),
which is most of what makes a rug read as made by hand.
"""
import argparse
import math
import sys

import bpy
import numpy as np

NX, NY = 220, 330  # knots across, knots along

PAL = np.array([
    (0.40, 0.07, 0.06),  # 0 madder: field ground
    (0.05, 0.045, 0.06),  # 1 near-black indigo: border ground
    (0.86, 0.79, 0.62),  # 2 ivory
    (0.74, 0.52, 0.20),  # 3 gold
    (0.86, 0.50, 0.36),  # 4 peach
    (0.62, 0.22, 0.11),  # 5 rust
    (0.34, 0.45, 0.34),  # 6 sage
    (0.12, 0.26, 0.27),  # 7 dark teal
    (0.14, 0.07, 0.05),  # 8 brown: outlines
    (0.13, 0.15, 0.30),  # 9 indigo blue
])
FIELD, BORDER, IVORY, GOLD, PEACH, RUST, SAGE, TEAL, BROWN, INDIGO = range(10)

GUARD_O, BORDER_W, GUARD_I = 4, 30, 4
FIELD_AT = GUARD_O + BORDER_W + GUARD_I


def peony(dx, dy, R, outer):
    """Layered petals: outer ring, a rust heart, a gold eye. Returns an index map or -1."""
    r = np.hypot(dx, dy)
    th = np.arctan2(dy, dx)
    out = np.full(dx.shape, -1)
    out[r < R * (0.78 + 0.22 * np.abs(np.cos(3 * th)))] = outer
    inner = 0.55 * R * (0.85 + 0.15 * np.abs(np.cos(5 * th + 0.3)))
    out[np.abs(r - inner) < 0.55] = BROWN
    out[r < inner - 0.55] = RUST
    out[r < 0.22 * R] = GOLD
    return out


def leaf(dx, dy, ang, length=7.0, width=3.0):
    c, s = np.cos(ang), np.sin(ang)  # ang may be per knot
    a, b = dx * c + dy * s, -dx * s + dy * c
    out = np.full(dx.shape, -1)
    inside = (a / length) ** 2 + (b / width) ** 2 < 1
    out[inside] = SAGE
    out[inside & (np.abs(b) < 0.5) & (np.abs(a) < length - 1.5)] = TEAL
    return out


def put(idx, mask, layer):
    sel = mask & (layer >= 0)
    idx[sel] = layer[sel]


def design():
    j, i = np.mgrid[0:NY, 0:NX].astype(float)
    x, y = i - (NX - 1) / 2, j - (NY - 1) / 2
    ex, ey = (NX - 1) / 2 - np.abs(x), (NY - 1) / 2 - np.abs(y)
    w = np.minimum(ex, ey)                     # knots in from the edge
    along_x = ey < ex                          # top and bottom bands run along x
    s = np.where(along_x, x, y)
    idx = np.full((NY, NX), FIELD)

    # outer guard: an indigo stripe with gold and ivory dashes, bound in brown
    m = w < GUARD_O
    idx[m] = INDIGO
    idx[m & (w >= 1.5) & (w < 2.5)] = np.where((np.floor(s / 3) % 2) == 0, GOLD, IVORY)[m & (w >= 1.5) & (w < 2.5)]
    idx[w < 1] = BROWN

    # border: a peony vine on black, a rosette in each corner square
    band = (w >= GUARD_O) & (w < GUARD_O + BORDER_W)
    idx[band] = BORDER
    u = (w - GUARD_O) / BORDER_W
    corner = band & (ex < GUARD_O + BORDER_W) & (ey < GUARD_O + BORDER_W)
    side = band & ~corner
    for axis_x in (True, False):
        m = side & (along_x == axis_x)
        L = (NX - 1 if axis_x else NY - 1) - 2 * (GUARD_O + BORDER_W)
        n = max(1, round(L / 52))
        P = L / n
        s0 = s + L / 2
        ph = 2 * math.pi * s0 / P
        uc = 0.5 + 0.27 * np.sin(ph)
        vine = np.abs(u - uc) * BORDER_W < 1.0
        idx[m & vine] = GOLD
        # leaves at the vine's crossings, alternately above and below
        k = np.round(s0 / (P / 2))
        sl = k * P / 2
        sgn = np.where(k % 2 == 0, 1.0, -1.0)
        put(idx, m, leaf(s0 - sl, (u - (0.5 + 0.17 * sgn)) * BORDER_W, 0.7 * sgn))
        # rosettes at its crests, peach and ivory by turns
        k = np.round((s0 - P / 4) / (P / 2))
        sr = P / 4 + k * P / 2
        ur = 0.5 + 0.27 * np.sin(2 * math.pi * sr / P)
        for parity, colour in ((0, PEACH), (1, IVORY)):
            mm = m & ((k % 2) == parity)
            put(idx, mm, peony(s0 - sr, (u - ur) * BORDER_W, 9.0, colour))
    cx = np.sign(x) * ((NX - 1) / 2 - GUARD_O - BORDER_W / 2)
    cy = np.sign(y) * ((NY - 1) / 2 - GUARD_O - BORDER_W / 2)
    dx, dy = x - cx, y - cy
    for a in (math.pi / 4, 3 * math.pi / 4, 5 * math.pi / 4, 7 * math.pi / 4):
        put(idx, corner, leaf(dx - 9 * math.cos(a), dy - 9 * math.sin(a), a, 5.5, 2.4))
    put(idx, corner, peony(dx, dy, 11.0, PEACH))

    # inner guard: ivory between brown lines, a teal-and-gold reciprocal zigzag
    m = (w >= GUARD_O + BORDER_W) & (w < FIELD_AT)
    t = w - (GUARD_O + BORDER_W)
    zig = np.abs((s % 6) - 3) * 2 / 3
    idx[m] = np.where(t - 1 < zig, TEAL, GOLD)[m]
    idx[m & ((t < 1) | (t >= GUARD_I - 1))] = BROWN

    # field: quartered octagonal guls on madder, eight-point stars between, tiny flowers
    f = w >= FIELD_AT
    a, b = 27.0, 23.0
    gx = np.where(x >= 0, 36.0, -36.0)
    gy = -90 + 60 * np.clip(np.round((y + 90) / 60), 0, 3)
    dx, dy = x - gx, y - gy
    n = np.maximum(np.maximum(np.abs(dx) / a, np.abs(dy) / b), (np.abs(dx) / a + np.abs(dy) / b) / 1.42)
    g = f & (n < 1)
    idx[g & (n >= 0.86)] = IVORY
    idx[g & (n >= 0.86) & (((dx + dy) % 5) < 1)] = TEAL
    core = g & (n < 0.86)
    idx[core] = np.where((dx > 0) ^ (dy > 0), INDIGO, RUST)[core]
    idx[core & ((np.abs(dx) < 0.6) | (np.abs(dy) < 0.6))] = IVORY
    # a small ivory diamond with a gold heart in each quarter
    qd =np.abs(np.abs(dx) - a * 0.42) / 5 + np.abs(np.abs(dy) - b * 0.42) / 4
    idx[core & (qd < 1)] = IVORY
    idx[core & (qd < 0.45)] = GOLD
    r = np.hypot(dx, dy * 1.1)
    th = np.arctan2(dy, dx)
    idx[core & (r < 9 * (0.7 + 0.3 * np.abs(np.cos(4 * th))))] = PEACH
    idx[core & (r < 4)] = GOLD
    idx[core & (r < 1.5)] = RUST

    # stars: between the columns on each gul row, and between the rows in each column
    sy1 = -90 + 60 * np.clip(np.round((y + 90) / 60), 0, 3)
    sy2 = -60 + 60 * np.clip(np.round((y + 60) / 60), 0, 2)
    d1 = np.hypot(x, y - sy1)
    d2 = np.hypot(x - gx, y - sy2)
    use1 = d1 < d2
    sx_, sy_ = np.where(use1, 0.0, gx), np.where(use1, sy1, sy2)
    dx, dy = x - sx_, y - sy_
    r, th = np.hypot(dx, dy), np.arctan2(dy, dx)
    st = f & (n >= 1.12)
    idx[st & (r < 7 * (0.55 + 0.45 * np.abs(np.cos(4 * th)) ** 2))] = IVORY
    idx[st & (r < 3)] = TEAL
    idx[st & (r < 1.2)] = GOLD

    # a scatter of tiny four-petal flowers on the open ground
    lx, ly = (x + 6) % 12 - 6, (y + (np.floor((x + 6) / 12) % 2) * 6 + 6) % 12 - 6
    tiny = f & (idx == FIELD) & (np.abs(lx) + np.abs(ly) <= 1) & (n > 1.2) & (r > 9)
    idx[tiny] = GOLD

    # a brown halo round every motif, as a knotter outlines it
    for ground in (FIELD, BORDER):
        g = idx == ground
        motif = ~g & (idx != BROWN)
        near = np.zeros_like(g)
        for sh, ax in ((1, 0), (-1, 0), (1, 1), (-1, 1)):
            near |= np.roll(motif, sh, axis=ax)
        region = f if ground == FIELD else band
        idx[g & near & region] = BROWN
    return idx


def render(idx, px, seed):
    rng = np.random.default_rng(seed)
    col = PAL[idx]
    # abrash: each dye lot a little lighter or darker, drifting row by row along the rug
    rows = np.arange(NY)
    lot = 1 + 0.035 * np.sin(rows * 0.045 + 1.3) + 0.025 * np.sin(rows * 0.11 + 0.4) + 0.02 * np.sin(rows * 0.023 + 2.1)
    col = col * lot[:, None, None] * (1 + 0.03 * rng.standard_normal((NY, NX, 1)))
    img = np.repeat(np.repeat(col, px, axis=0), px, axis=1)
    # each knot a tuft: lit on its crown, darker where it meets its neighbours, with fibre noise
    p = (np.arange(px) + 0.5) / px
    dome = 1 - 1.3 * ((p[:, None] - 0.5) ** 2 + (p[None, :] - 0.5) ** 2)
    shade = np.tile(0.78 + 0.22 * dome, (NY, NX))
    fibre = 1 + 0.05 * rng.standard_normal(shade.shape)
    img = img * (shade * fibre)[..., None]
    return np.clip(img, 0, 1)


def save(img, out):
    h, w, _ = img.shape
    im = bpy.data.images.new("rug", w, h, alpha=False)
    rgba = np.concatenate([img[::-1], np.ones((h, w, 1))], axis=2).astype(np.float32)
    im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw = out
    im.file_format = "PNG"
    im.save()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--px", type=int, default=8)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    save(render(design(), a.px, a.seed), a.out)
    print("[rug] wrote", a.out)
