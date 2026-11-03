/* Reduction, on real strokes with real kinds of damage. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distance, lengthOf, resample } from '../src/geometry.mjs';
import { reduce } from '../src/reduce.mjs';
import { recordings } from './recordings.mjs';

const ALL = recordings();
const firstOf = shape => ALL.find(d => d.shape === shape).strokes[0];

/** A stroke's end with a short tail dragged aside, as a release can leave it.
 * @param {{x: number, y: number}[]} stroke @param {number} length */
function hooked(stroke, length) {
  const end = stroke.at(-1);
  const tail = Array.from({ length: 6 }, (_, i) => ({ x: end.x + (i + 1) * length / 6, y: end.y + (i + 1) * length / 6 }));
  return [...stroke, ...tail];
}

const backwards = stroke => [...stroke].reverse();

/* The largest controller hook measured was 17 px on a drawing of about 490: these
   tails are that long, as `hooked` moves 12 px on each axis. */
test('a hook dragged off a stroke\'s end is trimmed', () => {
  const stroke = firstOf('line');
  const clean = reduce([stroke]).points;
  const trimmed = reduce([hooked(stroke, 12)]).points;
  assert.ok(distance(trimmed.at(-1), clean.at(-1)) < 12);
});

test('a hook dragged off a stroke\'s start is trimmed', () => {
  const stroke = firstOf('line');
  const clean = reduce([stroke]).points;
  const trimmed = reduce([backwards(hooked(backwards(stroke), 12))]).points;
  assert.ok(distance(trimmed[0], clean[0]) < 12);
});

test('a short real arm at a long stroke\'s end is no hook', () => {
  const shaft = Array.from({ length: 200 }, (_, i) => ({ x: i * 5, y: 0 }));
  const arm = Array.from({ length: 14 }, (_, i) => ({ x: 995, y: (i + 1) * 5 }));
  const { points } = reduce([[...shaft, ...arm]]);
  assert.ok(distance(points.at(-1), { x: 995, y: 70 }) < 1);
});

test('a winding stroke\'s length doesn\'t lengthen what counts as a hook', () => {
  const rows = [0, 1, 2, 3, 4, 5].flatMap(row => [{ x: row % 2 ? 1000 : 0, y: row * 200 }, { x: row % 2 ? 0 : 1000, y: row * 200 }]);
  const arm = { x: 0, y: 1150 };
  const { points } = reduce([[...rows, arm]]);
  assert.ok(distance(points.at(-1), arm) < 1);
});

test('a small stroke beside a long one keeps its shape', () => {
  const long = [{ x: 0, y: 0 }, { x: 1000, y: 0 }];
  const small = [[0, 100], [0, 120], [0, 140], [20, 140], [40, 140], [60, 140], [60, 160], [60, 180]].map(([x, y]) => ({ x, y }));
  assert.ok(reduce([long, small]).strokes[1].length >= 7);
});

test('a real corner far from a stroke\'s end is never cut', () => {
  for (const d of ALL.filter(x => ['rectangle', 'square'].includes(x.shape))) {
    const whole = reduce(d.strokes);
    const untrimmed = d.strokes.flat();
    assert.ok(whole.size > 0.9 * Math.hypot(Math.max(...untrimmed.map(p => p.x)) - Math.min(...untrimmed.map(p => p.x)), Math.max(...untrimmed.map(p => p.y)) - Math.min(...untrimmed.map(p => p.y))));
  }
});

test('however long a stroke gets, the work stays bounded', () => {
  const zigzag = Array.from({ length: 100_000 }, (_, i) => ({ x: (i % 2) * 1000, y: i * 0.01 }));
  assert.ok(reduce([zigzag]).points.length <= 1100);
});

test('a drawing is frozen and holds only coordinates', () => {
  const stroke = ALL[0].strokes[0].map(p => ({ ...p, t: 1 }));
  const drawing = reduce([stroke]);
  const { points, strokes } = drawing;
  assert.ok(Object.isFrozen(drawing) && Object.isFrozen(points) && Object.isFrozen(strokes) && Object.isFrozen(strokes[0]) && Object.isFrozen(points[0]));
  assert.deepEqual(Object.keys(points[0]), ['x', 'y']);
});

test('a curve keeps its ends', () => {
  for (const d of ALL.filter(x => x.shape === 'curve')) {
    const [stroke] = d.strokes;
    const reduced = reduce([stroke]).points;
    const size = reduce([stroke]).size;
    assert.ok(distance(reduced.at(-1), stroke.at(-1)) < size * 0.1, d.input);
    assert.ok(distance(reduced[0], stroke[0]) < size * 0.1, d.input);
  }
});

test('points come out evenly spaced, however they arrived', () => {
  for (const d of ALL) {
    const gaps = reduce(d.strokes).strokes.flatMap(s => s.slice(2, -1).map((p, i) => distance(p, s[i + 1])));
    if (gaps.length < 10) continue;
    const sorted = [...gaps].sort((a, b) => a - b);
    assert.ok(sorted.at(-1) / sorted[sorted.length >> 1] < 1.25, 'no gap much wider than the rest');
    assert.ok(sorted[sorted.length >> 1] > reduce(d.strokes).size / 60);
  }
});

test('a path a whole number of gaps long ends once, whatever the rounding', () => {
  for (const gaps of [3, 7, 64, 97, 128]) {
    const path = Array.from({ length: 11 }, (_, i) => ({ x: Math.sin(i) * 100, y: i * 37.3 }));
    const spacing = lengthOf(path) / gaps;
    const out = resample(path, spacing);
    assert.equal(out.length, gaps + 1);
    assert.deepEqual(out.at(-1), path.at(-1));
    assert.ok(distance(out.at(-1), out.at(-2)) > spacing * 0.5);
  }
});

test('a rest at the end of a stroke leaves no pile of points', () => {
  const stroke = firstOf('line');
  const end = stroke.at(-1);
  const rested = [...stroke, ...Array.from({ length: 200 }, (_, i) => ({ x: end.x + Math.sin(i) * 0.3, y: end.y + Math.cos(i) * 0.3 }))];
  assert.ok(Math.abs(reduce([rested]).points.length - reduce([stroke]).points.length) <= 2);
});

test('nothing in the input is changed', () => {
  const stroke = firstOf('circle');
  const before = JSON.stringify(stroke);
  reduce([stroke]);
  assert.equal(JSON.stringify(stroke), before);
});
