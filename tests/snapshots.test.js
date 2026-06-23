import { describe, it, expect, beforeEach } from 'vitest';

import '../js/config.js';
import '../js/snapshots.js';

const PB = window.PhaseBrain;
const snaps = PB.snapshots;

describe('snapshots (localStorage)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('save then list returns the snapshot with name, time, and config', () => {
    const cfg = PB.cloneConfig(PB.defaultConfig);
    snaps.save('first', cfg);
    const list = snaps.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('first');
    expect(typeof list[0].savedAt).toBe('string');
    expect(list[0].config.layers).toHaveLength(cfg.layers.length);
  });

  it('list is newest-first', () => {
    snaps.save('old', PB.defaultConfig);
    snaps.save('new', PB.defaultConfig);
    expect(snaps.list().map((s) => s.name)).toEqual(['new', 'old']);
  });

  it('rename updates the name', () => {
    const s = snaps.save('a', PB.defaultConfig);
    snaps.rename(s.id, 'b');
    expect(snaps.list()[0].name).toBe('b');
  });

  it('remove deletes only the targeted snapshot', () => {
    const a = snaps.save('a', PB.defaultConfig);
    snaps.save('b', PB.defaultConfig);
    snaps.remove(a.id);
    const names = snaps.list().map((s) => s.name);
    expect(names).toEqual(['b']);
  });

  it('stored config is independent of later edits to the source', () => {
    const cfg = PB.cloneConfig(PB.defaultConfig);
    snaps.save('x', cfg);
    cfg.layers[0].freq = 99;
    expect(snaps.list()[0].config.layers[0].freq).not.toBe(99);
  });

  it('survives corrupt storage by treating it as empty', () => {
    window.localStorage.setItem('phase-brain:snapshots', '{not json');
    expect(snaps.list()).toEqual([]);
    snaps.save('recovered', PB.defaultConfig);
    expect(snaps.list().map((s) => s.name)).toEqual(['recovered']);
  });
});
