"""#593: the Smithsonian chair's stuff-over seat, rebuilt. The scan keeps its carved walnut (crest,
splat, stiles, knees, paw feet), but its upholstery, cloth and nails fused into one surface with the
rails, cannot be told apart from the wood by any rule we tried. So the seat is cut out and made
again here: a padded cushion over the scan's own outline, its sides rolled down to a close-nailed row
of brass dome heads, after the museum's photographs. Our model, credited as the chair's seat.

rebuild_seat(root) works on the chair's pivot (`P_L_desk_chair`). All measurements are in the
pivot's frame in real millimetres: x across the seat (+x the chair's left), y from front (-) to back
(+), z up from the floor; read off the scan at its own seat."""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

M = 3.11
CX = -3.5                  # the seat's centre line, x
FRONT, BACK = -263.0, 197.0  # y of the cloth's front at the nailing, and the seat's back, just inside the back rail
STILES = 163.0             # y where the back stiles start: the nailing stops short of them
STILE_ZONE = 150.0         # behind this the stiles pass through the cushion: the scan is cut only under our cloth
DIP = (80.0, 122.0, 42.0)  # the side rails' top dips toward the back legs: from y, to y, by mm


def half_width(y):
    """Half the seat's width across its cloth sides at mid-height: it narrows to the back."""
    return 239.0 - 0.15 * y


STANDOFF = 3.0  # our cloth stands this far outside the scan's, so nothing of the scan shows through
# the cloth's side, bottom to top: (z, how far out of the mid-height line), rolling over onto the top
PROFILE = ((344, -12), (344, -4), (353, -2), (370, 0), (400, 3), (425, 2.5), (437, 0), (446, -5), (452, -12), (456, -21))
TOP_IN = -30.0     # where the top's flat begins, inside the mid-height line
TOP_EDGE = 458.0   # the top's height at its edge, at the front
SAG = 12.0         # how much lower the top's edge is at the back
CROWN = (10.0, 4.0)  # the top's dome above its edge, front and back
NAIL_Z = 353.0
NAIL = (4.4, 2.6, 8.8)  # a dome head's radius, its height and the spacing of the row: heads touching
DROP = 8.0         # how far outside the scan's cloth its seat is cut away (its nails stand about 5 mm out)


def _dip(y, z):
    """How far down the cloth's foot and the nailing come toward the back legs, following the scan's
    side rails; the higher up the side, the less, so the top is untouched."""
    a, b, depth = DIP
    t = min(max((y - a) / (b - a), 0.0), 1.0)
    # and none behind the stiles: the cushion's back drops only to the back rail's top, never below it
    t *= 1.0 - min(max((y - STILES - 5.0) / 15.0, 0.0), 1.0)
    return -depth * t * t * (3 - 2 * t) * min(max((410.0 - z) / 57.0, 0.0), 1.0)


def _cloth(z):
    """How far out of the mid-height line our cloth stands at height z (before the dip), or None
    below its foot."""
    if z < PROFILE[0][0] - 2:
        return None
    pts = PROFILE[1:]
    for (za, oa), (zb, ob) in zip(pts, pts[1:]):
        if z <= zb:
            t = min(max((z - za) / (zb - za), 0.0), 1.0)
            return STANDOFF + oa + (ob - oa) * t
    return STANDOFF + pts[-1][1]


def _sag(v, z):
    """How far down a point of the side or top moves at depth v (0 front, 1 back): the top slopes to
    the back rail, and the side's roll comes down with it, the more the higher it is."""
    return -SAG * v ** 1.5 * min(max((z - 400.0) / 58.0, 0.0), 1.0)


def _top(u, v):
    su = math.sin(math.pi * u) ** 0.5
    sv = math.sin(math.pi / 2 * min(v / 0.15, 1.0)) ** 0.5
    return TOP_EDGE + _sag(v, TOP_EDGE) + (CROWN[0] * (1 - v) + CROWN[1] * v) * su * sv


def _at(u, v, out):
    """The point at (u across, v back) on the outline `out` mm outside the mid-height line."""
    y = (FRONT - out) * (1 - v) + BACK * v
    return CX + (2 * u - 1) * (half_width(y) + out), y


def _ring_params(nu, nv):
    """The (u, v) of a grid's boundary, in order round it: front, right side, back, left side."""
    ps = [(i / nu, 0.0) for i in range(nu)]
    ps += [(1.0, j / nv) for j in range(nv)]
    ps += [(1 - i / nu, 1.0) for i in range(nu)]
    ps += [(0.0, 1 - j / nv) for j in range(nv)]
    return ps


def _cushion(nu=48, nv=40):
    bm = bmesh.new()
    o_top = STANDOFF + TOP_IN
    grid = [[None] * (nv + 1) for _ in range(nu + 1)]
    for i in range(nu + 1):
        for j in range(nv + 1):
            u, v = i / nu, j / nv
            x, y = _at(u, v, o_top)
            grid[i][j] = bm.verts.new((x, y, _top(u, v)))
    for i in range(nu):
        for j in range(nv):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    edge = []
    for u, v in _ring_params(nu, nv):
        edge.append(grid[round(u * nu)][round(v * nv)])
    rings = []
    for z, out in PROFILE:
        ring = []
        for u, v in _ring_params(nu, nv):
            x, y = _at(u, v, STANDOFF + out)
            ring.append(bm.verts.new((x, y, z + _sag(v, z) + _dip(y, z))))
        rings.append(ring)
    rings.append(edge)
    n = len(edge)
    for a, b in zip(rings, rings[1:]):
        for k in range(n):
            bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def _row():
    """The nailing's path on the cloth's face, from the left stile round the front to the right stile,
    dipping with the side rails toward the back legs: (point, outward normal) every NAIL[2] mm."""
    out = STANDOFF + PROFILE[2][1] + NAIL[1] * 0.15
    v_stile = (STILES - (FRONT - out)) / (BACK - (FRONT - out))
    corners = [_at(0.0, v_stile, out), _at(0.0, 0.0, out), _at(1.0, 0.0, out), _at(1.0, v_stile, out)]
    dense = []
    for (ax, ay), (bx, by) in zip(corners, corners[1:]):
        a, b = Vector((ax, ay, 0)), Vector((bx, by, 0))
        d = b - a
        normal = Vector((d.y, -d.x, 0)).normalized()  # the path runs clockwise seen from above: right of it is out
        n = max(1, round(d.length))
        for k in range(n):
            q = a + d * (k / n)
            dense.append((Vector((q.x, q.y, NAIL_Z + _dip(q.y, NAIL_Z))), normal))
    pts, run = [], NAIL[2] / 2
    for (p, n), (q, _) in zip(dense, dense[1:]):
        run += (q - p).length
        if run >= NAIL[2]:
            pts.append((p, n))
            run -= NAIL[2]
    return pts


def _nails(seg=10, rings=3):
    bm = bmesh.new()
    r, h, _ = NAIL
    for c, n in _row():
        up = Vector((0, 0, 1))
        t = up.cross(n).normalized()
        frame = Matrix((t, up, n)).transposed()
        apex = bm.verts.new(c + n * h)
        loops = []
        for k in range(1, rings + 1):
            phi = math.pi / 2 * k / rings
            loop = []
            for s in range(seg):
                th = 2 * math.pi * s / seg
                p = Vector((r * math.sin(phi) * math.cos(th), r * math.sin(phi) * math.sin(th), h * math.cos(phi) - 0.6))
                loop.append(bm.verts.new(c + frame @ p))
            loops.append(loop)
        for s in range(seg):
            bm.faces.new((apex, loops[0][s], loops[0][(s + 1) % seg]))
        for a, b in zip(loops, loops[1:]):
            for s in range(seg):
                bm.faces.new((a[s], b[s], b[(s + 1) % seg], a[(s + 1) % seg]))
    return bm


def _inside(p, n):
    """Whether a scan face at p (pivot mm) with normal n is the scan's seat, to be cut away: anything
    under our cloth, and above the nailing the scan's own cloth where it bulges a little past ours. Never
    a face outside our cloth below that, nor among the stiles, so the knees' carving and the back legs
    keep every face they show."""
    if not (FRONT - DROP <= p.y <= BACK - 7.0):
        return False
    z = p.z - _dip(p.y, p.z)  # the height the cloth's profile is read at
    cloth = _cloth(z)
    if cloth is None:
        return False
    d = max(abs(p.x - CX) - half_width(p.y), FRONT - p.y)  # how far out of the mid-height line
    v = (p.y - (FRONT - DROP)) / (BACK - (FRONT - DROP))
    w = half_width(p.y) + DROP
    u = min(max((p.x - CX) / (2 * w) + 0.5, 0.0), 1.0)
    top = _top(u, min(max(v, 0.0), 1.0))
    # the scan's own cloth can bulge above ours: an upward face just above the top, short of the back
    # rail and the splat's shoe, is cloth too
    if p.z >= top + 3.0 and not (p.z < top + 10.0 and n.z > 0.5 and p.y < STILE_ZONE):
        return False
    if p.y > STILE_ZONE or z < NAIL_Z + 9.0:
        return d < cloth - 0.5
    return d < DROP


def _mesh(name, bm, ref, to_ref, material):
    bm.transform(to_ref)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(material)
    # the shading reads the scan's object space from attributes (chair_texture.store_coords): the
    # seat is built in the scan's own space, so the damask lands at the scale the scan was textured in
    co = [0.0] * (3 * len(me.vertices))
    me.vertices.foreach_get("co", co)
    me.attributes.new("chair_co", "FLOAT_VECTOR", "POINT").data.foreach_set("vector", co)
    no = [0.0] * (3 * len(me.loops))
    me.corner_normals.foreach_get("vector", no)
    me.attributes.new("chair_no", "FLOAT_VECTOR", "CORNER").data.foreach_set("vector", no)
    o = bpy.data.objects.new(name, me)
    for c in ref.users_collection:
        c.objects.link(o)
    o.parent = ref.parent
    o.matrix_parent_inverse = ref.matrix_parent_inverse.copy()
    o.matrix_basis = ref.matrix_basis.copy()
    return o


def rebuild_seat(root, damask, brass, meshes=None):
    """Cut the scan's seat out of `meshes` (default: every mesh under `root`), leave the rest of it all
    wood (material 0), and add our cushion (`damask`) and nail heads (`brass`) beside them."""
    bpy.context.view_layer.update()
    meshes = meshes or [o for o in root.children_recursive if o.type == "MESH"]
    mm = root.matrix_world.to_scale().x / M * 1000.0  # real mm per pivot unit
    to_pivot = Matrix.Scale(mm, 4) @ root.matrix_world.inverted()
    cut = 0
    for o in meshes:
        to_mm = to_pivot @ o.matrix_world
        rot = to_mm.to_3x3().normalized()
        bm = bmesh.new()
        bm.from_mesh(o.data)
        doomed = [f for f in bm.faces if _inside(to_mm @ f.calc_center_median(), (rot @ f.normal).normalized())]
        cut += len(doomed)
        bmesh.ops.delete(bm, geom=doomed, context="FACES")
        for f in bm.faces:
            f.material_index = 0
        bm.to_mesh(o.data)
        bm.free()
    ref = max(meshes, key=lambda o: len(o.data.polygons))
    to_ref = ref.matrix_world.inverted() @ root.matrix_world @ Matrix.Scale(1.0 / mm, 4)
    cushion = _mesh("chair_seat", _cushion(), ref, to_ref, damask)
    nails = _mesh("chair_seat_nails", _nails(), ref, to_ref, brass)
    return {"cut_faces": cut, "cushion": len(cushion.data.polygons), "nails": len(_row())}
