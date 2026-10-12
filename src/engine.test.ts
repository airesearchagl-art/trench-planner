import { describe, expect, it } from 'vitest';
import { calculate, ceilStep, maxLengthM, segmentLimit } from './engine';
import { preset, parseProject, serializeProject, validateProject } from './data';
describe('今回の確定値を再現する', () => {
  const expected = [
    ['kitchen-original', [148.5, 127, 160], 300, 'route-2'],
    ['kitchen-mixed', [297, 254, 320], 450, 'route-2'],
    ['gt1-100', [208.5, 127, 206], 350, 'route-0'],
    ['gt1-50', [417, 254, 412], 550, 'route-0'],
    ['gt2-100', [115, 127, 115], 300, 'route-1'],
    ['gt2-50', [230, 254, 230], 400, 'route-1'],
    ['gt2-25', [460, 508, 460], 650, 'route-1'],
    ['dish-original', [140], 300, 'dish'],
    ['dish-revised', [170], 300, 'dish'],
  ] as const;
  for (const [key, falls, common, critical] of expected) it(key, () => {
    const r = calculate(preset(key));
    expect(r.routes.map(x => x.fallMm)).toEqual([...falls]);
    expect(r.commonSlabMm).toBe(common);
    expect(r.criticalRouteIds).toEqual([critical]);
    expect(r.availableFallMm).toBe(173);
  });
});
it('D基準差は許容落差に影響しない', () => {
  const p = preset(); p.section.datumOffsetMm = 25;
  const r = calculate(p);
  expect(r.dMaxMm).toBe(198); expect(r.dMinMm).toBe(25);
  expect(r.availableFallMm).toBe(173); expect(r.routes[0].upstreamClearanceMm).toBe(53);
});
it('施工余裕を明示して確保する', () => {
  const p = preset(); p.section.reserveMm = 10;
  const r = calculate(p); expect(r.routes[0].fits).toBe(false);
  expect(r.routes[0].marginMm).toBe(-7); expect(r.commonSlabMm).toBe(350);
});
it('逆算と区間別の残り予算', () => {
  expect(maxLengthM(173, 50)).toBe(8.65);
  expect(maxLengthM(-1, 50)).toBeNull();
  const p = preset('kitchen-original');
  const limit = segmentLimit(p, 'route-2', 'seg-2-0');
  expect(limit.remainingMm).toBe(59); expect(limit.denominator).toBeCloseTo(9200 / 59);
});
it('刻み境界・ちょうど成立・落差ゼロを扱う', () => {
  expect(ceilStep(450.00000000001, 50)).toBe(450); expect(ceilStep(450.01, 50)).toBe(500);
  const p = preset(); p.routes[0].segments[0].lengthM = 8.65;
  expect(calculate(p).routes[0].fits).toBe(true);
  p.section.slabDropMm = 127;
  expect(calculate(p).routes[0].uniformMaxDenominator).toBeNull();
  expect(maxLengthM(0, 50)).toBe(0);
});
it('JSON往復、未知の版、不正値、重複ID、色を検証する', () => {
  const p = preset(); expect(parseProject(serializeProject(p))).toEqual(p);
  expect(() => parseProject('{')).toThrow();
  expect(() => validateProject({ ...p, version: 2 })).toThrow();
  p.routes[0].segments[0].slopeDenominator = 0; expect(() => validateProject(p)).toThrow();
  p.routes[0].segments[0].slopeDenominator = NaN; expect(() => validateProject(p)).toThrow();
  const q = preset(); q.routes.push(structuredClone(q.routes[0])); expect(() => validateProject(q)).toThrow();
  q.routes.pop(); q.routes[0].color = 'red;url(x)'; expect(() => validateProject(q)).toThrow();
});
