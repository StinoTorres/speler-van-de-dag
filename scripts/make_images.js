// Maakt de app-iconen en het linkvoorbeeld (og.jpg) opnieuw, in de kleuren en naam uit site.json.
// Gebruik: node scripts/make_images.js   (na python3 build.py, want het gebruikt public/favicon.svg)
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const R = (...a) => path.join(__dirname, '..', ...a);
const site = JSON.parse(fs.readFileSync(R('site.json'), 'utf8'));
const logo = fs.readFileSync(R('src', 'logo.svg'), 'utf8');
const BG = (s) => `radial-gradient(${s*0.9}px ${s*0.6}px at 100% 0%, rgba(167,246,255,.45), transparent 60%),radial-gradient(${s*0.9}px ${s*0.7}px at 0% 100%, rgba(236,24,70,.5), transparent 60%),linear-gradient(135deg,#610f8a,#7d1a92 55%,#4a0a6b)`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const icon = async (size, pad, file) => {
    await p.setViewportSize({ width: size, height: size });
    const inner = logo.replace('<rect width="64" height="64" rx="14" fill="#610f8a"/>', '').replace('<svg', '<svg width="100%" height="100%"');
    await p.setContent(`<html><body style="margin:0;background:#610f8a"><div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${BG(size)}"><div style="width:${size-2*pad}px;height:${size-2*pad}px">${inner}</div></div></body></html>`);
    await p.screenshot({ path: R('public', file) });
  };
  await icon(192, 18, 'icon-192.png'); await icon(512, 48, 'icon-512.png');
  await icon(512, 110, 'icon-maskable-512.png'); await icon(180, 16, 'apple-touch-icon.png');
  const [a, bb] = site.brandSplit;
  const t = (bg, txt, ar) => `<div class="t" style="background:${bg}"><b>${txt}</b>${ar ? `<i>${ar}</i>` : ''}</div>`;
  const row1 = [t('#00ff87','AJA'), t('#00ff87','MID'), t('#ffd600','8,4','▲'), t('#4a1866','12.1%','▲'), t('#ffd600','61','▲'), t('#4a1866','2','▲')].join('');
  const row2 = [t('#00ff87','AJA'), t('#00ff87','MID'), t('#00ff87','9,0'), t('#00ff87','28.4%'), t('#00ff87','68'), t('#00ff87','9')].join('');
  await p.setViewportSize({ width: 1200, height: 630 });
  await p.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:Inter,system-ui,sans-serif;background:${BG(1200)};color:#fff}
    .wrap{position:absolute;left:80px;top:80px;width:720px} h1{margin:0;font-size:100px;font-weight:800;letter-spacing:-.03em;line-height:1}
    h1 span{background:linear-gradient(90deg,#a7f6ff,#00ff87);-webkit-background-clip:text;background-clip:text;color:transparent}
    p{margin:20px 0 44px;font-size:36px;font-weight:600;opacity:.9} .g{display:grid;grid-template-columns:repeat(6,96px);gap:12px;margin-bottom:12px}
    .t{height:84px;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:800;font-size:28px;color:#610f8a;box-shadow:0 4px 0 rgba(0,0,0,.25)}
    .t[style*="#4a1866"]{color:#fff} .t i{font-style:normal;font-size:18px} .logo{position:absolute;right:90px;top:165px;filter:drop-shadow(0 18px 30px rgba(0,0,0,.3))}
    .foot{position:absolute;right:80px;bottom:46px;font-size:24px;font-weight:700;opacity:.75}</style></head>
    <body><div class="wrap"><h1>${a}<span>${bb}</span></h1><p>${site.tagline[0].toUpperCase()+site.tagline.slice(1)}</p><div class="g">${row1}</div><div class="g">${row2}</div></div>
    <div class="logo">${logo.replace('<svg', '<svg width="270" height="270"')}</div><div class="foot">Raad de speler in 6 pogingen</div></body></html>`);
  await p.screenshot({ path: R('public', 'og.jpg'), type: 'jpeg', quality: 86 });
  await b.close(); console.log('iconen en og.jpg gemaakt');
})();
