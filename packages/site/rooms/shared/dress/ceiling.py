"""#593: the room's ceiling, an old popcorn plaster in a smoked cream, at the back wall's own height
(build_room.py runs the back wall's paper to 12 units), with a stepped cornice of boards and beads
round the three walls where they meet it. Baked in its own atlas, so the popcorn's grain is the bake's.

    exec(open("ceiling.py").read(), g); g["dress_ceiling"](scene)
"""
import math

import bmesh
import bpy
from mathutils import Matrix

M = 3.11
TOP = 12.0                     # the back wall's paper ends here (build_room.py lightmaps.wallpaper z1)
CREAM = (0.62, 0.55, 0.42)     # old plaster, yellowed: lit by candles and a chandelier, not by day
CORNICE = (0.58, 0.52, 0.40)
# the cornice, top down, in wall space (w out of the wall, z down from the ceiling):
# (kind, w, depth below TOP, a, b) as side_walls._run takes them, a box's (depth out, height)
PROFILE = (
    ("box", 0.09, 0.03, 0.18, 0.06),     # the band against the ceiling
    ("bead", 0.18, 0.075, 0.032, None),
    ("box", 0.065, 0.14, 0.13, 0.09),
    ("bead", 0.13, 0.195, 0.024, None),
    ("box", 0.04, 0.27, 0.08, 0.11),     # the frieze
    ("bead", 0.08, 0.335, 0.016, None),
    ("box", 0.02, 0.365, 0.04, 0.03),
)


def _run(bm, length, top):
    for kind, out, below, a, b in PROFILE:
        z = top - below
        if kind == "box":
            r = bmesh.ops.create_cube(bm, size=1.0)
            mtx = Matrix.Translation((length / 2, out, z)) @ Matrix.Diagonal((length, a, b, 1))
        else:
            r = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=a, radius2=a, depth=length)
            mtx = Matrix.Translation((length / 2, out, z)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
        bmesh.ops.transform(bm, matrix=mtx, verts=r["verts"])


def _paint(name, colour, rough):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*colour, 1)
    p.inputs["Roughness"].default_value = rough
    return m


def _popcorn():
    """Cream plaster in clumps of 6 to 10 mm, the crevices between them a shade darker. Coordinates
    come from an attribute written at creation, since the bake's join moves the object's origin."""
    m = bpy.data.materials.get("ceiling_popcorn")
    if m:
        return m
    m = bpy.data.materials.new("ceiling_popcorn")
    m.use_nodes = True
    nt = m.node_tree
    n, ln = nt.nodes, nt.links
    p = n["Principled BSDF"]
    p.inputs["Roughness"].default_value = 0.95
    co = n.new("ShaderNodeAttribute")
    co.attribute_name = "ceil_co"
    vor = n.new("ShaderNodeTexVoronoi")
    vor.feature = "F1"
    vor.inputs["Scale"].default_value = 38.0
    vor.inputs["Randomness"].default_value = 1.0
    ln.new(co.outputs["Vector"], vor.inputs["Vector"])
    grit = n.new("ShaderNodeTexNoise")
    grit.inputs["Scale"].default_value = 140.0
    grit.inputs["Detail"].default_value = 3.0
    ln.new(co.outputs["Vector"], grit.inputs["Vector"])
    # a clump is high at its middle and falls to its edge
    clump = n.new("ShaderNodeMath")
    clump.operation = "SUBTRACT"
    clump.inputs[0].default_value = 1.0
    ln.new(vor.outputs["Distance"], clump.inputs[1])
    height = n.new("ShaderNodeMath")
    height.operation = "MULTIPLY_ADD"
    ln.new(grit.outputs["Fac"], height.inputs[0])
    height.inputs[1].default_value = 0.35
    ln.new(clump.outputs[0], height.inputs[2])
    bump = n.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.85
    bump.inputs["Distance"].default_value = 0.02
    ln.new(height.outputs[0], bump.inputs["Height"])
    ln.new(bump.outputs["Normal"], p.inputs["Normal"])
    # the crevices hold a little dust
    shade = n.new("ShaderNodeMapRange")
    shade.inputs["From Min"].default_value = 0.2
    shade.inputs["From Max"].default_value = 0.9
    shade.inputs["To Min"].default_value = 0.78
    shade.inputs["To Max"].default_value = 1.0
    ln.new(clump.outputs[0], shade.inputs["Value"])
    tint = n.new("ShaderNodeMix")
    tint.data_type = "RGBA"
    tint.blend_type = "MULTIPLY"
    tint.inputs["Factor"].default_value = 1.0
    tint.inputs["A"].default_value = (*CREAM, 1)
    ln.new(shade.outputs["Result"], tint.inputs["B"])
    ln.new(tint.outputs["Result"], p.inputs["Base Color"])
    return m


def dress_ceiling(scene, left_x=-7.89, right_x=9.89, back_y=0.5, front_y=-15.0, walls_front=-10.0, top=TOP):
    """The ceiling from wall to wall and from the back wall to past the opening view's camera
    (y -14.3), so a visitor looking up sees plaster; the cornice along the back wall and both side walls,
    as far as the side walls run (side_walls.py y0)."""
    root = bpy.data.objects.new("ceiling_dress", None)
    scene.collection.objects.link(root)
    me = bpy.data.meshes.new("ceiling_dress_plaster")
    # faces down, into the room
    me.from_pydata([(left_x, front_y, top), (left_x, back_y, top), (right_x, back_y, top), (right_x, front_y, top)],
                   [], [(0, 1, 2, 3)])
    me.update()
    if me.polygons[0].normal.z > 0:
        me.polygons[0].flip()
    attr = me.attributes.new("ceil_co", "FLOAT_VECTOR", "POINT")
    for i, v in enumerate(me.vertices):
        attr.data[i].vector = v.co
    me.materials.append(_popcorn())
    plaster = bpy.data.objects.new("ceiling_dress_plaster", me)
    scene.collection.objects.link(plaster)
    plaster.parent = root
    paint = _paint("ceiling_cornice", CORNICE, 0.8)
    # wall space, right-handed: u along the wall, w out of it into the room, z up
    walls = (
        ("back", Matrix(((-1, 0, 0, right_x), (0, -1, 0, back_y), (0, 0, 1, 0), (0, 0, 0, 1))), right_x - left_x),
        ("left", Matrix(((0, 1, 0, left_x), (-1, 0, 0, back_y), (0, 0, 1, 0), (0, 0, 0, 1))), back_y - walls_front),
        ("right", Matrix(((0, -1, 0, right_x), (1, 0, 0, walls_front), (0, 0, 1, 0), (0, 0, 0, 1))), back_y - walls_front),
    )
    for name, frame, length in walls:
        bm = bmesh.new()
        _run(bm, length, top)
        bmesh.ops.transform(bm, matrix=frame, verts=bm.verts)
        cm = bpy.data.meshes.new(f"ceiling_dress_cornice_{name}")
        bm.to_mesh(cm)
        bm.free()
        cm.materials.append(paint)
        o = bpy.data.objects.new(cm.name, cm)
        scene.collection.objects.link(o)
        o.parent = root
        bev = o.modifiers.new("soft", "BEVEL")
        bev.width, bev.segments, bev.limit_method = 0.01, 2, "ANGLE"
    return root
