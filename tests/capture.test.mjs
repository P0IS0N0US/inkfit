/* The stroke recorder's server: what a recording may hold, that nothing is written
   twice, and that a page on the network can write nothing but a recording. */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, rmdir } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { INPUTS, captureServer, parseBatch } from '../tools/capture.mjs';

let nextId = 0;
const drawing = (extra = {}) => {
  nextId += 1;
  return { id: `d${nextId}`, shape: 'arrow', input: 'controller', strokes: [[[100, 200], [110, 205]]], ...extra };
};

let dir;
let server;
let url;

const fresh = async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(r => { server.close(r); });
    await rm(dir, { recursive: true });
  }
};

before(() => { server = null; });

beforeEach(async () => {
  await fresh();
  dir = await mkdtemp(join(tmpdir(), 'inkfit-capture-'));
  server = captureServer(dir);
  await new Promise(r => { server.listen(0, '127.0.0.1', r); });
  url = `http://127.0.0.1:${server.address().port}`;
});

after(fresh);

const post = (body, headers = { 'content-type': 'application/json' }) => fetch(`${url}/strokes`, { method: 'POST', headers, body });
const upload = list => post(JSON.stringify(list));
const lines = async (input, shape) => (await readFile(join(dir, input, `${shape}.jsonl`), 'utf8')).trimEnd().split('\n').map(l => JSON.parse(l));

/** A raw request, for what `fetch` won't send. @returns {Promise<number>} */
const statusWith = (method, path, headers) => new Promise((done, fail) => {
  const req = request(url + path, { method, headers }, res => { res.resume(); done(res.statusCode); });
  req.on('error', fail);
  req.end();
});

test('a drawing moves to its own origin, across all its strokes', () => {
  const [{ stored }] = parseBatch(JSON.stringify([drawing({ strokes: [[[100, 200], [110.5, 205]], [[90, 250]]] })]));
  assert.deepEqual(stored.strokes, [[[10, 0], [20.5, 5]], [[0, 50]]]);
});

test('only the shape, the input and the strokes reach the file', async () => {
  await upload([drawing({ screen: [1920, 1080], userAgent: 'x' })]);
  const [line] = await lines('controller', 'arrow');
  assert.deepEqual(Object.keys(line).sort(), ['input', 'shape', 'strokes']);
});

test('small movements survive rounding', () => {
  const [{ stored }] = parseBatch(JSON.stringify([drawing({ strokes: [[[1, 1], [1.07, 1]]] })]));
  assert.equal(stored.strokes[0][1][0], 0.07);
});

test('a very long drawing is saved', async () => {
  const points = Array.from({ length: 200_000 }, (_, i) => [i % 7, i % 5]);
  const res = await upload([drawing({ strokes: [points] })]);
  assert.equal(res.status, 200);
});

for (const [name, bad] of [
  ['a shape holding a path', drawing({ shape: '../../evil' })],
  ['an unknown input', drawing({ input: 'pencil' })],
  ['no strokes', drawing({ strokes: [] })],
  ['strokes that are not a list', drawing({ strokes: 'x' })],
  ['an empty stroke', drawing({ strokes: [[]] })],
  ['a point that is not a number', drawing({ strokes: [[[1, 'x']]] })],
  ['a point holding a time, which would show a device\'s rate', drawing({ strokes: [[[1, 2, 16]]] })],
  ['a point that is null', drawing({ strokes: [[null]] })],
  ['a number too large to store', drawing({ strokes: [[[1e306, 0], [0, 0]]] })],
  ['a drawing without an id', drawing({ id: undefined })],
  ['an id that is not text', drawing({ id: 7 })],
  ['an id too long to remember', drawing({ id: 'x'.repeat(65) })],
  ['a missing drawing', null],
]) {
  test(`refuses ${name}`, async () => {
    assert.equal((await upload([bad])).status, 400);
  });
}

test('refuses an upload that is not JSON, or holds no drawings', async () => {
  assert.equal((await post('not json')).status, 400);
  assert.equal((await post('[]')).status, 400);
  assert.equal((await post('{}')).status, 400);
});

test('a refused upload writes nothing, even if its first drawing was good', async () => {
  assert.equal((await upload([drawing({ input: 'finger' }), drawing({ shape: 'nope' })])).status, 400);
  assert.deepEqual(await readdir(dir), []);
});

test('drawings are appended to their input\'s and shape\'s file, one to a line', async () => {
  await upload([drawing()]);
  await upload([drawing()]);
  const found = await lines('controller', 'arrow');
  assert.equal(found.length, 2);
  assert.deepEqual(found[1], { shape: 'arrow', input: 'controller', strokes: [[[0, 0], [10, 5]]] });
});

test('a round sent again after a lost reply is saved once', async () => {
  const round = [drawing(), drawing()];
  assert.equal((await upload(round)).status, 200);
  assert.equal((await upload(round)).status, 200);
  assert.equal((await lines('controller', 'arrow')).length, 2);
});

test('a resend after a failed write saves only what is missing', async () => {
  const blocked = join(dir, 'controller', 'star.jsonl');
  await mkdir(blocked, { recursive: true });
  const round = [drawing(), drawing({ shape: 'star' })];
  assert.equal((await upload(round)).status, 500);
  await rmdir(blocked);
  assert.equal((await upload(round)).status, 200);
  assert.equal((await lines('controller', 'arrow')).length, 1);
  assert.equal((await lines('controller', 'star')).length, 1);
});

test('only exactly JSON is taken, so a browser must ask first', async () => {
  const body = JSON.stringify([drawing()]);
  assert.equal((await post(body, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await post(body, { 'content-type': 'application/x-json-form' })).status, 415);
});

test('a browser asking first gets no permission', async () => {
  const res = await fetch(`${url}/strokes`, { method: 'OPTIONS', headers: { origin: 'https://example.com', 'access-control-request-method': 'POST' } });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.notEqual(res.status, 200);
});

test('a site pointing its own name here is refused', async () => {
  const headers = { host: 'rebind.example.com', origin: 'http://rebind.example.com', 'content-type': 'application/json' };
  assert.equal(await statusWith('GET', '/', headers), 403);
  assert.equal(await statusWith('POST', '/strokes', headers), 403);
});

test('a device on an address or on localhost is served', async () => {
  for (const host of ['192.0.2.7:8123', 'localhost:8123', '[::1]:8123']) assert.equal(await statusWith('GET', '/', { host }), 200);
});

test('an upload far over the limit gets a clean refusal, each time', async () => {
  for (let i = 0; i < 5; i += 1) assert.equal((await post('x'.repeat(8 * 1024 * 1024))).status, 413);
});

test('an unknown address is not found', async () => {
  assert.equal((await fetch(`${url}/strokes`)).status, 404);
  assert.equal((await fetch(`${url}/x`, { method: 'POST', body: '[]' })).status, 404);
});

test('the page, its session and what it asks for are served', async () => {
  const page = await fetch(url + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<canvas/);
  const session = await fetch(url + '/capture_session.mjs');
  assert.equal(session.status, 200);
  assert.match(session.headers.get('content-type'), /javascript/);
  const config = await (await fetch(url + '/config')).json();
  assert.ok(config.prompts.some(p => p.shape === 'arrow'));
  assert.deepEqual(config.inputs, [...INPUTS]);
});
