// Maakt de app-iconen en het linkvoorbeeld (og.jpg) opnieuw, in de kleuren en naam uit site.json.
// Gebruik: node scripts/make_images.js   (na python3 build.py, want het gebruikt public/favicon.svg)
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const R = (...a) => path.join(__dirname, '..', ...a);
const site = JSON.parse(fs.readFileSync(R('site.json'), 'utf8'));
const lion = fs.readFileSync(R('public', 'favicon.svg'), 'utf8');
const BG = (s) => `radial-gradient(${s*0.9}px ${s*0.6}px at 100% 0%, rgba(255,183,3,.45), transparent 60%),radial-gradient(${s*0.9}px ${s*0.7}px at 0% 100%, rgba(255,106,0,.5), transparent 60%),linear-gradient(135deg,#0b1f3a,#15335e 55%,#0e1f3d)`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const icon = async (size, pad, file) => {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0"><div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${BG(size)}"><div style="width:${size-2*pad}px;height:${size-2*pad}px">${lion.replace('<svg', '<svg width="100%" height="100%"')}</div></div></body></html>`);
    await p.screenshot({ path: R('public', file) });
  };
  await icon(192, 18, 'icon-192.png'); await icon(512, 48, 'icon-512.png');
  await icon(512, 110, 'icon-maskable-512.png'); await icon(180, 16, 'apple-touch-icon.png');
  const [a, bb] = site.brandSplit;
  const t = (bg, txt, ar) => `<div class="t" style="background:${bg}"><b>${txt}</b>${ar ? `<i>${ar}</i>` : ''}</div>`;
  const row1 = [t('#2bd67b','AJA'), t('#2bd67b','MID'), t('#ffd23f','8,4','▲'), t('#3b4a63','12.1%','▲'), t('#ffd23f','61','▲'), t('#3b4a63','2','▲')].join('');
  const row2 = [t('#2bd67b','AJA'), t('#2bd67b','MID'), t('#2bd67b','9,0'), t('#2bd67b','28.4%'), t('#2bd67b','68'), t('#2bd67b','9')].join('');
  await p.setViewportSize({ width: 1200, height: 630 });
  await p.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:"Plus Jakarta Sans",system-ui,sans-serif;background:${BG(1200)};color:#fff}
    .wrap{position:absolute;left:80px;top:80px;width:720px} h1{margin:0;font-size:100px;font-weight:800;letter-spacing:-.03em;line-height:1}
    h1 span{background:linear-gradient(90deg,#ff6a00,#ffb703);-webkit-background-clip:text;background-clip:text;color:transparent}
    p{margin:20px 0 44px;font-size:36px;font-weight:600;opacity:.9} .g{display:grid;grid-template-columns:repeat(6,96px);gap:12px;margin-bottom:12px}
    .t{height:84px;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:800;font-size:28px;color:#0b1f3a;box-shadow:0 4px 0 rgba(0,0,0,.25)}
    .t[style*="#3b4a63"]{color:#fff} .t i{font-style:normal;font-size:18px} .lion{position:absolute;right:70px;top:150px}
    .foot{position:absolute;right:80px;bottom:46px;font-size:24px;font-weight:700;opacity:.75}</style></head>
    <body><div class="wrap"><h1>${a}<span>${bb}</span></h1><p>${site.tagline[0].toUpperCase()+site.tagline.slice(1)}</p><div class="g">${row1}</div><div class="g">${row2}</div></div>
    <div class="lion">${lion.replace('<svg', '<svg width="300" height="300"')}</div><div class="foot">Raad de speler in 6 pogingen</div></body></html>`);
  await p.screenshot({ path: R('public', 'og.jpg'), type: 'jpeg', quality: 86 });
  await b.close(); console.log('iconen en og.jpg gemaakt');
})();
