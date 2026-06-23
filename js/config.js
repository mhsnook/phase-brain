/* =============================================================================
 * config.js — the model as plain data
 * =============================================================================
 *
 * This whole simulation is a population of "phase oscillators" (a Kuramoto
 * model). Each oscillator is a dot with a phase angle that keeps advancing;
 * dots in the same LAYER try to fall into step with each other. Whether a
 * layer locks into synchrony or fragments depends — following Bick (2017) —
 * on what its neighbouring layers are currently doing.
 *
 * The key design goal here: a layer is *just an object in an array*. To add a
 * new layer to the brain model, push another entry onto `defaultConfig.layers`.
 * To remove one, delete it. To reorder the ring, move it in the array. Nothing
 * else in the engine is hard-coded to "felt / referential / temporal".
 *
 * The array ORDER is meaningful: the layers form a directed ring. Each layer
 * has an "upstream" neighbour (the previous entry, wrapping around) and a
 * "downstream" neighbour (the next entry). That ring is what produces the
 * switching behaviour — see engine.js.
 * ---------------------------------------------------------------------------*/

(function () {
  const PhaseBrain = (window.PhaseBrain = window.PhaseBrain || {});

  /* Each layer object. Every field is something you can tune live in the UI:
   *
   *   id       Stable identifier (used as a key and in exported JSON). Unique.
   *   name     Human label shown on the canvas and in the sidebar.
   *   color    Hex colour for this layer's ring, dots and links.
   *   enabled  Toggle. A disabled layer is removed from the ring entirely, and
   *            the remaining layers re-close the ring around the gap.
   *   count    How many oscillators (dots) are in this layer. More dots = more
   *            inertia, so bigger layers tend to be more resilient to drift.
   *   freq     Natural frequency: how fast this layer's dots advance on their
   *            own, before coupling. This is the main "axis" you'll feel.
   *   coupling Intrinsic pull each dot feels toward its own layer-mates. 1.0 is
   *            the baseline; higher = locks harder, lower = fragments easier.
   */
  PhaseBrain.defaultConfig = {
    layers: [
      { id: 'felt',        name: 'Felt / presence',     color: '#5DCAA5', enabled: true, count: 4,  freq: 2.0,   coupling: 1.0 },
      { id: 'referential', name: 'Referential / identity', color: '#8C82E6', enabled: true, count: 6,  freq: 3.0,   coupling: 1.0 },
      { id: 'temporal',    name: 'Temporal / sequence', color: '#E0A33C', enabled: true, count: 8,  freq: 4.2,   coupling: 1.0 },
      { id: 'social',      name: 'Social / slow',       color: '#CC44CC', enabled: true, count: 10, freq: 1.876, coupling: 1.0 },
    ],

    /* Global knobs that apply to the whole system, not one layer. */
    globals: {
      /* alphaBase — the baseline Kuramoto phase-lag (Sakaguchi term). Sitting
       * it just under PI/2 puts every layer near the edge of stability, so
       * small nudges from neighbours can tip it between locking and fragmenting.
       * This "near the cliff edge" placement is what makes switching possible. */
      alphaBase: Math.PI / 2 - 0.1,

      /* kBias — how strongly a layer's neighbours modulate its phase-lag. This
       * is the gain on the inter-layer coupling: 0 means layers ignore each
       * other (no switching, fixed hierarchy); larger means neighbours yank
       * each other between synchrony and fragmentation more violently. */
      kBias: Math.PI / 4,

      /* freqNoise — amount of random jitter added to each dot every step. A
       * little noise keeps the system alive and exploring rather than frozen. */
      freqNoise: 0.1,

      /* dt — simulation timestep per frame. Doubles as a "speed" control:
       * bigger dt = faster (but coarser) evolution. */
      dt: 1 / 60,
    },
  };

  /* Defaults used when the user clicks "add layer". Colours cycle through this
   * palette so new layers are visually distinct without manual picking. */
  PhaseBrain.NEW_LAYER_PALETTE = [
    '#5DCAA5', '#8C82E6', '#E0A33C', '#CC44CC',
    '#E85D75', '#4FA8E0', '#E0C84F', '#7DD06A',
  ];

  PhaseBrain.makeNewLayer = function (existing) {
    const n = existing.length;
    const color = PhaseBrain.NEW_LAYER_PALETTE[n % PhaseBrain.NEW_LAYER_PALETTE.length];
    /* Find a free id like "layer5" so JSON keys stay unique. */
    let i = n + 1;
    const ids = new Set(existing.map((l) => l.id));
    while (ids.has('layer' + i)) i++;
    return { id: 'layer' + i, name: 'New layer ' + i, color, enabled: true, count: 6, freq: 3.0, coupling: 1.0 };
  };

  /* A deep-ish clone so the live config never shares references with defaults. */
  PhaseBrain.cloneConfig = function (cfg) {
    return {
      layers: cfg.layers.map((l) => Object.assign({}, l)),
      globals: Object.assign({}, cfg.globals),
    };
  };
})();
