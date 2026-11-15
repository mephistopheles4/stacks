"""PROTOTYPE for #593: surfaces baked as light only, textured sharp on the page.

A baked atlas spreads a 34-unit floor over a few thousand texels, so planks and a carpet's
animals blur. Here the floor and the rug bake only the light that reaches them (a DIFFUSE bake
with the colour pass off), and the page lays their own textures over it with three's `lightMap`:

    page = albedo (UV0, sharp, tiled or unique) x lightmap (UV1, soft) x tint

The lightmap is stored at half scale so irradiance up to 2 survives an 8-bit JPEG; the page
undoes that with `lightMapIntensity = 2 * PI` (MeshBasicMaterial divides the light map by PI).

Each object carries its files as custom properties (`albedo`, `lightmap`, `tint`), which the
glTF exporter writes as node extras and three reads back as `userData`.
"""
import math
import os
import shutil

import bmesh
import bpy
import numpy as np

UNITS_PER_M = 3.11
RUG_SIZE = (2.41 * UNITS_PER_M, 1.78 * UNITS_PER_M, 0.04)  # the Met carpet's 241 x 178 cm
PLANK_M = 1.34 * UNITS_PER_M  # the plank_flooring scan covers 1.34 m
FLOOR_TINT = (0.55, 0.5, 0.46)  # the scan is pale pine; this reads as old oak under a warm lamp
TEX = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".cache", "polyhaven")


def _keep_faces(o, keep):
    """Drop every face `keep(face)` refuses: a face hidden under another would overwrite its
    texels in the bake (the floor's underside maps to the same place as its top)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(f)], context="FACES")
    bm.to_mesh(o.data)
    bm.free()


def _set_uv(o, layer, fn):
    """fn(local co) -> (u, v), per loop."""
    uv = o.data.uv_layers[layer].data
    for loop in o.data.loops:
        uv[loop.index].uv = fn(o.data.vertices[loop.vertex_index].co)


def _image_material(material, name, path, tint, rough):
    """The bake sees the real albedo, so the light the floor bounces is the right colour."""
    m = material(name, (1, 1, 1), rough=rough)
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(path)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["B"].default_value = (*tint, 1)
    nt.links.new(uv.outputs["UV"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], mix.inputs["A"])
    nt.links.new(mix.outputs["Result"], p.inputs["Base Color"])
    return m


def _apply_modifiers(o):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def floor(o, wall_y, material, out_dir):
    """The floor box's top face only. UV0: world units / one plank scan, so the scan tiles at its
    real size. UV1: the floor's 34 x 22 plan."""
    o.name = "room_floor"
    _keep_faces(o, lambda f: f.normal.z > 0.5)
    mw = o.matrix_world
    o.data.uv_layers.new(name="bake")
    _set_uv(o, "UVMap", lambda co: ((mw @ co).x / PLANK_M, (mw @ co).y / PLANK_M))
    _set_uv(o, "bake", lambda co: (((mw @ co).x + 17) / 34, ((mw @ co).y - (wall_y - 22)) / 22))
    src = os.path.join(TEX, "plank_flooring", "diff.jpg")
    o.data.materials.clear()
    o.data.materials.append(_image_material(material, "floor_planks", src, FLOOR_TINT, rough=0.5))
    os.makedirs(os.path.join(out_dir, "tex"), exist_ok=True)
    shutil.copyfile(src, os.path.join(out_dir, "tex", "plank_flooring_diff.jpg"))
    return o, "tex/plank_flooring_diff.jpg", FLOOR_TINT


def rug(o, photo, material, out_dir, centre, turn):
    """The carpet photograph laid once across the rug, its long side along x, never mirrored.
    Its edges and bevels take the border's own colour. UV1 gets a fresh unwrap: the top face
    alone would leave the edges sharing its texels.

    `box()` bakes location and turn into the mesh, so the rug's own axes come from `centre`
    (x, y) and `turn` (radians); reading the mesh as if local laid one corner of the carpet."""
    o.name = "room_rug"
    _apply_modifiers(o)
    _keep_faces(o, lambda f: f.normal.z > -0.5)
    sx, sy, _ = RUG_SIZE
    c, s = math.cos(-turn), math.sin(-turn)

    def own(co):
        dx, dy = co.x - centre[0], co.y - centre[1]
        return dx * c - dy * s, dx * s + dy * c

    _set_uv(o, "UVMap", lambda co: (0.5 - own(co)[1] / sy, 0.5 + own(co)[0] / sx))
    o.data.uv_layers.active = o.data.uv_layers.new(name="bake")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")
    o.data.materials.clear()
    o.data.materials.append(_image_material(material, "rug_carpet", photo, (1, 1, 1), rough=1.0))
    img = o.data.materials[0].node_tree.nodes["Image Texture"].image
    rel = "tex/" + os.path.splitext(os.path.basename(photo))[0] + ".jpg"
    _save_jpeg(img, os.path.join(out_dir, rel), raw=True)
    return o, rel, (1.0, 1.0, 1.0)


def _save_jpeg(img, path, raw=False, quality=90):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    s = bpy.context.scene.render.image_settings
    s.file_format = "JPEG"
    s.color_mode = "RGB"
    s.quality = quality
    if raw:  # an sRGB photo: copy its bytes through the same encoding, no view transform
        view = bpy.context.scene.view_settings.view_transform
        bpy.context.scene.view_settings.view_transform = "Standard"
        img.save_render(path)
        bpy.context.scene.view_settings.view_transform = view
    else:
        img.save_render(path)


def bake_light(o, res, path):
    """Light only: direct and indirect diffuse, the surface's own colour left out."""
    img = bpy.data.images.new(f"{o.name}_light", res, res, float_buffer=True)
    for m in o.data.materials:
        n = m.node_tree.nodes.new("ShaderNodeTexImage")
        n.image = img
        m.node_tree.nodes.active = n
    o.data.uv_layers.active = o.data.uv_layers["bake"]
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bake = bpy.context.scene.render.bake
    bake.use_selected_to_active = False
    bake.use_pass_direct = True
    bake.use_pass_indirect = True
    bake.use_pass_color = False
    bake.margin = 8
    bpy.ops.object.bake(type="DIFFUSE")
    px = np.empty(res * res * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    peak = float(np.percentile(px[:, :3], 99.9))
    px[:, :3] *= 0.5
    img.pixels.foreach_set(px.ravel())
    _save_jpeg(img, path)
    print(f"[room] light {o.name}: 99.9th percentile irradiance {peak:.2f} (clips above 2.0)")
    return img


def finish(o, albedo, lightmap, tint):
    """Ship the mesh without an embedded image: the page fetches both textures by name."""
    m = bpy.data.materials.new(f"{o.name}_lightmapped")
    o.data.materials.clear()
    o.data.materials.append(m)
    # The exporter writes the active layer as TEXCOORD_0; left on "bake", the page laid the
    # carpet over the lightmap unwrap and showed one zoomed corner of it.
    uvs = o.data.uv_layers
    uvs.active = uvs["UVMap"]
    uvs["UVMap"].active_render = True
    o["albedo"] = albedo
    o["lightmap"] = lightmap
    o["tint"] = list(tint)
