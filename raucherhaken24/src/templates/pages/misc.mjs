import { icon } from '../util.mjs';
import { site } from '../../data/site.mjs';

export function notFoundPage() {
  const body = `<div class="page"><div class="wrap">
  <div class="empty-state" style="max-width:660px;margin:40px auto">
    ${icon('hook', 44)}
    <h1 style="margin-top:10px">Diese Seite gibt es nicht</h1>
    <p class="muted">Der Link ist entweder veraltet oder es hat sich ein Tippfehler eingeschlichen.</p>
    <p style="margin-top:20px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
      <a class="btn btn-primary" href="/">Zur Startseite</a>
      <a class="btn btn-secondary" href="/shop/">Zum Shop</a>
      <a class="btn btn-secondary" href="/raeucherwissen/">Räucherwissen</a>
    </p>
  </div>
  <div class="split" style="margin-top:30px">
    <div class="knowledge-card"><h3>Produkt gesucht?</h3>
      <p>Die Suche oben im Kopfbereich durchsucht Produkte, Fischarten, Schinkenarten und Wissensseiten.</p></div>
    <div class="knowledge-card"><h3>Beratung gesucht?</h3>
      <p>Der Räucherberater unten rechts beantwortet Fragen zu Haken, Holzarten, Temperaturen und Zeiten.</p></div>
  </div>
</div></div>`;

  return {
    path: '/404.html',
    rawPath: true,
    activeNav: null,
    title: 'Seite nicht gefunden',
    metaTitle: `Seite nicht gefunden | ${site.name}`,
    metaDescription: 'Die aufgerufene Seite existiert nicht.',
    noindex: true,
    breadcrumbs: null,
    body,
  };
}

export function searchPage() {
  const body = `<div class="page"><div class="wrap">
  <div class="page-head">
    <h1>Suche</h1>
    <p class="lead">Durchsucht Produkte, Fischarten, Schinkenarten, Holzarten und Wissensseiten.</p>
  </div>
  <div class="form-card" style="max-width:640px">
    <form data-search-page-form>
      <div class="field">
        <label for="q">Suchbegriff</label>
        <input type="search" id="q" name="q" placeholder="z. B. Aal, Buche, Doppeldorn, Kerntemperatur" autocomplete="off" />
      </div>
      <button type="submit" class="btn btn-primary">Suchen</button>
    </form>
  </div>
  <div class="content-block" data-search-page-results></div>
</div></div>`;

  return {
    path: '/suche/',
    activeNav: null,
    title: 'Suche',
    metaTitle: `Suche | ${site.name}`,
    metaDescription: 'Produkte und Räucherwissen bei Räucherhaken24 durchsuchen.',
    noindex: true,
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/suche/', label: 'Suche' },
    ],
    body,
  };
}
