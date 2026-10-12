export interface Section {
  slabDropMm: number;
  topRecessMm: number;
  gratingThicknessMm: number;
  datumOffsetMm: number;
  bottomBuildUpMm: number;
  minClearanceMm: number;
  slabStepMm: number;
  reserveMm: number;
  trenchWidthMm: number;
}
export interface Point { x: number; y: number }
export interface Drawing {
  name: string; page: number; width: number; height: number; dataUrl: string;
  calibration?: { points: [Point, Point]; lengthM: number };
}
export type LockedDimension = 'topRecessMm' | 'gratingThicknessMm' | 'bottomBuildUpMm' | 'minClearanceMm';
export interface Solver { mode: 'check' | 'slab' | 'slope' | 'length'; routeId: string; segmentId: string }
export interface Segment { id: string; name: string; lengthM: number; slopeDenominator: number; trace?: Point[] }
export interface Route { id: string; name: string; color: string; segments: Segment[] }
export interface Project {
  format: 'trench-planner'; version: 2; title: string; gtCount: number;
  section: Section; routes: Route[];
  locks: Record<LockedDimension, boolean>; solver: Solver; drawing?: Drawing;
}
export interface RouteResult {
  id: string; lengthM: number; fallMm: number; segmentFallsMm: number[];
  rawSlabMm: number; roundedSlabMm: number; adoptedSlabMm: number;
  availableFallMm: number; physicalFallMm: number; marginMm: number;
  upstreamDMm: number; upstreamClearanceMm: number; fits: boolean;
  uniformMaxDenominator: number | null;
}
export interface Results {
  dMaxMm: number; dMinMm: number; fixedHeightMm: number;
  physicalFallMm: number; availableFallMm: number; routes: RouteResult[];
  criticalRouteIds: string[]; commonSlabMm: number; addedSlabMm: number;
}
