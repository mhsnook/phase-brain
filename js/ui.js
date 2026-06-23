/* =============================================================================
 * ui.js — the sidebar toolbox (Preact + htm, no build step)
 * =============================================================================
 *
 * Preact and htm are loaded as plain globals from a CDN in index.html, so there
 * is no bundler and the page works straight off the filesystem. htm lets us
 * write components with tagged template literals instead of JSX:
 *
 *     html`<button onClick=${fn}>hi</button>`
 *
 * This file owns ONLY the sidebar. The canvas and the animation loop live in
 * app.js. The two communicate through PhaseBrain.store (see store.js).
 *
 * Live per-layer meters (coherence R and inter-layer pressure deltaAlpha) are
 * rendered here as empty bars tagged with data-attributes; app.js fills their
 * widths every frame. That keeps Preact re-rendering only on real edits, not 60
 * times a second.
 * ---------------------------------------------------------------------------*/

(function () {
  const PhaseBrain = (window.PhaseBrain = window.PhaseBrain || {});
  const { h, render } = window.preact;
  const { useState, useEffect, useReducer } = window.preactHooks;
  const html = window.htm.bind(h);
  const store = PhaseBrain.store;

  /* ---- config mutation helpers (all go through the store) ------------------ */

  function patchLayer(id, patch) {
    store.set((cfg) => ({
      ...cfg,
      layers: cfg.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  }
  function setGlobal(key, value) {
    store.set((cfg) => ({ ...cfg, globals: { ...cfg.globals, [key]: value } }));
  }
  function addLayer() {
    store.set((cfg) => ({ ...cfg, layers: [...cfg.layers, PhaseBrain.makeNewLayer(cfg.layers)] }));
  }
  function removeLayer(id) {
    store.set((cfg) => ({ ...cfg, layers: cfg.layers.filter((l) => l.id !== id) }));
  }
  function moveLayer(id, dir) {
    store.set((cfg) => {
      const layers = cfg.layers.slice();
      const i = layers.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= layers.length) return cfg;
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...cfg, layers };
    });
  }
  function jumble() {
    store.set((cfg) => PhaseBrain.jumbleConfig(cfg));
  }
  function reset() {
    store.reset();
  }

  /* ---- small reusable controls -------------------------------------------- */

  function Field({ label, value, min, max, step, format, onInput }) {
    const shown = format ? format(value) : value;
    return html`
      <label class="field">
        <span class="field-label">${label}<span class="field-val">${shown}</span></span>
        <input type="range" min=${min} max=${max} step=${step} value=${value}
               onInput=${(e) => onInput(parseFloat(e.target.value))} />
      </label>
    `;
  }

  /* A passive bar whose width app.js drives each frame. `kind` is "r" or "da".
   * For deltaAlpha the fill is centered (it can be negative), so we mark it. */
  function Meter({ layerId, kind, label, color }) {
    return html`
      <div class="meter">
        <span class="meter-label">${label}</span>
        <div class="meter-track ${kind === 'da' ? 'bipolar' : ''}">
          <div class="meter-fill" data-meter=${kind} data-layer=${layerId}
               style=${`background:${color}`}></div>
        </div>
      </div>
    `;
  }

  /* ---- layer editor -------------------------------------------------------- */

  function LayerRow({ layer, index, total }) {
    const [open, setOpen] = useState(true);
    return html`
      <div class=${'layer' + (layer.enabled ? '' : ' disabled')}>
        <div class="layer-head">
          <button class="swatch" style=${`background:${layer.color}`}
                  title="toggle layer" onClick=${() => patchLayer(layer.id, { enabled: !layer.enabled })}></button>
          <input class="layer-name" value=${layer.name}
                 onInput=${(e) => patchLayer(layer.id, { name: e.target.value })} />
          <div class="layer-order">
            <button disabled=${index === 0} onClick=${() => moveLayer(layer.id, -1)} title="move inward">▲</button>
            <button disabled=${index === total - 1} onClick=${() => moveLayer(layer.id, 1)} title="move outward">▼</button>
          </div>
          <button class="row-toggle" onClick=${() => setOpen(!open)}>${open ? '–' : '+'}</button>
          <button class="row-remove" onClick=${() => removeLayer(layer.id)} title="delete layer">✕</button>
        </div>

        ${open && html`
          <div class="layer-body">
            <div class="meters">
              <${Meter} layerId=${layer.id} kind="r" label="coherence R" color=${layer.color} />
              <${Meter} layerId=${layer.id} kind="da" label="neighbour pressure Δα" color=${layer.color} />
            </div>
            <${Field} label="frequency" value=${layer.freq} min=${0.2} max=${10} step=${0.1}
                      format=${(v) => v.toFixed(2)} onInput=${(v) => patchLayer(layer.id, { freq: v })} />
            <${Field} label="coupling" value=${layer.coupling} min=${0} max=${3} step=${0.05}
                      format=${(v) => v.toFixed(2)} onInput=${(v) => patchLayer(layer.id, { coupling: v })} />
            <${Field} label="dots (size)" value=${layer.count} min=${1} max=${16} step=${1}
                      format=${(v) => String(v)} onInput=${(v) => patchLayer(layer.id, { count: Math.round(v) })} />
            <label class="color-row">
              <span>colour</span>
              <input type="color" value=${layer.color}
                     onInput=${(e) => patchLayer(layer.id, { color: e.target.value })} />
            </label>
          </div>
        `}
      </div>
    `;
  }

  /* ---- globals + JSON ------------------------------------------------------ */

  function Globals({ globals }) {
    return html`
      <div class="section">
        <h2>Global dynamics</h2>
        <${Field} label="base phase-lag α" value=${globals.alphaBase} min=${0} max=${1.6} step=${0.01}
                  format=${(v) => v.toFixed(2)} onInput=${(v) => setGlobal('alphaBase', v)} />
        <${Field} label="switching gain (kBias)" value=${globals.kBias} min=${0} max=${1.5} step=${0.01}
                  format=${(v) => v.toFixed(2)} onInput=${(v) => setGlobal('kBias', v)} />
        <${Field} label="noise" value=${globals.freqNoise} min=${0} max=${0.5} step=${0.01}
                  format=${(v) => v.toFixed(2)} onInput=${(v) => setGlobal('freqNoise', v)} />
        <${Field} label="speed (dt)" value=${globals.dt} min=${0.002} max=${0.05} step=${0.002}
                  format=${(v) => v.toFixed(3)} onInput=${(v) => setGlobal('dt', v)} />
      </div>
    `;
  }

  function JsonPanel({ config }) {
    const [text, setText] = useState('');
    const [open, setOpen] = useState(false);
    const [msg, setMsg] = useState('');

    function dump() {
      setText(JSON.stringify(config, null, 2));
      setMsg('');
    }
    function apply() {
      try {
        const parsed = JSON.parse(text);
        if (!parsed.layers || !parsed.globals) throw new Error('need {layers, globals}');
        store.load(parsed); // becomes the new "Reset" baseline
        setMsg('applied ✓');
      } catch (e) {
        setMsg('invalid: ' + e.message);
      }
    }

    return html`
      <div class="section">
        <h2 class="clickable" onClick=${() => setOpen(!open)}>Save / load ${open ? '–' : '+'}</h2>
        ${open && html`
          <div>
            <div class="json-buttons">
              <button onClick=${dump}>Export →</button>
              <button onClick=${apply}>Apply ←</button>
              ${msg && html`<span class="json-msg">${msg}</span>`}
            </div>
            <textarea class="json-area" spellcheck="false" value=${text}
                      onInput=${(e) => setText(e.target.value)}
                      placeholder="Click Export to dump the current settings as JSON, or paste a saved config and click Apply."></textarea>
          </div>
        `}
      </div>
    `;
  }

  /* ---- top-level sidebar --------------------------------------------------- */

  function App() {
    /* Force a re-render whenever the store changes. */
    const [, bump] = useReducer((x) => x + 1, 0);
    useEffect(() => store.subscribe(bump), []);
    const config = store.config;

    return html`
      <div class="sidebar-inner">
        <div class="actions">
          <button onClick=${jumble} title="Randomise all settings within sensible ranges (keeps the layers and their order)">🎲 Jumble</button>
          <button onClick=${reset} title="Restore the last loaded settings (or the defaults)">↺ Reset</button>
        </div>
        <div class="section">
          <h2>Layers <button class="add-layer" onClick=${addLayer}>+ add</button></h2>
          <p class="hint">Order = the ring. Inner layers are first; each layer's
            upstream neighbour is the one above it, downstream the one below.</p>
          ${config.layers.map((layer, i) => html`
            <${LayerRow} key=${layer.id} layer=${layer} index=${i} total=${config.layers.length} />
          `)}
        </div>
        <${Globals} globals=${config.globals} />
        <${JsonPanel} config=${config} />
      </div>
    `;
  }

  PhaseBrain.mountSidebar = function (el) {
    render(html`<${App} />`, el);
  };
})();
