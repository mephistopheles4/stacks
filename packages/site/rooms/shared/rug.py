"""PROTOTYPE for #593: the carpet as a thing lying on a floor, not a painted box.

The rug is built in its own axes (long side along x, centred on the origin) and placed by its
object transform, so its UVs read straight off the mesh:

- a top surface fine enough to bend, with a ruck across the front-left (clear of the chair and
  the table) and a slight wave along the long sides;
- an edge that rolls over to the floor in a quarter round, as a bound edge does, and no
  underside (nothing sees it). The roll shows the binding folding under, never the photograph's
  edge pixels stretched down a wall, which read as a cutout;
- the binding itself, painted over the photograph's margin: the Met's carpet is four centuries
  old and its outer guard is worn ragged, so a straight edge cut through it at a different depth
  everywhere. An overcast selvedge runs down each long side, and a flat-woven kilim crosses each
  end, as on a carpet that still has them;
- a fringe on the two ends: the warps leave the kilim in plied cords, four to a hand-tied knot
  a centimetre out, then fan and lie down. Each cord is a ribbon three millimetres wide, its
  roundness and twist in its texture, since the page draws it unlit;
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
TOP = 0.03  # pile height off the floor, about 1 cm
FLOOR = 0.003  # the roll stops just above the floor plane
ROLL = 4  # rings in the rolled edge's quarter round
SELVEDGE = 0.031  # the overcast binding down each long side, 1 cm
KILIM = 0.05  # the flat-woven band across each end, 1.6 cm
PILE_TILE = 0.31  # one pile tile covers about 10 cm
RNG = np.random.default_rng(593)
# rug(..., ruck=(x, y)): a chair's back feet stand there, in the rug's own axes, and pushing the
# chair back (+x) has bunched the carpet just past them into a fold that lifts the front edge;
# None keeps the old ruck
RUCK = None
# the chair's fold: its height at the front edge, how far in it dies out, and the ripple's height
FOLD = (0.16, 4.2, 0.06)
# with a ruck, the fold is simulated as cloth rather than drawn: the carpet from the rug's end to the
# chair's back feet is shoved PUSH toward +x (most at the front edge), and the free carpet past the
# feet buckles under it, seeded by the drawn fold at SEED of its height so it buckles there
CLOTH = True
PUSH = 0.14
SEED = 0.5
# the carpet as cloth (mass is per vertex: ~1 cm squares of a heavy rug), barely stretching, stiff enough to fold broadly; it grips the floor
CLOTH_SET = {"mass": 0.005, "self": True, "tension": 200, "compression": 200, "shear": 50, "bending": 1.0, "friction": 10, "pin": 5}
# once simulated: (x0, y0, step, displacement [i, j, xyz]) over a box round the fold, rug axes
FIELD = None


def _smoothstep(e0, e1, x):
    t = np.clip((np.asarray(x, float) - e0) / (e1 - e0), 0.0, 1.0)
    s = t * t * (3 - 2 * t)
    return float(s) if s.ndim == 0 else s


def lift(x, y):
    """How far the rug rises off the floor at (x, y), in its own axes."""
    if RUCK is None:
        # the ruck: a ridge that starts at the front edge and dies out toward the middle
        p0, d = (-1.9, -SY / 2 - 0.1), (0.67, 0.74)
        px, py = x - p0[0], y - p0[1]
        along, across = px * d[0] + py * d[1], px * d[1] - py * d[0]
        ruck = 0.055 * math.exp(-((across / 0.22) ** 2)) * (1 - _smoothstep(0.9, 2.8, along))
    elif FIELD is not None:
        d = _field(x, y)
        ruck = max(float(d[2]), 0.0) if d is not None else 0.0
    else:
        ruck = _drawn_fold(x, y)
    # the long sides never lie quite flat
    edge = 1 - _smoothstep(0.0, 0.25, SY / 2 - abs(y))
    wave = 0.007 * edge * (0.6 + 0.4 * math.sin(x * 2.3 + (1.7 if y > 0 else 0.0)))
    return ruck + wave


def _drawn_fold(x, y):
    # the chair's ruck: pushed back from the desk (+x), its back feet shove the carpet ahead
    # of them into one fold across the push, just past the feet. It is tallest where the
    # front edge lifts off the floor in a rounded hump, and runs back into the rug, narrowing
    # and leaning a little with the push, until it dies out past the feet
    fx, _ = RUCK
    along = y + SY / 2  # in from the front edge
    centre = fx + 0.55 + 0.1 * along
    width = 0.3 - 0.1 * _smoothstep(0.0, 3.0, along)
    height = FOLD[0] * (1 - _smoothstep(0.4, FOLD[1], along))
    ruck = height * math.exp(-(((x - centre) / width) ** 2))
    # the push runs on: a lower ripple beyond the fold, shorter, where the carpet gave next
    centre2 = centre + 0.75 + 0.05 * along
    height2 = FOLD[2] * (1 - _smoothstep(0.2, 0.55 * FOLD[1], along))
    ruck += height2 * math.exp(-(((x - centre2) / (0.8 * width)) ** 2))
    return ruck


def _push(x, y):
    """How far the chair's feet shoved the carpet at (x, y) toward +x: the strip from the rug's end
    to just past the feet moves as one, most at the front edge and not at all past the fold."""
    fx = RUCK[0]
    return PUSH * (1 - _smoothstep(0.4, FOLD[1], y + SY / 2)) * (1 - _smoothstep(fx + 0.1, fx + 0.3, x))


def _field(x, y):
    """The simulated displacement at (x, y), bilinear between the proxy's vertices; None outside it."""
    x0, y0, h, d = FIELD
    fi, fj = (x - x0) / h, (y - y0) / h
    n, m = d.shape[0] - 1, d.shape[1] - 1
    if fi < 0 or fj < 0 or fi > n or fj > m:
        return None
    i, j = min(int(fi), n - 1), min(int(fj), m - 1)
    a, b = fi - i, fj - j
    return d[i, j] * (1 - a) * (1 - b) + d[i + 1, j] * a * (1 - b) + d[i, j + 1] * (1 - a) * b + d[i + 1, j + 1] * a * b


def _offset(x, y):
    """How far the carpet at (x, y) slid on the floor, (dx, dy): the field inside its box, the
    shoved strip as a whole to its left, nothing elsewhere."""
    if FIELD is None:
        return 0.0, 0.0
    d = _field(x, y)
    if d is not None:
        return float(d[0]), float(d[1])
    return (_push(x, y), 0.0) if x < FIELD[0] else (0.0, 0.0)


def _simulate(frames=60, h=0.035):
    """Shove the carpet and let it buckle: a proxy sheet over the fold's box, lying on a floor, its
    shoved strip pinned to a shape key that slides it, its far sides pinned still and its front edge
    free. Returns FIELD."""
    fx = RUCK[0]
    x0, x1 = fx - 0.3, fx + 3.2
    y0, y1 = -SY / 2, -SY / 2 + 5.2
    ni, nj = round((x1 - x0) / h), round((y1 - y0) / h)
    rest = 0.01  # where a flat sheet settles over the floor's collision shell
    scene = bpy.context.scene
    bm = bmesh.new()
    grid = [[bm.verts.new((x0 + i * h, y0 + j * h, rest + SEED * _drawn_fold(x0 + i * h, y0 + j * h)))
             for j in range(nj + 1)] for i in range(ni + 1)]
    for i in range(ni):
        for j in range(nj):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    me = bpy.data.meshes.new("rug_cloth")
    bm.to_mesh(me)
    bm.free()
    sheet = bpy.data.objects.new("rug_cloth", me)
    scene.collection.objects.link(sheet)
    base = np.array([v.co[:] for v in me.vertices])
    pin = sheet.vertex_groups.new(name="pin")
    for v in me.vertices:
        x, y = v.co.x, v.co.y
        # pinned, or not: a partly pinned band soaks up the push like a spring and never folds
        held = x < fx + 0.2 or x > x1 - 0.3 or y > y1 - 0.4
        pin.add([v.index], 1.0 if held else 0.0, "REPLACE")
    sheet.shape_key_add(name="Basis")
    shove = sheet.shape_key_add(name="shove")
    for v, k in zip(me.vertices, shove.data):
        k.co.x = v.co.x + _push(v.co.x, v.co.y)
    shove.value = 0.0
    shove.keyframe_insert("value", frame=1)
    shove.value = 1.0
    shove.keyframe_insert("value", frame=int(frames * 0.6))
    fme = bpy.data.meshes.new("rug_floor")
    fme.from_pydata([(x0 - 1, y0 - 1, 0), (x1 + 1, y0 - 1, 0), (x1 + 1, y1 + 1, 0), (x0 - 1, y1 + 1, 0)], [], [(0, 1, 2, 3)])
    floor = bpy.data.objects.new("rug_floor", fme)
    scene.collection.objects.link(floor)
    floor.modifiers.new("collision", "COLLISION")
    floor.collision.thickness_outer = 0.005
    floor.collision.cloth_friction = CLOTH_SET["friction"]  # it buckles near the push, not far off
    cloth = sheet.modifiers.new("cloth", "CLOTH")
    st = cloth.settings
    st.quality = 10
    st.mass = CLOTH_SET["mass"]
    st.tension_stiffness = CLOTH_SET["tension"]
    st.compression_stiffness = CLOTH_SET["compression"]  # it must buckle, not squash
    st.shear_stiffness = CLOTH_SET["shear"]
    st.bending_stiffness = CLOTH_SET["bending"]  # a wool pile on a cotton foundation: broad folds
    st.air_damping = 1.0
    st.vertex_group_mass = "pin"
    st.pin_stiffness = CLOTH_SET["pin"]
    cloth.collision_settings.collision_quality = 3
    cloth.collision_settings.distance_min = 0.005
    # a fold must not pass through itself and lie flat
    cloth.collision_settings.use_self_collision = CLOTH_SET["self"]
    cloth.collision_settings.self_distance_min = 0.008
    cloth.point_cache.frame_start, cloth.point_cache.frame_end = 1, frames
    f0 = scene.frame_current
    for f in range(1, frames + 1):
        scene.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = sheet.evaluated_get(dg).data
    co = np.array([v.co[:] for v in ev.vertices])
    scene.frame_set(f0)
    disp = co - base
    disp[:, 2] = co[:, 2] - rest  # the height off the flat, not off the seed
    action = me.shape_keys.animation_data.action if me.shape_keys.animation_data else None
    for o in (sheet, floor):
        d = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.meshes.remove(d)
    if action:
        bpy.data.actions.remove(action)
    return (x0, y0, h, disp.reshape(ni + 1, nj + 1, 3))


def _rug_mesh(nx=150, ny=112):
    """The mesh, and per vertex (in creation order, which is index order) the point of the
    photograph it shows, in rug units."""
    bm = bmesh.new()
    src = []

    def vert(co, at):
        src.append(at)
        return bm.verts.new(co)

    top = [[None] * (ny + 1) for _ in range(nx + 1)]
    for i in range(nx + 1):
        for j in range(ny + 1):
            x, y = -SX / 2 + SX * i / nx, -SY / 2 + SY * j / ny
            dx, dy = _offset(x, y)  # where the carpet slid to; it still shows its own (x, y)
            top[i][j] = vert((x + dx, y + dy, TOP + lift(x, y)), (x, y))
    for i in range(nx):
        for j in range(ny):
            bm.faces.new((top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]))
    # the rim, counter-clockwise from above, so each face of the roll faces out
    rim = ([(i, 0) for i in range(nx)] + [(nx, j) for j in range(ny)]
           + [(i, ny) for i in range(nx, 0, -1)] + [(0, j) for j in range(ny, 0, -1)])
    r = TOP - FLOOR
    rings = [[top[i][j] for i, j in rim]]
    for k in range(1, ROLL + 1):
        th = k / ROLL * math.pi / 2
        out, down = r * math.sin(th), r * (1 - math.cos(th))
        ring = []
        for i, j in rim:
            sx = -1 if i == 0 else 1 if i == nx else 0
            sy = -1 if j == 0 else 1 if j == ny else 0
            x, y = -SX / 2 + SX * i / nx, -SY / 2 + SY * j / ny
            # the binding folds under: the roll reads the band the top ends on, inward, and
            # stays inside it
            s = 0.8 * (KILIM if sx else SELVEDGE) * k / ROLL
            dx, dy = _offset(x, y)
            ring.append(vert((x + dx + sx * out, y + dy + sy * out, TOP + lift(x, y) - down), (x - sx * s, y - sy * s)))
        rings.append(ring)
    n = len(rim)
    for a_ring, b_ring in zip(rings, rings[1:]):
        for k in range(n):
            a, b = k, (k + 1) % n
            bm.faces.new((a_ring[a], b_ring[a], b_ring[b], a_ring[b]))
    me = bpy.data.meshes.new("room_rug")
    bm.to_mesh(me)
    bm.free()
    return me, src


def _wobble(n, step, amp):
    """A smooth random curve of n samples, varying over about `step` samples, in [-amp, amp]."""
    knots = RNG.uniform(-amp, amp, n // step + 3)
    return np.interp(np.arange(n) / step, np.arange(len(knots)), knots)


def _bind(img):
    """Paint the binding over the photograph's ragged margin, in place: an overcast selvedge
    down each long side (columns: u runs across the rug) and a kilim across each end (rows: v
    runs along it, bottom row first). Pixel values are the file's own sRGB."""
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    cu, cv = w / SY, h / SX  # pixels per rug unit, across and along
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    # distance in from each band's inner edge, in pixels; wool is laid by hand, so it wanders
    side = np.minimum(xx, w - 1 - xx) - (SELVEDGE * cu + _wobble(h, 40, 1.5)[:, None])
    end = np.minimum(yy, h - 1 - yy) - (KILIM * cv + _wobble(w, 40, 2.0)[None, :])
    rgb = px[..., :3]
    # the pile stands proud of the binding and shades it for a millimetre or two
    lip = 1 - 0.18 * np.clip(1 - np.minimum(side, end) / (0.004 * cu), 0, 1) * (np.minimum(side, end) > 0)
    rgb *= lip[..., None]
    # selvedge: indigo wool overcast round the edge warps, a diagonal stitch every 2.5 mm
    along = yy / cv
    stitch = 0.78 + 0.22 * np.sin(2 * np.pi * (along / 0.0078 + (xx / cu) / 0.012))
    selvedge = np.array([0.13, 0.12, 0.17], np.float32)[None, None, :] * stitch[..., None]
    # kilim: madder red flat weave, weft ribs a millimetre and a half apart, two indigo lines
    across = np.minimum(yy, h - 1 - yy) / cv
    rib = 0.82 + 0.18 * np.sin(2 * np.pi * across / 0.0047) ** 2
    kilim = np.broadcast_to(np.array([0.40, 0.10, 0.11], np.float32), rgb.shape).copy()
    line = (np.abs(across - 0.38 * KILIM) < 0.003) | (np.abs(across - 0.62 * KILIM) < 0.003)
    kilim[line] = (0.14, 0.15, 0.25)
    kilim *= (rib * (1 + 0.05 * RNG.standard_normal((h, w))))[..., None]
    a_side = np.clip(0.5 - side, 0, 1)[..., None]  # antialiased over a pixel
    a_end = np.clip(0.5 - end, 0, 1)[..., None]
    rgb[:] = rgb * (1 - a_side) + selvedge * a_side
    rgb[:] = rgb * (1 - a_end) + kilim * a_end  # the kilim runs to the very corner
    img.pixels.foreach_set(px.ravel())
    img.update()


def _strand_texture(w=32, h=512):
    """One cord: two plied threads of ivory cotton, its roundness and twist painted (the page
    draws it unlit), darker at the root under the rug and greyer where the tip frays. Values
    are sRGB."""
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h) + 0.5) / h
    uu, vv = np.meshgrid(u, v)
    round_ = np.sqrt(np.clip(1 - (2 * uu - 1) ** 2, 0, 1))  # a cylinder seen from above
    ply = np.sqrt(np.clip(1 - (2 * ((uu * 2 + vv * 40) % 1.0) - 1) ** 2, 0, 1))  # the twist
    shade = (0.45 + 0.55 * round_) * (0.8 + 0.2 * ply)
    shade *= 0.55 + 0.45 * np.clip(vv / 0.1, 0, 1)  # in the rug's shadow at the root
    shade *= 1 - 0.18 * np.clip((vv - 0.85) / 0.15, 0, 1)  # frayed, greyed tip
    shade *= 1 + 0.05 * RNG.standard_normal(shade.shape)
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


def rug(photo, material, out_dir, centre, turn, size=None, ruck=None):
    """The rug and its fringe: two lit entries for build_room. size: (long, short) in scene units,
    the photograph's own proportions or it stretches; ruck: see RUCK."""
    global SX, SY, RUCK, FIELD
    if size:
        SX, SY = size
    RUCK = ruck
    FIELD = _simulate() if ruck and CLOTH else None
    # a simulated fold needs the finer grid across it: a fold 20 cm wide over 2 cm steps
    me, src = _rug_mesh(nx=240 if FIELD else 150)
    o = bpy.data.objects.new("room_rug", me)
    bpy.context.scene.collection.objects.link(o)
    o.location = (*centre, 0)
    o.rotation_euler = (0, 0, turn)
    # the photograph's long side runs along x; u = -y keeps it unmirrored seen from above
    uv = me.uv_layers.new(name="UVMap").data
    for loop in me.loops:
        x, y = src[loop.vertex_index]
        uv[loop.index].uv = (0.5 - y / SY, 0.5 + x / SX)
    _unwrap_bake(o)
    o.data.materials.append(lightmaps._image_material(material, "rug_carpet", photo, (1, 1, 1), rough=1.0))
    img = o.data.materials[0].node_tree.nodes["Image Texture"].image
    _bind(img)  # before the bake, so the light it bounces is the binding's colour too
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


def _ribbon(bm, pts, width, z_lift, v0, v1, uv_detail):
    """A flat ribbon along `pts` [(x, y, z)], `width` across (a number or one per point), facing
    up; its detail UV runs u across and v from v0 to v1 along."""
    widths = width if isinstance(width, list) else [width] * len(pts)
    run = [0.0]
    for p, q in zip(pts, pts[1:]):
        run.append(run[-1] + math.hypot(q[0] - p[0], q[1] - p[1]))
    total = run[-1] or 1.0
    row = []
    for k, (x, y, z) in enumerate(pts):
        a = pts[max(k - 1, 0)]
        b = pts[min(k + 1, len(pts) - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        n = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / n, dx / n
        w = widths[k] / 2
        v = v0 + (v1 - v0) * run[k] / total
        row.append(((bm.verts.new((x - nx * w, y - ny * w, z + z_lift)),
                     bm.verts.new((x + nx * w, y + ny * w, z + z_lift))), v))
    for (p, vp), (q, vq) in zip(row, row[1:]):
        f = bm.faces.new((p[0], q[0], q[1], p[1]))
        f.normal_update()
        if f.normal.z < 0:  # every cord faces up, whichever end it hangs from
            f.normal_flip()
        uv_detail.append({p[0]: (0, vp), p[1]: (1, vp), q[0]: (0, vq), q[1]: (1, vq)})


def _fringe(rug_obj, material, out_dir, tassel=0.075, cords=4, cord=0.009, segs=10):
    """The warps' ends, both ends of the rug: a tassel every 2.4 cm or so, its `cords` plied
    cords leaving the kilim from under the roll, gathered into a knot a centimetre out, then
    fanning and lying down on the floor, each its own length and a little curled."""
    bm = bmesh.new()
    uv_detail = []
    for end in (-1, 1):
        edge = end * SX / 2
        y = -SY / 2 + SELVEDGE + tassel / 2
        while y < SY / 2 - SELVEDGE - tassel / 2 + 1e-6:
            heading = math.radians(RNG.normal(0, 6))
            out = 0.03 + 0.012 * RNG.random()
            kx, ky = edge + end * out, y + RNG.normal(0, 0.003)
            knot_z = FLOOR + 0.006
            for c in range(cords):
                off = (c - (cords - 1) / 2)
                root_y = y + off * tassel / cords
                pts = [(edge - end * 0.04, root_y, FLOOR + 0.012),  # under the roll
                       (edge + end * 0.004, root_y, FLOOR + 0.009)]  # leaves the kilim
                for s in (0.35, 0.7):  # gathers toward the knot
                    pts.append((edge + end * (0.004 + (out - 0.004) * s),
                                root_y + (ky + off * 0.0025 - root_y) * s * s, FLOOR + 0.008 - 0.002 * s))
                pts.append((kx, ky + off * 0.0025, knot_z))
                a = heading + math.radians(off * 7 + RNG.normal(0, 5))  # the tassel fans
                curl = math.radians(RNG.normal(0, 18))
                length = 0.13 + 0.07 * RNG.random()  # 4 to 6 cm past the knot
                px, py = pts[-1][0], pts[-1][1]
                for s in range(1, segs + 1):
                    t = s / segs
                    b = a + curl * _smoothstep(0.4, 1.0, t)
                    px += end * length / segs * math.cos(b)
                    py += end * length / segs * math.sin(b)
                    pts.append((px, py, FLOOR + 0.002 + 0.004 * (1 - _smoothstep(0.0, 0.3, t))))
                pts = [(px + _offset(px, py)[0], py + _offset(px, py)[1], pz) for px, py, pz in pts]  # shoved with the end
                n = len(pts)
                widths = [cord * (1 + 0.7 * _smoothstep(0.85, 1.0, k / (n - 1))) for k in range(n)]  # frays
                _ribbon(bm, pts, widths, 0.0006 * c, 0.0, 1.0, uv_detail)  # a hair apart: no z-fight
            # the knot: a short, wider wrap over the gathered cords
            dx, dy = end * math.cos(heading), end * math.sin(heading)
            knot = [(kx - dx * 0.008, ky - dy * 0.008, knot_z), (kx, ky, knot_z + 0.002), (kx + dx * 0.008, ky + dy * 0.008, knot_z)]
            knot = [(px + _offset(px, py)[0], py + _offset(px, py)[1], pz) for px, py, pz in knot]
            _ribbon(bm, knot, [0.017, 0.021, 0.017], 0.004, 0.35, 0.5, uv_detail)
            y += tassel * (0.85 + 0.3 * RNG.random())  # tied by hand, unevenly
    me = bpy.data.meshes.new("room_fringe")
    detail = bm.loops.layers.uv.new("UVMap")
    plan = bm.loops.layers.uv.new("bake")
    reach = 0.42  # how far past the edge the plan UV allows for
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
