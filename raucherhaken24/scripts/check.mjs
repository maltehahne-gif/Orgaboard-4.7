/**
 * Qualitätssicherung: prüft die erzeugte Seite auf tote Links, fehlende
 * SEO-Angaben, verwaiste Produktverweise und listet alle offenen TODO-Felder auf.
 *
 *   npm run check
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from '../build.mjs';
import { products, getProduct } from '../src/data/catalog.mjs';
import { fishes } from '../src/data/fish.mjs';
import { hams } from '../src/data/hams.mjs';
import { woods } from '../src/data/woods.mjs';
import { advisors } from '../src/data/advisors.mjs';
import { company, commerce, social } from '../src/data/site.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const errors = [];
const warnings = [];
const todos = [];

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

function urlToFile(url) {
  const clean = url.split('#')[0].split('?')[0];
  if (!clean.startsWith('/')) return null;
  if (clean.endsWith('/')) return join(DIST, clean, 'index.html');
  return join(DIST, clean);
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

/* ------------------------------ Datenprüfung ----------------------------- */

function checkProductRefs() {
  const slugs = new Set(products.map((p) => p.slug));
  const ref = (slug, where) => {
    if (slug && !slugs.has(slug)) errors.push(`Unbekannter Produkt-Slug "${slug}" in ${where}`);
  };

  products.forEach((p) => (p.related || []).forEach((r) => ref(r, `catalog: ${p.slug}.related`)));
  fishes.forEach((f) => {
    ref(f.hook, `fish: ${f.slug}.hook`);
    ref(f.wood, `fish: ${f.slug}.wood`);
    (f.products || []).forEach((s) => ref(s, `fish: ${f.slug}.products`));
  });
  hams.forEach((h) => {
    ref(h.mixture, `hams: ${h.slug}.mixture`);
    (h.products || []).forEach((s) => ref(s, `hams: ${h.slug}.products`));
  });
  woods.forEach((w) => ref(w.product, `woods: ${w.slug}.product`));
  Object.values(advisors).forEach((adv) => {
    adv.rules.forEach((r, i) => (r.result.products || []).forEach((s) => ref(s, `advisor ${adv.id}.rules[${i}]`)));
    (adv.fallback.products || []).forEach((s) => ref(s, `advisor ${adv.id}.fallback`));
  });
}

function collectTodos() {
  Object.entries(company).forEach(([k, v]) => {
    if (v === null) todos.push(`Unternehmensdaten: company.${k}`);
  });
  if (commerce.shipping.flatRate === null) todos.push('Versandkosten: commerce.shipping.flatRate');
  if (commerce.shipping.freeFrom === null) todos.push('Versandkostenfrei ab: commerce.shipping.freeFrom');
  if (!commerce.paymentMethods.some((p) => p.enabled)) todos.push('Zahlungsarten: keine aktive Zahlart hinterlegt');
  if (!social.some((s) => s.url)) todos.push('Social Media: keine Profil-URL hinterlegt');

  const noPrice = products.filter((p) => typeof p.price !== 'number');
  if (noPrice.length) todos.push(`Preise: ${noPrice.length} von ${products.length} Produkten ohne Preis`);
  const noImage = products.filter((p) => !p.images || !p.images.length);
  if (noImage.length) todos.push(`Produktfotos: ${noImage.length} von ${products.length} Produkten ohne Bild`);
  const noSpecs = products.filter((p) => p.specs && !p.specs.laenge && !p.specs.staerke && !p.specs.inhalt);
  if (noSpecs.length) todos.push(`Technische Daten: ${noSpecs.length} Produkte ohne Maße/Inhalt`);
}

/* ------------------------------ HTML-Prüfung ----------------------------- */

async function checkHtml() {
  const files = (await walk(DIST)).filter((f) => f.endsWith('.html'));
  const linkCache = new Map();

  for (const file of files) {
    const html = await readFile(file, 'utf8');
    const rel = '/' + relative(DIST, file).replace(/\\/g, '/');

    if (!/<title>[^<]{5,}<\/title>/.test(html)) errors.push(`${rel}: kein sinnvoller <title>`);
    if (!/<meta name="description" content="[^"]{20,}"/.test(html)) errors.push(`${rel}: keine Meta-Description`);
    if (!/rel="canonical"/.test(html)) errors.push(`${rel}: kein Canonical`);
    const h1 = html.match(/<h1[^>]*>/g) || [];
    if (h1.length === 0) errors.push(`${rel}: keine H1`);
    if (h1.length > 1) warnings.push(`${rel}: ${h1.length} H1-Elemente`);
    if (/<img(?![^>]*\balt=)/.test(html)) warnings.push(`${rel}: <img> ohne alt-Attribut`);

    const links = [...html.matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1]);
    for (const link of new Set(links)) {
      if (link.startsWith('/assets/')) {
        if (!(await exists(join(DIST, link)))) errors.push(`${rel}: fehlendes Asset ${link}`);
        continue;
      }
      if (!linkCache.has(link)) {
        const target = urlToFile(link);
        linkCache.set(link, target ? await exists(target) : false);
      }
      if (!linkCache.get(link)) errors.push(`${rel}: toter Link ${link}`);
    }
  }
  return files.length;
}

/* --------------------------------- Lauf ---------------------------------- */

console.log('Räucherhaken24 – Qualitätssicherung\n');
await build({ quiet: true });
checkProductRefs();
collectTodos();
const pageCount = await checkHtml();

console.log(`Geprüfte Seiten: ${pageCount}`);
console.log(`Produkte: ${products.length} | Fischarten: ${fishes.length} | Schinkenarten: ${hams.length} | Holzarten: ${woods.length}\n`);

if (errors.length) {
  console.log(`FEHLER (${errors.length}):`);
  errors.forEach((e) => console.log('  ✗ ' + e));
  console.log('');
}
if (warnings.length) {
  console.log(`WARNUNGEN (${warnings.length}):`);
  warnings.slice(0, 20).forEach((w) => console.log('  ! ' + w));
  if (warnings.length > 20) console.log(`  … und ${warnings.length - 20} weitere`);
  console.log('');
}
console.log(`OFFENE DATEN (${todos.length}) – bewusst nicht erfunden, vor dem Livegang zu pflegen:`);
todos.forEach((t) => console.log('  □ ' + t));

console.log('');
if (errors.length) {
  console.log('Ergebnis: FEHLGESCHLAGEN');
  process.exit(1);
}
console.log('Ergebnis: BESTANDEN – keine toten Links, keine fehlenden SEO-Angaben.');
