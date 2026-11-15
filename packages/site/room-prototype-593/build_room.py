"""
PROTOTYPE for #593 — throwaway. A rough reading-corner room, baked, exported as GLB.

Run (headless):
  blender -b --factory-startup -P packages/site/room-prototype-593/build_room.py -- \
      --out packages/site/public/room-prototype-593/room.glb --samples 128 --res 2048

Coordinates: 1 Blender unit = 1 shelf unit (~0.31 m). Blender is Z-up; the glTF
exporter maps Blender (x, y, z) to three (x, z, -y). The bookcase stands centred
on the origin, its back at three z = -0.36, so the wall is at Blender y = +0.42.

Two baked meshes come out: `room_shell` (floor, wall, skirting, rug) and
`room_furniture` (chair, table, candles, lamp), each with one baked atlas, so the
room costs two draws. A proxy box stands where the bookcase will be during the
bake, so the floor and wall carry its contact shadow, and is deleted before export.
Three empties mark the slots the brief's comments ask for.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--samples", type=int, default=128)
ap.add_argument("--res", type=int, default=2048)
ap.add_argument("--rows", type=int, default=4)
ap.add_argument("--save-blend", default="")
ap.add_argument("--chair", choices=("blocks", "scripted", "import", "hero"), default="blocks")
ap.add_argument("--chair-res", type=int, default=0, help="the chair's own atlas size (default: --res)")
ap.add_argument("--lightmaps", action="store_true",
                help="floor and rug: bake light only, and let the page lay their sharp textures over it")
ap.add_argument("--rug-photo", default="", help="with --lightmaps: the rug's own texture (rug_from_photo.py)")
ap.add_argument("--lamp", choices=("arc", "hero"), default="arc",
                help="hero: the bridge lamp of hero_lamp.py, behind the chair, lighting the room")
ap.add_argument("--table", choices=("drum", "polyhaven"), default="drum",
                help="polyhaven: Poly Haven's Side Table Tall 01 (CC0; fetch_textures.py --model side_table_tall_01)")
ap.add_argument("--candles", choices=("glass", "hero"), default="glass",
                help="hero: hero_candles.py's brass candlesticks and pillar, on the table top")
ap.add_argument("--table-file", default=os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".cache", "polyhaven",
    "side_table_tall_01", "side_table_tall_01_2k.gltf")))
ap.add_argument("--chair-faces", type=int, default=40000, help="hero: faces in the decimated chair that ships")
ap.add_argument("--chair-file", default="", help="model to import for --chair import (.glb/.gltf/.fbx/.blend)")
ap.add_argument("--chair-yaw", type=float, default=0.0, help="degrees to turn an imported chair so it faces -y")
ap.add_argument("--chair-height", type=float, default=3.8, help="height an imported chair is scaled to")
ap.add_argument("--chair-own-uv", action="store_true", help="bake an imported single-mesh chair into its own unwrap, not a new one")
ap.add_argument("--chair-recolour", action="store_true", help="paint an imported chair's fabric the room's red")
args = ap.parse_args(argv)
sys.path.insert(0, os.path.dirname(__file__))

ROW_HEIGHT = 1.12
CASE_W = 3.4 + 0.09 * 2
CASE_D = 0.72
CASE_H = args.rows * ROW_HEIGHT
WALL_Y = 0.42

# ── scene ──────────────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = args.samples
scene.view_settings.view_transform = "Standard"

prefs = bpy.context.preferences.addons["cycles"].preferences
for backend in ("OPTIX", "CUDA", "HIP", "ONEAPI"):
    try:
        prefs.compute_device_type = backend
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type != "CPU"]
        if gpus:
            for d in prefs.devices:
                d.use = True
            scene.cycles.device = "GPU"
            print(f"[room] baking on {backend}: {[d.name for d in gpus]}")
            break
    except TypeError:
        continue
else:
    print("[room] baking on CPU")

world = bpy.data.worlds.new("night")
scene.world = world
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.02, 0.016, 0.013, 1)
bg.inputs[1].default_value = 0.15


# ── materials ──────────────────────────────────────────────────────────────
def material(name, colour, rough=0.8, emit=None, emit_strength=0.0, sheen=0.0):
    m = bpy.data.materials.new(name)
    nt = m.node_tree if m.node_tree else None
    if nt is None:
        m.use_nodes = True
        nt = m.node_tree
    p = nt.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*colour, 1)
    p.inputs["Roughness"].default_value = rough
    if "Sheen Weight" in p.inputs:
        p.inputs["Sheen Weight"].default_value = sheen
    if emit is not None:
        p.inputs["Emission Color"].default_value = (*emit, 1)
        p.inputs["Emission Strength"].default_value = emit_strength
    return m


def floor_material():
    m = material("floor", (0.18, 0.09, 0.045), rough=0.55)
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    brick = nt.nodes.new("ShaderNodeTexBrick")
    brick.offset = 0.37
    brick.squash = 1.0
    brick.inputs["Color1"].default_value = (0.20, 0.10, 0.05, 1)
    brick.inputs["Color2"].default_value = (0.13, 0.065, 0.032, 1)
    brick.inputs["Mortar"].default_value = (0.04, 0.02, 0.01, 1)
    brick.inputs["Scale"].default_value = 0.35
    brick.inputs["Mortar Size"].default_value = 0.008
    brick.inputs["Brick Width"].default_value = 4.0
    brick.inputs["Row Height"].default_value = 0.55
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 3.0
    noise.inputs["Detail"].default_value = 8
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 0.35
    nt.links.new(coord.outputs["Object"], brick.inputs["Vector"])
    nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(brick.outputs["Color"], mix.inputs["A"])
    nt.links.new(noise.outputs["Color"], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], p.inputs["Base Color"])
    return m


def rug_material():
    m = material("rug", (0.25, 0.06, 0.05), rough=1.0, sheen=0.5)
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 1.2
    wave.inputs["Distortion"].default_value = 6
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.22, 0.04, 0.035, 1)
    ramp.color_ramp.elements[1].color = (0.10, 0.07, 0.04, 1)
    nt.links.new(coord.outputs["Object"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], p.inputs["Base Color"])
    return m


M_WALL = material("wall", (0.035, 0.05, 0.045), rough=0.9)
M_SKIRT = material("skirting", (0.03, 0.04, 0.036), rough=0.6)
M_FLOOR = floor_material()
M_RUG = rug_material()
M_RED = material("chair_fabric", (0.2, 0.014, 0.017), rough=0.95, sheen=1.0)
M_DARKWOOD = material("dark_wood", (0.06, 0.03, 0.015), rough=0.45)
M_BRASS = material("brass", (0.35, 0.24, 0.08), rough=0.35)
M_SHADE = material("shade", (0.55, 0.42, 0.25), rough=0.9, emit=(1.0, 0.62, 0.3), emit_strength=1.5)
M_WAX = material("wax", (0.85, 0.80, 0.70), rough=0.6)
M_FLAME = material("flame", (1, 0.6, 0.2), emit=(1.0, 0.55, 0.18), emit_strength=25)
M_GLASS = material("glass_frosted", (0.45, 0.32, 0.18), rough=0.3, emit=(1.0, 0.55, 0.2), emit_strength=0.6)
M_PROXY = material("proxy", (0.06, 0.035, 0.02), rough=0.7)


# ── geometry helpers ───────────────────────────────────────────────────────
def box(name, size, loc, mat, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        mod = o.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 4
    o.data.materials.append(mat)
    return o


def cyl(name, r, depth, loc, mat, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    return o


def point_light(name, loc, watts, colour, radius=0.1):
    d = bpy.data.lights.new(name, "POINT")
    d.energy = watts
    d.color = colour
    d.shadow_soft_size = radius
    o = bpy.data.objects.new(name, d)
    o.location = loc
    scene.collection.objects.link(o)
    return o


# ── the shell ──────────────────────────────────────────────────────────────
shell = []
shell.append(box("floor", (34, 22, 0.1), (0, WALL_Y - 11, -0.05), M_FLOOR))
shell.append(box("wall", (34, 0.1, 12), (0, WALL_Y + 0.05, 6), M_WALL))
shell.append(box("skirting", (34, 0.12, 0.45), (0, WALL_Y - 0.06, 0.225), M_SKIRT, bevel=0.02))
lit = []  # (object, extras): light-only bakes, textured on the page from what extras name
if args.lightmaps:
    import lightmaps
    import rug

    out_dir = os.path.dirname(os.path.abspath(args.out))
    floor = shell.pop(0)
    lit.append(lightmaps.floor(floor, WALL_Y, material, out_dir))
    if args.rug_photo:
        lit += rug.rug(args.rug_photo, material, out_dir, (2.2, -3.6), math.radians(-6))
if not (args.lightmaps and args.rug_photo):
    shell.append(box("rug", (8.5, 5.5, 0.04), (2.2, -3.6, 0.02), M_RUG, bevel=0.015, rot=(0, 0, math.radians(-6))))

# The bookcase stand-in: casts the contact shadow during the bake, then goes.
proxy = box("bookcase_proxy", (CASE_W, CASE_D, CASE_H), (0, 0, CASE_H / 2), M_PROXY)

# ── the chair: one of three variants, to the right, angled toward the case ──
from chairs import build_chair  # noqa: E402  (sibling module, see sys.path below)

chair_parts = build_chair(args, M_RED, M_DARKWOOD, box, cyl)
chair = bpy.data.objects.new("chair_root", None)
scene.collection.objects.link(chair)
for p in chair_parts:
    root = p
    while root.parent:
        root = root.parent
    if root is not chair:
        root.parent = chair
chair.location = (5.2, -2.4, 0)
chair.rotation_euler = (0, 0, math.radians(-62))  # faces toward the bookcase and a little toward the viewer

def import_model(name, path, k, at):
    """A glTF model as one mesh in its own metres, centred and standing on its origin, placed by
    its object transform (scale k, at (x, y)) so its own UVs and textures come through intact."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    parts = [o for o in new if o.type == "MESH"]
    bpy.context.view_layer.update()
    for o in parts:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(parts) > 1:
        bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    vs = [v.co for v in o.data.vertices]
    lo = Vector([min(v[i] for v in vs) for i in range(3)])
    hi = Vector([max(v[i] for v in vs) for i in range(3)])
    shift = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    for v in o.data.vertices:
        v.co += shift
    o.scale = (k, k, k)
    o.location = (at[0], at[1], 0)
    bpy.context.view_layer.update()
    return o


# ── side table with two candles in glass, between chair and case ──────────
furn = []
table_obj = None
if args.table == "polyhaven":
    # Poly Haven "Side Table Tall 01" (CC0), 38 × 38 × 76 cm, square to the wall, clear of the
    # bookcase's end (x 1.79) and the chair's nearest edge (x 3.46)
    tx, ty = 2.7, -1.2
    table_obj = import_model("room_table", args.table_file, 3.11, (tx, ty))
    top = max((table_obj.matrix_world @ v.co).z for v in table_obj.data.vertices)
    print(f"[room] table: {len(table_obj.data.polygons)} faces, top at z {top:.2f}")
else:
    tx, ty = 3.0, -0.9
    furn.append(cyl("table_top", 0.75, 0.1, (tx, ty, 2.0), M_DARKWOOD, verts=32))
    furn.append(cyl("table_stem", 0.09, 1.9, (tx, ty, 1.0), M_DARKWOOD, verts=12))
    furn.append(cyl("table_foot", 0.45, 0.08, (tx, ty, 0.04), M_DARKWOOD, verts=24))
    top = 2.05
candle_parts = []
flame_marks = []
if args.candles == "hero":
    import hero_candles

    # built in metres round the table top's centre, scaled into room units like the lamp
    cspace = bpy.data.objects.new("candle_space", None)
    cspace.scale = (3.11, 3.11, 3.11)
    cspace.location = (tx, ty, top)
    scene.collection.objects.link(cspace)
    candle_parts = hero_candles.build()
    for o in candle_parts:
        o.parent = cspace
    bpy.context.view_layer.update()
    for i, f in enumerate(hero_candles.FLAMES):
        point_light(f"candle{i}", tuple(cspace.matrix_world @ f), 5, (1.0, 0.6, 0.3), radius=0.012)
    # the flames move on the page, so none is baked: each leaves an empty where it burns
    for o in [o for o in candle_parts if o.name.startswith("flame_")]:
        candle_parts.remove(o)
        bpy.data.objects.remove(o)
    for i, (root, h) in enumerate(hero_candles.FLAME_ROOTS):
        e = bpy.data.objects.new(f"flame_{i}", None)
        e.location = cspace.matrix_world @ root
        e["flame_h"] = round(h * 3.11, 4)
        e["seed"] = i
        scene.collection.objects.link(e)
        flame_marks.append(e)
    print(f"[room] hero candles: {len(candle_parts)} parts, {sum(len(o.data.polygons) for o in candle_parts)} faces")
for i, (dx, dy, h) in enumerate(((-0.25, 0.1, 0.55), (0.25, -0.15, 0.38)) if args.candles == "glass" else ()):
    cx, cy = tx + dx, ty + dy
    furn.append(cyl(f"glass{i}", 0.19, h + 0.15, (cx, cy, top + (h + 0.15) / 2), M_GLASS, verts=20))
    furn.append(cyl(f"wax{i}", 0.13, h, (cx, cy, top + h / 2), M_WAX, verts=16))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.05, location=(cx, cy, top + h + 0.07))
    f = bpy.context.active_object
    f.name = f"flame{i}"
    f.scale = (1, 1, 2.0)
    f.data.materials.append(M_FLAME)
    furn.append(f)
    point_light(f"candle{i}", (cx, cy, top + h + 0.12), 6, (1.0, 0.6, 0.3), radius=0.03)

# ── the reading lamp: base behind the chair, arching over it ───────────────
lamp_parts = []
if args.lamp == "hero":
    import hero_lamp

    # behind the chair's back and toward the wall, the arm reaching over the seat
    space = bpy.data.objects.new("lamp_space", None)
    k = 3.11  # scene units per metre
    space.scale = (k, k, k)
    space.location = (6.67, -0.94, 0)
    space.rotation_euler = (0, 0, math.radians(-45.4))
    scene.collection.objects.link(space)
    lamp_parts = hero_lamp.build()
    for o in lamp_parts:
        o.parent = space
    bpy.context.view_layer.update()
    bulb = space.matrix_world @ hero_lamp.BULB
    print(f"[room] hero lamp: {len(lamp_parts)} parts, {sum(len(o.data.polygons) for o in lamp_parts)} faces, "
          f"bulb at {tuple(round(c, 2) for c in bulb)} (three: x {bulb.x:.2f}, y {bulb.z:.2f}, z {-bulb.y:.2f})")
    # 1500 W clipped the rug's lightmap under the shade (99.9th pct 2.56 against 2.0)
    point_light("lamp_bulb", tuple(bulb), 1100, (1.0, 0.74, 0.5), radius=0.12)
    # a faint warm wash from above, so the far side is dim rather than black. The owner preferred
    # the room dark, lit in pools by the lamp and the candles: 2400 W over 20 units read too bright
    fill = bpy.data.lights.new("room_fill", "AREA")
    fill.energy, fill.size, fill.color = 450, 12, (1.0, 0.82, 0.62)
    fo = bpy.data.objects.new("room_fill", fill)
    fo.location = (2.0, -5.0, 11.5)
    scene.collection.objects.link(fo)
if args.lamp == "arc":
    lx, ly = 7.0, 0.0
    bulb = Vector((3.9, -1.9, 4.4))
    furn.append(cyl("lamp_foot", 0.5, 0.1, (lx, ly, 0.05), M_BRASS, verts=24))
    furn.append(cyl("lamp_pole", 0.06, 5.0, (lx, ly, 2.55), M_BRASS, verts=12))
    # arc: a chain of short segments from the pole top to above the bulb
    top = Vector((lx, ly, 5.05))
    end = bulb + Vector((0, 0, 0.75))
    ctrl = Vector((lx - 0.6, ly - 0.4, 6.0))
    prev = top
    for i in range(1, 11):
        t = i / 10
        pt = (1 - t) ** 2 * top + 2 * (1 - t) * t * ctrl + t ** 2 * end
        seg = pt - prev
        mid = (pt + prev) / 2
        c = cyl(f"arc{i}", 0.05, seg.length + 0.03, mid, M_BRASS, verts=10)
        c.rotation_mode = "QUATERNION"
        c.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(seg.normalized())
        furn.append(c)
        prev = pt
    bpy.ops.mesh.primitive_cone_add(radius1=0.85, radius2=0.3, depth=0.8, location=(bulb.x, bulb.y, bulb.z + 0.25), end_fill_type="NOTHING")
    shade = bpy.context.active_object
    shade.name = "shade"
    shade.modifiers.new("solid", "SOLIDIFY").thickness = 0.03
    shade.data.materials.append(M_SHADE)
    furn.append(shade)
    point_light("lamp_bulb", tuple(bulb), 900, (1.0, 0.72, 0.45), radius=0.25)

# ── slots: what the room tells the page about where things go ──────────────
def slot(name, loc, facing_deg, width, depth, height_limit):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "ARROWS"
    e.location = loc
    e.rotation_euler = (0, 0, math.radians(facing_deg))
    e["width"] = width
    e["depth"] = depth
    e["height_limit"] = height_limit
    scene.collection.objects.link(e)
    return e

slots = [
    slot("slot_bookcase", (0, 0, 0), 0, 6.4, CASE_D, 8.0),
    slot("slot_stacks", (-4.6, -1.6, 0), 15, 3.0, 2.0, 3.0),
    slot("slot_pile", (-2.6, -3.8, 0), -10, 2.0, 1.5, 1.5),
]


# ── bake ───────────────────────────────────────────────────────────────────
def apply_modifiers(objs):
    for o in objs:
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)


def join(name, objs):
    apply_modifiers(objs)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        # bake world transforms in before the join drops the parent
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    return o


def join_in_place(name, objs):
    """Join parts that share one parent without applying its transform: the mesh stays in the
    parts' own space (the hero chair's metres), so box-projected textures, whose blend follows the
    object-space normal, keep their axes. Applying the chair's 62° turn into the mesh streaked them."""
    apply_modifiers(objs)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
    o.name = name
    return o


def unwrap(o, reuse=False):
    """Lightmap UVs go in a layer of their own: an imported model's textures keep theirs for the bake.

    reuse copies the model's own unwrap instead of cutting a new one. Smart UV Project on a dense
    generated mesh (95k faces from TRELLIS.2) makes thousands of tiny islands whose margins leave
    the chair 2% of its atlas; the model's own non-overlapping unwrap used 64%."""
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    uvs = o.data.uv_layers
    if len(uvs) == 0:
        uvs.new(name="UVMap")
    for layer in uvs:
        layer.active_render = True
        break
    uvs.active = uvs.new(name="bake")  # starts as a copy of the active layer
    if reuse:
        return
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")


def unwrap_packed(o):
    """For the decimated hero chair: islands at one texel density, packed tight."""
    unwrap(o)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin=0.002)
    bpy.ops.object.mode_set(mode="OBJECT")


def make_low(high, faces):
    """A decimated copy of the high-resolution chair. It ships; the high one only lights it.
    Invisible to every ray, so it neither shadows the room nor the chair it is baked from."""
    low = high.copy()
    low.data = high.data.copy()
    scene.collection.objects.link(low)
    low.name = "room_chair"
    m = low.modifiers.new("decimate", "DECIMATE")
    m.ratio = min(1.0, faces / len(high.data.polygons))
    apply_modifiers([low])  # leaves low selected and active
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)  # world-unit cage
    for attr in ("visible_camera", "visible_diffuse", "visible_glossy", "visible_transmission",
                 "visible_volume_scatter", "visible_shadow"):
        setattr(low, attr, False)
    return low


def site_camera():
    """The page's default view (frameBookcase): the angle a glossy bake is seen from."""
    cd = bpy.data.cameras.new("site_camera")
    cd.sensor_fit = "VERTICAL"
    cd.angle_y = math.radians(40)
    cam = bpy.data.objects.new("site_camera", cd)
    cam.location = (0.57, -9.1, 2.33)
    cam.rotation_euler = (Vector((0, 0, 2.15)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam)
    return cam


def bake_from_high(low, high, res):
    """Light the high chair, record it on the low one. Glossy is kept, seen from the page's own
    camera: the leather's sheen and the brass's glints are most of what makes them read, and the
    view only orbits a little."""
    bake = scene.render.bake
    bake.use_selected_to_active = True
    # rays start this far outside the low surface; tufts sit up to ~0.04 m × 3.1 off it
    bake.cage_extrusion = 0.06
    bake.max_ray_distance = 0.18
    bake.use_pass_glossy = True
    bake.view_from = "ACTIVE_CAMERA"
    scene.camera = site_camera()
    img = bake_to(low, res, also_select=(high,))
    bake.use_selected_to_active = False
    bake.view_from = "ABOVE_SURFACE"
    return img


def bake_glossy(o, res):
    """The hero lamp: bronze and brass read by their glints, so glossy is kept, seen from the
    page's camera, as bake_from_high does for the chair."""
    bake = scene.render.bake
    bake.view_from = "ACTIVE_CAMERA"
    scene.camera = scene.camera or site_camera()
    img = bake_to(o, res, glossy=True)
    bake.view_from = "ABOVE_SURFACE"
    return img


def bake_to(o, res, also_select=(), glossy=False):
    img = bpy.data.images.new(f"{o.name}_bake", res, res)
    for m in o.data.materials:
        nt = m.node_tree
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        n.name = "bake_target"
        nt.nodes.active = n
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    for other in also_select:
        other.select_set(True)
    bpy.context.view_layer.objects.active = o
    bake = scene.render.bake
    bake.use_pass_direct = True
    bake.use_pass_indirect = True
    bake.use_pass_diffuse = True
    if not bake.use_selected_to_active:
        bake.use_pass_glossy = glossy  # view-dependent; only a seen-from-the-camera bake carries it
    bake.use_pass_transmission = False
    bake.use_pass_emit = True
    bake.margin = 8
    bpy.ops.object.bake(type="COMBINED")
    return img


def swap_to_baked(o, img):
    """One material, the baked image as base colour: the page draws it unlit."""
    m = bpy.data.materials.new(f"{o.name}_baked")
    if not m.node_tree:
        m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    nt.links.new(t.outputs["Color"], p.inputs["Base Color"])
    o.data.materials.clear()
    o.data.materials.append(m)
    for layer in [l for l in o.data.uv_layers if l.name != "bake"]:
        o.data.uv_layers.remove(layer)


import time

shell_obj = join("room_shell", shell)
furn_obj = join("room_furniture", furn) if furn else None  # empty when every piece is a hero
chair_obj = join_in_place("room_chair", chair_parts) if args.chair == "hero" else join("room_chair", chair_parts)
for c in chair.children:  # the hero's texture space must keep its place when the root goes
    mw = c.matrix_world.copy()
    c.parent = None
    c.matrix_world = mw
bpy.data.objects.remove(chair)
chair_high = None
if args.chair == "hero":
    chair_high = chair_obj
    chair_high.name = "room_chair_high"
    chair_obj = make_low(chair_high, args.chair_faces)
    print(f"[room] hero chair decimated {len(chair_high.data.polygons)} → {len(chair_obj.data.polygons)} faces")
lamp_obj = None
if lamp_parts:
    lamp_obj = join_in_place("room_lamp", lamp_parts)  # metres, scaled by its transform
    space = bpy.data.objects["lamp_space"]
    for c in space.children:
        mw = c.matrix_world.copy()
        c.parent = None
        c.matrix_world = mw
    bpy.data.objects.remove(space)
    print(f"[room] hero lamp joined: {len(lamp_obj.data.polygons)} faces")
candles_obj = None
if candle_parts:
    candles_obj = join_in_place("room_candles", candle_parts)
    for c in list(cspace.children):
        mw = c.matrix_world.copy()
        c.parent = None
        c.matrix_world = mw
    bpy.data.objects.remove(cspace)
meshes = ((shell_obj, chair_obj) + ((furn_obj,) if furn_obj else ()) + ((lamp_obj,) if lamp_obj else ())
          + ((table_obj,) if table_obj else ()) + ((candles_obj,) if candles_obj else ()))
for o in meshes:
    if (o is chair_obj and chair_high) or o is lamp_obj or o is candles_obj:
        unwrap_packed(o)
    else:
        # the Poly Haven table's own unwrap is non-overlapping: bake into it
        unwrap(o, reuse=(o is chair_obj and args.chair_own_uv) or o is table_obj)

baked = {}
for o in meshes:
    t0 = time.time()
    res = (args.chair_res or args.res) if o is chair_obj else args.res
    if o is chair_obj and chair_high:
        baked[o.name] = bake_from_high(o, chair_high, res)
    elif o is lamp_obj or o is table_obj or o is candles_obj:
        baked[o.name] = bake_glossy(o, res)
    else:
        baked[o.name] = bake_to(o, res)
    print(f"[room] baked {o.name} ({len(o.data.polygons)} faces) at {res}² / {args.samples} spp in {time.time() - t0:.1f}s")

for o, extras in lit:  # while the proxy still casts the bookcase's shadow
    t0 = time.time()
    part = o.name.removeprefix("room_")
    rel = f"light/{os.path.splitext(os.path.basename(args.out))[0]}-{part}.jpg"
    lightmaps.bake_light(o, 4096 if part == "floor" else 2048, os.path.join(out_dir, rel))
    lightmaps.finish(o, extras, rel)
    print(f"[room] baked light for {o.name} in {time.time() - t0:.1f}s")

bpy.data.objects.remove(proxy)
if chair_high:
    bpy.data.objects.remove(chair_high)
for o in meshes:
    swap_to_baked(o, baked[o.name])
    baked[o.name].pack()

if args.save_blend:
    bpy.ops.wm.save_as_mainfile(filepath=args.save_blend)

# ── export ─────────────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="DESELECT")
for o in (*meshes, *(o for o, _ in lit), *slots, *flame_marks):
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=args.out,
    export_format="GLB",
    use_selection=True,
    export_extras=True,
    export_lights=False,
    export_image_format="JPEG",
    export_jpeg_quality=85,
    export_yup=True,
)
print(f"[room] wrote {args.out}")
