/** A point on a stroke. Anything else on the object is ignored. */
export interface Point {
  x: number;
  y: number;
}

/** Strokes as they reach a shape's `fit`: cleaned, and frozen. */
export interface Drawing {
  readonly strokes: readonly (readonly Readonly<Point>[])[];
  readonly points: readonly Readonly<Point>[];
  /** The points' convex hull. */
  readonly hull: readonly Readonly<Point>[];
  /** The diagonal of the points' bounding box. */
  readonly size: number;
  /** The length of line in the drawing. */
  readonly ink: number;
}

/** A shape's best version for a drawing. Other fields pass through to the caller. */
export interface Proposal {
  /** What to draw, each path a list of points. */
  paths: Point[][];
  /** How many numbers the shape could adjust. More freedom costs score. */
  freedom: number;
}

/** A shape. `fit` proposes its best version for a drawing, or null. */
export interface Shape<Name extends string = string, Fit extends Proposal = Proposal> {
  name: Name;
  fit(drawing: Drawing): Fit | null;
}

/** A proposal with its shape's name and its score, from 0 to 1. */
export type Candidate<S> = S extends Shape<infer Name, infer Fit>
  ? Fit & { name: Name; score: number }
  : never;

/** What `fit` gives: narrow `best` by its `name` to reach a shape's own fields. */
export interface FitResult<S> {
  /** The winning shape, or null if nothing fits well. */
  best: Candidate<S> | null;
  /** Proposals, best first. Below the snap bar this list is incomplete. */
  candidates: Candidate<S>[];
}

/** The lowest score that snaps. */
export const MIN_SCORE: number;

/** A fitter for these shapes. It never changes: for another list, make another. */
export function createFitter<const S extends Shape>(
  shapes: readonly S[],
): (strokes: readonly (readonly Point[])[]) => FitResult<S>;
