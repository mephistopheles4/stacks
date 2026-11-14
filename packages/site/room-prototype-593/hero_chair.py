"""PROTOTYPE for #593: the hero chair, rebuilt by script from the Met's "Easy Chair", c. 1852
(object 3492, public domain, https://www.metmuseum.org/art/collection/search/3492).

Everything is in metres, in the chair's own frame: seat front facing -y, centred on x, standing
on z = 0. The Met records it as 110.8 x 69.9 x 86.4 cm (H x W x D), walnut and ash; the four
museum photographs give the rest.

The upholstery is generated at bake resolution (about 3 mm), so buttons, pleats and puffs are
geometry and the bake sees them. build_room.py bakes this high-resolution chair onto a decimated
copy, the usual high-to-low game-art bake, so the page never downloads these faces.

    build(tex_dir) -> list of mesh objects

Materials are Cycles node trees over CC0 Poly Haven scans (fetch_textures.py); nothing here is
copied from anyone's model.
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.normpath(os.path.join(HERE, "..", "..", "..", ".cache", "polyhaven"))

# ── measurements, metres ─────────────────────────────────────────────────────
HEIGHT = 1.108
POST_X = 0.30                    # front post centre line
POST_W, POST_D = 0.085, 0.055    # front post section above the seat rail
POST_Y = -0.3725                 # front post centre; its front face is at -0.40
WALL_FRONT_Y = -0.345            # where the upholstery meets the back of the post
YC = 0.02                        # centre of the arc the arms make round the back
R_IN = 0.255                     # inside face of the arms
R_ROLL, ROLL_R, ROLL_Z = 0.30, 0.058, 0.655
RAIL_Z0, RAIL_Z1 = 0.27, 0.355   # front seat rail
SEAT_Z = 0.40                    # where the back's cushion starts
SEAT_BASE = 0.37                 # the seat cushion's mid-plane; its underside meets the rail
FOOT_Z = 0.06                    # top of the castor cup
WALL_Z0, WALL_Z1 = 0.30, 0.648   # outside wall, rail to just under the roll's widest point


def r_out(z):
    """The outside wall flares as it rises: a tub chair's bell. Its top stays just inside the
    roll's widest point, so the roll overhangs it."""
    t = max(0.0, min(1.0, (z - WALL_Z0) / (WALL_Z1 - WALL_Z0)))
    return 0.325 + 0.03 * t ** 1.7


# ── small helpers ────────────────────────────────────────────────────────────
_coll = None


def _link(o):
    (_coll or bpy.context.scene.collection).objects.link(o)
    return o


def _smoothstep(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _finish(name, bm, mat, smooth=True, recalc=True, weighted=False):
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
    me.materials.append(mat)
    o = _link(bpy.data.objects.new(name, me))
    if weighted:
        # large flat faces keep flat normals next to their bevels
        m = o.modifiers.new("weighted", "WEIGHTED_NORMAL")
        m.weight = 100
        m.keep_sharp = True
    return o


def _from_grid(name, rows, mat, wrap=False, flip=False, recalc=False):
    """rows: list of equal-length lists of points; quads between neighbours."""
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in row] for row in rows]
    n = len(rows[0])
    for j in range(len(rows) - 1):
        for i in range(n if wrap else n - 1):
            i2 = (i + 1) % n
            quad = (vs[j][i], vs[j][i2], vs[j + 1][i2], vs[j + 1][i])
            bm.faces.new(quad[::-1] if flip else quad)
    return _finish(name, bm, mat, recalc=recalc)


def _rbox(name, size, loc, mat, bevel=0.004, segs=3, taper=(1.0, 1.0), rot_z=0.0):
    """A box with rounded edges; taper scales its bottom face (x, y)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        x, y, z = v.co
        k = taper if z < 0 else (1.0, 1.0)
        v.co = Vector((x * size[0] * k[0], y * size[1] * k[1], z * size[2]))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=segs, profile=0.5,
                    affect="EDGES", clamp_overlap=True)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(loc) @ Matrix.Rotation(rot_z, 4, "Z"), verts=bm.verts)
    return _finish(name, bm, mat, weighted=True)


def _tube(name, pts, radius, mat, cyclic=False, radii=None, res=2, sides=None):
    """A round bead or rod along a polyline: carving, piping, scrolls."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for k, (p, q) in enumerate(zip(sp.points, pts)):
        p.co = (q[0], q[1], q[2], 1.0)
        if radii:
            p.radius = radii[k]
    sp.use_cyclic_u = cyclic
    cu.bevel_depth = radius
    cu.bevel_resolution = res
    cu.use_fill_caps = True
    tmp = _link(bpy.data.objects.new(name + "_curve", cu))
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    me.name = name
    me.materials.clear()
    me.materials.append(mat)
    me.shade_smooth()
    return _link(bpy.data.objects.new(name, me))


def _domes(name, frames, radius, squash, mat, segs=(12, 7)):
    """Many small domes in one mesh: buttons, nail heads. frames: (point, normal)."""
    bm = bmesh.new()
    for p, n in frames:
        rot = n.to_track_quat("Z", "Y").to_matrix().to_4x4()
        m = Matrix.Translation(p) @ rot @ Matrix.Diagonal((1.0, 1.0, squash, 1.0))
        bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1], radius=radius, matrix=m)
    return _finish(name, bm, mat)


# ── the plan: the U the arms make, front-left, round the back, front-right ───
_LS = YC - WALL_FRONT_Y


def path(q, r):
    """q in [0, 3]: 0-1 the left arm front to back, 1-2 the arc round the back, 2-3 the right arm.
    Returns the point (x, y), the outward normal and the arc length s from the front-left end."""
    if q <= 1:
        return (-r, WALL_FRONT_Y + q * _LS), (-1.0, 0.0), q * _LS
    if q <= 2:
        phi = math.pi * (2 - q)
        c, sn = math.cos(phi), math.sin(phi)
        return (r * c, YC + r * sn), (c, sn), _LS + (q - 1) * math.pi * r
    return (r, YC - (q - 2) * _LS), (1.0, 0.0), _LS + math.pi * r + (q - 2) * _LS


def path_length(r):
    return 2 * _LS + math.pi * r


def q_samples(step, r=R_ROLL):
    n1 = max(2, round(_LS / step))
    n2 = max(8, round(math.pi * r / step))
    return [i / n1 for i in range(n1)] + [1 + i / n2 for i in range(n2)] + [2 + i / n1 for i in range(n1 + 1)]


def _at(q, r, z, off=0.0):
    (x, y), (nx, ny), _ = path(q, r)
    return Vector((x + nx * off, y + ny * off, z))


# ── tufting: buttons, pleats and puffs as one displacement field ─────────────
class Tufts:
    """Depth below a pillow's surface at (x, y) in its own plane: each button pulls a mound down
    around it, and each pleat is a narrow fold between two buttons, deepest at its ends."""

    def __init__(self, buttons, pleats, mound_r=0.088, mound_d=0.04, crease_d=0.009, crease_w=0.006):
        self.buttons, self.pleats = buttons, pleats
        self.R, self.D, self.cd, self.cw = mound_r, mound_d, crease_d, crease_w
        self.cell = 0.05
        self.grid = {}
        for b in buttons:
            self._add(("b", b), b[0] - mound_r, b[1] - mound_r, b[0] + mound_r, b[1] + mound_r)
        reach = crease_w * 3.5
        for a, b, ea, eb in pleats:
            self._add(("p", (a, b, ea, eb)), min(a[0], b[0]) - reach, min(a[1], b[1]) - reach,
                      max(a[0], b[0]) + reach, max(a[1], b[1]) + reach)

    def _add(self, item, x0, y0, x1, y1):
        c = self.cell
        for i in range(math.floor(x0 / c), math.floor(x1 / c) + 1):
            for j in range(math.floor(y0 / c), math.floor(y1 / c) + 1):
                self.grid.setdefault((i, j), []).append(item)

    def __call__(self, x, y):
        items = self.grid.get((math.floor(x / self.cell), math.floor(y / self.cell)), ())
        mound = crease = 0.0
        for kind, d in items:
            if kind == "b":
                r = math.hypot(x - d[0], y - d[1])
                if r < self.R:
                    # steep into the button, rounding off into the puff. Summed, not maxed:
                    # the max of neighbouring dips draws ridges between buttons, a hexagon net
                    mound += self.D * (1 - r / self.R) ** 2.4
            else:
                (ax, ay), (bx, by), ea, eb = d
                vx, vy = bx - ax, by - ay
                L2 = vx * vx + vy * vy
                t = max(0.0, min(1.0, ((x - ax) * vx + (y - ay) * vy) / L2))
                dist = math.hypot(x - (ax + t * vx), y - (ay + t * vy))
                # a fold is pinched in at the buttons and all but fades mid-way
                end = ea * (1 - t) ** 3 + eb * t ** 3
                depth = self.cd * (0.15 + 0.85 * end)
                # a fold: a narrow valley between two slightly raised lips
                q = dist / self.cw
                fold = depth * (1.3 * math.exp(-q * q) - 0.3 * math.exp(-(q / 2.6) ** 2))
                crease = fold if abs(fold) > abs(crease) else crease
        mound = min(mound, self.D * 1.15)
        return mound + crease * (1 - 0.35 * mound / self.D)


def diamond(inside, x_span, rows, sx, sy, seam_y=None):
    """Buttons on a diamond lattice, the pleats joining diagonal neighbours, and pleats that run
    from the outermost buttons out to the edge, as real buttoning does. inside(x, y, margin)."""
    buttons = []
    for j, y in enumerate(rows):
        off = 0.5 * sx if j % 2 else 0.0
        k = -math.ceil(x_span / sx) - 1
        while k * sx + off <= x_span + sx:
            x = k * sx + off
            if inside(x, y, 0.055):
                buttons.append((x, y, j))
            k += 1
    pleats = []
    index = {(round(b[0], 4), b[2]): b for b in buttons}
    for x, y, j in buttons:
        for dx in (-0.5 * sx, 0.5 * sx):
            nb = index.get((round(x + dx, 4), j + 1))
            if nb:
                pleats.append(((x, y), (nb[0], nb[1]), 1.0, 1.0))
            else:
                # no neighbour above: the fold runs on out to the edge
                end = _march(inside, x, y, dx, sy)
                if end:
                    pleats.append(((x, y), end, 1.0, 0.0))
            if j == 0 and seam_y is not None:
                pleats.append(((x, y), (x + dx, seam_y), 1.0, 0.0))
            elif j == 0:
                end = _march(inside, x, y, dx, -sy)
                if end:
                    pleats.append(((x, y), end, 1.0, 0.0))
    if seam_y is not None:
        pleats.append(((-x_span - 0.1, seam_y), (x_span + 0.1, seam_y), 0.0, 0.0))
    return [(b[0], b[1]) for b in buttons], pleats


def _march(inside, x, y, dx, dy):
    n = math.hypot(dx, dy)
    ux, uy = dx / n, dy / n
    t = 0.0
    while t < 0.4:
        t += 0.004
        if not inside(x + ux * t, y + uy * t, 0.012):
            return (x + ux * t, y + uy * t)
    return None


# ── pillows: rounded cushions from an outline, a base surface and a profile ──
def _ellgrid(a, b):
    """Elliptical grid mapping: the square [-1, 1]² onto the unit disc, no poles."""
    return a * math.sqrt(max(0.0, 1 - b * b / 2)), b * math.sqrt(max(0.0, 1 - a * a / 2))


def _front_height(dm, rf, tuft, puff, x, y):
    """How far a pillow's front stands off its base at (x, y), dm in from its edge: the rounded
    edge, plus the puff, minus the tufting, both fading out toward the edge."""
    t = min(dm / rf, 1.0)
    h = rf * math.sqrt(1 - (1 - t) ** 2)
    if puff:
        h += puff(x, y) * _smoothstep(dm / (2.0 * rf))
    if tuft:
        h -= tuft(x, y) * _smoothstep(dm / (1.6 * rf))
    return h


def edge_distance(outline, x, y):
    """How far (x, y) lies inside a star-shaped outline, measured along its ray as pillow() does."""
    ox, oy = outline(math.atan2(y, x))
    R = math.hypot(ox, oy)
    return max(0.0, (1 - math.hypot(x, y) / R) * R)


def pillow(name, outline, base, hint, rf, rb, n, mat, tuft=None, puff=None):
    """A closed cushion. outline(phi) -> (x, y): its edge in its own plane (star-shaped round the
    origin). base(x, y) -> Vector: that plane placed in the chair, curved or leaning as needed.
    rf, rb: the radius of the rounded edge on the front and the back. tuft(x, y): depth pressed in
    on the front. puff(x, y): extra fullness on the front."""
    e = 1e-4
    front, back = [], []
    for j in range(n + 1):
        b = -1 + 2 * j / n
        rf_row, rb_row = [], []
        for i in range(n + 1):
            a = -1 + 2 * i / n
            dx, dy = _ellgrid(a, b)
            rho = min(1.0, math.hypot(dx, dy))
            phi = math.atan2(dy, dx)
            ox, oy = outline(phi)
            x, y = rho * ox, rho * oy
            dm = (1 - rho) * math.hypot(ox, oy)
            P = base(x, y)
            nrm = (base(x + e, y) - base(x - e, y)).cross(base(x, y + e) - base(x, y - e)).normalized()
            if nrm.dot(hint) < 0:
                nrm = -nrm
            hf = _front_height(dm, rf, tuft, puff, x, y)
            # leather is never perfectly taut: a faint low ripple, fading out at the edge
            hf += 0.0011 * noise.noise(Vector((x * 22.0, y * 22.0, 0.37))) * _smoothstep(dm / rf)
            t = min(dm / rb, 1.0)
            hb = rb * math.sqrt(1 - (1 - t) ** 2)
            rf_row.append(P + nrm * hf)
            rb_row.append(P - nrm * hb)
        front.append(rf_row)
        back.append(rb_row)
    bm = bmesh.new()
    vf = [[bm.verts.new(p) for p in row] for row in front]
    vb = [[bm.verts.new(p) for p in row] for row in back]
    for j in range(n):
        for i in range(n):
            bm.faces.new((vf[j][i], vf[j][i + 1], vf[j + 1][i + 1], vf[j + 1][i]))
            bm.faces.new((vb[j + 1][i], vb[j + 1][i + 1], vb[j][i + 1], vb[j][i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    return _finish(name, bm, mat)


def outline_superellipse(ax, top, bottom, p_top=2.4, p_bot=4.0, widen=0.0):
    def f(phi):
        c, s = math.cos(phi), math.sin(phi)
        p = p_top if s >= 0 else p_bot
        x = ax * math.copysign(abs(c) ** (2 / p), c) * (1 + widen * s)
        y = (top if s >= 0 else bottom) * math.copysign(abs(s) ** (2 / p), s)
        return x, y
    return f


def inside_outline(outline):
    def inside(x, y, margin):
        phi = math.atan2(y, x)
        ox, oy = outline(phi)
        R = math.hypot(ox, oy)
        return math.hypot(x, y) <= R - margin
    return inside


# ── materials ────────────────────────────────────────────────────────────────
def _img(nt, path, non_color, coords, blend=0.25):
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(path, check_existing=True)
    if non_color:
        t.image.colorspace_settings.name = "Non-Color"
    t.projection = "BOX"
    t.projection_blend = blend
    nt.links.new(coords, t.inputs["Vector"])
    return t


def _ramp(nt, src, stops):
    r = nt.nodes.new("ShaderNodeValToRGB")
    els = r.color_ramp.elements
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1.0)
    els[1].position, els[1].color = stops[-1][0], (*stops[-1][1], 1.0)
    for pos, col in stops[1:-1]:
        e = els.new(pos)
        e.color = (*col, 1.0)
    nt.links.new(src, r.inputs["Fac"])
    return r


_unit = 1.0  # scene units per metre, set by materials()


def _coords(nt, scale, vertical=False):
    """Object coordinates for box projection. vertical turns wood grain to run along z on every
    side face (a post's grain runs its length)."""
    tc = nt.nodes.new("ShaderNodeTexCoord")
    v = tc.outputs["Object"]
    if vertical:
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(v, sep.inputs[0])
        add = nt.nodes.new("ShaderNodeMath")
        add.operation = "ADD"
        nt.links.new(sep.outputs["X"], add.inputs[0])
        nt.links.new(sep.outputs["Y"], add.inputs[1])
        comb = nt.nodes.new("ShaderNodeCombineXYZ")
        nt.links.new(sep.outputs["Z"], comb.inputs["X"])
        nt.links.new(sep.outputs["Z"], comb.inputs["Y"])
        nt.links.new(add.outputs[0], comb.inputs["Z"])
        v = comb.outputs[0]
    m = nt.nodes.new("ShaderNodeMapping")
    m.inputs["Scale"].default_value = (scale, scale, scale)
    nt.links.new(v, m.inputs["Vector"])
    return m.outputs[0]


def _new_mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for node in list(nt.nodes):
        if node.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(node)
    p = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(p.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
    return m, nt, p


def _crevice(nt, distance, strength):
    """Cycles ambient occlusion as a mask: dirt and patina collect in creases."""
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.only_local = True
    ao.samples = 8
    ao.inputs["Distance"].default_value = distance * _unit
    r = _ramp(nt, ao.outputs["AO"], [(0.0, (1 - strength,) * 3), (1.0, (1.0, 1.0, 1.0))])
    return r.outputs["Color"]


def _mix(nt, a, b, blend="MULTIPLY", fac=1.0):
    m = nt.nodes.new("ShaderNodeMix")
    m.data_type = "RGBA"
    m.blend_type = blend
    m.inputs["Factor"].default_value = fac
    nt.links.new(a, m.inputs[6])
    nt.links.new(b, m.inputs[7])
    return m.outputs[2]


def materials(tex_dir=TEX, leather_rgb=((0.021, 0.0011, 0.0013), (0.095, 0.0058, 0.0052)), unit=1.0):
    """leather_rgb: the darkest and lightest linear colours the leather's grain is mapped onto,
    an oxblood. The ramps' end stops are each scan's measured 5th and 95th percentile luminance,
    so the whole of the grain lands between the two colours.

    unit: scene units per metre, for the crevice distances (Cycles' AO distance is in world units).
    Textures are projected in object coordinates, so a room that scales the chair keeps them in
    metres by never applying that scale to the high-resolution mesh."""
    global _unit
    _unit = unit
    lt = os.path.join(tex_dir, "leather_red_02")
    wd = os.path.join(tex_dir, "black_walnut_veneer_01")
    out = {}

    for key, worn in (("leather", True), ("leather_button", False)):
        # buttons get no edge wear: Pointiness reads a small dome as all edge, and paled them
        m, nt, p = _new_mat(f"hero_{key}")
        uv = _coords(nt, 4.5)
        diff = _img(nt, os.path.join(lt, "diff.jpg"), False, uv)
        rough = _img(nt, os.path.join(lt, "rough.jpg"), True, uv)
        nor = _img(nt, os.path.join(lt, "nor_gl.jpg"), True, uv)
        bw = nt.nodes.new("ShaderNodeRGBToBW")
        nt.links.new(diff.outputs["Color"], bw.inputs[0])
        col = _ramp(nt, bw.outputs[0], [(0.011, leather_rgb[0]), (0.085, leather_rgb[1])]).outputs["Color"]
        col = _mix(nt, col, _crevice(nt, 0.03, 0.55))
        if worn:
            # worn, lighter edges where the leather is stretched over a fold
            geo = nt.nodes.new("ShaderNodeNewGeometry")
            wear = _ramp(nt, geo.outputs["Pointiness"], [(0.5, (0, 0, 0)), (0.56, (1, 1, 1))])
            lerp = nt.nodes.new("ShaderNodeMix")
            lerp.data_type = "RGBA"
            nt.links.new(col, lerp.inputs[6])
            lerp.inputs[7].default_value = (0.2, 0.04, 0.03, 1.0)
            fade = nt.nodes.new("ShaderNodeMath")
            fade.operation = "MULTIPLY"
            nt.links.new(wear.outputs["Color"], fade.inputs[0])
            fade.inputs[1].default_value = 0.35
            nt.links.new(fade.outputs[0], lerp.inputs["Factor"])
            col = lerp.outputs[2]
        nt.links.new(col, p.inputs["Base Color"])
        rr = nt.nodes.new("ShaderNodeMapRange")
        rr.inputs["To Min"].default_value = 0.4
        rr.inputs["To Max"].default_value = 0.7
        nt.links.new(rough.outputs["Color"], rr.inputs["Value"])
        nt.links.new(rr.outputs[0], p.inputs["Roughness"])
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = 0.6
        nt.links.new(nor.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs[0], p.inputs["Normal"])
        p.inputs["Coat Weight"].default_value = 0.1
        p.inputs["Coat Roughness"].default_value = 0.3
        out[key] = m

    for key, vertical in (("walnut", False), ("walnut_v", True)):
        m, nt, p = _new_mat(f"hero_{key}")
        uv = _coords(nt, 1.6, vertical)
        diff = _img(nt, os.path.join(wd, "diff.jpg"), False, uv, blend=0.1)
        nor = _img(nt, os.path.join(wd, "nor_gl.jpg"), True, uv, blend=0.1)
        bw = nt.nodes.new("ShaderNodeRGBToBW")
        nt.links.new(diff.outputs["Color"], bw.inputs[0])
        # a dark, red-brown polished walnut; the scan is pale raw veneer, so only its figure is kept
        col = _ramp(nt, bw.outputs[0], [(0.245, (0.01, 0.0028, 0.0012)), (0.32, (0.03, 0.0095, 0.0036)),
                                        (0.379, (0.07, 0.025, 0.0095))]).outputs["Color"]
        col = _mix(nt, col, _crevice(nt, 0.012, 0.6))
        nt.links.new(col, p.inputs["Base Color"])
        p.inputs["Roughness"].default_value = 0.45
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = 0.35
        nt.links.new(nor.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs[0], p.inputs["Normal"])
        p.inputs["Coat Weight"].default_value = 0.45
        p.inputs["Coat Roughness"].default_value = 0.2
        out[key] = m

    m, nt, p = _new_mat("hero_brass")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 180.0
    base = _ramp(nt, noise.outputs["Fac"], [(0.3, (0.55, 0.36, 0.13)), (0.7, (0.78, 0.56, 0.25))]).outputs["Color"]
    nt.links.new(_mix(nt, base, _crevice(nt, 0.006, 0.75)), p.inputs["Base Color"])
    p.inputs["Metallic"].default_value = 1.0
    rr = _ramp(nt, noise.outputs["Fac"], [(0.3, (0.22,) * 3), (0.7, (0.4,) * 3)])
    nt.links.new(rr.outputs["Color"], p.inputs["Roughness"])
    out["brass"] = m

    m, nt, p = _new_mat("hero_iron")
    p.inputs["Base Color"].default_value = (0.02, 0.018, 0.016, 1.0)
    p.inputs["Metallic"].default_value = 0.5
    p.inputs["Roughness"].default_value = 0.55
    out["iron"] = m
    return out


# ── the parts ────────────────────────────────────────────────────────────────
def _back(M):
    """The balloon back: diamond-buttoned, leaning back, curved to hold the sitter."""
    lean = math.radians(11)
    bot, top = 0.36, 0.36
    outline = outline_superellipse(0.272, top, bot, p_top=2.3, p_bot=4.5, widen=0.07)

    def base(x, y):
        w = y + bot
        return Vector((x, 0.255 + w * math.sin(lean) - 0.55 * x * x, SEAT_Z + w * math.cos(lean)))

    inside = inside_outline(outline)
    rows = [-0.06 + 0.105 * j for j in range(5)]
    buttons, pleats = diamond(inside, 0.272, rows, 0.13, 0.105, seam_y=-0.15)
    tuft = Tufts(buttons, pleats)
    puff = lambda x, y: 0.022 * max(0.0, 1 - (x / 0.3) ** 2) ** 0.5
    o = pillow("back", outline, base, Vector((0, -1, 0.15)), 0.062, 0.045, 210, M["leather"], tuft, puff)

    # the buttons, sitting in their dimples
    frames = []
    e = 1e-4
    for x, y in buttons:
        if edge_distance(outline, x, y) < 0.062:
            # on the rim, where the cushion rolls over (measured along the outline's ray, which
            # overstates it at the sides): its dimple stays, no button
            continue
        P = base(x, y)
        nrm = (base(x + e, y) - base(x - e, y)).cross(base(x, y + e) - base(x, y - e)).normalized()
        if nrm.dot(Vector((0, -1, 0))) < 0:
            nrm = -nrm
        # the same height the cushion's own surface has there, its rounded edge included: the
        # outermost buttons used to float off the edge where it curves away
        h = _front_height(edge_distance(outline, x, y), 0.062, tuft, puff, x, y)
        frames.append((P + nrm * (h + 0.002), nrm))  # seated in the dimple, its dome standing proud
    return [o, _domes("back_buttons", frames, 0.0145, 0.6, M["leather_button"], segs=(16, 9))]


SEAT_A, SEAT_B, SEAT_P_FRONT = 0.268, 0.325, 10.0  # half-width, half-depth, front-corner squareness


def seat_front_y(x):
    """The seat's front edge at x: square enough at the corners to reach the posts."""
    t = min(1.0, abs(x) / SEAT_A)
    return -0.07 - SEAT_B * (1 - t ** SEAT_P_FRONT) ** (1 / SEAT_P_FRONT)


def _seat(M):
    outline = outline_superellipse(SEAT_A, SEAT_B, SEAT_B, p_top=SEAT_P_FRONT, p_bot=5.0)
    base = lambda x, y: Vector((x, -0.07 - y, SEAT_BASE))
    def puff(x, y):
        full = 0.018 * max(0.0, 1 - (x / 0.28) ** 2) * max(0.0, 1 - ((y - 0.05) / 0.36) ** 2)
        # where it has been sat in: a broad shallow dip toward the back, and creases fanning
        # forward from it
        dip = 0.011 * math.exp(-((x / 0.15) ** 2 + ((y + 0.06) / 0.17) ** 2))
        fan = 0.0018 * math.exp(-((y - 0.12) / 0.1) ** 2) * math.sin(x * 70.0 + 2.0 * math.sin(y * 9.0)) ** 8
        return full - dip - fan
    # a full rounded front edge above, a tight one below where the leather is nailed to the rail
    return [pillow("seat", outline, base, Vector((0, 0, 1)), 0.047, 0.015, 150, M["leather"], None, puff)]


def _arms(M):
    parts = []
    # inside: channels between vertical pleats, a button on each pleat
    sp = 0.088
    zs0, zs1 = 0.38, 0.625
    nz = 80
    # Past each end (q < 0, q > 3) the panel runs on 2 cm into the stile and turns outward, tacked
    # to the post: it used to stop at the post's back face, and its first channel curling inward
    # left a slit there.
    tuck = 0.06
    ends = [-tuck + tuck * i / 6 for i in range(6)]
    qs = ends + q_samples(0.003, R_IN) + [3 + tuck * i / 6 for i in range(1, 7)]
    L = path_length(R_IN)
    # Channels are laid out from each front end, so the two arms mirror each other; they meet
    # behind the back, where nobody sees the join. Buttons and their dimples stop where the arm
    # turns into the arc: past it, the back's cushion half hides them.
    n_buttons = int((_LS - 0.005) / sp)
    rows = []
    for k in range(nz + 1):
        u = k / nz
        row = []
        for q in qs:
            _, _, s = path(q, R_IN)
            s = abs(min(s, L - s))  # from the nearer front end
            # behind the back the roll steps outward (see the roll below); the panel's top follows
            # it up and out, under the roll, so no gap opens between them
            behind = _smoothstep((0.42 - abs(q - 1.5)) / 0.2)
            top = zs1 + 0.025 * behind
            z = zs0 + (top - zs0) * u
            vert = math.sin(math.pi * u) ** 0.45
            frac = (s % sp) / sp
            past = max(-q, q - 3, 0.0) / tuck  # 0 on the panel, 1 at the end of the tuck
            bulge = 0.017 * math.sin(math.pi * frac) ** 0.55 * vert * (past == 0)
            d = min(frac, 1 - frac) * sp
            buttoned = past == 0 and s < (n_buttons + 0.5) * sp
            dimple = 0.012 * math.exp(-((d / 0.014) ** 2 + ((z - 0.525) / 0.016) ** 2)) * buttoned
            out = 0.012 * _smoothstep(past) + 0.05 * behind * _smoothstep((u - 0.55) / 0.45)
            row.append(_at(q, R_IN, z, -(bulge - dimple) + out))
        rows.append(row)
    parts.append(_from_grid("arms_inside", rows, M["leather"]))
    frames = []
    for k in range(1, n_buttons + 1):
        for s in (k * sp, L - k * sp):
            q = _q_of_s(s, R_IN)
            (x, y), (nx, ny), _ = path(q, R_IN)
            frames.append((Vector((x - nx * 0.004, y - ny * 0.004, 0.525)), Vector((-nx, -ny, 0))))
    parts.append(_domes("arm_buttons", frames, 0.011, 0.55, M["leather_button"], segs=(16, 9)))

    # outside: one smooth stretched panel, gently full
    qs = q_samples(0.008)
    rows = []
    nz = 40
    for k in range(nz + 1):
        z = WALL_Z0 + (WALL_Z1 - WALL_Z0) * k / nz
        full = 0.004 * math.sin(math.pi * k / nz)
        rows.append([_at(q, r_out(z), z, full) for q in qs])
    parts.append(_from_grid("arms_outside", rows, M["leather"], flip=True))

    # the roll along the top, pleated across every 11 cm
    qs = q_samples(0.004)
    rows = []
    nt = 56
    for q in qs:
        _, _, s = path(q, R_ROLL)
        d = abs(((s + 0.055) % 0.11) - 0.055)
        groove = 0.0045 * math.exp(-((d / 0.007) ** 2))
        # behind the balloon back the roll slims and steps outward, so it wraps round the back's
        # base instead of cutting through its cushion
        behind = _smoothstep((0.42 - abs(q - 1.5)) / 0.2)
        rad = ROLL_R * (1 - 0.35 * behind)
        centre = R_ROLL + 0.035 * behind
        ring = []
        for k in range(nt):
            th = 2 * math.pi * k / nt
            rr = rad - groove * (0.6 + 0.4 * math.sin(th))
            (x, y), (nx, ny), _ = path(q, centre + rr * math.cos(th))
            ring.append(Vector((x, y, ROLL_Z + rr * math.sin(th))))
        rows.append(ring)
    parts.append(_from_grid("arm_roll", rows, M["leather"], wrap=True, recalc=True))

    # piping where the roll meets the outside wall, and up its front edges
    qs = q_samples(0.01)
    parts.append(_tube("piping_top", [_at(q, r_out(WALL_Z1) + 0.002, WALL_Z1 - 0.004) for q in qs], 0.0055, M["leather"]))
    for side, q in (("l", 0.0), ("r", 3.0)):
        pts = [_at(q, r_out(z) + 0.002, z) for z in [WALL_Z0 + (WALL_Z1 - WALL_Z0) * k / 30 for k in range(31)]]
        parts.append(_tube(f"piping_front_{side}", pts, 0.0055, M["leather"]))
    return parts


def _q_of_s(s, r):
    la = math.pi * r
    if s <= _LS:
        return s / _LS
    if s <= _LS + la:
        return 1 + (s - _LS) / la
    return 2 + (s - _LS - la) / _LS


def _nails(M):
    """Brass nail heads close-set along the leather's edges."""
    frames = []
    step = 0.0175
    z = WALL_Z0 + 0.007
    L = path_length(r_out(z))
    s = 0.012
    while s < L - 0.01:
        q = _q_of_s(s, r_out(z))
        (x, y), (nx, ny), _ = path(q, r_out(z))
        frames.append((Vector((x + nx * 0.001, y + ny * 0.001, z)), Vector((nx, ny, 0))))
        s += step
    for q in (0.0, 3.0):  # up the front edge of each outside wall, beside the post
        zz = WALL_Z0 + 0.026
        while zz < WALL_Z1 - 0.01:
            (x, _), (nx, ny), _ = path(q, r_out(zz))
            frames.append((Vector((x + nx * 0.001, WALL_FRONT_Y + 0.011, zz)), Vector((nx, ny, 0))))
            zz += step
    # along the seat's lower edge, where it is nailed over the front rail: on the leather itself,
    # following its corners round toward the posts and stopping at them
    x = -0.245
    e = 1e-4
    while x <= 0.2451:
        y = seat_front_y(x) + 0.004
        slope = (seat_front_y(x + e) - seat_front_y(x - e)) / (2 * e)
        nrm = Vector((slope, -1, 0.15)).normalized()
        frames.append((Vector((x, y, RAIL_Z1 + 0.007)), nrm))
        x += step
    return [_domes("nails", frames, 0.0058, 0.55, M["brass"], segs=(10, 6))]


def _quatrefoil(cx, cz, R, plane):
    """The union of four circles, as a closed outline. plane(u, v) -> Vector."""
    c, rr = R * 0.48, R * 0.52
    centres = [(c, 0), (-c, 0), (0, c), (0, -c)]
    pts = []
    for k in range(96):
        th = 2 * math.pi * k / 96
        d = (math.cos(th), math.sin(th))
        best = 0.0
        for ox, oy in centres:
            b = d[0] * ox + d[1] * oy
            disc = b * b - (ox * ox + oy * oy - rr * rr)
            if disc >= 0:
                best = max(best, b + math.sqrt(disc))
        pts.append(plane(cx + d[0] * best, cz + d[1] * best))
    return pts


def _post(M, side):
    """A front post: castor, tapered leg with a lancet panel, the quatrefoil block at the rail,
    the stile up the arm, and the scroll console the arm roll ends against."""
    x0 = side * POST_X
    W = M["walnut_v"]
    parts = []
    # leg: tapered, its top 6.0 x 5.5 cm, its foot 3.8 x 3.6
    parts.append(_rbox(f"leg_{side}", (0.06, 0.055, RAIL_Z0 - FOOT_Z), (x0, POST_Y, (RAIL_Z0 + FOOT_Z) / 2), W,
                       bevel=0.003, taper=(0.63, 0.65)))

    def front_y(z):
        t = (z - FOOT_Z) / (RAIL_Z0 - FOOT_Z)
        return POST_Y - (0.0179 + 0.0096 * t) - 0.0006

    lancet = []
    for k in range(13):
        z = FOOT_Z + 0.035 + (0.15 - 0.035) * k / 12
        lancet.append((-0.011, z))
    for k in range(1, 12):
        a = math.pi * k / 12
        lancet.append((-0.011 * math.cos(a), 0.15 + 0.03 * math.sin(a) ** 0.8))
    for k in range(13):
        z = 0.15 - (0.15 - FOOT_Z - 0.035) * k / 12
        lancet.append((0.011, z))
    parts.append(_tube(f"lancet_{side}", [Vector((x0 + u, front_y(z), z)) for u, z in lancet], 0.0022, W, cyclic=True))

    # the quatrefoil block, slightly proud of the post
    zb = (RAIL_Z0 + 0.375) / 2
    parts.append(_rbox(f"block_{side}", (0.09, 0.062, 0.375 - RAIL_Z0), (x0, POST_Y, zb), W, bevel=0.004))
    fy = POST_Y - 0.031 - 0.0008
    for R in (0.034, 0.022):
        parts.append(_tube(f"quatrefoil_{side}_{R}", _quatrefoil(x0, zb, R, lambda u, v: Vector((u, fy, v))), 0.0026, W, cyclic=True))
    fx = x0 + side * (0.045 + 0.0008)
    for R in (0.034, 0.022):
        parts.append(_tube(f"quatrefoil_side_{side}_{R}", _quatrefoil(POST_Y, zb, R, lambda u, v: Vector((fx, u, v))), 0.0026, W, cyclic=True))

    # stile, with a bead down its front
    z0, z1 = 0.375, 0.625
    parts.append(_rbox(f"stile_{side}", (POST_W, POST_D, z1 - z0), (x0, POST_Y, (z0 + z1) / 2), W, bevel=0.004))
    for u in (-0.03, 0.03):
        parts.append(_tube(f"stile_bead_{side}_{u}", [Vector((x0 + u, POST_Y - POST_D / 2 - 0.0005, z)) for z in (z0 + 0.01, z1 - 0.005)], 0.002, W))

    # scroll console: an ogee bracket swelling forward to carry the end of the roll
    parts += _console(M, x0)
    return parts


def _console(M, x0):
    W = M["walnut"]
    width = 0.118  # wide enough to close off the end of the arm roll
    SW = 0.042     # how far the swell carries forward
    prof = [(-0.345, 0.62), (-0.40, 0.62)]
    for k in range(1, 13):
        t = k / 12
        prof.append((-0.40 - SW * math.sin(t * math.pi / 2) ** 1.6, 0.62 + 0.072 * t))
    for k in range(1, 9):
        a = math.pi / 2 * k / 8
        prof.append((-0.40 - SW + 0.02 * (1 - math.cos(a)), 0.692 + 0.033 * math.sin(a)))
    prof.append((-0.345, 0.725))
    bm = bmesh.new()
    left = [bm.verts.new((x0 - width / 2, y, z)) for y, z in prof]
    right = [bm.verts.new((x0 + width / 2, y, z)) for y, z in prof]
    n = len(prof)
    bm.faces.new(left[::-1])
    bm.faces.new(right)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((left[i], left[j], right[j], right[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    sharp = [e for e in bm.edges if e.calc_face_angle(0) > math.radians(40)]
    bmesh.ops.bevel(bm, geom=sharp, offset=0.0035, segments=3, profile=0.5, affect="EDGES", clamp_overlap=True)
    parts = [_finish(f"console_{x0:+.2f}", bm, W, recalc=False, weighted=True)]

    # carving on its face: an acanthus leaf up the swell, opening at the top into two scrolls
    # that curl outward and down, as on the museum's chair
    def face_y(z):
        """The console's front face at height z: the ogee swell, then the rounded top."""
        if z <= 0.692:
            t = max(0.0, (z - 0.62) / 0.072)
            y = -0.40 - SW * math.sin(t * math.pi / 2) ** 1.6
        else:
            a = math.asin(min(1.0, (z - 0.692) / 0.033))
            y = -0.40 - SW + 0.02 * (1 - math.cos(a))
        return y - 0.0015

    stem_top = 0.704
    leaf = [Vector((x0, face_y(z), z)) for z in [0.628 + (stem_top - 0.628) * k / 24 for k in range(25)]]
    radii = [0.5 + 1.6 * math.sin(math.pi * (0.15 + 0.85 * k / 24)) for k in range(25)]
    parts.append(_tube(f"leaf_{x0:+.2f}", leaf, 0.0032, W, radii=radii))
    for s in (-1, 1):
        # side lobes of the leaf, angled out from its midrib
        lobe = [Vector((x0 + s * 0.012 * t ** 0.8, face_y(0.645 + 0.035 * t), 0.645 + 0.035 * t)) for t in [k / 10 for k in range(11)]]
        parts.append(_tube(f"lobe_{x0:+.2f}_{s}", lobe, 0.0022, W, radii=[1.2 - 0.7 * k / 10 for k in range(11)]))
        # the scroll: from the top of the leaf, out over and down, winding in
        cx, cz, r0 = x0 + s * 0.021, 0.699, 0.017
        spiral = []
        for k in range(80):
            th = 2.4 * math.pi * k / 79
            r = r0 * math.exp(-0.21 * th)
            a = math.pi / 2 - th  # starts at the top of its circle, turns outward and down
            u = cx + s * r * math.cos(a)
            v = cz + r * math.sin(a)
            spiral.append(Vector((u, face_y(v), v)))
        spiral.insert(0, Vector((x0, face_y(stem_top), stem_top)))
        parts.append(_tube(f"scroll_{x0:+.2f}_{s}", spiral, 0.0028, W,
                           radii=[1.3 - 0.6 * k / 80 for k in range(81)]))
        # the eye at the scroll's centre
        eye = [Vector((cx + 0.0035 * math.cos(2 * math.pi * k / 16), face_y(cz) - 0.001, cz + 0.0035 * math.sin(2 * math.pi * k / 16))) for k in range(16)]
        parts.append(_tube(f"eye_{x0:+.2f}_{s}", eye, 0.0018, W, cyclic=True))
    return parts


def _rails(M):
    W = M["walnut"]
    parts = [_rbox("front_rail", (2 * POST_X - POST_W + 0.004, 0.035, RAIL_Z1 - RAIL_Z0),
                   (0, POST_Y + 0.0025, (RAIL_Z0 + RAIL_Z1) / 2), W, bevel=0.003)]
    fy = POST_Y + 0.0025 - 0.0175 - 0.0008
    zc = (RAIL_Z0 + RAIL_Z1) / 2
    panel = [(-0.17, zc - 0.026), (0.17, zc - 0.026), (0.17, zc + 0.026), (-0.17, zc + 0.026)]
    pts = []
    for (ax, az), (bx, bz) in zip(panel, panel[1:] + panel[:1]):
        for k in range(20):
            t = k / 20
            pts.append(Vector((ax + (bx - ax) * t, fy, az + (bz - az) * t)))
    parts.append(_tube("rail_panel", pts, 0.0022, W, cyclic=True))
    for s in (-1, 1):
        circ = [Vector((s * 0.196 + 0.024 * math.cos(2 * math.pi * k / 48), fy, zc + 0.024 * math.sin(2 * math.pi * k / 48))) for k in range(48)]
        parts.append(_tube(f"rail_lunette_{s}", circ, 0.0022, W, cyclic=True))

    # the side and back rail: a curved band under the outside wall
    qs = q_samples(0.01)
    z0, z1 = 0.262, WALL_Z0 + 0.004
    ri, ro = 0.305, r_out(WALL_Z0) + 0.006
    rows = [[_at(q, ri, z0) for q in qs], [_at(q, ro, z0) for q in qs], [_at(q, ro, z1) for q in qs], [_at(q, ri, z1) for q in qs]]
    rows.append(rows[0])
    parts.append(_from_grid("side_rail", rows, W, recalc=True))
    return parts


def _back_leg(M, side):
    """Sabre leg: square, tapering, sweeping back and out to its castor."""
    # it rises into the back rail where the rail's arc passes 50° round from the side
    top = path(1 + 40 / 180, 0.318)[0]
    pts = []
    n = 24
    for k in range(n + 1):
        t = k / n
        pts.append(Vector((side * (abs(top[0]) + 0.06 * t), top[1] + 0.16 * t ** 1.7, 0.31 - (0.31 - FOOT_Z) * t)))
    rows = []
    for k, p in enumerate(pts):
        tan = (pts[min(k + 1, n)] - pts[max(k - 1, 0)]).normalized()
        sidev = Vector((1, 0, 0))
        up = tan.cross(sidev).normalized()
        sidev = up.cross(tan).normalized()
        h = 0.021 - 0.005 * k / n
        rows.append([p + sidev * a * h + up * b * h for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    cols = [[r[i] for r in rows] for i in range(4)]
    o = _from_grid(f"back_leg_{side}", cols + [cols[0]], M["walnut_v"], recalc=True)
    return [o], pts[-1]


def _castor(M, foot, tag):
    """A brass cup on the foot, a fork, and a turned wheel beneath."""
    bm = bmesh.new()
    x, y, z = foot
    # a square cup round the foot, with two moulded bands
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((x, y, z - 0.008)) @ Matrix.Diagonal((0.041, 0.039, 0.03, 1)))
    for dz in (-0.02, 0.002):
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((x, y, z + dz)) @ Matrix.Diagonal((0.044, 0.042, 0.0035, 1)))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.006, radius2=0.006, depth=0.012,
                          matrix=Matrix.Translation((x, y, z - 0.032)))
    for s in (-1, 1):
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((x + s * 0.009, y + 0.008, z - 0.04)) @ Matrix.Diagonal((0.003, 0.03, 0.022, 1)))
    brass = _finish(f"castor_{tag}", bm, M["brass"])
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.019, radius2=0.019, depth=0.013,
                          matrix=Matrix.Translation((x, y + 0.014, 0.019)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
    wheel = _finish(f"wheel_{tag}", bm, M["iron"])
    return [brass, wheel]


def build(tex_dir=TEX, collection=None, mats=None):
    global _coll
    _coll = collection
    M = mats or materials(tex_dir)
    parts = []
    parts += _back(M)
    parts += _seat(M)
    parts += _arms(M)
    parts += _nails(M)
    parts += _rails(M)
    for side in (-1, 1):
        parts += _post(M, side)
        parts += _castor(M, Vector((side * POST_X, POST_Y, FOOT_Z)), f"f{side}")
        leg, foot = _back_leg(M, side)
        parts += leg
        parts += _castor(M, foot, f"b{side}")
    _coll = None
    return parts
