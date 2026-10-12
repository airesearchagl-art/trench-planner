import type { Drawing, LockedDimension, Point, Project, Route, Section, Solver } from './types';
import { measuredLength, pixelLength } from './geometry';
export const LOCK_KEYS: LockedDimension[] = ['topRecessMm', 'gratingThicknessMm', 'minClearanceMm', 'bottomBuildUpMm'];
export const DEFAULT_LOCKS = { topRecessMm: true, gratingThicknessMm: true, minClearanceMm: true, bottomBuildUpMm: true };
export const DEFAULT_SECTION: Section = {
  slabDropMm: 300, topRecessMm: 20, gratingThicknessMm: 35, datumOffsetMm: 10,
  bottomBuildUpMm: 22, minClearanceMm: 50, slabStepMm: 50, reserveMm: 0, trenchWidthMm: 200,
};
const colors = ['#c23b40', '#216aaf', '#c57024'];
function route(index: number, lengths: number[], denominators: number[], labels: string[]): Route {
  return { id: `route-${index}`, name: `ルート${['①', '②', '③'][index]}`, color: colors[index],
    segments: lengths.map((lengthM, i) => ({ id: `seg-${index}-${i}`, name: labels[i], lengthM, slopeDenominator: denominators[i] })) };
}
function make(title: string, routes: Route[], gtCount = 1): Project {
  return { format: 'trench-planner', version: 2, title, gtCount, section: { ...DEFAULT_SECTION }, routes,
    locks: { ...DEFAULT_LOCKS }, solver: { mode: 'check', routeId: routes[0].id, segmentId: routes[0].segments[0].id } };
}
const kitchen = (gentle: number, main: number) => [
  route(0, [12, 8.85], [gentle, main], ['提供カウンター内', '調理室内']),
  route(1, [12.7], [main], ['調理室内']),
  route(2, [9.2, 11.4], [gentle, main], ['下処理室内', '調理室内']),
];
const uniform = (lengths: number[], n: number) => lengths.map((l, i) => route(i, [l], [n], ['全区間']));
const dish = (length: number, n: number) => [{ id: 'dish', name: '下膳室ルート', color: '#88af2a', segments: [{ id: 'dish-main', name: '下膳室内', lengthM: length, slopeDenominator: n }] }];
export const PRESETS: Record<string, Project> = {
  'dish-revised': make('下膳室廻り｜勾配・ルート見直し案', dish(8.5, 50)),
  'dish-original': make('下膳室廻り｜当初案', dish(14, 100)),
  'kitchen-original': make('調理室廻り｜当初案', kitchen(200, 100)),
  'kitchen-mixed': make('調理室廻り｜勾配見直し案①', kitchen(100, 50)),
  'gt1-100': make('調理室廻り｜GT1・一律1/100', uniform([20.85, 12.7, 20.6], 100)),
  'gt1-50': make('調理室廻り｜GT1・一律1/50', uniform([20.85, 12.7, 20.6], 50)),
  'gt2-100': make('調理室廻り｜GT2・一律1/100', uniform([11.5, 12.7, 11.5], 100), 2),
  'gt2-50': make('調理室廻り｜GT2・一律1/50', uniform([11.5, 12.7, 11.5], 50), 2),
  'gt2-25': make('調理室廻り｜GT2・一律1/25', uniform([11.5, 12.7, 11.5], 25), 2),
};
export function preset(key = 'dish-revised'): Project { return structuredClone(PRESETS[key] ?? PRESETS['dish-revised']); }
export const MAX_JSON_BYTES = 12_000_000;
export class InputError extends Error { }
function obj(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError(`${label}の形式が不正です。`);
  return value as Record<string, unknown>;
}
function str(value: unknown, label: string, max = 100): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new InputError(`${label}は1〜${max}文字で入力してください。`);
  return value;
}
function num(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new InputError(`${label}は${min}〜${max}の数値で入力してください。`);
  return value;
}
function identifier(value: unknown): string {
  const s = str(value, 'ID', 64);
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new InputError('IDには英数字・ハイフン・アンダースコアを使用してください。');
  return s;
}
export function validateProject(value: unknown): Project {
  const root = obj(value, '設定');
  if (root.format !== 'trench-planner' || ![1, 2].includes(root.version as number)) throw new InputError('対応していない設定形式です（version 1・2に対応）。');
  const drawing = root.drawing === undefined ? undefined : validateDrawing(root.drawing);
  const s = obj(root.section, '断面条件');
  const section: Section = {
    slabDropMm: num(s.slabDropMm, 'スラブ下げ', 1, 10000),
    topRecessMm: num(s.topRecessMm, '天端下がり', 0, 1000),
    gratingThicknessMm: num(s.gratingThicknessMm, 'グレーチング厚', 1, 1000),
    datumOffsetMm: num(s.datumOffsetMm, 'D基準差', 0, 1000),
    bottomBuildUpMm: num(s.bottomBuildUpMm, '底部仕上げ等', 0, 1000),
    minClearanceMm: num(s.minClearanceMm, '最小下面クリアランス', 1, 1000),
    slabStepMm: num(s.slabStepMm, 'スラブ下げ刻み', 1, 1000),
    reserveMm: num(s.reserveMm, '施工余裕', 0, 1000),
    trenchWidthMm: num(s.trenchWidthMm, '側溝幅', 1, 3000),
  };
  if (section.slabDropMm <= section.topRecessMm + section.gratingThicknessMm + section.bottomBuildUpMm && !(root.version === 2 && obj(root.solver, '逆算設定').mode === 'slab')) throw new InputError('スラブ下げが天端下がり・グレーチング厚・底部仕上げの合計以下です。');
  if (!Array.isArray(root.routes) || root.routes.length < 1 || root.routes.length > 20) throw new InputError('ルート数は1〜20本です。');
  const ids = new Set<string>();
  const unique = (v: unknown) => { const id = identifier(v); if (ids.has(id)) throw new InputError('IDが重複しています。'); ids.add(id); return id; };
  const routes = root.routes.map((v, i) => {
    const r = obj(v, `ルート${i + 1}`);
    const color = str(r.color, 'ルート色');
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new InputError('色は #RRGGBB 形式で指定してください。');
    if (!Array.isArray(r.segments) || !r.segments.length || r.segments.length > 30) throw new InputError('各ルートの区間数は1〜30です。');
    return { id: unique(r.id), name: str(r.name, 'ルート名'), color, segments: r.segments.map((v, j) => {
      const x = obj(v, `区間${j + 1}`);
      const trace = x.trace === undefined ? undefined : validatePoints(x.trace, drawing, 2, 500);
      const lengthM = trace ? measuredLength(trace, drawing!) : x.lengthM;
      return { id: unique(x.id), name: str(x.name, '区間名'), lengthM: num(lengthM, '区間距離（m）', 0.001, 10000), slopeDenominator: num(x.slopeDenominator, '勾配分母', 1, 100000), ...(trace ? { trace } : {}) };
    }) };
  });
  const gtCount = num(root.gtCount, 'GT数', 1, 20);
  if (!Number.isInteger(gtCount)) throw new InputError('GT数は整数で入力してください。');
  const locks = { ...DEFAULT_LOCKS };
  if (root.version === 2) {
    const inputLocks = obj(root.locks, '鍵の設定');
    for (const key of LOCK_KEYS) {
      if (typeof inputLocks[key] !== 'boolean') throw new InputError('鍵の設定は真偽値で指定してください。');
      locks[key] = inputLocks[key];
    }
  }
  let solver: Solver = { mode: 'check', routeId: routes[0].id, segmentId: routes[0].segments[0].id };
  if (root.version === 2) {
    const v = obj(root.solver, '逆算設定');
    if (!['check', 'slab', 'slope', 'length'].includes(v.mode as string)) throw new InputError('逆算モードが不正です。');
    const routeId = identifier(v.routeId), segmentId = identifier(v.segmentId);
    if (!routes.find(r => r.id === routeId)?.segments.some(s => s.id === segmentId)) throw new InputError('逆算対象の区間が見つかりません。');
    solver = { mode: v.mode as Solver['mode'], routeId, segmentId };
  }
  return { format: 'trench-planner', version: 2, title: str(root.title, '検討名'), gtCount, section, routes, locks, solver, ...(drawing ? { drawing } : {}) };
}
function validatePoints(value: unknown, drawing: Drawing | undefined, min: number, max: number): Point[] {
  if (!drawing || !Array.isArray(value) || value.length < min || value.length > max) throw new InputError('図面上の点数または図面の設定が不正です。');
  const points = value.map(v => { const p = obj(v, '座標'); return { x: num(p.x, 'X座標', 0, drawing.width), y: num(p.y, 'Y座標', 0, drawing.height) }; });
  if (pixelLength(points) < 1) throw new InputError('図面上の線は1px以上必要です。');
  return points;
}
function validateDrawing(value: unknown): Drawing {
  const d = obj(value, '図面');
  const dataUrl = str(d.dataUrl, '図面画像', 8_000_000);
  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) throw new InputError('図面は埋込みPNG/JPEG画像のみ対応しています。');
  const drawing: Drawing = { name: str(d.name, '図面名', 200), page: num(d.page, 'ページ', 1, 10000), width: num(d.width, '図面幅', 1, 4096), height: num(d.height, '図面高さ', 1, 4096), dataUrl };
  if (![drawing.page, drawing.width, drawing.height].every(Number.isInteger)) throw new InputError('図面のページ・画像寸法は整数が必要です。');
  if (d.calibration !== undefined) {
    const c = obj(d.calibration, '縮尺');
    drawing.calibration = { points: validatePoints(c.points, drawing, 2, 2) as [Point, Point], lengthM: num(c.lengthM, '基準寸法（m）', 0.001, 10000) };
  }
  return drawing;
}
export function parseProject(text: string): Project {
  if (new TextEncoder().encode(text).length > MAX_JSON_BYTES) throw new InputError('設定ファイルは12MBまでです。');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new InputError('JSONとして読み込めません。ファイルを確認してください。'); }
  return validateProject(value);
}
export function serializeProject(project: Project): string { return JSON.stringify(validateProject(project), null, 2); }
