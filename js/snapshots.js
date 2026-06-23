/* =============================================================================
 * snapshots.js — named, persisted configurations in localStorage
 * =============================================================================
 *
 * Lets you keep a library of saved settings ("versions") in the browser. Each
 * snapshot stores the full config plus a name and a timestamp. This is purely a
 * storage wrapper — no DOM, no UI — so it can be unit-tested directly.
 *
 * Stored shape (under one localStorage key): an array of Snapshot objects, in
 * insertion order. list() returns them newest-first.
 * ---------------------------------------------------------------------------*/

(function () {
  const PhaseBrain = /** @type {any} */ (window.PhaseBrain = window.PhaseBrain || {});
  const KEY = 'phase-brain:snapshots';

  /** @returns {Snapshot[]} */
  function readAll() {
    try {
      const raw = window.localStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return []; // corrupt/blocked storage -> behave as empty
    }
  }

  /** @param {Snapshot[]} arr */
  function writeAll(arr) {
    window.localStorage.setItem(KEY, JSON.stringify(arr));
  }

  /** @returns {string} a short, unique id */
  function uid() {
    return 'snap_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
  }

  /** Save the given config under a name. @param {string} name @param {SimConfig} config @returns {Snapshot} */
  function saveSnap(name, config) {
    const all = readAll();
    /** @type {Snapshot} */
    const snap = {
      id: uid(),
      name: name,
      savedAt: new Date().toISOString(),
      config: PhaseBrain.cloneConfig(config),
    };
    all.push(snap);
    writeAll(all);
    return snap;
  }

  PhaseBrain.snapshots = {
    /** All saved snapshots, newest first. @returns {Snapshot[]} */
    list() {
      return readAll().slice().reverse();
    },

    save: saveSnap,

    /** @param {string} id @param {string} name */
    rename(id, name) {
      const all = readAll();
      const s = all.find((x) => x.id === id);
      if (s) {
        s.name = name;
        writeAll(all);
      }
    },

    /** @param {string} id */
    remove(id) {
      writeAll(readAll().filter((x) => x.id !== id));
    },

    /** When no snapshots exist yet, seed one named "default" from the given
     * config so there's always a way back to it.
     * @param {SimConfig} config @returns {boolean} whether a seed was written */
    seedIfEmpty(config) {
      if (readAll().length > 0) return false;
      saveSnap('default', config);
      return true;
    },
  };
})();
