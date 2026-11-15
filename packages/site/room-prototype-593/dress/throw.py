"""#593: a folded wool throw dropped over the chest's domed lid by cloth simulation, then frozen into
a plain mesh. Woven wool tartan (the Victorian parlour's own), a centimetre thick with a rolled hem and a fringe.

add_throw(scene, chest_root) -> the throw object. Collision runs on the chest's convex hull,
which is deleted afterwards; nothing simulated is left in the scene."""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

M = 3.11


def _tartan():
    """Woven wool tartan: muted dyes, stripe edges that blur where the threads interleave, a twill
    diagonal and thread-to-thread colour drift in the weave, fuzz and a strong sheen."""
    m = bpy.data.materials.get("throw_wool")
    if m:
        return m
    m = bpy.data.materials.new("throw_wool")
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["UV"], sep.inputs["Vector"])

    def math_node(op, a, b=None, clamp=False):
        n = nt.nodes.new("ShaderNodeMath")
        n.operation = op
        n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                nt.links.new(v, n.inputs[i])
        return n.outputs[0]

    def stripes(axis, count, width, soft=0.012):
        """1 inside a stripe repeating `count` times across the cloth, with a soft woven edge."""
        frac = math_node("FRACT", math_node("MULTIPLY", sep.outputs[axis], count))
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.interpolation_type = "SMOOTHSTEP"
        mr.inputs["From Min"].default_value = width - soft
        mr.inputs["From Max"].default_value = width + soft
        mr.inputs["To Min"].default_value = 1.0
        mr.inputs["To Max"].default_value = 0.0
        nt.links.new(frac, mr.inputs["Value"])
        return mr.outputs["Result"]

    def mix(a, b, fac):
        n = nt.nodes.new("ShaderNodeMix")
        n.data_type = "RGBA"
        if isinstance(a, tuple):
            n.inputs["A"].default_value = a
        else:
            nt.links.new(a, n.inputs["A"])
        n.inputs["B"].default_value = b
        nt.links.new(fac, n.inputs["Factor"])
        return n.outputs["Result"]

    # where a warp stripe crosses a weft stripe, the twill shows each colour on alternate diagonals
    twill = nt.nodes.new("ShaderNodeTexWave")
    twill.wave_type = "BANDS"
    twill.bands_direction = "DIAGONAL"
    twill.wave_profile = "SAW"
    twill.inputs["Scale"].default_value = 260.0
    nt.links.new(tc.outputs["UV"], twill.inputs["Vector"])
    half = math_node("GREATER_THAN", twill.outputs["Fac"], 0.5)

    def woven(sx, sy):
        """Warp and weft stripes interleaved: both where both are, either one on alternate diagonals."""
        either = math_node("ADD", math_node("MULTIPLY", sx, half), math_node("MULTIPLY", sy, math_node("SUBTRACT", 1.0, half)), True)
        return math_node("MAXIMUM", math_node("MULTIPLY", sx, sy), either)

    red, green, navy, cream = (0.2, 0.028, 0.022, 1), (0.03, 0.058, 0.035, 1), (0.025, 0.03, 0.052, 1), (0.42, 0.35, 0.22, 1)
    col = mix(red, green, woven(stripes("X", 6, 0.32), stripes("Y", 3, 0.32)))
    col = mix(col, navy, woven(stripes("X", 6, 0.08), stripes("Y", 3, 0.08)))
    col = mix(col, cream, woven(stripes("X", 12, 0.02, 0.006), stripes("Y", 6, 0.02, 0.006)))
    # thread-to-thread drift: dyed yarn is never one flat colour
    drift = nt.nodes.new("ShaderNodeTexNoise")
    drift.inputs["Scale"].default_value = 120.0
    drift.inputs["Detail"].default_value = 2.0
    nt.links.new(tc.outputs["UV"], drift.inputs["Vector"])
    vary = nt.nodes.new("ShaderNodeMapRange")
    vary.inputs["To Min"].default_value = 0.78
    vary.inputs["To Max"].default_value = 1.18
    nt.links.new(drift.outputs["Fac"], vary.inputs["Value"])
    shade = nt.nodes.new("ShaderNodeMix")
    shade.data_type = "RGBA"
    shade.blend_type = "MULTIPLY"
    shade.inputs["Factor"].default_value = 1.0
    nt.links.new(col, shade.inputs["A"])
    nt.links.new(vary.outputs["Result"], shade.inputs["B"])
    nt.links.new(shade.outputs["Result"], p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = 0.95
    p.inputs["Sheen Weight"].default_value = 1.0
    p.inputs["Sheen Roughness"].default_value = 0.55
    p.inputs["Sheen Tint"].default_value = (0.9, 0.85, 0.8, 1)
    # the surface: twill ridges and wool fuzz
    fuzz = nt.nodes.new("ShaderNodeTexNoise")
    fuzz.inputs["Scale"].default_value = 1500.0
    fuzz.inputs["Detail"].default_value = 8.0
    nt.links.new(tc.outputs["UV"], fuzz.inputs["Vector"])
    height = math_node("ADD", math_node("MULTIPLY", twill.outputs["Fac"], 0.6), fuzz.outputs["Fac"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.002
    nt.links.new(height, bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], p.inputs["Normal"])
    return m


def _fringe_wool():
    m = bpy.data.materials.get("throw_fringe")
    if m:
        return m
    m = bpy.data.materials.new("throw_fringe")
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (0.17, 0.026, 0.02, 1)
    p.inputs["Roughness"].default_value = 0.95
    p.inputs["Sheen Weight"].default_value = 1.0
    return m


def _proxy(scene, meshes):
    """The chest's convex hull, invisible, for the cloth to collide with: a box under a dome, which is
    what the chest is, in a few hundred faces and with no gaps to fall through."""
    bm = bmesh.new()
    for o in meshes:
        for v in o.data.vertices:
            bm.verts.new(o.matrix_world @ v.co)
    hull = bmesh.ops.convex_hull(bm, input=bm.verts)
    inside = {v for v in hull["geom_interior"] + hull["geom_unused"] if isinstance(v, bmesh.types.BMVert)}
    bmesh.ops.delete(bm, geom=list(inside), context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)   # outward, or the cloth is pushed into the chest
    me = bpy.data.meshes.new("throw_collider")
    bm.to_mesh(me)
    bm.free()
    p = bpy.data.objects.new("throw_collider", me)
    scene.collection.objects.link(p)
    p.hide_render = True
    p.modifiers.new("collision", "COLLISION")
    p.collision.thickness_outer = 0.012 * M
    p.collision.cloth_friction = 80   # wool on old wood: it stays where it falls, it does not slide off the dome
    return p


def add_throw(scene, chest_root, size_m=(1.05, 0.62), frames=50):
    """Simulated in `scene`'s own view layer, whichever scene the context holds."""
    with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
        return _add_throw(scene, chest_root, size_m, frames)


def _fringe(throw, ends, length=0.07):
    """Twisted-yarn fringe on the two short ends: three strands per gap along each hem, each leaving
    the cloth's edge and falling toward the floor, a little uneven in length."""
    co = [v.co for v in throw.data.vertices]
    down = Vector((0, 0, -1))
    verts, faces = [], []
    sides = 5
    for end in ends:
        for (a, ai), (b, bi) in zip(end, end[1:]):
            for t in (0.0, 0.33, 0.66):
                root = co[a].lerp(co[b], t)
                out = (co[a] - co[ai]).lerp(co[b] - co[bi], t).normalized()
                L = length * M * (0.85 + 0.3 * ((a * 7 + int(t * 3) * 13) % 10) / 10)
                d = (out * 0.35 + down * 0.65).normalized()
                pts = [root + (out * 0.2 + d * 0.8).normalized() * L * (k / 4) + down * (L * 0.15 * (k / 4) ** 2) for k in range(5)]
                base = len(verts)
                for k, pt in enumerate(pts):
                    T = (pts[min(k + 1, 4)] - pts[max(k - 1, 0)]).normalized()
                    N = T.cross(Vector((0.3, 0.2, 0.9))).normalized()
                    Bv = T.cross(N)
                    r = 0.0026 * M * (1 - 0.45 * k / 4)
                    verts += [tuple(pt + (N * math.cos(2 * math.pi * j / sides) + Bv * math.sin(2 * math.pi * j / sides)) * r)
                              for j in range(sides)]
                for k in range(4):
                    faces += [(base + k * sides + j, base + k * sides + (j + 1) % sides,
                               base + (k + 1) * sides + (j + 1) % sides, base + (k + 1) * sides + j) for j in range(sides)]
                faces.append(tuple(base + 4 * sides + j for j in range(sides)))
    me = bpy.data.meshes.new("throw_fringe")
    me.from_pydata(verts, [], faces)
    me.shade_smooth()
    me.materials.append(_fringe_wool())
    f = bpy.data.objects.new("throw_fringe", me)
    throw.users_collection[0].objects.link(f)
    f.parent = throw   # built in the throw's own coordinates
    return f


def _add_throw(scene, chest_root, size_m, frames):
    meshes = [o for o in chest_root.children_recursive if o.type == "MESH"]
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    top = max(p.z for p in pts)
    centre = sum(pts, Vector()) / len(pts)
    yaw = chest_root.rotation_euler.z
    along = Vector((math.cos(yaw), math.sin(yaw), 0))     # the chest's length
    # a folded throw, laid across the lid's left end at an angle, dropped from a little above it
    nx, ny = 84, 50
    bm = bmesh.new()
    bm.loops.layers.uv.new("UVMap")   # create_grid fills UVs only into a layer that already exists
    bmesh.ops.create_grid(bm, x_segments=nx, y_segments=ny, size=0.5, calc_uvs=True)
    for v in bm.verts:
        v.co.x *= size_m[0] * M
        v.co.y *= size_m[1] * M
        # loose ripples to fold from, as a throw tossed down is never flat
        v.co.z += 0.035 * M * (math.sin(v.co.x * 2.3 + 1.1) * math.cos(v.co.y * 3.1) + 0.5 * math.sin(v.co.x * 5.7 - v.co.y * 4.3))
    bm.verts.ensure_lookup_table()
    hx = max(v.co.x for v in bm.verts)
    ends = []
    for sgn in (-1, 1):   # the two short ends, each vertex with its neighbour one step in from the hem
        edge = sorted((v for v in bm.verts if abs(v.co.x - sgn * hx) < 1e-6), key=lambda v: v.co.y)
        ends.append([(v.index, next(e.other_vert(v).index for e in v.link_edges
                                    if abs(e.other_vert(v).co.y - v.co.y) < 1e-6)) for v in edge])
    me = bpy.data.meshes.new("throw")
    bm.to_mesh(me)
    bm.free()
    throw = bpy.data.objects.new("throw", me)
    scene.collection.objects.link(throw)
    throw.location = centre - along * 0.12 * M
    throw.location.z = top + 0.1 * M
    throw.rotation_euler = (0, 0, yaw + math.radians(70))
    me.materials.append(_tartan())
    colliders = [_proxy(scene, meshes)]
    cloth = throw.modifiers.new("cloth", "CLOTH")
    st = cloth.settings
    st.quality = 12
    st.mass = 0.45
    st.tension_stiffness = st.compression_stiffness = 10
    st.shear_stiffness = 8
    st.bending_stiffness = 0.15       # soft wool: it falls into folds instead of bridging like card
    st.bending_damping = 1.0
    st.air_damping = 2.0
    cloth.collision_settings.collision_quality = 4
    cloth.collision_settings.friction = 80
    cloth.collision_settings.distance_min = 0.008 * M
    cloth.point_cache.frame_start, cloth.point_cache.frame_end = 1, frames
    f0 = scene.frame_current
    for f in range(1, frames + 1):
        scene.frame_set(f)
    dg = scene.view_layers[0].depsgraph
    frozen = bpy.data.meshes.new_from_object(throw.evaluated_get(dg))
    throw.modifiers.remove(cloth)
    old = throw.data
    throw.data = frozen
    bpy.data.meshes.remove(old)
    frozen.name = "throw"
    if not frozen.materials:
        frozen.materials.append(_tartan())
    for f in frozen.polygons:
        f.use_smooth = True
    # wool has body: a centimetre thick, its hem rolled round by the subdivision, not cut like card
    sol = throw.modifiers.new("thickness", "SOLIDIFY")
    sol.thickness = 0.011 * M
    sol.offset = 0.0
    sol.use_even_offset = True
    sol.use_rim = True
    sub = throw.modifiers.new("soft", "SUBSURF")
    sub.levels, sub.render_levels = 1, 2
    _fringe(throw, ends)
    scene.frame_set(f0)
    for c in colliders:
        me_c = c.data
        bpy.data.objects.remove(c, do_unlink=True)
        bpy.data.meshes.remove(me_c)
    return throw
