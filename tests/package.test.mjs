/* What someone installing the library gets: every entry point exists, and the hand-written
   types match what the code really does, as nothing else would catch them drifting. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as main from '../src/index.mjs';
import { reduce } from '../src/reduce.mjs';
import * as shapes from '../src/shapes/index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(ROOT, path), 'utf8');
const pack = JSON.parse(read('package.json'));

/** A declaration file with its comments gone, so a word in one can't pass as a field. */
const declarations = path => read(path).replace(/\/\*[\s\S]*?\*\//g, '');

/** The values a declaration file says exist. @param {string} path */
const declared = path => [...declarations(path).matchAll(/^export (?:const|function) (\w+)/gm)].map(m => m[1]).sort();

const TYPES = declarations('src/shapes/index.d.ts');

/** A declared proposal type's own fields. @param {string} type */
function fieldsOf(type) {
  const body = new RegExp(`interface ${type} extends Proposal \\{([^}]*)\\}`).exec(TYPES)?.[1];
  assert.ok(body, `no type ${type}`);
  return [...body.matchAll(/^\s*(\w+):/gm)].map(m => m[1]).sort();
}

const run = (from, to, count = 30) => Array.from({ length: count + 1 }, (_, i) => ({
  x: from.x + (to.x - from.x) * i / count,
  y: from.y + (to.y - from.y) * i / count,
}));
const through = (...corners) => corners.slice(1).flatMap((c, i) => run(corners[i], c));
const point = (x, y) => ({ x, y });
const around = (rx, ry) => Array.from({ length: 121 }, (_, i) => point(rx * Math.cos(i * Math.PI / 60), ry * Math.sin(i * Math.PI / 60)));
const star = shapes.outline('star', around(100, 100));

/** A drawing each shape takes, so none can skip being checked by returning null. */
const DRAWN = {
  line: [run(point(0, 0), point(300, 40))],
  curve: [Array.from({ length: 60 }, (_, i) => point(i * 5, Math.sin(i / 12) * 80))],
  polyline: [through(point(0, 0), point(80, 200), point(160, 0), point(240, 200), point(320, 0))],
  circle: [around(100, 100)],
  ellipse: [around(200, 90)],
  rectangle: [through(point(0, 0), point(400, 0), point(400, 200), point(0, 200), point(0, 0))],
  square: [through(point(0, 0), point(300, 0), point(300, 300), point(0, 300), point(0, 0))],
  triangle: [through(point(0, 0), point(300, 0), point(150, 250), point(0, 0))],
  arrow: [run(point(0, 0), point(400, 0)), through(point(330, -60), point(400, 0), point(330, 60))],
};

test('every entry point has code and types', () => {
  for (const [entry, { types, default: code }] of Object.entries(pack.exports)) {
    assert.ok(read(types).length > 0, entry);
    assert.ok(read(code).length > 0, entry);
  }
});

test('the types declare exactly what the library exports', () => {
  assert.deepEqual(declared('src/index.d.ts'), Object.keys(main).sort());
  assert.deepEqual(declared('src/shapes/index.d.ts'), Object.keys(shapes).sort());
});

for (const [key, shape] of Object.entries(shapes)) {
  if (key === 'outline') continue;
  test(`the ${key} shape returns exactly the fields declared for it`, () => {
    const [, name, type] = new RegExp(`export const ${key}: Shape<'(\\w+)', (\\w+)>`).exec(TYPES) ?? [];
    assert.equal(name, shape.name);
    assert.ok(DRAWN[key], `no drawing to check ${key} with`);
    const proposal = shape.fit(reduce(DRAWN[key]));
    assert.ok(proposal, `${key} made no proposal`);
    assert.deepEqual(Object.keys(proposal).filter(k => k !== 'paths' && k !== 'freedom').sort(), fieldsOf(type));
  });
}

test('an outline returns exactly the fields declared for it', () => {
  const proposal = star.fit(reduce([around(120, 120)]));
  assert.deepEqual(Object.keys(proposal).filter(k => k !== 'paths' && k !== 'freedom').sort(), fieldsOf('OutlineFit'));
});

test('fields declared as pairs are pairs, and a curve\'s pieces are four points', () => {
  assert.equal(shapes.ellipse.fit(reduce(DRAWN.ellipse)).radii.length, 2);
  assert.equal(shapes.arrow.fit(reduce(DRAWN.arrow)).barbs.length, 2);
  assert.ok(shapes.curve.fit(reduce(DRAWN.curve)).segments.every(c => c.length === 4));
});
