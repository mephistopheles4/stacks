"""Where a room's bake reads its inputs from (spec #593 S4.4, S4.12).

Every input a bake reads outside git lives in `artifacts/rooms/<room>/`, placed there by
`fetch_inputs.py` or by hand, and named in `packages/site/rooms/<room>/inputs.json`. Nothing reads
the prototype's `.cache/`. `build_room.py --room <id>` sets STACKS_ROOM before any sibling module is
imported, so each one resolves the same folder.

Pure standard library: Blender's Python and the system Python both import it.
"""
import os

SHARED = os.path.dirname(os.path.abspath(__file__))
ROOMS = os.path.normpath(os.path.join(SHARED, ".."))  # packages/site/rooms
REPO = os.path.normpath(os.path.join(ROOMS, "..", "..", ".."))
ROOM = os.environ.get("STACKS_ROOM", "")


def room_dir(room=None):
    """packages/site/rooms/<room>: the scripts and the records of one room."""
    return os.path.join(ROOMS, room or ROOM)


def inputs_dir(room=None):
    """artifacts/rooms/<room>: the bake inputs outside git."""
    return os.path.join(REPO, "artifacts", "rooms", room or ROOM)


INPUTS = inputs_dir() if ROOM else ""
