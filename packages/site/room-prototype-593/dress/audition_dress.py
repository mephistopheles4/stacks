"""#593: the audition's furniture, pictures, side walls and lights, set into build_room.py's room so
they are baked with it. Run by `build_room.py --dress audition_dress.py`; dress(scene, repo) returns
the meshes to join and bake, one atlas each.

The positions come from the owner's block-out (artifacts/layout-study.blend), as audition_study.py
reads them; the helpers beside this file (desk_dress, side_walls, chandelier, frames, throw,
chair_texture) are the same ones the audition runs.
"""
import math
import os

import bpy
from mathutils import Vector

M = 3.11
HERE = os.path.dirname(os.path.abspath(__file__))
FACE_CAP = 25000          # a quick bake: anything denser is decimated to this
SMALL_CAP = {"desk_sand_blotter": 4000}


def _helper(name):
    path = os.path.join(HERE, name + ".py")
    g = {"__name__": name, "__file__": path}
    exec(open(path, encoding="utf-8").read(), g)
    return g


def _import(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    bpy.context.view_layer.update()
    return [o for o in bpy.data.objects if o not in before]


def _bbox(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == "MESH" for c in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


def _drop(name):
    o = bpy.data.objects.get(name)
    if o:
        for c in list(o.children_recursive):
            bpy.data.objects.remove(c, do_unlink=True)
        bpy.data.objects.remove(o, do_unlink=True)


def _place(scene, box_name, path, fit="height", yaw=0.0, real=False, back_x=None):
    """audition_study.place: the model on the block-out box's foot, the box then removed."""
    box = bpy.data.objects[box_name]
    objs = _import(path)
    lo, hi = _bbox(objs)
    pivot = bpy.data.objects.new("P_" + box_name, None)
    scene.collection.objects.link(pivot)
    pivot.location = ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z)
    if back_x is not None:
        pivot.location.x = lo.x
    bpy.context.view_layer.update()
    for o in objs:
        if o.parent is None:
            mw = o.matrix_world.copy()
            o.parent = pivot
            o.matrix_world = mw
    k = M if real else box.dimensions.z / (hi - lo).z
    pivot.scale = (k, k, k)
    pivot.rotation_euler.z = math.radians(yaw)
    pivot.location = (box.location.x, box.location.y, box.location.z)
    if back_x is not None:
        pivot.location.x = back_x
    _drop(box_name)
    return objs


def _root(o):
    while o.parent:
        o = o.parent
    return o


# the pictures' flat paper (canvas, mount, wash lines) gets an atlas of its own: sharing one with the
# carved mouldings, the thousands of tiny ornament islands left the paintings a few pixels each
PICTURE_PARTS = ("_picture", "_mount", "_washline")
# a group's bake (build_room.py): "high" bakes it from the full scan, as the armchair is; "split"
# bakes its colour sharp in an atlas of its own and its light soft beside it, as the floor is; with
# neither it is one lit atlas, glossy seen from the site camera (metal keeps its sheen only there)
def _split(albedo, light, scale=2.0):
    return {"split": {"albedo": albedo, "light": light, "scale": scale}}


OPTS = {
    "room_pictures": _split(4096, 512, 4.0),     # the lit paintings reach 4
    "room_map": _split(2048, 512, 4.0),
    "room_desk_chair": {"high": True, "faces": 60000, "res": 4096},  # as the armchair: its own 4096
    "room_desk": _split(4096, 1024, 4.0),          # under the banker's lamp: light past 2 survives
    "room_desk_props": _split(4096, 1024, 4.0),
    # brass, glass and the watch read by their glints: one lit atlas, seen from the site camera
    "room_desk_glints": {"res": 2048},
    "room_chest": _split(4096, 1024),
    "room_shelf": _split(2048, 512),
    "room_globe": _split(2048, 512),
    "room_standins": {"res": 512},
}

GROUPS = (  # mesh name -> roots (by name or prefix) whose meshes it joins
    ("room_pictures", ()),
    # the map alone: packed among the mouldings' thousands of islands it got a sliver and baked black
    ("room_map", ("map_above_desk",)),
    ("room_desk_chair", ("P_L_desk_chair",)),
    ("room_walls", ("left_wall_dress", "right_wall_dress", "L_left_wall", "L_right_wall")),
    ("room_frames", ("F_",)),
    ("room_desk", ("P_L_desk", "P_L_plant")),
    ("room_desk_glints", ("P_L_oil_lamp", "desk_spectacles", "desk_pocket_watch", "desk_inkwell", "desk_pen")),
    ("room_desk_props", ("desk_",)),
    ("room_chest", ("P_L_basket", "throw")),
    ("room_shelf", ("P_L_clock", "P_encyclopedia")),
    ("room_globe", ("P_L_globe",)),
    ("room_standins", ("L_abandoned_shelf", "L_wishlist_stacks")),
    ("room_chandelier", ("chandelier",)),
)


def dress(scene, repo):
    PH = os.path.join(repo, ".cache", "polyhaven")
    SF = os.path.join(repo, ".cache", "sketchfab")
    before = set(bpy.data.objects)

    # the owner's block-out: its boxes give every position
    with bpy.data.libraries.load(os.path.join(repo, "artifacts", "layout-study.blend"), link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n.startswith("L_")]
    for o in dst.objects:
        if o is not None:
            scene.collection.objects.link(o)
    chest_yaw = math.degrees(bpy.data.objects["L_chair"].rotation_euler.z)
    # what build_room.py builds itself, and the bookcase (its proxy is build_room's)
    for n in ("L_rug", "L_chair", "L_side_table", "L_floor_lamp", "L_back_wall", "L_floor", "L_bookcase"):
        _drop(n)
    # the wishlist stacks and the abandoned shelf will be live; until then, dark wood stand-ins that
    # the clock and the encyclopedias can stand on
    wood = bpy.data.materials.new("standin_wood")
    wood.use_nodes = True
    wood.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.06, 0.03, 0.015, 1)
    wood.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.5
    for n in ("L_wishlist_stacks", "L_abandoned_shelf"):
        o = bpy.data.objects[n]
        o.data.materials.clear()
        o.data.materials.append(wood)
        for c in list(o.children):
            bpy.data.objects.remove(c, do_unlink=True)

    # ── the audition's furniture, as audition_study.py places it ──
    _place(scene, "L_plant", os.path.join(SF, "monstera", "monstera_1k.glb"))
    _place(scene, "L_desk", os.path.join(SF, "victorian_desk", "victorian_desk_2k.glb"), back_x=-7.86)
    for n in ("desk:polySurface1", "desk:polySurface12", "desk:polySurface13", "desk:polySurface18",
              "desk:polySurface19", "desk:polySurface20", "desk:polySurface25"):
        bpy.data.objects[n].location = (0, 0, 0)
        bpy.data.objects[n].rotation_quaternion = (1, 0, 0, 0)
    dm = bpy.data.materials["deskinitialShadingGroup1"]
    dp = next(n for n in dm.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    for link in list(dp.inputs["Alpha"].links):
        dm.node_tree.links.remove(link)
    dp.inputs["Alpha"].default_value = 1.0
    _place(scene, "L_desk_chair", os.path.join(SF, "chair_england_1750", "chair_4k.glb"), yaw=-90)
    _helper("chair_texture")["texture_chair"](bpy.data.objects["P_L_desk_chair"])
    _place(scene, "L_globe", os.path.join(SF, "globe_victorian", "globe_victorian_4k.glb"), yaw=200)
    _place(scene, "L_basket", os.path.join(PH, "treasure_chest", "treasure_chest_2k.gltf"), real=True, yaw=chest_yaw)
    chest = bpy.data.objects["P_L_basket"]
    chest.location += Vector((math.sin(chest.rotation_euler.z), -math.cos(chest.rotation_euler.z), 0)) * 0.35 * M
    bpy.context.view_layer.update()
    _helper("throw")["add_throw"](scene, chest, frames=45)
    _place(scene, "L_clock", os.path.join(PH, "mantel_clock_01", "mantel_clock_01_2k.gltf"), real=True, yaw=-90)
    _place(scene, "L_oil_lamp", os.path.join(SF, "bankers_lamp", "bankers_lamp_1k.glb"), real=True, yaw=0)
    bpy.data.objects["P_L_oil_lamp"].scale *= 1.15
    brass = next(n for n in bpy.data.materials["gold"].node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    brass.inputs["Base Color"].default_value = (0.62, 0.44, 0.2, 1)
    brass.inputs["Roughness"].default_value = 0.3
    shade = next(n for n in bpy.data.materials["glass"].node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    shade.inputs["Emission Color"].default_value = (0.05, 0.55, 0.12, 1)
    shade.inputs["Emission Strength"].default_value = 0.15
    frames = _helper("frames")
    frames["hang_all"](scene)
    for n in frames["HANG"]:
        _drop(n)
    dd = _helper("desk_dress")
    dd["dress_desk"](scene, repo)
    dd["_group"]("P_encyclopedia", dd["_keep"](dd["_import"](os.path.join(PH, "book_encyclopedia_set_01", "book_encyclopedia_set_01_2k.gltf"), scene), ("book_encyclopedia",)),
                 scene, (9.5, -4.5), yaw_deg=-90, z=2.8)
    _helper("side_walls")["dress_side_walls"](scene, os.path.join(repo, "packages", "site", "public", "room-prototype-593", "tex", "wallpaper-willow.webp"))
    _helper("chandelier")["hang_chandelier"](scene, repo, fill_off=False)

    # ── light: the chandelier replaces the overhead fill; the banker's lamp pools on the desk ──
    _drop("room_fill")
    bl = bpy.data.lights.new("bankers_lamp", "SPOT")
    bl.energy, bl.color, bl.shadow_soft_size, bl.spot_size, bl.spot_blend = 160, (1.0, 0.72, 0.42), 0.04, 2.4, 0.6
    blo = bpy.data.objects.new("bankers_lamp", bl)
    scene.collection.objects.link(blo)
    blo.location = (-7.2, -4.4, 3.26)

    # the page draws every baked mesh opaque, so baked glass hides what is behind it: the frames'
    # panes and the clock's face glass go
    for o in [o for o in bpy.data.objects if (o.name.endswith("_glass") and _root(o).name.startswith("F_"))
              or o.name.startswith("mantel_clock_01_glass")]:
        bpy.data.objects.remove(o, do_unlink=True)
    # the map ships opaque anyway; its torn-edge alpha only made the bake see through it
    for m in {s.material for o in bpy.data.objects["map_above_desk"].children_recursive for s in o.material_slots if s.material}:
        pb = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if m.use_nodes else None
        if pb:
            for link in list(pb.inputs["Alpha"].links):
                m.node_tree.links.remove(link)
            pb.inputs["Alpha"].default_value = 1.0

    # ── what bakes: every new visible mesh, single-user, decimated for a quick bake, grouped ──
    bpy.context.view_layer.update()
    new = [o for o in bpy.data.objects if o not in before and o.type == "MESH" and o.name in scene.objects
           and not o.hide_render]
    groups = {name: [] for name, _ in GROUPS}
    loose = []
    for o in new:
        r = _root(o).name
        if r.startswith("F_") and any(k in o.name for k in PICTURE_PARTS):
            groups["room_pictures"].append(o)
        else:
          for name, keys in GROUPS:
            if any(r == k or (k.endswith("_") and r.startswith(k)) or r.startswith(k + ".") for k in keys):
                groups[name].append(o)
                break
          else:
            loose.append(o.name)
        o.hide_viewport = False
        o.hide_set(False)
        if o.data.users > 1:
            o.data = o.data.copy()
        faces = len(o.data.polygons)
        cap = SMALL_CAP.get(r, FACE_CAP)
        if faces > cap and r != "P_L_desk_chair":  # the chair's high copy stays whole
            d = o.modifiers.new("quick", "DECIMATE")
            d.ratio = cap / faces
    if loose:
        print("[dress] not baked (no group):", sorted(loose))
    for name, objs in groups.items():
        print(f"[dress] {name}: {len(objs)} objects")
    return [(name, objs, OPTS.get(name, {})) for name, objs in groups.items()]
