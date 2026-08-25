# `private:` fails closed, alone among the optional keys

Anything present in `private:` that is not clearly a "no" keeps the book unpublished. Every other optional key fails open — an unreadable `rating` is dropped, an unrecognised `status` falls back.

The asymmetry is the whole reason: wrongly private is a missing spine you fix in a second, wrongly public is somebody's reading on a URL that may already have been crawled. The case that decided it — `private: yes` is a *string* under YAML 1.2, and a strict boolean check would have dropped it and published the book.

## How this was decided

*Carried verbatim from the Decision Log this repository kept from July 2026, newest last.*

- **2026-08-01** — **`private: true` fails closed, alone among the optional keys.** Every other one fails open — an unreadable `rating` is dropped, an unrecognised `status` falls back — because getting those wrong costs nothing anyone notices. This one is asymmetric: wrongly private is a missing spine you spot in a second and fix by editing a line; wrongly public is somebody's reading of a book they did not want shared, on a URL that may already have been sent or crawled. So anything present that is not clearly a "no" means private. The case that decided it: `private: yes` is a *string* under YAML 1.2, and a strict boolean check would have dropped it and published the book — the one mistake a person typing `yes` would never expect to be making. `0` is on the no-list as a number as well as a string, because that is how YAML parses it.
