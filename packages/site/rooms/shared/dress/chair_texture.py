"""#593: colour for the Smithsonian chair (CC0). Sketchfab's conversion of the scan carries only its
ORM and normal maps, no colour, and the Smithsonian's full-resolution mesh has none either (geometry
only, no UVs). So the colour is ours, from the museum's record and photographs: red walnut, its grain
running along each part and its carving dark, kept under the scan's own occlusion and normals; its
drop-in seat in a crimson silk damask (Poly Haven's floral_jacquard, recoloured), close-nailed in brass.
The seat itself is ours (chair_seat.py): the scan's own is cut away, so every face of the scan is wood.

texture_chair(root) works on every mesh under `root` (the chair's pivot), and returns the seat's
damask and the nails' brass for chair_seat.rebuild_seat."""
import os

import bpy

M = 3.11
from room_paths import INPUTS  # noqa: E402
PH = os.path.join(INPUTS, "polyhaven")


def _img(slug, name, colour=True):
    im = bpy.data.images.load(os.path.join(PH, slug, name), check_existing=True)
    if not colour:
        im.colorspace_settings.name = "Non-Color"
    return im


# The chair's shading reads the scan's own object space (mm) from two attributes, never the Object
# texture coordinate: build_room.py joins each group into one mesh with its transform applied, and
# Object coordinates would turn into scene units there, the grain and the damask with them.
CO, NO = "chair_co", "chair_no"


def store_coords(me):
    """Keep `me`'s object-space positions and normals as attributes, for the shading to read."""
    co = [0.0] * (3 * len(me.vertices))
    me.vertices.foreach_get("co", co)
    a = me.attributes.get(CO) or me.attributes.new(CO, "FLOAT_VECTOR", "POINT")
    a.data.foreach_set("vector", co)
    no = [0.0] * (3 * len(me.loops))
    me.corner_normals.foreach_get("vector", no)
    a = me.attributes.get(NO) or me.attributes.new(NO, "FLOAT_VECTOR", "CORNER")
    a.data.foreach_set("vector", no)


def _attr(nt, name):
    a = nt.nodes.new("ShaderNodeAttribute")
    a.attribute_type = "GEOMETRY"
    a.attribute_name = name
    return a


def _coords(nt):
    """The scan's object space, in mm: outputs["Vector"]."""
    return _attr(nt, CO)


def _vmath(nt, op, a, b=None):
    m = nt.nodes.new("ShaderNodeVectorMath")
    m.operation = op
    nt.links.new(a, m.inputs[0])
    if b is not None:
        nt.links.new(b, m.inputs[1])
    return m


def _boxed(nt, image, scale, colour=True):
    """`image` projected along the scan's three axes and blended by the face's normal, as a Box
    projection does, but in the stored object space: returns its colour socket."""
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (scale, scale, scale)
    nt.links.new(_coords(nt).outputs["Vector"], mp.inputs["Vector"])
    xyz = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(mp.outputs["Vector"], xyz.inputs["Vector"])
    # each axis's share of the normal, sharpened to the fourth power so the seams stay narrow
    ab = _vmath(nt, "ABSOLUTE", _attr(nt, NO).outputs["Vector"]).outputs["Vector"]
    sq = _vmath(nt, "MULTIPLY", ab, ab).outputs["Vector"]
    p4 = _vmath(nt, "MULTIPLY", sq, sq).outputs["Vector"]
    w = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(p4, w.inputs["Vector"])
    total = _vmath(nt, "DOT_PRODUCT", p4)
    total.inputs[1].default_value = (1.0, 1.0, 1.0)
    out = None
    for axis, (a, b) in (("X", ("Y", "Z")), ("Y", ("X", "Z")), ("Z", ("X", "Y"))):
        uv = nt.nodes.new("ShaderNodeCombineXYZ")
        nt.links.new(xyz.outputs[a], uv.inputs["X"])
        nt.links.new(xyz.outputs[b], uv.inputs["Y"])
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image
        nt.links.new(uv.outputs["Vector"], tex.inputs["Vector"])
        share = nt.nodes.new("ShaderNodeMath")
        share.operation = "DIVIDE"
        nt.links.new(w.outputs[axis], share.inputs[0])
        nt.links.new(total.outputs["Value"], share.inputs[1])
        sc = nt.nodes.new("ShaderNodeVectorMath")
        sc.operation = "SCALE"
        nt.links.new(tex.outputs["Color"], sc.inputs[0])
        nt.links.new(share.outputs["Value"], sc.inputs["Scale"])
        out = sc.outputs["Vector"] if out is None else _vmath(nt, "ADD", out, sc.outputs["Vector"]).outputs["Vector"]
    return out


# per face, which way the timber runs: up the legs, stiles and splat; across the crest rail; along
# each seat rail. Read off the scan's own axes (local z is up, local -y is the chair's front, units mm)
GRAIN_UP, GRAIN_ACROSS, GRAIN_DEEP = 0, 1, 2
CREST = 380  # local z above which the back is its crest rail
RAILS = (-150, -40)  # local z of the seat rails, below the drop-in seat
RED_WALNUT = ((0.03, 0.01, 0.006, 1), (0.12, 0.042, 0.02, 1), (0.26, 0.1, 0.05, 1))  # off the museum's photographs
PATINA = (0.012, 0.005, 0.003, 1)  # the near-black wax and dirt packed into every carved part
CRIMSON = ((0.13, 0.006, 0.018, 1), (0.48, 0.04, 0.055, 1))  # the damask's satin ground and its figure  # dark, mid, light


def _grain_axes(o):
    """Store each face's grain direction as the face attribute `grain`."""
    me = o.data
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    hx, hy = (max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    attr = me.attributes.get("grain") or me.attributes.new("grain", "FLOAT", "FACE")
    vals = []
    for p in me.polygons:
        x, y, z = p.center.x - cx, p.center.y - cy, p.center.z
        g = GRAIN_UP
        if z > CREST:
            g = GRAIN_ACROSS
        elif RAILS[0] < z < RAILS[1]:
            front_back, side = abs(y) > 0.75 * hy, abs(x) > 0.75 * hx
            if front_back and not side:
                g = GRAIN_ACROSS
            elif side and not front_back:
                g = GRAIN_DEEP
        vals.append(float(g))
    attr.data.foreach_set("value", vals)


def red_walnut(src):
    """The scan's own material, coloured: red walnut whose grain runs along each part (a procedural
    figure in the scan's millimetres, so nothing is projected across the carving), under the scan's
    occlusion and two centuries of wear."""
    m = bpy.data.materials.get("chair_red_walnut")
    if m:
        return m
    m = src.copy()
    m.name = "chair_red_walnut"
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tc = _coords(nt)
    grain = nt.nodes.new("ShaderNodeAttribute")
    grain.attribute_type = "GEOMETRY"
    grain.attribute_name = "grain"
    # turn each part's grain onto z, then one figure for all: x-grain about y, y-grain about x
    coords = []
    for rot in ((0, 0, 0), (0, 1.5708, 0), (1.5708, 0, 0)):
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Rotation"].default_value = rot
        nt.links.new(tc.outputs["Vector"], mp.inputs["Vector"])
        coords.append(mp.outputs["Vector"])
    vec = coords[0]
    for k in (1, 2):
        is_k = nt.nodes.new("ShaderNodeMath")
        is_k.operation = "COMPARE"
        is_k.inputs[1].default_value = float(k)
        is_k.inputs[2].default_value = 0.5
        nt.links.new(grain.outputs["Fac"], is_k.inputs[0])
        mv = nt.nodes.new("ShaderNodeMix")
        mv.data_type = "VECTOR"
        nt.links.new(is_k.outputs["Value"], mv.inputs["Factor"])
        nt.links.new(vec, mv.inputs["A"])
        nt.links.new(coords[k], mv.inputs["B"])
        vec = mv.outputs["Result"]

    def noise(scale, stretch, detail, distortion):
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (scale, scale, scale / stretch)
        nt.links.new(vec, mp.inputs["Vector"])
        n = nt.nodes.new("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = 1.0
        n.inputs["Detail"].default_value = detail
        n.inputs["Distortion"].default_value = distortion
        nt.links.new(mp.outputs["Vector"], n.inputs["Vector"])
        return n.outputs["Fac"]

    pores = noise(0.7, 40, 3, 0.2)  # the fine streaks of the open grain, a millimetre or so apart
    figure = noise(0.05, 12, 5, 1.2)  # the broad light and dark of the figure across a board
    blend = nt.nodes.new("ShaderNodeMix")
    blend.data_type = "FLOAT"
    blend.inputs["Factor"].default_value = 0.3
    nt.links.new(figure, blend.inputs["A"])
    nt.links.new(pores, blend.inputs["B"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.3, RED_WALNUT[0]
    els[1].position, els[1].color = 0.7, RED_WALNUT[2]
    mid = els.new(0.5)
    mid.color = RED_WALNUT[1]
    nt.links.new(blend.outputs["Result"], ramp.inputs["Fac"])
    out = _carved(nt, tc, ramp.outputs["Color"])
    # the scan's occlusion: the red channel of its ORM texture, where a Separate Color already reads it
    sep = next((n for n in nt.nodes if n.type == "SEPARATE_COLOR" and n.inputs[0].is_linked), None)
    if sep:
        out = _mix(nt, "MULTIPLY", out, sep.outputs[0], 1.0)
    out = _aged(nt, out)
    for link in list(p.inputs["Base Color"].links):
        nt.links.remove(link)
    nt.links.new(out, p.inputs["Base Color"])
    # a French polish over it: the glints the site-camera bake keeps are most of what reads as wood
    p.inputs["Coat Weight"].default_value = 0.6
    p.inputs["Coat Roughness"].default_value = 0.18
    return m


def _carved(nt, tc, colour):
    """The carved parts, nearly black in the museum's photographs: the paw feet, the acanthus on
    the front knees and the crest rail, by where they sit in the scan (local mm)."""
    xyz = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Vector"], xyz.inputs["Vector"])

    def band(src, lo, hi):  # 0 below lo, 1 above hi
        r = nt.nodes.new("ShaderNodeMapRange")
        r.interpolation_type = "SMOOTHSTEP"
        r.inputs["From Min"].default_value, r.inputs["From Max"].default_value = lo, hi
        nt.links.new(src, r.inputs["Value"])
        return r.outputs["Result"]

    def math(op, a, b):
        m = nt.nodes.new("ShaderNodeMath")
        m.operation = op
        nt.links.new(a, m.inputs[0])
        nt.links.new(b, m.inputs[1])
        return m.outputs[0]

    def below(src, lo, hi):  # 1 below lo, 0 above hi
        m = nt.nodes.new("ShaderNodeMath")
        m.operation = "SUBTRACT"
        m.inputs[0].default_value = 1.0
        nt.links.new(band(src, lo, hi), m.inputs[1])
        return m.outputs[0]

    z, y = xyz.outputs["Z"], xyz.outputs["Y"]
    feet = below(z, -400, -330)
    crest = band(z, 360, 400)
    knees = math("MULTIPLY", math("MULTIPLY", band(z, -230, -170), below(z, -80, -40)), below(y, -190, -150))
    mask = math("MAXIMUM", math("MAXIMUM", feet, crest), knees)
    weight = nt.nodes.new("ShaderNodeMath")
    weight.operation = "MULTIPLY"
    nt.links.new(mask, weight.inputs[0])
    weight.inputs[1].default_value = 0.8
    return _mix(nt, "MIX", colour, PATINA, weight.outputs[0])


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
    edges = _ramp(nt, geo.outputs["Pointiness"], 0.53, 0.6, 0.0, 0.25)
    colour = _mix(nt, "SCREEN", colour, (0.55, 0.32, 0.18, 1), edges)
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.samples = 16
    ao.inputs["Distance"].default_value = 0.08
    hollows = _ramp(nt, ao.outputs["AO"], 0.35, 0.95, 0.5, 0.0)
    colour = _mix(nt, "MULTIPLY", colour, (0.28, 0.2, 0.15, 1), hollows)
    tc = _coords(nt)
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 1.5
    nt.links.new(tc.outputs["Vector"], noise.inputs["Vector"])
    patch = _ramp(nt, noise.outputs["Fac"], 0.35, 0.65, 0.0, 0.25)
    return _mix(nt, "MULTIPLY", colour, (0.72, 0.62, 0.55, 1), patch)


def damask(scale):
    """The drop-in seat's modern silk damask, as the museum's photographs show it: a large floral
    figure in crimson on a darker satin ground. Poly Haven's floral_jacquard is the weave and the
    figure; its grey is read as a mask and recoloured."""
    m = bpy.data.materials.get("chair_seat_damask")
    if m:
        return m
    m = bpy.data.materials.new("chair_seat_damask")
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    slug = "floral_jacquard"
    bw = nt.nodes.new("ShaderNodeRGBToBW")
    nt.links.new(_boxed(nt, _img(slug, "diff.jpg"), scale), bw.inputs["Color"])
    figure = _ramp(nt, bw.outputs["Val"], 0.035, 0.1)
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, CRIMSON[0]
    els[1].position, els[1].color = 1.0, CRIMSON[1]
    nt.links.new(figure, ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], p.inputs["Base Color"])
    nt.links.new(_boxed(nt, _img(slug, "rough.jpg", False), scale), p.inputs["Roughness"])
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(_boxed(nt, _img(slug, "nor_gl.jpg", False), scale), nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], p.inputs["Normal"])
    p.inputs["Sheen Weight"].default_value = 0.1  # silk catches the light at a grazing angle; more reads as pink
    return m


def brass():
    """The upholstery nails' domed heads, close-nailed: old brass, a little dulled."""
    m = bpy.data.materials.get("chair_nail_brass")
    if m:
        return m
    m = bpy.data.materials.new("chair_nail_brass")
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (0.62, 0.42, 0.18, 1)
    p.inputs["Metallic"].default_value = 1.0
    p.inputs["Roughness"].default_value = 0.35
    return m


def texture_chair(root):
    meshes = [o for o in root.children_recursive if o.type == "MESH"]
    bpy.context.view_layer.update()
    for o in meshes:
        src = o.material_slots[0].material
        _grain_axes(o)
        store_coords(o.data)
        o.data.materials.clear()
        o.data.materials.append(red_walnut(src))
        for p in o.data.polygons:
            p.material_index = 0
    # texture scale: the scan's units to metres, then the damask's repeat, about 30 cm (the seat is
    # built in the same object space as the scan, so the one scale serves both)
    unit = meshes[0].matrix_world.to_scale().x / M
    return damask(unit / 0.3), brass()
