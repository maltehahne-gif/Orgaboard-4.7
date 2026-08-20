import { esc, icon } from '../util.mjs';
import { site, company, commerce } from '../../data/site.mjs';

/** Zeigt eine Unternehmensangabe oder markiert sie sichtbar als offen. */
function field(label, value, hint = '') {
  if (value) return `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
  return `<div><dt>${esc(label)}</dt><dd><span class="badge badge-todo">TODO – noch nicht hinterlegt</span>${
    hint ? ` <span class="small muted">${esc(hint)}</span>` : ''
  }</dd></div>`;
}

const reviewNote = `<div class="note warn">
  <p><strong>Hinweis zum Rechtstext:</strong> Dieser Text ist ein strukturiertes Gerüst und
  <strong>keine Rechtsberatung</strong>. Er muss vor dem Livegang durch einen geprüften, auf das Angebot
  zugeschnittenen Text ersetzt oder anwaltlich geprüft werden. Die Abschnitte sind bewusst einzeln
  gegliedert, damit sie sich Absatz für Absatz austauschen lassen
  (<code>src/templates/pages/legal.mjs</code>).</p>
</div>`;

function legalShell({ path, title, metaTitle, metaDescription, intro, sections, extra = '' }) {
  const body = `<div class="page"><div class="wrap">
  <div class="page-head">
    <span class="eyebrow">Rechtliches</span>
    <h1>${esc(title)}</h1>
    ${intro ? `<p class="lead">${esc(intro)}</p>` : ''}
  </div>
  ${reviewNote}
  <article class="article">
    ${sections
      .map(
        (s) => `<section><h2>${esc(s.h)}</h2>${s.body}</section>`
      )
      .join('\n')}
  </article>
  ${extra}
</div></div>`;

  return {
    path,
    activeNav: null,
    title,
    metaTitle: metaTitle || `${title} | ${site.name}`,
    metaDescription,
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: path, label: title },
    ],
    body,
  };
}

export function imprintPage() {
  return legalShell({
    path: '/impressum/',
    title: 'Impressum',
    metaDescription: 'Impressum und Anbieterkennzeichnung von Räucherhaken24.',
    intro: 'Angaben gemäß § 5 DDG (vormals § 5 TMG).',
    sections: [
      {
        h: 'Anbieter',
        body: `<div class="factbox"><dl class="factlist">
          ${field('Firma', company.legalName, 'vollständige Firmierung inkl. Rechtsform')}
          ${field('Vertreten durch', company.ownerName)}
          ${field('Straße, Hausnummer', company.street)}
          ${field('PLZ', company.zip)}
          ${field('Ort', company.city)}
          ${field('Land', company.country)}
        </dl></div>`,
      },
      {
        h: 'Kontakt',
        body: `<div class="factbox"><dl class="factlist">
          ${field('Telefon', company.phone)}
          ${field('E-Mail', company.email)}
        </dl></div>`,
      },
      {
        h: 'Registereintrag und Umsatzsteuer',
        body: `<div class="factbox"><dl class="factlist">
          ${field('Registergericht', company.registerCourt, 'nur bei eingetragenen Unternehmen')}
          ${field('Registernummer', company.registerNumber, 'nur bei eingetragenen Unternehmen')}
          ${field('USt-IdNr. nach § 27a UStG', company.vatId)}
        </dl></div>
        <p class="small muted">Fehlende Angaben werden bewusst nicht erfunden. Sie sind zentral in
        <code>src/data/site.mjs</code> zu pflegen und erscheinen dann automatisch auf allen Seiten.</p>`,
      },
      {
        h: 'Verbraucherstreitbeilegung',
        body: `<p>${esc(company.disputeResolution)}</p>
        <p>Ob und in welchem Umfang eine Teilnahme an einem Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle erfolgt, ist hier verbindlich zu ergänzen.
        <span class="badge badge-todo">TODO</span></p>`,
      },
      {
        h: 'Haftung für Inhalte und Links',
        body: `<p>Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen
        Gesetzen verantwortlich. Für Inhalte externer Links ist der jeweilige Anbieter verantwortlich.
        Bei Bekanntwerden von Rechtsverletzungen werden entsprechende Inhalte umgehend entfernt.</p>`,
      },
      {
        h: 'Hinweis zu Räucher- und Lebensmittelthemen',
        body: `<p>Die Anleitungen, Temperatur- und Zeitangaben auf dieser Website sind Erfahrungswerte und
        allgemeine Informationen. Sie ersetzen keine lebensmittelrechtliche Beratung. Für Pökelmischungen,
        Räucherlaugen und Gewürze gilt immer die Dosier-, Zeit- und Sicherheitsangabe des Herstellers auf
        der jeweiligen Verpackung.</p>`,
      },
    ],
  });
}

export function privacyPage() {
  return legalShell({
    path: '/datenschutz/',
    title: 'Datenschutzerklärung',
    metaDescription: 'Datenschutzerklärung von Räucherhaken24: Verarbeitung personenbezogener Daten, Rechte der Betroffenen.',
    intro: 'Informationen zur Verarbeitung personenbezogener Daten nach Art. 13 DSGVO.',
    sections: [
      {
        h: '1. Verantwortlicher',
        body: `<p>Verantwortlich für die Datenverarbeitung auf dieser Website ist der im
        <a href="/impressum/">Impressum</a> genannte Anbieter. Solange die Unternehmensdaten dort noch nicht
        vollständig hinterlegt sind, ist diese Angabe unvollständig.
        <span class="badge badge-todo">TODO</span></p>`,
      },
      {
        h: '2. Daten, die beim Besuch der Website anfallen',
        body: `<p>Beim Aufruf der Seiten werden vom Webserver technisch notwendige Daten verarbeitet
        (unter anderem IP-Adresse, Zeitpunkt, aufgerufene Seite, übertragene Datenmenge, Browsertyp).
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Die konkreten Speicherfristen des eingesetzten
        Hosters sind hier zu ergänzen. <span class="badge badge-todo">TODO: Hoster und Löschfristen</span></p>`,
      },
      {
        h: '3. Warenkorb, Merkliste und zuletzt angesehene Produkte',
        body: `<p>Warenkorb, Merkliste und die Liste zuletzt angesehener Produkte werden ausschließlich lokal
        in Ihrem Browser gespeichert (<code>localStorage</code>). Diese Daten werden nicht an uns übertragen
        und nicht ausgewertet. Sie können sie jederzeit über die Einstellungen Ihres Browsers löschen.</p>`,
      },
      {
        h: '4. Räucherberater',
        body: `<p>Der Räucherberater beantwortet Fragen derzeit vollständig im Browser auf Basis unserer
        eigenen Produkt- und Wissensdaten. Ihre Eingaben verlassen Ihr Gerät dabei nicht.</p>
        <p>Sollte später ein externer KI-Dienst angebunden werden, ist dieser Abschnitt zwingend um Anbieter,
        Rechtsgrundlage, Auftragsverarbeitungsvertrag und gegebenenfalls Drittlandübermittlung zu ergänzen.
        <span class="badge badge-todo">TODO bei Anbindung eines externen Dienstes</span></p>`,
      },
      {
        h: '5. Spracheingabe und Sprachausgabe',
        body: `<p>Für Spracheingabe und Sprachausgabe wird die Spracherkennung bzw. Sprachsynthese Ihres
        Browsers verwendet (Web Speech API). Je nach Browser und Betriebssystem kann die Verarbeitung der
        Sprachdaten beim jeweiligen Browser- oder Betriebssystemhersteller stattfinden. Wir selbst erhalten
        keine Audiodaten. Die Funktion wird nur aktiv, wenn Sie sie ausdrücklich starten.</p>`,
      },
      {
        h: '6. Kundenkonto, Bestellung und Zahlung',
        body: `<p>Für Registrierung, Bestellabwicklung und Zahlung werden die dafür erforderlichen Daten
        verarbeitet (Art. 6 Abs. 1 lit. b DSGVO). Zahlungsdienstleister, Versanddienstleister und
        Speicherfristen sind zu ergänzen, sobald die entsprechenden Systeme angebunden sind.
        <span class="badge badge-todo">TODO</span></p>`,
      },
      {
        h: '7. Cookies und Reichweitenmessung',
        body: `<p>Diese Website setzt derzeit keine Analyse-, Tracking- oder Marketing-Cookies ein und bindet
        keine externen Schriftarten, Karten oder Videos ein. Sollte sich das ändern, sind ein
        Einwilligungsbanner und die entsprechenden Angaben hier verpflichtend zu ergänzen.</p>`,
      },
      {
        h: '8. Ihre Rechte',
        body: `<ul>
          <li>Auskunft über die verarbeiteten Daten (Art. 15 DSGVO)</li>
          <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
          <li>Löschung (Art. 17 DSGVO)</li>
          <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
          <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
          <li>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)</li>
          <li>Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO)</li>
        </ul>`,
      },
    ],
  });
}

export function termsPage() {
  return legalShell({
    path: '/agb/',
    title: 'Allgemeine Geschäftsbedingungen',
    metaDescription: 'AGB von Räucherhaken24: Vertragsschluss, Preise, Lieferung, Zahlung und Gewährleistung.',
    intro: 'Bedingungen für Bestellungen über diesen Onlineshop.',
    sections: [
      {
        h: '§ 1 Geltungsbereich',
        body: `<p>Diese Allgemeinen Geschäftsbedingungen gelten für alle Bestellungen, die Verbraucher und
        Unternehmer über diesen Onlineshop aufgeben. Für gewerbliche Kunden im Händlerbereich können ergänzende
        Konditionen gelten. <span class="badge badge-todo">TODO: Händler-AGB ergänzen</span></p>`,
      },
      {
        h: '§ 2 Vertragspartner',
        body: `<p>Der Kaufvertrag kommt zustande mit dem im <a href="/impressum/">Impressum</a> genannten
        Anbieter. <span class="badge badge-todo">TODO: Firmierung ergänzen</span></p>`,
      },
      {
        h: '§ 3 Vertragsschluss',
        body: `<p>Die Darstellung der Produkte im Onlineshop stellt kein rechtlich bindendes Angebot dar,
        sondern eine Aufforderung zur Bestellung. Mit dem Absenden der Bestellung geben Sie ein verbindliches
        Angebot ab. Der Vertrag kommt mit der Bestellbestätigung bzw. mit dem Versand der Ware zustande –
        die verbindliche Formulierung ist an den tatsächlichen Bestellprozess anzupassen, sobald dieser
        angebunden ist. <span class="badge badge-todo">TODO</span></p>`,
      },
      {
        h: '§ 4 Preise und Versandkosten',
        body: `<p>${esc(commerce.vatRateNote)} Die Höhe der Versandkosten ist noch nicht hinterlegt und wird
        unter <a href="/zahlung-versand/">Zahlung &amp; Versand</a> ausgewiesen.
        <span class="badge badge-todo">TODO: Versandkosten festlegen</span></p>`,
      },
      {
        h: '§ 5 Lieferung',
        body: `<p>Lieferzeiten, Liefergebiete und Teillieferungen sind verbindlich zu ergänzen.
        <span class="badge badge-todo">TODO</span></p>`,
      },
      {
        h: '§ 6 Zahlung',
        body: `<p>Die angebotenen Zahlungsarten werden im Bestellprozess angezeigt. Derzeit ist noch kein
        Zahlungsdienstleister angebunden. <span class="badge badge-todo">TODO</span></p>`,
      },
      {
        h: '§ 7 Eigentumsvorbehalt',
        body: `<p>Die Ware bleibt bis zur vollständigen Bezahlung Eigentum des Anbieters.</p>`,
      },
      {
        h: '§ 8 Gewährleistung',
        body: `<p>Es gilt das gesetzliche Mängelhaftungsrecht.</p>`,
      },
      {
        h: '§ 9 Hinweis zu Lebensmitteln und Zusatzstoffen',
        body: `<p>Für Pökelmischungen, Räucherlaugen und Gewürze gelten die Angaben auf der jeweiligen
        Verpackung. Zutaten-, Allergen- und Dosierangaben sind der Produktverpackung zu entnehmen und haben
        Vorrang vor allgemeinen Hinweisen auf dieser Website.</p>`,
      },
    ],
  });
}

export function withdrawalPage() {
  return legalShell({
    path: '/widerruf/',
    title: 'Widerrufsbelehrung',
    metaDescription: 'Widerrufsbelehrung und Muster-Widerrufsformular für Bestellungen bei Räucherhaken24.',
    intro: 'Widerrufsrecht für Verbraucher.',
    sections: [
      {
        h: 'Widerrufsrecht',
        body: `<p>Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu
        widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag, an dem Sie oder ein von Ihnen
        benannter Dritter, der nicht der Beförderer ist, die Waren in Besitz genommen haben bzw. hat.</p>
        <p>Um Ihr Widerrufsrecht auszuüben, müssen Sie uns mittels einer eindeutigen Erklärung
        (z. B. per Post oder E-Mail) über Ihren Entschluss informieren. Die vollständigen Kontaktdaten
        für den Widerruf sind zu ergänzen. <span class="badge badge-todo">TODO: Anschrift und E-Mail</span></p>`,
      },
      {
        h: 'Folgen des Widerrufs',
        body: `<p>Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen
        erhalten haben, einschließlich der Lieferkosten (mit Ausnahme zusätzlicher Kosten aufgrund einer
        anderen Lieferart als der günstigsten Standardlieferung), unverzüglich und spätestens binnen vierzehn
        Tagen zurückzuzahlen.</p>
        <p>Wer die unmittelbaren Kosten der Rücksendung trägt, ist verbindlich festzulegen.
        <span class="badge badge-todo">TODO</span></p>`,
      },
      {
        h: 'Ausschluss bzw. vorzeitiges Erlöschen des Widerrufsrechts',
        body: `<p>Bei bestimmten Waren kann das Widerrufsrecht ausgeschlossen sein oder vorzeitig erlöschen –
        etwa bei versiegelten Waren, die aus Gründen des Gesundheitsschutzes oder der Hygiene nicht zur
        Rückgabe geeignet sind, wenn ihre Versiegelung nach der Lieferung entfernt wurde. Ob und für welche
        Artikel des Sortiments dies gilt, ist rechtlich zu prüfen und hier konkret zu benennen.
        <span class="badge badge-todo">TODO: rechtliche Prüfung erforderlich</span></p>`,
      },
      {
        h: 'Muster-Widerrufsformular',
        body: `<div class="factbox">
        <p class="small muted">Wenn Sie den Vertrag widerrufen wollen, füllen Sie bitte dieses Formular aus
        und senden Sie es zurück.</p>
        <p>An: <span class="badge badge-todo">TODO: Firma, Anschrift, E-Mail</span></p>
        <p>Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der
        folgenden Waren (*):</p>
        <p>Bestellt am (*) / erhalten am (*):<br />
        Name des/der Verbraucher(s):<br />
        Anschrift des/der Verbraucher(s):<br />
        Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier):<br />
        Datum:</p>
        <p class="small muted">(*) Unzutreffendes streichen.</p>
        </div>`,
      },
    ],
  });
}

export function shippingPage() {
  const paid = commerce.paymentMethods.filter((p) => p.enabled);
  return legalShell({
    path: '/zahlung-versand/',
    title: 'Zahlung & Versand',
    metaDescription: 'Zahlungsarten, Versandkosten und Lieferzeiten bei Räucherhaken24.',
    intro: 'Konditionen für Zahlung und Lieferung.',
    sections: [
      {
        h: 'Versandkosten',
        body: `<div class="factbox"><dl class="factlist">
          ${field('Versandkostenpauschale Inland', commerce.shipping.flatRate, 'Betrag in Euro festlegen')}
          ${field('Versandkostenfrei ab', commerce.shipping.freeFrom, 'Bestellwert festlegen')}
          ${field('Lieferzeit', null, 'übliche Lieferzeit in Werktagen angeben')}
          ${field('Liefergebiete', null, 'Inland / EU / weltweit festlegen')}
        </dl></div>
        <p class="small muted">Solange hier keine Werte hinterlegt sind, weist der Warenkorb die Versandkosten
        ausdrücklich als „noch nicht hinterlegt“ aus und schätzt keinen Betrag.</p>`,
      },
      {
        h: 'Zahlungsarten',
        body: paid.length
          ? `<ul>${paid.map((p) => `<li>${esc(p.label)}</li>`).join('')}</ul>`
          : `<p>Es ist noch keine Zahlungsart angebunden. Die im Bestellprozess sichtbaren Optionen sind
             deshalb deaktiviert. <span class="badge badge-todo">TODO: Zahlungsdienstleister anbinden</span></p>`,
      },
      {
        h: 'Verpackung',
        body: `<p>Räucherhaken werden so verpackt, dass die Spitzen gesichert sind. Räuchermehl, Laugen und
        Gewürze werden trocken und verschlossen versendet.</p>`,
      },
    ],
  });
}

export function contactPage() {
  const body = `<div class="page"><div class="wrap">
  <div class="page-head">
    <span class="eyebrow">Kontakt</span>
    <h1>Kontakt</h1>
    <p class="lead">Fragen zu einem Artikel, zu Maßen oder zu einer verbindlichen Auskunft? Schreiben Sie uns.</p>
  </div>

  <div class="auth-layout">
    <div class="form-card">
      <h2 style="font-size:1.1rem;margin-top:0">Nachricht senden</h2>
      <form data-contact-form novalidate>
        <div class="form-grid">
          <div class="field"><label for="ct-name">Name *</label><input type="text" id="ct-name" name="name" required autocomplete="name" /></div>
          <div class="field"><label for="ct-email">E-Mail *</label><input type="email" id="ct-email" name="email" required autocomplete="email" /></div>
          <div class="field span-2">
            <label for="ct-topic">Thema</label>
            <select id="ct-topic" name="topic">
              <option>Produktfrage</option>
              <option>Bestellung</option>
              <option>Händleranfrage</option>
              <option>Räucherberatung</option>
              <option>Sonstiges</option>
            </select>
          </div>
          <div class="field span-2">
            <label for="ct-message">Nachricht *</label>
            <textarea id="ct-message" name="message" rows="6" required></textarea>
          </div>
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="ct-privacy" required />
          <label for="ct-privacy">Ich habe die <a href="/datenschutz/">Datenschutzerklärung</a> gelesen. *</label>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Nachricht senden</button>
        <div class="form-status" data-contact-status role="status"></div>
      </form>
    </div>

    <div>
      <div class="form-card">
        <h2 style="font-size:1.1rem;margin-top:0">Direkter Kontakt</h2>
        <dl class="factlist">
          ${field('Telefon', company.phone)}
          ${field('E-Mail', company.email)}
          ${field('Anschrift', company.street && company.city ? `${company.street}, ${company.zip || ''} ${company.city}` : null)}
        </dl>
      </div>
      <div class="backend-note">
        <h3>${icon('info', 16)} Kontaktformular</h3>
        <p>Das Formular prüft Ihre Eingaben, versendet aber noch nichts – ein Mailversand ist bewusst nicht
          vorgetäuscht. Benötigt wird <code>POST /api/contact</code> mit serverseitigem Spam-Schutz.</p>
      </div>
      <div class="knowledge-card" style="margin-top:18px">
        <h3>Schneller geht es oft so</h3>
        <p>Für die häufigsten Fragen gibt es fertige Antworten:</p>
        <p><a class="btn btn-secondary" href="/berater/haken/">Haken-Berater</a>
           <a class="btn btn-secondary" href="/berater/raeuchermehl/">Räuchermehl-Berater</a></p>
      </div>
    </div>
  </div>
</div></div>`;

  return {
    path: '/kontakt/',
    activeNav: '/kontakt/',
    title: 'Kontakt',
    metaTitle: `Kontakt | ${site.name}`,
    metaDescription: 'Kontakt zu Räucherhaken24 – Fragen zu Produkten, Bestellungen und Räucherberatung.',
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/kontakt/', label: 'Kontakt' },
    ],
    body,
  };
}
