"""PROTOTYPE for #593: flatten a museum photograph of a carpet into the rug's own texture.

  blender -b --factory-startup -P packages/site/room-prototype-593/rug_from_photo.py -- \
      --src <photo.jpg> --out <png> --corners tlx,tly trx,try brx,bry blx,bly [--width 2048] [--aspect 1.354]

The corners are the carpet's, in the photo's pixels (top-left, top-right, bottom-right,
bottom-left). A homography maps the output rectangle onto them, so a photo shot a little off
square (keystoned) comes out flat, at the carpet's real proportions.

Used for the Met's Silk Animal Carpet (object 446642, second half of the 16th century,
241 x 178 cm), whose photograph is Open Access, public domain.
"""
import argparse
import sys

import bpy
import numpy as np


def homography(src, dst):
    """3x3 H with dst ~ H @ src, from four point pairs."""
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    _, _, vt = np.linalg.svd(np.asarray(A, float))
    return vt[-1].reshape(3, 3) / vt[-1, -1]


def bilinear(img, x, y):
    h, w, _ = img.shape
    x = np.clip(x, 0, w - 1.001)
    y = np.clip(y, 0, h - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    a, b = img[y0, x0], img[y0, x0 + 1]
    c, d = img[y0 + 1, x0], img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def main(a):
    im = bpy.data.images.load(a.src)
    w, h = im.size
    px = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(px)
    img = px.reshape(h, w, 4)[::-1, :, :3]  # top row first, as the corners are given
    W = a.width
    H = round(W * a.aspect)
    rect = [(0, 0), (W - 1, 0), (W - 1, H - 1), (0, H - 1)]
    M = homography(rect, a.corners)
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    p = M @ np.stack([xx.ravel(), yy.ravel(), np.ones(xx.size)])
    out = bilinear(img, (p[0] / p[2]).reshape(H, W), (p[1] / p[2]).reshape(H, W))
    res = bpy.data.images.new("rug", W, H, alpha=False)
    rgba = np.concatenate([out[::-1], np.ones((H, W, 1), np.float32)], axis=2)
    res.pixels.foreach_set(rgba.astype(np.float32).ravel())
    res.filepath_raw = a.out
    res.file_format = "PNG"
    res.save()
    print(f"[rug] wrote {a.out} {W}x{H}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--corners", nargs=4, required=True, type=lambda s: tuple(float(v) for v in s.split(",")))
    ap.add_argument("--width", type=int, default=2048)
    ap.add_argument("--aspect", type=float, default=241 / 178)
    main(ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []))
