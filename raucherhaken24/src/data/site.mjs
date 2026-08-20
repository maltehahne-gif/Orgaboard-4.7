/**
 * Zentrale Seiten- und Unternehmenskonfiguration.
 *
 * WICHTIG: Hier stehen bewusst KEINE erfundenen Daten.
 * Alles was `null` ist, muss vor dem Livegang mit echten Angaben gefuellt werden.
 * Der Build meldet jedes offene Feld (siehe `npm run check`).
 */

export const site = {
  name: 'Räucherhaken24',
  // TODO: Endgueltige Domain bestaetigen (Umlaut-Domain ggf. zusaetzlich als IDN).
  baseUrl: 'https://www.raucherhaken24.de',
  locale: 'de-DE',
  claim: 'Räucherbedarf, Fachwissen und Beratung aus einer Hand',
  description:
    'Räucherhaken, Räuchermehl, Räucherlaugen und Pökelmischungen – mit verständlicher Beratung, Räucherwissen und Rezepten für Einsteiger und Profis.',
};

/**
 * Unternehmensdaten fuer Impressum, Kontakt, Rechnungen und strukturierte Daten.
 * Fehlende Angaben NICHT erfinden - sie bleiben `null` und werden im Frontend
 * sichtbar als offen gekennzeichnet.
 */
export const company = {
  legalName: null, // TODO: vollstaendige Firmierung inkl. Rechtsform
  ownerName: null, // TODO: Vertretungsberechtigte Person
  street: null, // TODO
  zip: null, // TODO
  city: null, // TODO
  country: 'Deutschland',
  phone: null, // TODO
  email: null, // TODO: Kontakt-E-Mail
  vatId: null, // TODO: USt-IdNr. nach §27a UStG
  registerCourt: null, // TODO: Registergericht, falls eingetragen
  registerNumber: null, // TODO: HRB/HRA-Nummer, falls eingetragen
  disputeResolution:
    'Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung bereit: https://ec.europa.eu/consumers/odr',
};

/**
 * Versand- und Zahlungskonditionen.
 * Solange `null`, zeigt der Warenkorb offen an, dass die Kosten noch nicht
 * hinterlegt sind - es wird kein Betrag geschaetzt oder erfunden.
 */
export const commerce = {
  currency: 'EUR',
  currencySymbol: '€',
  vatRateNote: 'Alle Preise verstehen sich inkl. gesetzlicher MwSt. zzgl. Versandkosten.',
  shipping: {
    flatRate: null, // TODO: Versandkostenpauschale Inland in Euro
    freeFrom: null, // TODO: Versandkostenfrei ab Betrag in Euro
    note: 'Versandkosten sind noch nicht hinterlegt.',
  },
  paymentMethods: [
    // TODO: Nur tatsaechlich angebundene Zahlarten aktivieren (`enabled: true`).
    { id: 'invoice', label: 'Rechnung', enabled: false },
    { id: 'prepayment', label: 'Vorkasse / Überweisung', enabled: false },
    { id: 'paypal', label: 'PayPal', enabled: false },
    { id: 'card', label: 'Kreditkarte', enabled: false },
  ],
  /**
   * Gutscheincodes werden serverseitig geprueft. Diese Liste ist bewusst leer:
   * Es gibt keine erfundenen Testcodes. Die Pruefung im Frontend meldet daher
   * korrekt "Code unbekannt", bis das Backend angebunden ist.
   */
  vouchers: [],
};

/**
 * Social-Media-Profile. Es werden ausschliesslich echte, hinterlegte URLs
 * verlinkt. Bleibt `url` auf `null`, wird der Button NICHT gerendert.
 */
export const social = [
  { id: 'facebook', label: 'Facebook', url: null }, // TODO: echte Profil-URL
  { id: 'instagram', label: 'Instagram', url: null }, // TODO
  { id: 'youtube', label: 'YouTube', url: null }, // TODO
  { id: 'pinterest', label: 'Pinterest', url: null }, // TODO
  { id: 'whatsapp', label: 'WhatsApp', url: null }, // TODO: wa.me-Link des Geschaeftskontos
];

/** Haendlerstufen. Konditionen werden ausschliesslich serverseitig aufgeloest. */
export const dealerTiers = [
  { id: 'bronze', label: 'Bronze', note: 'Einstiegsstufe für gewerbliche Kunden.' },
  { id: 'silver', label: 'Silber', note: 'Für regelmäßige Bestellungen.' },
  { id: 'gold', label: 'Gold', note: 'Für hohe Abnahmemengen und Wiederverkäufer.' },
];
