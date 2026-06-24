/* =============================================================================
 * engine.js — the pure simulation (no DOM, no UI, no framework)
 * =============================================================================
 *
 * This is the physics. You can read it on its own to understand the model.
 * It holds an array of phases (one per oscillator/dot) and advances them every
 * step. It knows nothing about canvases, sidebars or Preact.
 *
 * THE CORE EQUATION (per dot i, in a layer):
 *
 *     phase[i] += ( freq + coupling_i ) * dt + noise
 *
 *   where coupling_i is the average pull from the other dots in i's own layer:
 *
 *     coupling_i = layer.coupling * mean_over_j( sin( phase[j] - phase[i] + alphaEff ) )
 *
 * THE SWITCHING MECHANISM (Bick 2017):
 *   alphaEff is NOT constant. Each layer's effective phase-lag is bent by the
 *   coherence of its ring neighbours:
 *
 *     alphaEff = alphaBase + deltaAlpha
 *     deltaAlpha = kBias * ( (1 - R_upstream^2) - (1 - R_downstream^2) )
 *
 *   R is the "order parameter" of a layer: 1 = perfectly locked, 0 = scattered.
 *   So when your UPSTREAM neighbour is fragmented (low R) you get pulled toward
 *   synchrony, and when your DOWNSTREAM neighbour is locked (high R) you get
 *   pushed toward fragmentation. The "most coherent" layer therefore keeps
 *   changing — genuine switching instead of a fixed hierarchy.
 *
 *   `deltaAlpha` is itself a useful, observable number: it's "how hard my
 *   neighbours are currently pushing me". The UI shows it as a live bar.
 *
 * THE SUNDOWNING MECHANISM (per-layer fatigue):
 *   A second, slower bend on alphaEff. Each layer carries a `strain` value in
 *   [0, 1] that *builds* while the layer holds coherence (R above a threshold)
 *   and *recovers* while it is fragmented:
 *
 *     strain += (R > sundownThreshold ? +sundownRate : -sundownRecovery) * dt
 *
 *   That strain is then added straight into the effective phase-lag:
 *
 *     alphaEff = alphaBase + deltaAlpha + sundownStrength * strain
 *
 *   So a lock held too long tires itself past the stability edge and breaks
 *   apart from the inside — no outside trigger needed — then recovers while
 *   scattered. Unlike `deltaAlpha` (an instantaneous neighbour force), strain
 *   has memory: it PERSISTS across steps and is only reset on a rebuild. The UI
 *   shows each layer's strain as a live bar.
 * ---------------------------------------------------------------------------*/

(function () {
  const PhaseBrain = /** @type {any} */ (window.PhaseBrain = window.PhaseBrain || {});

  /** A small deterministic RNG so a given setup looks the same each reload.
   * (Linear congruential generator — cheap and repeatable.)
   * @param {number} seed
   * @returns {() => number} */
  function seededRandom(seed) {
    let s = seed;
    return function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  /** Keep phases in [0, 2PI).
   * @param {number} p @returns {number} */
  function wrap(p) {
    return ((p % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  }

  class Engine {
    /** @param {number} [seed] */
    constructor(seed = 9) {
      this.rand = seededRandom(seed);
      /** @type {number[]} flat array of every dot's phase */
      this.phase = [];
      /** @type {number[][]} layerIdxs[k] = dot-indices for active layer k */
      this.layerIdxs = [];
      this.t = 0;
      /** @type {string} changes when layers are added/removed/resized/reordered */
      this.structureKey = '';
      /* Live diagnostics, refreshed every step for the UI to read: */
      /** @type {number[]} order parameter per active layer */
      this.Rs = [];
      /** @type {number[]} inter-layer pressure per active layer */
      this.deltaAlpha = [];
      /** @type {number[]} sundown strain per active layer, 0..1. Unlike the
       * other diagnostics this is STATE, not a per-step readout: it accumulates
       * over time and is only reset by rebuild(). */
      this.strain = [];
      /** @type {number[]} the sundown push (sundownStrength * strain) added to
       * each layer's alphaEff — the strain analogue of deltaAlpha. */
      this.deltaSundown = [];
    }

    /** Gaussian noise via Box-Muller, using the seeded RNG.
     * @returns {number} */
    randn() {
      let u = 0, v = 0;
      while (u === 0) u = this.rand();
      while (v === 0) v = this.rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    /** Kuramoto order parameter for a set of dot-indices: magnitude of the mean
     * phase vector. 1 = all aligned, 0 = uniformly scattered.
     * @param {number[]} idxs @returns {number} */
    order(idxs) {
      let sx = 0, sy = 0;
      for (const i of idxs) { sx += Math.cos(this.phase[i]); sy += Math.sin(this.phase[i]); }
      return idxs.length ? Math.sqrt(sx * sx + sy * sy) / idxs.length : 0;
    }

    /** Build the per-layer index arrays and (re)seed phases. Called whenever the
     * STRUCTURE changes — i.e. which layers exist, their order, or their sizes.
     * Live tuning of freq / coupling / globals does NOT require a rebuild.
     * @param {Layer[]} activeLayers */
    rebuild(activeLayers) {
      this.layerIdxs = [];
      this.phase = [];
      let cursor = 0;
      for (const layer of activeLayers) {
        /** @type {number[]} */
        const idxs = [];
        for (let i = 0; i < layer.count; i++) {
          idxs.push(cursor);
          this.phase.push(this.rand() * Math.PI * 2);
          cursor++;
        }
        this.layerIdxs.push(idxs);
      }
      /* Fatigue is per-layer memory, so a fresh structure starts un-tired. */
      this.strain = Array.from({ length: activeLayers.length }, () => 0);
      this.t = 0;
      this.structureKey = Engine.structureKeyOf(activeLayers);
    }

    /** The signature that decides whether we need a rebuild.
     * @param {Layer[]} activeLayers @returns {string} */
    static structureKeyOf(activeLayers) {
      return activeLayers.map((l) => l.id + ':' + l.count).join('|');
    }

    /** Rebuild only if the structure actually changed. Returns true if rebuilt.
     * @param {Layer[]} activeLayers @returns {boolean} */
    ensureStructure(activeLayers) {
      const key = Engine.structureKeyOf(activeLayers);
      if (key !== this.structureKey) {
        this.rebuild(activeLayers);
        return true;
      }
      return false;
    }

    /** Advance the whole system one timestep. `activeLayers` are the enabled
     * layers in ring order; `globals` is the globals object from the config.
     * @param {Layer[]} activeLayers @param {GlobalsConfig} globals */
    step(activeLayers, globals) {
      const n = activeLayers.length;
      if (n === 0) return;

      /* Snapshot each layer's coherence up front (read by every dot below). */
      const Rs = this.layerIdxs.map((idx) => this.order(idx));
      this.Rs = Rs;

      /* Sundowning — advance each layer's persistent fatigue BEFORE it feeds
       * into alphaEff this step. Reads are guarded with sane fallbacks so a
       * config saved before this factor existed (no sundown* keys) simply runs
       * with zero strain rather than NaN. strain may be shorter than n if a
       * rebuild hasn't run yet; backfill defensively. */
      const sThresh = globals.sundownThreshold ?? 0.7;
      const sRate = globals.sundownRate ?? 0;
      const sRecover = globals.sundownRecovery ?? 0;
      const sStrength = globals.sundownStrength ?? 0;
      if (this.strain.length !== n) this.strain = Array.from({ length: n }, () => 0);
      for (let li = 0; li < n; li++) {
        const drift = (Rs[li] > sThresh ? sRate : -sRecover) * globals.dt;
        this.strain[li] = Math.max(0, Math.min(1, this.strain[li] + drift));
      }

      const newPhase = this.phase.slice();
      /** @type {number[]} */
      const deltaAlphas = Array.from({ length: n });
      /** @type {number[]} */
      const deltaSundowns = Array.from({ length: n });

      for (let li = 0; li < n; li++) {
        const layer = activeLayers[li];
        const idxs = this.layerIdxs[li];

        /* Ring neighbours. prev = immediate upstream (one step back), next =
         * downstream (one step forward). Writing prev as (li + n - 1) keeps it
         * correct for ANY number of layers — the classic bug here is to
         * hard-code an offset that was only right for one particular count. */
        const prev = (li + n - 1) % n;
        const next = (li + 1) % n;

        /* The Bick switching term — see the header comment. */
        const deltaAlpha = globals.kBias * ((1 - Rs[prev] ** 2) - (1 - Rs[next] ** 2));
        deltaAlphas[li] = deltaAlpha;

        /* The sundowning term — accumulated fatigue bending this layer toward
         * release. See the header comment. */
        const deltaSundown = sStrength * this.strain[li];
        deltaSundowns[li] = deltaSundown;

        const alphaEff = globals.alphaBase + deltaAlpha + deltaSundown;

        for (const i of idxs) {
          let c = 0, cnt = 0;
          for (const j of idxs) {
            if (j === i) continue;
            c += Math.sin((this.phase[j] - this.phase[i]) + alphaEff);
            cnt++;
          }
          c = cnt ? (c / cnt) * layer.coupling : 0;
          const noise = this.randn() * globals.freqNoise;
          newPhase[i] = this.phase[i] + (layer.freq + c) * globals.dt + noise * Math.sqrt(globals.dt);
        }
      }

      this.deltaAlpha = deltaAlphas;
      this.deltaSundown = deltaSundowns;
      this.phase = newPhase.map(wrap);
      this.t += globals.dt;
    }
  }

  PhaseBrain.Engine = Engine;
})();
