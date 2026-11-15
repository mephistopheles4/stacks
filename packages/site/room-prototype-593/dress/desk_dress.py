"""The desk dressed with downloaded props, laid out as a desk somebody is in the middle of using:
books stacked at the back left, an inkwell and a sand blotter by the lamp, a sealed letter with the
a page half written with the pen lying on it, spectacles and a pocket watch to the right, postcards
at the front left. And Hobu's world map pinned to the wall above the desk, almost the desk's width. Every model is credited in SOURCES.md when it ships.

    exec(open("desk_dress.py").read(), g); g["dress_desk"](scene, repo, frame_build)
"""
import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

M = 3.11
TOP = 2.36          # the desk's top, scene units
LEFT_WALL_X = -7.89


def _import(path, scene):
    before = set(bpy.data.objects)
    w = bpy.context.window_manager.windows[0]
    with bpy.context.temp_override(window=w, scene=scene, view_layer=scene.view_layers[0]):
        bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def _keep(objs, prefixes):
    """The meshes whose names start with one of `prefixes`, freed of their import hierarchy at
    their world transforms; everything else the import brought is deleted."""
    kept = [o for o in objs if o.type == "MESH" and any(o.name.startswith(p) for p in prefixes)]
    for o in kept:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in objs:
        if o not in kept:
            bpy.data.objects.remove(o, do_unlink=True)
    return kept


def _box(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def _group(name, objs, scene, at, yaw_deg=0.0, size=1.0, lay_flat=False, z=TOP, stand=False):
    """objs under one pivot at their footprint's centre and base, scaled from metres to scene units
    (times `size` for a model that came at the wrong scale), turned `yaw_deg`, and stood at `at`.
    lay_flat turns the group's thinnest axis upright first, for a sheet modelled standing; stand
    turns its longest axis upright, for a pot scanned lying on its side."""
    if lay_flat or stand:
        lo, hi = _box(objs)
        d = hi - lo
        i = (max if stand else min)(range(3), key=lambda k: d[k])
        ax = Vector((0, 0, 0))
        ax[i] = 1
        q = ax.rotation_difference(Vector((0, 0, 1)))
        c = (lo + hi) / 2
        R = Matrix.Translation(c) @ q.to_matrix().to_4x4() @ Matrix.Translation(-c)
        for o in objs:
            o.matrix_world = R @ o.matrix_world
    lo, hi = _box(objs)
    piv = bpy.data.objects.new(name, None)
    scene.collection.objects.link(piv)
    piv.location = ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z)
    bpy.context.view_layer.update()
    for o in objs:
        o.parent = piv
        o.matrix_parent_inverse = piv.matrix_world.inverted()
    piv.location = (at[0], at[1], z)
    piv.rotation_euler = (0, 0, math.radians(yaw_deg))
    piv.scale = (M * size,) * 3
    return piv


def _darken(objs, k=0.55, sat=0.6):
    """Game-bright cloth bindings toned to a dark room: each base colour multiplied down and pulled
    toward its grey."""
    done = set()
    for o in objs:
        for m in o.data.materials:
            if not m or m.name in done or not m.use_nodes:
                continue
            done.add(m.name)
            nt = m.node_tree
            p = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if p is None or not p.inputs["Base Color"].links:
                continue
            src = p.inputs["Base Color"].links[0].from_socket
            hsv = nt.nodes.new("ShaderNodeHueSaturation")
            hsv.inputs["Saturation"].default_value = sat
            hsv.inputs["Value"].default_value = k
            nt.links.new(src, hsv.inputs["Color"])
            nt.links.new(hsv.outputs["Color"], p.inputs["Base Color"])


def _clear_lenses(objs):
    """The spectacles' lenses render as milky white discs in EEVEE: nearly clear, blended instead.
    The lenses carry the model's fingerprints material."""
    for o in objs:
        for m in o.data.materials:
            if m and m.use_nodes and m.name.startswith("Fingerprints"):
                p = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
                if p:
                    p.inputs["Alpha"].default_value = 0.12
                    p.inputs["Roughness"].default_value = 0.02
                    m.surface_render_method = "BLENDED"


# the left page of Fanny Longfellow's letter of 22 September 1851 (public domain, NPS via Wikimedia
# Commons): its writing stops two thirds down, so the page reads as one still being written
LETTER_PAGE_UV = ((0.025, 0.03), (0.495, 0.97))   # that page within the two-page scan


def _written_page(scene, path, at, yaw_deg, width=0.19):
    """A sheet of letter paper lying on the desk, its top toward the back of the desk, its corners
    lifting a little. at: its centre in scene units; width in metres, height from the page's own
    proportions in the scan."""
    img = bpy.data.images.load(path, check_existing=True)
    (u0, v0), (u1, v1) = LETTER_PAGE_UV
    height = width * ((v1 - v0) * img.size[1]) / ((u1 - u0) * img.size[0])
    nu, nv = 16, 24
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    grid = [[bm.verts.new(((i / nu - 0.5) * width * M, (j / nv - 0.5) * height * M,
                           (0.0025 * (2 * i / nu - 1) ** 2 + 0.004 * (j / nv) ** 4) * M))
             for i in range(nu + 1)] for j in range(nv + 1)]
    for j in range(nv):
        for i in range(nu):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            for lp, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                lp[uv].uv = (u0 + (u1 - u0) * a / nu, v0 + (v1 - v0) * b / nv)
            f.smooth = True
    me = bpy.data.meshes.new("desk_written_page")
    bm.to_mesh(me)
    bm.free()
    m = bpy.data.materials.get("letter_paper_1851")
    if m is None:
        m = bpy.data.materials.new("letter_paper_1851")
        m.use_nodes = True
        nt = m.node_tree
        p = nt.nodes["Principled BSDF"]
        p.inputs["Roughness"].default_value = 0.85
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        nt.links.new(tex.outputs["Color"], p.inputs["Base Color"])
    me.materials.append(m)
    o = bpy.data.objects.new("desk_written_page", me)
    scene.collection.objects.link(o)
    o.modifiers.new("paper", "SOLIDIFY").thickness = 0.0003 * M
    # the page's up (+y) toward the back of the desk (-x): the writer sits at +x
    # the leather inset stands 3.6 mm (scene) above TOP: clear it, or the inset cuts through the page
    o.location = (at[0], at[1], TOP + 0.0025 * M)
    o.rotation_euler = (0, 0, math.radians(90 + yaw_deg))
    return o


BOOK_SIZE = 1.5  # Hobu's books at this scale match the bookcase's: their long side 0.87 units
HOBU_BOOKS = ("Book1.1Blue.001", "Book1.1Yellow.001", "Book1.1Grey.001", "Book1Green.002", "Book1Red.002")
# the floor's stacks, on the rug in front of the bookcase's left end, low enough to take the wishlist
# on top: (x, y, the stack's yaw, how many books). They stand on the rug's pile (rug.TOP). Hobu's eight different books (each colour of each size)
# are drawn from at random, so no two stacks are copies.
FLOOR_STACKS = (
    (-2.86, -2.85, 8.0, 5),
    (-1.95, -1.71, -22.0, 5),
)
RUG_TOP = 0.03
FLOOR_KINDS = ("Book1.1Blue_", "Book1.1Grey_", "Book1.1Red_", "Book1.1Yellow_", "Book1Blue_", "Book1Green_", "Book1Grey_", "Book1Red_")
FLOOR_SEED = 593


def dress_floor_books(scene, repo, seed=FLOOR_SEED):
    """Stacks of Hobu's books on the floor, at the bookcase's scale, laid one book at a time as a
    person stacks them: the bigger books low, every spine facing one of the stack's two ways, each a
    degree or two and a centimetre off the one below, and now and then one crosswise. Seeded, so a
    rebuild lays the same stacks. On each stack's top book stands `slot_wishlist_<n>`, where the page
    lays the wishlist: turned a quarter from that book, so the slot's x runs along its long side, the
    way a book lying flat on the page has its height along x. Returns the pivots, floor_books_<n>."""
    hobu = os.path.join(repo, ".cache", "sketchfab", "vintage_desk_assets", "vintage_desk_assets.glb")
    src = _keep(_import(hobu, scene), FLOOR_KINDS)
    _darken(src)
    rng = random.Random(seed)
    shapes = []
    for o in src:  # each book's own box, in its mesh's space, and its scale to scene units
        pts = [Vector(c) for c in o.bound_box]
        lo = Vector([min(p[i] for p in pts) for i in range(3)])
        hi = Vector([max(p[i] for p in pts) for i in range(3)])
        shapes.append((o, lo, hi, o.matrix_world.to_scale().x * M * BOOK_SIZE))
    roots = []
    for n, (x, y, yaw, count) in enumerate(FLOOR_STACKS):
        picks = [rng.choice(shapes) for _ in range(count)]
        picks.sort(key=lambda sh: -(sh[2].x - sh[1].x) * (sh[2].y - sh[1].y) * sh[3] ** 2 * rng.uniform(0.85, 1.2))
        piv = bpy.data.objects.new(f"floor_books_{n}", None)
        scene.collection.objects.link(piv)
        piv.location = (x, y, 0.0)
        z = RUG_TOP
        for k, (o, lo, hi, scale) in enumerate(picks):
            turn = 180.0 if rng.random() < 0.3 else 0.0
            if k >= 2 and rng.random() < 0.15:
                turn += 90.0
            a = math.radians(yaw + turn + rng.gauss(0.0, 2.5))
            at = Vector((x + rng.gauss(0.0, 0.03), y + rng.gauss(0.0, 0.03), z))
            foot = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
            b = o.copy()
            for col in o.users_collection:
                col.objects.link(b)
            b.parent = piv
            b.matrix_parent_inverse = Matrix.Translation((-x, -y, 0.0))  # cancels the pivot: the basis is the world
            b.matrix_basis = Matrix.Translation(at) @ Matrix.Rotation(a, 4, "Z") @ Matrix.Scale(scale, 4) @ Matrix.Translation(-foot)
            z += (hi.z - lo.z) * scale
        slot = bpy.data.objects.new(f"slot_wishlist_{n}", None)
        slot.empty_display_type = "ARROWS"
        slot.location = (at.x, at.y, z)
        slot.rotation_euler = (0.0, 0.0, a + math.pi / 2)
        slot["width"] = (hi.y - lo.y) * scale
        slot["depth"] = (hi.x - lo.x) * scale
        scene.collection.objects.link(slot)
        roots.append(piv)
    for o in src:
        bpy.data.objects.remove(o, do_unlink=True)
    return roots


def dress_desk(scene, repo, frame_build=None):
    sf = os.path.join(repo, ".cache", "sketchfab")
    ph = os.path.join(repo, ".cache", "polyhaven")
    hobu = os.path.join(sf, "vintage_desk_assets", "vintage_desk_assets.glb")
    roots = []

    # Hobu's books: the bottom five of the stack on his own desk, toned down
    objs = _keep(_import(hobu, scene), ("Book1.1Blue.001", "Book1.1Yellow.001", "Book1.1Grey.001", "Book1Green.002", "Book1Red.002"))
    _darken(objs)
    # at BOOK_SIZE, his books stand as tall as the bookcase's own (0.78 to 0.95 units)
    roots.append(_group("desk_books", objs, scene, (-7.12, -6.8), yaw_deg=12, size=BOOK_SIZE))  # off the dado rail at this size
    # his bronze inkwell, back centre, and the dip pen laid across the letter
    roots.append(_group("desk_inkwell", _keep(_import(hobu, scene), ("inkwell.001",)), scene, (-7.4, -5.75), yaw_deg=0))
    roots.append(_written_page(scene, os.path.join(repo, ".cache", "commons", "longfellow_1851", "letter_spread.jpg"), (-6.2, -5.45), yaw_deg=6))
    roots.append(_group("desk_pen", _keep(_import(hobu, scene), ("pen.001",)), scene, (-6.0, -5.38), yaw_deg=-25, z=TOP + 0.003 * M))
    # Portland Museum's sand blotter (pounce pot) from the Earl of Abergavenny wreck: 55 mm tall
    sb = _import(os.path.join(sf, "sand_blotter", "sand_blotter.glb"), scene)
    lo, hi = _box([o for o in sb if o.type == "MESH"])
    roots.append(_group("desk_sand_blotter", _keep(sb, ("Object",)), scene, (-7.3, -5.05), size=0.055 / max(hi - lo), stand=True))
    # Incg5764's letter sealed with wax, modelled about fifteen times too big: brought to 21 cm, laid
    # flat at the left, ready to post (the loose wax seal that lay here alone looked odd: the owner)
    lt = _import(os.path.join(sf, "letter_wax", "letter_wax.glb"), scene)
    lo, hi = _box([o for o in lt if o.type == "MESH"])
    roots.append(_group("desk_letter", _keep(lt, ("Object",)), scene, (-6.45, -6.45), yaw_deg=80, size=0.21 / max(hi - lo), lay_flat=True))
    # rikokenz's round spectacles, open, folded on their temples at the right
    sp = _keep(_import(os.path.join(sf, "round_glasses", "round_glasses.glb"), scene), ("Object",))
    _clear_lenses(sp)
    roots.append(_group("desk_spectacles", sp, scene, (-5.95, -4.85), yaw_deg=-70))
    # Poly Haven's pocket watch on its back, and three of its postcards turned address-side up
    roots.append(_group("desk_pocket_watch", _keep(_import(os.path.join(ph, "vintage_pocket_watch", "vintage_pocket_watch_2k.gltf"), scene), ("vintage_pocket_watch",)), scene, (-5.65, -4.45), yaw_deg=30, lay_flat=True))
    pc = _keep(_import(os.path.join(ph, "postcard_set_01", "postcard_set_01_2k.gltf"), scene), ("postcard_01", "postcard_06", "postcard_11"))
    for i, (o, (x, y, yaw)) in enumerate(zip(pc, ((-5.62, -6.95, 95), (-5.75, -6.8, 112), (-5.58, -6.7, 80)))):
        # laid flat this way the address side is up: the fronts are modern colour photographs
        roots.append(_group(f"desk_postcard_{i}", [o], scene, (x, y), yaw_deg=yaw, lay_flat=True, z=TOP + 0.002 * M + 0.0006 * M * i))
    # Hobu's world map pinned to the wall above the desk as a loose sheet, no frame (the owner's
    # call), two and a half times his size so it spans almost the desk (the owner's call again): its
    # desk curl pressed nearly flat against the wall, one brass tack at the top
    mp = _keep(_import(hobu, scene), ("World Map.001",))
    lo, hi = _box(mp)
    d, c = hi - lo, (lo + hi) / 2
    i = min(range(3), key=lambda k: d[k])
    ax = Vector((0, 0, 0))
    ax[i] = 1
    # its face from up to the room (+x), then its top from along the desk (+y) to up
    q = Quaternion((1, 0, 0), math.radians(90)) @ ax.rotation_difference(Vector((1, 0, 0)))
    R = Matrix.Translation(c) @ q.to_matrix().to_4x4() @ Matrix.Scale(0.12, 4, ax) @ Matrix.Translation(-c)
    for o in mp:
        o.matrix_world = R @ o.matrix_world
    # paper, not metal: Hobu's material reads metallic from a texture, and a bake records metal as
    # nearly black (it reflects rather than scatters; EEVEE hid it by mirroring the warm room)
    for o in mp:
        for m in o.data.materials:
            pb = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if m and m.use_nodes else None
            if pb:
                for link in list(pb.inputs["Metallic"].links):
                    m.node_tree.links.remove(link)
                pb.inputs["Metallic"].default_value = 0.0
    sheet = _group("map_above_desk", mp, scene, (LEFT_WALL_X + 0.012 * M, -5.415), size=2.5, z=3.8)
    roots.append(sheet)
    bpy.context.view_layer.update()
    # nothing of the curled sheet may pass into the wall (the owner saw corners through it): its
    # deepest point 6 mm proud of the paper on the wall
    pts = [o.matrix_world @ v.co for o in mp for v in o.data.vertices]
    sheet.location.x += (LEFT_WALL_X + 0.006 * M) - min(p.x for p in pts)
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ v.co for o in mp for v in o.data.vertices]
    # one brass tack at the top centre, the owner's call: on the sheet's face where it is
    ymid = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    ztop = max(p.z for p in pts)
    near = [p for p in pts if abs(p.y - ymid) < 0.04 * M and p.z > ztop - 0.05 * M]
    face_x = max(p.x for p in near) if near else max(p.x for p in pts)
    brass = bpy.data.materials.get("map_tack") or bpy.data.materials.new("map_tack")
    brass.use_nodes = True
    bp = brass.node_tree.nodes["Principled BSDF"]
    bp.inputs["Base Color"].default_value = (0.62, 0.44, 0.2, 1)
    bp.inputs["Metallic"].default_value = 1.0
    bp.inputs["Roughness"].default_value = 0.3
    me = bpy.data.meshes.new("map_tack")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=6, radius=0.007 * M)
    bmesh.ops.scale(bm, vec=(0.45, 1, 1), verts=bm.verts)   # a domed head, flat to the wall
    bm.to_mesh(me)
    bm.free()
    me.materials.append(brass)
    for f in me.polygons:
        f.use_smooth = True
    t = bpy.data.objects.new("map_tack", me)
    scene.collection.objects.link(t)
    t.location = (face_x + 0.001 * M, ymid, ztop - 0.025 * M)
    t.parent = sheet
    t.matrix_parent_inverse = sheet.matrix_world.inverted()
    return roots
