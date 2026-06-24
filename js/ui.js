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
    const baselineJson = JSON.stringify(store.baseline);
    /* If the live config was edited, Reset just discards those edits and returns
     * to the baseline. */
    if (JSON.stringify(store.config) !== baselineJson) {
      store.reset();
      return;
    }
    /* Already sitting on the baseline. If it still corresponds to a saved
     * snapshot, there's nowhere to go. But if that snapshot was deleted, fall
     * through to the most recent remaining snapshot instead of silently
     * no-opping. */
    const list = PhaseBrain.snapshots.list(); // newest first
    const stillSaved = list.some((s) => JSON.stringify(s.config) === baselineJson);
    if (!stillSaved && list[0]) store.load(list[0].config);
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
              <${Meter} layerId=${layer.id} kind="strain" label="sundown strain" color=${layer.color} />
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
        <h3 class="sub">Sundowning <span class="sub-hint">layer fatigue</span></h3>
        <${Field} label="strength" value=${globals.sundownStrength} min=${0} max=${2.5} step=${0.05}
                  format=${(v) => v.toFixed(2)} onInput=${(v) => setGlobal('sundownStrength', v)} />
        <${Field} label="lock threshold (R)" value=${globals.sundownThreshold} min=${0.3} max=${0.95} step=${0.01}
                  format=${(v) => v.toFixed(2)} onInput=${(v) => setGlobal('sundownThreshold', v)} />
        <${Field} label="build rate" value=${globals.sundownRate} min=${0} max=${1} step=${0.05}
                  format=${(v) => v.toFixed(2)} onInput=${(v) => setGlobal('sundownRate', v)} />
        <${Field} label="recovery rate" value=${globals.sundownRecovery} min=${0} max=${1} step=${0.05}
                  format=${(v) => v.toFixed(2)} onInput=${(v) => setGlobal('sundownRecovery', v)} />
      </div>
    `;
  }

  /** Compact, locale-aware timestamp for the versions list. */
  function fmtTime(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function VersionList({ versions, activeId, onLoad, onRename, onRemove }) {
    if (!versions.length) return html`<p class="hint">No saved versions yet — click Snapshot.</p>`;
    return html`
      <div class="versions">
        ${versions.map((s) => html`
          <div class=${'version' + (s.id === activeId ? ' active' : '')} key=${s.id}>
            <button class="version-load" title="load this version" onClick=${() => onLoad(s)}>
              <span class="version-name">${s.name}</span>
              <span class="version-time">${fmtTime(s.savedAt)}</span>
            </button>
            <button class="version-act" title="rename" onClick=${() => onRename(s)}>✎</button>
            <button class="version-act remove" title="remove" onClick=${() => onRemove(s)}>✕</button>
          </div>
        `)}
      </div>
    `;
  }

  function JsonPanel({ config }) {
    const [text, setText] = useState('');
    const [open, setOpen] = useState(false);
    const [showVersions, setShowVersions] = useState(false);
    const [versions, setVersions] = useState([]);
    /* Whether the textarea JSON was just applied and hasn't drifted since. */
    const [applied, setApplied] = useState(false);
    const [ioErr, setIoErr] = useState('');
    const [saveMsg, setSaveMsg] = useState('');
    const snaps = PhaseBrain.snapshots;

    function refreshVersions() {
      setVersions(snaps.list());
    }
    /* Populate the versions (and the count badge) whenever the panel opens. */
    useEffect(() => {
      if (open) refreshVersions();
    }, [open]);
    /* Auto-dismiss the transient "saved …" confirmation after a moment. Re-runs
     * on each new saveMsg, so saving again restarts the timer rather than letting
     * a stale timeout clear the fresh message. */
    useEffect(() => {
      if (!saveMsg) return undefined;
      const id = setTimeout(() => setSaveMsg(''), 2500);
      return () => clearTimeout(id);
    }, [saveMsg]);

    /* Serialise the live config and baseline once; every comparison below reuses
     * these. Relies on canonical key order, which cloneConfig and the JSON
     * round-trip through localStorage both preserve. */
    const configJson = JSON.stringify(config);
    const baselineJson = JSON.stringify(store.baseline);

    /* "Dirty" relative to the last loaded config (defaults, applied JSON, or a
     * loaded snapshot): store.load() sets config === baseline, any edit diverges
     * them. Drives the snapshot-row highlight. */
    const cfgDirty = configJson !== baselineJson;
    /* Whether applying the textarea would actually change the live config.
     * Drives the Apply button's enabled state. */
    function textMatchesConfig() {
      try {
        return JSON.stringify(JSON.parse(text)) === configJson;
      } catch {
        return false;
      }
    }
    const ioClean = text.trim() !== '' && textMatchesConfig();
    const canApply = text.trim() !== '' && !ioClean;
    const showApplied = applied && ioClean;
    /* Highlight whichever saved snapshot the live (non-dirty) config matches —
     * covers loading a snapshot, resetting to it, and the seeded "default". */
    const matched = cfgDirty ? null : versions.find((s) => JSON.stringify(s.config) === baselineJson);
    const highlightId = matched ? matched.id : null;

    function dump() {
      setText(JSON.stringify(config, null, 2));
      setApplied(false);
      setIoErr('');
    }
    function apply() {
      try {
        const parsed = JSON.parse(text);
        if (!parsed.layers || !parsed.globals) throw new Error('need {layers, globals}');
        store.load(parsed); // becomes the new "Reset" baseline
        setApplied(true);
        setIoErr('');
      } catch (e) {
        setIoErr('invalid: ' + e.message);
      }
    }

    function snapshot() {
      const def = 'Snapshot ' + (snaps.list().length + 1);
      const name = window.prompt('Name this snapshot:', def);
      if (name === null) return; // cancelled
      const finalName = name.trim() || def;
      snaps.save(finalName, config);
      store.load(config); // anchor the baseline here so the new snapshot highlights
      refreshVersions(); // keep the Versions count badge current
      setSaveMsg('saved “' + finalName + '” ✓');
    }
    function toggleVersions() {
      const next = !showVersions;
      setShowVersions(next);
      if (next) refreshVersions();
    }
    function loadVersion(s) {
      store.load(s.config);
      setApplied(false);
      setIoErr('');
      setSaveMsg('');
    }
    function renameVersion(s) {
      const name = window.prompt('Rename snapshot:', s.name);
      if (name === null) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      snaps.rename(s.id, trimmed);
      refreshVersions();
    }
    function removeVersion(s) {
      if (!window.confirm('Remove snapshot “' + s.name + '”?')) return;
      snaps.remove(s.id);
      refreshVersions();
    }

    return html`
      <div class="section">
        <h2 class="clickable" onClick=${() => setOpen(!open)}>Save / load ${open ? '–' : '+'}</h2>
        ${open && html`
          <div>
            <div class="json-buttons">
              <button onClick=${snapshot} disabled=${!cfgDirty}
                      title=${cfgDirty ? 'Save the current settings as a named version' : 'Change a setting first — this matches a saved version'}>📸 Snapshot</button>
              <button onClick=${toggleVersions}>🕘 Versions${versions.length ? ' (' + versions.length + ')' : ''}</button>
              ${saveMsg && html`<span class="io-msg ok">${saveMsg}</span>`}
            </div>
            ${showVersions && html`
              <${VersionList} versions=${versions} activeId=${highlightId} onLoad=${loadVersion}
                              onRename=${renameVersion} onRemove=${removeVersion} />`}
            <div class="json-buttons json-io">
              <button onClick=${dump}>Export →</button>
              <button onClick=${apply} disabled=${!canApply}>Apply ←</button>
              <span class=${'io-msg ' + (ioErr ? 'err' : 'ok')}>${ioErr || (showApplied ? 'applied ✓' : '')}</span>
            </div>
            <textarea class="json-area" spellcheck="false" value=${text}
                      onInput=${(e) => { setText(e.target.value); setIoErr(''); }}
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
