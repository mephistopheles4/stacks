"""PROTOTYPE for #593: a studio render of the hero chair, framed like the Met's photographs, to
compare against them round after round.

  blender -b --factory-startup -P packages/site/room-prototype-593/lookdev.py -- --out <png> [--view met] [--samples 96]

or, in a running Blender (the connector): exec this file, then run(out, view=...). It builds into
a scene of its own, "hero_lookdev", and clears only that scene.
"""
import argparse
import importlib
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import hero_chair  # noqa: E402

# camera position, target, lens (mm). "met" is the museum's three-quarter view, from the
# chair's right front, a little above the seat.
VIEWS = {
    "met": ((2.3, -3.28, 1.08), (0.0, 0.02, 0.55), 85),
    "front": ((0.0, -3.2, 0.85), (0.0, 0.0, 0.55), 85),
    "side": ((3.2, 0.2, 0.85), (0.0, 0.0, 0.55), 85),
    "back": ((-1.6, 2.8, 1.1), (0.0, 0.0, 0.6), 85),
    "tufting": ((0.45, -1.05, 0.95), (0.0, 0.28, 0.82), 85),
    "post": ((0.75, -0.9, 0.55), (0.3, -0.38, 0.45), 85),
    # the three places the first room bake showed gaps
    "corner": ((0.05, -0.95, 0.75), (0.25, -0.37, 0.37), 85),
    "slit": ((-0.05, -0.85, 0.62), (0.26, -0.33, 0.5), 85),
    "rollback": ((-0.05, -0.55, 1.2), (0.27, 0.08, 0.63), 85),
}


def _light(sc, name, loc, target, energy, size, color=(1.0, 0.97, 0.92)):
    d = bpy.data.lights.new(name, "AREA")
    d.energy, d.size, d.color = energy, size, color
    o = bpy.data.objects.new(name, d)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(o)


def _plane(sc, name, loc, rot, size, grey):
    bpy.ops.mesh.primitive_plane_add(size=size, location=loc, rotation=rot)
    o = bpy.context.active_object
    if o.name not in sc.collection.objects:
        sc.collection.objects.link(o)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (grey, grey, grey, 1)
    p.inputs["Roughness"].default_value = 0.8
    o.data.materials.append(m)
    return o


def run(out, view="met", samples=96, res=(900, 1125)):
    importlib.reload(hero_chair)
    sc = bpy.data.scenes.get("hero_lookdev") or bpy.data.scenes.new("hero_lookdev")
    if bpy.context.window:
        bpy.context.window.scene = sc
    for o in list(sc.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.orphans_purge(do_recursive=True)

    hero_chair.build(collection=sc.collection)

    # a seamless grey studio, like the museum's
    _plane(sc, "floor", (0, 0, 0), (0, 0, 0), 12, 0.32)
    _plane(sc, "backdrop", (0, 2.2, 3), (math.radians(90), 0, 0), 12, 0.28)
    _light(sc, "key", (-1.4, -2.2, 2.5), (0, 0, 0.6), 420, 1.6)
    _light(sc, "fill", (2.6, -0.8, 1.3), (0, 0, 0.6), 140, 2.2, (0.92, 0.95, 1.0))
    _light(sc, "rim", (0.8, 2.0, 2.1), (0, 0, 0.8), 220, 1.2)
    w = sc.world or bpy.data.worlds.new("lookdev_world")
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.2, 0.2, 0.21, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6

    loc, target, lens = VIEWS[view]
    cd = bpy.data.cameras.new("lookdev_cam")
    cd.lens = lens
    cam = bpy.data.objects.new("lookdev_cam", cd)
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(cam)
    sc.camera = cam

    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "OPTIX"
    sc.cycles.device = "GPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "AgX"
    for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
        try:
            sc.view_settings.look = look
            break
        except TypeError:
            pass
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True, scene=sc.name)
    faces = sum(len(o.data.polygons) for o in sc.objects if o.type == "MESH")
    return {"out": out, "faces": faces}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--view", default="met", choices=sorted(VIEWS))
    ap.add_argument("--samples", type=int, default=96)
    a = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    print("[lookdev]", run(os.path.abspath(a.out), a.view, a.samples))
