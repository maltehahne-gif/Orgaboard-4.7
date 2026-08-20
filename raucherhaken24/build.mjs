/**
 * Statischer Seitengenerator für Räucherhaken24.
 * Ohne Framework, ohne externe Abhängigkeiten: Daten rein, fertige HTML-Seiten raus.
 *
 *   node build.mjs      -> schreibt nach dist/
 */

import { mkdir, writeFile, readdir, copyFile, stat, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderPage } from './src/templates/layout.mjs';
import { productImage, PLACEHOLDER_IMG, knowledgeHref } from './src/templates/components.mjs';

import { site, commerce } from './src/data/site.mjs';
import { categories } from './src/data/categories.mjs';
import { products, grains, materials, getProduct } from './src/data/catalog.mjs';
import { fishes } from './src/data/fish.mjs';
import { hams } from './src/data/hams.mjs';
import { woods } from './src/data/woods.mjs';
import { articles } from './src/data/knowledge.mjs';

import { homePage } from './src/templates/pages/home.mjs';
import { shopPage, categoryPage, subCategoryPage } from './src/templates/pages/shop.mjs';
import { productPage } from './src/templates/pages/product.mjs';
import { fishHubPage, fishPage, hamHubPage, hamPage, woodHubPage, woodPage } from './src/templates/pages/guides.mjs';
import { knowledgeHubPage, articlePage } from './src/templates/pages/articles.mjs';
import { advisorHubPage, advisorPage } from './src/templates/pages/advisor.mjs';
import { cartPage, checkoutPage } from './src/templates/pages/shopflow.mjs';
import { accountPage, passwordResetPage, dealerPage } from './src/templates/pages/account.mjs';
import {
  imprintPage, privacyPage, termsPage, withdrawalPage, shippingPage, contactPage,
} from './src/templates/pages/legal.mjs';
import { notFoundPage, searchPage } from './src/templates/pages/misc.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');

/* ------------------------------ Seitenliste ------------------------------ */

export function collectPages() {
  const pages = [homePage(), shopPage()];

  categories.forEach((cat) => {
    pages.push(categoryPage(cat));
    cat.children.forEach((sub) => pages.push(subCategoryPage(cat, sub)));
  });

  products.forEach((p) => pages.push(productPage(p)));

  pages.push(fishHubPage());
  fishes.forEach((f) => pages.push(fishPage(f)));

  pages.push(hamHubPage());
  hams.forEach((h) => pages.push(hamPage(h)));

  pages.push(woodHubPage());
  woods.forEach((w) => pages.push(woodPage(w)));

  pages.push(knowledgeHubPage());
  articles.forEach((a) => pages.push(articlePage(a)));

  pages.push(advisorHubPage(), advisorPage('raeuchermehl'), advisorPage('haken'));
  pages.push(cartPage(), checkoutPage());
  pages.push(accountPage(), passwordResetPage(), dealerPage());
  pages.push(imprintPage(), privacyPage(), termsPage(), withdrawalPage(), shippingPage(), contactPage());
  pages.push(searchPage(), notFoundPage());

  return pages;
}

/* ------------------------- Daten für das Frontend ------------------------ */

function buildSiteData() {
  const clientProducts = products.map((p) => ({
    slug: p.slug,
    name: p.name,
    short: p.short,
    url: `/produkt/${p.slug}/`,
    img: productImage(p),
    category: p.category,
    tags: p.tags || [],
    price: typeof p.price === 'number' ? p.price : null,
  }));

  const index = [];
  const push = (t, u, k, extra = '') => index.push({ t, u, k, s: `${t} ${extra}`.toLowerCase() });

  products.forEach((p) => push(p.name, `/produkt/${p.slug}/`, 'Produkt', `${p.short} ${(p.tags || []).join(' ')}`));
  categories.forEach((c) => {
    push(c.label, `/kategorie/${c.slug}/`, 'Kategorie', c.intro);
    c.children.forEach((s) => push(s.label, `/kategorie/${c.slug}/${s.slug}/`, 'Kategorie'));
  });
  fishes.forEach((f) => push(`${f.name} räuchern`, `/raeucherfisch/${f.slug}/`, 'Räucherfisch', `${f.teaser} ${f.method}`));
  hams.forEach((h) => push(h.name, `/schinken-selber-machen/${h.slug}/`, 'Schinken', h.teaser));
  woods.forEach((w) => push(`Räuchermehl ${w.name}`, `/raeuchermehl/${w.slug}/`, 'Räuchermehl', `${w.teaser} ${w.aroma}`));
  articles.forEach((a) => push(a.title, `/raeucherwissen/${a.slug}/`, 'Wissen', a.lead));
  [
    ['Räuchermehl-Berater', '/berater/raeuchermehl/'],
    ['Haken-Berater', '/berater/haken/'],
    ['Warenkorb', '/warenkorb/'],
    ['Kundenkonto', '/konto/'],
    ['Händlerbereich', '/haendler/'],
    ['Kontakt', '/kontakt/'],
    ['Zahlung & Versand', '/zahlung-versand/'],
  ].forEach(([t, u]) => push(t, u, 'Service'));

  const data = {
    config: {
      currencySymbol: commerce.currencySymbol,
      vatNote: commerce.vatRateNote,
      shipping: {
        flatRate: commerce.shipping.flatRate,
        freeFrom: commerce.shipping.freeFrom,
        note: commerce.shipping.note,
      },
      vouchers: commerce.vouchers,
      placeholder: PLACEHOLDER_IMG,
    },
    products: clientProducts,
    index,
    advice: {
      fish: fishes.map((f) => ({
        slug: f.slug, name: f.name, method: f.method, level: f.level,
        brine: f.brine, saltTime: f.saltTime, temperature: f.temperature,
        duration: f.duration, coreTemp: f.coreTemp,
        hook: f.hook, wood: f.wood, woodNote: f.woodNote,
        url: `/raeucherfisch/${f.slug}/`,
      })),
      hams: hams.map((h) => ({
        slug: h.slug, name: h.name, level: h.level, cut: h.cut, smoked: h.smoked,
        mixture: h.mixture, products: h.products, url: `/schinken-selber-machen/${h.slug}/`,
      })),
      woods: woods.map((w) => ({
        slug: w.slug, name: w.name, teaser: w.teaser, aroma: w.aroma,
        intensity: w.intensity, url: `/raeuchermehl/${w.slug}/`, product: w.product,
      })),
      grains: grains.map((g) => ({ id: g.id, label: g.label, text: g.text, best: g.best })),
      materials: { v2a: materials.v2a.summary, v4a: materials.v4a.summary, va: materials.va.summary },
      articles: articles.map((a) => ({ slug: a.slug, title: a.title, url: knowledgeHref(a.slug) })),
    },
  };

  return `/* Automatisch erzeugt von build.mjs - nicht von Hand bearbeiten. */\nwindow.RH24=${JSON.stringify(data)};\n`;
}

/* -------------------------------- Ausgabe -------------------------------- */

async function copyDir(from, to) {
  await mkdir(to, { recursive: true });
  const entries = await readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const src = join(from, entry.name);
    const dest = join(to, entry.name);
    if (entry.isDirectory()) await copyDir(src, dest);
    else await copyFile(src, dest);
  }
}

function sitemap(pages) {
  const urls = pages
    .filter((p) => !p.noindex && !p.rawPath)
    .map((p) => {
      const priority = p.path === '/' ? '1.0' : p.path.split('/').filter(Boolean).length <= 1 ? '0.8' : '0.6';
      return `  <url><loc>${site.baseUrl}${p.path}</loc><changefreq>weekly</changefreq><priority>${priority}</priority></url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function robots() {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /warenkorb/',
    'Disallow: /kasse/',
    'Disallow: /konto/',
    'Disallow: /suche/',
    '',
    `Sitemap: ${site.baseUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

export async function build({ quiet = false } = {}) {
  const log = quiet ? () => {} : (...a) => console.log(...a);

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  const pages = collectPages();

  // Doppelte Pfade würden Seiten überschreiben - hart abbrechen.
  const seen = new Set();
  for (const p of pages) {
    if (seen.has(p.path)) throw new Error(`Doppelter Seitenpfad: ${p.path}`);
    seen.add(p.path);
  }

  for (const page of pages) {
    const html = renderPage(page);
    const target = page.rawPath
      ? join(DIST, page.path.replace(/^\//, ''))
      : join(DIST, page.path.replace(/^\//, ''), 'index.html');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html, 'utf8');
  }
  log(`  ${pages.length} Seiten erzeugt`);

  await copyDir(join(ROOT, 'src', 'assets'), join(DIST, 'assets'));
  await writeFile(join(DIST, 'assets', 'js', 'site-data.js'), buildSiteData(), 'utf8');
  await writeFile(join(DIST, 'sitemap.xml'), sitemap(pages), 'utf8');
  await writeFile(join(DIST, 'robots.txt'), robots(), 'utf8');
  log('  Assets, site-data.js, sitemap.xml und robots.txt geschrieben');

  return pages;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build.mjs')) {
  console.log('Räucherhaken24 – Build');
  const started = Date.now();
  build()
    .then((pages) => {
      console.log(`  Fertig in ${Date.now() - started} ms → dist/`);
      const withPrice = products.filter((p) => typeof p.price === 'number').length;
      if (withPrice === 0) {
        console.log(`  Hinweis: 0 von ${products.length} Produkten haben einen gepflegten Preis (siehe src/data/catalog.mjs).`);
      }
    })
    .catch((err) => {
      console.error('Build fehlgeschlagen:', err);
      process.exit(1);
    });
}
