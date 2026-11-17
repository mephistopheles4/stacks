"""The side walls dressed as the back wall is in build_room.py: the painted dado below, a dado rail
(board, bead and cove) 95 cm up, Morris's Willow above it at its real repeat, and the skirting.
Lit, not baked: this is the audition scene. Measures copied from build_room.py, in scene units.

    exec(open("side_walls.py").read(), g); g["dress_side_walls"](scene, willow_path)
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

M = 3.11
DADO = 0.95 * M
WALL_TINT = (0.035, 0.05, 0.045)          # build_room.py M_WALL: the painted dado
SKIRT = (0.03, 0.04, 0.036)               # M_SKIRT: rail and skirting
WALLPAPER_TINT = (0.15, 0.14, 0.135)      # Willow's cream smoked to the room's darkness
TILE = (0.288 * M, 0.450 * M)             # one repeat of the paper


def _principled(name, colour, rough):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*colour, 1)
    p.inputs["Roughness"].default_value = rough
    return m


def _wallpaper_mat(path):
    m = bpy.data.materials.get("side_wallpaper")
    if m:
        return m
    m = bpy.data.materials.new("side_wallpaper")
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Roughness"].default_value = 0.85
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(path, check_existing=True)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["B"].default_value = (*WALLPAPER_TINT, 1)
    nt.links.new(tex.outputs["Color"], mix.inputs["A"])
    nt.links.new(mix.outputs["Result"], p.inputs["Base Color"])
    return m


def _run(bm, length, profile):
    """Boxes and cylinders running the wall's length, in wall space: u along the wall, w out of it."""
    for kind, out, z, a, b in profile:
        if kind == "box":     # a: depth out of the wall, b: height
            r = bmesh.ops.create_cube(bm, size=1.0)
            mtx = Matrix.Translation((length / 2, out, z)) @ Matrix.Diagonal((length, a, b, 1))
        else:                 # a bead: a radius
            r = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=a, radius2=a, depth=length)
            mtx = Matrix.Translation((length / 2, out, z)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
        bmesh.ops.transform(bm, matrix=mtx, verts=r["verts"])


def _wall(scene, name, face_x, inward, y0, y1, top, paper):
    """One side wall's dressing. face_x: its inner face; inward: +1 if the room is at larger x."""
    root = bpy.data.objects.new(name, None)
    scene.collection.objects.link(root)
    # wall space, right-handed: u along the wall, w out of it into the room, z up. On the left wall
    # (room at +x) u runs along -y from y1; on the right wall along +y from y0.
    if inward > 0:
        root.matrix_world = Matrix(((0, 1, 0, face_x), (-1, 0, 0, y1), (0, 0, 1, 0), (0, 0, 0, 1)))
    else:
        root.matrix_world = Matrix(((0, -1, 0, face_x), (1, 0, 0, y0), (0, 0, 1, 0), (0, 0, 0, 1)))
    L = y1 - y0
    skirt = _principled("side_skirting", SKIRT, 0.6)
    bm = bmesh.new()
    _run(bm, L, [("box", 0.03, DADO, 0.06, 0.16),                 # the rail's board
                 ("bead", 0.062, DADO + 0.045, 0.028, None),      # its bead along the top
                 ("box", 0.015, DADO - 0.1, 0.03, 0.05),          # the cove under it
                 ("box", 0.06, 0.225, 0.12, 0.45)])               # the skirting
    me = bpy.data.meshes.new(name + "_trim")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(skirt)
    trim = bpy.data.objects.new(name + "_trim", me)
    scene.collection.objects.link(trim)
    trim.parent = root
    bev = trim.modifiers.new("soft", "BEVEL")
    bev.width, bev.segments, bev.limit_method = 0.012, 3, "ANGLE"
    # the painted dado: a quad 1 mm proud of the old wall's face. The paper above it is not made
    # here: build_room.py makes it as it makes the back wall's (lightmaps.side_wallpaper), a sharp
    # tiled repeat with its light baked apart, from what `scene["side_paper"]` records
    z0 = DADO + 0.08
    me = bpy.data.meshes.new(name + "_paper")
    me.from_pydata([(0, 0.003, 0), (L, 0.003, 0), (L, 0.003, z0), (0, 0.003, z0)], [], [(0, 3, 2, 1)])
    me.uv_layers.new(name="UVMap")
    me.materials.append(_principled("side_dado_paint", WALL_TINT, 0.9))
    o = bpy.data.objects.new(name + "_paper", me)
    scene.collection.objects.link(o)
    o.parent = root
    # the faces must point into the room
    me.update()
    world_n = (root.matrix_world.to_3x3() @ me.polygons[0].normal)
    if world_n.x * inward < 0:
        for poly in me.polygons:
            poly.flip()
    return root


def dress_side_walls(scene, willow_path, left_x=-7.89, right_x=9.89, y0=-13.0, y1=0.5, top=12.0):  # the back wall's height, up to the ceiling
    paper = _wallpaper_mat(willow_path)
    for w in ("L_left_wall", "L_right_wall"):   # the old block-out faces become the painted dado's backing
        o = scene.objects.get(w)
        if o:
            o.data.materials.clear()
            o.data.materials.append(_principled("side_dado_paint", WALL_TINT, 0.9))
    # where each side's paper goes, 1 mm proud of the old wall's face: (name, face x, inward, y0, y1,
    # z0, top), read by build_room.py
    z0 = DADO + 0.08
    import json  # an ID property holds no mixed list, so the records go as JSON
    scene["side_paper"] = json.dumps([["room_wallpaper_left", left_x + 0.003, 1, y0, y1, z0, top],
                                      ["room_wallpaper_right", right_x - 0.003, -1, y0, y1, z0, top]])
    # the side walls run on to y0, where the room's front wall closes them: the back wall's own pieces
    # (build_room.py builds them from this record, as it builds the papered strips above). Its trim
    # runs to the side walls' middles, inside their bodies; its paper to 0.0045 units (about 1.4 mm)
    # past their inner faces, behind the side paper, so no sliver of the void shows in the corner
    scene["front_wall"] = json.dumps({"y": y0, "trim_x": [left_x - 0.16, right_x + 0.16],
                                      "paper_x": [left_x - 0.0045, right_x + 0.0045], "z0": z0, "top": top})
    return [_wall(scene, "left_wall_dress", left_x, 1, y0, y1, top, paper),
            _wall(scene, "right_wall_dress", right_x, -1, y0, y1, top, paper)]
