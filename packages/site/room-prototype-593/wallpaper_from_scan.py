"""PROTOTYPE for #593: cut one seamless repeat out of a museum scan of a wallpaper sheet.

  blender -b --factory-startup -P packages/site/room-prototype-593/wallpaper_from_scan.py -- \
      --src <scan.jpg> --out <png> --crop x0,y0,x1,y1 --period-y <px> [--period-x <px>]
      [--sheet-height-cm 65.4] [--width 768]

`--crop` is the printed area in the scan's pixels, inside the sheet's cut edges and selvedge.
`--period-y` is the repeat down the sheet, roughly; the script refines it to the pixel by
matching the sheet against itself, and cross-fades the tile's last strip into its first so it
wraps without a seam.

Across, a sheet that holds a whole repeat takes `--period-x` and is treated the same way. One
cut short of a repeat (the Met's Willow keeps about 42 of its 53 cm) has no true match to find,
so the tile is the sheet's whole width, joined to itself along the seam that shows least: the
cut edge is slid along the selvedge edge to where the two agree best, and the join follows the
cheapest path through their difference (image quilting, Efros and Freeman 2001). Paper hung in
strips has a seam every roll's width anyway.

Last, the sheet's fading and foxing (anything slower than half a repeat) is divided out, since
a blotch that repeats every 40 cm reads as a pattern of its own.

Used for William Morris's "Willow" (1874), the Met's object 398344, block-printed; its
photograph is Open Access, public domain.
"""
import argparse
import sys

import bpy
import numpy as np

LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def load(path):
    im = bpy.data.images.load(path)
    w, h = im.size
    px = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(px)
    return px.reshape(h, w, 4)[::-1, :, :3].copy()  # top row first


def ncc(a, b):
    a = a - a.mean()
    b = b - b.mean()
    return float((a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum()))


def refine(grey, step, along, reach=24, drift=32):
    """The repeat one step from `step` (along x when along == 1, y when 0), to the pixel: the
    shift that best maps a central block onto itself, allowing a little drift across it."""
    h, w = grey.shape
    best = (-2.0, 0, 0)
    for d in range(step - reach, step + reach + 1):
        for e in range(-drift, drift + 1):
            dx, dy = (d, e) if along else (e, d)
            bw, bh = (w - abs(dx)) // 2, (h - abs(dy)) // 2
            x0, y0 = (w - bw - dx) // 2, (h - bh - dy) // 2
            a = grey[y0:y0 + bh:2, x0:x0 + bw:2]
            b = grey[y0 + dy:y0 + dy + bh:2, x0 + dx:x0 + dx + bw:2]
            score = ncc(a, b)
            if score > best[0]:
                best = (score, dx, dy)
    return best


def shear(img, k):
    """Row y moved left by y * k pixels, linearly interpolated; the columns it pulls in from
    past the right edge are trimmed off rather than invented."""
    h, w, _ = img.shape
    trim = int(np.ceil(abs(k) * h)) + 1
    out = np.empty((h, w - trim, 3), np.float32)
    xs = np.arange(w - trim, dtype=np.float32)
    for y in range(h):
        s = y * k + (trim if k < 0 else 0)
        x = xs + s
        x0 = np.floor(x).astype(int)
        f = (x - x0)[:, None]
        out[y] = img[y, x0] * (1 - f) + img[y, np.minimum(x0 + 1, w - 1)] * f
    return out


def wrap(region, p, axis):
    """The first p pixels along `axis`, their first strip cross-faded from the one a repeat on,
    so the result wraps: region must hold p plus that strip."""
    m = region.shape[axis] - p
    ramp = np.arange(m, dtype=np.float32) / m
    ramp = ramp[None, :, None] if axis == 1 else ramp[:, None, None]
    out = np.take(region, range(p), axis=axis).copy()
    head = np.take(region, range(m), axis=axis)
    tail = np.take(region, range(p, p + m), axis=axis)
    blend = tail * (1 - ramp) + head * ramp
    if axis == 1:
        out[:, :m] = blend
    else:
        out[:m] = blend
    return out


def quilt_across(strip, band):
    """`strip` wraps down already. Joins its right edge to its left with the cheapest seam: the
    left edge may start anywhere in the strip's first third, and inside a band that wide the
    join follows the path through the two edges' difference that costs least."""
    h, w, _ = strip.shape
    grey = strip @ LUMA
    right = grey[:, w - band:]
    best = None
    for start in range(0, w // 3 - band, 2):
        cost = float(((grey[:, start:start + band] - right) ** 2).mean())
        if best is None or cost < best[0]:
            best = (cost, start)
    cost, start = best
    left = strip[:, start:start + band]
    diff = ((left - strip[:, w - band:]) ** 2).sum(axis=2)
    # dynamic programme down the rows: the cheapest 8-connected path, which wraps with the tile
    acc = diff.copy()
    for y in range(1, h):
        prev = acc[y - 1]
        acc[y] += np.minimum(prev, np.minimum(np.roll(prev, 1), np.roll(prev, -1)))
    path = np.empty(h, int)
    path[-1] = int(np.argmin(acc[-1]))
    for y in range(h - 2, -1, -1):
        c = path[y + 1]
        lo, hi = max(0, c - 1), min(band, c + 2)
        path[y] = lo + int(np.argmin(acc[y, lo:hi]))
    # left of the path: the sheet's right edge; right of it: the cut edge's own leaves
    cols = np.arange(band)[None, :]
    mask = (cols >= path[:, None]).astype(np.float32)
    k = np.array([1, 4, 6, 4, 1], np.float32) / 16  # feather the cut a few pixels
    for _ in range(2):
        mask = np.apply_along_axis(lambda r: np.convolve(np.pad(r, 2, mode="edge"), k, "valid"), 1, mask)
    seam = strip[:, w - band:] * (1 - mask[..., None]) + left * mask[..., None]
    tile = np.concatenate([strip[:, start + band:w - band], seam], axis=1)
    print(f"[wallpaper] across: cut edge slid {start} px, seam cost {cost:.5f}")
    return tile


def blur_periodic(img, sigma):
    """Gaussian blur of a tile that wraps, done in the frequency domain so it wraps too."""
    h, w = img.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (fx ** 2 + fy ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(img, axes=(0, 1)) * g[..., None], axes=(0, 1)))


def main(a):
    x0, y0, x1, y1 = a.crop
    img = load(a.src)[y0:y1, x0:x1]
    grey = img @ LUMA
    sy, bx, py = refine(grey, a.period_y, 0)
    print(f"[wallpaper] down: ({bx}, {py}) ncc {sy:.3f}")
    if abs(bx) > 1:
        # The repeat runs a little aslant (Willow's 27 px in 2452: the sheet lay skewed under
        # the camera). Shear each row back, or the cross-fade would ghost every leaf.
        img = shear(img, bx / py)
        grey = img @ LUMA
        sy, bx, py = refine(grey, py, 0, reach=4, drift=4)
        print(f"[wallpaper] sheared: ({bx}, {py}) ncc {sy:.3f}")
    m = max(8, round(py * 0.05))
    top = (img.shape[0] - py - m) // 2
    strip = wrap(img[top:top + py + m], py, axis=0)
    if a.period_x:
        sx, px, ay = refine(grey, a.period_x, 1)
        print(f"[wallpaper] across: ({px}, {ay}) ncc {sx:.3f}")
        mx = max(8, round(px * 0.05))
        left = (strip.shape[1] - px - mx) // 2
        tile = wrap(strip[:, left:left + px + mx], px, axis=1)
    else:
        tile = quilt_across(strip, band=a.band)
    th, tw, _ = tile.shape
    lum = tile @ LUMA
    slow = blur_periodic(lum[..., None], min(tw, th) / 2)[..., 0]
    gain = np.clip(lum.mean() / np.maximum(slow, 1e-3), 0.8, 1.25)
    tile = tile * gain[..., None]
    # Willow is tone on tone; darkened to suit a dim room the leaves sink into the ground, so
    # `--contrast` spreads them from the sheet's mean colour (1 leaves the scan as it is)
    mean = tile.reshape(-1, 3).mean(axis=0)
    tile = np.clip(mean + (tile - mean) * a.contrast, 0, 1)
    res = bpy.data.images.new("wallpaper", tw, th, alpha=False)
    rgba = np.concatenate([tile[::-1], np.ones((th, tw, 1), np.float32)], axis=2)
    res.pixels.foreach_set(rgba.astype(np.float32).ravel())
    W = a.width
    H = round(W * th / tw)
    res.scale(W, H)
    res.filepath_raw = a.out
    res.file_format = "PNG"
    res.save()
    cm = a.sheet_height_cm / a.sheet_height_px
    print(f"[wallpaper] wrote {a.out} {W}x{H}: one tile, {tw * cm:.1f} x {th * cm:.1f} cm")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True, help="an absolute path: Blender reads a relative one against no file")
    ap.add_argument("--crop", required=True, type=lambda s: tuple(int(v) for v in s.split(",")))
    ap.add_argument("--period-y", type=int, required=True)
    ap.add_argument("--period-x", type=int, default=0)
    ap.add_argument("--band", type=int, default=160, help="width of the quilted seam, in scan pixels")
    ap.add_argument("--sheet-height-cm", type=float, default=65.4)
    ap.add_argument("--sheet-height-px", type=int, default=3560, help="the sheet's height in the scan, for the cm print")
    ap.add_argument("--width", type=int, default=768)
    ap.add_argument("--contrast", type=float, default=1.0)
    main(ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []))
