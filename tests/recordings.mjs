/* The strokes recorded on real devices, as a caller would pass them. */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'strokes');

/** @returns {{shape: string, input: string, strokes: {x: number, y: number}[][]}[]} */
export function recordings() {
  const found = [];
  for (const input of readdirSync(ROOT)) {
    const folder = join(ROOT, input);
    if (!statSync(folder).isDirectory()) continue;
    for (const file of readdirSync(folder)) {
      for (const line of readFileSync(join(folder, file), 'utf8').split('\n')) {
        if (!line.trim()) continue;
        const { shape, strokes } = JSON.parse(line);
        found.push({ shape, input, strokes: strokes.map(s => s.map(([x, y]) => ({ x, y }))) });
      }
    }
  }
  return found;
}
