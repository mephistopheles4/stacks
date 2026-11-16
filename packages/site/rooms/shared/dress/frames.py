"""#593: picture frames made here. A moulding profile swept round the picture's rectangle; an
inflated rectangle mitres its own corners. Built in metres, then scaled to scene units.

Each style: the frame's width W, a profile [(d, z, mat)] from the sight edge (d = 0) out to the
back of the outer edge (d = W), z standing forward from the wall, and a card mount width (0 = none).
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

M = 3.11
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))  # the checkout, four folders up
PH = os.path.join(REPO, ".cache", "polyhaven")
MET = os.path.join(REPO, ".cache", "met")


def arc(cx, cz, r, a0, a1, n=6, mat=0):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cz + r * math.sin(math.radians(a0 + (a1 - a0) * i / n)), mat) for i in range(n + 1)]


G, B, O = 0, 1, 2  # profile material slots: the slip or burnished gilt, the field, a third


def P(*pts, mat=0):
    return [(d, z, mat) for d, z in pts]


# A style: W (frame width), the profile, the mount width, its three material names, the ornament runs
# (kind, d, size) laid along each side at distance d out from the sight edge, the corner cartouche's
# (d, size) or None, whether the long sides carry centre cartouches, and whether the picture is glazed.
# Victorian convention: oils in gilt compo with corner (and centre) ornament, unglazed; prints in a
# maple or gilt frame with a gilt slip, a washline mount, and glass.
STYLES = {
    # Melencolia I, the hero print: a gilt cove, egg-and-dart on its top ovolo, pearls at the sight,
    # a laurel torus to the wall, acanthus across the cove at each corner
    "gilt_cove": dict(W=0.115, mount=0.09, glass=True, mats=("gilt_burnished", "gilt_matte", "gilt_matte"),
                      profile=P((0, 0), (0, 0.012)) + arc(0.006, 0.012, 0.006, 180, 0, 6) +
                      P((0.014, 0.02)) + arc(0.014, 0.06, 0.04, 270, 360, 10, 1) +
                      arc(0.066, 0.06, 0.012, 180, 0, 8) + P((0.082, 0.05)) +
                      arc(0.09, 0.025, 0.025, 90, 0, 8)[1:] + P((0.115, 0.0)),
                      runs=[("pearl", 0.006, 0.0042), ("egg_dart", 0.066, 0.0075), ("laurel", 0.1, 0.0075)],
                      corners=(0.04, 0.05), centres=False),
    # Saint Jerome, the Knight: bird's-eye maple, a gilt slip with a bead, the archetypal Victorian print frame
    "maple": dict(W=0.047, mount=0.05, glass=True, mats=("gilt_burnished", "maple", "maple"),
                  profile=P((0, 0), (0, 0.008)) + arc(0.004, 0.009, 0.004, 180, 0, 5) + P((0.01, 0.007)) +
                  P((0.011, 0.014), (0.02, 0.012), (0.03, 0.014), (0.038, 0.018), mat=1) +
                  arc(0.042, 0.014, 0.005, 120, 0, 5, 1) + P((0.047, 0.0), mat=1),
                  runs=[("pearl", 0.004, 0.0026)], corners=None, centres=False),
    # Aristotle, an Old Master oil in a Victorian gallery frame: bead-and-reel sight, a flat, a hollow,
    # a heavy leaf-and-berry torus; acanthus at corners and centres
    "gilt_gallery": dict(W=0.14, mount=0.0, glass=False, mats=("gilt_burnished", "gilt_matte", "gilt_matte"),
                         profile=P((0, 0), (0, 0.02), (0.008, 0.024), (0.012, 0.034), (0.045, 0.036)) +
                         arc(0.06, 0.036, 0.015, 180, 360, 8, 1) + P((0.085, 0.04)) +
                         arc(0.11, 0.04, 0.028, 180, -45, 12) + P((0.14, 0.0)),
                         runs=[("bead_reel", 0.022, 0.0045), ("laurel", 0.11, 0.009)],
                         corners=(0.06, 0.068), centres=True),
    # The Gulf Stream, an 1899 oil: a late-Victorian gilt frame, reeded cove, laurel torus, corner leaves
    "gilt_reeded": dict(W=0.1, mount=0.0, glass=False, mats=("gilt_burnished", "gilt_matte", "gilt_matte"),
                        profile=P((0, 0), (0, 0.012)) + arc(0.006, 0.012, 0.006, 180, 0, 6) +
                        P((0.013, 0.016)) + arc(0.013, 0.05, 0.034, 270, 360, 10, 1) +
                        arc(0.074, 0.038, 0.017, 180, 0, 10) + P((0.1, 0.0)),
                        runs=[("pearl", 0.006, 0.004), ("reed", (0.016, 0.044), 0.0035), ("laurel", 0.074, 0.008)],
                        corners=(0.035, 0.05), centres=False),
    # Knight, Death and the Devil: Aesthetic Movement ebonised wood, a gilt slip and one incised gilt line
    "ebonised": dict(W=0.052, mount=0.05, glass=True, mats=("gilt_burnished", "ebony", "gilt_burnished"),
                     profile=P((0, 0), (0, 0.008)) + arc(0.004, 0.009, 0.004, 180, 0, 5) + P((0.01, 0.007)) +
                     P((0.011, 0.012), (0.022, 0.016), mat=1) + P((0.023, 0.018), (0.026, 0.018), mat=2) +
                     P((0.027, 0.016), (0.04, 0.02), mat=1) + arc(0.045, 0.016, 0.006, 120, 0, 5, 1) +
                     P((0.052, 0.0), mat=1),
                     runs=[("pearl", 0.004, 0.0024)], corners=None, centres=False),
    # The Gulf Stream: dark walnut, an ogee and a torus, round a reeded gilt liner with a pearled sight
    "walnut_gilt": dict(W=0.11, mount=0.0, glass=False, mats=("gilt_burnished", "gilt_matte", "walnut"),
                        profile=P((0, 0), (0, 0.012)) + arc(0.006, 0.012, 0.006, 180, 0, 6) + P((0.013, 0.015)) +
                        arc(0.013, 0.045, 0.03, 270, 315, 6, 1) + P((0.036, 0.03), mat=2) +
                        arc(0.05, 0.03, 0.014, 180, 90, 6, 2) + P((0.07, 0.046), mat=2) +
                        arc(0.088, 0.03, 0.018, 90, -20, 8, 2) + P((0.11, 0.0), mat=2),
                        runs=[("pearl", 0.006, 0.004), ("reed", (0.015, 0.033), 0.0028)], corners=None, centres=False),
}


def _mat(name, build):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        build(m, m.node_tree, m.node_tree.nodes["Principled BSDF"])
    return m


def _node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for k, v in inputs.items():
        n.inputs[k].default_value = v
    return n


def _gilt(rough, rub):
    def build(m, nt, p):
        """Gold leaf over a red bole, rubbed through where the noise is high, and toned dark in the
        recesses, as Victorian gilders toned compo so the ornament reads."""
        tc = nt.nodes.new("ShaderNodeTexCoord")
        noise = _node(nt, "ShaderNodeTexNoise", Scale=90.0, Detail=8.0)
        nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = rub
        ramp.color_ramp.elements[1].position = rub + 0.03
        nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        leaf = nt.nodes.new("ShaderNodeMix")
        leaf.data_type = "RGBA"
        leaf.inputs["A"].default_value = (0.83, 0.6, 0.25, 1)
        leaf.inputs["B"].default_value = (0.32, 0.08, 0.04, 1)
        nt.links.new(ramp.outputs["Color"], leaf.inputs["Factor"])
        ao = _node(nt, "ShaderNodeAmbientOcclusion", Distance=0.08)
        ao.only_local = True
        tone = _node(nt, "ShaderNodeMapRange", **{"To Min": 0.3, "To Max": 1.0})
        nt.links.new(ao.outputs["AO"], tone.inputs["Value"])
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        nt.links.new(leaf.outputs["Result"], mul.inputs["A"])
        nt.links.new(tone.outputs["Result"], mul.inputs["B"])
        nt.links.new(mul.outputs["Result"], p.inputs["Base Color"])
        inv = _node(nt, "ShaderNodeMath")
        inv.operation = "SUBTRACT"
        inv.inputs[0].default_value = 1.0
        nt.links.new(ramp.outputs["Color"], inv.inputs[1])
        nt.links.new(inv.outputs[0], p.inputs["Metallic"])
        p.inputs["Roughness"].default_value = rough
        grain = _node(nt, "ShaderNodeTexNoise", Scale=500.0, Detail=4.0)
        nt.links.new(tc.outputs["Object"], grain.inputs["Vector"])
        bump = _node(nt, "ShaderNodeBump", Strength=0.08)
        nt.links.new(grain.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], p.inputs["Normal"])
    return build


def _plain(colour, rough):
    def build(m, nt, p):
        p.inputs["Base Color"].default_value = colour
        p.inputs["Roughness"].default_value = rough
    return build


def _maple(m, nt, p):
    """Bird's-eye maple, French-polished: grain along each member (the sweep's U), small dark eyes."""
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = _node(nt, "ShaderNodeMapping", Scale=(2.0, 60.0, 1.0))
    nt.links.new(tc.outputs["UV"], mp.inputs["Vector"])
    wave = _node(nt, "ShaderNodeTexWave", Scale=1.0, Distortion=5.0, Detail=3.0)
    wave.bands_direction = "Y"
    nt.links.new(mp.outputs["Vector"], wave.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.33, 0.17, 0.06, 1)
    ramp.color_ramp.elements[1].color = (0.52, 0.31, 0.12, 1)
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    vor = _node(nt, "ShaderNodeTexVoronoi", Scale=220.0)
    nt.links.new(tc.outputs["UV"], vor.inputs["Vector"])
    eye = _node(nt, "ShaderNodeMapRange", **{"From Min": 0.0, "From Max": 0.12, "To Min": 0.75, "To Max": 0.0})
    nt.links.new(vor.outputs["Distance"], eye.inputs["Value"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs["B"].default_value = (0.25, 0.13, 0.05, 1)
    nt.links.new(eye.outputs["Result"], mix.inputs["Factor"])
    nt.links.new(ramp.outputs["Color"], mix.inputs["A"])
    nt.links.new(mix.outputs["Result"], p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = 0.3
    p.inputs["Coat Weight"].default_value = 0.4


def _walnut(m, nt, p):
    """Walnut veneer along each member (the sweep's U), darkened and polished."""
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = _node(nt, "ShaderNodeMapping", Scale=(3.0, 3.0, 1.0))
    nt.links.new(tc.outputs["UV"], mp.inputs["Vector"])
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(PH, "american_walnut_veneer", "diff.jpg"), check_existing=True)
    nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
    dark = nt.nodes.new("ShaderNodeMix")
    dark.data_type = "RGBA"
    dark.blend_type = "MULTIPLY"
    dark.inputs["Factor"].default_value = 1.0
    dark.inputs["B"].default_value = (0.5, 0.38, 0.3, 1)
    nt.links.new(tex.outputs["Color"], dark.inputs["A"])
    nt.links.new(dark.outputs["Result"], p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = 0.32
    p.inputs["Coat Weight"].default_value = 0.3


def _ebony(m, nt, p):
    p.inputs["Base Color"].default_value = (0.012, 0.01, 0.009, 1)
    p.inputs["Roughness"].default_value = 0.28
    p.inputs["Coat Weight"].default_value = 0.5


def _glass(m, nt, p):
    p.inputs["Base Color"].default_value = (1, 1, 1, 1)
    p.inputs["Roughness"].default_value = 0.03
    p.inputs["Alpha"].default_value = 0.07
    for attr, value in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
        try:
            setattr(m, attr, value)
        except Exception:
            pass


MATS = {
    "gilt_burnished": lambda: _mat("frame_gilt_burnished", _gilt(0.22, 0.74)),
    "gilt_matte": lambda: _mat("frame_gilt_matte", _gilt(0.45, 0.7)),
    "maple": lambda: _mat("frame_maple2", _maple),
    "walnut": lambda: _mat("frame_walnut", _walnut),
    "ebony": lambda: _mat("frame_ebony", _ebony),
    "mount": lambda: _mat("frame_mount", _plain((0.76, 0.71, 0.6, 1), 0.9)),
    "ink": lambda: _mat("frame_ink", _plain((0.1, 0.07, 0.05, 1), 0.8)),
    "wash": lambda: _mat("frame_wash", _plain((0.63, 0.6, 0.47, 1), 0.9)),
    "glass": lambda: _mat("frame_glass", _glass),
}


def _sweep(name, profile, ax, az, cz):
    """Rings of 4 corners, the opening's half-size (ax, az) grown by d, at depth z (forward = -y).
    UVs: U runs along each member (so wood grain turns at the mitre), V along the profile."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new()
    rings = []
    for d, z, _ in profile:
        hx, hz = ax + d, az + d
        rings.append([bm.verts.new((sx * hx, -z, cz + sz * hz)) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    n = len(profile)
    arclen = [0.0]
    for i in range(n):
        (d0, z0, _), (d1, z1, _) = profile[i], profile[(i + 1) % n]
        arclen.append(arclen[-1] + math.hypot(d1 - d0, z1 - z0))
    for i in range(n):
        a, b = rings[i], rings[(i + 1) % n]
        for k in range(4):
            f = bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
            f.material_index = profile[i][2]
            f.smooth = True
            for loop, v in zip(f.loops, (arclen[i], arclen[i], arclen[i + 1], arclen[i + 1])):
                co = loop.vert.co
                loop[uvl].uv = (co.x if k % 2 == 0 else co.z - cz, v)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    try:
        me.set_sharp_from_angle(angle=math.radians(40))
    except Exception:
        pass
    return me


# ── ornament: compo work, built from small ellipsoids and swept tubes laid on the moulding ──
SIDES = (((1, 0), (0, -1)), ((0, 1), (1, 0)), ((-1, 0), (0, 1)), ((0, -1), (-1, 0)))  # (along, outward) per side
F = Vector((0, -1, 0))  # forward, out of the wall


def _motif(kind, r):
    """(period, [(du, dv, lift, (a, b, c), angle)]): a along the run, b across it, c standing up."""
    if kind == "pearl":
        return 2.15 * r, [(0, 0, 0.55 * r, (r, r, 0.85 * r), 0)]
    if kind == "bead_reel":
        reel = (0.3 * r, 0.85 * r, 0.75 * r)
        return 6 * r, [(0, 0, 0.55 * r, (1.6 * r, r, 0.85 * r), 0),
                       (2.7 * r, 0, 0.5 * r, reel, 0), (3.3 * r, 0, 0.5 * r, reel, 0)]
    if kind == "egg_dart":
        return 2.7 * r, [(0, 0.1 * r, 0.25 * r, (1.1 * r, 1.35 * r, 0.3 * r), 0),   # the egg's cup
                         (0, 0.1 * r, 0.5 * r, (0.85 * r, 1.15 * r, 0.6 * r), 0),   # the egg
                         (1.35 * r, -0.1 * r, 0.35 * r, (0.15 * r, 1.1 * r, 0.4 * r), 0),  # the dart's shaft
                         (1.35 * r, -1.0 * r, 0.3 * r, (0.35 * r, 0.25 * r, 0.3 * r), 0)]  # its head
    if kind == "laurel":
        leaf = (1.15 * r, 0.4 * r, 0.2 * r)
        return 1.8 * r, [(0, 0.42 * r, 0.3 * r, leaf, math.radians(30)),
                         (0, -0.42 * r, 0.3 * r, leaf, math.radians(-30)),
                         (0.9 * r, 0, 0.45 * r, (1.05 * r, 0.38 * r, 0.22 * r), 0),
                         (-0.5 * r, 0, 0.55 * r, (0.28 * r, 0.28 * r, 0.28 * r), 0)]
    raise ValueError(kind)


class Ornament:
    def __init__(self, profile, ax, az, cz, W):
        self.verts, self.faces = [], []
        self.ax, self.az, self.cz, self.W = ax, az, cz, W
        pts = [(d, z) for d, z, _ in profile]
        self.segs = list(zip(pts, pts[1:]))

    def surf(self, d):
        """The moulding's height at distance d from the sight edge: the outermost face over it."""
        d = min(max(d, 0.0), self.W)
        best = 0.0
        for (d0, z0), (d1, z1) in self.segs:
            if min(d0, d1) <= d <= max(d0, d1):
                best = max(best, z0 if abs(d1 - d0) < 1e-9 else z0 + (z1 - z0) * (d - d0) / (d1 - d0))
        return best

    # Geometry is gathered in plain lists and made into one mesh at the end: a bmesh operator per
    # ellipsoid rescans the whole growing mesh, which took minutes for one frame.
    _SPHERES = {}

    @classmethod
    def _unit_sphere(cls, us, vs):
        if (us, vs) not in cls._SPHERES:
            verts = [(0.0, 0.0, -1.0)]
            for i in range(1, vs):
                th = math.pi * i / vs - math.pi / 2
                verts += [(math.cos(th) * math.cos(2 * math.pi * j / us), math.cos(th) * math.sin(2 * math.pi * j / us),
                           math.sin(th)) for j in range(us)]
            verts.append((0.0, 0.0, 1.0))
            top = len(verts) - 1
            ring = lambda i, j: 1 + (i - 1) * us + j % us
            faces = [(0, ring(1, j + 1), ring(1, j)) for j in range(us)]
            for i in range(1, vs - 1):
                faces += [(ring(i, j), ring(i, j + 1), ring(i + 1, j + 1), ring(i + 1, j)) for j in range(us)]
            faces += [(top, ring(vs - 1, j), ring(vs - 1, j + 1)) for j in range(us)]
            cls._SPHERES[(us, vs)] = (verts, faces)
        return cls._SPHERES[(us, vs)]

    def ell(self, c, U, V, Wv, size, seg=(8, 5)):
        verts, faces = self._unit_sphere(*seg)
        a, b, k = U * size[0], V * size[1], Wv * size[2]
        base = len(self.verts)
        self.verts += [tuple(c + a * x + b * y + k * z) for x, y, z in verts]
        flip = a.cross(b).dot(k) < 0
        self.faces += [tuple(base + i for i in (f[::-1] if flip else f)) for f in faces]

    def tube(self, pts, radii, up, sides=6):
        base = len(self.verts)
        for i, p in enumerate(pts):
            T = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            N = T.cross(up).normalized()
            Bv = T.cross(N)
            self.verts += [tuple(p + (N * math.cos(a) + Bv * math.sin(a)) * radii[i])
                           for a in (2 * math.pi * j / sides for j in range(sides))]
        r = lambda i, j: base + i * sides + j % sides
        for i in range(len(pts) - 1):
            self.faces += [(r(i, j), r(i, j + 1), r(i + 1, j + 1), r(i + 1, j)) for j in range(sides)]
        self.faces += [tuple(r(0, j) for j in range(sides)), tuple(r(len(pts) - 1, j) for j in range(sides))]

    def on_side(self, k, u, d, lift):
        """A point on side k: u along it, d out from the sight edge, lift above the moulding's face;
        with the axes along the run, across the moulding's face, and its normal."""
        (tx, tz), (nx, nz) = SIDES[k]
        off = (self.az if k % 2 == 0 else self.ax) + d
        e = 0.0015
        s = (self.surf(d + e) - self.surf(d - e)) / (2 * e)
        n = math.hypot(1, s)
        T, N = Vector((tx, 0, tz)), Vector((nx, 0, nz))
        V, Wv = (N + F * s) / n, (F - N * s) / n
        pos = Vector((tx * u + nx * off, 0, self.cz + tz * u + nz * off)) + F * (self.surf(d) + lift)
        return pos, T, V, Wv

    def run(self, kind, d0, r, keep):
        """A continuous run of one motif along all four sides, stopped short where `keep` says."""
        dm = sum(d0) / 2 if isinstance(d0, tuple) else d0
        for k in range(4):
            half = (self.ax if k % 2 == 0 else self.az) + dm
            period, elems = (2.4 * r, None) if kind == "reed" else _motif(kind, r)
            lo, hi = keep(-half, half, d0)
            n = max(1, int((hi - lo) / period))
            step = (hi - lo) / n
            T = Vector((SIDES[k][0][0], 0, SIDES[k][0][1]))
            for i in range(n):
                u = lo + step * (i + 0.5)
                if keep.skip(u, d0):
                    continue
                if kind == "reed":
                    da, db = d0
                    pts = [self.on_side(k, u, da + (db - da) * j / 8, 0.6 * r)[0] for j in range(9)]
                    self.tube(pts, [r * (0.5 + 0.5 * math.sin(math.pi * (0.15 + 0.7 * j / 8))) for j in range(9)], T)
                    continue
                for du, dv, lift, size, ang in elems:
                    pos, Tk, V, Wv = self.on_side(k, u + du, d0 + dv, lift)
                    c, s = math.cos(ang), math.sin(ang)
                    self.ell(pos, Tk * c + V * s, V * c - Tk * s, Wv, size)

    def at(self, X, Z, lift):
        """A point in the frame's plane (X, Z from the opening's centre), lifted off the moulding."""
        d = max(abs(X) - self.ax, abs(Z) - self.az)
        return Vector((X, 0, self.cz + Z)) + F * (self.surf(d) + lift)

    def ell2d(self, X, Z, lift, th, size, seg=(8, 5)):
        U, V = Vector((math.cos(th), 0, math.sin(th))), Vector((-math.sin(th), 0, math.cos(th)))
        self.ell(self.at(X, Z, lift), U, V, F, size, seg)

    def scroll(self, X, Z, th, R, lift, turn):
        cx, cz = X - math.sin(th) * R * turn, Z + math.cos(th) * R * turn
        pts, radii = [], []
        for j in range(14):
            f = j / 13
            phi = th - turn * math.pi / 2 + turn * f * 1.7 * math.pi
            rr = R * (1 - 0.6 * f)
            pts.append(self.at(cx + rr * math.cos(phi), cz + rr * math.sin(phi), lift))
            radii.append(R * (0.42 - 0.25 * f))
        self.tube(pts, radii, F)

    def leaf(self, X, Z, th, L, w, lift):
        """An acanthus leaf: a ribbed spine of lobes, serrated lobes either side, its tip curled over."""
        c, s = math.cos(th), math.sin(th)
        for i in range(5):
            f = (i + 0.5) / 5
            px, pz = X + c * L * f, Z + s * L * f
            taper = 1 - 0.55 * f
            rise = math.sin(math.pi * f) * 0.25 * w + lift
            self.ell2d(px, pz, rise + 0.12 * w, th, (L / 8, w * 0.3 * taper, 0.16 * w))
            for side in (-1, 1):
                ox, oz = -s * side * w * 0.32 * taper, c * side * w * 0.32 * taper
                self.ell2d(px + ox, pz + oz, rise + 0.06 * w, th + side * 0.5, (L / 9, w * 0.26 * taper, 0.12 * w))
        self.scroll(X + c * L, Z + s * L, th, w * 0.3, lift + 0.15 * w, 1)

    def rosette(self, X, Z, S, lift):
        self.ell2d(X, Z, lift + 0.08 * S, 0, (0.13 * S, 0.13 * S, 0.1 * S), (10, 6))
        for j in range(8):
            a = j * math.pi / 4
            self.ell2d(X + 0.17 * S * math.cos(a), Z + 0.17 * S * math.sin(a), lift + 0.04 * S, a,
                       (0.09 * S, 0.06 * S, 0.06 * S))

    def corner(self, sx, sz, dc, S):
        X, Z = sx * (self.ax + dc), sz * (self.az + dc)
        out = math.atan2(sz, sx)
        lift = 0.06 * S
        self.leaf(X, Z, out, 0.45 * S, 0.34 * S, lift)
        self.leaf(X, Z, out + math.pi, 0.4 * S, 0.3 * S, lift)
        for along in (math.atan2(0, -sx), math.atan2(-sz, 0)):
            for spread in (-0.3, 0.3):
                self.leaf(X, Z, along + spread, 1.05 * S, 0.32 * S, lift)
        self.rosette(X, Z, S, lift + 0.08 * S)

    def centre(self, k, dc, S):
        (tx, tz), (nx, nz) = SIDES[k]
        off = (self.az if k % 2 == 0 else self.ax) + dc
        X, Z = nx * off, nz * off
        lift = 0.06 * S
        for sgn in (-1, 1):
            self.leaf(X, Z, math.atan2(tz * sgn, tx * sgn), 0.9 * S, 0.3 * S, lift)
        self.leaf(X, Z, math.atan2(nz, nx), 0.38 * S, 0.3 * S, lift)
        self.leaf(X, Z, math.atan2(-nz, -nx), 0.34 * S, 0.28 * S, lift)
        self.rosette(X, Z, S, lift + 0.08 * S)

    def mesh(self, name):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.verts, [], self.faces)
        bm = bmesh.new()  # one pass to point the tubes' faces outward, as the spheres' already are
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        me.shade_smooth()
        return me


class _Keep:
    """Where a run stops: short of a corner cartouche, and around a centre one, when it lies across them."""
    def __init__(self, corners, centres):
        self.corners, self.centres = corners, centres

    def _near(self, d0):
        d = sum(d0) / 2 if isinstance(d0, tuple) else d0
        return bool(self.corners) and abs(d - self.corners[0]) < 0.75 * self.corners[1]

    def __call__(self, lo, hi, d0):
        k = 1.15 * self.corners[1] if self._near(d0) else 0.0
        return lo + k, hi - k

    def skip(self, u, d0):
        return self.centres and self._near(d0) and abs(u) < self.corners[1]


def ornament(name, st, ax, az, cz):
    o = Ornament(st["profile"], ax, az, cz, st["W"])
    keep = _Keep(st["corners"], st["centres"])
    for kind, d0, r in st["runs"]:
        o.run(kind, d0, r, keep)
    if st["corners"]:
        dc, S = st["corners"]
        for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            o.corner(sx, sz, dc, S)
        if st["centres"]:
            for k in range(4):
                o.centre(k, dc, S)
    return o.mesh(name)


def _quad(name, w, h, cz, y, mat, hole=None, bevel=0.002):
    """A flat panel facing the room; with `hole` (half-size), a ring with a window cut, its inner edge
    stepped back by `bevel` (a mount's bevelled window)."""
    bm = bmesh.new()
    if hole is None:
        vs = [bm.verts.new((sx * w / 2, y, cz + sz * h / 2)) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        f = bm.faces.new(vs)
        uv = bm.loops.layers.uv.new()
        for loop, (u, v) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            loop[uv].uv = (u, v)
    else:
        outer = [bm.verts.new((sx * w / 2, y, cz + sz * h / 2)) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        inner = [bm.verts.new((sx * hole[0], y + bevel, cz + sz * hole[1])) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        for k in range(4):
            bm.faces.new((outer[k], outer[(k + 1) % 4], inner[(k + 1) % 4], inner[k]))
    for f in bm.faces:
        f.normal_update()
        if f.normal.y > 0:
            f.normal_flip()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    return me


def _picture_mat(path):
    name = "picture_" + os.path.basename(path)
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(path, check_existing=True)
        nt.links.new(tex.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
        nt.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.55
    img = next(n for n in m.node_tree.nodes if n.type == "TEX_IMAGE").image
    return m, img.size


# a washline mount: (inner, outer) offsets from the window in metres, and what each band is
WASHLINE = ((0.004, 0.0055, "gilt_burnished"), (0.012, 0.0128, "ink"), (0.0136, 0.021, "wash"), (0.0218, 0.0226, "ink"))


def build(name, style, image, outer_w, scene):
    """One framed picture, its back on the wall, its local origin at the bottom centre; returns the root."""
    st = STYLES[style]
    W, mount = st["W"], st["mount"]
    pmat, (iw, ih) = _picture_mat(os.path.join(MET, image))
    pic_w = outer_w - 2 * W - 2 * mount
    pic_h = pic_w * ih / iw
    lip = 0.006  # the frame's sight edge overlaps what it holds
    ax, az = pic_w / 2 + mount - lip, pic_h / 2 + mount - lip
    cz = W + az
    root = bpy.data.objects.new(name, None)
    scene.collection.objects.link(root)
    fm = _sweep(name + "_moulding", st["profile"], ax, az, cz)
    for key in st["mats"]:
        fm.materials.append(MATS[key]())
    om = ornament(name + "_ornament", st, ax, az, cz)
    om.materials.append(MATS["gilt_matte"]())
    parts = [bpy.data.objects.new(name + "_moulding", fm), bpy.data.objects.new(name + "_ornament", om),
             bpy.data.objects.new(name + "_picture", _quad(name + "_picture", pic_w, pic_h, cz, -0.004, pmat))]
    if mount:
        hx, hz = pic_w / 2 - 0.003, pic_h / 2 - 0.003
        parts.append(bpy.data.objects.new(name + "_mount", _quad(name + "_mount", ax * 2 + 0.01, az * 2 + 0.01, cz, -0.007,
                                                                  MATS["mount"](), hole=(hx, hz))))
        if mount >= 0.04:
            for i, (o1, o2, key) in enumerate(WASHLINE):
                parts.append(bpy.data.objects.new(f"{name}_washline{i}", _quad(
                    f"{name}_washline{i}", 2 * (hx + o2), 2 * (hz + o2), cz, -0.0074, MATS[key](),
                    hole=(hx + o1, hz + o1), bevel=0)))
    if st["glass"]:
        parts.append(bpy.data.objects.new(name + "_glass", _quad(name + "_glass", ax * 2 + 0.004, az * 2 + 0.004, cz,
                                                                  -0.0085, MATS["glass"]())))
    for o in parts:
        scene.collection.objects.link(o)
        o.parent = root
    root.scale = (M, M, M)
    return root, (outer_w, pic_h + 2 * mount + 2 * W - 2 * lip)


HANG = {  # box in the block-out -> (style, image, outer width in metres, from rehang_layout / fix_layout_desk)
    "L_melencolia_I": ("gilt_cove", "melencolia-336228.jpg", 0.85),
    "L_melencolia_I.001": ("gilt_gallery", "aristotle-437394.jpg", 0.9),
    "L_jerome": ("maple", "jerome-336229.jpg", 0.35),
    "L_knight": ("ebonised", "knight-336223.jpg", 0.35),
    "L_gulf_stream": ("walnut_gilt", "gulf-stream-11122.jpg", 1.15),
}


def hang_all(scene, back_y=0.49, right_x=9.89):
    """Replaces whatever hangs at each picture box with a frame made here, back flush to its wall.
    A box past x 9 is on the right wall: its frame turns to face the room (-x)."""
    for box_name, (style, image, outer_w) in HANG.items():
        old = scene.objects.get("P_" + box_name)
        if old:
            for o in [old] + list(old.children_recursive):
                bpy.data.objects.remove(o, do_unlink=True)
        for o in [o for o in scene.objects if o.name.startswith("F_" + box_name)]:
            bpy.data.objects.remove(o, do_unlink=True)
        box = scene.objects[box_name]
        root, _ = build("F_" + box_name, style, image, outer_w, scene)
        if box.location.x > 9:
            root.rotation_euler.z = math.radians(-90)
            root.location = (right_x, box.location.y, box.location.z)
        else:
            root.location = (box.location.x, back_y, box.location.z)
