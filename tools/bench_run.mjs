/* How a fit is timed on a device. No DOM, so tests can run it with a made-up clock.

   A browser may round its clock to a tenth of a millisecond, near what one fit takes, so
   each measure times a batch of fits and divides. A garbage collection can land in any
   batch, so a drawing's time is the median of several: one spike says nothing about it. */

/** How many fits make one timed batch. */
export const BATCH = 4;

/** How many batches each drawing gets. */
export const ROUNDS = 5;

/** A 60 Hz frame, in milliseconds. */
export const FRAME_MS = 1000 / 60;

/** @param {number[]} values */
const sorted = values => [...values].sort((a, b) => a - b);

/** @param {number[]} values */
export const median = values => sorted(values)[values.length >> 1];

/** A drawing's time per fit, in milliseconds.
 * @param {(strokes: any) => unknown} fit @param {any} strokes @param {() => number} now */
export function timeOne(fit, strokes, now) {
  const batches = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    const start = now();
    for (let i = 0; i < BATCH; i += 1) fit(strokes);
    batches.push((now() - start) / BATCH);
  }
  return median(batches);
}

/** A run's results as lines for a terminal. They only ever come from a page on the network,
 * so what is printed is rebuilt from checked numbers and a plain name, never echoed. Null
 * for anything else. @param {any} results @returns {string[] | null} */
export function reportLines(results) {
  const number = v => Number.isFinite(v) && v >= 0 && v < 1e6;
  const { firstFit, rows } = results ?? {};
  if (!number(firstFit) || !Array.isArray(rows) || !rows.length || rows.length > 8) return null;
  const good = r => /^[a-zA-Z0-9 -]{1,24}$/.test(r?.name) && ['typical', 'p90', 'slowest', 'spaced'].every(k => number(r[k]));
  if (!rows.every(good)) return null;
  const ms = v => `${v.toFixed(2)} ms`.padStart(10);
  return [
    `Speed: very first fit ${firstFit.toFixed(2)} ms`,
    `${''.padEnd(24)}${['typical', 'p90', 'slowest', 'spaced'].map(k => k.padStart(10)).join('')}     frame`,
    ...rows.map(r => `${r.name.padEnd(24)}${ms(r.typical)}${ms(r.p90)}${ms(r.slowest)}${ms(r.spaced)}${`${(100 * r.spaced / FRAME_MS).toFixed(0)}%`.padStart(10)}`),
  ];
}

/** The typical, near-worst and worst of a set of drawings' times.
 * @param {number[]} times @returns {{typical: number, p90: number, slowest: number}} */
export function summarise(times) {
  const ordered = sorted(times);
  return {
    typical: median(times),
    p90: ordered[Math.floor((ordered.length - 1) * 0.9)],
    slowest: ordered.at(-1),
  };
}
