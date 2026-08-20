import { esc, icon } from '../util.mjs';
import { productGrid } from '../components.mjs';
import { products } from '../../data/catalog.mjs';
import { site } from '../../data/site.mjs';
import { fishes } from '../../data/fish.mjs';

/** Einstiegsfragen - führen zuerst zu Wissen, dann zu Produkten. */
const intents = [
  {
    icon: 'fish',
    title: 'Ich möchte Fisch räuchern',
    text: 'Vorbereitung, Lake, Trocknen und Temperatur – und welcher Haken zu welchem Fisch passt.',
    href: '/raeucherfisch/',
    cta: 'Zum Räucherfisch-Guide',
  },
  {
    icon: 'meat',
    title: 'Ich möchte Fleisch räuchern',
    text: 'Warum Fleisch vorher gepökelt wird und worin sich Rohschinken, Saftschinken und Speck unterscheiden.',
    href: '/raeucherwissen/fleisch-raeuchern/',
    cta: 'Fleisch räuchern verstehen',
  },
  {
    icon: 'box',
    title: 'Ich möchte Schinken selber machen',
    text: 'Von Lachsschinken bis Parma-Art: Fleischstück, Pökeln, Durchbrennen, Räuchern, Reifen.',
    href: '/schinken-selber-machen/',
    cta: 'Schinken-Anleitungen ansehen',
  },
  {
    icon: 'wood',
    title: 'Welches Räuchermehl brauche ich?',
    text: 'Buche, Erle, Birke, Eiche oder Kirsche – und welche der vier Körnungen zu Ihrem Ofen passt.',
    href: '/berater/raeuchermehl/',
    cta: 'Räuchermehl-Berater starten',
  },
  {
    icon: 'hook',
    title: 'Welcher Räucherhaken passt zu meinem Fisch?',
    text: 'Standard, Kralle, Doppeldorn, 3-Dorn oder Filet – abhängig von Fischart, Gewicht und Aufhängung.',
    href: '/berater/haken/',
    cta: 'Haken-Berater starten',
  },
  {
    icon: 'info',
    title: 'Ich bin Anfänger – wo fange ich an?',
    text: 'Was Sie wirklich brauchen, wie der erste Räuchergang abläuft und welche Fehler fast alle machen.',
    href: '/raeucherwissen/anfaengerwissen/',
    cta: 'Zum Anfängerwissen',
  },
];

const themes = [
  { label: 'Pökeln', href: '/raeucherwissen/fleisch-raeuchern/' },
  { label: 'Marinieren & Lake', href: '/kategorie/raeucherlaugen/' },
  { label: 'Räucherlaugen', href: '/kategorie/raeucherlaugen/' },
  { label: 'Fischgewürze', href: '/kategorie/gewuerze/fischgewuerze/' },
  { label: 'Fleischgewürze', href: '/kategorie/gewuerze/fleischgewuerze/' },
  { label: 'Räuchermehl', href: '/raeuchermehl/' },
  { label: 'Räucherhaken', href: '/kategorie/raeucherhaken/' },
  { label: 'Kalträuchern', href: '/raeucherwissen/temperaturen/' },
  { label: 'Heißräuchern', href: '/raeucherwissen/temperaturen/' },
  { label: 'Räucherzeiten', href: '/raeucherwissen/raeucherzeiten/' },
  { label: 'VA / V2A / V4A', href: '/raeucherwissen/va-v2a-v4a/' },
  { label: 'Stremellachs', href: '/kategorie/gewuerze/stremellachs/' },
];

export function homePage() {
  const topFish = fishes.slice(0, 6);
  const starter = ['raeucherhaken-standard', 'raeuchermehl-buche', 'raeucherlauge-forelle', 'lachsschinken-mischung']
    .map((s) => products.find((p) => p.slug === s))
    .filter(Boolean);

  const body = `
<section class="hero">
  <div class="wrap">
    <div>
      <span class="eyebrow">Räucherbedarf mit Fachberatung</span>
      <h1>Räuchern, das beim ersten Mal gelingt</h1>
      <p class="lead">Bei uns bekommen Sie nicht nur Räucherhaken, Räuchermehl und Pökelmischungen –
        sondern auch die Antwort auf die Frage, welches Produkt Sie brauchen und warum.</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="/berater/">${icon('chat', 18)} Beratung starten</a>
        <a class="btn btn-secondary" href="/shop/">Zum Sortiment</a>
      </div>
      <ul class="hero-usps">
        <li>${icon('check', 18)} <span>Zu jedem Artikel steht, für wen er gedacht ist – und wann eine andere Variante die bessere Wahl ist.</span></li>
        <li>${icon('check', 18)} <span>Räucherwissen zu Fisch, Fleisch, Schinken, Holzarten, Temperaturen und Zeiten.</span></li>
        <li>${icon('check', 18)} <span>Interaktive Berater für Räuchermehl und Räucherhaken – in unter einer Minute zum Ergebnis.</span></li>
      </ul>
    </div>
    <div class="hero-visual">
      <h2 style="font-size:1.05rem">Womit möchten Sie anfangen?</h2>
      <p class="small muted">Wählen Sie Ihr Vorhaben – wir führen Sie zum passenden Wissen und danach zum passenden Produkt.</p>
      <div style="display:grid;gap:9px;margin-top:14px">
        <a class="btn btn-secondary btn-block" href="/raeucherfisch/forelle/">${icon('fish', 17)} Forelle räuchern</a>
        <a class="btn btn-secondary btn-block" href="/raeucherfisch/aal/">${icon('fish', 17)} Aal räuchern</a>
        <a class="btn btn-secondary btn-block" href="/schinken-selber-machen/lachsschinken/">${icon('meat', 17)} Lachsschinken machen</a>
        <a class="btn btn-secondary btn-block" href="/berater/raeuchermehl/">${icon('wood', 17)} Räuchermehl finden</a>
      </div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow">Fachberatung</span>
      <h2>Sagen Sie uns, was Sie vorhaben</h2>
      <p>Jeder Bereich erklärt zuerst das Verfahren und zeigt anschließend die Produkte, die Sie dafür tatsächlich brauchen.</p>
    </div>
    <div class="topic-grid">
      ${intents
        .map(
          (i) => `<a class="topic-card" href="${i.href}">
        <span class="topic-icon">${icon(i.icon, 24)}</span>
        <h3>${esc(i.title)}</h3>
        <p>${esc(i.text)}</p>
        <span class="go">${esc(i.cta)} ${icon('arrow', 15)}</span>
      </a>`
        )
        .join('\n')}
    </div>
  </div>
</section>

<section class="section alt">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow">Räucherfisch-Guide</span>
      <h2>Der beste Räucherfisch</h2>
      <p>Zu jeder Fischart: Vorbereitung, Lake, Salzzeit, Trocknung, passender Haken, passendes Räuchermehl,
        Temperatur, Räucherdauer, Kerntemperatur – und die Fehler, die dabei am häufigsten passieren.</p>
    </div>
    <div class="topic-grid">
      ${topFish
        .map(
          (f) => `<a class="topic-card" href="/raeucherfisch/${f.slug}/">
        <span class="topic-icon">${icon('fish', 24)}</span>
        <h3>${esc(f.name)}</h3>
        <p>${esc(f.teaser)}</p>
        <span class="go">${esc(f.method)} · ${esc(f.level)} ${icon('arrow', 15)}</span>
      </a>`
        )
        .join('\n')}
    </div>
    <p style="margin-top:22px"><a class="btn btn-secondary" href="/raeucherfisch/">Alle Fischarten ansehen</a></p>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow">Themen</span>
      <h2>Räucherwissen von A bis Z</h2>
      <p>Alle Bereiche führen von der Erklärung direkt zum passenden Artikel im Shop.</p>
    </div>
    <div class="share" style="gap:10px">
      ${themes.map((t) => `<a href="${t.href}">${esc(t.label)}</a>`).join('\n')}
    </div>
  </div>
</section>

<section class="section alt">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow">Grundausstattung</span>
      <h2>Womit Einsteiger anfangen</h2>
      <p>Diese vier Dinge reichen für den ersten Räuchergang. Alles Weitere kommt später.</p>
    </div>
    ${productGrid(starter)}
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="cta-band">
      <div>
        <h2>Unsicher, was Sie brauchen?</h2>
        <p>Fragen Sie unseren Räucherberater – per Text oder Sprache. Er antwortet ausschließlich auf Basis
          unseres Sortiments und unserer Wissensseiten und nennt keine Daten, die nicht gepflegt sind.</p>
      </div>
      <a class="btn btn-secondary" href="/berater/">${icon('chat', 18)} Berater öffnen</a>
    </div>
  </div>
</section>`;

  return {
    path: '/',
    activeNav: '/',
    title: 'Räucherhaken24',
    metaTitle: 'Räucherhaken24 – Räucherhaken, Räuchermehl & Räucherwissen',
    metaDescription:
      'Räucherhaken, Räuchermehl, Räucherlaugen und Pökelmischungen mit echter Fachberatung: Welcher Haken, welches Holz, welche Körnung – verständlich erklärt für Einsteiger und Profis.',
    breadcrumbs: null,
    body,
    schemas: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: site.name,
        url: site.baseUrl,
        inLanguage: 'de-DE',
        potentialAction: {
          '@type': 'SearchAction',
          target: `${site.baseUrl}/suche/?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };
}
