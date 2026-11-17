// Браузерный смоук-тест: реальный Chrome (headless), клики/клавиши, скриншоты, замер FPS.
import { chromium } from 'playwright-core';

const OUT = process.argv[2] ?? '/tmp/claude-501/shots';
const URL = process.argv[3] ?? 'http://localhost:5173/';
const errors = [];
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(URL);
await page.waitForTimeout(500);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const g = (fn) => page.evaluate(fn);

await shot('01-menu');
// выбор персонажа кликом и старт
await page.mouse.click(60 + 310 + 100, 155 + 60); // Pyromancer
await page.waitForTimeout(100);
console.log('selected', await g(() => window.__game.selected));
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
console.log('scene', await g(() => window.__game.scene), 'phase', await g(() => window.__game.run?.phase));

// играем: движение клавишами
await page.keyboard.down('KeyD');
await page.waitForTimeout(1500);
await page.keyboard.up('KeyD');
await page.keyboard.down('KeyS');
await page.waitForTimeout(1200);
await page.keyboard.up('KeyS');
await shot('02-wave1');
console.log('kills', await g(() => window.__game.run.sim.kills), 'enemies', await g(() => window.__game.run.sim.enemies.length),
  'player', await g(() => { const p = window.__game.run.sim.player; return [Math.round(p.x), Math.round(p.y)].join(','); }));

// принудительный level-up → карточки
await g(() => { const r = window.__game.run; r.gainFromCrystal ? 0 : 0; r.xp = r.xpNeeded + 1; r.gainFromCrystal(0); });
await page.waitForTimeout(200);
console.log('phase after xp', await g(() => window.__game.run.phase));
await shot('03-levelup');
const lvBefore = await g(() => window.__game.run.picked.length);
await page.keyboard.press('Digit2');
await page.waitForTimeout(200);
console.log('picked', lvBefore, '->', await g(() => window.__game.run.picked.length), 'phase', await g(() => window.__game.run.phase));

// пауза
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
await page.mouse.move(150, 160);
await page.waitForTimeout(100);
await shot('04-pause');
console.log('scene', await g(() => window.__game.scene));
await page.keyboard.press('Escape');
await page.waitForTimeout(100);

// быстро завершаем волну → магазин
await g(() => { const r = window.__game.run; r.waveTime = r.waveDur - 0.05; r.credits = 300; });
await page.waitForTimeout(600);
console.log('phase', await g(() => window.__game.run.phase));
await shot('05-shop');
// покупка кликом по кнопке BUY первой карточки
const before = await g(() => window.__game.run.credits);
await page.mouse.click(40 + 12 + 130, 72 + 232 - 46 + 17);
await page.waitForTimeout(150);
console.log('credits', Math.round(before), '->', Math.round(await g(() => window.__game.run.credits)), 'sold0', await g(() => window.__game.run.offers[0].sold));
await page.mouse.move(800, 380);
await page.waitForTimeout(100);
await shot('06-shop-tooltip');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
console.log('wave', await g(() => window.__game.run.wave), 'phase', await g(() => window.__game.run.phase));

// стресс-тест: 340 врагов + лужи + реакции, замер кадров
await g(() => {
  const sim = window.__game.run.sim;
  window.__game.run.waveTime = 0;
  for (let i = 0; i < 330; i++) sim.spawnEnemy(['drone','swarmer','brute','dasher','shooter'][i % 5], 100 + Math.random() * 1000, 80 + Math.random() * 560);
  for (let i = 0; i < 20; i++) sim.addZone(i % 2 ? 'oil' : 'water', 100 + Math.random() * 1000, 80 + Math.random() * 560, 50, 8);
  for (const e of sim.enemies) { e.hp = e.maxHp = 5000; }
  window.__game.run.sim.applyMods('dbg', 'dbg', [{ stat: 'attackSpeed', op: 'add', value: 150 }]);
});
const fps = await g(() => new Promise((res) => {
  let n = 0; const t0 = performance.now(); const times = [];
  let last = t0;
  function f(now) { times.push(now - last); last = now; n++; if (now - t0 > 3000) res({ frames: n, avgMs: (now - t0) / n, worst: Math.max(...times.slice(5)) }); else requestAnimationFrame(f); }
  requestAnimationFrame(f);
}));
console.log('stress', JSON.stringify(fps), 'enemies', await g(() => window.__game.run.sim.enemies.length));
await shot('07-stress');

// смерть → экран конца
await g(() => { window.__game.run.sim.player.hp = 0.01; window.__game.run.sim.hurtPlayer(999); });
await page.waitForTimeout(400);
await shot('08-gameover');
console.log('phase', await g(() => window.__game.run.phase), 'best', await g(() => JSON.stringify(window.__game.best)));
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
console.log('scene', await g(() => window.__game.scene));
await shot('09-menu-after');

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE ERRORS');
await browser.close();
