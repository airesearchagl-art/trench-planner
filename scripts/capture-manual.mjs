// 起動済みの開発画面から、説明用の架空データだけでマニュアル画像を再生成する。
// npm run dev -- --port 5178 --strictPort → node scripts/capture-manual.mjs
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

await mkdir('public/manual', { recursive: true });
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1180 }, deviceScaleFactor: 1 });
page.on('dialog', d => d.accept());

// 画面本体は変更せず、撮影時だけ説明番号を重ねる。
async function capture(name, root, pins) {
  await root.scrollIntoViewIfNeeded();
  const positions = [];
  for (const [number, locator, dx = -13, dy = -13] of pins) {
    const b = await locator.boundingBox();
    positions.push({ number, x: b.x + dx, y: b.y + dy });
  }
  await page.evaluate(positions => {
    positions.forEach(({ number, x, y }) => {
      const pin = document.createElement('b');
      pin.className = 'manual-capture-pin'; pin.textContent = String(number);
      Object.assign(pin.style, { position: 'absolute', zIndex: '999', left: `${x + scrollX}px`, top: `${y + scrollY}px`, width: '28px', height: '28px', display: 'grid', placeItems: 'center', borderRadius: '50%', background: '#b5542e', color: 'white', border: '2px solid white', boxShadow: '0 1px 4px #0003', font: 'bold 13px Meiryo,sans-serif', pointerEvents: 'none' });
      document.body.append(pin);
    });
  }, positions);
  const png = await root.screenshot({ path: `public/manual/${name}.png` });
  const html = await readFile('manual.html', 'utf8');
  await writeFile('manual.html', html.replace(new RegExp(`(src="/manual/${name}\\.png"[^>]*?)width="\\d+" height="\\d+"`), `$1width="${png.readUInt32BE(16)}" height="${png.readUInt32BE(20)}"`));
  await page.locator('.manual-capture-pin').evaluateAll(nodes => nodes.forEach(n => n.remove()));
}

try {
  await page.goto('http://127.0.0.1:5178/');
  await page.evaluate(() => localStorage.clear()); await page.reload();
  // 全体画面は最初の1,180pxを撮影。
  await page.evaluate(() => { const frame = document.createElement('div'); frame.id = 'manual-frame'; Object.assign(frame.style, {position:'absolute',top:'0',left:'0',width:'1440px',height:'1180px',pointerEvents:'none'}); document.body.append(frame); });
  await capture('screen', page.locator('#manual-frame'), [
    [1, page.locator('.input-section').first(), 5, 9],
    [2, page.locator('.input-section').nth(1), 5, 9],
    [3, page.locator('.result-heading'), -13, 0],
    [4, page.locator('.diagram-controls'), -24, -8],
    [5, page.getByRole('button',{name:'JSONを読込',exact:true}), -12, -12],
  ]);
  await capture('section', page.locator('.diagram.no-print'), [
    [1, page.locator('.svg-dimension').nth(0), -10, -9],
    [2, page.locator('.svg-dimension').nth(1), -10, -9],
    [3, page.locator('.svg-dimension').nth(2), -10, -9],
    [4, page.locator('.svg-dimension').nth(3), -10, -9],
    [5, page.locator('.slab-lock'), -12, -12],
  ]);
  await page.locator('#solve-mode').selectOption('length');
  await capture('solver', page.locator('.solver-panel'), []);
  await page.locator('#preset-select').selectOption('dish-revised');

  const fixture = await browser.newPage({viewport:{width:1000,height:600},deviceScaleFactor:1});
  await fixture.setContent(`<body style="margin:0;background:white"><svg width="1000" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="1000" height="600" fill="#fff"/><g fill="none" stroke="#98a397" stroke-width="3"><path d="M70 180V530H930V180H70 M580 180V340H930 M240 180V290H70"/><rect x="350" y="210" width="130" height="80"/><rect x="710" y="215" width="140" height="80"/><rect x="710" y="400" width="140" height="80"/></g><g fill="#52684e" font-family="Meiryo,sans-serif"><text x="65" y="47" font-size="25">下膳室 / 操作説明用の架空図面</text><text x="630" y="570" font-size="18">実際の設計図ではありません</text><text x="250" y="108" font-size="22">4,000 mm</text><text x="370" y="257" font-size="18">洗浄機</text><text x="742" y="260" font-size="18">作業台</text><text x="742" y="446" font-size="18">作業台</text></g><g stroke="#85937e" stroke-width="1.5"><path d="M100 95V155 M500 95V155 M100 125H500 M94 119L106 131 M494 119L506 131"/></g><g font-family="Meiryo,sans-serif" font-size="18" fill="#688d27"><text x="95" y="235">水上</text><text x="882" y="488">GT</text></g><path d="M100 260H500V470H740" fill="none" stroke="#d8e1c8" stroke-width="18"/></svg></body>`);
  const png = await fixture.screenshot(); await fixture.close();
  await page.locator('#drawing-file').setInputFiles({name:'操作説明用サンプル.png',mimeType:'image/png',buffer:png});
  const point = async (x,y) => { const box = await page.locator('#plan-canvas').boundingBox(); await page.locator('#plan-canvas').click({position:{x:box.width*x/1000,y:box.height*y/600}}); };
  await page.getByRole('button',{name:'① 縮尺の2点を指定'}).click();
  await point(100,125); await point(500,125);
  await page.locator('#scale-length').fill('4'); await page.locator('#scale-length').press('Tab');
  await page.getByRole('button',{name:'縮尺を確定',exact:true}).click();
  await page.getByRole('button',{name:'② 折れ線を描く'}).click();
  await point(100,260); await point(500,260); await point(500,470); await point(740,470);
  await page.getByRole('button',{name:'③ 距離に反映'}).click();
  await capture('drawing', page.locator('.plan-section'), [
    [1, page.getByRole('button',{name:'図面を差替え'}), -14, -8],
    [2, page.getByRole('button',{name:'① 縮尺の2点を指定'}), -10, -12],
    [3, page.locator('#plan-route'), -12, -15],
    [4, page.getByRole('button',{name:'② 折れ線を描く'}), -12, -12],
    [5, page.getByRole('button',{name:'③ 距離に反映'}), -10, -12],
    [6, page.getByRole('button',{name:'図面＋計算結果 SVG'}), -12, -12],
  ]);
  console.log('マニュアル用の実画面4枚を public/manual に保存しました。');
} finally { await browser.close(); }
