"""#593: colour for the Smithsonian chair (CC0). Sketchfab's conversion of the scan carries only its
ORM and normal maps, no colour, so: walnut veneer box-projected and tinted to mahogany, kept under the
scan's own occlusion and normals; its drop-in seat in leather_red_02, the armchair's leather.

texture_chair(root) works on every mesh under `root` (the chair's pivot)."""
import os

import bpy

M = 3.11
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))  # the checkout, four folders up
PH = os.path.join(REPO, ".cache", "polyhaven")
SEAT_TOP = (1.33, 1.5)    # world z of the seat's upholstered top, in scene units (read off the scan)
SEAT_BAND = (1.18, 1.5)   # the seat's padded sides reach down to the rails


def _img(slug, name, colour=True):
    im = bpy.data.images.load(os.path.join(PH, slug, name), check_existing=True)
    if not colour:
        im.colorspace_settings.name = "Non-Color"
    return im


def _boxed(nt, image, scale, colour=True):
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (scale, scale, scale)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.projection = "BOX"
    tex.projection_blend = 0.25
    nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
    return tex


def mahogany(src, scale):
    """The scan's own material with colour added: walnut figure, tinted red-brown, under its occlusion."""
    m = bpy.data.materials.get("chair_mahogany")
    if m:
        return m
    m = src.copy()
    m.name = "chair_mahogany"
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    wood = _boxed(nt, _img("american_walnut_veneer", "diff.jpg"), scale)
    tint = nt.nodes.new("ShaderNodeMix")
    tint.data_type = "RGBA"
    tint.blend_type = "MULTIPLY"
    tint.inputs["Factor"].default_value = 1.0
    tint.inputs["B"].default_value = (0.62, 0.3, 0.2, 1)
    nt.links.new(wood.outputs["Color"], tint.inputs["A"])
    out = tint.outputs["Result"]
    # the scan's occlusion: the red channel of its ORM texture, where a Separate Color already reads it
    sep = next((n for n in nt.nodes if n.type == "SEPARATE_COLOR" and n.inputs[0].is_linked), None)
    if sep:
        ao = nt.nodes.new("ShaderNodeMix")
        ao.data_type = "RGBA"
        ao.blend_type = "MULTIPLY"
        ao.inputs["Factor"].default_value = 1.0
        nt.links.new(out, ao.inputs["A"])
        nt.links.new(sep.outputs[0], ao.inputs["B"])
        out = ao.outputs["Result"]
    out = _aged(nt, out)
    for link in list(p.inputs["Base Color"].links):
        nt.links.remove(link)
    nt.links.new(out, p.inputs["Base Color"])
    # a French polish over it: the glints the site-camera bake keeps are most of what reads as wood
    p.inputs["Coat Weight"].default_value = 0.6
    p.inputs["Coat Roughness"].default_value = 0.18
    return m


def _mix(nt, kind, a, b, factor):
    n = nt.nodes.new("ShaderNodeMix")
    n.data_type = "RGBA"
    n.blend_type = kind
    nt.links.new(a, n.inputs["A"])
    if isinstance(b, tuple):
        n.inputs["B"].default_value = b
    else:
        nt.links.new(b, n.inputs["B"])
    if isinstance(factor, float):
        n.inputs["Factor"].default_value = factor
    else:
        nt.links.new(factor, n.inputs["Factor"])
    return n.outputs["Result"]


def _ramp(nt, src, lo, hi, out_lo=0.0, out_hi=1.0):
    r = nt.nodes.new("ShaderNodeMapRange")
    r.inputs["From Min"].default_value, r.inputs["From Max"].default_value = lo, hi
    r.inputs["To Min"].default_value, r.inputs["To Max"].default_value = out_lo, out_hi
    nt.links.new(src, r.inputs["Value"])
    return r.outputs["Result"]


def _aged(nt, colour):
    """Two centuries of use, so the scan stops reading as one even colour: the finish worn pale on
    every edge a hand or a foot meets, grime packed into the carving's hollows, and the timber
    itself a little uneven from board to board. Cycles evaluates all three in the bake."""
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    edges = _ramp(nt, geo.outputs["Pointiness"], 0.53, 0.6, 0.0, 0.45)
    colour = _mix(nt, "SCREEN", colour, (0.55, 0.32, 0.18, 1), edges)
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.samples = 16
    ao.inputs["Distance"].default_value = 0.08
    hollows = _ramp(nt, ao.outputs["AO"], 0.35, 0.95, 0.75, 0.0)
    colour = _mix(nt, "MULTIPLY", colour, (0.28, 0.2, 0.15, 1), hollows)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 1.5
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    patch = _ramp(nt, noise.outputs["Fac"], 0.35, 0.65, 0.0, 0.5)
    return _mix(nt, "MULTIPLY", colour, (0.72, 0.62, 0.55, 1), patch)


def leather(scale):
    m = bpy.data.materials.get("chair_seat_leather")
    if m:
        return m
    m = bpy.data.materials.new("chair_seat_leather")
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    nt.links.new(_boxed(nt, _img("leather_red_02", "diff.jpg"), scale).outputs["Color"], p.inputs["Base Color"])
    nt.links.new(_boxed(nt, _img("leather_red_02", "rough.jpg", False), scale).outputs["Color"], p.inputs["Roughness"])
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(_boxed(nt, _img("leather_red_02", "nor_gl.jpg", False), scale).outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], p.inputs["Normal"])
    return m


def texture_chair(root):
    meshes = [o for o in root.children_recursive if o.type == "MESH"]
    bpy.context.view_layer.update()
    # the seat's footprint: the faces looking up at its top height
    xs, ys = [], []
    for o in meshes:
        mw, rot = o.matrix_world, o.matrix_world.to_3x3().normalized()
        for p in o.data.polygons:
            c = mw @ p.center
            if SEAT_TOP[0] < c.z < SEAT_TOP[1] and (rot @ p.normal).z > 0.8:
                xs.append(c.x)
                ys.append(c.y)
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    seats = 0
    for o in meshes:
        mw = o.matrix_world
        # texture scale: object units to metres, then a 0.6 m tile of veneer, a 0.5 m tile of leather
        unit = mw.to_scale().x / M
        src = o.material_slots[0].material
        o.data.materials.clear()
        o.data.materials.append(mahogany(src, unit / 0.6))
        o.data.materials.append(leather(unit / 0.5))
        for p in o.data.polygons:
            c = mw @ p.center
            seat = x0 <= c.x <= x1 and y0 <= c.y <= y1 and SEAT_BAND[0] < c.z < SEAT_BAND[1]
            p.material_index = 1 if seat else 0
            seats += seat
    return {"seat_faces": seats, "footprint": [round(v, 2) for v in (x0, x1, y0, y1)]}
