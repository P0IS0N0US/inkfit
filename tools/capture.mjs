/* Records hand-drawn strokes as test data.

     node tools/capture.mjs [port]

   Serves tools/capture.html to any device on this network, a headset included,
   and appends what it sends to tests/strokes/<input>/<shape>.jsonl, one drawing
   to a line:

     {"shape":"arrow","input":"mouse","strokes":[[[x,y],...],[[x,y],...]]}

   A drawing keeps only that. It is moved to its own origin, so nothing of the
   screen or the page survives, and it holds no times: the library doesn't use
   them, and they would show a device's refresh rate. It runs over plain HTTP on
   every network interface for as long as it is left running: stop it when done.

   It also serves tools/bench.html at /bench, with the library's source and the
   recordings, to measure how long a fit takes on the device that opens it. The
   page sends its results back, and they are printed here and not saved. */

import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportLines } from './bench_run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Where recordings land, for a run from the command line. */
const STROKES_DIR = join(HERE, '..', 'tests', 'strokes');

const DEFAULT_PORT = 8000;

/** The largest upload taken: far above a round of drawings. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Decimal places kept. Coordinates can be fractional, with deltas near 0.07 px. */
const PRECISION = 1000;

/** The longest id a page may give a drawing. */
const MAX_ID_LENGTH = 64;

/** A Host this server answers: an address or localhost, never a domain name. A site
 * can point its own name at this machine and so count as same-origin here. */
const OK_HOST = /^(?:localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:.]+\])(?::\d+)?$/i;

/** The library's own files, the only ones served from outside this folder. */
const LIBRARY_FILE = /^\/src\/(?:shapes\/)?[a-z_]+\.mjs$/;

/** What the drawer picks by hand: `pointerType` calls a controller `touch`. */
export const INPUTS = Object.freeze(['mouse', 'finger', 'controller']);

/** What to ask for. `half-circle` and `scribble` are there to be refused by a fit. */
export const PROMPTS = Object.freeze([
  { shape: 'line', label: 'a straight line' },
  { shape: 'curve', label: 'a curved line' },
  { shape: 'polyline', label: 'a zigzag' },
  { shape: 'circle', label: 'a circle' },
  { shape: 'ellipse', label: 'an oval' },
  { shape: 'rectangle', label: 'a rectangle' },
  { shape: 'square', label: 'a square' },
  { shape: 'triangle', label: 'a triangle' },
  { shape: 'star', label: 'a star' },
  { shape: 'arrow', label: 'an arrow' },
  { shape: 'half-circle', label: 'half a circle' },
  { shape: 'scribble', label: 'a scribble' },
]);

const JAVASCRIPT = 'text/javascript; charset=utf-8';

/** An upload the client got wrong, as opposed to a failure here. */
class BadBatch extends Error {}

/** @param {boolean} ok @param {string} why */
const check = (ok, why) => { if (!ok) throw new BadBatch(why); };

/** @param {number} n */
const rounded = n => Math.round(n * PRECISION) / PRECISION;

/** Whether a value is one recorded point: `[x, y]`. @param {unknown} p */
const isPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

/** The lowest value of a point's field across strokes. A drawing can be too long to spread into `Math.min`.
 * @param {number[][][]} strokes @param {number} field */
function lowest(strokes, field) {
  let low = Infinity;
  for (const s of strokes) for (const p of s) low = Math.min(low, p[field]);
  return low;
}

/** A drawing as it is stored, its id apart: its known fields only, at its own origin.
 * @param {any} drawing @returns {{id: string, stored: {shape: string, input: string, strokes: number[][][]}}} */
function cleanDrawing(drawing) {
  const { id, shape, input, strokes } = drawing ?? {};
  check(typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_LENGTH, 'a bad id');
  check(PROMPTS.some(p => p.shape === shape), 'an unknown shape');
  check(INPUTS.includes(input), 'an unknown input');
  check(Array.isArray(strokes) && strokes.length > 0, 'no strokes');
  for (const s of strokes) check(Array.isArray(s) && s.length > 0 && s.every(isPoint), 'a bad stroke');
  const [x0, y0] = [0, 1].map(field => lowest(strokes, field));
  const moved = strokes.map(s => s.map(([x, y]) => [rounded(x - x0), rounded(y - y0)]));
  check(moved.every(s => s.every(p => p.every(Number.isFinite))), 'a number out of range');
  return { id, stored: { shape, input, strokes: moved } };
}

/** An upload's value, or null if it isn't JSON. @param {string} text */
function parsedOrNull(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/** The drawings in an upload's text, or a BadBatch saying what was wrong.
 * @param {string} text @returns {ReturnType<typeof cleanDrawing>[]} */
export function parseBatch(text) {
  let batch;
  try { batch = JSON.parse(text); } catch { throw new BadBatch('not JSON'); }
  check(Array.isArray(batch) && batch.length > 0, 'no drawings');
  return batch.map(cleanDrawing);
}

/** Every recorded drawing's strokes under `dir`, as a caller would pass them.
 * @param {string} dir @returns {Promise<{shape: string, strokes: {x: number, y: number}[][]}[]>} */
async function recordingsIn(dir) {
  const inputs = await readdir(dir, { withFileTypes: true }).catch(e => {
    if (e.code === 'ENOENT') return [];   // nothing recorded yet
    throw e;
  });
  const found = [];
  for (const input of inputs) {
    if (!input.isDirectory()) continue;
    const folder = join(dir, input.name);
    for (const file of (await readdir(folder)).filter(name => name.endsWith('.jsonl'))) {
      for (const line of (await readFile(join(folder, file), 'utf8')).split('\n')) {
        if (!line.trim()) continue;
        const { shape, strokes } = JSON.parse(line);
        found.push({ shape, strokes: strokes.map(s => s.map(([x, y]) => ({ x, y }))) });
      }
    }
  }
  return found;
}

/** A request's body as text, or null past the limit. It reads to the end either way:
 * a reply sent over an unread body can reach the client as a reset.
 * @param {import('node:http').IncomingMessage} req @returns {Promise<string | null>} */
async function bodyOf(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= MAX_BODY_BYTES) chunks.push(chunk);
  }
  return size <= MAX_BODY_BYTES ? Buffer.concat(chunks).toString('utf8') : null;
}

/** A server that records into `dir`, and hands speed results to `print`.
 * @param {string} dir @param {(line: string) => void} [print] @returns {import('node:http').Server} */
export function captureServer(dir, print = console.log) {
  const saved = new Set();   // ids already written: a retry after a lost reply resends a whole round

  /** Appends each drawing not yet saved to its input's and shape's file.
   * @param {ReturnType<typeof cleanDrawing>[]} drawings */
  const save = async drawings => {
    for (const { id, stored } of drawings) {
      if (saved.has(id)) continue;
      const folder = join(dir, stored.input);
      await mkdir(folder, { recursive: true });
      await appendFile(join(folder, `${stored.shape}.jsonl`), JSON.stringify(stored) + '\n', 'utf8');
      saved.add(id);
    }
  };

  return createServer(async (req, res) => {
    const reply = (status, type, body) => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(body);
    };
    const json = (status, value) => reply(status, 'application/json', JSON.stringify(value));
    const file = async (name, type) => reply(200, type, await readFile(join(HERE, name), 'utf8'));
    try {
      if (!OK_HOST.test(req.headers.host ?? '')) return json(403, { error: 'use an address' });
      if (req.method === 'GET' && req.url === '/') return await file('capture.html', 'text/html; charset=utf-8');
      if (req.method === 'GET' && req.url === '/capture_session.mjs') return await file('capture_session.mjs', JAVASCRIPT);
      if (req.method === 'GET' && req.url === '/config') return json(200, { inputs: INPUTS, prompts: PROMPTS });
      if (req.method === 'GET' && req.url === '/bench') return await file('bench.html', 'text/html; charset=utf-8');
      if (req.method === 'GET' && req.url === '/bench_run.mjs') return await file('bench_run.mjs', JAVASCRIPT);
      if (req.method === 'GET' && req.url === '/recordings') return json(200, await recordingsIn(dir));
      if (req.method === 'GET' && LIBRARY_FILE.test(req.url)) return await file(join('..', req.url), JAVASCRIPT);
      if (req.method !== 'POST' || !['/strokes', '/bench-results'].includes(req.url)) return json(404, { error: 'not found' });
      // A browser must ask before sending this type to another site, and nothing
      // here answers that request. Together with the Host check above, a page
      // elsewhere can't write here.
      if (req.headers['content-type'] !== 'application/json') return json(415, { error: 'send JSON' });
      const body = await bodyOf(req);
      if (body === null) return json(413, { error: 'too large' });
      if (req.url === '/bench-results') {
        const lines = reportLines(parsedOrNull(body));
        if (!lines) return json(400, { error: 'not a speed result' });
        lines.forEach(line => print(line));
        return json(200, { printed: true });
      }
      const drawings = parseBatch(body);
      await save(drawings);
      return json(200, { saved: drawings.length });
    } catch (e) {
      if (e instanceof BadBatch) return json(400, { error: e.message });
      if (req.method !== 'GET') return json(500, { error: 'could not save' });
      return e.code === 'ENOENT' ? json(404, { error: 'not found' }) : json(500, { error: 'could not read' });
    }
  });
}

/** Every address this machine answers on, for the headset to open. @param {number} port */
const addresses = port => Object.values(networkInterfaces()).flat()
  .filter(n => n && n.family === 'IPv4')
  .map(n => `http://${n.address}:${port}/`);

function main() {
  const port = Number(process.argv[2] ?? DEFAULT_PORT);
  captureServer(STROKES_DIR).listen(port, '0.0.0.0', () => {
    console.log('Open one of these, and press Ctrl+C here when done:');
    for (const a of addresses(port)) console.log('  ' + a);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
