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
  const PhaseBrain = /** @type {any} */ (window.PhaseBrain = window.PhaseBrain || {});

  /** Each layer object. Every field is something you can tune live in the UI:
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
   *
   * @type {SimConfig}
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

      /* SUNDOWNING — a slow, per-layer fatigue. Each layer accumulates "strain"
       * while it holds coherence and sheds it while fragmented; that strain then
       * bends its phase-lag toward release, so a lock held too long breaks itself
       * apart from the inside. See engine.js for the equation. Set
       * sundownStrength to 0 to switch the whole effect off. */

      /* sundownThreshold — the coherence R above which a layer counts as
       * "locked" and starts to tire. Below it, the layer recovers instead. */
      sundownThreshold: 0.7,

      /* sundownRate — how fast strain builds (per second) while a layer is
       * above the threshold. */
      sundownRate: 0.3,

      /* sundownRecovery — how fast strain fades (per second) while a layer is
       * fragmented. Lower than the build rate, so fatigue lingers. */
      sundownRecovery: 0.15,

      /* sundownStrength — how hard a fully-strained layer (strain = 1) pushes
       * its own phase-lag toward fragmentation. This is the gain on the whole
       * effect; 0 disables sundowning entirely. */
      sundownStrength: Math.PI * 0.6,
    },
  };

  /* Defaults used when the user clicks "add layer". Colours cycle through this
   * palette so new layers are visually distinct without manual picking. */
  PhaseBrain.NEW_LAYER_PALETTE = [    '#5DCAA5', '#8C82E6', '#E0A33C', '#CC44CC',
    '#E85D75', '#4FA8E0', '#E0C84F', '#7DD06A',
  ];

  /**
   * Build a fresh layer with a free id and a palette colour.
   * @param {Layer[]} existing
   * @returns {Layer}
   */
  PhaseBrain.makeNewLayer = function (existing) {
    const n = existing.length;
    const color = PhaseBrain.NEW_LAYER_PALETTE[n % PhaseBrain.NEW_LAYER_PALETTE.length];
    /* Find a free id like "layer5" so JSON keys stay unique. */
    let i = n + 1;
    const ids = new Set(existing.map((l) => l.id));
    while (ids.has('layer' + i)) i++;
    return { id: 'layer' + i, name: 'New layer ' + i, color, enabled: true, count: 6, freq: 3.0, coupling: 1.0 };
  };

  /* Fallback values for any global that a loaded config is MISSING — i.e. the
   * migration defaults for configs saved before a knob existed. These are
   * deliberately NOT identical to defaultConfig.globals: a fresh default turns
   * sundowning ON (strength = PI*0.6), but a config saved before sundowning
   * existed should keep behaving exactly as it did — so its fallback strength is
   * 0 (the effect is a no-op) while still being PRESENT and tunable. The
   * threshold/rate/recovery fallbacks use sensible non-zero values so that
   * dialing strength up immediately does something.
   *
   * Key order here is the canonical global order; cloneConfig lays the keys down
   * in this order so JSON.stringify stays stable for the dirty/match comparisons
   * in the UI.
   * @type {GlobalsConfig} */
  PhaseBrain.GLOBAL_FALLBACKS = {
    alphaBase: Math.PI / 2 - 0.1,
    kBias: Math.PI / 4,
    freqNoise: 0.1,
    dt: 1 / 60,
    sundownThreshold: 0.7,
    sundownRate: 0.3,
    sundownRecovery: 0.15,
    sundownStrength: 0,
  };

  /**
   * A deep-ish clone so the live config never shares references with defaults.
   * Doubles as the migration point: any global missing from `cfg` (e.g. a
   * snapshot saved before sundowning existed) is backfilled from
   * GLOBAL_FALLBACKS, so every config that reaches the engine and the sidebar
   * has the full set of knobs present.
   * @param {SimConfig} cfg
   * @returns {SimConfig}
   */
  PhaseBrain.cloneConfig = function (cfg) {
    return {
      layers: cfg.layers.map((l) => Object.assign({}, l)),
      globals: Object.assign({}, PhaseBrain.GLOBAL_FALLBACKS, cfg.globals),
    };
  };

  /**
   * Produce a new config with randomised dynamics, within sensible ranges.
   * Deliberately preserves each layer's identity (id/name/color/enabled) and the
   * layer count and order — only the tunable numbers are shuffled: per-layer
   * frequency, coupling and size, plus the global knobs. Ranges are narrower
   * than the slider extremes so a jumble lands somewhere lively rather than
   * degenerate (e.g. alphaBase stays near the interesting PI/2 regime).
   * @param {SimConfig} cfg
   * @param {() => number} [rng] random source in [0,1) (defaults to Math.random)
   * @returns {SimConfig}
   */
  PhaseBrain.jumbleConfig = function (cfg, rng) {
    const r = rng || Math.random;
    const span = (/** @type {number} */ min, /** @type {number} */ max) => min + r() * (max - min);
    const quant = (/** @type {number} */ v, /** @type {number} */ step) => Math.round(v / step) * step;
    return {
      layers: cfg.layers.map((l) =>
        Object.assign({}, l, {
          freq: quant(span(0.5, 6), 0.1),
          coupling: quant(span(0.3, 2.5), 0.05),
          count: Math.round(span(3, 12)),
        })
      ),
      globals: {
        alphaBase: quant(span(0.8, 1.55), 0.01),
        kBias: quant(span(0.1, 1.2), 0.01),
        freqNoise: quant(span(0.03, 0.3), 0.01),
        dt: quant(span(0.01, 0.03), 0.002),
        sundownThreshold: quant(span(0.55, 0.85), 0.01),
        sundownRate: quant(span(0.1, 0.5), 0.05),
        sundownRecovery: quant(span(0.05, 0.3), 0.05),
        /* Low end stays at 0 so a jumble can occasionally turn sundowning off. */
        sundownStrength: quant(span(0, 2.5), 0.05),
      },
    };
  };
})();
