import { esc, icon } from '../util.mjs';
import { site, commerce } from '../../data/site.mjs';

function backendNote(title, endpoints) {
  return `<div class="backend-note">
    <h3>${icon('info', 16)} ${esc(title)}</h3>
    <p>Diese Funktion ist im Frontend vollständig vorbereitet, aber noch nicht an ein Backend angebunden.
      Es wird bewusst nicht vorgetäuscht, dass sie bereits funktioniert.</p>
    <p>Benötigte Schnittstellen:</p>
    <ul style="margin:6px 0 0;padding-left:18px">
      ${endpoints.map((e) => `<li><code>${esc(e.method)} ${esc(e.path)}</code> – ${esc(e.desc)}</li>`).join('')}
    </ul>
  </div>`;
}

export function cartPage() {
  const body = `<div class="page"><div class="wrap">
  <div class="page-head">
    <h1>Warenkorb</h1>
    <p class="lead">Artikel ohne hinterlegten Preis erscheinen als Anfrageposition. Sie werden nicht mitgerechnet,
      solange kein Preis gepflegt ist – wir schätzen keine Beträge.</p>
  </div>

  <div class="cart-layout" data-cart-page>
    <div>
      <div class="cart-list" data-cart-list></div>
      <div class="empty-state" data-cart-empty hidden>
        ${icon('cart', 40)}
        <h2 style="font-size:1.15rem">Ihr Warenkorb ist leer</h2>
        <p class="muted">Stöbern Sie im Sortiment oder lassen Sie sich beraten.</p>
        <p style="margin-top:14px">
          <a class="btn btn-primary" href="/shop/">Zum Shop</a>
          <a class="btn btn-secondary" href="/berater/">Beratung starten</a>
        </p>
      </div>
    </div>

    <aside class="cart-summary" data-cart-summary hidden>
      <h2 style="font-size:1.1rem;margin-top:0">Zusammenfassung</h2>
      <div class="sum-row"><span>Zwischensumme</span><strong data-sum-subtotal>–</strong></div>
      <div class="sum-row" data-sum-request-row hidden>
        <span>Anfragepositionen</span><strong data-sum-request>0</strong>
      </div>
      <div class="sum-row"><span>Versandkosten</span><strong data-sum-shipping>–</strong></div>
      <div class="sum-row" data-sum-discount-row hidden><span>Rabatt</span><strong data-sum-discount>–</strong></div>
      <div class="sum-row total"><span>Gesamt</span><strong data-sum-total>–</strong></div>

      <form class="voucher-row" data-voucher-form>
        <label class="visually-hidden" for="voucher">Gutscheincode</label>
        <input type="text" id="voucher" placeholder="Gutscheincode" autocomplete="off" />
        <button type="submit" class="btn btn-secondary" style="min-height:44px">Einlösen</button>
      </form>
      <div class="form-status" data-voucher-status role="status"></div>

      <a class="btn btn-primary btn-block" href="/kasse/" style="margin-top:14px">Zur Kasse</a>
      <p class="small muted" style="margin-top:10px">${esc(commerce.vatRateNote)}</p>
      <p class="small muted">${icon('truck', 13)} ${esc(commerce.shipping.note)}</p>
    </aside>
  </div>

  ${backendNote('Warenkorb und Preise', [
    { method: 'GET', path: '/api/products', desc: 'geprüfte Preise, Varianten und Lagerbestände' },
    { method: 'POST', path: '/api/cart/validate', desc: 'serverseitige Preis- und Bestandsprüfung' },
    { method: 'POST', path: '/api/vouchers/redeem', desc: 'Gutscheinprüfung (nur serverseitig zulässig)' },
  ])}
</div></div>`;

  return {
    path: '/warenkorb/',
    activeNav: '/shop/',
    title: 'Warenkorb',
    metaTitle: `Warenkorb | ${site.name}`,
    metaDescription: 'Ihr Warenkorb bei Räucherhaken24.',
    noindex: true,
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/warenkorb/', label: 'Warenkorb' },
    ],
    body,
  };
}

export function checkoutPage() {
  const payments = commerce.paymentMethods
    .map(
      (p) => `<label class="radio-option${p.enabled ? '' : ' is-disabled'}">
      <input type="radio" name="payment" value="${esc(p.id)}"${p.enabled ? '' : ' disabled'} />
      <span><strong>${esc(p.label)}</strong>
      <small>${p.enabled ? 'Verfügbar' : 'Noch nicht angebunden – wird nach Anbindung des Zahlungsdienstleisters aktiv.'}</small></span>
    </label>`
    )
    .join('');

  const body = `<div class="page"><div class="wrap">
  <div class="page-head">
    <h1>Kasse</h1>
    <p class="lead">Ihre Angaben werden ausschließlich in Ihrem Browser geprüft und noch nicht übertragen.</p>
  </div>

  <div class="cart-layout">
    <form data-checkout-form novalidate>
      <div class="form-card">
        <h2 style="font-size:1.1rem;margin-top:0">Kontakt</h2>
        <div class="form-grid">
          <div class="field span-2">
            <label for="co-email">E-Mail-Adresse *</label>
            <input type="email" id="co-email" name="email" required autocomplete="email" />
          </div>
        </div>
      </div>

      <div class="form-card">
        <h2 style="font-size:1.1rem;margin-top:0">Rechnungsadresse</h2>
        <div class="form-grid">
          <div class="field"><label for="co-first">Vorname *</label><input type="text" id="co-first" name="firstName" required autocomplete="given-name" /></div>
          <div class="field"><label for="co-last">Nachname *</label><input type="text" id="co-last" name="lastName" required autocomplete="family-name" /></div>
          <div class="field span-2"><label for="co-company">Firma (optional)</label><input type="text" id="co-company" name="company" autocomplete="organization" /></div>
          <div class="field span-2"><label for="co-street">Straße und Hausnummer *</label><input type="text" id="co-street" name="street" required autocomplete="street-address" /></div>
          <div class="field"><label for="co-zip">PLZ *</label><input type="text" id="co-zip" name="zip" required inputmode="numeric" autocomplete="postal-code" /></div>
          <div class="field"><label for="co-city">Ort *</label><input type="text" id="co-city" name="city" required autocomplete="address-level2" /></div>
          <div class="field span-2">
            <label for="co-country">Land *</label>
            <select id="co-country" name="country" required>
              <option value="DE">Deutschland</option>
              <option value="AT">Österreich</option>
              <option value="CH">Schweiz</option>
            </select>
          </div>
        </div>
      </div>

      <div class="form-card">
        <h2 style="font-size:1.1rem;margin-top:0">Lieferadresse</h2>
        <div class="checkbox-row">
          <input type="checkbox" id="co-same" name="sameAddress" checked data-toggle-shipping />
          <label for="co-same">Lieferadresse entspricht der Rechnungsadresse</label>
        </div>
        <div class="form-grid" data-shipping-fields hidden>
          <div class="field"><label for="sh-first">Vorname</label><input type="text" id="sh-first" name="shFirstName" /></div>
          <div class="field"><label for="sh-last">Nachname</label><input type="text" id="sh-last" name="shLastName" /></div>
          <div class="field span-2"><label for="sh-street">Straße und Hausnummer</label><input type="text" id="sh-street" name="shStreet" /></div>
          <div class="field"><label for="sh-zip">PLZ</label><input type="text" id="sh-zip" name="shZip" inputmode="numeric" /></div>
          <div class="field"><label for="sh-city">Ort</label><input type="text" id="sh-city" name="shCity" /></div>
        </div>
      </div>

      <div class="form-card">
        <h2 style="font-size:1.1rem;margin-top:0">Zahlungsart</h2>
        <div class="radio-list">${payments}</div>
        <div class="note warn" style="margin-top:14px"><p>Es ist noch keine Zahlungsart angebunden.
          Sobald ein Zahlungsdienstleister eingerichtet ist, werden die entsprechenden Optionen hier aktiv.</p></div>
      </div>

      <div class="form-card">
        <div class="checkbox-row">
          <input type="checkbox" id="co-terms" name="terms" required />
          <label for="co-terms">Ich habe die <a href="/agb/">AGB</a>, die
            <a href="/widerruf/">Widerrufsbelehrung</a> und die
            <a href="/datenschutz/">Datenschutzerklärung</a> gelesen und akzeptiere sie. *</label>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Bestellung prüfen</button>
        <div class="form-status" data-checkout-status role="status"></div>
      </div>
    </form>

    <aside class="cart-summary">
      <h2 style="font-size:1.1rem;margin-top:0">Bestellübersicht</h2>
      <div data-checkout-items></div>
      <div class="sum-row"><span>Zwischensumme</span><strong data-sum-subtotal>–</strong></div>
      <div class="sum-row"><span>Versandkosten</span><strong data-sum-shipping>–</strong></div>
      <div class="sum-row total"><span>Gesamt</span><strong data-sum-total>–</strong></div>
      <p class="small muted" style="margin-top:10px">${esc(commerce.vatRateNote)}</p>
      <button type="button" class="btn btn-secondary btn-block" data-print-order style="margin-top:10px">
        ${icon('print', 16)} Übersicht drucken
      </button>
    </aside>
  </div>

  ${backendNote('Bestellabwicklung', [
    { method: 'POST', path: '/api/orders', desc: 'Bestellung anlegen, Preise und Bestand serverseitig prüfen' },
    { method: 'POST', path: '/api/payments/session', desc: 'Zahlungsvorgang beim Dienstleister starten' },
    { method: 'GET', path: '/api/orders/:id', desc: 'Bestellstatus und Bestellbestätigung' },
  ])}
</div></div>`;

  return {
    path: '/kasse/',
    activeNav: '/shop/',
    title: 'Kasse',
    metaTitle: `Kasse | ${site.name}`,
    metaDescription: 'Bestellung abschließen bei Räucherhaken24.',
    noindex: true,
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/warenkorb/', label: 'Warenkorb' },
      { href: '/kasse/', label: 'Kasse' },
    ],
    body,
  };
}
