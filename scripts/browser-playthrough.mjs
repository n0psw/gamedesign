// Полный забег в настоящем браузере: бот играет через реальные Game/Run/рендер (ускоренно), проверяем что нигде нет исключений.
import { chromium } from 'playwright-core';

const OUT = process.argv[2] ?? '/tmp/claude-501/shots';
const URL = process.argv[3] ?? 'http://localhost:5173/';
const CHAR = Number(process.argv[4] ?? 1);
const errors = [];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(URL);
await page.waitForFunction(() => window.__bot && window.__game);
await page.keyboard.press(`Digit${CHAR + 1}`);
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
// «чит» для скорости: чтобы бот дошёл до босса
await page.evaluate(() => {
  const r = window.__game.run;
  r.sim.applyMods('dbg', 'dbg', [{ stat: 'damage', op: 'add', value: 150 }, { stat: 'maxHp', op: 'add', value: 150 }, { stat: 'armor', op: 'add', value: 3 }]);
});

const shotWaves = new Set([3, 6, 10]);
const shotted = new Set();
let result;
for (let iter = 0; iter < 400; iter++) {
  result = await page.evaluate(() => {
    const g = window.__game, b = window.__bot, ctx = document.getElementById('game').getContext('2d');
    const t0 = performance.now();
    let steps = 0;
    while (performance.now() - t0 < 700) {
      const run = g.run;
      if (!run) break;
      if (run.phase === 'wave') {
        const m = b.botMove(run);
        run.update(1 / 60, m.x, m.y);
        steps++;
        if (steps % 4 === 0) g.render(ctx);
      } else if (run.phase === 'levelup') { g.render(ctx); b.botChooseCard(run, 'smart'); }
      else if (run.phase === 'shop') { g.render(ctx); b.botShop(run, 'smart'); g.render(ctx); run.nextWave(); }
      else { g.update(1 / 60); g.render(ctx); break; }
    }
    const run = g.run;
    return { phase: run.phase, wave: run.wave, time: run.waveTime, kills: run.sim.kills, boss: run.sim.enemies.some((e) => e.type === 'boss'), hp: Math.round(run.sim.player.hp), lvl: run.level };
  });
  if (result.phase === 'wave' && shotWaves.has(result.wave) && result.time > 8 && !shotted.has(result.wave)) {
    shotted.add(result.wave);
    await page.screenshot({ path: `${OUT}/pt-wave${result.wave}.png` });
  }
  if (result.phase === 'victory' || result.phase === 'gameover') break;
}
await page.evaluate(() => { const g = window.__game; g.update(1 / 60); g.render(document.getElementById('game').getContext('2d')); });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/pt-end.png` });
console.log('RESULT', JSON.stringify(result));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE ERRORS');
await browser.close();
