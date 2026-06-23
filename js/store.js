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
  const PhaseBrain = (window.PhaseBrain = window.PhaseBrain || {});

  function createStore(initialConfig) {
    let config = initialConfig;
    const listeners = new Set();

    return {
      get config() {
        return config;
      },
      /* Replace config with the result of updater(config), then notify. The
       * updater should return a NEW object (so Preact sees a fresh reference). */
      set(updater) {
        config = typeof updater === 'function' ? updater(config) : updater;
        listeners.forEach((fn) => fn(config));
      },
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };
  }

  PhaseBrain.store = createStore(PhaseBrain.cloneConfig(PhaseBrain.defaultConfig));
})();
