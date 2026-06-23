# Phase Brain

A small, no-build toolbox for the **order-parameter-coupled switching network** —
layers of coupled oscillators that lock or fragment depending on what their
neighbours are doing, following Bick's order-parameter-dependent coupling
mechanism (2017).

It is both a **re-run of the original simulation** and a **toolbox** for building
new versions: add/remove/reorder layers, tune their axes live, watch the
inter-layer dynamics, and export the settings you like as JSON.

## Run it

No build step, no dependencies to install. Two ways:

- **Double-click `index.html`** — it runs straight off the filesystem. Preact +
  htm are vendored in `js/vendor/`, so it works offline with no CDN.
- **Serve it statically** — e.g. `python3 -m http.server` then open
  `http://localhost:8000`. This is also how it deploys to GitHub Pages or a
  Cloudflare Worker: just serve the files as-is.

## The idea in one paragraph

Every dot is a phase oscillator. Dots in the same **layer** try to fall into step
(synchronise). A layer's coherence is its **order parameter R** (1 = locked,
0 = scattered). The twist: each layer's tendency to lock is bent by its ring
neighbours' coherence — a fragmented upstream neighbour pulls you toward
synchrony, a locked downstream neighbour pushes you toward fragmentation. So the
"most coherent" layer keeps changing: genuine **switching** rather than a fixed
hierarchy. The per-layer **Δα** ("neighbour pressure") meter shows this force
directly.

## What you can tune

Per layer (each is just an entry in an array — see `js/config.js`):

- **frequency** — how fast the layer runs on its own
- **coupling** — how hard its dots pull on each other
- **dots (size)** — more dots = more inertia / resilience
- **colour, name, enabled, order** — order in the array = order in the ring

Globally:

- **base phase-lag α**, **switching gain (kBias)**, **noise**, **speed (dt)**

Use **Save / load** in the sidebar to export the current setup as JSON, or paste
a saved one back in.

## Layout

| file | what it is |
|------|------------|
| `index.html`     | page shell, styles, script tags |
| `js/config.js`   | the model as data: the `layers` array + global knobs (heavily commented) |
| `js/engine.js`   | the pure simulation — Kuramoto + Bick switching, no DOM, readable on its own |
| `js/render.js`   | draws the rings/dots/links onto the canvas |
| `js/store.js`    | tiny shared-state container between the loop and the sidebar |
| `js/ui.js`       | the Preact + htm sidebar (toggle, reorder, sliders, JSON) |
| `js/app.js`      | wires it together, runs the animation loop, drives the live meters |
| `js/vendor/`     | Preact + htm UMD builds (vendored, no CDN) |

`bick_switching_network_fixed.html` is kept as the original single-file
prototype this toolbox grew out of.
