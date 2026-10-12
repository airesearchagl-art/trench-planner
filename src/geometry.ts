import type { Drawing, Point } from './types';
export function pixelLength(points: Point[]): number {
  return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
}
export function measuredLength(points: Point[], drawing: Drawing): number {
  if (!drawing.calibration) throw new Error('図面の縮尺を先に設定してください。');
  const base = pixelLength(drawing.calibration.points);
  if (base < 1) throw new Error('縮尺基準の2点は1px以上離してください。');
  return pixelLength(points) / base * drawing.calibration.lengthM;
}
