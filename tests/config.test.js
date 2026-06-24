import { describe, it, expect } from 'vitest';

import '../js/config.js';

const PB = window.PhaseBrain;

describe('config', () => {
  it('cloneConfig returns an independent copy', () => {
    const a = PB.cloneConfig(PB.defaultConfig);
    a.layers[0].freq = 999;
    a.globals.dt = 999;
    expect(PB.defaultConfig.layers[0].freq).not.toBe(999);
    expect(PB.defaultConfig.globals.dt).not.toBe(999);
  });

  it('backfills missing globals (migrating a pre-sundowning config) to the defaults', () => {
    // A config saved before sundowning existed: only the original four globals.
    const old = {
      layers: PB.cloneConfig(PB.defaultConfig).layers,
      globals: { alphaBase: 1.2, kBias: 0.5, freqNoise: 0.1, dt: 1 / 60 },
    };
    const migrated = PB.cloneConfig(old);
    // Every sundown knob is now PRESENT (so the sliders render, no undefined).
    for (const key of ['sundownThreshold', 'sundownRate', 'sundownRecovery', 'sundownStrength']) {
      expect(typeof migrated.globals[key]).toBe('number');
    }
    // ...and the effect comes alive with the default strength — anyone who wants
    // the old quiet behaviour can drag it back to 0.
    expect(migrated.globals.sundownStrength).toBeCloseTo(Math.PI * 0.6, 10);
    // Existing globals are untouched.
    expect(migrated.globals.alphaBase).toBe(1.2);
  });

  it('keeps sundowning ON for a fresh default config (does not clobber present keys)', () => {
    const fresh = PB.cloneConfig(PB.defaultConfig);
    expect(fresh.globals.sundownStrength).toBeCloseTo(Math.PI * 0.6, 10);
  });

  it('makeNewLayer creates a unique id and a fully-formed layer', () => {
    const existing = PB.cloneConfig(PB.defaultConfig).layers;
    const fresh = PB.makeNewLayer(existing);
    const ids = new Set(existing.map((l) => l.id));
    expect(ids.has(fresh.id)).toBe(false);
    for (const key of ['id', 'name', 'color', 'enabled', 'count', 'freq', 'coupling']) {
      expect(fresh).toHaveProperty(key);
    }
    expect(fresh.enabled).toBe(true);
    expect(fresh.count).toBeGreaterThan(0);
  });

  it('jumbleConfig keeps layer identity/count/order and stays in range', () => {
    const base = PB.cloneConfig(PB.defaultConfig);
    // a deterministic, varied rng in [0,1)
    let k = 0.123;
    const rng = () => ((k = (k + 0.387) % 1), k);
    const out = PB.jumbleConfig(base, rng);

    // structure preserved: same ids, in the same order
    expect(out.layers.map((l) => l.id)).toEqual(base.layers.map((l) => l.id));

    out.layers.forEach((l, i) => {
      expect(l.name).toBe(base.layers[i].name);
      expect(l.color).toBe(base.layers[i].color);
      expect(l.enabled).toBe(base.layers[i].enabled);
      expect(l.freq).toBeGreaterThanOrEqual(0.5);
      expect(l.freq).toBeLessThanOrEqual(6);
      expect(l.coupling).toBeGreaterThanOrEqual(0.3);
      expect(l.coupling).toBeLessThanOrEqual(2.5);
      expect(Number.isInteger(l.count)).toBe(true);
      expect(l.count).toBeGreaterThanOrEqual(3);
      expect(l.count).toBeLessThanOrEqual(12);
    });

    expect(out.globals.alphaBase).toBeGreaterThanOrEqual(0.8);
    expect(out.globals.alphaBase).toBeLessThanOrEqual(1.55);
    expect(out.globals.dt).toBeGreaterThanOrEqual(0.01);
    expect(out.globals.dt).toBeLessThanOrEqual(0.03);

    // does not mutate the input
    expect(base.layers[0].freq).toBe(PB.defaultConfig.layers[0].freq);
  });
});
