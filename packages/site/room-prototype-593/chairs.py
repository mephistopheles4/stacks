"""
PROTOTYPE for #593 — throwaway. The three chair variants the room can be built with.

Every variant is built in the chair's own frame: seat front facing -y, centred on
x, standing on z = 0, about 3.8 units (~1.2 m) tall. `build_room.py` parents the
parts to one root and places that in the room.

  blocks    the first pass: bevelled boxes and cylinders
  scripted  a button-tufted wingback made from subdivided cages (option 1)
  import    any downloaded model, normalised to the same frame (options 2 and 3)
"""
import math

import bmesh
import bpy
from mathutils import Vector


def build_chair(args, fabric, wood, box, cyl):
    if args.chair == "blocks":
        return _blocks(fabric, wood, box, cyl)
    if args.chair == "scripted":
        return _scripted(fabric, wood)
    return _imported(args, fabric)


# ── blocks: the first pass, unchanged ─────────────────────────────────────
def _blocks(fabric, wood, box, cyl):
    p = []
    p.append(box("seat", (2.5, 2.3, 0.55), (0, 0, 1.25), fabric, bevel=0.12))
    p.append(box("base", (2.6, 2.4, 0.7), (0, 0, 0.75), fabric, bevel=0.08))
    p.append(box("back", (2.6, 0.45, 2.6), (0, 1.0, 2.6), fabric, bevel=0.18))
    for s in (-1, 1):
        p.append(box(f"wing{s}", (0.35, 1.1, 1.5), (s * 1.25, 0.55, 3.1), fabric, bevel=0.15))
        p.append(box(f"arm{s}", (0.4, 2.3, 0.9), (s * 1.3, 0.05, 1.7), fabric, bevel=0.16))
        p.append(cyl(f"roll{s}", 0.3, 2.35, (s * 1.38, 0.0, 2.15), fabric, rot=(math.radians(90), 0, 0)))
        for fy in (-1, 1):
            p.append(cyl(f"leg{s}{fy}", 0.08, 0.45, (s * 1.1, fy * 1.0, 0.22), wood, verts=12))
    p.append(box("cushion", (2.2, 2.0, 0.3), (0, -0.1, 1.62), fabric, bevel=0.12))
    return p


# ── scripted: a button-tufted wingback ────────────────────────────────────
def _cage(name, size, loc, mat, cuts=6, deform=None, levels=2, rot=(0, 0, 0)):
    """A cube subdivided into a cage, optionally reshaped, smoothed by subdivision."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    o = bpy.context.active_object
    o.name = name
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=cuts, use_grid_fill=True)
    if deform:
        hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
        for v in bm.verts:
            # normalised coordinates in [-1, 1] for the deform to read
            n = Vector((v.co.x / hx, v.co.y / hy, v.co.z / hz))
            v.co = deform(v.co.copy(), n)
    bm.to_mesh(me)
    bm.free()
    o.location = loc
    o.rotation_euler = rot
    if levels:
        m = o.modifiers.new("subsurf", "SUBSURF")
        m.levels = levels
        m.render_levels = levels
    for poly in me.polygons:
        poly.use_smooth = True
    me.materials.append(mat)
    return o


def _lathe(name, profile, loc, mat, segments=20):
    """Spin a (radius, z) profile round the z axis: turned legs."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = [bm.verts.new((r * math.cos(a), r * math.sin(a), z))
                for a in (2 * math.pi * i / segments for i in range(segments))]
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(list(reversed(rings[0])))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    me.materials.append(mat)
    return o


def _piping(name, points, radius, mat):
    """A cord along a closed path: the welt on a cushion's edge."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    sp = cu.splines.new("POLY")
    sp.points.add(len(points) - 1)
    for p, co in zip(sp.points, points):
        p.co = (*co, 1)
    sp.use_cyclic_u = True
    o = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(o)
    cu.materials.append(mat)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target="MESH")
    return bpy.context.active_object


def _rounded_rect(cx, cy, z, w, d, r, steps=6):
    pts = []
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = cx + qx * (w / 2 - r), cy + qy * (d / 2 - r)
        for i in range(steps + 1):
            a = math.radians(a0 + 90 * i / steps)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a), z))
    return pts


def _scripted(fabric, wood):
    parts = []
    BACK_W, BACK_T = 2.5, 0.55
    SEAT_Z = 1.45  # top of the seat deck

    # Base and seat deck: one soft box, a little wider at the front.
    def flare_front(co, n):
        co.x *= 1 + 0.04 * (-n.y)
        return co
    parts.append(_cage("deck", (2.7, 2.5, 1.0), (0, -0.05, 0.95), fabric, deform=flare_front))

    # The back: arched (camel) top, a slight backward lean, tufted face.
    buttons = []
    for row, z in enumerate((2.25, 2.85, 3.45)):
        n = 4 if row % 2 == 0 else 3
        for i in range(n):
            x = (i - (n - 1) / 2) * 0.55
            buttons.append((x, z))

    def back_shape(co, n):
        # arch the top edge
        if n.z > 0:
            co.z += 0.35 * (1 - n.x ** 2) * ((n.z + 1) / 2) ** 3
        # pull the face in at every button: the dimples of the tufting
        if n.y < -0.5:
            for bx, bz in buttons:
                d2 = (co.x - bx) ** 2 + ((co.z + 2.75) - bz) ** 2
                co.y += 0.11 * math.exp(-d2 / 0.018)
        return co
    back = _cage("back", (BACK_W, BACK_T, 2.9), (0, 0.95, 2.75), fabric, cuts=22, deform=back_shape,
                 rot=(math.radians(-8), 0, 0))
    parts.append(back)
    # buttons, on the dimpled face, leaning with the back
    lean = math.radians(-8)
    for bx, bz in buttons:
        local = Vector((bx, -BACK_T / 2 + 0.09, bz - 2.75))
        local.rotate(back.rotation_euler)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.045, segments=12, ring_count=8,
                                             location=Vector((0, 0.95, 2.75)) + local)
        b = bpy.context.active_object
        b.scale = (1, 0.5, 1)
        b.data.materials.append(fabric)
        parts.append(b)

    # Wings: tall at the back, sweeping down and forward to meet the arms.
    def wing_shape(co, n):
        fwd = (1 - n.y) / 2  # 0 at the back, 1 at the front
        if n.z > -0.2:
            co.z -= 0.9 * fwd ** 1.6 * ((n.z + 0.2) / 1.2)
        co.x += 0.12 * (n.z + 1) / 2 * (1 if co.x >= 0 else -1) * 0  # kept flat: outward flare reads as a lump
        return co
    for s in (-1, 1):
        w = _cage(f"wing{s}", (0.32, 1.2, 1.9), (s * 1.2, 0.35, 3.05), fabric, cuts=8, deform=wing_shape,
                  rot=(0, 0, math.radians(-s * 6)))
        parts.append(w)

    # Arms: a panel with a rolled top and a scrolled front.
    for s in (-1, 1):
        parts.append(_cage(f"arm{s}", (0.42, 2.35, 0.75), (s * 1.3, -0.05, 1.75), fabric, cuts=4))
        bpy.ops.mesh.primitive_cylinder_add(radius=0.3, depth=2.3, vertices=24,
                                            location=(s * 1.36, -0.05, 2.2), rotation=(math.radians(90), 0, 0))
        roll = bpy.context.active_object
        roll.name = f"roll{s}"
        roll.modifiers.new("bevel", "BEVEL").width = 0.06
        for poly in roll.data.polygons:
            poly.use_smooth = True
        roll.data.materials.append(fabric)
        parts.append(roll)
        # the scroll: a disc proud of the roll's front, a little larger
        bpy.ops.mesh.primitive_cylinder_add(radius=0.34, depth=0.08, vertices=24,
                                            location=(s * 1.36, -1.22, 2.18), rotation=(math.radians(90), 0, 0))
        sc = bpy.context.active_object
        sc.name = f"scroll{s}"
        sc.modifiers.new("bevel", "BEVEL").width = 0.03
        sc.data.materials.append(wood)
        parts.append(sc)

    # Seat cushion with piping round its top edge.
    parts.append(_cage("cushion", (2.2, 2.05, 0.34), (0, -0.12, SEAT_Z + 0.15), fabric, cuts=4))
    parts.append(_piping("piping", _rounded_rect(0, -0.12, SEAT_Z + 0.3, 2.18, 2.03, 0.14), 0.035, fabric))

    # Turned legs, front a little taller and splayed.
    leg = [(0.07, 0.0), (0.09, 0.04), (0.06, 0.14), (0.1, 0.26), (0.12, 0.36), (0.12, 0.46)]
    for s in (-1, 1):
        for fy in (-1, 1):
            parts.append(_lathe(f"leg{s}{fy}", leg, (s * 1.12, fy * 1.0 - 0.05, 0.0), wood))
    return parts


# ── import: a downloaded model, normalised into the chair's frame ─────────
def _imported(args, fabric):
    before = set(bpy.data.objects)
    path = args.chair_file
    low = path.lower()
    if low.endswith((".glb", ".gltf")):
        bpy.ops.import_scene.gltf(filepath=path)
    elif low.endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path)
    elif low.endswith(".blend"):
        with bpy.data.libraries.load(path, link=False) as (src, dst):
            dst.objects = list(src.objects)
        for o in dst.objects:
            if o is not None:
                bpy.context.scene.collection.objects.link(o)
    else:
        raise SystemExit(f"cannot import {path}")
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    # flatten: keep world transforms, drop every empty and parent the import made
    bpy.context.view_layer.update()
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)

    # bounds of the whole model, then scale to height, centre, stand on z = 0
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    k = args.chair_height / (hi.z - lo.z)
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    root = bpy.data.objects.new("import_root", None)
    bpy.context.scene.collection.objects.link(root)
    for o in meshes:
        o.parent = root
        o.matrix_parent_inverse.identity()
        o.location = (o.location - centre)
    root.scale = (k, k, k)
    root.location = (0, 0, 0)
    root.rotation_euler = (0, 0, math.radians(args.chair_yaw))
    bpy.context.view_layer.update()
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    bpy.data.objects.remove(root)

    if args.chair_recolour:
        # paint whichever material covers the most faces: on an armchair, the fabric
        from collections import Counter
        count = Counter()
        for o in meshes:
            for poly in o.data.polygons:
                count[o.material_slots[poly.material_index].material if o.material_slots else None] += 1
        fabric_mat = count.most_common(1)[0][0]
        for o in meshes:
            for slot in o.material_slots:
                if slot.material is fabric_mat:
                    slot.material = fabric
    print(f"[room] imported {len(meshes)} meshes from {path}, scaled ×{k:.3f}")
    return meshes
