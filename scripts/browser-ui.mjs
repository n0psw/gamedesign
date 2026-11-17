// UI-механики в реальном Chrome: слияние оружия, реролл, пауза → выход, retry, звук/цифры, выбор персонажей.
import { chromium } from 'playwright-core';
const errors = [];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.argv[2] ?? 'http://localhost:5173/');
await page.waitForFunction(() => window.__game);
const g = (fn, arg) => page.evaluate(fn, arg);
const press = async (k) => { await page.keyboard.press(k); await page.waitForTimeout(70); };
const click = async (x, y) => { await page.mouse.click(x, y); await page.waitForTimeout(70); };
let fails = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) fails++; };

// 1. выбор каждого персонажа клавишей и кликом
for (let i = 0; i < 4; i++) { await press(`Digit${i + 1}`); check(`select ${i + 1}`, (await g(() => window.__game.selected)) === i); }
await click(60 + 100, 155 + 60);
check('click char 0', (await g(() => window.__game.selected)) === 0);
await click(60 + 310 + 100, 155 + 175 + 60);
check('click char 3', (await g(() => window.__game.selected)) === 3);

// 2. старт кнопкой
await click(300, 545);
await page.waitForTimeout(150);
check('start by button', (await g(() => window.__game.scene)) === 'run');
check('cryo weapons', (await g(() => window.__game.run.sim.weapons.map((w) => w.id).join())) === 'frost,pulse');

// 3. звук и цифры
await press('KeyM'); check('mute toggle', await g(() => window.__game.sfx.muted));
await press('KeyM');
await press('KeyN'); check('numbers toggle', !(await g(() => window.__game.run.sim.showNumbers)));
await press('KeyN');

// 4. пауза → продолжить кнопкой → пауза → выход в меню клавишей Q
await press('Escape'); await page.waitForTimeout(100);
check('pause', (await g(() => window.__game.scene)) === 'paused');
const t0 = await g(() => window.__game.run.waveTime); await page.waitForTimeout(300);
check('time frozen in pause', (await g(() => window.__game.run.waveTime)) === t0);
await click(480, 660); await page.waitForTimeout(100);
check('resume by click', (await g(() => window.__game.scene)) === 'run');
await press('Escape'); await press('KeyQ'); await page.waitForTimeout(100);
check('quit to menu', (await g(() => window.__game.scene)) === 'menu');

// 5. магазин: слияние, реролл, покупка клавишей
await press('Digit1'); await press('Enter'); await page.waitForTimeout(100);
await g(() => { const r = window.__game.run; r.sim.addWeapon('pulse'); r.credits = 500; r.waveTime = r.waveDur - 0.02; });
await page.waitForTimeout(500);
while (await g(() => window.__game.run.phase) === 'levelup') await press('Digit1'), await page.waitForTimeout(100);
check('shop opened', (await g(() => window.__game.run.phase)) === 'shop');
check('merge pair exists', (await g(() => window.__game.run.mergeablePairs().length)) === 1);
await page.waitForTimeout(100);
await click(54 + 20, 322 + 36 + 76 + 10); // кнопка MERGE первого оружия
await page.waitForTimeout(150);
check('merged to T2', (await g(() => window.__game.run.sim.weapons.length === 1 && window.__game.run.sim.weapons[0].tier === 2)));
const c0 = await g(() => window.__game.run.credits);
await press('KeyR'); await page.waitForTimeout(100);
check('reroll by key costs credits', (await g(() => window.__game.run.credits)) < c0);
const c1 = await g(() => window.__game.run.credits);
await click(40 + 100, 640 + 25); await page.waitForTimeout(100);
check('reroll by click', (await g(() => window.__game.run.credits)) < c1);
await g(() => { window.__game.run.credits = 0; });
const w0 = await g(() => window.__game.run.items.length);
await click(40 + 12 + 130, 72 + 232 - 46 + 17); await page.waitForTimeout(100);
check('cannot buy with 0 credits', (await g(() => window.__game.run.items.length)) === w0);
await press('Space'); await page.waitForTimeout(150);
check('space starts next wave', (await g(() => window.__game.run.wave)) === 2 && (await g(() => window.__game.run.phase)) === 'wave');

// 6. смерть → retry по Enter, затем меню по Esc
await g(() => { window.__game.run.sim.player.hp = 0.01; window.__game.run.sim.hurtPlayer(999); });
await page.waitForTimeout(300);
check('gameover', (await g(() => window.__game.run.phase)) === 'gameover');
check('best saved', await g(() => !!window.__game.best['vanguard']));
await press('Enter'); await page.waitForTimeout(150);
check('retry', (await g(() => window.__game.run.phase)) === 'wave' && (await g(() => window.__game.run.wave)) === 1);
await g(() => { window.__game.run.sim.player.hp = 0.01; window.__game.run.sim.hurtPlayer(999); });
await page.waitForTimeout(200);
await press('Escape'); await page.waitForTimeout(100);
check('menu after gameover', (await g(() => window.__game.scene)) === 'menu');

// 7. localStorage рекорды переживают перезагрузку
await page.reload(); await page.waitForFunction(() => window.__game);
check('best persists', await g(() => !!window.__game.best['vanguard']));

check('no console errors', errors.length === 0, errors.join(' | '));
console.log(fails ? `${fails} FAILED` : 'ALL UI CHECKS PASSED');
await browser.close();
process.exit(fails ? 1 : 0);
