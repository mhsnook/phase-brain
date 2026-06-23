/* =============================================================================
 * render.js — draws the simulation onto the canvas
 * =============================================================================
 *
 * Pure drawing: given the engine's current state and the active layers, paint
 * concentric rings of dots, links between phase-locked pairs, and labels. It
 * reads from the engine but never changes it.
 *
 * Visual grammar (same as the original prototypes):
 *   - each layer is a concentric ring; inner = first in the array
 *   - ring thickness grows with that layer's coherence R
 *   - a line is drawn between two dots when they are nearly phase-locked
 *   - dots gently pulse so a frozen-but-alive system still shimmers
 * ---------------------------------------------------------------------------*/

(function () {
  const PhaseBrain = /** @type {any} */ (window.PhaseBrain = window.PhaseBrain || {});

  /** Append an alpha byte (0..1) to a "#rrggbb" colour.
   * @param {string} hex @param {number} a @returns {string} */
  function withAlpha(hex, a) {
    const byte = Math.max(0, Math.min(255, Math.round(a * 255)));
    return hex + byte.toString(16).padStart(2, '0');
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {EngineLike} engine
   * @param {Layer[]} activeLayers
   * @param {{ width: number, height: number, t: number }} view
   */
  function render(ctx, engine, activeLayers, view) {
    const { width, height, t } = view;
    ctx.clearRect(0, 0, width, height);
    const n = activeLayers.length;
    if (n === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '13px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No active layers — enable one in the sidebar', width / 2, height / 2);
      return;
    }

    const cx = width / 2;
    const cy = height / 2 - 6;

    /* Spread rings from an inner radius out to a margin inside the canvas. */
    const innerR = 48;
    const outerR = Math.max(innerR + 20, Math.min(width, height) / 2 - 34);
    const radii = activeLayers.map((_, i) =>
      n === 1 ? innerR : innerR + (i * (outerR - innerR)) / (n - 1)
    );

    const Rs = engine.Rs.length === n ? engine.Rs : activeLayers.map((_, i) => engine.order(engine.layerIdxs[i] || []));

    /* Precompute every dot's screen position. */
    const positions = [];
    for (let li = 0; li < n; li++) {
      const idxs = engine.layerIdxs[li];
      const count = idxs.length;
      for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2 + li * 0.3;
        positions[idxs[k]] = { x: cx + Math.cos(a) * radii[li], y: cy + Math.sin(a) * radii[li] };
      }
    }

    /* Each layer's ring brightens and thickens with its coherence, and picks up
     * a soft glow when highly locked — so the ring itself reads as coherent, not
     * only the links drawn between its nodes. */
    for (let li = 0; li < n; li++) {
      const R = Rs[li];
      ctx.beginPath();
      ctx.arc(cx, cy, radii[li], 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha(activeLayers[li].color, 0.12 + R * 0.7);
      ctx.lineWidth = 1.5 + R * 4.5;
      ctx.shadowColor = activeLayers[li].color;
      ctx.shadowBlur = R * R * 14; // R^2 so only well-locked rings glow
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;

    /* Links between near-locked dots within each layer. We also tally how many
     * active links each node has, so well-connected nodes can glow below. */
    const connections = Array.from({ length: engine.phase.length }, () => 0);
    for (let li = 0; li < n; li++) {
      const idxs = engine.layerIdxs[li];
      const color = activeLayers[li].color;
      for (let a = 0; a < idxs.length; a++) {
        for (let b = a + 1; b < idxs.length; b++) {
          const i = idxs[a], j = idxs[b];
          const diff = Math.abs(Math.sin((engine.phase[i] - engine.phase[j]) / 2));
          if (diff < 0.25) {
            connections[i]++;
            connections[j]++;
            ctx.strokeStyle = withAlpha(color, 0.16 + Rs[li] * 0.35);
            ctx.beginPath();
            ctx.moveTo(positions[i].x, positions[i].y);
            ctx.lineTo(positions[j].x, positions[j].y);
            ctx.stroke();
          }
        }
      }
    }

    /* Dots — a node grows and glows the more of its layer-mates it is locked to,
     * so densely-connected hubs stand out. `frac` is its share of the maximum
     * possible links within its layer. */
    for (let li = 0; li < n; li++) {
      const idxs = engine.layerIdxs[li];
      const color = activeLayers[li].color;
      const maxConn = Math.max(1, idxs.length - 1);
      for (const i of idxs) {
        const p = positions[i];
        const frac = connections[i] / maxConn;
        const pulse = 5 + 2 * Math.sin(t * 4 + p.x * 0.02) + frac * 1.5;
        ctx.shadowColor = color;
        ctx.shadowBlur = frac * frac * 16; // frac^2 so only well-connected nodes glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;

    /* Layer labels along the top. */
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    for (let li = 0; li < n; li++) {
      ctx.fillStyle = withAlpha(activeLayers[li].color, 0.85);
      ctx.fillText(activeLayers[li].name, cx, cy - radii[li] - 7);
    }
  }

  PhaseBrain.render = render;
})();
