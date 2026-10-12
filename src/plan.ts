import type { Drawing, Point, Project } from './types';
import { calculate } from './engine';
import { esc, fmt } from './diagrams';
import { measuredLength, pixelLength } from './geometry';
import { download, filename } from './export';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export function drawingSvg(p: Project, pending: Point[] = [], calibrating = false): string {
  const d = p.drawing;
  if (!d) return '';
  const k = Math.max(d.width, d.height) / 900;
  const path = (points: Point[], color: string, dash = false) => `<polyline points="${points.map(pt => `${pt.x},${pt.y}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${3 * k}" ${dash ? `stroke-dasharray="${6*k} ${4*k}"` : ''}/>${points.map(pt => `<circle cx="${pt.x}" cy="${pt.y}" r="${3*k}" fill="${color}"/>`).join('')}`;
  let out = `<image href="${esc(d.dataUrl)}" x="0" y="0" width="${d.width}" height="${d.height}"/>`;
  if (d.calibration) out += path(d.calibration.points, '#ac2a83', true);
  p.routes.forEach(route => route.segments.forEach((seg, i) => {
    if (!seg.trace) return;
    out += path(seg.trace, route.color);
    const first = seg.trace[0];
    out += `<text x="${Math.min(d.width-100*k, first.x+8*k)}" y="${Math.max(20*k,first.y-10*k)}" font-family="Meiryo,sans-serif" font-size="${16*k}" fill="${route.color}" stroke="white" stroke-width="${4*k}" paint-order="stroke">${esc(route.name.slice(0,16))} · ${i+1}</text>`;
  }));
  if (pending.length) out += `<g class="no-print">${path(pending, calibrating ? '#ac2a83' : '#153d32', true)}</g>`;
  return `<svg id="plan-canvas" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}" width="${d.width}" height="${d.height}" role="img" aria-label="図面と排水経路"><rect width="100%" height="100%" fill="white"/>${out}</svg>`;
}
export function planReportSvg(p: Project): string {
  const d = p.drawing;
  if (!d) throw new Error('図面がありません。');
  const r = calculate(p), imageHeight = Math.min(760, 1000 * d.height / d.width), height = imageHeight + 185 + p.routes.length * 28;
  const image = drawingSvg(p).replace('<svg ', `<svg x="40" y="90" `).replace(`width="${d.width}" height="${d.height}" role`, `width="1000" height="${imageHeight}" role`);
  const text = (y:number, label:string, color='#263d37') => `<text x="40" y="${y}" font-family="Meiryo,sans-serif" font-size="17" fill="${color}">${esc(label)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}"><rect width="100%" height="100%" fill="white"/>${text(32,p.title.slice(0,55))}${text(61,`${d.name.slice(0,45)} / p.${d.page} / ${d.calibration ? `縮尺基準 ${fmt(d.calibration.lengthM)}m` : '縮尺未設定'}`)}${image}${text(imageHeight+120,`現在下げ ${fmt(p.section.slabDropMm)}mm / 共通採用下げ ${fmt(r.commonSlabMm)}mm / 図上経路と手入力を区別して表示`)}${r.routes.map((rr,i)=>{const rt=p.routes[i];return text(imageHeight+150+i*28,`${rt.name.slice(0,20)}：${fmt(rr.lengthM)}m / 落差${fmt(rr.fallMm)}mm / 採用下げ${fmt(rr.adoptedSlabMm)}mm / 図上 ${rt.segments.filter(s=>s.trace).length}/${rt.segments.length}区間`,rt.color);}).join('')}${text(height-14,'側溝プランナー｜図上計測は2点校正。高さ条件の検討用。') }</svg>`;
}

async function rasterize(file: File, pageNumber: number): Promise<{ drawing: Drawing; pages: number }> {
  if (file.size > 30_000_000) throw new Error('図面ファイルは30MBまでです。');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  let pages = 1;
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl:'/pdfjs/cmaps/', cMapPacked:true, standardFontDataUrl:'/pdfjs/standard_fonts/', wasmUrl:'/pdfjs/wasm/' });
    try {
      const pdf = await task.promise;
      pages = pdf.numPages;
      if (pageNumber < 1 || pageNumber > pages || !Number.isInteger(pageNumber)) throw new Error(`ページは1〜${pages}で指定してください。`);
      const page = await pdf.getPage(pageNumber), base = page.getViewport({scale:1});
      const viewport = page.getViewport({scale:Math.min(3, 2400/Math.max(base.width,base.height))});
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      await page.render({canvas,canvasContext:ctx,viewport}).promise;
    } finally { await task.destroy(); }
  } else {
    if (!['image/png','image/jpeg'].includes(file.type)) throw new Error('PDF・PNG・JPEGを選んでください。');
    const image = await createImageBitmap(file);
    try {
      const ratio = Math.min(1,2400/Math.max(image.width,image.height));
      canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
      ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    } finally { image.close(); }
  }
  const dataUrl = canvas.toDataURL('image/jpeg',0.88);
  if (dataUrl.length>8_000_000) throw new Error('画像化後の図面が大きすぎます。ページを縮小して再読込してください。');
  return {drawing:{name:file.name.slice(0,200),page:pageNumber,width:canvas.width,height:canvas.height,dataUrl},pages};
}

export class PlanController {
  mode: 'idle' | 'calibrate' | 'trace' = 'idle';
  points: Point[] = [];
  segmentId = '';
  realLength = 10;
  zoom = 100;
  file?: File;
  pages = 1;
  busy = false;
  generation = 0;
  private getProject:()=>Project;
  private getRoute:()=>string;
  private update:(p:Project,message?:string)=>void;
  private redraw:()=>void;
  private message:(text:string)=>void;
  constructor(getProject:()=>Project, getRoute:()=>string, update:(p:Project,message?:string)=>void, redraw:()=>void, message:(text:string)=>void) {
    this.getProject=getProject;this.getRoute=getRoute;this.update=update;this.redraw=redraw;this.message=message;
  }
  reset() { this.generation++;this.points=[];this.mode='idle';this.file=undefined;this.pages=1;this.busy=false; }
  html(): string {
    const p=this.getProject(), d=p.drawing, route=p.routes.find(r=>r.id===this.getRoute())!;
    if(!route.segments.some(s=>s.id===this.segmentId)) this.segmentId=route.segments[0].id;
    const seg=route.segments.find(s=>s.id===this.segmentId)!;
    return `<section class="result-section plan-section"><div class="section-heading"><h3>図面からルートを測る</h3><button class="no-print" data-plan="load" ${this.busy?'disabled':''}>${d?'図面を差替え':'PDF・画像を読込'}</button></div>
      <p class="hint">PDF・PNG・JPEGをブラウザ内で処理。1ページを選び、既知寸法の2点で縮尺を設定します。</p>
      ${this.busy?'<p role="status">図面を読み込んでいます…</p>':''}
      ${d?`<div class="plan-tools no-print"><span>${esc(d.name)} / p.${d.page}</span>${this.file&&this.pages>1?`<label>ページ<input id="pdf-page" type="number" min="1" max="${this.pages}" value="${d.page}"/></label><button data-plan="page" ${this.busy?'disabled':''}>ページを変更</button>`:''}<button data-plan="remove">図面を外す</button></div>
      <div class="plan-tools no-print"><button data-plan="calibrate">① 縮尺の2点を指定</button><label>2点間の実距離 <input id="scale-length" type="number" min="0.001" step="any" value="${this.realLength}"/> m</label>${this.mode==='calibrate'?`<button data-plan="apply-scale" ${this.points.length!==2?'disabled':''}>縮尺を確定</button>`:''}<span>${d.calibration?`設定済：${fmt(d.calibration.lengthM)}m / ${fmt(pixelLength(d.calibration.points))}px`:'縮尺未設定'}</span></div>
      <div class="plan-tools no-print"><label>作図ルート<select id="plan-route">${p.routes.map(rt=>`<option value="${rt.id}" ${rt.id===route.id?'selected':''}>${esc(rt.name)}</option>`).join('')}</select></label><label>作図区間<select id="trace-segment">${route.segments.map((s,i)=>`<option value="${s.id}" ${s.id===seg.id?'selected':''}>${i+1} ${esc(s.name)}</option>`).join('')}</select></label><button data-plan="trace" ${!d.calibration?'disabled':''}>② 折れ線を描く</button><button data-plan="finish" ${this.mode!=='trace'||this.points.length<2?'disabled':''}>③ 距離に反映</button><button data-plan="undo" ${!this.points.length?'disabled':''}>1点戻す</button><button data-plan="cancel">作図終了</button></div>
      <p class="plan-instruction no-print">${this.mode==='calibrate'?`基準寸法の両端をクリック（${this.points.length}/2点）。実距離を入力して確定。`:this.mode==='trace'?`水上から排水先へ順にクリック。${this.points.length}点${this.points.length>1?` / ${fmt(measuredLength(this.points,d))}m`:''}。区間ごとに「距離に反映」で確定。`:'図示ルートの選択に合わせて作図対象が変わります。区間ごとに勾配を変えられます。'}</p>
      <div class="plan-tools no-print"><label>表示倍率<select id="plan-zoom">${[75,100,150,200,300].map(n=>`<option ${n===this.zoom?'selected':''}>${n}</option>`).join('')}</select> %</label><button data-plan="export">図面＋計算結果 SVG</button></div>
      <div class="plan-scroll"><div class="plan-zoom" style="width:${this.zoom}%">${drawingSvg(p,this.points,this.mode==='calibrate')}</div></div>
      <p class="hint">${esc(d.name)} / p.${d.page} / ${d.calibration?`縮尺校正：指定2点間 ${fmt(d.calibration.lengthM)}m`:'縮尺未設定'}。線の番号はルート内の区間順です。</p>
      <div class="plan-legend">${p.routes.map(rt=>`<span style="color:${rt.color}">● ${esc(rt.name)}：図上${rt.segments.filter(s=>s.trace).length}/${rt.segments.length}区間</span>`).join('')}</div>
      <p class="hint">図上計測の距離は手入力・距離逆算から保護されます。縮尺を変更すると全作図区間が再計算されます。JSONには選択ページ画像・縮尺・折れ線を含めます。</p>`:'<div class="plan-empty no-print">図面の既知寸法 → 縮尺設定 → 区間ごとに折れ線 → 勾配・スラブ下げへ連動</div>'}
      <input type="file" id="drawing-file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" hidden/></section>`;
  }
  bind(root: HTMLElement) {
    root.querySelector<HTMLInputElement>('#drawing-file')?.addEventListener('change',e=>{const f=(e.target as HTMLInputElement).files?.[0];if(f)void this.load(f,1);});
    root.querySelector('#trace-segment')?.addEventListener('change',e=>{this.segmentId=(e.target as HTMLSelectElement).value;this.points=[];this.mode='idle';this.redraw();});
    root.querySelector('#scale-length')?.addEventListener('change',e=>{this.realLength=(e.target as HTMLInputElement).valueAsNumber;});
    root.querySelector('#plan-zoom')?.addEventListener('change',e=>{this.zoom=Number((e.target as HTMLSelectElement).value);this.redraw();});
    root.querySelectorAll<HTMLElement>('[data-plan]').forEach(button=>button.addEventListener('click',()=>{
      try {this.action(button.dataset.plan!,root);} catch(e){this.message(e instanceof Error?e.message:'操作を確認してください。');}
    }));
    const svg=root.querySelector<SVGSVGElement>('#plan-canvas');
    svg?.addEventListener('click',e=>{
      if(this.mode==='idle'||this.busy)return;
      const matrix=svg.getScreenCTM();if(!matrix)return;
      const pt=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()),d=this.getProject().drawing!;
      if(pt.x<0||pt.y<0||pt.x>d.width||pt.y>d.height)return;
      if(this.mode==='calibrate'&&this.points.length===2)this.points=[];
      if(this.points.length>=500){this.message('折れ線は1区間500点までです。');return;}
      this.points.push({x:pt.x,y:pt.y});
      const scroll=root.querySelector('.plan-scroll')!; const pos=[scroll.scrollLeft,scroll.scrollTop];
      this.redraw();const next=document.querySelector('.plan-scroll');if(next){next.scrollLeft=pos[0];next.scrollTop=pos[1];}
    });
  }
  private action(action:string,root:HTMLElement) {
    const p=structuredClone(this.getProject()),route=p.routes.find(r=>r.id===this.getRoute())!,seg=route.segments.find(s=>s.id===this.segmentId)!;
    if(action==='load'){root.querySelector<HTMLInputElement>('#drawing-file')!.click();return;}
    if(action==='page'&&this.file){void this.load(this.file,root.querySelector<HTMLInputElement>('#pdf-page')!.valueAsNumber);return;}
    if(action==='export'){download(`${filename(p.title)}-図面と経路.svg`,planReportSvg(p),'image/svg+xml;charset=utf-8');return;}
    if(action==='remove'){
      if(!confirm('図面と折れ線を外します。計測済みの距離は手入力値として残ります。'))return;
      delete p.drawing;p.routes.forEach(r=>r.segments.forEach(s=>delete s.trace));this.reset();this.update(p,'図面を外しました。');return;
    }
    if(action==='calibrate'||action==='trace'){this.mode=action==='calibrate'?'calibrate':'trace';this.points=[];}
    if(action==='undo')this.points.pop();
    if(action==='cancel'){this.mode='idle';this.points=[];}
    if(action==='apply-scale'){
      if(this.points.length!==2||!Number.isFinite(this.realLength)||this.realLength<=0)throw new Error('2点と正の実距離を入力してください。');
      p.drawing!.calibration={points:this.points as [Point,Point],lengthM:this.realLength};
      p.routes.forEach(r=>r.segments.forEach(s=>{if(s.trace)s.lengthM=measuredLength(s.trace,p.drawing!);}));
      this.update(p,'縮尺を設定し、全ての作図区間の距離を再計算しました。');this.mode='idle';this.points=[];
    }
    if(action==='finish'){
      seg.trace=structuredClone(this.points);seg.lengthM=measuredLength(seg.trace,p.drawing!);
      if(p.solver.mode==='length'&&p.solver.segmentId===seg.id)p.solver.mode='check';
      this.update(p,`${route.name}・${seg.name}へ ${fmt(seg.lengthM)}m を反映しました。距離を図面計測値に固定しています。`);this.mode='idle';this.points=[];
    }
    this.redraw();
  }
  private async load(file:File,page:number) {
    if(this.busy)return;
    if(this.getProject().drawing&&!confirm('図面・ページを差し替えると縮尺と折れ線を解除します。計測済みの距離は手入力値として残ります。'))return;
    this.busy=true;const generation=++this.generation;this.redraw();
    try {
      const result=await rasterize(file,page);if(generation!==this.generation)return;
      const p=structuredClone(this.getProject());p.drawing=result.drawing;p.routes.forEach(r=>r.segments.forEach(s=>delete s.trace));
      this.file=file;this.pages=result.pages;this.points=[];this.mode='idle';
      this.update(p,'図面を読み込みました。既知寸法の2点で縮尺を設定してください。');
    } catch(e) {if(generation===this.generation)this.message(`図面を読み込めませんでした。${e instanceof Error?e.message:''} 現在の設定は保持しています。`);}
    finally {if(generation===this.generation){this.busy=false;this.redraw();}}
  }
}
