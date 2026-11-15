"""PROTOTYPE for #593: fetch the CC0 Poly Haven texture sets the hero chair uses into .cache/polyhaven/.

Runs under any Python 3 with no dependencies, Blender's included:
  blender -b --factory-startup --python-exit-code 1 -P packages/site/room-prototype-593/fetch_textures.py -- [--res 2k] [ids...]
  ... fetch_textures.py -- --model side_table_tall_01   (a model's glTF and its textures)

Every Poly Haven asset is CC0 (https://polyhaven.com/license). The cache is gitignored; the
baked atlases that ship are recorded in public/room-prototype-593/SOURCES.md.
"""
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.normpath(os.path.join(HERE, "..", "..", "..", ".cache", "polyhaven"))
DEFAULT = ["leather_red_02", "leather_red_03", "black_walnut_veneer_01", "american_walnut_veneer"]
# The leathers ship their colour as two variants, coll1/coll2, instead of a single Diffuse.
MAPS = {"Diffuse": "diff", "coll1": "diff", "coll2": "diff2", "nor_gl": "nor_gl", "Rough": "rough",
        "Displacement": "disp", "AO": "ao"}

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
res = "2k"
if "--res" in argv:
    i = argv.index("--res")
    res = argv[i + 1]
    del argv[i:i + 2]
ids = argv or DEFAULT
UA = {"User-Agent": "stacks-room-prototype/0.1"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def fetch_model(asset):
    """A Poly Haven model as glTF, with the files it names, into .cache/polyhaven/<asset>/."""
    entry = json.loads(get(f"https://api.polyhaven.com/files/{asset}"))["gltf"][res]["gltf"]
    out = os.path.join(CACHE, asset)
    for rel, inc in [(os.path.basename(entry["url"]), entry), *entry["include"].items()]:
        dst = os.path.join(out, *rel.split("/"))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if not os.path.exists(dst):
            with open(dst, "wb") as f:
                f.write(get(inc["url"]))
        print(f"[models] {asset}/{rel}")


if "--model" in argv:  # the rest are model ids
    argv.remove("--model")
    for asset in argv:
        fetch_model(asset)
    ids = []

for asset in ids:
    files = json.loads(get(f"https://api.polyhaven.com/files/{asset}"))
    out = os.path.join(CACHE, asset)
    os.makedirs(out, exist_ok=True)
    for key, short in MAPS.items():
        entry = files.get(key, {}).get(res, {})
        fmt = "jpg" if "jpg" in entry else "png" if "png" in entry else None
        if not fmt:
            print(f"[textures] {asset}: no {key} at {res}")
            continue
        dst = os.path.join(out, f"{short}.{fmt}")
        if not os.path.exists(dst):
            with open(dst, "wb") as f:
                f.write(get(entry[fmt]["url"]))
        print(f"[textures] {asset}/{short}.{fmt}")
