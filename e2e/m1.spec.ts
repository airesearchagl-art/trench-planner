import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

async function change(page:Page,label:string,value:string){await page.getByLabel(label,{exact:true}).fill(value);await page.getByLabel(label,{exact:true}).press('Tab');}
async function jsonDownload(page:Page) {
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'JSONで保存',exact:true}).click();
  return JSON.parse(await fs.readFile((await (await pending).path())!,'utf8'));
}
async function point(page:Page,x:number,y:number){
  const svg=page.locator('#plan-canvas');const box=await svg.boundingBox();
  await svg.click({position:{x:box!.width*x,y:box!.height*y}});
}

test('調理室・下膳室の9案を画面とJSON往復で確認',async({page})=>{
  page.on('dialog',d=>d.accept());await page.goto('/');
  for(const [key,slab] of [['kitchen-original',300],['kitchen-mixed',450],['gt1-100',350],['gt1-50',550],['gt2-100',300],['gt2-50',400],['gt2-25',650],['dish-original',300],['dish-revised',300]] as const){
    await page.locator('#preset-select').selectOption(key);
    await expect(page.getByTestId('common-slab')).toHaveText(`${slab}mm`);
    const data=await jsonDownload(page);
    await page.locator('#file-input').setInputFiles({name:`${key}.json`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
    await expect(page.getByTestId('common-slab')).toHaveText(`${slab}mm`);
    await expect(page.locator('.diagram.no-print svg').getByText('D 213',{exact:true})).toBeVisible();
  }
});

test('入力直後の保存ボタンが1クリックで動く',async({page})=>{
  await page.goto('/');await page.getByLabel('現状スラブ下げ S',{exact:true}).fill('350');
  await page.getByLabel('現状スラブ下げ S',{exact:true}).press('Tab');
  await expect(page.getByTestId('available')).toHaveText('223mm');
  await expect(page.getByLabel('施工余裕',{exact:true})).toBeFocused();
  await page.getByLabel('施工余裕',{exact:true}).fill('10');
  const button=page.getByRole('button',{name:'JSONで保存',exact:true});const box=(await button.boundingBox())!;
  const pending=page.waitForEvent('download',{timeout:3000});
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  const data=JSON.parse(await fs.readFile((await(await pending).path())!,'utf8'));expect(data.section.reserveMm).toBe(10);
});

test('断面図の鍵・4寸法・スラブ逆算・保存復元',async({page},info)=>{
  await page.goto('/');
  const fields=[['FLから天端まで','25'],['グレーチング厚','40'],['最小下面クリアランス','60'],['スラブから底面まで','30']];
  for(const [name,value] of fields){
    await expect(page.getByLabel(`図上 ${name}`,{exact:true})).toBeDisabled();
    await page.getByRole('button',{name:`${name}の固定を解除`,exact:true}).click();
    await change(page,`図上 ${name}`,value);
  }
  await expect(page.getByTestId('available')).toHaveText('145mm');
  await expect(page.getByTestId('common-slab')).toHaveText('350mm');
  await page.locator('#solve-mode').selectOption('slab');
  await expect(page.getByLabel('現状スラブ下げ S',{exact:true})).toHaveValue('350');
  await expect(page.getByLabel('現状スラブ下げ S',{exact:true})).toBeDisabled();
  await expect(page.locator('.diagram.no-print svg').getByText('D 245',{exact:true})).toBeVisible();
  const saved=await jsonDownload(page);expect(saved.version).toBe(2);expect(saved.locks.minClearanceMm).toBe(false);expect(saved.solver.mode).toBe('slab');
  await page.reload();await expect(page.getByLabel('図上 最小下面クリアランス',{exact:true})).toHaveValue('60');
  await page.locator('#file-input').setInputFiles({name:'m1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
  await expect(page.getByTestId('common-slab')).toHaveText('350mm');
  await page.screenshot({path:info.outputPath('m1-locks.png'),fullPage:true});
});

test('調理室と下膳室で区間逆算し、矛盾時に回復できる',async({page})=>{
  page.on('dialog',d=>d.accept());await page.goto('/');
  await page.locator('#preset-select').selectOption('kitchen-original');
  await page.locator('#solve-mode').selectOption('slope');
  await page.locator('#solve-route').selectOption('route-2');
  await expect(page.getByLabel('ルート③ 区間1 勾配分母',{exact:true})).toHaveValue('156');
  await expect(page.getByLabel('ルート③ 区間2 勾配分母',{exact:true})).toHaveValue('100');
  await page.locator('#preset-select').selectOption('kitchen-mixed');
  await page.locator('#solve-mode').selectOption('slope');
  await page.locator('#solve-route').selectOption('route-2');
  await expect(page.getByRole('alert')).toContainText('落差を使い切');
  await page.locator('#solve-mode').selectOption('slab');
  await expect(page.getByTestId('common-slab')).toHaveText('450mm');
  await page.locator('#preset-select').selectOption('dish-revised');
  await page.locator('#solve-mode').selectOption('length');
  await expect(page.getByLabel('下膳室ルート 区間1 距離',{exact:true})).toHaveValue('8.65');
  await change(page,'施工余裕','10');
  await expect(page.getByLabel('下膳室ルート 区間1 距離',{exact:true})).toHaveValue('8.15');
  await expect(page.getByTestId('margin')).toHaveText('0mm');
});

test('画像の校正・折れ線・再校正・図面を含むJSONとSVG',async({page,browser},info)=>{
  const fixture=await browser.newPage({viewport:{width:1000,height:700}});
  await fixture.setContent('<body style="margin:0;background:#fff"><svg width="1000" height="700"><rect x="90" y="90" width="820" height="560" fill="none" stroke="#666"/><path d="M100 100H500M100 250L500 550H850" fill="none" stroke="#aaa" stroke-width="2"/><text x="220" y="85">4 m</text></svg></body>');
  const png=await fixture.screenshot();await fixture.close();
  page.on('dialog',d=>d.accept());await page.goto('/');
  await page.locator('#drawing-file').setInputFiles({name:'test-plan.png',mimeType:'image/png',buffer:png});
  await expect(page.locator('#plan-canvas')).toBeVisible();
  await page.getByRole('button',{name:'① 縮尺の2点を指定'}).click();
  await point(page,.1,100/700);await point(page,.5,100/700);
  await page.locator('#scale-length').fill('4');await page.locator('#scale-length').press('Tab');
  await page.getByRole('button',{name:'縮尺を確定',exact:true}).click();
  await page.getByRole('button',{name:'② 折れ線を描く'}).click();
  await point(page,.1,250/700);await point(page,.5,550/700);await point(page,.85,550/700);
  await page.getByRole('button',{name:'③ 距離に反映'}).click();
  await expect(page.getByLabel('下膳室ルート 区間1 距離',{exact:true})).toBeDisabled();
  const saved=await jsonDownload(page);expect(saved.drawing.calibration.lengthM).toBe(4);expect(saved.routes[0].segments[0].lengthM).toBeCloseTo(8.5,1);expect(saved.routes[0].segments[0].trace).toHaveLength(3);
  await page.locator('#plan-zoom').selectOption('200');
  await page.getByRole('button',{name:'① 縮尺の2点を指定'}).click();
  await point(page,.1,100/700);await point(page,.5,100/700);
  await page.locator('#scale-length').fill('8');await page.locator('#scale-length').press('Tab');await page.getByRole('button',{name:'縮尺を確定',exact:true}).click();
  const changed=await jsonDownload(page);expect(changed.routes[0].segments[0].lengthM).toBeCloseTo(17,1);await expect(page.getByTestId('common-slab')).toHaveText('500mm');
  await page.locator('#file-input').setInputFiles({name:'drawing.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
  await expect(page.getByTestId('common-slab')).toHaveText('300mm');await expect(page.locator('#plan-canvas image')).toHaveAttribute('href',/^data:image\/jpeg/);
  await page.reload();await expect(page.locator('#plan-canvas polyline')).toHaveCount(2);
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'図面＋計算結果 SVG'}).click();
  const svg=await fs.readFile((await (await pending).path())!,'utf8');expect(svg).toContain('data:image/jpeg;base64,');expect(svg).toContain('採用下げ300mm');expect(svg).toContain('図上 1/1区間');
  await page.locator('#solve-mode').selectOption('length');await expect(page.getByRole('alert')).toContainText('図面から測った距離');
  await page.locator('#solve-mode').selectOption('slope');await expect(page.getByLabel('下膳室ルート 区間1 勾配分母',{exact:true})).toHaveValue('50');
  await page.screenshot({path:info.outputPath('m1-drawing.png'),fullPage:true});
  await page.pdf({path:info.outputPath('m1-drawing.pdf'),preferCSSPageSize:true,printBackground:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('PDFのページ選択・作図・差替えと読込失敗の保持',async({page,browser},info)=>{
  const fixture=await browser.newPage();
  await fixture.setContent('<style>@page{size:1000px 700px;margin:0}body{margin:0}.sheet{height:699px;break-after:page}svg{width:1000px;height:650px}</style><div class="sheet"><svg><rect x="100" y="100" width="700" height="400" fill="none" stroke="black"/><text x="120" y="150">PAGE 1 / 4 m</text></svg></div><div><h1>PAGE 2</h1></div>');
  const pdf=await fixture.pdf({preferCSSPageSize:true,printBackground:true});await fixture.close();
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto('/');
  await page.locator('#drawing-file').setInputFiles({name:'2pages.pdf',mimeType:'application/pdf',buffer:pdf});
  await expect(page.locator('#pdf-page')).toHaveAttribute('max','2');
  await page.getByRole('button',{name:'① 縮尺の2点を指定'}).click();await point(page,.1,.2);await point(page,.5,.2);
  await page.locator('#scale-length').fill('4');await page.locator('#scale-length').press('Tab');await page.getByRole('button',{name:'縮尺を確定',exact:true}).click();
  await page.getByRole('button',{name:'② 折れ線を描く'}).click();await point(page,.1,.5);await point(page,.6,.5);await page.getByRole('button',{name:'③ 距離に反映'}).click();
  const data=await jsonDownload(page);expect(data.routes[0].segments[0].lengthM).toBeCloseTo(5,1);
  await page.locator('#pdf-page').fill('2');await page.getByRole('button',{name:'ページを変更',exact:true}).click();
  await expect(page.locator('.plan-tools').first()).toContainText('p.2');await expect(page.getByLabel('下膳室ルート 区間1 距離',{exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'② 折れ線を描く'})).toBeDisabled();
  await page.locator('#drawing-file').setInputFiles({name:'bad.pdf',mimeType:'application/pdf',buffer:Buffer.from('invalid')});
  await expect(page.getByRole('status').first()).toContainText('現在の設定は保持');await expect(page.locator('.plan-tools').first()).toContainText('p.2');
  expect(errors).toEqual([]);await page.screenshot({path:info.outputPath('m1-pdf.png'),fullPage:true});
});
