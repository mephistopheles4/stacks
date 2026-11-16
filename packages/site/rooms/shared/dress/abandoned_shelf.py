"""#593: where the abandoned books' bookcase stands, against the right wall where the block-out's box
stood. The room bakes nothing here: the page builds the bookcase live, a second copy of the shelf's
own (`scene.ts` `buildShelf`), at `slot_abandoned`, with the vault's abandoned books on it the way
the rest go on the shelf. It is locked at two rows (room-abandoned-593.ts ABANDONED_ROWS), so the
clock and the encyclopedias can be baked on its top, which this returns.

    exec(open("abandoned_shelf.py").read(), g); g["place_abandoned_slot"](scene)
"""
import math

import bpy

# bookcase.ts SHELF, scene units
ROW_HEIGHT = 1.12
DEPTH = 0.72
PLANK = 0.07
BACK = 0.05

ROWS = 2                   # room-abandoned-593.ts ABANDONED_ROWS: never more, never fewer
TRIM_X = 9.77              # the right wall's skirting and dado rail, where they stand out furthest
CENTRE_Y = -4.0            # the block-out box's middle
YAW = -90.0                # its front faces the room (-x); its back is against the wall


def place_abandoned_slot(scene):
    """`slot_abandoned` at the bookcase's footprint's middle on the floor, turned as its group is: its
    front, the shelf's +z, toward the room, its back 2 cm clear of the wall's trim. Returns the top
    plank's height and the footprint's middle, x."""
    slot = bpy.data.objects.new("slot_abandoned", None)
    slot.empty_display_type = "ARROWS"
    # the backboard is centred on the back edge, so it stands half its thickness past the depth
    slot.location = (TRIM_X - DEPTH / 2 - BACK / 2 - 0.02, CENTRE_Y, 0.0)
    slot.rotation_euler = (0.0, 0.0, math.radians(YAW))
    scene.collection.objects.link(slot)
    return ROWS * ROW_HEIGHT + PLANK / 2, slot.location.x
