import { along, centreOf, offset, principalDirection } from '../geometry.mjs';

/** A straight line through one stroke, from where it starts to where it ends. */
export const line = {
  name: 'line',
  fit(drawing) {
    if (drawing.strokes.length !== 1) return null;
    const [stroke] = drawing.strokes;
    const centre = centreOf(stroke);
    const direction = principalDirection(stroke);
    const from = offset(centre, direction, along(stroke[0], centre, direction));
    const to = offset(centre, direction, along(stroke.at(-1), centre, direction));
    return { paths: [[from, to]], freedom: 4, from, to };
  },
};
