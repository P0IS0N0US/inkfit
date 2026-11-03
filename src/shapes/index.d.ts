import type { Point, Proposal, Shape } from '../index.js';

/** A cubic Bézier: start, two control points, end. */
export type Cubic = [Point, Point, Point, Point];

export interface LineFit extends Proposal {
  from: Point;
  to: Point;
}

export interface CurveFit extends Proposal {
  segments: Cubic[];
}

export interface PolylineFit extends Proposal {
  vertices: Point[];
}

export interface CircleFit extends Proposal {
  center: Point;
  radius: number;
}

export interface EllipseFit extends Proposal {
  center: Point;
  /** The long radius, along `rotation`, then the short one. */
  radii: [number, number];
  rotation: number;
}

export interface RectangleFit extends Proposal {
  corners: Point[];
  width: number;
  height: number;
  rotation: number;
}

export interface SquareFit extends Proposal {
  corners: Point[];
  side: number;
  rotation: number;
}

export interface TriangleFit extends Proposal {
  corners: Point[];
}

export interface ArrowFit extends Proposal {
  tail: Point;
  tip: Point;
  barbs: [Point, Point];
}

export interface OutlineFit extends Proposal {
  center: Point;
  scale: number;
  rotation: number;
}

export const arrow: Shape<'arrow', ArrowFit>;
export const circle: Shape<'circle', CircleFit>;
export const curve: Shape<'curve', CurveFit>;
export const ellipse: Shape<'ellipse', EllipseFit>;
export const line: Shape<'line', LineFit>;
export const polyline: Shape<'polyline', PolylineFit>;
export const rectangle: Shape<'rectangle', RectangleFit>;
export const square: Shape<'square', SquareFit>;
export const triangle: Shape<'triangle', TriangleFit>;

/** A shape from one path of points, placed at any position, size and angle. */
export function outline<Name extends string>(name: Name, points: readonly Point[]): Shape<Name, OutlineFit>;
