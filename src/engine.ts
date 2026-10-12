import type { Project, Results, RouteResult, Section } from './types';
export const EPS = 1e-8;
export function ceilStep(value: number, step: number): number {
  return Math.ceil((value - EPS) / step) * step;
}
export function fixedHeight(section: Section): number {
  return section.topRecessMm + section.gratingThicknessMm + section.bottomBuildUpMm + section.minClearanceMm;
}
export function calculate(project: Project): Results {
  const s = project.section;
  const fixed = fixedHeight(s);
  const physical = s.slabDropMm - fixed;
  const available = physical - s.reserveMm;
  const dMax = s.slabDropMm - s.topRecessMm - s.gratingThicknessMm - s.datumOffsetMm - s.bottomBuildUpMm;
  const dMin = s.minClearanceMm - s.datumOffsetMm;
  const routes: RouteResult[] = project.routes.map(route => {
    const lengthM = route.segments.reduce((v, x) => v + x.lengthM, 0);
    const segmentFallsMm = route.segments.map(x => x.lengthM * 1000 / x.slopeDenominator);
    const fallMm = segmentFallsMm.reduce((a, b) => a + b, 0);
    const rawSlabMm = fixed + s.reserveMm + fallMm;
    const roundedSlabMm = ceilStep(rawSlabMm, s.slabStepMm);
    return {
      id: route.id, lengthM, fallMm, segmentFallsMm, rawSlabMm, roundedSlabMm,
      adoptedSlabMm: Math.max(s.slabDropMm, roundedSlabMm),
      physicalFallMm: physical, availableFallMm: available,
      marginMm: available - fallMm, fits: available - fallMm >= -EPS,
      upstreamDMm: dMax - fallMm,
      upstreamClearanceMm: dMax - fallMm + s.datumOffsetMm,
      uniformMaxDenominator: available > EPS ? lengthM * 1000 / available : null,
    };
  });
  const maxFall = Math.max(...routes.map(r => r.fallMm));
  const common = Math.max(...routes.map(r => r.adoptedSlabMm));
  return {
    dMaxMm: dMax, dMinMm: dMin, fixedHeightMm: fixed, physicalFallMm: physical,
    availableFallMm: available, routes,
    criticalRouteIds: routes.filter(r => Math.abs(r.fallMm - maxFall) < EPS).map(r => r.id),
    commonSlabMm: common, addedSlabMm: common - s.slabDropMm,
  };
}
export function maxLengthM(availableFallMm: number, denominator: number): number | null {
  return availableFallMm < -EPS ? null : Math.max(0, availableFallMm) * denominator / 1000;
}
export function segmentLimit(project: Project, routeId: string, segmentId: string) {
  const result = calculate(project);
  const route = project.routes.find(r => r.id === routeId)!;
  const index = route.segments.findIndex(s => s.id === segmentId);
  if (index < 0) throw new Error('区間が見つかりません。');
  const rr = result.routes.find(r => r.id === routeId)!;
  const remainingMm = result.availableFallMm - (rr.fallMm - rr.segmentFallsMm[index]);
  return { remainingMm, denominator: remainingMm > EPS ? route.segments[index].lengthM * 1000 / remainingMm : null };
}
