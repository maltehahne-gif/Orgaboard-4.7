import { esc, icon, jsonLd, truncate } from './util.mjs';
import { site, company, social } from '../data/site.mjs';

export const mainNav = [
  { href: '/', label: 'Start' },
  { href: '/shop/', label: 'Shop' },
  { href: '/raeucherfisch/', label: 'Räucherfisch' },
  { href: '/schinken-selber-machen/', label: 'Schinken' },
  { href: '/raeuchermehl/', label: 'Räuchermehl' },
  { href: '/raeucherwissen/', label: 'Räucherwissen' },
  { href: '/berater/', label: 'Beratung' },
  { href: '/kontakt/', label: 'Kontakt' },
];

function headerLogo() {
  return `<a class="brand" href="/" aria-label="${esc(site.name)} – zur Startseite">
      <img src="/assets/img/logo.svg" alt="" width="46" height="46" />
      <span class="brand-text">
        <strong>Räucherhaken<span style="color:var(--orange-dark)">24</span></strong>
        <small>Räucherbedarf &amp; Fachwissen</small>
      </span>
    </a>`;
}

function renderHeader(activeNav) {
  const navItems = mainNav
    .map((n) => {
      const current = n.href === activeNav ? ' aria-current="page"' : '';
      return `<li><a href="${n.href}"${current}>${esc(n.label)}</a></li>`;
    })
    .join('');

  return `<header class="site-header">
  <div class="header-top">
    <div class="wrap">
      <span>${icon('truck', 15)} Versand innerhalb Deutschlands</span>
      <span>${icon('shield', 15)} Fachberatung zu jedem Artikel</span>
      <span>${icon('book', 15)} Räucherwissen &amp; Rezepte inklusive</span>
    </div>
  </div>
  <div class="header-main">
    <div class="wrap">
      ${headerLogo()}
      <div class="header-search">
        <label class="visually-hidden" for="site-search">Suche nach Produkten und Räucherwissen</label>
        <input type="search" id="site-search" placeholder="Suchen: Räucherhaken, Buche, Forelle …"
               autocomplete="off" role="combobox" aria-expanded="false" aria-controls="search-results" />
        <button type="button" id="site-search-btn" aria-label="Suchen">${icon('search', 18)}</button>
        <div class="search-results" id="search-results" role="listbox" aria-label="Suchergebnisse"></div>
      </div>
      <div class="header-actions">
        <a class="icon-link" href="/konto/">${icon('user', 21)}<span>Konto</span></a>
        <a class="icon-link" href="/haendler/">${icon('dealer', 21)}<span>Händler</span></a>
        <a class="icon-link" href="/warenkorb/">${icon('cart', 21)}<span>Warenkorb</span><span class="cart-count" data-cart-count hidden>0</span></a>
      </div>
    </div>
  </div>
  <nav class="mainnav" id="mainnav" aria-label="Hauptnavigation">
    <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="mainnav-list">
      ${icon('menu', 20)} Menü
    </button>
    <div class="wrap"><ul id="mainnav-list">${navItems}</ul></div>
  </nav>
</header>`;
}

function renderSocial() {
  const active = social.filter((s) => typeof s.url === 'string' && s.url.length > 0);
  if (!active.length) {
    // Keine erfundenen Profil-URLs: solange nichts hinterlegt ist, wird nichts verlinkt.
    return `<p class="footer-social-empty">Social-Media-Profile sind noch nicht hinterlegt.
      Sobald die echten Profil-Adressen in <code>src/data/site.mjs</code> stehen, erscheinen sie hier automatisch.</p>`;
  }
  return `<div class="footer-social">${active
    .map((s) => `<a href="${esc(s.url)}" rel="me noopener" target="_blank" aria-label="${esc(s.label)}">${icon(s.id, 20)}</a>`)
    .join('')}</div>`;
}

function renderFooter() {
  const year = new Date().getFullYear();
  const contactLine = company.email
    ? `<a href="mailto:${esc(company.email)}">${esc(company.email)}</a>`
    : '<span class="muted">E-Mail-Adresse noch nicht hinterlegt</span>';

  return `<footer class="site-footer">
  <div class="footer-main">
    <div class="wrap">
      <div class="footer-grid">
        <div class="footer-brand">
          <h3>${esc(site.name)}</h3>
          <p>${esc(site.description)}</p>
          ${renderSocial()}
        </div>
        <div>
          <h3>Sortiment</h3>
          <ul>
            <li><a href="/kategorie/raeucherhaken/">Räucherhaken</a></li>
            <li><a href="/kategorie/fleischerhaken/">Fleischerhaken</a></li>
            <li><a href="/raeuchermehl/">Räuchermehl</a></li>
            <li><a href="/kategorie/raeucherlaugen/">Räucherlaugen</a></li>
            <li><a href="/kategorie/gewuerze/">Gewürze</a></li>
            <li><a href="/kategorie/schinken-poekeln/">Schinken &amp; Pökeln</a></li>
          </ul>
        </div>
        <div>
          <h3>Wissen &amp; Beratung</h3>
          <ul>
            <li><a href="/raeucherwissen/anfaengerwissen/">Anfängerwissen</a></li>
            <li><a href="/raeucherfisch/">Räucherfisch-Guide</a></li>
            <li><a href="/schinken-selber-machen/">Schinken selber machen</a></li>
            <li><a href="/raeucherwissen/va-v2a-v4a/">VA / V2A / V4A</a></li>
            <li><a href="/berater/raeuchermehl/">Räuchermehl-Berater</a></li>
            <li><a href="/berater/haken/">Haken-Berater</a></li>
          </ul>
        </div>
        <div>
          <h3>Service</h3>
          <ul>
            <li><a href="/kontakt/">Kontakt</a></li>
            <li><a href="/konto/">Kundenkonto</a></li>
            <li><a href="/haendler/">Händlerbereich</a></li>
            <li><a href="/zahlung-versand/">Zahlung &amp; Versand</a></li>
            <li>${contactLine}</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
  <div class="footer-bottom">
    <div class="wrap">
      <span>© ${year} ${esc(site.name)}</span>
      <nav class="footer-legal" aria-label="Rechtliches">
        <a href="/impressum/">Impressum</a>
        <a href="/datenschutz/">Datenschutz</a>
        <a href="/agb/">AGB</a>
        <a href="/widerruf/">Widerrufsbelehrung</a>
        <a href="/zahlung-versand/">Zahlung &amp; Versand</a>
      </nav>
    </div>
  </div>
</footer>`;
}

function renderAiWidget() {
  return `<button type="button" class="ai-launcher" id="ai-launcher" aria-expanded="false" aria-controls="ai-panel">
  ${icon('chat', 26)}
  <span class="ai-launcher-label">Räucherberater fragen</span>
  <span class="visually-hidden">KI-Räucherberater öffnen</span>
</button>
<aside class="ai-panel" id="ai-panel" aria-label="KI-Räucherberater" hidden>
  <div class="ai-head">
    <span class="orb">${icon('chat', 20)}</span>
    <span>
      <strong>Räucherberater</strong>
      <small>Antworten aus unserem Sortiment &amp; Fachwissen</small>
    </span>
    <button type="button" class="ai-tts" id="ai-tts" aria-pressed="false" title="Sprachausgabe an/aus">${icon('speaker', 18)}<span class="visually-hidden">Sprachausgabe umschalten</span></button>
    <button type="button" class="ai-close" id="ai-close" title="Schließen">${icon('close', 18)}<span class="visually-hidden">Berater schließen</span></button>
  </div>
  <div class="ai-scroll" id="ai-scroll" role="log" aria-live="polite"></div>
  <div class="ai-quick" id="ai-quick"></div>
  <form class="ai-form" id="ai-form">
    <button type="button" class="ai-mic" id="ai-mic" title="Spracheingabe">${icon('mic', 18)}<span class="visually-hidden">Spracheingabe starten</span></button>
    <label class="visually-hidden" for="ai-input">Ihre Frage an den Räucherberater</label>
    <input type="text" id="ai-input" placeholder="Welchen Haken brauche ich für Aal?" autocomplete="off" />
    <button type="submit" class="ai-send" title="Senden">${icon('send', 18)}<span class="visually-hidden">Frage senden</span></button>
  </form>
  <p class="ai-disclaimer">Der Berater antwortet ausschließlich auf Basis unseres Sortiments und unserer Wissensseiten. Er nennt keine Preise oder technischen Daten, die nicht gepflegt sind.</p>
</aside>`;
}

function renderBreadcrumbs(items) {
  if (!items || items.length < 2) return '';
  const li = items
    .map((b, i) => {
      const last = i === items.length - 1;
      return last
        ? `<li aria-current="page">${esc(b.label)}</li>`
        : `<li><a href="${b.href}">${esc(b.label)}</a></li>`;
    })
    .join('');
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><div class="wrap"><ol>${li}</ol></div></nav>`;
}

function breadcrumbSchema(items) {
  if (!items || items.length < 2) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: b.label,
      item: site.baseUrl + b.href,
    })),
  };
}

/**
 * Baut eine vollständige HTML-Seite.
 * page: { path, title, metaTitle, metaDescription, breadcrumbs, body,
 *         schemas, activeNav, bodyClass, ogType, noindex }
 */
export function renderPage(page) {
  const title = page.metaTitle || `${page.title} | ${site.name}`;
  const description = truncate(page.metaDescription || site.description, 158);
  const canonical = site.baseUrl + page.path;
  const schemas = [...(page.schemas || [])];
  const crumbSchema = breadcrumbSchema(page.breadcrumbs);
  if (crumbSchema) schemas.push(crumbSchema);

  const schemaTags = schemas
    .map((s) => `<script type="application/ld+json">${jsonLd(s)}</script>`)
    .join('\n    ');

  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${esc(canonical)}" />
    ${page.noindex ? '<meta name="robots" content="noindex,follow" />' : '<meta name="robots" content="index,follow" />'}
    <meta name="theme-color" content="#3d2717" />
    <meta property="og:type" content="${esc(page.ogType || 'website')}" />
    <meta property="og:site_name" content="${esc(site.name)}" />
    <meta property="og:locale" content="de_DE" />
    <meta property="og:title" content="${esc(page.ogTitle || page.title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${esc(canonical)}" />
    <meta property="og:image" content="${esc(site.baseUrl + (page.ogImage || '/assets/img/og-default.svg'))}" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/assets/css/site.css" />
    ${schemaTags}
  </head>
  <body${page.bodyClass ? ` class="${esc(page.bodyClass)}"` : ''}>
    <a class="skip-link" href="#main">Zum Inhalt springen</a>
    ${renderHeader(page.activeNav)}
    ${renderBreadcrumbs(page.breadcrumbs)}
    <main id="main">
${page.body}
    </main>
    ${renderFooter()}
    ${renderAiWidget()}
    <script src="/assets/js/site-data.js" defer></script>
    <script src="/assets/js/app.js" defer></script>
    <script src="/assets/js/berater.js" defer></script>
  </body>
</html>
`;
}
