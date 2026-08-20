import { esc, icon } from '../util.mjs';
import { renderSections, faqBlock, faqSchema, shareBar, relatedProducts, categoryNav, knowledgeHref } from '../components.mjs';
import { articles } from '../../data/knowledge.mjs';
import { knowledgeNav } from '../../data/categories.mjs';
import { site } from '../../data/site.mjs';

const hubDescriptions = {
  'fisch-raeuchern': 'Die vier Schritte vom rohen Fisch zum fertigen Räucherfisch.',
  'fleisch-raeuchern': 'Warum Fleisch gepökelt wird und wie Rohschinken, Saftschinken und Speck entstehen.',
  'schinken-selber-machen': 'Anleitungen zu acht Schinkenarten – von Lachsschinken bis Parma-Art.',
  'raeuchermehl-verstehen': 'Fünf Holzarten, vier Körnungen – und welche Kombination wozu passt.',
  'va-v2a-v4a': 'Welcher Edelstahl für Räucherhaken? Mit Vergleichstabelle und klarer Empfehlung.',
  temperaturen: 'Kalt, warm oder heiß – und welche Kerntemperatur wirklich zählt.',
  raeucherzeiten: 'Richtwerte für Fisch, Schinken, Speck und Käse.',
  anfaengerwissen: 'Der erste Räuchergang Schritt für Schritt, inklusive der häufigsten Fehler.',
};

export function knowledgeHubPage() {
  const body = `<div class="page"><div class="wrap"><div class="shop-layout">
  ${categoryNav({})}
  <div>
    <div class="page-head">
      <span class="eyebrow">Wissensportal</span>
      <h1>Räucherwissen</h1>
      <p class="lead">Räuchern ist Handwerk, kein Zufall. Hier steht, worauf es ankommt – verständlich genug
        für den ersten Räuchergang und genau genug für alle, die es schon länger machen.</p>
    </div>
    <div class="topic-grid">
      ${knowledgeNav.children
        .map(
          (k) => `<a class="topic-card" href="${knowledgeHref(k.slug)}">
        <span class="topic-icon">${icon('book', 23)}</span>
        <h3>${esc(k.label)}</h3>
        <p>${esc(hubDescriptions[k.slug] || '')}</p>
        <span class="go">Lesen ${icon('arrow', 15)}</span>
      </a>`
        )
        .join('\n')}
    </div>

    <div class="content-block">
      <h2>Interaktive Berater</h2>
      <div class="split">
        <div class="knowledge-card">
          <h3>${icon('wood', 19)} Welches Räuchermehl brauche ich?</h3>
          <p>Zwei Fragen zu Räuchergut und Verfahren – danach kennen Sie Holzart und Körnung.</p>
          <a class="btn btn-primary" href="/berater/raeuchermehl/">Berater starten</a>
        </div>
        <div class="knowledge-card">
          <h3>${icon('hook', 19)} Welcher Räucherhaken passt?</h3>
          <p>Drei Fragen zu Räuchergut, Gewicht und Einsatz – inklusive Materialempfehlung.</p>
          <a class="btn btn-primary" href="/berater/haken/">Berater starten</a>
        </div>
      </div>
    </div>
  </div>
</div></div></div>`;

  return {
    path: '/raeucherwissen/',
    activeNav: '/raeucherwissen/',
    title: 'Räucherwissen',
    metaTitle: `Räucherwissen – Anleitungen, Temperaturen, Zeiten | ${site.name}`,
    metaDescription:
      'Räucherwissen von Grund auf: Fisch räuchern, Fleisch räuchern, Schinken selber machen, Räuchermehl verstehen, VA/V2A/V4A, Temperaturen, Räucherzeiten und Anfängerwissen.',
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/raeucherwissen/', label: 'Räucherwissen' },
    ],
    body,
  };
}

export function articlePage(a) {
  const url = `${site.baseUrl}/raeucherwissen/${a.slug}/`;
  const others = articles.filter((x) => x.slug !== a.slug).slice(0, 3);

  const body = `<div class="page"><div class="wrap"><div class="shop-layout">
  ${categoryNav({ activeKnowledge: a.slug })}
  <div>
    <div class="page-head">
      <span class="eyebrow">Räucherwissen</span>
      <h1>${esc(a.title)}</h1>
      <p class="lead">${esc(a.lead)}</p>
    </div>
    <article class="article">
      ${renderSections(a.sections)}
      ${shareBar(url, a.title)}
    </article>
    ${faqBlock(a.faq)}
    ${relatedProducts(a.products)}
    <div class="content-block">
      <h2>Weiterlesen</h2>
      <div class="split">
        ${others
          .map(
            (o) => `<div class="knowledge-card"><h3>${esc(o.title)}</h3><p>${esc(o.lead.slice(0, 120))}…</p>
        <a class="btn btn-secondary" href="/raeucherwissen/${o.slug}/">Artikel lesen</a></div>`
          )
          .join('')}
      </div>
    </div>
  </div>
</div></div></div>`;

  return {
    path: `/raeucherwissen/${a.slug}/`,
    activeNav: '/raeucherwissen/',
    title: a.title,
    metaTitle: a.metaTitle,
    metaDescription: a.metaDescription,
    ogType: 'article',
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/raeucherwissen/', label: 'Räucherwissen' },
      { href: `/raeucherwissen/${a.slug}/`, label: a.title },
    ],
    body,
    schemas: [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: a.title,
        description: a.metaDescription,
        inLanguage: 'de-DE',
        mainEntityOfPage: url,
        image: `${site.baseUrl}/assets/img/og-default.svg`,
        publisher: { '@type': 'Organization', name: site.name, url: site.baseUrl },
      },
      faqSchema(a.faq),
    ].filter(Boolean),
  };
}
