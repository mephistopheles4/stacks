"""PROTOTYPE for #593: a tall Art Nouveau bridge lamp for the reading corner, built in metres.

Our own design, in the spirit of a bridge lamp the owner liked: a lobed, ribbed bronze foot, a
barley-twist lower column, a plain upper stem with a knop and an acorn finial, an arm that rises
off the stem, arcs forward and turns down like a swan's neck, braced by scrolled ironwork, and a
fluted amber-glass tulip hanging from its end.

The lamp stands on the origin with its arm reaching toward -y. Every part is built in the lamp's
own space with an identity transform, so a join keeps object coordinates in metres.

The glass carries a per-vertex `glow` (brighter on each flute's ridge, and mid-height): the
material emits by it, and lets shadow rays through tinted amber, so the bulb inside lights the
room the colour of the shade.
"""
import math

import bmesh
import bpy
from mathutils import Vector

HEIGHT = 2.005  # the finial's tip
ARM_TIP = Vector((0.0, -0.615, 1.735))
SHADE_TOP = 1.665
SHADE_H = 0.29
BULB = Vector((0.0, -0.615, 1.56))

_coll = None


def _link(o):
    (_coll or bpy.context.scene.collection).objects.link(o)
    return o


def _smooth(x, e0=0.0, e1=1.0):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def _object(name, bm, mat, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    me.materials.append(mat)
    return _link(bpy.data.objects.new(name, me))


def _lathe(name, profile, mat, segs=48, centre=(0.0, 0.0), shape=None):
    """Spin (r, z) pairs round a vertical axis. A ring of radius 0 becomes a pole.
    shape(theta, z) scales the radius: lobes and ribs."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r == 0:
            rings.append([bm.verts.new((centre[0], centre[1], z))])
            continue
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            k = shape(a, z) if shape else 1.0
            ring.append(bm.verts.new((centre[0] + r * k * math.cos(a), centre[1] + r * k * math.sin(a), z)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1:
            for i in range(segs):
                bm.faces.new((a[0], b[(i + 1) % segs], b[i]))
        elif len(b) == 1:
            for i in range(segs):
                bm.faces.new((a[i], a[(i + 1) % segs], b[0]))
        else:
            for i in range(segs):
                j = (i + 1) % segs
                bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _object(name, bm, mat)


def _bezier(p0, p1, p2, p3, n):
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append(u ** 3 * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t ** 3 * p3)
    return out


def _tube(name, pts, radii, mat, sides=12, caps=True):
    """A round bar along a polyline, framed by parallel transport so it never twists."""
    bm = bmesh.new()
    pts = [Vector(p) for p in pts]
    tangents = []
    for i, p in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        tangents.append((b - a).normalized())
    ref = Vector((1, 0, 0)) if abs(tangents[0].x) < 0.9 else Vector((0, 1, 0))
    n = tangents[0].cross(ref).normalized()
    rings = []
    for i, (p, t) in enumerate(zip(pts, tangents)):
        if i:
            n = (n - t * n.dot(t)).normalized()
        b = t.cross(n)
        r = radii(i / (len(pts) - 1)) if callable(radii) else radii
        rings.append([bm.verts.new(p + r * (math.cos(2 * math.pi * k / sides) * n + math.sin(2 * math.pi * k / sides) * b))
                      for k in range(sides)])
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            j = (k + 1) % sides
            bm.faces.new((a[k], a[j], b[j], b[k]))
    if caps:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _object(name, bm, mat)


def _ball(name, centre, r, mat):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=r)
    bmesh.ops.translate(bm, vec=Vector(centre), verts=bm.verts)
    return _object(name, bm, mat)


# ── materials ─────────────────────────────────────────────────────────────
def _nodes(name):
    m = bpy.data.materials.new(name)
    if not m.node_tree:
        m.use_nodes = True
    return m, m.node_tree


def materials():
    M = {}
    # oil-rubbed bronze: dark patina, worn back to brass where hands and dusters reach (the
    # sharp edges and the twist's ridges, read off Cycles' pointiness)
    m, nt = _nodes("lamp_bronze")
    p = nt.nodes["Principled BSDF"]
    p.inputs["Metallic"].default_value = 1.0
    p.inputs["Roughness"].default_value = 0.42
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    tex = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 60.0
    noise.inputs["Detail"].default_value = 6.0
    add = nt.nodes.new("ShaderNodeMath")
    add.operation = "MULTIPLY_ADD"
    add.inputs[1].default_value = 0.08
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.50
    ramp.color_ramp.elements[0].color = (0.055, 0.034, 0.017, 1)
    ramp.color_ramp.elements[1].position = 0.58
    ramp.color_ramp.elements[1].color = (0.40, 0.26, 0.10, 1)
    nt.links.new(tex.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], add.inputs[0])
    nt.links.new(geo.outputs["Pointiness"], add.inputs[2])
    nt.links.new(add.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], p.inputs["Base Color"])
    M["bronze"] = m

    m, nt = _nodes("lamp_brass")
    p = nt.nodes["Principled BSDF"]
    p.inputs["Metallic"].default_value = 1.0
    p.inputs["Roughness"].default_value = 0.3
    p.inputs["Base Color"].default_value = (0.45, 0.30, 0.11, 1)
    M["brass"] = m

    # amber glass, lit from inside
    m, nt = _nodes("lamp_glass")
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    out = nt.nodes["Material Output"]
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "glow"
    strength = nt.nodes.new("ShaderNodeMath")
    strength.operation = "MULTIPLY"
    strength.inputs[1].default_value = 0.8
    # emission only: a diffuse term catches the bulb a hand's width away and bakes out to a
    # clipped cream; the glass is the light, so its glow alone is what the eye sees.
    # The colour is linear and the bake stores sRGB, which lifts it: (1, 0.42, 0.12) landed as
    # peach. This one lands near Tiffany amber, sRGB about (0.9, 0.55, 0.2).
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (1.0, 0.3, 0.035, 1)
    through = nt.nodes.new("ShaderNodeBsdfTransparent")
    through.inputs["Color"].default_value = (0.95, 0.55, 0.22, 1)
    path = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    # art glass is never even: a slow mottle through the sheet
    mottle = nt.nodes.new("ShaderNodeTexNoise")
    mottle.inputs["Scale"].default_value = 28.0
    mottle.inputs["Detail"].default_value = 3.0
    tc = nt.nodes.new("ShaderNodeTexCoord")
    span = nt.nodes.new("ShaderNodeMapRange")
    span.inputs["To Min"].default_value = 0.72
    span.inputs["To Max"].default_value = 1.2
    glow = nt.nodes.new("ShaderNodeMath")
    glow.operation = "MULTIPLY"
    nt.links.new(tc.outputs["Object"], mottle.inputs["Vector"])
    nt.links.new(mottle.outputs["Fac"], span.inputs["Value"])
    nt.links.new(attr.outputs["Fac"], glow.inputs[0])
    nt.links.new(span.outputs["Result"], glow.inputs[1])
    nt.links.new(glow.outputs[0], strength.inputs[0])
    nt.links.new(strength.outputs[0], emit.inputs["Strength"])
    nt.links.new(path.outputs["Is Shadow Ray"], mix.inputs["Fac"])
    nt.links.new(emit.outputs[0], mix.inputs[1])
    nt.links.new(through.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    M["glass"] = m

    m, nt = _nodes("lamp_bulb")
    p = nt.nodes["Principled BSDF"]
    p.inputs["Emission Color"].default_value = (1.0, 0.86, 0.62, 1)
    p.inputs["Emission Strength"].default_value = 8.0
    # the point light sits inside the bulb: shadow rays pass straight through it (a per-object
    # visibility flag would not survive the join into one mesh)
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    path = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(path.outputs["Is Shadow Ray"], mix.inputs["Fac"])
    nt.links.new(p.outputs[0], mix.inputs[1])
    nt.links.new(clear.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
    M["bulb"] = m
    return M


# ── parts ─────────────────────────────────────────────────────────────────
def base(M):
    """A cast foot: eight lobes at the rim that run up the dome as fading ribs."""
    profile = [(0.0, 0.0), (0.150, 0.0), (0.165, 0.004), (0.168, 0.012), (0.163, 0.020),
               (0.150, 0.026), (0.128, 0.034), (0.105, 0.046), (0.083, 0.062), (0.062, 0.078),
               (0.045, 0.092), (0.034, 0.104), (0.030, 0.112), (0.034, 0.118), (0.036, 0.124),
               (0.030, 0.130), (0.020, 0.134), (0.0, 0.134)]

    def lobes(a, z):
        w = 1.0 - 0.65 * _smooth(z, 0.026, 0.05) - 0.35 * _smooth(z, 0.08, 0.105)
        return 1 + 0.055 * math.cos(8 * a) * w

    return [_lathe("lamp_base", profile, M["bronze"], segs=96, shape=lobes)]


def column(M, r0=0.0135, amp=0.0045, pitch=0.11, z0=0.134, z1=0.96):
    """The barley twist: two strands winding round each other, eased round at each end."""
    segs, rings = 48, int((z1 - z0) / 0.004)
    bm = bmesh.new()
    grid = []
    for j in range(rings + 1):
        z = z0 + (z1 - z0) * j / rings
        ease = _smooth(z, z0, z0 + 0.025) * (1 - _smooth(z, z1 - 0.025, z1))
        row = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            r = r0 + amp * ease * math.cos(2 * (a - 2 * math.pi * z / pitch))
            row.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        grid.append(row)
    for a, b in zip(grid, grid[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((a[i], a[j], b[j], b[i]))
    parts = [_object("lamp_twist", bm, M["bronze"])]
    parts.append(_lathe("lamp_collar_low", [(0.0, 0.126), (0.022, 0.128), (0.025, 0.136), (0.021, 0.144),
                                            (0.017, 0.150), (0.0, 0.150)], M["bronze"], segs=32))
    parts.append(_lathe("lamp_collar_mid", [(0.0, 0.948), (0.019, 0.950), (0.025, 0.958), (0.027, 0.966),
                                            (0.022, 0.975), (0.015, 0.982), (0.014, 0.990), (0.019, 0.996),
                                            (0.019, 1.004), (0.0, 1.010)], M["bronze"], segs=32))
    # the plain upper stem: a knop at mid-height, a collar where the arm leaves, an acorn on top
    stem = [(0.0105, 1.005), (0.0105, 1.42), (0.016, 1.435), (0.019, 1.45), (0.016, 1.465),
            (0.0105, 1.48), (0.0105, 1.765), (0.015, 1.770), (0.0165, 1.80), (0.015, 1.830),
            (0.0105, 1.835), (0.0105, 1.90), (0.017, 1.905), (0.019, 1.915), (0.014, 1.925),
            (0.010, 1.930), (0.016, 1.940), (0.019, 1.955), (0.017, 1.970), (0.011, 1.985),
            (0.004, 1.998), (0.0, HEIGHT)]
    parts.append(_lathe("lamp_stem", stem, M["bronze"], segs=32))
    return parts


def arm_curve(n=60):
    return _bezier(Vector((0, -0.012, 1.80)), Vector((0, -0.22, 1.93)),
                   Vector((0, -0.56, 1.88)), ARM_TIP, n)


def arm(M):
    """Rises off the stem, arcs forward and turns down at its end, where the shade hangs."""
    pts = arm_curve()
    parts = [_tube("lamp_arm", pts, lambda s: 0.0085 - 0.002 * s, M["bronze"], sides=16)]
    parts.append(_ball("lamp_knuckle", ARM_TIP, 0.011, M["bronze"]))
    parts.append(_tube("lamp_drop", [ARM_TIP, Vector((0, ARM_TIP.y, SHADE_TOP + 0.02))], 0.006, M["brass"]))
    return parts


def _spiral(c, r0, r1, a0, turns, sense, n=80):
    """In the arm's plane (x = 0): (y, z) round centre c, from radius r0 at angle a0 inward."""
    out = []
    for i in range(n + 1):
        s = i / n
        a = a0 + sense * 2 * math.pi * turns * s
        r = r0 + (r1 - r0) * s ** 0.8
        out.append(Vector((0, c[0] + r * math.cos(a), c[1] + r * math.sin(a))))
    return out


def _z_at(pts, y):
    return min(pts, key=lambda p: abs(p.y - y)).z


STEM_R = 0.0105
BAR = 0.004  # the scrolls' round bar
BRACE_R = 0.0055


def brace_curve(n=60):
    """Leaves the stem running up it, then sweeps out to meet the arm."""
    y_end = -0.46
    return _bezier(Vector((0, -STEM_R - BRACE_R, 1.48)), Vector((0, -STEM_R - BRACE_R, 1.60)),
                   Vector((0, -0.14, 1.66)), Vector((0, y_end, _z_at(arm_curve(200), y_end) - 0.007)), n)


def scrolls(M):
    """The bracket under the arm, every piece touching another: a whiplash brace that runs up the
    stem and sweeps out to the arm, curling into a volute at its foot; a scroll that grows off
    the stem into the corner; and a scroll sized to fill the gap between arm and brace."""
    parts = []
    brace = brace_curve()
    parts.append(_tube("lamp_brace", brace, BRACE_R, M["bronze"], sides=10))
    # the brace's foot carries on down, then curls out and up into a volute
    foot = brace[0]
    r0 = 0.03
    parts.append(_tube("lamp_volute_low", _spiral((foot.y - r0, foot.z), r0, 0.004, 0.0, 1.3, -1),
                       BAR, M["bronze"], sides=8))
    arm = arm_curve(200)
    arm_r = 0.0085
    for spec in SCROLLS:
        parts += _s_scroll(spec, arm, arm_r, brace, M)
    # off the stem, curling up and out into the corner under the arm, collared to the stem
    for name, z, r0, turns, sense in CORNER:
        parts.append(_tube(name, _spiral((-STEM_R - BAR - r0, z), r0, 0.004, 0.0, turns, sense),
                           BAR, M["bronze"], sides=8))
        parts.append(_collar(f"{name}_collar", Vector((0, 0, z)), Vector((0, 0, 1)), STEM_R, M))
    return parts


# (name, arm contact y, its radius, turns, sense, brace contact y, its radius, turns, sense, tendril)
SCROLLS = [
    ("lamp_s1", -0.085, 0.034, 1.6, -1, -0.215, 0.030, 1.5, -1, True),
    ("lamp_s2", -0.265, 0.030, 1.5, 1, -0.355, 0.020, 1.3, 1, True),
    ("lamp_s3", -0.395, 0.016, 1.2, -1, -0.43, 0.010, 1.0, -1, False),
]
# (name, z on the stem, radius, turns, sense)
CORNER = [
    ("lamp_scroll_corner", 1.72, 0.030, 1.5, 1),
    ("lamp_scroll_stem", 1.62, 0.020, 1.4, -1),
]


def _rail_contact(rail, rail_r, y, r, up):
    """Where a spiral of radius r touches a rail from above (up) or below: its centre, and the
    angle on the spiral, in the (y, z) plane, that meets the rail."""
    i = min(range(len(rail)), key=lambda k: abs(rail[k].y - y))
    p, a, b = rail[i], rail[max(i - 1, 0)], rail[min(i + 1, len(rail) - 1)]
    t = (b - a).normalized()
    n = Vector((0, -t.z, t.y))
    if (n.z > 0) != up:
        n = -n
    contact = p + n * (rail_r + BAR)
    return contact + n * r, math.atan2(-n.z, -n.y), p, t


def _collar(name, p, t, rail_r, M):
    """A band wrapped round a rail where a scroll is welded to it."""
    u = Vector((1, 0, 0)) if abs(t.x) < 0.9 else Vector((0, 1, 0))
    v = t.cross(u).normalized()
    u = v.cross(t).normalized()
    ring = [p + (rail_r + 0.0004) * (math.cos(2 * math.pi * k / 16) * u + math.sin(2 * math.pi * k / 16) * v)
            for k in range(17)]
    # thin and tight: a round wire 2 mm proud read side-on as a hook
    return _tube(name, ring, 0.0013, M["bronze"], sides=6, caps=False)


def _leaf(name, base, direction, length, width, M):
    """An Art Nouveau leaf in the bracket's plane: a teardrop blade, thin as cast iron."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=1.0)
    d = Vector(direction).normalized()
    side = Vector((0, -d.z, d.y))
    for v in bm.verts:
        x, s, w = v.co.x, v.co.y, v.co.z  # x: thickness, s: along, w: across
        along = (s + 1) / 2
        across = w * width / 2 * (1 - 0.65 * along) * (0.4 + 0.6 * math.sin(math.pi * min(1.0, along * 1.1)))
        v.co = base + d * (along * length) + side * across + Vector((x * 0.0016, 0, 0))
    return _object(name, bm, M["bronze"])


def _s_scroll(spec, arm, arm_r, brace, M):
    name, ya, ra, ta, sa, yb, rb, tb, sb, tendril = spec
    i = min(range(len(arm)), key=lambda k: abs(arm[k].y - ya))
    arm_r = 0.0085 - 0.002 * i / (len(arm) - 1)  # the arm thins toward its tip (see arm())
    ca, aa, pa_rail, ta_rail = _rail_contact(arm, arm_r, ya, ra, up=False)
    cb, ab, pb_rail, tb_rail = _rail_contact(brace, BRACE_R, yb, rb, up=True)
    spa = _spiral((ca.y, ca.z), ra, 0.004, aa, ta, sa)
    spb = _spiral((cb.y, cb.z), rb, 0.004, ab, tb, sb)
    pa, pb = spa[0], spb[0]
    into_a = Vector((0, -sa * math.sin(aa), sa * math.cos(aa)))
    into_b = Vector((0, -sb * math.sin(ab), sb * math.cos(ab)))
    reach = 0.45 * (pb - pa).length
    spine = _bezier(pa, pa - into_a * reach, pb - into_b * reach, pb, 30)
    parts = [_tube(name, list(reversed(spa)) + spine[1:-1] + spb, BAR, M["bronze"], sides=8)]
    parts.append(_collar(f"{name}_collar_a", pa_rail, ta_rail, arm_r, M))
    parts.append(_collar(f"{name}_collar_b", pb_rail, tb_rail, BRACE_R, M))
    if tendril:
        # off the spine's middle: a curl one side, a leaf the other
        mid = spine[15]
        t = (spine[16] - spine[14]).normalized()
        n = Vector((0, -t.z, t.y))
        out = (t * math.cos(0.7) + n * math.sin(0.7)).normalized()
        r = 0.011
        tip = mid + out * 0.022
        c = tip + Vector((0, -out.z, out.y)) * r
        curl = _spiral((c.y, c.z), r, 0.003, math.atan2(tip.z - c.z, tip.y - c.y), 1.2, -1, n=40)
        parts.append(_tube(f"{name}_tendril", [mid, mid + out * 0.011, *curl], 0.0026, M["bronze"], sides=6))
        leaf_dir = (t * math.cos(0.8) - n * math.sin(0.8))
        parts.append(_leaf(f"{name}_leaf", mid, leaf_dir, 0.032, 0.013, M))
    return parts


def shade(M, flutes=14, segs=168, rows=72):
    """A fluted tulip of amber glass with petal tips at the hem."""
    bm = bmesh.new()
    glow = bm.verts.layers.float.new("glow")
    grid = []
    cy = ARM_TIP.y
    for j in range(rows + 1):
        t = j / rows
        row = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            f = (0.5 + 0.5 * math.cos(flutes * a)) ** 0.7
            r = 0.042 + 0.108 * math.sin(math.pi / 2 * t) ** 0.75 + 0.014 * _smooth(t, 0.8, 1.0)
            r *= 1 + 0.05 * (f - 0.5) * _smooth(t, 0.05, 0.35)
            z = SHADE_TOP - SHADE_H * t - 0.012 * f * _smooth(t, 0.9, 1.0)
            v = bm.verts.new((r * math.cos(a), cy + r * math.sin(a), z))
            v[glow] = (0.6 + 0.4 * f) * (0.75 + 0.25 * math.sin(math.pi * t))
            row.append(v)
        grid.append(row)
    for a_, b_ in zip(grid, grid[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((a_[i], b_[i], b_[j], a_[j]))
    o = _object("lamp_shade", bm, M["glass"])
    sol = o.modifiers.new("glass", "SOLIDIFY")
    sol.thickness = 0.003
    sol.offset = -1
    parts = [o]
    parts.append(_lathe("lamp_fitter", [(0.0, SHADE_TOP + 0.03), (0.009, SHADE_TOP + 0.028), (0.016, SHADE_TOP + 0.024),
                                        (0.034, SHADE_TOP + 0.014), (0.048, SHADE_TOP + 0.006),
                                        (0.050, SHADE_TOP - 0.004), (0.044, SHADE_TOP - 0.006), (0.0, SHADE_TOP - 0.006)],
                        M["brass"], segs=48, centre=(0.0, cy)))
    parts.append(_ball("lamp_bulb", BULB, 0.032, M["bulb"]))
    return parts


def build(collection=None, mats=None):
    global _coll
    _coll = collection
    M = mats or materials()
    parts = []
    for step in (base, column, arm, scrolls, shade):
        parts += step(M)
    return parts
