/* The capture page's state: a drawing lands under the shape asked for and the input
   it was drawn with, once, and a failed send loses nothing. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Session } from '../tools/capture_session.mjs';

const PROMPTS = [{ shape: 'line', label: 'a line' }, { shape: 'circle', label: 'a circle' }, { shape: 'star', label: 'a star' }];

const session = () => {
  const s = new Session(PROMPTS, list => [...list], 'tag');
  s.pick('mouse');
  return s;
};

/** Draws one stroke and leaves its drawing open. */
const stroke = (s, x = 0) => {
  s.press([x, 0, 0]);
  s.release([x + 1, 0, 1]);
};

/** Draws one whole drawing. */
const draw = (s, x) => {
  stroke(s, x);
  s.finish();
};

test('a round asks for each shape once, then wants sending', () => {
  const s = session();
  for (const _ of PROMPTS) { assert.equal(s.unsent, false); draw(s); }
  assert.equal(s.unsent, true);
  assert.deepEqual(s.send().map(d => d.shape), ['line', 'circle', 'star']);
});

test('nothing is recorded before an input is picked', () => {
  const s = new Session(PROMPTS, list => [...list], 'tag');
  assert.equal(s.press([0, 0, 0]), false);
  assert.equal(s.stroke, null);
});

test('hover moves are not recorded', () => {
  const s = session();
  s.move([5, 5, 0]);
  stroke(s);
  s.finish();
  assert.equal(s.done[0].strokes[0].length, 2);
});

test('several strokes before a finish are one drawing', () => {
  const s = session();
  stroke(s, 0);
  stroke(s, 10);
  s.finish();
  assert.equal(s.done.length, 1);
  assert.equal(s.done[0].strokes.length, 2);
});

test('a drawing keeps the input it started with, whatever is picked before it ends', () => {
  const s = session();
  stroke(s);
  s.pick('controller');
  stroke(s, 10);
  s.finish();
  assert.equal(s.done[0].input, 'mouse');
  draw(s);
  assert.equal(s.done[1].input, 'controller');
});

test('dropping removes the open drawing and keeps asking for that shape', () => {
  const s = session();
  stroke(s);
  s.drop();
  s.finish();
  assert.equal(s.done.length, 0);
  assert.equal(s.queue[0].shape, 'line');
});

test('dropping with nothing open asks for the last shape again', () => {
  const s = session();
  draw(s);
  s.drop();
  assert.equal(s.done.length, 0);
  assert.equal(s.queue[0].shape, 'line');
  assert.equal(s.queue.length, PROMPTS.length);
});

test('a drop during a stroke does nothing, so the stroke stays under its shape', () => {
  const s = session();
  draw(s);
  s.press([0, 0, 0]);
  s.drop();
  s.release([1, 0, 1]);
  s.finish();
  assert.deepEqual(s.done.map(d => d.shape), ['line', 'circle']);
});

test('a drop during a send does nothing, because the round has already left', () => {
  const s = session();
  for (const _ of PROMPTS) draw(s);
  s.send();
  s.drop();
  assert.equal(s.done.length, PROMPTS.length);
  assert.equal(s.queue.length, 0);
});

test('a cancelled stroke is gone and the drawing\'s other strokes stay', () => {
  const s = session();
  stroke(s);
  s.press([9, 9, 2]);
  s.cancel();
  s.finish();
  assert.equal(s.done[0].strokes.length, 1);
});

test('a second press during a stroke is ignored', () => {
  const s = session();
  s.press([0, 0, 0]);
  assert.equal(s.press([9, 9, 1]), false);
  assert.deepEqual(s.stroke, [[0, 0, 0]]);
});

test('no press starts a stroke during a send', () => {
  const s = session();
  for (const _ of PROMPTS) draw(s);
  s.send();
  assert.equal(s.press([0, 0, 0]), false);
});

test('a failed send keeps the round, and the same ids go again', () => {
  const s = session();
  for (const _ of PROMPTS) draw(s);
  const first = JSON.stringify(s.send());
  s.failed();
  assert.equal(s.unsent, true);
  assert.equal(JSON.stringify(s.send()), first);
});

test('after a failed send a drawing can be dropped and redrawn', () => {
  const s = session();
  for (const _ of PROMPTS) draw(s);
  s.send();
  s.failed();
  s.drop();
  assert.equal(s.queue[0].shape, 'star');
  draw(s);
  assert.equal(s.unsent, true);
  assert.equal(new Set(s.done.map(d => d.id)).size, PROMPTS.length);
});

test('every state can tell the drawer what to do', () => {
  const s = session();
  for (const _ of PROMPTS) draw(s);
  s.send();
  assert.equal(s.text, 'Saving');
  assert.equal(s.progress, 'Round 1, 3 of 3');
  s.failed();
  assert.match(s.text, /retry/);
  s.pick('finger');
  assert.match(s.text, /retry/);
});

test('a sent round starts the next one', () => {
  const s = session();
  for (const _ of PROMPTS) draw(s);
  s.send();
  s.sent();
  assert.equal(s.round, 2);
  assert.equal(s.done.length, 0);
  assert.equal(s.queue.length, PROMPTS.length);
  assert.equal(s.unsent, false);
});

test('ids never repeat across rounds', () => {
  const s = session();
  const ids = [];
  for (let round = 0; round < 2; round += 1) {
    for (const _ of PROMPTS) draw(s);
    ids.push(...s.send().map(d => d.id));
    s.sent();
  }
  assert.equal(new Set(ids).size, ids.length);
});
