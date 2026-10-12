import { calculate } from './engine';
import type { Project } from './types';
export const esc = (v: unknown) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const fmt = (n: number, digits = 3) => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: digits }).format(Math.abs(n) < 1e-8 ? 0 : n);
const ink = '#263d37', mute = '#65766f', magenta = '#bc287f';
const text = (x: number, y: number, value: string, size = 18, color = ink, anchor = 'start', bold = false) => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}"${bold ? ' font-weight="700"' : ''}>${esc(value)}</text>`;
const line = (x1: number, y1: number, x2: number, y2: number, color = mute, width = 1.5, dash = false) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"${dash ? ' stroke-dasharray="6 5"' : ''}/>`;
const rect = (x: number, y: number, w: number, h: number, fill: string, stroke = mute) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}"/>`;
const dim = (x: number, a: number, b: number, color = mute) => line(x, a, x, b, color) + line(x - 5, a + 5, x + 5, a - 5, color) + line(x - 5, b + 5, x + 5, b - 5, color);
const wrap = (content: string, height: number, title: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 ${height}" width="900" height="${height}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><rect width="900" height="${height}" fill="white"/><g font-family="Meiryo, Yu Gothic, sans-serif">${content}</g></svg>`;
export function sectionSvg(project: Project, slabDropMm = project.section.slabDropMm): string {
  const s = { ...project.section, slabDropMm }, r = calculate({ ...project, section: s });
  let out = text(28, 32, '側溝の横断模式図', 23, ink, 'start', true) + text(870, 32, '寸法：mm／縮尺なし', 15, mute, 'end');
  out += `<path d="M60 75 L230 105 L230 389 L60 389Z M400 105 L485 75 L485 389 L400 389Z" fill="#edf1ec" stroke="${mute}"/>`;
  out += rect(60, 389, 425, 28, '#cdd8d2') + rect(230, 105, 170, 284, 'white');
  out += line(245, 146, 245, 356) + line(385, 146, 385, 356) + line(245, 356, 385, 356, magenta, 2.5);
  out += rect(245, 105, 140, 41, '#dbe6e0');
  for (let x = 253; x < 385; x += 12) out += line(x, 105, x, 146);
  out += text(315, 132, 'グレーチング', 16, ink, 'middle', true);
  out += line(52, 75, 590, 75, mute, 1, true) + text(440, 64, 'FL±0', 17, mute);
  out += line(238, 167, 553, 167, mute, 1, true) + text(408, 187, 'D基準', 15, mute);
  out += line(204, 146, 245, 146, magenta) + line(204, 214, 395, 214, magenta, 1.5, true) + line(204, 356, 385, 356, magenta, 2);
  out += dim(211, 146, 214, magenta) + text(108, 172, '最小', 17, magenta) + text(108, 197, fmt(s.minClearanceMm), 24, magenta, 'start', true);
  out += dim(211, 214, 356, magenta) + text(90, 273, '許容落差', 17, magenta) + text(90, 304, fmt(r.physicalFallMm), 25, magenta, 'start', true);
  out += text(315, 243, '許容最浅位置', 17, magenta, 'middle', true) + text(315, 269, `D=${fmt(r.dMinMm)}`, 17, magenta, 'middle');
  out += text(315, 326, '排水先側の底', 17, magenta, 'middle', true) + text(75, 408, '床スラブ', 16);
  for (const y of [75, 105, 146, 167, 356, 389]) out += line(485, y, 559, y, '#cdd7d1', 1);
  for (const [a, b, label] of [[75, 105, s.topRecessMm], [105, 146, s.gratingThicknessMm], [146, 167, s.datumOffsetMm], [356, 389, s.bottomBuildUpMm]]) out += dim(510, a, b) + text(524, (a + b) / 2 + 6, fmt(label), 17);
  out += dim(510, 167, 356, magenta) + text(521, 279, `D=${fmt(r.dMaxMm)}`, 21, magenta, 'start', true);
  out += dim(588, 75, 389) + line(485, 389, 593, 389) + text(600, 227, fmt(slabDropMm), 22, ink, 'start', true) + text(600, 252, '下げ', 17);
  out += line(245, 55, 385, 55) + text(315, 51, `幅 ${fmt(s.trenchWidthMm)}`, 16, mute, 'middle');
  out += text(685, 104, '最深部の深さ', 18) + text(685, 140, `D ${fmt(r.dMaxMm)}`, 31, magenta, 'start', true);
  out += text(685, 196, '最小下面クリアランス', 16) + text(685, 232, `${fmt(s.minClearanceMm)} mm`, 29, magenta, 'start', true);
  out += text(685, 288, '勾配に使用可能', 18) + text(685, 324, `${fmt(r.availableFallMm)} mm`, 29, ink, 'start', true);
  out += text(685, 351, `施工余裕 ${fmt(s.reserveMm)} mm 控除後`, 14, mute);
  out += text(28, 453, `最浅部D = ${fmt(s.minClearanceMm)} − ${fmt(s.datumOffsetMm)} = ${fmt(r.dMinMm)}　／　許容落差 ${fmt(r.physicalFallMm)} − 施工余裕 ${fmt(s.reserveMm)} = 使用可能 ${fmt(r.availableFallMm)}`, 17, mute);
  out += text(28, 481, '破線は許容最浅位置を示す。実際の水上側の底位置は、ルート縦断と計算結果を参照。', 15, mute);
  return wrap(out, 500, '側溝の横断模式図');
}
export function profileSvg(project: Project, routeId: string, slabDropMm = project.section.slabDropMm): string {
  const s = { ...project.section, slabDropMm }, result = calculate({ ...project, section: s });
  const route = project.routes.find(r => r.id === routeId) ?? project.routes[0], rr = result.routes.find(r => r.id === route.id)!;
  const endDepth = slabDropMm - s.bottomBuildUpMm, startDepth = endDepth - rr.fallMm;
  const lo = Math.min(0, startDepth - 20), hi = Math.max(slabDropMm + 10, endDepth);
  const y = (depth: number) => 70 + (depth - lo) / (hi - lo) * 172;
  const x = (distance: number) => 74 + distance / rr.lengthM * 716;
  let out = text(28, 31, `${route.name}｜ルート縦断`, 23, ink, 'start', true) + text(872, 31, `総延長 ${fmt(rr.lengthM)} m／縮尺なし`, 16, mute, 'end');
  out += line(74, y(s.topRecessMm), 790, y(s.topRecessMm), mute, 2);
  out += line(74, y(s.topRecessMm + s.gratingThicknessMm + s.datumOffsetMm), 790, y(s.topRecessMm + s.gratingThicknessMm + s.datumOffsetMm), '#92a39a', 1, true);
  out += text(74, y(s.topRecessMm) - 13, 'グレーチング天端一定', 15, mute);
  let distance = 0, depth = startDepth;
  route.segments.forEach((seg, i) => {
    const nextDistance = distance + seg.lengthM, nextDepth = depth + rr.segmentFallsMm[i];
    out += line(x(distance), y(depth), x(nextDistance), y(nextDepth), route.color, 3.5);
    out += line(x(distance), y(s.topRecessMm), x(distance), y(depth), '#a9b6af', 1);
    const mid = (x(distance) + x(nextDistance)) / 2;
    if (route.segments.length <= 4) {
      out += text(mid, 288, seg.name.length > 12 ? seg.name.slice(0, 12) + '…' : seg.name, 16, ink, 'middle');
      out += text(mid, 314, `${fmt(seg.lengthM)} m・1/${fmt(seg.slopeDenominator)}`, 16, route.color, 'middle', true);
    } else out += text(mid, 288 + (i % 2) * 22, `${i + 1}`, 14, route.color, 'middle', true);
    distance = nextDistance; depth = nextDepth;
  });
  out += line(790, y(s.topRecessMm), 790, y(endDepth), '#a9b6af', 1);
  out += text(74, y(startDepth) + 25, `水上 D=${fmt(rr.upstreamDMm)}`, 18, rr.fits ? route.color : '#bb3c2e', 'start', true);
  out += text(790, y(endDepth) + 25, `排水先 D=${fmt(result.dMaxMm)}`, 18, route.color, 'end', true);
  out += dim(831, y(startDepth), y(endDepth), route.color) + text(842, (y(startDepth) + y(endDepth)) / 2, '落差', 14, route.color) + text(842, (y(startDepth) + y(endDepth)) / 2 + 22, fmt(rr.fallMm), 16, route.color, 'start', true);
  out += text(28, 354, `下面クリアランス ${fmt(rr.upstreamClearanceMm)} mm（最小 ${fmt(s.minClearanceMm)} mm）／施工余裕控除後の残余 ${fmt(rr.marginMm)} mm`, 16, rr.fits ? mute : '#bb3c2e');
  return wrap(out, 375, `${route.name}の縦断模式図`);
}
export function diagramBundle(project: Project, routeId: string, slab: number): string {
  const section = sectionSvg(project, slab).replace('<svg ', '<svg x="0" y="60" ');
  const profile = profileSvg(project, routeId, slab).replace('<svg ', '<svg x="0" y="565" ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="975" viewBox="0 0 900 975"><rect width="900" height="975" fill="white"/><text x="28" y="35" font-family="Meiryo,sans-serif" font-size="22" fill="${ink}">${esc(project.title)}</text>${section}${profile}<text x="28" y="961" font-family="Meiryo,sans-serif" font-size="14" fill="${mute}">側溝プランナー v0.1｜図示スラブ下げ ${fmt(slab)} mm｜高さ条件の検討用</text></svg>`;
}
