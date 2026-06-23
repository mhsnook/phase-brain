/* =============================================================================
 * store.js — a tiny shared-state container
 * =============================================================================
 *
 * Both worlds need the same config: the vanilla animation loop (app.js) reads
 * it every frame, and the Preact sidebar (ui.js) edits it. Rather than wire
 * Preact's state down into the render loop, we keep ONE plain config object
 * here. The sidebar mutates it through `set()`; subscribers (the sidebar's own
 * re-render, mainly) are notified. The render loop just reads `store.config`
 * directly every frame, so live slider drags feel instant.
 * ---------------------------------------------------------------------------*/

(function () {
  const PhaseBrain = /** @type {any} */ (window.PhaseBrain = window.PhaseBrain || {});

  /** @param {SimConfig} initialConfig */
  function createStore(initialConfig) {
    /** @type {SimConfig} */
    let config = initialConfig;
    /** The last *loaded* config — the defaults at startup, or whatever was last
     * applied via the Save/load panel. "Reset" returns here.
     * @type {SimConfig} */
    let baseline = PhaseBrain.cloneConfig(initialConfig);
    /** @type {Set<(c: SimConfig) => void>} */
    const listeners = new Set();

    function notify() {
      listeners.forEach((fn) => fn(config));
    }

    return {
      get config() {
        return config;
      },
      /** Replace config with the result of updater(config), then notify. The
       * updater should return a NEW object (so Preact sees a fresh reference).
       * @param {SimConfig | ((c: SimConfig) => SimConfig)} updater */
      set(updater) {
        config = typeof updater === 'function' ? updater(config) : updater;
        notify();
      },
      /** Adopt cfg as both the live config AND the new reset baseline (used when
       * loading a saved config). @param {SimConfig} cfg */
      load(cfg) {
        baseline = PhaseBrain.cloneConfig(cfg);
        config = PhaseBrain.cloneConfig(cfg);
        notify();
      },
      /** Restore the live config to the last loaded baseline. */
      reset() {
        config = PhaseBrain.cloneConfig(baseline);
        notify();
      },
      /** @param {(c: SimConfig) => void} fn */
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };
  }

  PhaseBrain.store = createStore(PhaseBrain.cloneConfig(PhaseBrain.defaultConfig));
})();
