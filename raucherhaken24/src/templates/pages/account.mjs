import { esc, icon } from '../util.mjs';
import { site, dealerTiers } from '../../data/site.mjs';

function backendNote(title, endpoints, extra = '') {
  return `<div class="backend-note">
    <h3>${icon('info', 16)} ${esc(title)}</h3>
    <p>Die Oberfläche steht, die Anbindung fehlt noch. Es wird bewusst kein funktionierender Login vorgetäuscht
      und es werden keine Passwörter im Browser gespeichert oder verarbeitet.</p>
    ${extra}
    <p>Benötigte Schnittstellen:</p>
    <ul style="margin:6px 0 0;padding-left:18px">
      ${endpoints.map((e) => `<li><code>${esc(e.method)} ${esc(e.path)}</code> – ${esc(e.desc)}</li>`).join('')}
    </ul>
  </div>`;
}

export function accountPage() {
  const body = `<div class="page"><div class="wrap">
  <div class="page-head">
    <span class="eyebrow">Kundenbereich</span>
    <h1>Ihr Kundenkonto</h1>
    <p class="lead">Bestellungen, Rechnungen, Adressen, Favoriten und gespeicherte Rezepte an einem Ort.</p>
  </div>

  <div class="auth-layout">
    <div class="form-card">
      <h2 style="font-size:1.1rem;margin-top:0">Anmelden</h2>
      <form data-auth-form="login" novalidate>
        <div class="field">
          <label for="login-email">E-Mail-Adresse</label>
          <input type="email" id="login-email" name="email" autocomplete="email" required />
        </div>
        <div class="field">
          <label for="login-password">Passwort</label>
          <input type="password" id="login-password" name="password" autocomplete="current-password" required />
        </div>
        <button type="submit" class="btn btn-primary btn-block">Anmelden</button>
        <div class="form-status" data-auth-status role="status"></div>
        <p class="small" style="margin-top:12px"><a href="/konto/passwort-vergessen/">Passwort vergessen?</a></p>
      </form>
    </div>

    <div class="form-card">
      <h2 style="font-size:1.1rem;margin-top:0">Neu hier? Konto erstellen</h2>
      <form data-auth-form="register" novalidate>
        <div class="form-grid">
          <div class="field"><label for="reg-first">Vorname</label><input type="text" id="reg-first" name="firstName" required autocomplete="given-name" /></div>
          <div class="field"><label for="reg-last">Nachname</label><input type="text" id="reg-last" name="lastName" required autocomplete="family-name" /></div>
          <div class="field span-2"><label for="reg-email">E-Mail-Adresse</label><input type="email" id="reg-email" name="email" required autocomplete="email" /></div>
          <div class="field span-2">
            <label for="reg-password">Passwort</label>
            <input type="password" id="reg-password" name="password" required autocomplete="new-password" minlength="10" />
            <span class="hint">Mindestens 10 Zeichen. Das Passwort wird ausschließlich serverseitig geprüft und als Hash gespeichert.</span>
          </div>
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="reg-privacy" required />
          <label for="reg-privacy">Ich habe die <a href="/datenschutz/">Datenschutzerklärung</a> gelesen.</label>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Konto erstellen</button>
        <div class="form-status" data-auth-status role="status"></div>
      </form>
    </div>
  </div>

  <div class="content-block">
    <h2>Was Sie im Konto finden werden</h2>
    <div class="qa-grid">
      <div class="qa-item"><h3>Bestellungen &amp; Rechnungen</h3><p>Bestellhistorie, Bestellstatus und Rechnungsdownload.</p></div>
      <div class="qa-item"><h3>Adressen</h3><p>Mehrere Liefer- und Rechnungsadressen verwalten.</p></div>
      <div class="qa-item"><h3>Persönliche Daten</h3><p>Kontaktdaten und Passwort ändern.</p></div>
      <div class="qa-item"><h3>Gespeicherte Rezepte</h3><p>Ihre Räucheranleitungen als Merkliste.</p></div>
      <div class="qa-item"><h3>Wiederbestellen</h3><p>Frühere Bestellungen mit einem Klick erneut auslösen.</p></div>
      <div class="qa-item"><h3>Favoriten</h3><p>Artikel für später vormerken.</p></div>
    </div>
  </div>

  <div class="content-block">
    <h2>Bereits jetzt nutzbar</h2>
    <p class="muted">Diese beiden Funktionen laufen vollständig in Ihrem Browser und brauchen kein Konto.
      Es werden dabei keine Daten an uns übertragen.</p>
    <div class="split">
      <div class="knowledge-card">
        <h3>${icon('check', 18)} Zuletzt angesehene Produkte</h3>
        <div data-recently-viewed><p class="muted small">Noch keine Produkte angesehen.</p></div>
      </div>
      <div class="knowledge-card">
        <h3>${icon('check', 18)} Merkliste</h3>
        <div data-favorites><p class="muted small">Noch keine Artikel vorgemerkt.</p></div>
      </div>
    </div>
  </div>

  ${backendNote(
    'Kundenkonto',
    [
      { method: 'POST', path: '/api/auth/register', desc: 'Registrierung, Passwort-Hashing serverseitig' },
      { method: 'POST', path: '/api/auth/login', desc: 'Login, Session über HttpOnly-Cookie' },
      { method: 'POST', path: '/api/auth/password-reset', desc: 'Passwort zurücksetzen per E-Mail-Token' },
      { method: 'GET', path: '/api/me/orders', desc: 'Bestellungen, Status und Rechnungen' },
      { method: 'GET/PUT', path: '/api/me/addresses', desc: 'Liefer- und Rechnungsadressen' },
    ],
    `<p><strong>Sicherheitsvorgabe:</strong> Passwörter werden nie im Frontend gespeichert oder gehasht.
     Die Sitzung gehört in ein <code>HttpOnly</code>-, <code>Secure</code>- und <code>SameSite</code>-Cookie,
     nicht in den LocalStorage.</p>`
  )}
</div></div>`;

  return {
    path: '/konto/',
    activeNav: null,
    title: 'Kundenkonto',
    metaTitle: `Kundenkonto | ${site.name}`,
    metaDescription: 'Anmelden oder Kundenkonto erstellen bei Räucherhaken24.',
    noindex: true,
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/konto/', label: 'Kundenkonto' },
    ],
    body,
  };
}

export function passwordResetPage() {
  const body = `<div class="page"><div class="wrap" style="max-width:640px">
  <div class="page-head">
    <h1>Passwort vergessen</h1>
    <p class="lead">Wir senden Ihnen einen Link zum Zurücksetzen an Ihre hinterlegte E-Mail-Adresse.</p>
  </div>
  <div class="form-card">
    <form data-auth-form="reset" novalidate>
      <div class="field">
        <label for="reset-email">E-Mail-Adresse</label>
        <input type="email" id="reset-email" name="email" required autocomplete="email" />
      </div>
      <button type="submit" class="btn btn-primary btn-block">Link anfordern</button>
      <div class="form-status" data-auth-status role="status"></div>
    </form>
  </div>
  <p style="margin-top:18px"><a href="/konto/">${icon('arrow', 15)} Zurück zur Anmeldung</a></p>
</div></div>`;

  return {
    path: '/konto/passwort-vergessen/',
    activeNav: null,
    title: 'Passwort vergessen',
    metaTitle: `Passwort vergessen | ${site.name}`,
    metaDescription: 'Passwort für Ihr Räucherhaken24-Konto zurücksetzen.',
    noindex: true,
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/konto/', label: 'Kundenkonto' },
      { href: '/konto/passwort-vergessen/', label: 'Passwort vergessen' },
    ],
    body,
  };
}

export function dealerPage() {
  const body = `<div class="page"><div class="wrap">
  <div class="page-head">
    <span class="eyebrow">Für Gewerbekunden</span>
    <h1>Händlerbereich</h1>
    <p class="lead">Nach Freischaltung sehen Sie Ihre Händlerpreise, Staffelpreise und Mindestmengen,
      können größere Mengen bestellen, Rechnungen herunterladen und schnell nachbestellen.</p>
  </div>

  <div class="note warn">
    <p><strong>Zugriffskontrolle:</strong> Händlerpreise werden ausschließlich serverseitig aufgelöst und nur an
    freigeschaltete, angemeldete Händlerkonten ausgeliefert. Sie sind zu keinem Zeitpunkt im Quelltext oder in
    den Daten dieser Seite enthalten – normale Endkunden können sie deshalb weder sehen noch auslesen.</p>
  </div>

  <div class="auth-layout" style="margin-top:24px">
    <div class="form-card">
      <h2 style="font-size:1.1rem;margin-top:0">Händler-Login</h2>
      <form data-auth-form="dealer-login" novalidate>
        <div class="field">
          <label for="dl-email">E-Mail-Adresse</label>
          <input type="email" id="dl-email" name="email" required autocomplete="email" />
        </div>
        <div class="field">
          <label for="dl-password">Passwort</label>
          <input type="password" id="dl-password" name="password" required autocomplete="current-password" />
        </div>
        <button type="submit" class="btn btn-primary btn-block">Anmelden</button>
        <div class="form-status" data-auth-status role="status"></div>
      </form>
    </div>

    <div class="form-card">
      <h2 style="font-size:1.1rem;margin-top:0">Händlerkonto beantragen</h2>
      <form data-auth-form="dealer-register" novalidate>
        <div class="form-grid">
          <div class="field span-2"><label for="dr-company">Firma *</label><input type="text" id="dr-company" name="company" required autocomplete="organization" /></div>
          <div class="field span-2"><label for="dr-vat">USt-IdNr. *</label><input type="text" id="dr-vat" name="vatId" required /></div>
          <div class="field"><label for="dr-name">Ansprechpartner *</label><input type="text" id="dr-name" name="contact" required /></div>
          <div class="field"><label for="dr-phone">Telefon</label><input type="tel" id="dr-phone" name="phone" autocomplete="tel" /></div>
          <div class="field span-2"><label for="dr-email">E-Mail-Adresse *</label><input type="email" id="dr-email" name="email" required autocomplete="email" /></div>
        </div>
        <p class="small muted">Die Freischaltung erfolgt nach manueller Prüfung. Erst danach werden Händlerpreise sichtbar.</p>
        <button type="submit" class="btn btn-primary btn-block">Antrag senden</button>
        <div class="form-status" data-auth-status role="status"></div>
      </form>
    </div>
  </div>

  <div class="content-block">
    <h2>Händlerstufen</h2>
    <div class="split">
      ${dealerTiers
        .map(
          (t) => `<div class="knowledge-card">
        <h3>${esc(t.label)}</h3>
        <p>${esc(t.note)}</p>
        <p class="small muted">Konditionen, Staffelpreise und Mindestmengen dieser Stufe werden nach der
          Freischaltung im eingeloggten Bereich angezeigt.</p>
      </div>`
        )
        .join('')}
    </div>
  </div>

  ${backendNote(
    'Händlerbereich',
    [
      { method: 'POST', path: '/api/dealer/apply', desc: 'Antrag auf Freischaltung inkl. USt-IdNr.' },
      { method: 'POST', path: '/api/auth/login', desc: 'Login mit Rollenprüfung (Rolle: dealer)' },
      { method: 'GET', path: '/api/dealer/prices', desc: 'Händler- und Staffelpreise, nur für freigeschaltete Rollen' },
      { method: 'GET', path: '/api/dealer/invoices', desc: 'Rechnungsdownload' },
      { method: 'GET', path: '/api/dealer/orders', desc: 'Bestellhistorie und Schnellnachbestellung' },
    ],
    `<p><strong>Sicherheitsvorgabe:</strong> Die Rollenprüfung muss bei jedem Request serverseitig erfolgen.
     Es genügt nicht, Händlerpreise im Frontend auszublenden – sie dürfen die Antwort für Endkunden gar nicht
     erst verlassen.</p>`
  )}
</div></div>`;

  return {
    path: '/haendler/',
    activeNav: null,
    title: 'Händlerbereich',
    metaTitle: `Händlerbereich für Gewerbekunden | ${site.name}`,
    metaDescription:
      'Händlerbereich von Räucherhaken24: Händlerpreise, Staffelpreise, Mindestmengen, Rechnungsdownload und schnelle Nachbestellung nach Freischaltung.',
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/haendler/', label: 'Händlerbereich' },
    ],
    body,
  };
}
