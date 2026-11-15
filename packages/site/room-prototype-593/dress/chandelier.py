"""Poly Haven's Chandelier 03 (Kirill Sannikov, CC0) hung from the ceiling as the room's one fill light:
its wrapped rod shortened so it clears a standing head, its 18 flame bulbs glowing, a small warm
point light in each, and the faceless 'fill' area light turned off.

    exec(open("chandelier.py").read(), g); g["hang_chandelier"](scene, repo, (x, y))
"""
import bmesh
import bpy
from mathutils import Vector

M = 3.11
CEILING = 9.33      # scene units
ROD = (-0.42, -0.10)  # the wrapped rod in the model's own metres, below its ceiling cup


def _islands(bm):
    seen, out = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, isl = [v], []
        seen.add(v.index)
        while stack:
            a = stack.pop()
            isl.append(a)
            for e in a.link_edges:
                b = e.other_vert(a)
                if b.index not in seen:
                    seen.add(b.index)
                    stack.append(b)
        out.append(isl)
    return out


def _flame_mat():
    m = bpy.data.materials.get("chandelier_flame")
    if m:
        return m
    m = bpy.data.materials.new("chandelier_flame")
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (1.0, 0.78, 0.45, 1)
    p.inputs["Emission Color"].default_value = (1.0, 0.62, 0.28, 1)
    p.inputs["Emission Strength"].default_value = 12.0
    return m


def hang_chandelier(scene, repo, at=(-0.8, -4.5), shorten=0.24, watts=130.0, fill_off=True):
    """at: hung off the room's centre toward the desk, so it reaches Aristotle on the back wall's
    left end and still lights the chest and the storm on the right (the owner's pick)."""
    path = f"{repo}/.cache/polyhaven/Chandelier_03/Chandelier_03_2k.gltf"
    before = set(bpy.data.objects)
    w = bpy.context.window_manager.windows[0]
    with bpy.context.temp_override(window=w, scene=scene, view_layer=scene.view_layers[0]):
        bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    ch = next(o for o in new if o.type == "MESH")
    for o in new:
        if o is not ch:
            bpy.data.objects.remove(o, do_unlink=True)
    ch.parent = None
    ch.name = "chandelier"
    bm = bmesh.new()
    bm.from_mesh(ch.data)
    # the rod squeezed from 32 cm to 8: everything below it rises by `shorten`
    lo, hi = ROD
    for v in bm.verts:
        z = v.co.z
        if z < lo:
            v.co.z = z + shorten
        elif z < hi:
            v.co.z = hi + (z - hi) * ((hi - lo - shorten) / (hi - lo))
    # the flame bulbs: the 18 small 96-vertex islands standing in the candle sleeves
    flame = _flame_mat()
    ch.data.materials.append(flame)
    fi = len(ch.data.materials) - 1
    flames = []
    for isl in _islands(bm):
        if len(isl) != 96:
            continue
        xs = [v.co for v in isl]
        d = Vector((max(c.x for c in xs) - min(c.x for c in xs), max(c.y for c in xs) - min(c.y for c in xs),
                    max(c.z for c in xs) - min(c.z for c in xs)))
        if not (0.02 < d.x < 0.04 and 0.06 < d.z < 0.09):
            continue
        for v in isl:
            for f in v.link_faces:
                f.material_index = fi
        flames.append(sum(xs, Vector()) / len(xs))
    bm.to_mesh(ch.data)
    bm.free()
    ch.location = (at[0], at[1], CEILING)
    ch.rotation_euler = (0, 0, 0)
    ch.scale = (M,) * 3
    bpy.context.view_layer.update()
    # three shadowed lights for eighteen flames, each at the middle of a third of the ring: one light
    # per flame overflowed EEVEE's shadow pool (about 3,700 pages of 2,048), and a light whose pages
    # are dropped renders as fully shadowed, which is what blacked out the storm by the armchair
    import math
    groups = [[], [], []]
    for c in flames:
        groups[int(((math.atan2(c.y, c.x) + math.pi) / (2 * math.pi)) * 3) % 3].append(c)
    for i, g in enumerate(gr for gr in groups if gr):
        c = sum(g, Vector()) / len(g)
        ld = bpy.data.lights.new(f"chandelier_light_{i}", "POINT")
        ld.energy = watts * len(g)
        ld.color = (1.0, 0.68, 0.38)
        ld.shadow_soft_size = 0.06 * M
        lo_ = bpy.data.objects.new(f"chandelier_light_{i}", ld)
        scene.collection.objects.link(lo_)
        # above the flame bulbs' tips (+0.038): inside them, their own mesh shadows the light
        lo_.location = ch.matrix_world @ (c + Vector((0, 0, 0.06)))
        lo_.parent = ch
        lo_.matrix_parent_inverse = ch.matrix_world.inverted()
    # the drip pans render opaque and throw a shadow under every candle: clear glass instead
    gl = bpy.data.materials.get("Chandelier_03_glass")
    if gl and gl.use_nodes:
        p = next((n for n in gl.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if p:
            p.inputs["Alpha"].default_value = 0.3
            p.inputs["Transmission Weight"].default_value = 0.0
            p.inputs["Roughness"].default_value = 0.05
        gl.surface_render_method = "BLENDED"
        gl.use_transparent_shadow = True
    if fill_off:
        f = scene.objects.get("fill")
        if f:
            f.hide_render = True
            f.hide_viewport = True
    return ch, len(flames)
