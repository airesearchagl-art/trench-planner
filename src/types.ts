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
export interface Segment { id: string; name: string; lengthM: number; slopeDenominator: number }
export interface Route { id: string; name: string; color: string; segments: Segment[] }
export interface Project {
  format: 'trench-planner'; version: 1; title: string; gtCount: number;
  section: Section; routes: Route[];
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
