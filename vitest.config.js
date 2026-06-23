import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /* jsdom gives us a `window`, which the global-IIFE source files attach to.
     * Tests import the source for its side effects, then read window.PhaseBrain. */
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
});
