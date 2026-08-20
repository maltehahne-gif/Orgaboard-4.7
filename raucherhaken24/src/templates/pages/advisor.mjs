import { esc, icon } from '../util.mjs';
import { advisors } from '../../data/advisors.mjs';
import { products } from '../../data/catalog.mjs';
import { PLACEHOLDER_IMG, productImage } from '../components.mjs';
import { site } from '../../data/site.mjs';

/** Minimaler Produktindex für die Berater im Browser - ohne Preise. */
function productLookup(slugs) {
  const unique = [...new Set(slugs)];
  const map = {};
  unique.forEach((s) => {
    const p = products.find((x) => x.slug === s);
    if (p) map[s] = { name: p.name, short: p.short, url: `/produkt/${p.slug}/`, img: productImage(p) };
  });
  return map;
}

export function advisorHubPage() {
  const body = `<div class="page"><div class="wrap">
  <div class="page-head">
    <span class="eyebrow">Beratung</span>
    <h1>Räucherberatung</h1>
    <p class="lead">Drei Wege zur Antwort: die interaktiven Berater für Räuchermehl und Haken,
      der Räucherberater als Chat – oder direkt der Kontakt zu uns.</p>
  </div>
  <div class="topic-grid">
    <a class="topic-card" href="/berater/raeuchermehl/">
      <span class="topic-icon">${icon('wood', 24)}</span>
      <h3>Räuchermehl-Berater</h3>
      <p>Welche Holzart und welche Körnung passen zu Ihrem Räuchergut und Ihrem Verfahren? Zwei Fragen, ein Ergebnis.</p>
      <span class="go">Berater starten ${icon('arrow', 15)}</span>
    </a>
    <a class="topic-card" href="/berater/haken/">
      <span class="topic-icon">${icon('hook', 24)}</span>
      <h3>Haken-Berater</h3>
      <p>Form und Material des Räucherhakens – abhängig von Räuchergut, Gewicht und Einsatzhäufigkeit.</p>
      <span class="go">Berater starten ${icon('arrow', 15)}</span>
    </a>
    <button type="button" class="topic-card" data-open-ai style="text-align:left;font:inherit;cursor:pointer">
      <span class="topic-icon">${icon('chat', 24)}</span>
      <h3>Räucherberater fragen</h3>
      <p>Stellen Sie Ihre Frage frei – per Text oder Sprache. Der Berater antwortet auf Basis unseres Sortiments und unserer Wissensseiten.</p>
      <span class="go">Chat öffnen ${icon('arrow', 15)}</span>
    </button>
    <a class="topic-card" href="/kontakt/">
      <span class="topic-icon">${icon('mail', 24)}</span>
      <h3>Persönlich fragen</h3>
      <p>Wenn Sie eine verbindliche Auskunft zu einem konkreten Artikel brauchen – etwa zu Maßen oder Tragkraft.</p>
      <span class="go">Zum Kontakt ${icon('arrow', 15)}</span>
    </a>
  </div>

  <div class="note" style="margin-top:30px"><p><strong>Was der Berater nicht tut:</strong>
    Er nennt keine Preise, Maße oder Tragkräfte, die bei uns nicht gepflegt sind, und erfindet keine Produkte.
    Wo eine Angabe fehlt, sagt er das – und verweist auf den <a href="/kontakt/">Kontakt</a>.</p></div>
</div></div>`;

  return {
    path: '/berater/',
    activeNav: '/berater/',
    title: 'Räucherberatung',
    metaTitle: `Räucherberatung – Haken, Räuchermehl und Verfahren | ${site.name}`,
    metaDescription:
      'Interaktive Berater für Räuchermehl und Räucherhaken plus Räucherberater im Chat: In wenigen Fragen zum passenden Produkt und zum richtigen Verfahren.',
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/berater/', label: 'Beratung' },
    ],
    body,
  };
}

export function advisorPage(key) {
  const adv = advisors[key];
  const slugs = [
    ...adv.rules.flatMap((r) => r.result.products || []),
    ...(adv.fallback.products || []),
  ];
  const lookup = productLookup(slugs);

  const config = {
    id: adv.id,
    steps: adv.steps,
    rules: adv.rules,
    fallback: adv.fallback,
    materialAdvice: adv.materialAdvice || null,
    products: lookup,
    placeholder: PLACEHOLDER_IMG,
  };

  const body = `<div class="page"><div class="wrap">
  <div class="page-head">
    <span class="eyebrow">Berater</span>
    <h1>${esc(adv.title)}</h1>
    <p class="lead">${esc(adv.intro)}</p>
  </div>

  <div class="advisor" data-advisor>
    <div class="advisor-head">
      <h2>${esc(adv.title)}</h2>
      <p>Ihre Antworten werden nicht gespeichert und nicht übertragen – die Auswertung läuft im Browser.</p>
    </div>
    <div class="advisor-body">
      <div class="advisor-progress" data-advisor-progress></div>
      <div data-advisor-stage>
        <noscript>
          <p class="note warn">Der interaktive Berater benötigt JavaScript. Ohne JavaScript finden Sie alle
            Informationen ausführlich unter <a href="/raeuchermehl/">Räuchermehl verstehen</a> und
            <a href="/raeucherwissen/va-v2a-v4a/">VA / V2A / V4A</a>.</p>
        </noscript>
      </div>
    </div>
  </div>

  <script type="application/json" data-advisor-config>${JSON.stringify(config).replace(/</g, '\\u003c')}</script>

  <div class="content-block">
    <h2>Lieber selbst nachlesen?</h2>
    <div class="split">
      <div class="knowledge-card"><h3>Räuchermehl verstehen</h3>
        <p>Alle fünf Holzarten und alle vier Körnungen im Detail, mit Vergleichstabelle.</p>
        <a class="btn btn-secondary" href="/raeuchermehl/">Zur Übersicht</a></div>
      <div class="knowledge-card"><h3>VA / V2A / V4A</h3>
        <p>Welcher Edelstahl bei Salz, Feuchtigkeit und Dauereinsatz sinnvoll ist.</p>
        <a class="btn btn-secondary" href="/raeucherwissen/va-v2a-v4a/">Zum Vergleich</a></div>
    </div>
  </div>
</div></div>`;

  const titles = {
    raeuchermehl: {
      metaTitle: `Welches Räuchermehl brauche ich? Berater | ${site.name}`,
      metaDescription:
        'Räuchermehl-Berater: In zwei Fragen zur passenden Holzart und Körnung – für Forelle, Aal, Lachs, Fleisch, Schinken und Käse.',
    },
    haken: {
      metaTitle: `Welcher Räucherhaken? Haken-Berater | ${site.name}`,
      metaDescription:
        'Haken-Berater: Welche Hakenform passt zu Ihrem Fisch oder Fleisch – Standard, Kralle, Aal, Doppeldorn, 3-Dorn oder Filet? Inklusive Materialempfehlung V2A oder V4A.',
    },
  };

  return {
    path: `/berater/${key}/`,
    activeNav: '/berater/',
    title: adv.title,
    metaTitle: titles[key].metaTitle,
    metaDescription: titles[key].metaDescription,
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/berater/', label: 'Beratung' },
      { href: `/berater/${key}/`, label: adv.title },
    ],
    body,
  };
}
