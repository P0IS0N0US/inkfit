/* What a caller relies on, tried on strokes recorded on real devices. The floors are
   what today's recordings reach, so a change can't quietly lose ground. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MIN_SCORE, createFitter } from '../src/index.mjs';
import { reduce } from '../src/reduce.mjs';
import { scorerFor } from '../src/score.mjs';
import { arrow, circle, curve, ellipse, line, outline, polyline, rectangle, square, triangle } from '../src/shapes/index.mjs';
import { recordings } from './recordings.mjs';

/** A five-pointed star as the recordings draw it: around its edge, tip then notch. */
const STAR_POINTS = Array.from({ length: 11 }, (_, i) => {
  const angle = (i % 10) * Math.PI / 5;
  const radius = i % 2 ? 0.382 : 1;
  return { x: radius * Math.sin(angle), y: -radius * Math.cos(angle) };
});
const star = outline('star', STAR_POINTS);

const ALL = recordings();
const SHAPES = [line, curve, polyline, circle, ellipse, rectangle, square, triangle, arrow, star];
const fit = createFitter(SHAPES);

const asked = shape => ALL.filter(d => d.shape === shape);
const named = result => result.best?.name ?? null;

/** What `arrow` proposes, if it wasn't left out on ink and freedom. */
const arrowIn = strokes => fit(strokes).candidates.find(c => c.name === 'arrow');

/** A plain shape's proposal, a straight run from a drawing's first point to its last. */
const endToEnd = drawing => ({ paths: [[drawing.points[0], drawing.points.at(-1)]], freedom: 1 });

/** How many of a shape's recordings come out as a name.
 * @param {string} shape @param {string} name */
const hits = (shape, name, fitter = fit) => asked(shape).filter(d => named(fitter(d.strokes)) === name).length;

/** A shape's recordings drawn in one stroke: a slip of the pen can make a curve two. */
const oneStroke = shape => asked(shape).filter(d => d.strokes.length === 1);

/** The share of a shape's recordings that a fitter gives a name. */
const share = (shape, name, fitter = fit) => hits(shape, name, fitter) / asked(shape).length;

/** The share of a shape's recordings that snap to anything at all. */
const snapped = (shape, fitter = fit) => asked(shape).filter(d => fitter(d.strokes).best).length / asked(shape).length;

for (const [shape, floor] of [
  ['line', 1],
  ['polyline', 0.95],
  ['rectangle', 0.95],
  ['triangle', 0.95],
  ['curve', 0.9],
  ['star', 0.9],
  ['arrow', 0.85],
  ['ellipse', 0.85],
  ['circle', 0.75],
  ['square', 0.55],
]) {
  test(`a recorded ${shape} comes out as one`, () => {
    assert.ok(share(shape, shape) >= floor, `${share(shape, shape)}, wanted ${floor}`);
  });
}

test('a part-drawn circle is never a circle', () => {
  assert.equal(hits('half-circle', 'circle'), 0);
});

test('with no curve bound, a part-drawn circle stays a stroke', () => {
  const closed = createFitter([circle, rectangle]);
  assert.equal(asked('half-circle').filter(d => closed(d.strokes).best).length, 0);
});

test('a star from an outline is told from everything else', () => {
  assert.equal(ALL.filter(d => d.shape !== 'star' && named(fit(d.strokes)) === 'star').length, 0);
});

test('a round drawing isn\'t a rectangle, even with no round shape bound', () => {
  const boxes = createFitter([rectangle]);
  for (const shape of ['circle', 'ellipse']) assert.equal(snapped(shape, boxes), 0, shape);
});

test('a clean 4:3 rectangle stays a rectangle, at any angle', () => {
  const pair = createFitter([square, rectangle]);
  const box = (w, h, angle) => {
    const corners = [[0, 0], [w, 0], [w, h], [0, h], [0, 0]];
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    return [corners.map(([x, y]) => ({ x: x * c - y * s, y: x * s + y * c }))];
  };
  for (const angle of [0, 0.4, Math.PI / 4]) {
    assert.equal(named(pair(box(400, 300, angle))), 'rectangle');
    assert.equal(named(pair(box(320, 300, angle))), 'square', 'a nearly square one is a square');
  }
});

test('a real rectangle or square still snaps with only rectangle bound', () => {
  const boxes = createFitter([rectangle]);
  for (const shape of ['rectangle', 'square']) assert.ok(snapped(shape, boxes) >= 0.9, shape);
});

test('a boxy drawing is usually not a circle, even with no boxy shape bound', () => {
  const rounds = createFitter([circle]);
  const all = (snapped('rectangle', rounds) + snapped('square', rounds)) / 2;
  assert.ok(all <= 0.4, String(all));
});

test('an outline comes back with its own corners, not a sampling of them', () => {
  const [d] = asked('star');
  const [path] = fit(d.strokes).best.paths;
  assert.equal(path.length, STAR_POINTS.length);
  const scale = Math.hypot(path[1].x - path[0].x, path[1].y - path[0].y) / Math.hypot(STAR_POINTS[1].x - STAR_POINTS[0].x, STAR_POINTS[1].y - STAR_POINTS[0].y);
  path.slice(1).forEach((p, i) => {
    const want = Math.hypot(STAR_POINTS[i + 1].x - STAR_POINTS[i].x, STAR_POINTS[i + 1].y - STAR_POINTS[i].y) * scale;
    assert.ok(Math.abs(Math.hypot(p.x - path[i].x, p.y - path[i].y) - want) < 1e-6);
  });
});

test('moving a result\'s paths moves every point once', () => {
  for (const d of ALL) {
    for (const c of fit(d.strokes).candidates) {
      const points = c.paths.flat();
      assert.equal(new Set(points).size, points.length, c.name);
    }
  }
});

test('an ellipse\'s first radius is its long one, along its rotation', () => {
  const nearlyRound = Array.from({ length: 60 }, (_, k) => [Array.from({ length: 200 }, (_, i) => {
    const angle = i / 200 * 2 * Math.PI;
    const [x, y] = [(150 + k * 0.1) * Math.cos(angle) + 2 * Math.sin(angle * 3 + k), 150 * Math.sin(angle) + 2 * Math.cos(angle * 2 + k)];
    return { x: 300 + x * Math.cos(k) - y * Math.sin(k), y: 300 + x * Math.sin(k) + y * Math.cos(k) };
  })]);
  for (const strokes of [...nearlyRound, ...asked('ellipse').map(d => d.strokes)]) {
    const { radii, rotation, center, paths } = createFitter([ellipse])(strokes).candidates[0];
    assert.ok(radii[0] >= radii[1]);
    const end = paths[0][0];
    assert.ok(Math.abs(end.x - (center.x + radii[0] * Math.cos(rotation))) < 1e-6);
    assert.ok(Math.abs(end.y - (center.y + radii[0] * Math.sin(rotation))) < 1e-6);
  }
});

test('with its shape unbound, a star stays a stroke', () => {
  const others = createFitter(SHAPES.filter(s => s.name !== 'star' && s.name !== 'curve'));
  assert.equal(asked('star').filter(d => others(d.strokes).best).length, 0);
});

test('most scribbles stay strokes', () => {
  assert.ok(snapped('scribble') <= 0.3, String(snapped('scribble')));
});

test('a zigzag has few corners, so a long one back and forth is a scribble', () => {
  const only = createFitter([polyline]);
  const teeth = count => [Array.from({ length: count }, (_, i) => ({ x: i * 40, y: i % 2 ? 200 : 0 }))];
  assert.equal(named(only(teeth(6))), 'polyline');
  assert.equal(only(teeth(12)).best, null);
});

test('far more ink than a shape has is not that shape', () => {
  const corners = [[0, 0], [400, 0], [400, 300], [0, 300]].map(([x, y]) => ({ x, y }));
  const around = Array.from({ length: 13 }, (_, i) => corners[i % 4]);
  assert.equal(createFitter([rectangle])([around]).best, null);
  assert.equal(named(createFitter([rectangle])([around.slice(0, 5)])), 'rectangle');
});

test('with both bound, a drawing no freer than it needs to be wins', () => {
  const pair = (s, a, b) => share(s, a.name, createFitter([a, b]));
  assert.ok(pair('circle', circle, ellipse) >= 0.75, 'a drawn circle is usually a circle, not a wobbly ellipse');
  assert.ok(pair('square', square, rectangle) >= 0.55, 'a drawn square is usually a square');
  assert.ok(pair('rectangle', rectangle, square) >= 0.9, 'a drawn rectangle stays one');
  assert.ok(pair('ellipse', ellipse, circle) >= 0.85, 'an oval stays one');
});

test('a polyline stays open, has real corners, and never crosses itself', () => {
  const only = createFitter([polyline]);
  for (const shape of ['rectangle', 'square', 'triangle', 'star', 'circle']) {
    assert.equal(asked(shape).filter(d => only(d.strokes).best).length, 0, shape);
  }
  assert.equal(asked('line').filter(d => only(d.strokes).best).length, 0, 'a line has no corners');
  assert.ok(asked('curve').filter(d => only(d.strokes).best).length <= 1, 'a curve has no corners');
  const crossing = [[0, 0], [300, 0], [300, 300], [150, 300], [150, -200]].map(([x, y]) => ({ x, y }));
  assert.equal(only([crossing]).best, null, 'a path that crosses itself is no polyline');
  assert.equal(named(only([crossing.slice(0, 4)])), 'polyline', 'the same path, before it crosses, is one');
});

test('a triangle comes back as its three corners', () => {
  for (const d of asked('triangle')) {
    const { best } = fit(d.strokes);
    assert.equal(best.corners.length, 3);
    assert.deepEqual(best.paths[0][3], best.corners[0]);
  }
});

test('an ellipse comes back with radii that fit its drawing', () => {
  for (const d of asked('ellipse')) {
    const found = fit(d.strokes).candidates.find(c => c.name === 'ellipse');
    const points = d.strokes.flat();
    const span = Math.hypot(Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)), Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)));
    assert.ok(Math.max(...found.radii) * 2 > span * 0.6 && Math.max(...found.radii) * 2 < span * 1.2);
    assert.ok(Math.min(...found.radii) > 0);
  }
});

test('a square\'s four sides match its side length', () => {
  const found = asked('square').map(d => square.fit(reduce(d.strokes))).filter(Boolean);
  assert.ok(found.length >= asked('square').length * 0.7, 'most drawn squares get a proposal');
  for (const { corners: [a, b, c], side } of found) {
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - side) < 1e-9);
    assert.ok(Math.abs(Math.hypot(c.x - b.x, c.y - b.y) - side) < 1e-9);
  }
});

test('an outline lands on its drawing, whichever way that was turned', () => {
  const [d] = asked('star');
  for (const angle of [0.7, 2, 4.5]) assert.equal(named(fit(rotatedBy(d.strokes, angle))), 'star');
});

test('an outline can\'t be made from nothing', () => {
  assert.throws(() => outline('dot', [{ x: 1, y: 1 }, { x: 1, y: 1 }]), /dot/);
  assert.throws(() => outline('none', []), /none/);
});

test('the same stroke can be straightened or kept curved, by what is bound', () => {
  const straight = createFitter([line]);
  const curved = createFitter([curve]);
  const either = createFitter([line, curve]);
  for (const d of asked('line')) {
    assert.equal(named(straight(d.strokes)), 'line');
    assert.equal(named(either(d.strokes)), 'line');
    assert.equal(named(curved(d.strokes)), 'curve');
  }
  for (const d of oneStroke('curve')) assert.equal(named(curved(d.strokes)), 'curve');
  assert.ok(share('curve', 'curve', either) >= 0.9, 'with both bound, a curve stays one');
  const refused = 1 - snapped('curve', straight);
  assert.ok(refused >= 0.8, `a line alone refuses a real curve: ${refused}`);
});

test('a list\'s order never decides', () => {
  const reversed = createFitter([...SHAPES].reverse());
  for (const d of ALL) assert.deepEqual(reversed(d.strokes), fit(d.strokes));
});

test('binding another shape changes no other score', () => {
  const fewer = createFitter([line, circle]);
  for (const d of ALL) {
    const scores = result => Object.fromEntries(result.candidates.map(c => [c.name, c.score]));
    const all = scores(fit(d.strokes));
    const some = scores(fewer(d.strokes));
    assert.equal(some.line, all.line);
    assert.equal(some.circle, all.circle);
  }
});

test('leaving out what can\'t reach the bar never changes the winner', () => {
  let leftOut = 0;
  for (const d of ALL) {
    const drawing = reduce(d.strokes);
    const scoreOf = scorerFor(drawing);
    const scored = SHAPES.flatMap(s => {
      const proposal = s.fit(drawing);
      return proposal ? [{ name: s.name, score: scoreOf(proposal) }] : [];
    }).filter(c => c.score !== null).sort((a, b) => b.score - a.score);
    const result = fit(d.strokes);
    assert.equal(named(result), scored[0]?.score >= MIN_SCORE ? scored[0].name : null);
    for (const c of result.candidates) assert.equal(c.score, scored.find(s => s.name === c.name).score);
    leftOut += scored.length - result.candidates.length;
  }
  assert.ok(leftOut > ALL.length, 'on real drawings, many proposals are left out');
});

test('the same strokes always give the same result', () => {
  for (const d of ALL) assert.deepEqual(fit(d.strokes), fit(d.strokes));
});

test('candidates come best first, each with a score from 0 to 1', () => {
  for (const d of ALL) {
    const scores = fit(d.strokes).candidates.map(c => c.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
    assert.ok(scores.every(s => s >= 0 && s <= 1));
  }
});

/** The share of drawings whose result survives a change to their strokes.
 * @param {(strokes: {x: number, y: number}[][]) => {x: number, y: number}[][]} change */
const surviving = change => ALL.filter(d => named(fit(d.strokes)) === named(fit(change(d.strokes)))).length / ALL.length;

const moved = (strokes, map) => strokes.map(s => s.map(map));

test('a drawing means the same at any size and anywhere', () => {
  assert.equal(surviving(s => moved(s, p => ({ x: p.x * 10, y: p.y * 10 }))), 1);
  assert.equal(surviving(s => moved(s, p => ({ x: p.x / 10, y: p.y / 10 }))), 1);
  assert.equal(surviving(s => moved(s, p => ({ x: p.x - 5000, y: p.y + 3000 }))), 1);
});

test('a hook is trimmed the same at any scale', () => {
  const [stroke] = asked('line')[0].strokes;
  const end = stroke.at(-1);
  const tail = Array.from({ length: 6 }, (_, i) => ({ x: end.x + (i + 1) * 14 / 6, y: end.y + (i + 1) * 14 / 6 }));
  const counted = scale => reduce([[...stroke, ...tail].map(p => ({ x: p.x * scale, y: p.y * scale }))]).points.length;
  for (const scale of [1.0069, 1.37, 2.71, 0.53, 17.3]) assert.equal(counted(scale), counted(1));
});

test('a drawing means nearly the same at other angles', () => {
  for (const angle of [0.5, 1.2, 2.5, 4]) {
    const share = surviving(st => rotatedBy(st, angle));
    assert.ok(share >= 0.9, `${share} at ${angle}`);
  }
});

test('a busy page delivering fewer points changes little', () => {
  const thin = st => st.map(s => s.filter((_, i) => i % 3 === 0 || i === s.length - 1));
  assert.ok(surviving(thin) >= 0.9);
});

test('a finger repeating its points changes nothing', () => {
  assert.equal(surviving(st => st.map(s => s.flatMap(p => [p, p, p]))), 1);
});

test('nothing to work with gives no shape, and no error', () => {
  const dot = { x: 3, y: 4 };
  for (const strokes of [[], [[]], [[dot]], [[dot, dot, dot]], [[], [dot]]]) {
    assert.deepEqual(fit(strokes), { best: null, candidates: [] });
  }
  assert.doesNotThrow(() => fit([[dot, { x: 5, y: 4 }]]));
  assert.doesNotThrow(() => fit([[dot, { x: 5, y: 4 }], [{ x: 9, y: 9 }]]));
  const tap = { x: 10, y: 0 };
  assert.doesNotThrow(() => fit([[tap], [tap], [{ x: 10, y: 100 }]]), 'two taps on one spot, in line with a third');
});

test('a bad point gives no shape, and no error, whichever shapes are bound', () => {
  const inputs = [
    [[{ x: 1, y: 1 }, { x: NaN, y: 2 }]],
    [[{ x: 1 }, { x: 3, y: 2 }]],
    [[{ x: Infinity, y: 0 }, { x: Infinity, y: 1 }]],
    [[{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: NaN, y: NaN }]],
  ];
  for (const strokes of inputs) {
    for (const shape of SHAPES) assert.deepEqual(createFitter([shape])(strokes), { best: null, candidates: [] }, shape.name);
  }
});

test('a shape a caller supplies is judged like a built-in, and its fields come back', () => {
  const box = {
    name: 'corner mark',
    fit(drawing) {
      const [first] = drawing.strokes;
      return { paths: [[first[0], first.at(-1)]], freedom: 4, note: 'mine' };
    },
  };
  const result = createFitter([box])(asked('line')[0].strokes);
  assert.equal(result.best.name, 'corner mark');
  assert.equal(result.best.note, 'mine');
  assert.ok(result.best.score > 0.5);
});

test('two shapes can\'t share a name', () => {
  assert.throws(() => createFitter([line, line]));
});

test('a fitter ignores later changes to the list it was given', () => {
  const list = [line];
  const fixed = createFitter(list);
  list.push({ name: 'mark', fit: endToEnd });
  assert.equal(fixed(asked('line')[0].strokes).candidates.length, 1);
});

test('a nearly straight stroke stays cheap, and comes out as a line', () => {
  for (const bump of [0.1, 0.001, 1e-7]) {
    const strokes = [[{ x: 0, y: 0 }, { x: 500, y: bump }, { x: 1000, y: 0 }]];
    assert.equal(named(createFitter([line, circle])(strokes)), 'line');
    assert.equal(circle.fit(reduce(strokes)), null);
  }
});

test('a proposal far larger than its drawing is scored without blowing up', () => {
  const paths = [[{ x: 0, y: 0 }, { x: 1e12, y: 0 }]];
  assert.ok(scorerFor(reduce(asked('line')[0].strokes))({ paths, freedom: 1 }) < 0.01);
});

for (const [why, proposal] of [
  ['no paths', { paths: [], freedom: 1 }],
  ['an empty path', { paths: [[]], freedom: 1 }],
  ['no freedom', { paths: [[{ x: 0, y: 0 }, { x: 9, y: 9 }]] }],
  ['negative freedom', { paths: [[{ x: 0, y: 0 }, { x: 9, y: 9 }]], freedom: -40 }],
  ['a point that is not a number', { paths: [[{ x: NaN, y: 0 }, { x: 9, y: 9 }]], freedom: 1 }],
  ['a length too large to measure', { paths: [[{ x: 1e155, y: 0 }, { x: 2e155, y: 1e155 }]], freedom: 1 }],
  ['a point that is null', { paths: [[null]], freedom: 1 }],
  ['a path that is null', { paths: [null], freedom: 1 }],
  ['paths that are null', { paths: null, freedom: 1 }],
  ['no paths at all', { freedom: 1 }],
  ['nothing to it, as false', false],
  ['nothing to it, as zero', 0],
]) {
  test(`a proposal with ${why} is left out, and pushes out nothing`, () => {
    const broken = { name: 'a broken shape', fit: () => proposal };
    const result = createFitter([broken, line])(asked('line')[0].strokes);
    assert.equal(named(result), 'line');
    assert.deepEqual(result.candidates.map(c => c.name), ['line']);
  });
}

test('a shape can\'t score or rename itself', () => {
  const farOff = drawing => [drawing.points.map(p => ({ x: p.x + 5000, y: p.y }))];
  const liar = { name: 'liar', fit: drawing => ({ paths: farOff(drawing), freedom: 1, score: 1, name: 'line' }) };
  const [only] = createFitter([liar])(asked('line')[0].strokes).candidates;
  assert.equal(only.name, 'liar');
  assert.ok(only.score < 0.5);
});

test('a repeated point, or a dot on a path, changes no score', () => {
  const { strokes } = asked('line')[0];
  const [a, b] = [strokes[0][0], strokes[0].at(-1)];
  const scored = paths => createFitter([{ name: 'mine', fit: () => ({ paths, freedom: 4 }) }])(strokes).candidates[0].score;
  const plain = scored([[a, b]]);
  assert.ok(plain > 0.5);
  assert.equal(scored([[a, a, b]]), plain);
  assert.equal(scored([[a, b], [a]]), plain);
});

test('a dot in a proposal counts, however it is written', () => {
  const along = Array.from({ length: 20 }, (_, i) => ({ x: i * 5, y: 0 }));
  const atDot = Array.from({ length: 20 }, () => ({ x: 900, y: 0 }));
  const drawing = { points: [...along, ...atDot], size: 900, ink: 100 };
  const dot = { x: 900, y: 0 };
  const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  const scoreOf = scorerFor(drawing);
  const without = scoreOf({ paths: [line], freedom: 4 });
  assert.ok(without < 0.01, 'half the drawing is off the proposal');
  assert.ok(scoreOf({ paths: [line, [dot]], freedom: 4 }) > 0.9, 'as one point');
  assert.ok(scoreOf({ paths: [line, [dot, dot]], freedom: 4 }) > 0.9, 'as a piece of no length');
});

test('equal scores fall to the name, not the list', () => {
  const [a, b] = [{ name: 'a', fit: endToEnd }, { name: 'b', fit: endToEnd }];
  const { strokes } = asked('line')[0];
  assert.equal(createFitter([a, b])(strokes).candidates[0].name, 'a');
  assert.equal(createFitter([b, a])(strokes).candidates[0].name, 'a');
});

test('a line with no line bound is not a rectangle', () => {
  const closed = createFitter([circle, rectangle]);
  assert.equal(asked('line').filter(d => closed(d.strokes).best).length, 0);
});

test('a line with no line bound is no sliver of a triangle or an ellipse', () => {
  for (const shape of [triangle, ellipse]) {
    const proposals = asked('line').filter(d => shape.fit(reduce(d.strokes))).length;
    assert.ok(proposals / asked('line').length <= 0.2, `${shape.name} proposed for ${proposals} lines`);
  }
});

test('a line\'s ends are where the stroke\'s are, on the line', () => {
  for (const d of asked('line')) {
    const [stroke] = d.strokes;
    const { from, to } = fit(d.strokes).best;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    assert.ok(Math.hypot(from.x - stroke[0].x, from.y - stroke[0].y) < length * 0.08);
    assert.ok(Math.hypot(to.x - stroke.at(-1).x, to.y - stroke.at(-1).y) < length * 0.08);
  }
});

test('a rectangle\'s sizes and angle match its corners', () => {
  for (const d of asked('rectangle')) {
    const { best } = fit(d.strokes);
    if (best?.name !== 'rectangle') continue;
    const [a, b, c] = best.corners;
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - best.width) < 1e-9);
    assert.ok(Math.abs(Math.hypot(c.x - b.x, c.y - b.y) - best.height) < 1e-9);
    const turned = Math.atan2(b.y - a.y, b.x - a.x);
    assert.ok(Math.abs(Math.sin(turned - best.rotation)) < 1e-9);
  }
});

test('a line and a curve are one stroke each', () => {
  for (const d of asked('arrow').filter(x => x.strokes.length === 2)) {
    const names = fit(d.strokes).candidates.map(c => c.name);
    assert.ok(!names.includes('line') && !names.includes('curve'));
  }
});

test('a drawn curve is smoothed into a piece or two, not copied wobble by wobble', () => {
  for (const d of oneStroke('curve')) assert.ok(curve.fit(reduce(d.strokes)).segments.length <= 2);
});

test('a curve with more pieces costs more freedom', () => {
  const found = [...oneStroke('curve'), ...oneStroke('scribble'), ...oneStroke('circle')]
    .map(d => curve.fit(reduce(d.strokes)))
    .sort((a, b) => a.segments.length - b.segments.length);
  assert.ok(new Set(found.map(c => c.segments.length)).size > 2);
  found.slice(1).forEach((c, i) => {
    if (c.segments.length > found[i].segments.length) assert.ok(c.freedom > found[i].freedom);
  });
});

test('what comes back is the caller\'s to change', () => {
  for (const d of ALL) {
    for (const c of fit(d.strokes).candidates) {
      assert.ok(!c.paths.flat().some(Object.isFrozen), c.name);
      assert.ok(!(c.segments ?? []).flat().some(Object.isFrozen), c.name);
    }
  }
});

test('a shape can be a class', () => {
  class Mark {
    name = 'mark';
    fit(drawing) { return { paths: [[drawing.points[0], drawing.points.at(-1)]], freedom: this.cost }; }
    cost = 4;
  }
  assert.equal(named(createFitter([new Mark()])(asked('line')[0].strokes)), 'mark');
});

test('a shape without a fit is refused at once', () => {
  assert.throws(() => createFitter([{ name: 'nothing' }]), /nothing/);
});

test('a result shares nothing with the strokes it came from', () => {
  const [stroke] = asked('curve')[0].strokes;
  const { best } = fit([stroke]);
  const given = new Set(stroke);
  assert.ok(!best.paths.flat().some(p => given.has(p)));
  assert.ok(!best.segments.flat().some(p => given.has(p)));
});

test('a fitter holds its own copy of each shape', () => {
  const mine = { name: 'mine', fit: endToEnd };
  const fixed = createFitter([mine]);
  mine.fit = () => null;
  assert.equal(fixed(asked('line')[0].strokes).candidates.length, 1);
});

test('a shape can\'t change what the next shape sees', () => {
  const vandal = { name: 'vandal', fit(d) { d.points.length = 2; return null; } };
  assert.throws(() => createFitter([vandal])(asked('line')[0].strokes), TypeError);
});

const rotatedBy = (strokes, angle) => {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  return moved(strokes, p => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
};

/** The arrows a proposal was made for: a rare one has a head too small to read. */
const proposedArrows = () => asked('arrow').filter(d => arrowIn(d.strokes));

/** Whether a proposal's tip lies where another's does, near enough for the same arrow.
 * @param {{tip: object, tail: object} | null} got @param {{x: number, y: number}} want @param {number} length */
const tipNear = (got, want, length) => got !== null && Math.hypot(got.tip.x - want.x, got.tip.y - want.y) < length * 0.15;

test('nearly every arrow gets a proposal', () => {
  assert.ok(proposedArrows().length / asked('arrow').length >= 0.9);
});

test('an arrow\'s tip stays on its head whichever way it points', () => {
  for (const d of proposedArrows()) {
    const { tip, tail } = arrowIn(d.strokes);
    const length = Math.hypot(tip.x - tail.x, tip.y - tail.y);
    for (const angle of [Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const [c, s] = [Math.cos(angle), Math.sin(angle)];
      const want = { x: tip.x * c - tip.y * s, y: tip.x * s + tip.y * c };
      assert.ok(tipNear(arrowIn(rotatedBy(d.strokes, angle)), want, length));
    }
  }
});

test('an arrow drawn backwards still points at its head', () => {
  for (const d of proposedArrows()) {
    const { tip, tail } = arrowIn(d.strokes);
    const length = Math.hypot(tip.x - tail.x, tip.y - tail.y);
    assert.ok(tipNear(arrowIn([...d.strokes].reverse().map(s => [...s].reverse())), tip, length));
  }
});

test('a fork is no arrow, however its head would read', () => {
  const wobble = i => Math.sin(i * 1.7) * 2;
  const run = (from, to, count) => Array.from({ length: count + 1 }, (_, i) => ({ x: from.x + (to.x - from.x) * i / count + wobble(i), y: from.y + (to.y - from.y) * i / count + wobble(i + 3) }));
  const crotch = { x: 120, y: 0 };
  const shaft = run({ x: 0, y: 0 }, crotch, 24);
  const prongs = [...run({ x: 170, y: 60 }, crotch, 12), ...run(crotch, { x: 170, y: -60 }, 12)];
  assert.notEqual(named(fit([shaft, prongs])), 'arrow');
  assert.notEqual(named(fit([[...shaft, ...run(crotch, { x: 170, y: 60 }, 12), ...run({ x: 170, y: 60 }, crotch, 12), ...run(crotch, { x: 170, y: -60 }, 12)]])), 'arrow');
});

test('an arrow comes back as a shaft and a head, however it was drawn', () => {
  for (const d of proposedArrows()) {
    const found = arrowIn(d.strokes);
    assert.equal(found.paths.length, 2);
    assert.equal(found.paths[0].length, 2);
    assert.deepEqual(found.paths[0][1], found.tip);
    assert.deepEqual(found.paths[1][1], found.tip);
  }
  assert.ok(asked('arrow').some(d => d.strokes.length === 1));
  assert.ok(asked('arrow').some(d => d.strokes.length === 2));
});

test('an arrow points the way it was drawn, towards its head', () => {
  for (const d of proposedArrows()) {
    const { tail, tip, barbs } = arrowIn(d.strokes);
    const shaft = Math.hypot(tip.x - tail.x, tip.y - tail.y);
    assert.ok(barbs.every(b => Math.hypot(b.x - tail.x, b.y - tail.y) < shaft * 1.05), 'its barbs should sweep back along the shaft');
  }
});

test('a curve\'s pieces join up, ready to draw', () => {
  for (const d of oneStroke('curve')) {
    const { segments } = curve.fit(reduce(d.strokes));
    segments.forEach((c, i) => { if (i) assert.deepEqual(c[0], segments[i - 1][3]); });
  }
});

