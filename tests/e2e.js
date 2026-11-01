// End-to-end test met Playwright tegen de lokale testserver (tests/fake_supabase.js).
// Gebruik: zie tests/README.md. Schermafbeeldingen komen in tests/out/ (staat in .gitignore).
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const URL = process.env.BASE_URL || 'http://localhost:8790/';
const PG = ['-h', process.env.PGHOST || '/tmp/pg', '-p', process.env.PGPORT || '5544', '-U', process.env.PGUSER || 'postgres', '-d', process.env.PGDATABASE || 'nl'];
const psql = s => execFileSync('psql', [...PG, '-At', '-c', s], { encoding: 'utf8' }).trim();
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const ok = [], bad = [];
const check = (name, cond, extra = '') => (cond ? ok : bad).push(name + (extra ? ' (' + extra + ')' : ''));

(async () => {
  const answer = psql("select web from dn_stats where code = dn_answer(dn_today())");
  const wrong = psql("select web from dn_stats where code <> dn_answer(dn_today()) and pts > 0 order by own desc limit 1");
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 2 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(900);

  // profiel
  await p.fill('.modal input', 'E2E Tester'); await p.click('.modal .btn'); await p.waitForTimeout(1200);
  check('profiel aangemaakt', await p.evaluate(() => !!(S.me && S.me.name === 'E2E Tester')));
  check('advertentieplek zichtbaar (placeholder)', await p.isVisible('#ad-bottom'));
  check('footer met privacylink', await p.isVisible('.foot a[href="privacy.html"]'));

  // foute gok, daarna hints
  await p.fill('.searchbox input', wrong); await p.waitForTimeout(300); await p.keyboard.press('Enter'); await p.waitForTimeout(3000);
  check('foute gok verwerkt', (await p.$$('.guess:not(.empty)')).length === 1);
  await p.click('.hint'); await p.waitForTimeout(800);
  const h1 = await p.textContent('.hint');
  check('hint 1: goals en assists', /goals? en \d+ assists?/.test(h1), h1.replace(/\s+/g, ' ').slice(0, 80));
  await p.click('.hint'); await p.waitForTimeout(800);
  const h2 = await p.textContent('.hint');
  check('hint 2: eerste letter', /begint met een [A-Z]/.test(h2));
  await p.screenshot({ path: path.join(OUT, '1-hints.png'), fullPage: true });

  // goede gok: eerst tegels, dan pop-up, dan pas het scorescherm
  await p.fill('.searchbox input', answer); await p.waitForTimeout(300); await p.keyboard.press('Enter');
  await p.waitForTimeout(1200);
  check('tijdens omdraaien nog geen pop-up of score', !(await p.$('.modal .proud')) && !(await p.$('.result')));
  await p.waitForTimeout(2000);
  check('pop-up na de tegels', !!(await p.$('.modal .proud')));
  await p.screenshot({ path: path.join(OUT, '2-popup.png') });
  await p.click('text=Dank je'); await p.waitForTimeout(600);
  check('scorescherm na sluiten', !!(await p.$('.result')));
  const pts = await p.evaluate(() => S.srv.points);
  check('punten = 70 - 10*2 - 5*2 = 40', pts === 40, 'kreeg ' + pts);
  await p.click('text=Deel resultaat'); await p.waitForTimeout(300);
  const share = await p.evaluate(() => navigator.clipboard.readText());
  check('deeltekst met merk en 2/6', /#\d+/.test(share) && /2\/6/.test(share), share.split('\n')[1]);

  // poule
  await p.click('nav button[data-tab=board]'); await p.waitForTimeout(400);
  await p.fill('input[placeholder^="Naam, bijv"]', 'Testpoule'); await p.click('text=Maak aan'); await p.waitForTimeout(1500);
  await p.click('.modal .btn.ghost').catch(() => {}); await p.waitForTimeout(400);
  check('poule-klassement zichtbaar', /Testpoule/.test(await p.textContent('#view')) && !!(await p.$('table.board')));
  const allBoard = await p.evaluate(async () => { try { await rpc('dn_board', { ...auth(), p_scope: 'ALL' }); return 'open'; } catch (e) { return 'dicht'; } });
  check('geen openbare ranglijst via de server', allBoard === 'dicht');

  // beveiliging: publieke sleutel kan niet bij tabellen of beheerfuncties
  const adm = await p.evaluate(async () => { try { await rpc('dn_admin_load', { p_rows: [], p_meta: null }); return 'open'; } catch (e) { return 'dicht'; } });
  check('beheerfunctie dicht voor publiek', adm === 'dicht');
  const ans = await p.evaluate(async () => { try { await rpc('dn_answer', { p_day: 1 }); return 'open'; } catch (e) { return 'dicht'; } });
  check('antwoordfunctie dicht voor publiek', ans === 'dicht');

  // telefoonbreedtes zonder horizontaal scrollen
  for (const w of [320, 375, 414]) {
    await p.setViewportSize({ width: w, height: 800 });
    for (const tab of ['play', 'board', 'me']) {
      await p.click(`nav button[data-tab=${tab}]`); await p.waitForTimeout(250);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (over > 0) bad.push(`horizontaal scrollen op ${w}px (${tab}): ${over}px`);
    }
  }
  ok.push('telefoonbreedtes 320/375/414 gecontroleerd');

  // privacypagina
  const pr = await b.newPage(); await pr.goto(URL + 'privacy.html');
  check('privacypagina laadt', /Privacy/.test(await pr.textContent('h1')));

  check('geen JavaScript-fouten', errs.length === 0, errs.join(' | '));
  await b.close();
  psql("delete from dn_leagues where name = 'Testpoule'; delete from dn_players where name = 'E2E Tester'");
  console.log('GOED:\n  ' + ok.join('\n  '));
  console.log(bad.length ? 'FOUT:\n  ' + bad.join('\n  ') : 'Alle controles geslaagd.');
  process.exit(bad.length ? 1 : 0);
})();
