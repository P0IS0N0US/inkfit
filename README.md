# inkfit

Turns a hasty hand-drawn stroke into a clean shape, with a mouse, a finger or
a shaky controller.

It has no dependencies and no build step, and the same strokes always give the
same result. It isn't published yet, and its API may still change.

## Using it

```js
import { createFitter } from 'inkfit';
import { line, circle, rectangle, arrow, curve } from 'inkfit/shapes';

const fit = createFitter([line, circle, rectangle, arrow, curve]);

const { best, candidates } = fit(strokes);
```

`strokes` is a list of strokes, each a list of `{ x, y }` points. A shape drawn in
two strokes, as most arrows are, goes in as both. You decide which strokes belong
together and when to call `fit`: on release, after the pen rests, or anything else.

`best` is the winning shape, or `null` if nothing fits well, in which case keep the
stroke you have. It holds a `name`, a `score` from 0 to 1, `paths` to draw, each a
list of points, and the shape's own fields, such as a circle's `center` and
`radius`. `candidates` lists proposals best first, so you can apply a stricter bar
than `best` does, or see what came close. Below that bar it is incomplete: a proposal
that fails on distance is listed with its low score, and one that its ink and freedom
already rule out is left out without being scored. A lower bar isn't available.

The first few fits after a page loads are slower, because the JavaScript engine hasn't
optimised the code yet. On a slower device the very first can take a whole frame. If
that matters, run a few throwaway fits once while the page loads, so the first real
stroke isn't the one that pays:

```js
const oval = Array.from({ length: 120 }, (_, i) => {
  const angle = i / 120 * 2 * Math.PI;
  return { x: 200 * Math.cos(angle), y: 140 * Math.sin(angle) };
});
for (let i = 0; i < 5; i += 1) fit([oval]);
```

What you bind decides what comes out. Bind `line` alone to straighten, `curve`
alone to keep curves, or both to straighten only what is nearly straight. List
order never matters: the highest score wins.

The shapes are `line`, `curve`, `polyline`, `circle`, `ellipse`, `rectangle`,
`square`, `triangle` and `arrow`. For another shape with fixed proportions and no
branches, give `outline` one path, and it can be placed at any position, size and
angle:

```js
import { createFitter } from 'inkfit';
import { line, circle, outline } from 'inkfit/shapes';

const star = outline('star', starPoints);
const fitWithStar = createFitter([line, circle, star]);
```

Anything else can be written by hand, as `{ name, fit(drawing) }`. `drawing` holds
the cleaned `strokes`, all their `points`, their convex `hull`, the drawing's `size`
and its `ink`, the length of line in it, and it can't be changed. `fit` proposes `{ paths, freedom,
...fields }` or `null`, where `freedom` counts what the shape can adjust. It never
scores itself: every proposal is scored the same way.

Types come with the library. Narrow `best` by its `name` to reach a shape's own fields,
such as `best.radius` once `best.name` is `'circle'`. A hand-written shape declared
apart from the list needs a literal name to keep that working, such as
`Shape<'blob', BlobFit>` or `as const`.

## Recording strokes

The tests use strokes recorded on real devices, kept in `tests/strokes/`. To add
some:

```
node tools/capture.mjs
```

Open the address it prints on the device you want to record, pick what you are
drawing with, and draw what it asks for. Be hasty: messy strokes are the point.
Stop it with Ctrl+C when you're done, because it serves your local network.

## Measuring speed

To see how long a fit takes on a device, run the same server and open `/bench` on the
printed address, on that device. Press Run and keep the page in view. It fits the
recordings in `tests/strokes/` with the library's own code, both repeatedly and one at
a time with pauses, as an app would, and shows the worst of the spaced fits as a share
of a 60 Hz frame. An app that is also drawing has less of that frame to spare. When it
finishes, the page sends the numbers to the server, which prints them in its terminal.
Nothing is saved.
