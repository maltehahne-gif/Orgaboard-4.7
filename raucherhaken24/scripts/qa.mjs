/**
 * Browser-Abnahme: klickt die wichtigsten Abläufe durch und prüft auf
 * Konsolenfehler, tote Interaktionen und horizontales Überlaufen.
 *
 *   npm run build && npm run preview   (in einem zweiten Terminal)
 *   npm run qa
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const SHOTS = process.env.SHOT_DIR || 'qa-screenshots';
await mkdir(SHOTS, { recursive: true });
const results = [];
const consoleErrors = [];
function ok(name, pass, detail = '') { results.push({ name, pass, detail }); }

const launchOptions = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
const browser = await chromium.launch(launchOptions);
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(page.url() + ' :: ' + m.text()); });
page.on('pageerror', (e) => consoleErrors.push(page.url() + ' :: PAGEERROR ' + e.message));

async function noOverflow(url, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`kein H-Overflow ${url} @${width}px`, over <= 1, `overflow=${over}px`);
}

/* --- 1. Seiten laden --- */
const pages = ['/', '/shop/', '/kategorie/raeucherhaken/', '/produkt/raeucherhaken-standard/',
  '/raeucherfisch/', '/raeucherfisch/aal/', '/schinken-selber-machen/lachsschinken/',
  '/raeuchermehl/', '/raeuchermehl/buche/', '/raeucherwissen/va-v2a-v4a/',
  '/berater/haken/', '/warenkorb/', '/kasse/', '/konto/', '/haendler/', '/impressum/', '/kontakt/'];
for (const p of pages) {
  const resp = await page.goto(BASE + p, { waitUntil: 'networkidle' });
  ok(`lädt ${p}`, resp.status() === 200, 'status ' + resp.status());
}

/* --- 2. Responsive --- */
for (const w of [375, 768, 1440]) {
  await noOverflow('/', w);
  await noOverflow('/produkt/raeuchermehl-buche/', w);
  await noOverflow('/raeucherwissen/raeucherzeiten/', w);
}
await page.setViewportSize({ width: 1440, height: 950 });

/* --- 3. Warenkorb-Flow --- */
await page.goto(BASE + '/produkt/raeuchermehl-buche/', { waitUntil: 'networkidle' });
await page.selectOption('[data-variant]', 'k1');
await page.click('[data-qty="1"]');
await page.click('.buybox [data-add-to-cart]');
const cartMsg = await page.textContent('[data-cart-status]');
ok('Anfrageliste-Hinweis korrekt', /kein Preis hinterlegt/.test(cartMsg), cartMsg.slice(0, 70));
const badge = await page.textContent('[data-cart-count]');
ok('Warenkorb-Badge zählt', badge === '2', 'badge=' + badge);

await page.goto(BASE + '/produkt/raeucherhaken-standard/', { waitUntil: 'networkidle' });
await page.click('.buybox [data-add-to-cart]');
await page.goto(BASE + '/warenkorb/', { waitUntil: 'networkidle' });
const lines = await page.locator('[data-line]').count();
ok('Warenkorb zeigt 2 Positionen', lines === 2, 'lines=' + lines);
const subtotal = await page.textContent('[data-sum-subtotal]');
const shipping = await page.textContent('[data-sum-shipping]');
ok('Versandkosten ehrlich als offen markiert', /noch nicht hinterlegt/.test(shipping), shipping);
ok('Zwischensumme 0 ohne Preise', subtotal.trim() === '0,00 €', subtotal);

await page.locator('[data-line]').first().locator('[data-line-qty="1"]').click();
const qtyNow = await page.locator('[data-line]').first().locator('[data-line-input]').inputValue();
ok('Menge erhöhen funktioniert', qtyNow === '3', 'qty=' + qtyNow);
await page.locator('[data-line]').first().locator('[data-line-remove]').click();
ok('Entfernen funktioniert', (await page.locator('[data-line]').count()) === 1);

/* --- Gutschein --- */
await page.fill('#voucher', 'TESTCODE');
await page.click('[data-voucher-form] button[type=submit]');
const vStatus = await page.textContent('[data-voucher-status]');
ok('Unbekannter Gutschein wird korrekt abgelehnt', /nicht hinterlegt/.test(vStatus), vStatus.slice(0, 60));

/* --- 4. Checkout-Validierung --- */
await page.goto(BASE + '/kasse/', { waitUntil: 'networkidle' });
await page.click('[data-checkout-form] button[type=submit]');
let coStatus = await page.textContent('[data-checkout-status]');
ok('Checkout meldet Pflichtfelder', /markierten Felder/.test(coStatus), coStatus.slice(0, 60));
await page.fill('#co-email', 'test@example.com');
await page.fill('#co-first', 'Max'); await page.fill('#co-last', 'Muster');
await page.fill('#co-street', 'Musterweg 1'); await page.fill('#co-zip', '99084'); await page.fill('#co-city', 'Erfurt');
await page.check('#co-terms');
await page.click('[data-checkout-form] button[type=submit]');
coStatus = await page.textContent('[data-checkout-status]');
ok('Checkout täuscht keine Bestellung vor', /noch nicht übermittelt/.test(coStatus), coStatus.slice(0, 80));

/* --- 5. Berater-Wizard --- */
await page.goto(BASE + '/berater/haken/', { waitUntil: 'networkidle' });
await page.click('[data-value="ganzfisch"]');
await page.click('[data-value="schwer"]');
await page.click('[data-value="salz"]');
const reco = await page.textContent('.result-head h3');
ok('Haken-Berater liefert 3-Dorn bei schwerem Fisch', /3-Dorn/.test(reco), reco);
const mat = await page.textContent('.reco .pick');
ok('Materialempfehlung V4A bei Salz', mat.trim() === 'V4A', mat);
const recoProducts = await page.locator('.advisor-result .product-card').count();
ok('Berater zeigt echte Produktkarten', recoProducts >= 1, 'cards=' + recoProducts);
await page.screenshot({ path: SHOTS + '/berater-ergebnis.png', fullPage: false });

await page.goto(BASE + '/berater/raeuchermehl/', { waitUntil: 'networkidle' });
await page.click('[data-value="kaese"]');
await page.click('[data-value="kalt"]');
const recoM = await page.textContent('.result-head h3');
ok('Räuchermehl-Berater: Käse → Kirsche/Buche K1', /Kirsche|Buche/.test(recoM) && /Körnung 1/.test(recoM), recoM);

/* --- 6. KI-Berater Chat --- */
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.click('#ai-launcher');
ok('Chat öffnet', await page.locator('#ai-panel.is-open').isVisible());
await page.fill('#ai-input', 'Welchen Haken brauche ich für eine 2,5 kg Forelle?');
await page.click('.ai-send');
await page.waitForTimeout(300);
let last = await page.locator('.ai-msg.bot').last().textContent();
ok('Chat: Gewichtsfrage → Doppeldorn', /Doppeldorn|Kilogramm/.test(last), last.slice(0, 90));

await page.fill('#ai-input', 'Was ist der Unterschied zwischen V2A und V4A?');
await page.click('.ai-send'); await page.waitForTimeout(250);
last = await page.locator('.ai-msg.bot').last().textContent();
ok('Chat: V2A/V4A erklärt', /Molybdän/.test(last), last.slice(0, 70));

await page.fill('#ai-input', 'Welche Körnung brauche ich für meine Räucherschnecke?');
await page.click('.ai-send'); await page.waitForTimeout(250);
last = await page.locator('.ai-msg.bot').last().textContent();
ok('Chat: Räucherschnecke → Körnung 1', /Körnung 1/.test(last), last.slice(0, 70));

await page.fill('#ai-input', 'Was kostet ein Räucherhaken?');
await page.click('.ai-send'); await page.waitForTimeout(250);
last = await page.locator('.ai-msg.bot').last().textContent();
ok('Chat erfindet keine Preise', /keine Preise gepflegt|keine geschätzten/.test(last), last.slice(0, 80));

await page.fill('#ai-input', 'Ich möchte Lachsschinken machen. Was brauche ich?');
await page.click('.ai-send'); await page.waitForTimeout(250);
last = await page.locator('.ai-msg.bot').last().textContent();
ok('Chat: Lachsschinken + Packungshinweis', /Lachsschinken/.test(last) && /Packung/.test(last), last.slice(0, 90));
const chatCards = await page.locator('.ai-msg.bot .ai-product').count();
ok('Chat zeigt echte Produkte', chatCards > 0, 'cards=' + chatCards);
await page.screenshot({ path: SHOTS + '/chat.png' });

/* --- 7. Suche --- */
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.fill('#site-search', 'aal');
await page.waitForTimeout(200);
const hits = await page.locator('#search-results a').count();
ok('Suche liefert Treffer für "aal"', hits > 0, 'hits=' + hits);

/* --- 8. Galerie-Zoom --- */
await page.goto(BASE + '/produkt/raeucherhaken-doppeldorn/', { waitUntil: 'networkidle' });
await page.click('#gallery-main');
ok('Zoom aktivierbar', await page.locator('#gallery-main.is-zoomed').count() === 1);
const fit = await page.evaluate(() => getComputedStyle(document.querySelector('#gallery-img')).objectFit);
ok('Produktbild wird nicht beschnitten (contain)', fit === 'contain', 'object-fit=' + fit);

/* --- 9. Mobile Navigation --- */
await page.setViewportSize({ width: 375, height: 780 });
await page.goto(BASE + '/kategorie/raeuchermehl/', { waitUntil: 'networkidle' });
ok('Kategorie-Drawer geschlossen auf Mobil', !(await page.locator('#catnav').isVisible()));
await page.click('.catnav-drawer-toggle');
ok('Kategorie-Drawer öffnet', await page.locator('#catnav.is-open').isVisible());
await page.click('.nav-toggle');
ok('Hauptmenü öffnet', await page.locator('#mainnav.is-open ul').isVisible());
await page.screenshot({ path: SHOTS + '/mobil-kategorie.png', fullPage: false });

/* --- 10. Screenshots Desktop --- */
await page.setViewportSize({ width: 1440, height: 950 });
for (const [url, name] of [['/', 'startseite'], ['/produkt/raeucherhaken-standard/', 'produktseite'],
  ['/kategorie/raeucherhaken/', 'kategorie'], ['/raeucherwissen/va-v2a-v4a/', 'wissen-v2a']]) {
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log('\n=== QA-ERGEBNIS ===');
results.forEach((r) => console.log((r.pass ? '  ok  ' : '  FAIL') + ' ' + r.name + (r.pass ? '' : '  → ' + r.detail)));
console.log(`\n${results.length - failed.length}/${results.length} bestanden`);
console.log('Konsolenfehler: ' + consoleErrors.length);
consoleErrors.slice(0, 10).forEach((e) => console.log('   ' + e));
process.exit(failed.length ? 1 : 0);
