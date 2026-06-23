import { describe, it, expect, beforeEach } from 'vitest';

import '../js/config.js';
import '../js/store.js';

const PB = window.PhaseBrain;
const store = PB.store;

describe('store baseline / reset', () => {
  beforeEach(() => {
    // Start each test from a known baseline.
    store.load(PB.cloneConfig(PB.defaultConfig));
  });

  it('reset restores the last loaded baseline', () => {
    const before = store.config.layers[0].freq;
    store.set((c) => ({
      ...c,
      layers: c.layers.map((l, i) => (i === 0 ? { ...l, freq: l.freq + 5 } : l)),
    }));
    expect(store.config.layers[0].freq).toBe(before + 5);
    store.reset();
    expect(store.config.layers[0].freq).toBe(before);
  });

  it('load adopts a new baseline that reset returns to', () => {
    const custom = PB.cloneConfig(PB.defaultConfig);
    custom.layers[0].freq = 1.23;
    store.load(custom);
    expect(store.config.layers[0].freq).toBe(1.23);

    store.set((c) => ({
      ...c,
      layers: c.layers.map((l, i) => (i === 0 ? { ...l, freq: 9 } : l)),
    }));
    store.reset();
    expect(store.config.layers[0].freq).toBe(1.23);
  });

  it('exposes baseline; config equals it until edited, diverges after', () => {
    expect(JSON.stringify(store.config)).toBe(JSON.stringify(store.baseline));
    store.set((c) => ({ ...c, globals: { ...c.globals, kBias: 0.123 } }));
    expect(JSON.stringify(store.config)).not.toBe(JSON.stringify(store.baseline));
    store.reset();
    expect(JSON.stringify(store.config)).toBe(JSON.stringify(store.baseline));
  });

  it('load does not keep a live reference to the passed object', () => {
    const custom = PB.cloneConfig(PB.defaultConfig);
    store.load(custom);
    custom.layers[0].freq = 42; // mutate caller's copy after loading
    expect(store.config.layers[0].freq).not.toBe(42);
  });
});
