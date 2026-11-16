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

import bmesh
import bpy
import numpy as np

UNITS_PER_M = 3.11
RUG_SIZE = (2.41 * UNITS_PER_M, 1.78 * UNITS_PER_M, 0.04)  # the Met carpet's 241 x 178 cm
PLANK_M = 1.34 * UNITS_PER_M  # the plank_flooring scan covers 1.34 m
FLOOR_TINT = (0.55, 0.5, 0.46)  # the scan is pale pine; this reads as old oak under a warm lamp
from room_paths import INPUTS  # noqa: E402
TEX = os.path.join(INPUTS, "polyhaven")


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
    save_image(bpy.data.images.load(src), os.path.join(out_dir, "tex", "plank_flooring_diff.webp"), raw=True)
    return o, {"albedo": "tex/plank_flooring_diff.webp", "tint": list(FLOOR_TINT)}


def wallpaper(wall_y, x_span, z0, z1, scan, tile_m, tint, material, out_dir):
    """The papered wall above the dado rail: one quad facing the room. UV0: world units / one
    repeat of the paper, so it tiles at its real size and stays sharp; UV1: the quad itself."""
    x0, x1 = x_span
    me = bpy.data.meshes.new("room_wallpaper")
    # counter-clockwise seen from the room (-y), so the face points at it
    me.from_pydata([(x0, wall_y, z0), (x1, wall_y, z0), (x1, wall_y, z1), (x0, wall_y, z1)], [], [(0, 1, 2, 3)])
    o = bpy.data.objects.new("room_wallpaper", me)
    bpy.context.scene.collection.objects.link(o)
    me.uv_layers.new(name="UVMap")
    me.uv_layers.new(name="bake")
    tw, th = tile_m[0] * UNITS_PER_M, tile_m[1] * UNITS_PER_M
    _set_uv(o, "UVMap", lambda co: (co.x / tw, (co.z - z0) / th))
    _set_uv(o, "bake", lambda co: ((co.x - x0) / (x1 - x0), (co.z - z0) / (z1 - z0)))
    o.data.materials.append(_image_material(material, "wallpaper", scan, tint, rough=0.85))
    rel = "tex/" + os.path.splitext(os.path.basename(scan))[0] + ".webp"
    save_image(bpy.data.images.load(scan), os.path.join(out_dir, rel), raw=True)
    return o, {"albedo": rel, "tint": list(tint)}


def side_wallpaper(name, face_x, inward, y_span, z0, z1, scan, tile_m, tint, material, out_dir):
    """A side wall's paper, made as the back wall's is (`wallpaper`): one quad in the plane x =
    face_x facing the room (+x when `inward` > 0), UV0 tiling the paper at its real size from the
    same row height as the back wall's, so the rows meet at the corners, read left to right from
    the room; UV1 the quad itself, for the light bake."""
    y0, y1 = y_span
    me = bpy.data.meshes.new(name)
    quad = [(face_x, y0, z0), (face_x, y1, z0), (face_x, y1, z1), (face_x, y0, z1)]
    me.from_pydata(quad, [], [(0, 1, 2, 3) if inward > 0 else (3, 2, 1, 0)])
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.uv_layers.new(name="UVMap")
    me.uv_layers.new(name="bake")
    tw, th = tile_m[0] * UNITS_PER_M, tile_m[1] * UNITS_PER_M
    along = 1.0 if inward > 0 else -1.0  # facing -x the room's right is +y; facing +x it is -y
    _set_uv(o, "UVMap", lambda co: (along * co.y / tw, (co.z - z0) / th))
    _set_uv(o, "bake", lambda co: ((co.y - y0) / (y1 - y0), (co.z - z0) / (z1 - z0)))
    o.data.materials.append(_image_material(material, name, scan, tint, rough=0.85))
    rel = "tex/" + os.path.splitext(os.path.basename(scan))[0] + ".webp"
    return o, {"albedo": rel, "tint": list(tint)}


def save_image(img, path, raw=False, quality=85):
    """JPEG or WebP, by the path's extension. The room ships WebP: about a third smaller than
    JPEG at the same look, and a plain same-origin file the site's CSP allows (an image packed
    in the GLB is read through a blob: URL, which `connect-src 'self'` refuses)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    s = bpy.context.scene.render.image_settings
    s.file_format = "WEBP" if path.lower().endswith(".webp") else "JPEG"
    s.color_mode = "RGB"
    s.quality = quality
    if raw:  # an sRGB photo: copy its bytes through the same encoding, no view transform
        view = bpy.context.scene.view_settings.view_transform
        bpy.context.scene.view_settings.view_transform = "Standard"
        img.save_render(path)
        bpy.context.scene.view_settings.view_transform = view
    else:
        img.save_render(path)


def bake_light(o, res, path, scale=2.0):
    """Light only: direct and indirect diffuse, the surface's own colour left out. Stored as
    irradiance / `scale`, so up to `scale` survives 8 bits; the page multiplies it back (the
    wall beside the lamp reaches 3.4, and at 2 it clipped to a flat orange)."""
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
    px[:, :3] *= 1 / scale
    img.pixels.foreach_set(px.ravel())
    save_image(img, path)
    print(f"[room] light {o.name}: 99.9th percentile irradiance {peak:.2f} (clips above {scale})")
    return img


def finish(o, extras, lightmap):
    """Ship the mesh without an embedded image: the page fetches both textures by name."""
    m = bpy.data.materials.new(f"{o.name}_lightmapped")
    o.data.materials.clear()
    o.data.materials.append(m)
    # The exporter writes the active layer as TEXCOORD_0; left on "bake", the page laid the
    # carpet over the lightmap unwrap and showed one zoomed corner of it.
    uvs = o.data.uv_layers
    uvs.active = uvs["UVMap"]
    uvs["UVMap"].active_render = True
    for key, value in extras.items():
        o[key] = value
    o["lightmap"] = lightmap
