# Previs Layout

A browser-based planner for building movie pre-visualization layouts from cardboard boxes.

Live app: https://noddson.github.io/previs-layout/

## What It Does

- Draw wall runs or full rooms from a top-down snapped grid.
- Preview newly drawn rooms with their internal clear dimensions while dragging.
- Hover over rectangular wall-bounded spaces to see clear dimensions and area, allowing doorway gaps up to 40% of each side.
- Pick configurable box sizes from `boxes.json`:
  - 24 x 24 x 24 cube, $5.89 each
  - 18 x 18 x 24 high, $3.74 each
  - 18 x 18 x 18 cube, $3.11 each
  - 12 x 12 x 12 cube, $1.29 each
- Set wall height, stage size, snap spacing, and cost per box.
- Set startup defaults in `config.json`, including snap, wall height, builder count, and stage size.
- Load the startup/demo room layout from `demo.json`.
- Save the active plan to versioned JSON and import a previously saved plan.
- Reject oversized imports before rendering.
- Starts with 12-inch snap, 72-inch wall height, yaw 210, and pitch 340 by default.
- See total box count, cost, type breakdown, and wall-run breakdown.
- Rotate, tilt, and zoom a 3D preview generated from the same box layout.
- Use the orbit preview axis gizmo to read yaw/pitch and snap to X, Y, or Z views.
- Walk through the layout in a Three.js/WebXR FPV view with WASD movement, mouse-look, stage bounds, and wall collision.
- Enter immersive VR from the FPV view in WebXR-capable browsers such as Meta Quest Browser.
- Erase individual box footprints from a wall run.
- Prevent intersecting box footprints when drawing wall runs or rooms.

## Run

Serve the folder locally:

```sh
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

Opening `index.html` directly may work in some browsers, but a local server is
recommended because the app loads `boxes.json`, `config.json`, `demo.json`, and
JavaScript modules with `fetch`/ES modules.

The FPV/WebXR view uses the vendored Three.js 0.164.1 files under `vendor/three`,
so the public app does not execute runtime JavaScript from a third-party CDN.
Immersive VR requires a secure context, so GitHub Pages over HTTPS is the
intended headset target.


## Security Headers

Configure your host/CDN/reverse proxy to send security headers on HTML responses (including `index.html`).
This repo includes a Netlify/Cloudflare Pages-style [`_headers`](./_headers) file with:

- `Content-Security-Policy` (header form) including:
  - `default-src 'self'`
  - `script-src 'self'`
  - `connect-src 'self'`
  - `img-src 'self' data: blob:`
  - `object-src 'none'`
  - `base-uri 'none'`
  - `form-action 'none'`
  - `style-src 'self' 'unsafe-inline'`
  - `frame-ancestors 'none'`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security: max-age=31536000`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` limiting sensors, media, payment, USB, and WebXR access

After deploy, verify in browser DevTools **Network** tab that `index.html` response headers include these values (and are not only present as a meta tag).

## Configuration

Box types are loaded from `boxes.json`. Each box needs an `id`, `name`, `length`,
`depth`, `height`, `cost`, and hex `color`, all measured in inches except cost.
The current `boxes.json` includes four box types: `cube24`, `tall18`, `cube18`,
and `cube12`.
If `boxes.json` cannot be loaded, the app falls back to the minimal built-in
24-inch cube definition in `config.js`.

Startup defaults are loaded from `config.json`:

```json
{
  "defaultWallHeight": 72,
  "defaultGridSnap": 12,
  "defaultBuilderCount": 1,
  "defaultStageSize": {
    "width": 480,
    "depth": 360
  }
}
```

Values from `config.json` override the built-in fallback defaults in `config.js`
when the file loads successfully.

Runtime values are clamped to keep the layout bounded: wall height is 12-240
inches, stage width/depth are 96-1200 inches, snap is 3-96 inches, and builder
count is 1-99.

Saved plan files include `version`, `app`, `savedAt`, `boxTypes`,
`selectedBoxId`, `config`, and `walls`, so an imported plan can restore the box
definitions, costs, selected box, active controls, and layout it was created with.

The demo layout shown on startup and restored by the Demo button is loaded from
`demo.json`. It uses the same `version`, `config`, selected box, and `walls`
shape as saved plan files, with `boxId` values matching entries in `boxes.json`.
On startup, the demo plan is applied after `config.json`, so the demo plan's
`config` can set the initial controls; the current demo uses 4 builders.
If `demo.json` cannot be loaded or validated, the app starts without a demo
layout.

Imported plan files must be version 1 JSON plans. Import validation rejects files
larger than 1 MB, more than 50 box types, more than 500 wall runs, wall heights
outside 12-240 inches, coordinates outside 0-1200 inches, box dimensions larger
than 2400 inches, more than 2,000 removed block indexes per wall, generated
layouts over 5,000 boxes, and wall footprints that would leave the imported
stage.

## Notes

Box counts are calculated per wall run:

```text
visible footprint columns * ceil(wall height / box height)
```

Displayed run length is calculated from the physical box footprints in the wall
run. Interior doorway gaps do not shorten the reported wall length, but erased
stacks at either end of a wall run trim the run and update its reported length.
Wall run and box type breakdown lengths show this physical run span, not the raw
drag distance.
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

## Attribution

This project was created by Nick Oddson.

If you use, copy, modify, or distribute this software, please retain the copyright notice and MIT License as required by the license.

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
