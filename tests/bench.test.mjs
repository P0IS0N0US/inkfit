/* The speed page's timing and what the server gives it. */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { BATCH, ROUNDS, summarise, timeOne } from '../tools/bench_run.mjs';
import { captureServer } from '../tools/capture.mjs';

const drawing = (shape, input) => JSON.stringify({ shape, input, strokes: [[[0, 0], [3, 4]]] });

const printed = [];
let dir;
let server;
let url;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'inkfit-bench-'));
  await mkdir(join(dir, 'mouse'));
  await writeFile(join(dir, 'mouse', 'arrow.jsonl'), `${drawing('arrow', 'mouse')}\n${drawing('arrow', 'mouse')}\n`);
  server = captureServer(dir, line => printed.push(line));
  await new Promise(r => { server.listen(0, '127.0.0.1', r); });
  url = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise(r => { server.close(r); });
  await rm(dir, { recursive: true });
});

/** A raw request, for a path `fetch` would tidy up. @returns {Promise<number>} */
const statusOf = (path, host) => new Promise((done, fail) => {
  const req = request(url, { path, headers: host ? { host } : {} }, res => { res.resume(); done(res.statusCode); });
  req.on('error', fail);
  req.end();
});

/** What a server recording into `place` answers. It always closes, or a failing test
 * would hang the run. @param {string} place */
async function recordingsFrom(place) {
  const other = captureServer(place);
  await new Promise(r => { other.listen(0, '127.0.0.1', r); });
  try {
    const res = await fetch(`http://127.0.0.1:${other.address().port}/recordings`);
    return { status: res.status, body: await res.json() };
  } finally {
    other.closeAllConnections();
    await new Promise(r => { other.close(r); });
  }
}

test('a drawing\'s time is per fit, from a whole batch', () => {
  let clock = 0;
  let fits = 0;
  const time = timeOne(() => { fits += 1; clock += 2; }, null, () => clock);
  assert.equal(time, 2);
  assert.equal(fits, BATCH * ROUNDS);
});

test('one slow batch doesn\'t set a drawing\'s time', () => {
  let clock = 0;
  let fits = 0;
  const slowAt = at => {
    let clocked = 0;
    fits = 0;
    return timeOne(() => { fits += 1; clocked += fits === at ? 500 : 1; }, null, () => clocked);
  };
  assert.equal(slowAt(1), 1, 'in the first batch');
  assert.equal(slowAt(BATCH * ROUNDS), 1, 'in the last batch');
  assert.equal(clock, 0);
});

test('a set of times gives its typical, near-worst and worst', () => {
  const times = Array.from({ length: 100 }, (_, i) => i + 1).reverse();
  assert.deepEqual(summarise(times), { typical: 51, p90: 90, slowest: 100 });
});

test('the page, its timing and the library are served, and modules as modules', async () => {
  const page = await fetch(url + '/bench');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /inkfit speed/);
  for (const path of ['/bench_run.mjs', '/src/index.mjs', '/src/shapes/index.mjs', '/src/shapes/arrow.mjs']) {
    const res = await fetch(url + path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-type'), /javascript/, path);
  }
});

test('nothing outside the library\'s source is served', async () => {
  for (const path of ['/src/../tools/capture.mjs', '/src/../package.json', '/src/%2e%2e/package.json', '/src/shapes/../../package.json', '/src/index.txt', '/src/nothing.mjs', '/tools/capture.mjs', '/elsewhere/nothing.txt']) {
    assert.equal(await statusOf(path), 404, path);
  }
});

test('the recordings come as a caller would pass them', async () => {
  const found = await (await fetch(url + '/recordings')).json();
  assert.equal(found.length, 2);
  assert.deepEqual(found[0], { shape: 'arrow', strokes: [[{ x: 0, y: 0 }, { x: 3, y: 4 }]] });
});

test('a site pointing its own name here gets none of it', async () => {
  for (const path of ['/bench', '/recordings', '/src/index.mjs']) assert.equal(await statusOf(path, 'rebind.example.com'), 403, path);
});

const results = (extra = {}) => ({
  firstFit: 21.5,
  rows: [{ name: '9 and a star', typical: 1.25, p90: 2, slowest: 3, spaced: 8.333 }],
  ...extra,
});

const send = (body, headers = { 'content-type': 'application/json' }) => fetch(`${url}/bench-results`, { method: 'POST', headers, body });

test('a run\'s results are printed, with the worst spaced fit as a share of a frame', async () => {
  printed.length = 0;
  assert.equal((await send(JSON.stringify(results()))).status, 200);
  const text = printed.join('\n');
  assert.match(text, /Speed: very first fit 21\.50 ms/);
  assert.match(text, /9 and a star\s+1\.25 ms\s+2\.00 ms\s+3\.00 ms\s+8\.33 ms\s+50%/);
});

test('nothing but the numbers and a plain name reaches the terminal', async () => {
  printed.length = 0;
  const bad = [
    results({ firstFit: 'x\u001b[2Jwiped' }),
    results({ firstFit: 'soon' }),
    results({ firstFit: -1 }),
    results({ firstFit: null }),
    results({ rows: [] }),
    results({ rows: 'none' }),
    results({ rows: Array.from({ length: 9 }, () => results().rows[0]) }),
    results({ rows: [{ ...results().rows[0], name: 'line\nforged' }] }),
    results({ rows: [{ ...results().rows[0], name: 'x'.repeat(25) }] }),
    results({ rows: [{ ...results().rows[0], spaced: 1e9 }] }),
    results({ rows: [{ name: 'no numbers' }] }),
    null,
  ];
  for (const body of bad) assert.equal((await send(JSON.stringify(body))).status, 400, JSON.stringify(body));
  assert.equal((await send('not json')).status, 400);
  assert.equal(printed.length, 0);
});

test('results are refused from a page elsewhere, like any other write', async () => {
  printed.length = 0;
  assert.equal((await send(JSON.stringify(results()), { 'content-type': 'text/plain' })).status, 415);
  assert.equal(printed.length, 0);
});

test('results are not saved', async () => {
  const before_ = await readdir(dir, { recursive: true });
  await send(JSON.stringify(results()));
  assert.deepEqual(await readdir(dir, { recursive: true }), before_);
});

test('a stray file beside the recordings is ignored', async () => {
  await writeFile(join(dir, 'mouse', 'notes.txt'), '[not a recording]\n');
  const found = await (await fetch(url + '/recordings')).json();
  assert.equal(found.length, 2);
});

test('a broken recording, or a folder that can\'t be read, is reported as a failure', async () => {
  const broken = await mkdtemp(join(tmpdir(), 'inkfit-bench-'));
  await mkdir(join(broken, 'mouse'));
  await writeFile(join(broken, 'mouse', 'arrow.jsonl'), '{"shape":"arr\n');
  const notAFolder = join(broken, 'mouse', 'arrow.jsonl');
  try {
    for (const place of [broken, notAFolder]) {
      const res = await recordingsFrom(place);
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { error: 'could not read' });
    }
  } finally {
    await rm(broken, { recursive: true });
  }
});

test('no recordings yet is an empty list', async () => {
  assert.deepEqual((await recordingsFrom(join(dir, 'none'))).body, []);
});
