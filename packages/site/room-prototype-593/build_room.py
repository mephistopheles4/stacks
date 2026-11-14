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
ap.add_argument("--chair", choices=("blocks", "scripted", "import"), default="blocks")
ap.add_argument("--chair-file", default="", help="model to import for --chair import (.glb/.gltf/.fbx/.blend)")
ap.add_argument("--chair-yaw", type=float, default=0.0, help="degrees to turn an imported chair so it faces -y")
ap.add_argument("--chair-height", type=float, default=3.8, help="height an imported chair is scaled to")
ap.add_argument("--chair-recolour", action="store_true", help="paint an imported chair's fabric the room's red")
args = ap.parse_args(argv)
sys.path.insert(0, __import__("os").path.dirname(__file__))

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
shell.append(box("rug", (8.5, 5.5, 0.04), (2.2, -3.6, 0.02), M_RUG, bevel=0.015, rot=(0, 0, math.radians(-6))))

# The bookcase stand-in: casts the contact shadow during the bake, then goes.
proxy = box("bookcase_proxy", (CASE_W, CASE_D, CASE_H), (0, 0, CASE_H / 2), M_PROXY)

# ── the chair: one of three variants, to the right, angled toward the case ──
from chairs import build_chair  # noqa: E402  (sibling module, see sys.path below)

chair_parts = build_chair(args, M_RED, M_DARKWOOD, box, cyl)
chair = bpy.data.objects.new("chair_root", None)
scene.collection.objects.link(chair)
for p in chair_parts:
    if p.parent is None:
        p.parent = chair
chair.location = (5.2, -2.4, 0)
chair.rotation_euler = (0, 0, math.radians(-62))  # faces toward the bookcase and a little toward the viewer

# ── side table with two candles in glass, between chair and case ──────────
furn = []
tx, ty = 3.0, -0.9
furn.append(cyl("table_top", 0.75, 0.1, (tx, ty, 2.0), M_DARKWOOD, verts=32))
furn.append(cyl("table_stem", 0.09, 1.9, (tx, ty, 1.0), M_DARKWOOD, verts=12))
furn.append(cyl("table_foot", 0.45, 0.08, (tx, ty, 0.04), M_DARKWOOD, verts=24))
for i, (dx, dy, h) in enumerate(((-0.25, 0.1, 0.55), (0.25, -0.15, 0.38))):
    cx, cy = tx + dx, ty + dy
    furn.append(cyl(f"glass{i}", 0.19, h + 0.15, (cx, cy, 2.05 + (h + 0.15) / 2), M_GLASS, verts=20))
    furn.append(cyl(f"wax{i}", 0.13, h, (cx, cy, 2.05 + h / 2), M_WAX, verts=16))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.05, location=(cx, cy, 2.05 + h + 0.07))
    f = bpy.context.active_object
    f.name = f"flame{i}"
    f.scale = (1, 1, 2.0)
    f.data.materials.append(M_FLAME)
    furn.append(f)
    point_light(f"candle{i}", (cx, cy, 2.05 + h + 0.12), 6, (1.0, 0.6, 0.3), radius=0.03)

# ── the reading lamp: base behind the chair, arching over it ───────────────
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


def unwrap(o):
    """Lightmap UVs go in a layer of their own: an imported model's textures keep theirs for the bake."""
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    uvs = o.data.uv_layers
    if len(uvs) == 0:
        uvs.new(name="UVMap")
    for layer in uvs:
        layer.active_render = True
        break
    uvs.active = uvs.new(name="bake")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")


def bake_to(o, res):
    img = bpy.data.images.new(f"{o.name}_bake", res, res)
    for m in o.data.materials:
        nt = m.node_tree
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        n.name = "bake_target"
        nt.nodes.active = n
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bake = scene.render.bake
    bake.use_pass_direct = True
    bake.use_pass_indirect = True
    bake.use_pass_diffuse = True
    bake.use_pass_glossy = False  # view-dependent; a lightmap must not carry it
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
furn_obj = join("room_furniture", furn)
chair_obj = join("room_chair", chair_parts)
bpy.data.objects.remove(chair)
meshes = (shell_obj, furn_obj, chair_obj)
for o in meshes:
    unwrap(o)

baked = {}
for o in meshes:
    t0 = time.time()
    baked[o.name] = bake_to(o, args.res)
    print(f"[room] baked {o.name} ({len(o.data.polygons)} faces) at {args.res}² / {args.samples} spp in {time.time() - t0:.1f}s")

bpy.data.objects.remove(proxy)
for o in meshes:
    swap_to_baked(o, baked[o.name])
    baked[o.name].pack()

if args.save_blend:
    bpy.ops.wm.save_as_mainfile(filepath=args.save_blend)

# ── export ─────────────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="DESELECT")
for o in (*meshes, *slots):
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
