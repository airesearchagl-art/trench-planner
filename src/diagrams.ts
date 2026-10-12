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
export function sectionSvg(project: Project, slabDropMm = project.section.slabDropMm, interactive = false): string {
  const s = { ...project.section, slabDropMm }, r = calculate({ ...project, section: s });
  const scale = Math.min(0.85, 270 / Math.max(slabDropMm, s.topRecessMm + s.gratingThicknessMm + Math.max(s.minClearanceMm, s.datumOffsetMm))), y = (d: number) => 85 + d * scale;
  const top = y(s.topRecessMm), under = y(s.topRecessMm + s.gratingThicknessMm);
  const datum = y(s.topRecessMm + s.gratingThicknessMm + s.datumOffsetMm);
  const shallow = y(s.topRecessMm + s.gratingThicknessMm + s.minClearanceMm);
  const bottom = y(slabDropMm - s.bottomBuildUpMm), slab = y(slabDropMm);
  let out = text(28, 32, '側溝の横断模式図', 23, ink, 'start', true) + text(870, 32, '寸法：mm／高さに連動・縮尺なし', 14, mute, 'end');
  out += `<path d="M175 85 L270 ${top} L270 ${slab} L175 ${slab}Z M450 ${top} L530 85 L530 ${slab} L450 ${slab}Z" fill="#edf1ec" stroke="${mute}"/>`;
  out += rect(175, slab, 355, 27, '#cdd8d2') + rect(282, top, 156, under - top, '#dbe6e0');
  for (let x = 290; x < 438; x += 12) out += line(x, top, x, under);
  out += line(282, under, 282, bottom) + line(438, under, 438, bottom) + line(282, bottom, 438, bottom, magenta, 2.5);
  out += line(170, 85, 595, 85, mute, 1, true) + text(480, 71, 'FL±0', 16, mute);
  out += line(276, datum, 438, datum, '#92a39a', 1, true);
  out += line(228, shallow, 438, shallow, magenta, 1.5, true) + line(228, bottom, 438, bottom, magenta);
  out += dim(232, under, shallow, magenta) + text(36, 161, '下面から最小', 16, magenta) + text(36, 187, `${fmt(s.minClearanceMm)} mm`, 23, magenta, 'start', true);
  out += line(160, 182, 227, (under + shallow) / 2, magenta, 1);
  out += dim(232, shallow, bottom, magenta) + text(36, 254, '許容落差', 16, magenta) + text(36, 283, `${fmt(r.physicalFallMm)} mm`, 23, magenta, 'start', true);
  out += line(165, 275, 227, (shallow + bottom) / 2, magenta, 1);
  out += text(360, Math.min(bottom - 12, shallow + 23), `許容最浅 D=${fmt(r.dMinMm)}`, 15, magenta, 'middle');
  out += dim(469, datum, bottom, magenta) + text(480, (datum + bottom) / 2 + 6, `D ${fmt(r.dMaxMm)}`, 21, magenta, 'start', true);
  out += dim(452, 85, top) + dim(452, top, under) + dim(452, bottom, slab);
  out += dim(600, 85, slab) + text(579, slab + 23, `S ${fmt(slabDropMm)}`, 20, ink, 'end', true);
  out += text(180, slab + 21, '床スラブ', 15) + text(360, 65, `幅 ${fmt(s.trenchWidthMm)}`, 16, mute, 'middle');
  const fields = [
    ['topRecessMm', 'FLから天端まで', (85 + top) / 2],
    ['gratingThicknessMm', 'グレーチング厚', (top + under) / 2],
    ['minClearanceMm', '最小下面クリアランス', (under + shallow) / 2],
    ['bottomBuildUpMm', 'スラブから底面まで', (bottom + slab) / 2],
  ] as const;
  fields.forEach(([key, label, anchor], i) => {
    const yy = 96 + i * 75;
    out += line(442, anchor, 643, yy + 34, '#b9c9bf', 1);
    if (interactive) {
      out += `<foreignObject x="652" y="${yy}" width="220" height="73"><div xmlns="http://www.w3.org/1999/xhtml" class="svg-dimension"><label>${esc(label)}<span><input type="number" step="any" aria-label="図上 ${esc(label)}" data-section="${key}" value="${s[key]}" ${project.locks[key] ? 'disabled' : ''}/><small>mm</small><button data-action="lock-dimension" data-key="${key}" aria-label="${esc(label)}の固定を${project.locks[key] ? '解除' : '有効化'}" aria-pressed="${project.locks[key]}">${project.locks[key] ? '🔒' : '🔓'}</button></span></label></div></foreignObject>`;
    } else out += text(655, yy + 20, label, 16) + text(655, yy + 51, `${fmt(s[key])} mm`, 23, key === 'minClearanceMm' ? magenta : ink, 'start', true);
  });
  if (interactive) out += `<foreignObject x="650" y="400" width="230" height="33"><div xmlns="http://www.w3.org/1999/xhtml"><button class="slab-lock" data-action="toggle-slab" aria-label="スラブ下げを${project.solver.mode === 'slab' ? '固定' : '自動算定'}">${project.solver.mode === 'slab' ? '🔓 S 自動算定中 → 固定する' : '🔒 S 入力値で固定 → 自動算定'}</button></div></foreignObject>`;
  out += text(28, 434, `D最深 ${fmt(r.dMaxMm)}  ／ D最浅 ${fmt(r.dMinMm)}  ／ 勾配に使用可能 ${fmt(r.availableFallMm)} mm`, 22, magenta, 'start', true);
  out += text(28, 466, `許容落差 ${fmt(r.physicalFallMm)} − 施工余裕 ${fmt(s.reserveMm)} = ${fmt(r.availableFallMm)} mm　（D基準差 ${fmt(s.datumOffsetMm)}）`, 16, mute);
  out += text(28, 494, `集水距離 1,500〜3,000mmの場合、天端下がり${fmt(s.topRecessMm)}mm：勾配 ${s.topRecessMm > 0 ? `約1/${fmt(1500 / s.topRecessMm)}〜1/${fmt(3000 / s.topRecessMm)}` : '0（水平）'}`, 15, mute);
  out += text(28, 526, interactive ? '鍵を解除した寸法だけ編集できます。破線は許容最浅位置。縦断の実際の水上側とは異なります。' : '破線は許容最浅位置。実際の水上側は縦断図を参照。集水距離は断面の参考条件です。', 14, mute);
  return wrap(out, 545, '側溝の横断模式図').replace('role="img"', interactive ? 'role="group"' : 'role="img"');
}
export function profileSvg(project: Project, routeId: string, slabDropMm = project.section.slabDropMm): string {
  const s = { ...project.section, slabDropMm }, result = calculate({ ...project, section: s });
  const route = project.routes.find(r => r.id === routeId) ?? project.routes[0], rr = result.routes.find(r => r.id === route.id)!;
  const endDepth = slabDropMm - s.bottomBuildUpMm, startDepth = endDepth - rr.fallMm;
  const lo = Math.min(0, startDepth - 20), hi = Math.max(slabDropMm + 10, endDepth);
  const y = (depth: number) => 70 + (depth - lo) / (hi - lo) * 172;
  const x = (distance: number) => 74 + distance / rr.lengthM * 716;
  let out = text(28, 31, `${route.name.slice(0,18)}｜ルート縦断`, 23, ink, 'start', true) + text(872, 31, `総延長 ${fmt(rr.lengthM)} m／縮尺なし`, 16, mute, 'end');
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
  out += dim(817, y(startDepth), y(endDepth), route.color) + text(854, (y(startDepth) + y(endDepth)) / 2, '落差', 14, route.color, 'middle') + text(854, (y(startDepth) + y(endDepth)) / 2 + 22, fmt(rr.fallMm, 2), 14, route.color, 'middle', true);
  out += text(28, 354, `下面クリアランス ${fmt(rr.upstreamClearanceMm)} mm（最小 ${fmt(s.minClearanceMm)} mm）／施工余裕控除後の残余 ${fmt(rr.marginMm)} mm`, 16, rr.fits ? mute : '#bb3c2e');
  return wrap(out, 375, `${route.name}の縦断模式図`);
}
export function diagramBundle(project: Project, routeId: string, slab: number): string {
  const section = sectionSvg(project, slab).replace('<svg ', '<svg x="0" y="60" ');
  const profile = profileSvg(project, routeId, slab).replace('<svg ', '<svg x="0" y="610" ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1020" viewBox="0 0 900 1020"><rect width="900" height="1020" fill="white"/><text x="28" y="35" font-family="Meiryo,sans-serif" font-size="22" fill="${ink}">${esc(project.title)}</text>${section}${profile}<text x="28" y="1006" font-family="Meiryo,sans-serif" font-size="14" fill="${mute}">側溝プランナー v0.2｜図示スラブ下げ ${fmt(slab)} mm｜高さ条件の検討用</text></svg>`;
}
