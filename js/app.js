/* =============================================================================
 * app.js — wires everything together and runs the loop
 * =============================================================================
 *
 * Owns the canvas, the requestAnimationFrame loop, and the sidebar collapse
 * button. Each frame it: reads the live config from the store, makes sure the
 * engine's structure matches, steps the simulation, draws it, and fills in the
 * live per-layer meter bars that the Preact sidebar laid out.
 * ---------------------------------------------------------------------------*/

(function () {
  const PhaseBrain = window.PhaseBrain;
  const store = PhaseBrain.store;

  function activeLayersOf(config) {
    return config.layers.filter((l) => l.enabled);
  }

  document.addEventListener('DOMContentLoaded', function () {
    /* Mount the Preact sidebar. */
    PhaseBrain.mountSidebar(document.getElementById('sidebar-body'));

    /* Sidebar expand/contract. */
    const shell = document.getElementById('shell');
    document.getElementById('sidebar-toggle').addEventListener('click', function () {
      shell.classList.toggle('collapsed');
    });

    /* Canvas setup with devicePixelRatio scaling. */
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    let width = 0, height = 0;
    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, width * devicePixelRatio);
      canvas.height = Math.max(1, height * devicePixelRatio);
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);
    /* The sidebar animates open/closed, which changes the canvas width. */
    shell.addEventListener('transitionend', resize);

    const engine = new PhaseBrain.Engine();

    /* Push the engine's live diagnostics into the sidebar meter bars. The bars
     * are plain DOM elements that Preact created; we set their widths directly
     * so we don't force Preact to re-render every frame. */
    function updateMeters(active) {
      for (let li = 0; li < active.length; li++) {
        const id = active[li].id;
        const R = engine.Rs[li] || 0;
        const da = engine.deltaAlpha[li] || 0;

        const rEl = document.querySelector(`.meter-fill[data-meter="r"][data-layer="${id}"]`);
        if (rEl) rEl.style.width = (R * 100).toFixed(0) + '%';

        /* deltaAlpha is bipolar; the track is centered. Map it onto a half-width
         * bar that grows left (negative) or right (positive). Typical range is
         * roughly +/- kBias, so normalise against a sensible span. */
        const daEl = document.querySelector(`.meter-fill[data-meter="da"][data-layer="${id}"]`);
        if (daEl) {
          const span = 1.0; // visual full-scale for deltaAlpha
          const frac = Math.max(-1, Math.min(1, da / span));
          const halfPct = Math.abs(frac) * 50;
          if (frac >= 0) {
            daEl.style.left = '50%';
            daEl.style.right = 'auto';
          } else {
            daEl.style.left = 'auto';
            daEl.style.right = '50%';
          }
          daEl.style.width = halfPct.toFixed(0) + '%';
        }
      }
    }

    /* The collapsed-sidebar coherence HUD. Its rows are rebuilt only when the
     * active layers (or their names/colours) change; the bar widths and numbers
     * are refreshed every frame, the same approach as the sidebar meters. */
    const hudRows = document.getElementById('hud-rows');
    let hudSig = null;
    let hudFills = [];
    let hudVals = [];

    function syncHud(active) {
      const sig = active.map((l) => l.id + '|' + l.name + '|' + l.color).join('~');
      if (sig === hudSig) return;
      hudSig = sig;
      hudRows.textContent = '';
      hudFills = [];
      hudVals = [];
      if (active.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'hud-empty';
        empty.textContent = 'No active layers';
        hudRows.appendChild(empty);
        return;
      }
      for (const layer of active) {
        const row = document.createElement('div');
        row.className = 'hud-row';
        row.title = layer.name;

        const dot = document.createElement('span');
        dot.className = 'hud-dot';
        dot.style.background = layer.color;

        const name = document.createElement('span');
        name.className = 'hud-name';
        name.textContent = layer.name;

        const bar = document.createElement('div');
        bar.className = 'hud-bar';
        const fill = document.createElement('div');
        fill.className = 'hud-bar-fill';
        fill.style.background = layer.color;
        bar.appendChild(fill);

        const val = document.createElement('span');
        val.className = 'hud-val';
        val.textContent = '—';

        row.append(dot, name, bar, val);
        hudRows.appendChild(row);
        hudFills.push(fill);
        hudVals.push(val);
      }
    }

    function updateHud() {
      for (let i = 0; i < hudFills.length; i++) {
        const R = engine.Rs[i] || 0;
        hudFills[i].style.width = (R * 100).toFixed(0) + '%';
        hudVals[i].textContent = R.toFixed(2);
      }
    }

    function loop() {
      const config = store.config;
      const active = activeLayersOf(config);
      engine.ensureStructure(active);
      engine.step(active, config.globals);
      PhaseBrain.render(ctx, engine, active, { width, height, t: engine.t });
      updateMeters(active);
      syncHud(active);
      updateHud();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  });
})();
