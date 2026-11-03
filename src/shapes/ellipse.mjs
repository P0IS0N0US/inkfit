import { along, beside, offset, principalDirection } from '../geometry.mjs';

/** How many sides stand for an ellipse in its path. */
const SIDES = 72;

/** The narrowest an ellipse may be, as a share of its length. As with a rectangle,
 * any stroke has a thin one around it. */
const MIN_ASPECT = 0.12;

/** An ellipse through all a drawing's points, at any angle. It has more freedom than a
 * `circle`, so with both bound a nearly round drawing comes out a circle. */
export const ellipse = {
  name: 'ellipse',
  fit(drawing) {
    const { points } = drawing;
    const direction = principalDirection(points);
    const origin = points[0];
    const s = points.map(p => along(p, origin, direction));
    const t = points.map(p => beside(p, origin, direction));
    const middleS = (Math.min(...s) + Math.max(...s)) / 2;
    const middleT = (Math.min(...t) + Math.max(...t)) / 2;
    // With the axes known, x²/a² + y²/b² = 1 is linear in 1/a² and 1/b²: least squares
    // uses every point, so a hook left at one end can't set a radius by itself.
    let xxxx = 0, xxyy = 0, yyyy = 0, xx = 0, yy = 0;
    s.forEach((v, i) => {
      const x2 = (v - middleS) ** 2, y2 = (t[i] - middleT) ** 2;
      xxxx += x2 * x2;
      xxyy += x2 * y2;
      yyyy += y2 * y2;
      xx += x2;
      yy += y2;
    });
    const det = xxxx * yyyy - xxyy * xxyy;
    if (det === 0) return null;
    const overA = (xx * yyyy - yy * xxyy) / det;
    const overB = (yy * xxxx - xx * xxyy) / det;
    if (!(overA > 0 && overB > 0)) return null;
    const [along_, across] = [1 / Math.sqrt(overA), 1 / Math.sqrt(overB)];
    const [long, short] = [Math.max(along_, across), Math.min(along_, across)];
    if (short < long * MIN_ASPECT) return null;
    const center = offset(origin, direction, middleS, middleT);
    // On a nearly round drawing the least-squares radii can swap: `rotation` follows the long one.
    const axis = along_ >= across ? direction : { x: -direction.y, y: direction.x };
    const path = Array.from({ length: SIDES + 1 }, (_, i) => {
      const angle = (i % SIDES) / SIDES * 2 * Math.PI;
      return offset(center, axis, long * Math.cos(angle), short * Math.sin(angle));
    });
    return { paths: [path], freedom: 5, center, radii: [long, short], rotation: Math.atan2(axis.y, axis.x) };
  },
};
