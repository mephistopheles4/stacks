"""PROTOTYPE for #593: the carpet as a thing lying on a floor, not a painted box.

The rug is built in its own axes (long side along x, centred on the origin) and placed by its
object transform, so its UVs read straight off the mesh:

- a top surface fine enough to bend, with a ruck across the front-left (clear of the chair and
  the table) and a slight wave along the long sides, its edge rolled down;
- walls down to the floor round the edge, and no underside (nothing sees it);
- wool fringe on the two short ends, a ribbon per bundle of warps, tucked under the edge and
  splaying at the tip; its bake UV is its plan, each end in one half;
- a tiling pile grain the page lays over the carpet as an `aoMap`, finer than the photograph.

Every surface is lit by a light-only bake (lightmaps.py) and textured on the page.
"""
import math
import os

import bmesh
import bpy
import numpy as np

import lightmaps

SX, SY = lightmaps.RUG_SIZE[0], lightmaps.RUG_SIZE[1]
TOP = 0.04  # pile height off the floor, ~1.3 cm
FLOOR = 0.003  # the walls stop just above the floor plane
PILE_TILE = 0.31  # one pile tile covers about 10 cm
RNG = np.random.default_rng(593)


def _smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def lift(x, y):
    """How far the rug rises off the floor at (x, y), in its own axes."""
    # the ruck: a ridge that starts at the front edge and dies out toward the middle
    p0, d = (-1.9, -SY / 2 - 0.1), (0.67, 0.74)
    px, py = x - p0[0], y - p0[1]
    along, across = px * d[0] + py * d[1], px * d[1] - py * d[0]
    ruck = 0.055 * math.exp(-((across / 0.22) ** 2)) * (1 - _smoothstep(0.9, 2.8, along))
    # the long sides never lie quite flat
    edge = 1 - _smoothstep(0.0, 0.25, SY / 2 - abs(y))
    wave = 0.007 * edge * (0.6 + 0.4 * math.sin(x * 2.3 + (1.7 if y > 0 else 0.0)))
    return ruck + wave


def _rug_mesh(nx=150, ny=112):
    bm = bmesh.new()
    top = [[None] * (ny + 1) for _ in range(nx + 1)]
    for i in range(nx + 1):
        for j in range(ny + 1):
            x, y = -SX / 2 + SX * i / nx, -SY / 2 + SY * j / ny
            rim = i in (0, nx) or j in (0, ny)
            top[i][j] = bm.verts.new((x, y, TOP - (0.01 if rim else 0.0) + lift(x, y)))
    for i in range(nx):
        for j in range(ny):
            bm.faces.new((top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]))
    rim = ([top[i][0] for i in range(nx)] + [top[nx][j] for j in range(ny)]
           + [top[i][ny] for i in range(nx, 0, -1)] + [top[0][j] for j in range(ny, 0, -1)])
    low = [bm.verts.new((v.co.x, v.co.y, FLOOR + lift(v.co.x, v.co.y))) for v in rim]
    for k in range(len(rim)):  # counter-clockwise from above, so each wall faces out
        a, b = k, (k + 1) % len(rim)
        bm.faces.new((rim[a], low[a], low[b], rim[b]))
    me = bpy.data.meshes.new("room_rug")
    bm.to_mesh(me)
    bm.free()
    return me


def _strand_texture(w=64, h=256):
    """One bundle of warps, ivory cotton: six plied threads, an S-twist, darker at the root
    (under the rug's edge) and greyer at the frayed tip. Values are sRGB."""
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h) + 0.5) / h
    uu, vv = np.meshgrid(u, v)
    threads = 6
    local = (uu * threads + vv * 9.0) % 1.0  # the twist slants each thread along the bundle
    round_ = np.sqrt(np.clip(1 - (2 * local - 1) ** 2, 0, 1))
    shade = 0.62 + 0.38 * round_
    shade *= 0.55 + 0.45 * np.clip(vv / 0.12, 0, 1)  # in the rug's shadow at the root
    shade *= 1 - 0.18 * np.clip((vv - 0.8) / 0.2, 0, 1)  # frayed, greyed tip
    shade *= 1 + 0.06 * RNG.standard_normal(shade.shape)
    ivory = np.array([0.74, 0.66, 0.52])  # aged cotton; a whiter one read as a dashed line
    rgb = np.clip(shade[..., None] * ivory, 0, 1)
    return np.concatenate([rgb, np.ones((h, w, 1))], axis=2)


def _pile_texture(n=512):
    """A tiling grain of tufts and fibres, as ambient occlusion (1 = open). Built in the
    frequency domain, so it tiles by construction. Returns (rgba, mean)."""
    f = np.fft.fftfreq(n) * n
    fx, fy = np.meshgrid(f, f)
    r = np.hypot(fx, fy * 0.6) + 1e-6  # stretched along v: the pile lies toward one end

    def band(lo, hi):
        spec = np.fft.fft2(RNG.standard_normal((n, n))) * np.exp(-((np.log(r) - np.log((lo + hi) / 2)) ** 2) / 0.18)
        g = np.real(np.fft.ifft2(spec))
        return (g - g.mean()) / g.std()

    g = 0.6 * band(70, 140) + 0.4 * band(25, 50)  # fibres, tufts
    ao = np.clip(0.86 + 0.07 * g, 0.62, 1.0)
    rgba = np.concatenate([np.repeat(ao[..., None], 3, axis=2), np.ones((n, n, 1))], axis=2)
    return rgba, float(ao.mean())


def _image(name, rgba):
    h, w, _ = rgba.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.pixels.foreach_set(rgba[::-1].astype(np.float32).ravel())  # top row first
    return img


def _unwrap_bake(o):
    o.data.uv_layers.active = o.data.uv_layers.new(name="bake")
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")


def rug(photo, material, out_dir, centre, turn):
    """The rug and its fringe: two lit entries for build_room."""
    me = _rug_mesh()
    o = bpy.data.objects.new("room_rug", me)
    bpy.context.scene.collection.objects.link(o)
    o.location = (*centre, 0)
    o.rotation_euler = (0, 0, turn)
    me.uv_layers.new(name="UVMap")
    # the photograph's long side runs along x; u = -y keeps it unmirrored seen from above
    lightmaps._set_uv(o, "UVMap", lambda co: (0.5 - co.y / SY, 0.5 + co.x / SX))
    _unwrap_bake(o)
    o.data.materials.append(lightmaps._image_material(material, "rug_carpet", photo, (1, 1, 1), rough=1.0))
    img = o.data.materials[0].node_tree.nodes["Image Texture"].image
    rel = "tex/" + os.path.splitext(os.path.basename(photo))[0] + ".webp"
    lightmaps.save_image(img, os.path.join(out_dir, rel), raw=True)
    pile, mean = _pile_texture()
    lightmaps.save_image(_image("rug_pile", pile), os.path.join(out_dir, "tex", "rug-pile.webp"), raw=True)
    k = round(1 / mean, 3)  # the grain darkens on average; the tint gives that back
    rug_entry = (o, {
        "albedo": rel,
        "tint": [k, k, k],
        "pile": "tex/rug-pile.webp",
        "pile_repeat": [round(SY / PILE_TILE, 2), round(SX / PILE_TILE, 2)],
    })
    return [rug_entry, _fringe(o, material, out_dir)]


def _fringe(rug_obj, material, out_dir, spacing=0.036, width=0.018, segs=8):
    bm = bmesh.new()
    uv_detail, uv_plan = [], []
    reach = 0.42  # how far past the edge the plan UV allows for
    for end in (-1, 1):
        x0 = end * (SX / 2 - 0.04)  # tucked under the rug's edge
        y = -SY / 2 + 0.1
        while y < SY / 2 - 0.1:
            length = 0.16 + 0.12 * RNG.random()
            heading = math.radians(RNG.normal(0, 9))
            curl = math.radians(RNG.normal(0, 32))
            px, py = x0, y + RNG.normal(0, 0.004)
            pts = []
            for s in range(segs + 1):
                t = s / segs
                a = heading + curl * _smoothstep(0.55, 1.0, t)
                if s:
                    step = length / segs
                    px += end * step * math.cos(a)
                    py += step * math.sin(a) * end
                z = FLOOR + 0.002 + (TOP * 0.5 - 0.004) * (1 - _smoothstep(0.0, 0.2, t))
                w = width * (1.0 - 0.25 * t + 0.6 * _smoothstep(0.8, 1.0, t))  # splays at the tip
                pts.append((px, py, z, a, w, t))
            row = []
            for px_, py_, z, a, w, t in pts:
                nx_, ny_ = -math.sin(a) * end, math.cos(a) * end  # across the strand
                pair = (bm.verts.new((px_ - nx_ * w / 2, py_ - ny_ * w / 2, z)),
                        bm.verts.new((px_ + nx_ * w / 2, py_ + ny_ * w / 2, z)))
                row.append((pair, t))
            for (p, t), (q, t2) in zip(row, row[1:]):
                f = bm.faces.new((p[0], q[0], q[1], p[1]))
                f.normal_update()
                if f.normal.z < 0:  # every strand faces up, whichever end it hangs from
                    f.normal_flip()
                uv_detail.append({p[0]: (0, t), p[1]: (1, t), q[0]: (0, t2), q[1]: (1, t2)})
            y += spacing * (0.8 + 0.5 * RNG.random())  # bundles are tied by hand, unevenly
    me = bpy.data.meshes.new("room_fringe")
    detail = bm.loops.layers.uv.new("UVMap")
    plan = bm.loops.layers.uv.new("bake")
    for f, m in zip(bm.faces, uv_detail):
        for loop in f.loops:
            loop[detail].uv = m[loop.vert]
            x, y = loop.vert.co.x, loop.vert.co.y
            t = (abs(x) - (SX / 2 - 0.06)) / reach
            half = 0.0 if x < 0 else 0.5
            loop[plan].uv = (half + 0.02 + 0.46 * t, 0.02 + 0.96 * (y + SY / 2) / SY)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("room_fringe", me)
    bpy.context.scene.collection.objects.link(o)
    o.location = rug_obj.location.copy()
    o.rotation_euler = rug_obj.rotation_euler.copy()
    img = _image("fringe_strand", _strand_texture())
    path = os.path.join(out_dir, "tex", "rug-fringe.webp")
    lightmaps.save_image(img, path, raw=True)
    m = lightmaps._image_material(material, "rug_fringe", path, (1, 1, 1), rough=0.9)
    o.data.materials.append(m)
    return o, {"albedo": "tex/rug-fringe.webp", "tint": [1.0, 1.0, 1.0]}
