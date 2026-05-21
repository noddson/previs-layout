# Previs Layout

A browser-based planner for building movie pre-visualization layouts from cardboard boxes.

## What It Does

- Draw wall runs or full rooms from a top-down snapped grid.
- Label newly drawn rooms with their internal clear dimensions.
- Pick configurable box sizes from `boxes.json`:
  - 24 x 24 x 24 cube, $5.89 each
  - 18 x 18 x 18 cube, $3.11 each
  - 18 x 18 x 24 high, $3.74 each
- Set wall height, stage size, snap spacing, and cost per box.
- Set startup defaults in `config.json`, including snap, wall height, and stage size.
- Save the active plan to versioned JSON and import a previously saved plan.
- Starts with 12-inch snap, 72-inch wall height, yaw 210, and pitch 340 by default.
- See total box count, cost, type breakdown, and wall-run breakdown.
- Rotate, tilt, and zoom a 3D preview generated from the same box layout.
- Use the orbit preview axis gizmo to read yaw/pitch and snap to X, Y, or Z views.
- Walk through the layout in a Three.js/WebXR FPV view with WASD movement, mouse-look, stage bounds, and wall collision.
- Enter immersive VR from the FPV view in WebXR-capable browsers such as Meta Quest Browser.
- Erase individual box footprints from a wall run.
- Prevent intersecting box footprints when drawing wall runs or rooms.

## Run

Open `index.html` in a browser, or serve the folder locally:

```sh
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

The FPV/WebXR view loads Three.js from a CDN. Immersive VR requires a secure
context, so GitHub Pages over HTTPS is the intended headset target.

## Configuration

Box types are loaded from `boxes.json`. Each box needs an `id`, `name`, `length`,
`depth`, `height`, `cost`, and hex `color`, all measured in inches except cost.

Startup defaults are loaded from `config.json`:

```json
{
  "defaultWallHeight": 72,
  "defaultGridSnap": 12,
  "defaultStageSize": {
    "width": 480,
    "depth": 360
  }
}
```

Saved plan files include `version`, `boxTypes`, `config`, and `walls`, so an
imported plan can restore the box definitions and costs it was created with.

## Notes

Counts are calculated per wall run:

```text
ceil(wall length / box length) * ceil(wall height / box height)
```

Displayed run length is calculated from placed boxes, so a 24-inch box reports as
2 feet, two boxes as 4 feet, three boxes as 6 feet, and so on.

This keeps the estimate readable and conservative for standalone wall runs.
Placements that would intersect existing boxes are blocked.
Wall runs use the first clicked grid point as the first box footprint edge instead
of a wall centerline, so boxes stay aligned to the grid from the placement point.
The top-down erase tool removes the selected footprint column through the wall height.

The FPV view renders the layout with Three.js and keeps movement on the ground
plane with a 10-inch square collision box, allowing it to fit through narrow
12-inch openings while still blocking movement through wall and room boxes.
The FPV start position resets to a free stage edge whenever the layout or stage
size changes.

Rooms are generated with butt-jointed corners, so top and bottom runs claim the corner
volume and side runs start between them. Room dimensions are snapped to whole box
increments for the selected box type so the physical boxes remain orthogonal and
non-intersecting.
