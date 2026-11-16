"""Fetch and check a room's bake inputs (spec #593 S4.12).

  python packages/site/rooms/shared/fetch_inputs.py <room>            fetch what is missing, check everything
  python packages/site/rooms/shared/fetch_inputs.py <room> --check    check only, never touch the network
                                                                      (a fetched file that differs is still deleted)

`packages/site/rooms/<room>/inputs.json` names every bake input that lives outside git: its page
URL, licence, author, SHA-256, destination file name and, for one that can be fetched, its download
URL. Inputs land in `artifacts/rooms/<room>/`, which is gitignored.

What this script will and will not do, each a control in the threat model's bake-input hosts line:

* It takes every destination from inputs.json alone, and refuses a name that is absolute, holds a
  drive letter, a backslash, an empty or `.` or `..` segment, or that resolves (symlinks included)
  outside `artifacts/rooms/<room>/`.
* It fetches over HTTPS only, from the hosts in FETCH_HOSTS, and refuses a redirect that leaves
  HTTPS or those hosts. It sends no credential and reads no token: an input that needs an account
  is marked `"manual": true` and placed by hand.
* A fetched file is hashed as it arrives, in a temporary file beside its destination, and renamed
  into place only when its SHA-256 matches; one that differs is deleted and the run refuses. A
  fetched file already in place with a different hash is deleted and the run refuses too.
* A hand-placed input is checked against its SHA-256: a mismatch or a missing file refuses, and the
  file is never deleted.
* `verify_room` is the same check without the network, and `build_room.py` refuses to bake until
  it passes.

Standard library only, so Blender's Python and any system Python run it.
"""
import hashlib
import http.client
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOMS = os.path.normpath(os.path.join(HERE, ".."))
REPO = os.path.normpath(os.path.join(ROOMS, "..", "..", ".."))

# The hosts a bake input may be fetched from: the threat model's bake-input hosts (S4.15).
FETCH_HOSTS = frozenset({"dl.polyhaven.org", "images.metmuseum.org", "upload.wikimedia.org"})
MAX_BYTES = 256 * 1024 * 1024
TIMEOUT = 60
ROOM_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")


class Refused(Exception):
    """An input that must not be used: the run reports it and exits non-zero."""


def room_id(room):
    if not isinstance(room, str) or not ROOM_ID.match(room):
        raise Refused(f"not a room id: {room!r}")
    return room


def inputs_file(room):
    return os.path.join(ROOMS, room_id(room), "inputs.json")


def inputs_root(room):
    return os.path.join(REPO, "artifacts", "rooms", room_id(room))


def safe_dest(root, dest):
    """The absolute path of `dest` under `root`, or Refused: the name comes from inputs.json alone."""
    if not isinstance(dest, str) or not dest:
        raise Refused(f"destination is not a name: {dest!r}")
    if "\x00" in dest or "\\" in dest or ":" in dest or dest.startswith("/") or dest.startswith("~"):
        raise Refused(f"destination escapes the inputs folder: {dest!r}")
    parts = dest.split("/")
    if any(p in ("", ".", "..") for p in parts):
        raise Refused(f"destination escapes the inputs folder: {dest!r}")
    real_root = os.path.realpath(root)
    target = os.path.realpath(os.path.join(real_root, *parts))
    if os.path.commonpath([real_root, target]) != real_root or target == real_root:
        raise Refused(f"destination resolves outside the inputs folder: {dest!r}")
    return target


def load_entries(room):
    """inputs.json's entries, shape-checked. Raises Refused on a file that is not usable."""
    path = inputs_file(room)
    try:
        with open(path, encoding="utf-8") as f:
            doc = json.load(f)
    except (OSError, ValueError) as e:
        raise Refused(f"cannot read {path}: {e}")
    entries = doc.get("inputs") if isinstance(doc, dict) else None
    if not isinstance(entries, list) or not entries:
        raise Refused(f"{path} has no inputs list")
    seen = set()
    for e in entries:
        if not isinstance(e, dict):
            raise Refused("an inputs entry is not an object")
        if not isinstance(e.get("dest"), str):
            raise Refused("an inputs entry has no destination that is a string")
        if not isinstance(e.get("sha256"), str) or not SHA256.match(e["sha256"]):
            raise Refused(f"{e.get('dest')!r}: sha256 is not 64 lowercase hex digits")
        if e.get("manual") is not True:
            check_url(e.get("url"), e.get("dest"))
        if e["dest"] in seen:
            raise Refused(f"{e['dest']!r} is named twice")
        seen.add(e["dest"])
    return entries


def check_url(url, label=None):
    p = urllib.parse.urlsplit(url) if isinstance(url, str) else None
    if not p or p.scheme != "https" or p.hostname not in FETCH_HOSTS or p.username or p.password:
        raise Refused(f"{label!r}: fetch url must be https on one of {sorted(FETCH_HOSTS)}: {url!r}")


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class _SameRules(urllib.request.HTTPRedirectHandler):
    """A redirect keeps the rules: HTTPS, and a host on the list."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_url(newurl, req.full_url)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _download(url, tmp):
    opener = urllib.request.build_opener(_SameRules)
    req = urllib.request.Request(url, headers={"User-Agent": "stacks-room-inputs/1"})
    h = hashlib.sha256()
    size = 0
    with opener.open(req, timeout=TIMEOUT) as r, open(tmp, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_BYTES:
                raise Refused(f"{url}: larger than {MAX_BYTES} bytes")
            h.update(chunk)
            f.write(chunk)
    return h.hexdigest()


def fetch_room(room, network=True):
    """Fetch what is missing and check every input. Returns the list of problems (empty = passed)."""
    problems = []
    try:
        entries = load_entries(room)
    except Refused as e:
        return [str(e)]
    root = inputs_root(room)
    os.makedirs(root, exist_ok=True)
    for e in entries:
        dest = e["dest"]
        try:
            target = safe_dest(root, dest)
        except Refused as ex:
            problems.append(str(ex))
            continue
        manual = e.get("manual") is True
        if os.path.isfile(target):
            have = sha256_of(target)
            if have == e["sha256"]:
                continue
            if manual:
                problems.append(f"{dest}: hand-placed file does not match its SHA-256 (left in place)")
                continue
            os.remove(target)
            problems.append(f"{dest}: fetched file did not match its SHA-256 and was deleted")
            continue
        if manual:
            problems.append(f"{dest}: hand-placed input is missing ({e.get('page')})")
            continue
        if not network:
            problems.append(f"{dest}: missing (run fetch_inputs.py {room})")
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        tmp = target + f".part-{os.getpid()}"
        try:
            got = _download(e["url"], tmp)
            if got != e["sha256"]:
                os.remove(tmp)
                problems.append(f"{dest}: download did not match its SHA-256 and was deleted")
                continue
            os.replace(tmp, target)
            print(f"[inputs] fetched {dest}")
        except (Refused, urllib.error.URLError, http.client.HTTPException, OSError) as ex:
            if os.path.exists(tmp):
                os.remove(tmp)
            problems.append(f"{dest}: {ex}")
    return problems


def verify_room(room):
    """The check build_room.py runs before it bakes: no network. True when every input is in place and matches."""
    problems = fetch_room(room, network=False)
    for p in problems:
        print(f"[inputs] REFUSED {p}", file=sys.stderr)
    return not problems


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    flags = {a for a in argv if a.startswith("--")}
    if len(args) != 1 or flags - {"--check"}:
        print("usage: fetch_inputs.py <room> [--check]", file=sys.stderr)
        return 2
    try:
        room_id(args[0])
    except Refused as e:
        print(f"[inputs] REFUSED {e}", file=sys.stderr)
        return 2
    problems = fetch_room(args[0], network="--check" not in flags)
    for p in problems:
        print(f"[inputs] REFUSED {p}", file=sys.stderr)
    if not problems:
        print(f"[inputs] {args[0]}: every input is in place and matches its SHA-256")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
