# Follow-ups from the #593 room prototype

Captured here rather than on the issue; none is started.

- **Credits modal.** The attribution notice links to a second modal, the way the privacy
  notice opens over the shelf (`docs/spec/notice-modals.md`), listing every source the room
  uses, modified ones included. Its content is `public/room-prototype-593/SOURCES.md`.
- **Production readiness.** The room stays as this prototype draws it. The work is the app
  around it: the architecture and modules that let the shelf, the room and its loading
  screen live together outside `?room`.
- **Switchable lights.** Click a candle or a lamp to turn it off: one light map per light
  group, blended on the page. Needs a short spec first.
- **The live shelf's light.** A chandelier light in `ROOM_LIGHTING`, unshadowed, so the
  books agree with the baked room.
- **The side walls' wallpaper** is still a blurry atlas; the back wall's method
  (`lightmaps.wallpaper`) would make it sharp.
- **Size.** `room-audition.glb` is about 35 MB of geometry; the decimation can go further.
