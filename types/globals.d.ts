/* Ambient types shared across the (module-less, global-IIFE) source files.
 * This file has NO import/export, so it is a global script declaration: every
 * interface below is visible by its bare name (Layer, GlobalsConfig, ...) from
 * the JSDoc comments in the .js files. */

/** One oscillator layer — see js/config.js for the meaning of each field. */
interface Layer {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
  count: number;
  freq: number;
  coupling: number;
}

/** System-wide dynamics knobs. */
interface GlobalsConfig {
  alphaBase: number;
  kBias: number;
  freqNoise: number;
  dt: number;
}

/** The whole editable configuration (what gets exported as JSON). */
interface SimConfig {
  layers: Layer[];
  globals: GlobalsConfig;
}

/** The subset of the engine that the renderer reads from. */
interface EngineLike {
  phase: number[];
  layerIdxs: number[][];
  Rs: number[];
  deltaAlpha: number[];
  t: number;
  order(idxs: number[]): number;
}

/* Browser globals we attach to / consume. Preact + htm come from UMD bundles
 * and are intentionally loose (any) — we only care about typing our own model
 * logic, not re-typing the frameworks. */
interface Window {
  PhaseBrain: any;
  preact: any;
  preactHooks: any;
  htm: any;
}
