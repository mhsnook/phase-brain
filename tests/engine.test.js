import { describe, it, expect, beforeEach } from 'vitest';

/* The source files are global-IIFE scripts that attach to window. Importing
 * them runs that side effect; jsdom (configured in vitest.config.js) provides
 * the window. We then read the engine off window.PhaseBrain. */
import '../js/config.js';
import '../js/engine.js';

const PB = window.PhaseBrain;

function activeOf(cfg) {
  return cfg.layers.filter((l) => l.enabled);
}

describe('Engine structure', () => {
  let cfg;
  beforeEach(() => {
    cfg = PB.cloneConfig(PB.defaultConfig);
  });

  it('allocates one phase per dot across all active layers', () => {
    const active = activeOf(cfg);
    const expected = active.reduce((s, l) => s + l.count, 0);
    const eng = new PB.Engine();
    eng.ensureStructure(active);
    expect(eng.phase).toHaveLength(expected);
    expect(eng.layerIdxs).toHaveLength(active.length);
  });

  it('rebuilds only when the structure signature changes', () => {
    const active = activeOf(cfg);
    const eng = new PB.Engine();
    eng.ensureStructure(active);
    // No structural change -> no rebuild.
    expect(eng.ensureStructure(active)).toBe(false);
    // Tweaking a live param (freq) is NOT structural.
    active[0].freq += 1;
    expect(eng.ensureStructure(active)).toBe(false);
    // Changing a count IS structural.
    active[0].count += 2;
    expect(eng.ensureStructure(active)).toBe(true);
  });

  it('shrinks the ring when a layer is disabled', () => {
    const eng = new PB.Engine();
    eng.ensureStructure(activeOf(cfg));
    cfg.layers[1].enabled = false;
    const active = activeOf(cfg);
    eng.ensureStructure(active);
    eng.step(active, cfg.globals);
    expect(eng.layerIdxs).toHaveLength(active.length);
    expect(eng.deltaAlpha).toHaveLength(active.length);
  });
});

describe('Engine dynamics', () => {
  let cfg;
  beforeEach(() => {
    cfg = PB.cloneConfig(PB.defaultConfig);
  });

  it('keeps every phase finite and order parameters within [0, 1]', () => {
    const active = activeOf(cfg);
    const eng = new PB.Engine();
    eng.ensureStructure(active);
    for (let i = 0; i < 500; i++) eng.step(active, cfg.globals);
    expect(eng.phase.every(Number.isFinite)).toBe(true);
    for (const R of eng.Rs) {
      expect(R).toBeGreaterThanOrEqual(0);
      expect(R).toBeLessThanOrEqual(1.0000001);
    }
  });

  it('is deterministic for a fixed seed', () => {
    const active1 = activeOf(PB.cloneConfig(PB.defaultConfig));
    const active2 = activeOf(PB.cloneConfig(PB.defaultConfig));
    const a = new PB.Engine(9);
    const b = new PB.Engine(9);
    a.ensureStructure(active1);
    b.ensureStructure(active2);
    for (let i = 0; i < 100; i++) {
      a.step(active1, cfg.globals);
      b.step(active2, cfg.globals);
    }
    expect(a.phase).toEqual(b.phase);
  });
});

describe('Bick switching wiring', () => {
  let cfg;
  beforeEach(() => {
    cfg = PB.cloneConfig(PB.defaultConfig);
  });

  it('couples each layer to its immediate ring neighbours (prev=-1, next=+1)', () => {
    const active = activeOf(cfg);
    const n = active.length;
    const eng = new PB.Engine();
    eng.ensureStructure(active);
    eng.step(active, cfg.globals);

    // deltaAlpha and Rs are taken from the same snapshot inside step(), so the
    // exact relation must hold for the (li-1, li+1) ring topology — this is the
    // wiring that the original "+2" bug got wrong once a 4th layer was added.
    for (let li = 0; li < n; li++) {
      const prev = (li + n - 1) % n;
      const next = (li + 1) % n;
      const expected =
        cfg.globals.kBias * ((1 - eng.Rs[prev] ** 2) - (1 - eng.Rs[next] ** 2));
      expect(eng.deltaAlpha[li]).toBeCloseTo(expected, 10);
    }
  });

  it('produces no inter-layer pressure when the switching gain is zero', () => {
    cfg.globals.kBias = 0;
    const active = activeOf(cfg);
    const eng = new PB.Engine();
    eng.ensureStructure(active);
    eng.step(active, cfg.globals);
    // Math.abs normalises the harmless -0 that 0 * negative can produce.
    for (const da of eng.deltaAlpha) expect(Math.abs(da)).toBe(0);
  });
});
