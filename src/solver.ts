import type { Project } from './types';
import { calculate, ceilStep, EPS, segmentLimit } from './engine';

// 自動算定する未知量を1つに限定し、他区間を勝手に変更しない。
export function resolveProject(input: Project): Project {
  const p = structuredClone(input), { mode, routeId, segmentId } = p.solver;
  if (mode === 'check') return p;
  if (mode === 'slab') {
    const r = calculate(p);
    p.section.slabDropMm = ceilStep(Math.max(...r.routes.map(x => x.rawSlabMm)), p.section.slabStepMm);
    return p;
  }
  const route = p.routes.find(r => r.id === routeId);
  const seg = route?.segments.find(s => s.id === segmentId);
  if (!seg) throw new Error('逆算する区間を選択してください。');
  if (mode === 'length' && seg.trace) throw new Error('図面から測った距離は逆算で変更できません。「手入力に戻す」か「勾配を求める」を選んでください。');
  const { remainingMm } = segmentLimit(p, routeId, segmentId);
  if (remainingMm <= EPS) throw new Error('他区間で落差を使い切っています。スラブ下げ・他区間の条件を見直してください。');
  if (mode === 'slope') {
    // 整数分母を緩い側へ切上げ、丸めによる落差超過を避ける。
    seg.slopeDenominator = Math.max(1, Math.ceil(seg.lengthM * 1000 / remainingMm - EPS));
  } else {
    // 1mm未満を切り捨て、表示と採用距離を一致させる。
    seg.lengthM = Math.floor(remainingMm * seg.slopeDenominator + EPS) / 1000;
  }
  return p;
}
