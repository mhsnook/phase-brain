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
});
