import { esc, icon } from '../util.mjs';
import { productGrid, categoryNav } from '../components.mjs';
import { categories } from '../../data/categories.mjs';
import { products, productsByCategory, productsBySub } from '../../data/catalog.mjs';
import { site } from '../../data/site.mjs';

function collectionSchema(name, description, list, basePath) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url: site.baseUrl + basePath,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: list.length,
      itemListElement: list.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: p.name,
        url: `${site.baseUrl}/produkt/${p.slug}/`,
      })),
    },
  };
}

export function shopPage() {
  const body = `<div class="page"><div class="wrap"><div class="shop-layout">
  ${categoryNav({})}
  <div>
    <div class="page-head">
      <span class="eyebrow">Sortiment</span>
      <h1>Shop</h1>
      <p class="lead">Räucherhaken, Fleischerhaken, Räuchermehl, Räucherlaugen, Gewürze und Pökelmischungen.
        Zu jedem Artikel finden Sie eine Erklärung, wofür er gedacht ist – und wann eine andere Variante besser passt.</p>
    </div>
    ${categories
      .map((cat) => {
        const list = productsByCategory(cat.slug);
        return `<section class="content-block">
        <h2><a href="/kategorie/${cat.slug}/">${esc(cat.label)}</a></h2>
        <p class="muted" style="margin-bottom:16px">${esc(cat.intro)}</p>
        ${productGrid(list)}
      </section>`;
      })
      .join('\n')}
  </div>
</div></div></div>`;

  return {
    path: '/shop/',
    activeNav: '/shop/',
    title: 'Shop',
    metaTitle: `Räucherbedarf online kaufen | ${site.name}`,
    metaDescription:
      'Räucherhaken, Fleischerhaken, Räuchermehl in fünf Holzarten, Räucherlaugen, Gewürze und Pökelmischungen – mit Fachberatung zu jedem Artikel.',
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/shop/', label: 'Shop' },
    ],
    body,
    schemas: [collectionSchema('Shop', 'Gesamtes Sortiment', products, '/shop/')],
  };
}

export function categoryPage(cat) {
  const list = productsByCategory(cat.slug);
  const subLinks = cat.children
    .map(
      (s) =>
        `<a class="btn btn-secondary" style="min-height:40px;padding:9px 15px;font-size:0.88rem" href="/kategorie/${cat.slug}/${s.slug}/">${esc(s.label)}</a>`
    )
    .join('');

  const body = `<div class="page"><div class="wrap"><div class="shop-layout">
  ${categoryNav({ activeMain: cat.slug })}
  <div>
    <div class="page-head">
      <span class="eyebrow">Kategorie</span>
      <h1>${esc(cat.label)}</h1>
      <p class="lead">${esc(cat.intro)}</p>
    </div>
    <div class="share" style="margin-top:0">${subLinks}</div>
    ${productGrid(list)}
    ${
      cat.slug === 'raeucherhaken'
        ? `<div class="note" style="margin-top:26px"><p><strong>Unsicher, welcher Haken?</strong>
      Der <a href="/berater/haken/">Haken-Berater</a> fragt nach Fischart, Gewicht und Zuschnitt und nennt
      Ihnen anschließend die passende Form. Zum Material hilft der Vergleich
      <a href="/raeucherwissen/va-v2a-v4a/">VA, V2A und V4A</a>.</p></div>`
        : ''
    }
    ${
      cat.slug === 'raeuchermehl'
        ? `<div class="note" style="margin-top:26px"><p><strong>Welche Holzart und welche Körnung?</strong>
      Der <a href="/berater/raeuchermehl/">Räuchermehl-Berater</a> führt Sie in zwei Fragen zum Ergebnis.
      Ausführliche Beschreibungen aller Holzarten finden Sie unter <a href="/raeuchermehl/">Räuchermehl verstehen</a>.</p></div>`
        : ''
    }
    ${
      cat.slug === 'schinken-poekeln'
        ? `<div class="note warn" style="margin-top:26px"><p><strong>Wichtig zur Dosierung:</strong>
      Dosierung und Pökeldauer richten sich ausschließlich nach der Angabe auf der Verpackung Ihrer
      Pökelmischung. Anleitungen zu den einzelnen Schinkenarten finden Sie unter
      <a href="/schinken-selber-machen/">Schinken selber machen</a>.</p></div>`
        : ''
    }
  </div>
</div></div></div>`;

  return {
    path: `/kategorie/${cat.slug}/`,
    activeNav: '/shop/',
    title: cat.label,
    metaTitle: `${cat.label} kaufen | ${site.name}`,
    metaDescription: cat.intro,
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/shop/', label: 'Shop' },
      { href: `/kategorie/${cat.slug}/`, label: cat.label },
    ],
    body,
    schemas: [collectionSchema(cat.label, cat.intro, list, `/kategorie/${cat.slug}/`)],
  };
}

export function subCategoryPage(cat, sub) {
  const list = productsBySub(sub.slug);
  const body = `<div class="page"><div class="wrap"><div class="shop-layout">
  ${categoryNav({ activeMain: cat.slug, activeSub: sub.slug })}
  <div>
    <div class="page-head">
      <span class="eyebrow"><a href="/kategorie/${cat.slug}/">${esc(cat.label)}</a></span>
      <h1>${esc(sub.label)}</h1>
      <p class="lead">${esc(list.length ? list[0].lead || list[0].short : cat.intro)}</p>
    </div>
    ${productGrid(list)}
    <p style="margin-top:24px"><a class="btn btn-secondary" href="/kategorie/${cat.slug}/">${icon('arrow', 16)} Alle Artikel aus ${esc(cat.label)}</a></p>
  </div>
</div></div></div>`;

  return {
    path: `/kategorie/${cat.slug}/${sub.slug}/`,
    activeNav: '/shop/',
    title: sub.label,
    metaTitle: `${sub.label} – ${cat.label} | ${site.name}`,
    metaDescription: list.length ? list[0].short : `${sub.label} aus der Kategorie ${cat.label}.`,
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/shop/', label: 'Shop' },
      { href: `/kategorie/${cat.slug}/`, label: cat.label },
      { href: `/kategorie/${cat.slug}/${sub.slug}/`, label: sub.label },
    ],
    body,
    schemas: [collectionSchema(sub.label, sub.label, list, `/kategorie/${cat.slug}/${sub.slug}/`)],
  };
}
