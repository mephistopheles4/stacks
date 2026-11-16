"""PROTOTYPE for #593: the candles on the side table, built in metres.

Our own build. Poly Haven's `wooden_candlestick` (CC0) was looked at for proportion only. Two
turned brass candlesticks of different heights stand toward the back of the table's 38 cm top
and a burnt-down pillar candle sits on a saucer in front of them:

- each stick is one lathe profile: a stepped foot with eight soft lobes, knopped stem, drip pan
  and socket;
- each candle has burnt down unevenly: a melted crater with a ragged rim, a curled wick, and wax
  that ran down its side and, on one, pooled on the pan;
- each flame is a teardrop with a per-vertex `heat` (0 at the root, 1 at the tip) that its
  material reads as blue root, orange body and a yellow-white core. Flames let shadow rays
  through, so the point light at each one lights the wax round it. In the room the mesh is for
  look-dev only: build_room drops it and exports FLAME_ROOTS as `flame_*` empties, and the page
  draws a flame there that moves.

Everything stands on the origin (the table top's centre) with an identity transform, so a join
keeps object coordinates in metres. FLAMES lists where the lights go.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector

import hero_lamp as L

RNG = np.random.default_rng(1593)
FLAMES = []  # flame centres in metres, filled by build(): where the lights go
FLAME_ROOTS = []  # (root, height) in metres: where the page draws its animated flames
FLAME_H = 0.029


def _profile_a():
    """The tall stick: 20 cm to the socket's lip."""
    return [(0, 0.0), (0.046, 0.0), (0.048, 0.003), (0.047, 0.008), (0.040, 0.011), (0.036, 0.013),
            (0.035, 0.016), (0.028, 0.019), (0.018, 0.026), (0.012, 0.034), (0.010, 0.050),
            (0.015, 0.058), (0.016, 0.062), (0.011, 0.068), (0.0085, 0.080), (0.0085, 0.104),
            (0.013, 0.112), (0.019, 0.118), (0.020, 0.122), (0.013, 0.129), (0.009, 0.137),
            (0.009, 0.158), (0.012, 0.164), (0.016, 0.168), (0.030, 0.172), (0.033, 0.175),
            (0.032, 0.178), (0.016, 0.178), (0.0135, 0.182), (0.0135, 0.196), (0.0150, 0.198),
            (0.0145, 0.200), (0.0118, 0.200), (0.0118, 0.186), (0, 0.186)]


def _profile_b():
    """The short stick: a wide disc foot, a baluster and a deep pan, 12.5 cm."""
    return [(0, 0.0), (0.054, 0.0), (0.056, 0.003), (0.054, 0.007), (0.042, 0.009), (0.030, 0.012),
            (0.020, 0.016), (0.013, 0.022), (0.011, 0.030), (0.016, 0.040), (0.021, 0.050),
            (0.021, 0.058), (0.015, 0.068), (0.010, 0.078), (0.009, 0.088), (0.013, 0.093),
            (0.034, 0.098), (0.038, 0.103), (0.036, 0.106), (0.030, 0.104), (0.0135, 0.106),
            (0.0135, 0.121), (0.0150, 0.123), (0.0145, 0.125), (0.0118, 0.125), (0.0118, 0.112),
            (0, 0.112)]


def _lobes(a, z, below):
    return 1.0 + (0.035 * math.cos(8 * a) if z < below else 0.0)


def _candle(name, centre, foot, length, r, mat, burn=0.004):
    """A taper or pillar from `foot` up `length`, with a melted crater and a ragged rim."""
    top = foot + length
    phase = RNG.uniform(0, 2 * math.pi)

    def rag(a, z):  # the rim burns down unevenly; the side bulges a little where wax ran
        if z > top - 0.003:
            return 1.0 + 0.05 * math.sin(3 * a + phase) + 0.03 * math.sin(7 * a)
        return 1.0 + 0.012 * math.sin(2 * a + phase)

    prof = [(0, foot), (r, foot), (r * 0.985, top - 0.002), (r * 1.01, top - 0.0005),
            (r * 0.97, top), (r * 0.82, top - burn * 0.25), (r * 0.45, top - burn * 0.8),
            (r * 0.15, top - burn), (0, top - burn)]
    o = L._lathe(name, prof, mat, segs=40, centre=centre, shape=rag)
    return o, top - burn


def _drips(name, centre, r, top, bottom, mat, count, pool_z=None):
    """Runs of wax down the candle's side; the longest reaches the pan and pools there."""
    parts = []
    for k in range(count):
        a = RNG.uniform(0, 2 * math.pi)
        reach = top - bottom if (pool_z is not None and k == 0) else RNG.uniform(0.15, 0.55) * (top - bottom)
        n = 14
        pts = []
        for i in range(n + 1):
            t = i / n
            wob = 0.002 * math.sin(t * 9 + k)
            out = r + 0.0002 + 0.0006 * t  # half sunk: a raised run, not a rod laid on the side
            pts.append((centre[0] + out * math.cos(a + wob * 3), centre[1] + out * math.sin(a + wob * 3),
                        top + 0.0005 - reach * t))
        w = RNG.uniform(0.8, 1.25)
        parts.append(L._tube(f"{name}_drip{k}", pts,
                             lambda t, w=w: w * (0.0009 + 0.0004 * math.sin(t * 11) ** 2
                                                 + 0.0011 * L._smooth(t, 0.75, 1.0) ** 2),
                             mat, sides=8))
        if pool_z is not None and k == 0:
            bm = bmesh.new()
            bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=8, radius=1.0)
            px = centre[0] + (r + 0.006) * math.cos(a)
            py = centre[1] + (r + 0.006) * math.sin(a)
            for v in bm.verts:
                v.co = Vector((px + v.co.x * 0.009, py + v.co.y * 0.007, pool_z + max(v.co.z, -0.2) * 0.0022))
            parts.append(L._object(f"{name}_pool", bm, mat))
    return parts


def _wick(name, centre, base, mats):
    lean = RNG.uniform(0, 2 * math.pi)
    pts = [(centre[0] + 0.0012 * t * t * math.cos(lean), centre[1] + 0.0012 * t * t * math.sin(lean),
            base + 0.009 * t) for t in (i / 8 for i in range(9))]
    return L._tube(name, pts, 0.0006, mats["wick"], sides=6), Vector(pts[-1])


def _flame(name, tip, mat):
    """A teardrop round the wick's tip, its heat from 0 at the root to 1 at the point."""
    base = tip.z - 0.003
    prof = [(0, base), (0.0022, base + 0.0015), (0.0040, base + 0.0060), (0.0042, base + 0.0100),
            (0.0034, base + 0.0150), (0.0020, base + 0.0210), (0.0008, base + 0.0260), (0, base + 0.0290)]
    o = L._lathe(name, prof, mat, segs=20, centre=(tip.x, tip.y))
    heat = o.data.attributes.new("heat", "FLOAT", "POINT")
    for i, v in enumerate(o.data.vertices):
        heat.data[i].value = (v.co.z - base) / 0.029
    FLAMES.append(Vector((tip.x, tip.y, base + 0.009)))
    FLAME_ROOTS.append((Vector((tip.x, tip.y, base)), FLAME_H))
    return o


def materials():
    # the lamp's brass, so the room's metals match
    M = {"brass": bpy.data.materials.get("lamp_brass") or L.materials()["brass"]}

    m, nt = L._nodes("candle_wax")  # beeswax gone pale: a little light gets in
    p = nt.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (0.70, 0.60, 0.42, 1)
    p.inputs["Roughness"].default_value = 0.55
    p.inputs["Subsurface Weight"].default_value = 0.35
    p.inputs["Subsurface Radius"].default_value = (0.004, 0.0025, 0.0012)
    M["wax"] = m

    m, nt = L._nodes("candle_wick")
    p = nt.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (0.02, 0.015, 0.012, 1)
    p.inputs["Roughness"].default_value = 0.9
    M["wick"] = m

    m, nt = L._nodes("candle_flame")
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "heat"
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    # linear values: the bake stores sRGB and the page draws it unlit, so these land brighter
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, (0.02, 0.05, 0.35, 1)
    els[1].position, els[1].color = 1.0, (0.85, 0.25, 0.03, 1)
    e = els.new(0.16)
    e.color = (0.9, 0.35, 0.06, 1)
    e = els.new(0.45)
    e.color = (1.0, 0.78, 0.38, 1)
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 1.0
    path = nt.nodes.new("ShaderNodeLightPath")
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(attr.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
    nt.links.new(path.outputs["Is Shadow Ray"], mix.inputs["Fac"])
    nt.links.new(emit.outputs[0], mix.inputs[1])
    nt.links.new(clear.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
    M["flame"] = m
    return M


def _stick(tag, profile, at, socket_z, pan_z, candle_len, mats, drips, pool, lobed=True):
    parts = [L._lathe(f"stick_{tag}", profile, mats["brass"], segs=48, centre=at,
                      shape=(lambda a, z: _lobes(a, z, 0.012)) if lobed else None)]
    r = 0.0115
    candle, crater = _candle(f"candle_{tag}", at, socket_z - 0.012, candle_len + 0.012, r, mats["wax"])
    parts.append(candle)
    top = socket_z + candle_len
    parts += _drips(f"candle_{tag}", at, r, top, socket_z, mats["wax"], drips, pool_z=pan_z if pool else None)
    wick, tip = _wick(f"wick_{tag}", at, crater, mats)
    parts.append(wick)
    parts.append(_flame(f"flame_{tag}", tip, mats["flame"]))
    return parts


def build(collection=None, mats=None):
    """Every part, in metres round the table top's centre. Back is +y (the wall)."""
    L._coll = collection
    FLAMES.clear()
    FLAME_ROOTS.clear()
    mats = mats or materials()
    parts = []
    parts += _stick("a", _profile_a(), (-0.07, 0.055), 0.186, 0.175, 0.15, mats, drips=4, pool=True)
    parts += _stick("b", _profile_b(), (0.075, 0.07), 0.112, 0.103, 0.095, mats, drips=3, pool=False,
                    lobed=False)  # lobes on a wide disc foot read as a melted blob
    # a burnt-down pillar on a brass saucer, in front
    at = (-0.005, -0.085)
    saucer = [(0, 0.0), (0.040, 0.0), (0.046, 0.004), (0.048, 0.010), (0.046, 0.011), (0.040, 0.006),
              (0.0, 0.006)]
    parts.append(L._lathe("saucer", saucer, mats["brass"], segs=48, centre=at))
    pillar, crater = _candle("pillar", at, 0.006, 0.058, 0.026, mats["wax"], burn=0.009)
    parts.append(pillar)
    parts += _drips("pillar", at, 0.026, 0.064, 0.006, mats["wax"], 3, pool_z=0.006)
    wick, tip = _wick("wick_p", at, crater, mats)
    parts += [wick, _flame("flame_p", tip, mats["flame"])]
    return parts
