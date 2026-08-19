# Parked components

`AnimationPanel.vue` and `FrameStrip.vue` came from the frame-animation UI of the
editor this project was seeded from. Nothing imports them today — they are kept
because **Phase 10 (Shape mode)** in `PLAN.md` plans to revive them for the
software-sprite workflow the VIC-20 actually uses: a rectangular block of
characters treated as one movable object, animated over several frames (D11).

They are excluded from type-checking and lint until then, so they will not
compile as-is; expect to rework their props against the Phase 2 data model when
Phase 10 starts.

**If Phase 10 is dropped, delete this whole folder.**
