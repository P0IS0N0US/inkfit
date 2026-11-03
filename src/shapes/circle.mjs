import { centreOf, distance, mean } from '../geometry.mjs';

/** How many sides stand for a circle in its path. */
const SIDES = 72;

/** The largest radius worth proposing, as a share of the drawing's size. A whole
 * circle's is about 0.35: nearly straight points fit circles of any size at all. */
const MAX_RADIUS = 2;

/** The least-squares circle through a set of points (Kasa), or null if they lie on
 * a line. @param {import('../geometry.mjs').Point[]} points */
function circleThrough(points) {
  const c = centreOf(points);
  let xx = 0, xy = 0, yy = 0, xr = 0, yr = 0;
  for (const p of points) {
    const x = p.x - c.x, y = p.y - c.y, r = x * x + y * y;
    xx += x * x;
    xy += x * y;
    yy += y * y;
    xr += x * r;
    yr += y * r;
  }
  const det = 2 * (xx * yy - xy * xy);
  if (det === 0) return null;
  const center = { x: c.x + (xr * yy - yr * xy) / det, y: c.y + (yr * xx - xr * xy) / det };
  return { center, radius: mean(points.map(p => distance(p, center))) };
}

/** A circle through all a drawing's points. */
export const circle = {
  name: 'circle',
  fit(drawing) {
    const found = circleThrough(drawing.points);
    if (!found || found.radius > drawing.size * MAX_RADIUS) return null;
    const { center, radius } = found;
    const path = Array.from({ length: SIDES + 1 }, (_, i) => {
      const angle = (i % SIDES) / SIDES * 2 * Math.PI;
      return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
    });
    return { paths: [path], freedom: 3, center, radius };
  },
};
