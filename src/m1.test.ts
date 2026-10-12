import { expect, it } from 'vitest';
import { preset, parseProject, serializeProject, validateProject } from './data';
import { calculate } from './engine';
import { resolveProject } from './solver';
import { measuredLength } from './geometry';
import type { Drawing } from './types';

const drawing: Drawing = { name:'検証図.png',page:1,width:1000,height:700,dataUrl:'data:image/png;base64,YQ==',calibration:{points:[{x:100,y:100},{x:500,y:100}],lengthM:4} };
it('調理室の区間を維持して必要下げ450、下膳室は300に自動算定',()=>{
  const p=preset('kitchen-mixed');p.solver.mode='slab';
  const solved=resolveProject(p);expect(solved.section.slabDropMm).toBe(450);expect(calculate(solved).routes.every(r=>r.fits)).toBe(true);
  const d=preset();d.section.slabDropMm=550;d.solver.mode='slab';expect(resolveProject(d).section.slabDropMm).toBe(300);
});
it('他区間を固定して勾配だけを整数分母の緩い側へ逆算',()=>{
  const p=preset('kitchen-original');p.solver={mode:'slope',routeId:'route-2',segmentId:'seg-2-0'};
  const solved=resolveProject(p);expect(solved.routes[2].segments[0].slopeDenominator).toBe(156);
  expect(solved.routes[2].segments[1].slopeDenominator).toBe(100);expect(solved.routes[0]).toEqual(p.routes[0]);expect(calculate(solved).routes[2].marginMm).toBeGreaterThanOrEqual(0);
});
it('下膳室の最大距離8.65mを適用し、施工余裕10mmなら8.15m',()=>{
  const p=preset();p.solver.mode='length';expect(resolveProject(p).routes[0].segments[0].lengthM).toBe(8.65);
  p.section.reserveMm=10;expect(resolveProject(p).routes[0].segments[0].lengthM).toBe(8.15);
});
it('他区間の超過・正の落差不足は逆算を停止する',()=>{
  const p=preset('kitchen-mixed');p.solver={mode:'slope',routeId:'route-2',segmentId:'seg-2-0'};
  expect(()=>resolveProject(p)).toThrow('落差を使い切');
});
it('製品寸法の変更がDと許容落差に連動する',()=>{
  const p=preset();Object.assign(p.section,{minClearanceMm:60,gratingThicknessMm:40,bottomBuildUpMm:30});
  const r=calculate(p);expect(r.dMaxMm).toBe(200);expect(r.dMinMm).toBe(50);expect(r.availableFallMm).toBe(150);expect(r.commonSlabMm).toBe(350);
  p.solver.mode='slab';p.section.gratingThicknessMm=350;expect(resolveProject(validateProject(p)).section.slabDropMm).toBe(650);
});
it('旧JSON v1を移行し、鍵と逆算設定を既定状態にする',()=>{
  const p=preset();const old={...p,version:1,locks:undefined,solver:undefined};
  const migrated=validateProject(old);expect(migrated.version).toBe(2);expect(migrated.locks.minClearanceMm).toBe(true);expect(migrated.solver.mode).toBe('check');
});
it('縮尺・折れ線・鍵をJSON往復し、縮尺変更で実距離を再算定',()=>{
  const p=preset();p.drawing=structuredClone(drawing);p.locks.minClearanceMm=false;
  p.routes[0].segments[0].trace=[{x:100,y:250},{x:500,y:550},{x:850,y:550}];
  expect(measuredLength(p.routes[0].segments[0].trace,p.drawing)).toBe(8.5);
  expect(parseProject(serializeProject(p))).toEqual(p);
  p.drawing.calibration!.lengthM=8;expect(validateProject(p).routes[0].segments[0].lengthM).toBe(17);
  p.solver.mode='length';expect(()=>resolveProject(p)).toThrow('図面から測った距離');
});
it('不正な縮尺・座標・外部画像URL・鍵を拒否する',()=>{
  const p=preset();p.drawing=structuredClone(drawing);
  p.drawing.calibration!.points[1]={x:100,y:100};expect(()=>validateProject(p)).toThrow();
  p.drawing=structuredClone(drawing);p.routes[0].segments[0].trace=[{x:-1,y:0},{x:50,y:0}];expect(()=>validateProject(p)).toThrow();
  delete p.routes[0].segments[0].trace;p.drawing.dataUrl='https://example.com/image.png';expect(()=>validateProject(p)).toThrow();
  delete p.drawing;expect(()=>validateProject({...p,locks:{...p.locks,minClearanceMm:'false'}})).toThrow();
});
