# Räucherhaken24

Webshop, digitaler Räucher-Fachberater und Wissensportal in einem – als statisch
generierte Seite ohne Framework und ohne Laufzeit-Abhängigkeiten.

> **Wichtiger Hinweis zum Stand:** Dieses Projekt wurde als **neue Basis** aufgebaut.
> Die Designrichtung (hell, Braun-/Orange-Farbwelt, Produktkarten, große weiße
> Produktbildflächen, linke Kategorienavigation) wurde aus der Beschreibung
> rekonstruiert. Logo, Produktfotos, Preise, Maße und Unternehmensdaten sind
> **nicht enthalten** – sie sind bewusst als offene Felder markiert und werden
> nirgends geschätzt oder erfunden.

## Starten

```bash
npm run start      # baut nach dist/ und startet die Vorschau auf Port 4173
```

Einzeln:

```bash
npm run build      # erzeugt dist/
npm run preview    # statischer Vorschauserver (http://localhost:4173)
npm run check      # Qualitätssicherung: tote Links, SEO, offene Daten
npm run qa         # Browser-Abnahme mit Playwright (optional, siehe unten)
```

Node ab Version 18. Für `npm run build`, `preview` und `check` werden **keine**
Pakete benötigt. Nur `npm run qa` braucht Playwright:

```bash
npm install        # installiert Playwright als einzige devDependency
npm run preview &  # Server muss laufen
npm run qa
```

## Was fertig ist und funktioniert

| Bereich | Stand |
|---|---|
| 105 statische Seiten mit eigenem Title, Meta-Description, Canonical, OpenGraph | fertig |
| Linke Kategorienavigation, Haupt- und Unterkategorien optisch getrennt | fertig |
| Produktseiten mit Galerie, Zoom, Varianten, Menge, Spezifikationen, FAQ | fertig |
| Räucherfisch-Guide (10 Arten), Schinken (8 Arten), Holzarten (5), Körnungen (4) | fertig |
| Räucherwissen: VA/V2A/V4A, Temperaturen, Räucherzeiten, Anfängerwissen u. a. | fertig |
| Interaktive Berater für Räuchermehl und Räucherhaken | fertig |
| KI-Räucherberater unten rechts: Text, Spracheingabe, Sprachausgabe, Verlauf | fertig |
| Warenkorb inkl. Menge, Entfernen, Zwischensumme, Gutscheinfeld | fertig |
| Suche über Produkte, Fischarten, Schinken, Holzarten, Wissensseiten | fertig |
| Schema.org: Product, Offer, BreadcrumbList, FAQPage, Article, Recipe | fertig |
| sitemap.xml, robots.txt, 404-Seite | fertig |
| Responsive inkl. mobiler Kategorie-Drawer und Kaufbalken | fertig |

## Was noch ein Backend braucht

Diese Funktionen sind im Frontend vollständig vorbereitet, **melden aber offen,
dass sie nicht angebunden sind**. Es wird nichts vorgetäuscht:

| Funktion | Benötigte Schnittstelle |
|---|---|
| Bestellung abschließen | `POST /api/orders` |
| Zahlung | `POST /api/payments/session` |
| Gutscheinprüfung | `POST /api/vouchers/redeem` |
| Registrierung / Login | `POST /api/auth/register`, `POST /api/auth/login` |
| Passwort zurücksetzen | `POST /api/auth/password-reset` |
| Bestellungen, Rechnungen, Adressen | `GET /api/me/orders`, `GET/PUT /api/me/addresses` |
| Händlerpreise und -konditionen | `GET /api/dealer/prices` (nur Rolle `dealer`) |
| Kontaktformular | `POST /api/contact` |

**Sicherheitsvorgaben für die Anbindung:**

* Passwörter werden nie im Frontend gespeichert, gehasht oder verarbeitet.
  Die Sitzung gehört in ein `HttpOnly`/`Secure`/`SameSite`-Cookie, nicht in den
  LocalStorage.
* Händlerpreise werden ausschließlich serverseitig aufgelöst. Sie dürfen die
  Antwort für Endkunden gar nicht erst verlassen – Ausblenden im Frontend genügt
  nicht.
* Preise, Bestände und Gutscheine werden bei der Bestellung serverseitig neu
  geprüft, nie aus dem Browser übernommen.

## Daten pflegen

Alle Inhalte liegen als Daten in `src/data/`. Templates lesen ausschließlich von
dort – es gibt keinen zweiten Datenstand.

| Datei | Inhalt |
|---|---|
| `site.mjs` | Unternehmensdaten, Versand, Zahlarten, Social-Media-Profile |
| `catalog.mjs` | **Produktkatalog** – Preise, Varianten, Maße, Bilder |
| `categories.mjs` | Kategoriebaum der linken Navigation |
| `fish.mjs` | Räucherfisch-Guide |
| `hams.mjs` | Schinkenarten |
| `woods.mjs` | Holzarten |
| `knowledge.mjs` | Wissensartikel |
| `advisors.mjs` | Fragen und Regeln der interaktiven Berater |

### Preise eintragen

In `src/data/catalog.mjs` beim Produkt `price: null` durch eine Zahl ersetzen,
bei Varianten zusätzlich `price` je Variante:

```js
{
  slug: 'raeucherhaken-standard',
  price: 3.90,
  variants: [
    { id: 'v2a', label: 'V2A', material: 'v2a', price: 3.90, sku: 'RH-STD-V2A' },
    { id: 'v4a', label: 'V4A', material: 'v4a', price: 5.40, sku: 'RH-STD-V4A' },
  ],
}
```

Danach ändert sich automatisch: Preisanzeige, „In den Warenkorb“ statt
„Auf die Anfrageliste“, Warenkorbsumme und das `Offer` in den strukturierten Daten.

### Produktfotos

Bilder nach `src/assets/img/produkte/` legen und im Katalog eintragen:

```js
images: ['/assets/img/produkte/raeucherhaken-standard-1.jpg',
         '/assets/img/produkte/raeucherhaken-standard-2.jpg'],
```

Ab dem zweiten Bild erscheint automatisch eine Thumbnail-Galerie. Produktbilder
werden grundsätzlich mit `object-fit: contain` auf weißer Fläche dargestellt und
**nie beschnitten**.

### Logo und Branding

`src/assets/img/logo.svg` ist ein Platzhalter und muss durch das echte Logo
ersetzt werden (gleicher Dateiname, dann ist nichts weiter zu tun). Ebenso
`favicon.svg` und `og-default.svg`.

### Schriften und Farben

Zentral in `src/assets/css/site.css` unter `:root`. Für die echten Hausschriften
genügt es, `--font-body` und `--font-head` zu ändern.

## Struktur

```
raucherhaken24/
├── build.mjs              Seitengenerator
├── scripts/
│   ├── serve.mjs          Vorschauserver
│   ├── check.mjs          Linkprüfung, SEO-Prüfung, TODO-Bericht
│   └── qa.mjs             Browser-Abnahme (Playwright)
├── src/
│   ├── data/              alle Inhalte
│   ├── templates/
│   │   ├── layout.mjs     Seitengerüst inkl. SEO-Head
│   │   ├── components.mjs Produktkarte, Kategorienavigation, Blöcke
│   │   └── pages/         die einzelnen Seitentypen
│   └── assets/
│       ├── css/site.css   Designsystem
│       ├── js/app.js      Warenkorb, Suche, Galerie, Formulare, Berater
│       ├── js/berater.js  KI-Räucherberater
│       └── img/
└── dist/                  Build-Ergebnis (nicht eingecheckt)
```

## Qualitätssicherung

`npm run check` prüft bei jedem Lauf:

* tote interne Links und fehlende Assets
* Title, Meta-Description, Canonical und genau eine H1 pro Seite
* `<img>` ohne `alt`
* Produktverweise aus Fisch-, Schinken-, Holz- und Beraterdaten
* und listet alle offenen Datenfelder auf

`npm run qa` klickt zusätzlich im echten Browser durch: Warenkorb, Gutschein,
Checkout-Validierung, beide Berater, den Chat, Suche, Galerie-Zoom, mobile
Navigation und prüft auf horizontales Überlaufen und Konsolenfehler.

## Inhaltliche Grundsätze

Diese Regeln sind im Code umgesetzt, nicht nur dokumentiert:

* **Keine erfundenen Preise.** Ohne gepflegten Preis steht „Preis auf Anfrage“,
  der Artikel wird nicht in die Summe gerechnet.
* **Keine erfundenen technischen Daten.** Fehlende Maße stehen als „noch nicht
  hinterlegt“ – auch der Berater weigert sich, Tragkräfte zu schätzen.
* **Keine erfundenen Pökeldosierungen.** Überall gilt: Angabe des Herstellers auf
  der Packung. Es steht bewusst keine Grammzahl in den Anleitungen.
* **Keine erfundenen Social-Media-Profile.** Ohne hinterlegte URL wird kein
  Button gerendert.
* **Keine Fake-Bewertungen.** Es gibt keine Review-Daten und kein
  `aggregateRating` in den strukturierten Daten.
