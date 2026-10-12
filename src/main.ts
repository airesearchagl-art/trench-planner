import './style.css';
import type { LockedDimension, Project, Results, Section, Solver } from './types';
import { preset, PRESETS, parseProject, serializeProject, validateProject, MAX_JSON_BYTES } from './data';
import { calculate, maxLengthM, segmentLimit } from './engine';
import { diagramBundle, esc, fmt, profileSvg, sectionSvg } from './diagrams';
import { download, filename, presentationPrompt } from './export';
import { resolveProject } from './solver';
import { PlanController } from './plan';

const STORAGE = 'trench-planner.project.v1';
let project: Project = preset(), selected = project.routes[0].id, planned = false, inverseDen = 50;
let error = '', notice = '', dimsOpen = false;
try {
  const saved = localStorage.getItem(STORAGE);
  if (saved) project = parseProject(saved);
} catch { notice = '前回の設定を読み込めなかったため、初期例を表示しています。'; }
selected = project.routes[0].id;
const app = document.querySelector<HTMLDivElement>('#app')!;
// 数値のblur時にDOMを差し替えると、続く保存・鍵ボタンのclickが失われる。
// ポインター操作を1回の操作として扱い、click完了後に保留描画する。
let pointerActive = false, tabMoving = false, renderPending = false;
window.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  tabMoving = true;
  setTimeout(() => { tabMoving = false; if (renderPending) render(); }, 0);
}, true);
window.addEventListener('pointerdown', () => { pointerActive = true; }, true);
function endPointer() {
  pointerActive = false;
  setTimeout(() => { if (renderPending) render(); }, 0);
}
window.addEventListener('pointerup', endPointer, true);
window.addEventListener('pointercancel', endPointer, true);
window.addEventListener('blur', endPointer);
const id = () => crypto.randomUUID();
const numInput = (value: number, attrs: string, label: string, unit = 'mm') => `<label class="number-field"><span>${esc(label)}</span><span class="input-unit"><input type="number" step="any" value="${Number.isFinite(value) ? value : ''}" ${attrs} aria-label="${esc(label)}"/><span>${unit}</span></span></label>`;
const field = (key: keyof Section, label: string) => numInput(project.section[key], `data-section="${key}" ${((key === 'slabDropMm' && project.solver.mode === 'slab') || project.locks[key as LockedDimension]) ? 'disabled' : ''}`, label);
const plan = new PlanController(() => project, () => selected, (next, message) => {
  const valid = validateProject(next);
  project = valid; notice = message ?? ''; if (calculateValid()) save(); render();
}, render, text => { notice = text; render(); });
function solverPanel() {
  const v = project.solver, route = project.routes.find(r => r.id === v.routeId) ?? project.routes[0];
  return `<div class="solver-panel"><label class="full-field">固定する条件と求める値<select id="solve-mode"><option value="check" ${v.mode === 'check' ? 'selected' : ''}>入力値を固定して検証</option><option value="slab" ${v.mode === 'slab' ? 'selected' : ''}>🔓 スラブ下げを求める（距離・勾配固定）</option><option value="slope" ${v.mode === 'slope' ? 'selected' : ''}>🔓 勾配を求める（スラブ・距離固定）</option><option value="length" ${v.mode === 'length' ? 'selected' : ''}>🔓 距離を求める（スラブ・勾配固定）</option></select></label>
  ${['slope','length'].includes(v.mode) ? `<label class="full-field">逆算ルート<select id="solve-route">${project.routes.map(r => `<option value="${r.id}" ${v.routeId === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label><label class="full-field">自動算定する区間<select id="solve-segment">${route.segments.map(x => `<option value="${x.id}" ${v.segmentId === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
  <p class="hint">${v.mode === 'slab' ? 'Sを自動算定中。全ルートが納まる最小値を刻みで切上げます。現在値より浅くなる場合もあります。' : v.mode === 'slope' ? '選択区間以外の落差を固定。勾配分母は整数の緩い側に切上げます。' : v.mode === 'length' ? '選択区間以外の落差を固定。最大距離を1mm単位で切り捨てます。' : 'S・距離・勾配の入力値を維持して必要下げと比較します。'}</p></div>`;
}
function autoSegment(segmentId: string, field: string) {
  return project.solver.segmentId === segmentId && ((field === 'lengthM' && project.solver.mode === 'length') || (field === 'slopeDenominator' && project.solver.mode === 'slope'));
}
function repairSolverTarget() {
  const route = project.routes.find(r => r.id === project.solver.routeId) ?? project.routes[0];
  if (!route.segments.some(s => s.id === project.solver.segmentId)) project.solver = { mode: 'check', routeId: route.id, segmentId: route.segments[0].id };
}
function calculateValid(): Results | null {
  try { const valid = validateProject(resolveProject(validateProject(project))); project = valid; error = ''; return calculate(valid); }
  catch (e) { error = e instanceof Error ? e.message : '入力を確認してください。'; return null; }
}
function save() {
  try { localStorage.setItem(STORAGE, serializeProject(project)); }
  catch { notice = 'このブラウザでは自動保存できません。JSONで保存してください。'; }
}
function render() {
  if (pointerActive || tabMoving) { renderPending = true; return; }
  renderPending = false;
  const active = document.activeElement;
  const attrs = ['id','aria-label','data-section','data-project','data-action','data-key','data-route','data-segment','data-field','data-plan'];
  const focusAttrs = active && app.contains(active) ? attrs.filter(a => active.hasAttribute(a)).map(a => `[${a}="${CSS.escape(active.getAttribute(a)!)}"]`).join('') : '';
  const focusSelector = focusAttrs ? `${active!.tagName.toLowerCase()}${focusAttrs}` : '';
  const r = calculateValid();
  if (!project.routes.some(x => x.id === selected)) selected = project.routes[0].id;
  app.innerHTML = `
    <header class="topbar no-print"><a class="brand" href="#"><span class="brand-icon" aria-hidden="true">≋</span><span>側溝プランナー<small>TRENCH PLANNER</small></span></a><span class="version">M1 · 0.2</span>
      <div class="toolbar"><a class="manual-link" href="/manual.html" target="_blank" rel="noopener" aria-label="使い方（別タブで開く）">使い方 <span aria-hidden="true">↗</span></a><button data-action="import">JSONを読込</button><button data-action="json" ${r ? '' : 'disabled'}>JSONで保存</button><details class="export-menu"><summary>資料を出力</summary><div><button data-action="svg" ${r ? '' : 'disabled'}>模式図 SVG</button><button data-action="prompt" ${r ? '' : 'disabled'}>スライド作成プロンプト</button><button data-action="print" ${r ? '' : 'disabled'}>印刷 / PDF保存</button></div></details></div>
    </header>
    <div class="workspace-title"><div><p class="eyebrow">厨房側溝の高さ・勾配検討</p><h1>条件を変えて、断面の納まりを確かめる。</h1></div><p class="local-note no-print">入力はこのブラウザ内に保存<br>共有・引継ぎはJSONで</p></div>
    <div id="notice" role="status" class="notice ${notice ? '' : 'hidden'}">${esc(notice)}</div>
    <div class="workspace">
      <aside class="inputs no-print">
        <section class="input-section"><h2><span>01</span>検討条件</h2>
          <label class="full-field">検討名<input data-project="title" value="${esc(project.title)}" maxlength="100"/></label>
          <label class="full-field">今回の検討例を読込<select id="preset-select"><option value="">例を選択…</option>${Object.entries(PRESETS).map(([k,v]) => `<option value="${k}">${esc(v.title)}</option>`).join('')}</select></label>
          <div class="two-inputs">${field('slabDropMm', '現状スラブ下げ S')}${field('reserveMm', '施工余裕')}</div>
          <p class="hint">施工余裕は落差から差し引きます。初期値0mm。保護中の断面寸法は右の図で鍵を解除します。</p>${solverPanel()}
          <details id="dimension-details" ${dimsOpen ? 'open' : ''}><summary>断面・製品寸法を変更</summary><div class="dimension-fields">
            ${field('topRecessMm', 'FLから天端まで')}${field('gratingThicknessMm', 'グレーチング厚')}${field('datumOffsetMm', '下面からD基準まで')}${field('bottomBuildUpMm', 'スラブから底面まで')}${field('minClearanceMm', '最小下面クリアランス')}${field('slabStepMm', '下げ寸法の刻み')}${field('trenchWidthMm', '側溝幅（図示用）')}
          </div><p class="hint">グレーチング天端は一定。D基準差は表示の基準で、使用可能落差には影響しません。</p></details>
          ${numInput(project.gtCount, 'data-project="gtCount" min="1" max="20" step="1"', 'GT数（計画情報）', '箇所')}
          <p class="hint">GT数だけではルート長は変わりません。接続先までの実経路長を入力してください。</p>
        </section>
        <section class="input-section"><div class="section-heading"><h2><span>02</span>ルート・区間</h2><button class="small" data-action="add-route" ${project.routes.length >= 20 ? 'disabled' : ''}>＋ ルート</button></div>
        <p class="hint">上から水上側 → 排水先。各区間で距離と勾配を指定します。</p>
        ${project.routes.map(route => `<article class="route-editor ${selected === route.id ? 'active' : ''}" style="--route-color:${route.color}" data-route-card="${route.id}">
          <div class="route-heading"><button class="route-view ${selected === route.id ? 'selected' : ''}" data-action="select-route" data-id="${route.id}" aria-label="${esc(route.name)}を図示" aria-pressed="${selected === route.id}">●</button><input class="route-name" data-route="${route.id}" data-field="name" value="${esc(route.name)}" aria-label="ルート名"/><input type="color" data-route="${route.id}" data-field="color" value="${route.color}" aria-label="${esc(route.name)}の色"/><button class="icon-button" data-action="delete-route" data-id="${route.id}" ${project.routes.length === 1 ? 'disabled' : ''} aria-label="${esc(route.name)}を削除">×</button></div>
          <div class="segment-head"><span>区間名</span><span>距離 m</span><span>勾配 1/n</span><span></span></div>
          ${route.segments.map((seg, i) => `<div class="segment-row"><input data-route="${route.id}" data-segment="${seg.id}" data-field="name" value="${esc(seg.name)}" aria-label="${esc(route.name)} 区間${i+1} 名前"/><input type="number" step="any" min="0.001" data-route="${route.id}" data-segment="${seg.id}" data-field="lengthM" ${autoSegment(seg.id,'lengthM') || seg.trace ? 'disabled' : ''} value="${Number.isFinite(seg.lengthM) ? seg.lengthM : ''}" aria-label="${esc(route.name)} 区間${i+1} 距離"/><input type="number" step="any" min="1" data-route="${route.id}" data-segment="${seg.id}" data-field="slopeDenominator" ${autoSegment(seg.id,'slopeDenominator') ? 'disabled' : ''} value="${Number.isFinite(seg.slopeDenominator) ? seg.slopeDenominator : ''}" aria-label="${esc(route.name)} 区間${i+1} 勾配分母"/><button class="icon-button" data-action="delete-segment" data-id="${route.id}" data-segment-id="${seg.id}" ${route.segments.length === 1 ? 'disabled' : ''} aria-label="区間${i+1}を削除">×</button></div>${seg.trace ? `<div class="trace-tag">図面計測 ${fmt(seg.lengthM)}m <button data-action="manual-length" data-id="${route.id}" data-segment-id="${seg.id}">手入力に戻す</button></div>` : autoSegment(seg.id,'lengthM') || autoSegment(seg.id,'slopeDenominator') ? '<div class="trace-tag">🔓 選択項目を自動算定中</div>' : ''}`).join('')}
          <button class="text-button" data-action="add-segment" data-id="${route.id}" ${route.segments.length >= 30 ? 'disabled' : ''}>＋ 区間を追加</button>
        </article>`).join('')}
        </section>
      </aside>
      <main id="results" aria-live="polite">${r ? resultsHtml(r) : `<section class="error-panel" role="alert"><h2>入力を確認してください</h2><p>${esc(error)}</p><p>判定・模式図・出力を停止しています。</p></section>`}</main>
    </div>
    <footer class="app-footer">高さ条件の検討用。排水能力・構造安全性・GT本体や接続高さは別途確認。<span>グレーチング天端一定／各ルートは接続先までの経路として独立計算</span></footer>
    <input id="file-input" type="file" accept=".json,application/json" hidden/>
  `;
  document.querySelector('#dimension-details')?.addEventListener('toggle', e => { dimsOpen = (e.currentTarget as HTMLDetailsElement).open; });
  document.querySelector<HTMLInputElement>('#file-input')?.addEventListener('change', importFile);
  plan.bind(app);
  if (focusSelector) app.querySelector<HTMLElement>(focusSelector)?.focus({ preventScroll: true });
}
function resultsHtml(r: Results) {
  const rr = r.routes.find(x => x.id === selected)!, route = project.routes.find(x => x.id === selected)!;
  const displayedSlab = planned ? r.commonSlabMm : project.section.slabDropMm;
  const critical = project.routes.filter(x => r.criticalRouteIds.includes(x.id)).map(x => x.name).join('・');
  const minMargin = Math.min(...r.routes.map(x => x.marginMm)), fits = r.routes.every(x => x.fits);
  const length = maxLengthM(r.availableFallMm, inverseDen);
  return `<div class="result-heading"><div><p class="eyebrow">${esc(project.title)}</p><h2 class="status-title ${fits ? 'good' : 'bad'}">${fits ? '現在の下げで成立' : 'スラブ下げの見直しが必要'}</h2></div><span class="scope-label">高さ条件の判定</span></div>
    <div class="metrics"><div><span>勾配に使用可能</span><strong data-testid="available">${fmt(r.availableFallMm)}<small>mm</small></strong></div><div><span>共通採用スラブ下げ</span><strong data-testid="common-slab">${fmt(r.commonSlabMm)}<small>mm</small></strong><em>現状から ＋${fmt(r.addedSlabMm)} mm</em></div><div><span>最も厳しいルートの残余</span><strong class="${minMargin < 0 ? 'bad' : minMargin < 10 ? 'caution' : ''}" data-testid="margin">${fmt(minMargin)}<small>mm</small></strong><em>${esc(critical)}</em></div></div>
    ${minMargin >= 0 && minMargin < 10 ? '<p class="attention">残余落差が10mm未満です。入力した施工余裕の妥当性と、実経路長・納まりを確認してください。</p>' : ''}
    <section class="result-section"><h3>ルートごとの計算</h3><div class="table-scroll"><table><thead><tr><th>ルート</th><th>距離 m</th><th>必要落差 mm</th><th>残余 mm</th><th>必要下げ計算値 mm</th><th>採用下げ mm</th></tr></thead><tbody>${r.routes.map(x => {const rt=project.routes.find(t=>t.id===x.id)!;return `<tr class="${x.id===selected?'selected-row':''}"><th><span style="color:${rt.color}">●</span> ${esc(rt.name)}${r.criticalRouteIds.includes(x.id)?'<small class="critical">クリティカル</small>':''}</th><td>${fmt(x.lengthM)}</td><td>${fmt(x.fallMm)}</td><td class="${x.fits?'':'bad'}">${fmt(x.marginMm)}</td><td>${fmt(x.rawSlabMm)}</td><td><b>${fmt(x.adoptedSlabMm)}</b></td></tr>`;}).join('')}</tbody></table></div>
    <p class="hint">採用下げは${fmt(project.section.slabStepMm)}mm刻みで切上げ、現状${fmt(project.section.slabDropMm)}mmを下回らない値。共通採用下げは各ルートの最大値です。</p></section>
    <section class="result-section"><div class="diagram-controls"><h3>断面とルート</h3><label>図示ルート<select id="view-route">${project.routes.map(x=>`<option value="${x.id}" ${x.id===selected?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label><label>図示する下げ<select id="view-slab"><option value="current" ${!planned?'selected':''}>現在 ${fmt(project.section.slabDropMm)}mm</option><option value="planned" ${planned?'selected':''}>必要下げを反映 ${fmt(r.commonSlabMm)}mm</option></select></label></div>
      <p class="diagram-caption">${esc(route.name)}／図示スラブ下げ ${fmt(displayedSlab)}mm ${planned?'（共通採用下げ）':'（現状）'}</p>
      <div class="diagram no-print">${sectionSvg(project, displayedSlab, true)}</div><div class="diagram print-only">${sectionSvg(project, displayedSlab)}</div><div class="diagram profile">${profileSvg(project, selected, displayedSlab)}</div>
      <div class="table-scroll compact-table"><table><thead><tr><th>区間</th><th>距離 m</th><th>勾配</th><th>必要落差 mm</th></tr></thead><tbody>${route.segments.map((x,i)=>`<tr><th>${esc(x.name)}</th><td>${fmt(x.lengthM)}</td><td>1/${fmt(x.slopeDenominator)}</td><td>${fmt(rr.segmentFallsMm[i])}</td></tr>`).join('')}</tbody></table></div>
    </section>
    ${plan.html()}
    <details class="result-section inverse no-print"><summary>逆算する：取れる勾配・最大延長</summary><div class="inverse-body"><div><h4>このルートを全区間同じ勾配にする場合</h4><p>現在の下げで取れる最大勾配</p><strong>${rr.uniformMaxDenominator===null?'正の勾配は確保できません':`約 1/${fmt(rr.uniformMaxDenominator)}`}</strong>${rr.uniformMaxDenominator!==null?`<p class="hint">整数分母で設定するなら 1/${Math.ceil(rr.uniformMaxDenominator)} 以上の分母（緩い側）。区間別設定を一律に置換した場合の理論値です。</p>`:''}
    <label class="inline-field">一律勾配 1/<input id="inverse-den" type="number" min="1" max="100000" step="any" value="${inverseDen}" aria-label="逆算する勾配分母"/></label><p>その勾配での最大延長：<b id="max-length">${length===null?'最小断面が不足':`${fmt(length)} m`}</b></p></div>
    <div><h4>他の区間を固定した場合</h4><p class="hint">指定区間以外の落差を先に差し引き、その区間に使える落差から逆算します。</p>${route.segments.map(x=>{const limit=segmentLimit(project,route.id,x.id);return `<p class="segment-limit"><span>${esc(x.name)}</span><b>${limit.denominator===null?'正の勾配不可':`約1/${fmt(limit.denominator)}`}</b><small>残り予算 ${fmt(limit.remainingMm)}mm</small></p>`;}).join('')}</div></div></details>
    <details class="result-section formula"><summary>計算の根拠・単位</summary><p>必要落差 H＝Σ（距離m × 1000 ÷ 勾配分母）</p><p>固定高さ＝天端下がり＋グレーチング厚＋底部仕上げ等＋最小下面クリアランス＝${fmt(r.fixedHeightMm)}mm</p><p>使用可能落差＝${fmt(project.section.slabDropMm)}−${fmt(r.fixedHeightMm)}−施工余裕${fmt(project.section.reserveMm)}＝${fmt(r.availableFallMm)}mm</p><p>必要下げ計算値＝固定高さ＋必要落差＋施工余裕</p><p>1/50は1/100の2倍の勾配。分母が小さいほど急になります。表示は小数3桁までですが、判定は丸め前の値で行います。</p><p>幅は模式図用。排水流量、粗度、流速、GT本体寸法、接続レベル、構造耐力はこの判定に含みません。</p></details>`;
}
async function importFile(e: Event) {
  const input = e.target as HTMLInputElement, file = input.files?.[0]; if (!file) return;
  try {
    if (file.size > MAX_JSON_BYTES) throw new Error('JSONは12MBまでです。');
    const parsed = validateProject(resolveProject(parseProject(await file.text())));
    if (parsed.drawing) {
      const image = new Image(); image.src = parsed.drawing.dataUrl;
      try { await image.decode(); } catch { throw new Error('JSON内の図面画像を復元できません。'); }
      if (image.naturalWidth !== parsed.drawing.width || image.naturalHeight !== parsed.drawing.height) throw new Error('図面画像と保存された寸法が一致しません。');
    }
    plan.reset(); project = parsed; selected = project.routes[0].id; planned = false; notice = 'JSONを読み込みました。'; save(); render();
  } catch(e) { notice = `読込できませんでした。${e instanceof Error?e.message:''} 現在の設定は保持しています。`; render(); }
}
app.addEventListener('change', e => {
  const target = e.target as HTMLInputElement | HTMLSelectElement;
  notice = '';
  if (target.id === 'preset-select') {
    if (!target.value) return;
    if (!window.confirm('現在の入力を選択した検討例に置き換えます。必要なら先にJSONで保存してください。')) {target.value='';return;}
    plan.reset(); project = preset(target.value); selected=project.routes[0].id; planned=false;
  } else if (target.id === 'view-route' || target.id === 'plan-route') { selected=target.value; plan.mode='idle'; plan.points=[]; }
  else if (target.id === 'solve-mode') { project.solver.mode=target.value as Solver['mode']; planned=false; }
  else if (target.id === 'solve-route') { project.solver.routeId=target.value; project.solver.segmentId=project.routes.find(r=>r.id===target.value)!.segments[0].id; }
  else if (target.id === 'solve-segment') project.solver.segmentId=target.value;
  else if (target.id === 'view-slab') planned=target.value==='planned';
  else if (target.id === 'inverse-den') {
    const n=Number(target.value); if (!target.value || !Number.isFinite(n)||n<1||n>100000) {target.setCustomValidity('1〜100000で入力してください。');target.reportValidity();return;}
    inverseDen=n;
    const r=calculateValid(); if(r){const max=maxLengthM(r.availableFallMm,n); document.querySelector('#max-length')!.textContent=max===null?'最小断面が不足':`${fmt(max)} m`;}
    target.setCustomValidity('');return;
  } else if (target.dataset.section) project.section[target.dataset.section as keyof Section]=(target as HTMLInputElement).valueAsNumber;
  else if (target.dataset.project === 'title') project.title=target.value;
  else if (target.dataset.project === 'gtCount') project.gtCount=(target as HTMLInputElement).valueAsNumber;
  else if (target.dataset.route) {
    const route=project.routes.find(x=>x.id===target.dataset.route)!;
    if(target.dataset.segment) {
      const seg=route.segments.find(x=>x.id===target.dataset.segment)!;
      if(target.dataset.field==='name') seg.name=target.value;
      else if(target.dataset.field==='lengthM') seg.lengthM=(target as HTMLInputElement).valueAsNumber;
      else if(target.dataset.field==='slopeDenominator') seg.slopeDenominator=(target as HTMLInputElement).valueAsNumber;
    } else if(target.dataset.field==='name') route.name=target.value;
    else if(target.dataset.field==='color') route.color=target.value;
  } else return;
  if(calculateValid()) save(); render();
});
app.addEventListener('click', e=> {
  const target=(e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  if(!target||target.disabled)return;
  const action=target.dataset.action, route=project.routes.find(x=>x.id===target.dataset.id);
  if(action==='import'){document.querySelector<HTMLInputElement>('#file-input')!.click();return;}
  if(action==='select-route'){selected=target.dataset.id!;plan.mode='idle';plan.points=[];render();return;}
  if(action==='toggle-slab'){project.solver.mode=project.solver.mode==='slab'?'check':'slab';planned=false;if(calculateValid())save();render();return;}
  if(action==='lock-dimension'){const key=target.dataset.key as LockedDimension;project.locks[key]=!project.locks[key];if(calculateValid())save();render();return;}
  if(action==='manual-length'&&route){const seg=route.segments.find(s=>s.id===target.dataset.segmentId)!;delete seg.trace;if(calculateValid())save();render();return;}
  if(action==='add-route'&&project.routes.length<20){const rid=id(); project.routes.push({id:rid,name:`ルート${project.routes.length+1}`,color:'#688c41',segments:[{id:id(),name:'全区間',lengthM:10,slopeDenominator:100}]});selected=rid;}
  else if(action==='delete-route'&&route&&project.routes.length>1){if(!confirm(`${route.name}を削除しますか？`))return;project.routes=project.routes.filter(x=>x.id!==route.id);}
  else if(action==='add-segment'&&route&&route.segments.length<30) route.segments.push({id:id(),name:`区間${route.segments.length+1}`,lengthM:1,slopeDenominator:100});
  else if(action==='delete-segment'&&route&&route.segments.length>1) route.segments=route.segments.filter(x=>x.id!==target.dataset.segmentId);
  else {
    const r=calculateValid(); if(!r){render();return;}
    const name=filename(project.title);
    if(action==='json') download(`${name}.json`,serializeProject(project),'application/json;charset=utf-8');
    if(action==='svg') download(`${name}-模式図.svg`,diagramBundle(project,selected,planned?r.commonSlabMm:project.section.slabDropMm),'image/svg+xml;charset=utf-8');
    if(action==='prompt') download(`${name}-スライド作成プロンプト.txt`,presentationPrompt(project),'text/plain;charset=utf-8');
    if(action==='print') window.print();
    return;
  }
  repairSolverTarget();if(calculateValid())save();render();
});
render();
