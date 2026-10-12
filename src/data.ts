import type { Project, Route, Section } from './types';
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
  return { format: 'trench-planner', version: 1, title, gtCount, section: { ...DEFAULT_SECTION }, routes };
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
const MAX_JSON_BYTES = 512_000;
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
  if (root.format !== 'trench-planner' || root.version !== 1) throw new InputError('対応していない設定形式です（trench-planner / version 1 が必要です）。');
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
  if (section.slabDropMm <= section.topRecessMm + section.gratingThicknessMm + section.bottomBuildUpMm) throw new InputError('スラブ下げが天端下がり・グレーチング厚・底部仕上げの合計以下です。');
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
      return { id: unique(x.id), name: str(x.name, '区間名'), lengthM: num(x.lengthM, '区間距離（m）', 0.001, 10000), slopeDenominator: num(x.slopeDenominator, '勾配分母', 1, 100000) };
    }) };
  });
  const gtCount = num(root.gtCount, 'GT数', 1, 20);
  if (!Number.isInteger(gtCount)) throw new InputError('GT数は整数で入力してください。');
  return { format: 'trench-planner', version: 1, title: str(root.title, '検討名'), gtCount, section, routes };
}
export function parseProject(text: string): Project {
  if (new TextEncoder().encode(text).length > MAX_JSON_BYTES) throw new InputError('設定ファイルは500KB程度までです。');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new InputError('JSONとして読み込めません。ファイルを確認してください。'); }
  return validateProject(value);
}
export function serializeProject(project: Project): string { return JSON.stringify(validateProject(project), null, 2); }
