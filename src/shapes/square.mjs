import { offset } from '../geometry.mjs';
import { boxOf } from './rectangle.mjs';

/** How unequal a box's sides can be, short over long, and it still be meant as a square.
 * A clean 4:3 rectangle is 0.75, and has to stay a rectangle. */
const MIN_SQUARENESS = 0.78;

/** A square around nearly all a drawing's points, at any angle. It has less freedom than a
 * `rectangle`, so with both bound a nearly square drawing comes out square. */
export const square = {
  name: 'square',
  fit(drawing) {
    const found = boxOf(drawing);
    if (!found) return null;
    const { a, direction, s0, s1, t0, t1 } = found;
    if (Math.min(s1 - s0, t1 - t0) < Math.max(s1 - s0, t1 - t0) * MIN_SQUARENESS) return null;
    const side = ((s1 - s0) + (t1 - t0)) / 2;
    const middle = offset(a, direction, (s0 + s1) / 2, (t0 + t1) / 2);
    const half = side / 2;
    const corners = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([s, t]) => offset(middle, direction, s, t));
    return { paths: [[...corners, { ...corners[0] }]], freedom: 4, corners, side, rotation: Math.atan2(direction.y, direction.x) };
  },
};
