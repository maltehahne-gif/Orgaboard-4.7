# Marktanalyse: Geschäftsmodell mit OrgaBoard

*Stand: 19. August 2026 · Grundlage: OrgaBoard 4.7*

Diese Analyse beantwortet die Frage, mit welchem App-Geschäftsmodell sich aus dem
vorhandenen Stand tatsächlich Umsatz erzielen lässt. Sie beruht auf veröffentlichten
Markt- und Benchmark-Daten, **nicht** auf einem Live-Abruf aktueller App-Store- oder
Play-Store-Charts.

## Empfehlung

**Keine neue App bauen. OrgaBoard markenneutral machen und als Abo an Vertriebsteams
im Direktvertrieb verkaufen.**

Das ist der einzige der drei geprüften Wege, bei dem nicht bei null gestartet wird,
kein Werbe-Etat gegen Big Tech nötig ist und pro gewonnenem Kunden sofort ein ganzes
Team abgerechnet wird statt einer einzelnen Person.

## Ausgangslage: der App-Markt 2026

| Kennzahl | Wert |
|---|---|
| Konsumausgaben beider Stores 2026 | 233 Mrd. $ (App Store 161 Mrd., Google Play 72 Mrd.) |
| Anteil Abos am Konsumumsatz | 96 % |
| Umsatz pro Download | 0,67 $ (iOS) vs. 0,11 $ (Google Play) |
| Umsatzwachstum mit sichtbaren KI-Funktionen | ca. 4× gegenüber Apps ohne |
| Abo-Anteil der Kategorie „Business“ | 76,5 % |
| Realisierter Lifetime-Umsatz pro Zahler | 34,82 $ (hochpreisig) vs. 10,69 $ (niedrigpreisig) |
| Median-Zeit bis 1.000 $ MRR, Business-Apps | 113 Tage (Gaming: 32 Tage) |

Bei 0,67 $ Umsatz pro Download braucht das Consumer-Geschäft Millionen Installationen,
bevor etwas übrig bleibt. Die relevante Frage ist deshalb nicht „welche App“, sondern
„welcher Kunde zahlt freiwillig 20 € im Monat und kündigt nicht“.

## Weg 1 (empfohlen): OrgaBoard als White-Label-Plattform für Direktvertriebsteams

### Vorhandene Substanz

Laut [`docs/IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) sind 27 von 30
Kriterien erledigt: Kunden, Termine, Verkäufe mit mehreren Artikeln,
Produktvorstellungen, Verleih, automatische Umsatz- und Einheitenberechnung,
Monatsziele, Teamleiter-Dashboard, Buntewoche mit PDF-Export, serverseitige Rollen,
KI-Assistent mit Tool-Calling, Sprachein- und -ausgabe.

Heute ist das eine Vorwerk-Teamlösung für acht Personen. Funktional ist es eine
Direktvertriebs-Plattform für jede Struktur – Tupperware, PM International, Ringana,
Juice Plus, Thermomix-Berater, Versicherungs- und Energievertriebe. Der Unterschied
zwischen „acht Nutzer“ und „ein Produkt“ ist Mandantenfähigkeit, ein Bezahlvorgang und
ein austauschbarer Produktkatalog.

### Marktgröße

| Kennzahl | Wert |
|---|---|
| Weltweiter Direktvertrieb 2026 | 175–237 Mrd. $ |
| Direktvertriebler weltweit | über 100 Mio. |
| Software für den Sektor | 1,34 Mrd. $ (2026) → 2,58 Mrd. $ (2033), CAGR 9,8 % |
| Retention branchenspezifisches vs. generisches SaaS | ca. 2× (Forrester 2025) |

### Vertriebsansatz

Nicht an den Konzern verkaufen, sondern an den Teamleiter. Ein Teamleiter mit zwölf
Leuten entscheidet allein, zahlt selbst und bringt zwölf Sitze auf einmal mit. Die
Kundenakquisekosten verteilen sich damit sofort auf ein Dutzend Abos, und die Struktur
des Direktvertriebs – Teamleiter reden ständig mit anderen Teamleitern – ist ein
eingebauter Empfehlungskanal.

### Modellrechnung

Annahme: 19 € pro Nutzer und Monat, durchschnittlich 12 Nutzer je Team.

| Ausbaustufe | Teams | Zahlende Nutzer | MRR | ARR |
|---|---:|---:|---:|---:|
| Pilot (Monat 1–6) | 10 | 120 | 2.280 € | 27.360 € |
| Jahr 1 | 50 | 600 | 11.400 € | 136.800 € |
| Jahr 2 | 200 | 2.400 | 45.600 € | 547.200 € |
| Jahr 3–4 | 600 | 7.200 | 136.800 € | 1.641.600 € |

Der Stack (FastAPI, PostgreSQL, React) kostet pro Nutzer nur Cent-Beträge im Hosting;
realistisch sind ca. 85 % Bruttomarge. Bei 200 Teams bleiben rund 465.000 €
Deckungsbeitrag im Jahr. 600 Teams entsprechen bei über 100 Mio. Direktvertrieblern
weltweit einem sehr kleinen Marktanteil – die Zahl ist bewusst konservativ gewählt.

> Die Preisannahme von 19 € pro Sitz ist eine Annahme, keine Prognose. Sie muss in
> echten Gesprächen validiert werden, bevor darauf geplant wird.

### Risiken

1. **Markenrechte.** Der Vorwerk-Bezug muss aus Name, UI und Marketing verschwinden,
   der Produktkatalog vom Kunden selbst befüllbar sein. Das README erkennt das Problem
   für Produktdaten bereits an (keine erfundenen Daten, Import nur aus freigegebenen
   Quellen) – für ein verkäufliches Produkt muss das konsequent auf die Marke
   ausgeweitet werden.
2. **Eigene Konzerntools.** Manche Vertriebsfirmen rollen eigene Werkzeuge aus. Die
   Verteidigung ist Firmenunabhängigkeit: Wer den Anbieter wechselt oder mehrere Linien
   führt, behält seine Daten. Ein Konzerntool kann das nicht.
3. **DSGVO.** Es werden fremde Kundendaten im Auftrag verarbeitet. AV-Verträge,
   Löschkonzept, EU-Hosting und die in [`docs/SECURITY.md`](SECURITY.md) offenen Punkte
   zur Adressauflösung über öffentliche OSM-Dienste müssen **vor** dem ersten zahlenden
   Kunden geschlossen sein.

## Weg 2 (Alternative): KI-Telefonassistent für Handwerk und Praxen

Der schnellste Weg zu Cashflow. Der Markt für KI-Sprachagenten liegt im ersten Quartal
2026 bei 4,8 Mrd. $ nach 3,3 Mrd. $ im Vorjahr (ca. 47 % jährliches Wachstum). Ein
Solo-Betreiber auf einer White-Label-Plattform erreicht mit 10–20 Kunden à rund 500 $
Monatsretainer etwa 3.000–9.000 $ Gewinn im Monat bei ca. 90 % Bruttomarge.
Zahnarztpraxen führen die Adoption an: 30–50 Anrufe täglich auf zwei bis drei Kräfte am
Empfang, ein verpasster Neupatient kostet über 1.200 $ Lebenszeitwert.

**Nachteil:** kein App-Store-Geschäft, sondern Dienstleistung mit Direktvertrieb und
Onboarding pro Kunde. Die Umsatzobergrenze hängt an der eigenen Arbeitszeit, und es
entsteht kein verkaufbarer Unternehmenswert.

## Weg 3 (Alternative): Utility-Abo mit KI-Kern, iOS zuerst, USA zuerst

Falls es eine klassische Store-App sein soll, ist datenseitig genau eine Kombination
belegbar: Utilities plus sichtbares KI-Feature, hochpreisig, mit Wochenabo.

- Utilities erzielen den höchsten Wert pro Trial-Nutzer: 68,90 $ über zwölf Monate.
- 73,6 % des Utility-Abo-Umsatzes laufen über Wochenpläne.
- Hochpreisige Apps konvertieren besser (2,7 % vs. 1,5 % bis Tag 35) und erreichen im
  ersten Jahr den siebenfachen Lifetime-Wert pro Zahler.
- Bis Tag 60 liegen zwischen bester und schlechtester Region bis zu 5× Unterschied im
  Umsatz pro Installation; Nordamerika führt mit 0,55 $.

**Nachteil:** Ohne Werbe-Etat gibt es keine Installationen, die Konkurrenz macht das
hauptberuflich, und Apple behält 15–30 %. Von den drei Wegen das schlechteste
Verhältnis von Einsatz zu Erfolgswahrscheinlichkeit.

## Nicht empfohlen: eine fertige App kaufen

Über Marktplätze wie Acquire.com (über 500 Mio. $ Transaktionsvolumen, 2.000+
abgeschlossene Deals) sind bootstrapped SaaS-Firmen für 3–5× ARR zu haben, Micro-SaaS
unter 10.000 $ MRR für 2,5–4× SDE; der Medianpreis lag zuletzt bei 3,9× Gewinn. Die
Multiples sind von 17× (2022) auf rund 5,5× (Ende 2025) gefallen – ein Käufermarkt.

Trotzdem kauft man damit fremden Code, fremde technische Schulden und ein Produkt, bei
dem nichts über den Markt gelernt wurde. Sinnvoll ist ein Zukauf nur als *Vertriebs*kauf:
wenn ein Wettbewerber im Direktvertriebs-Segment bereits zahlende Teams hat und deren
Kundenliste migriert wird. Dann werden Kunden gekauft, nicht Software.

## Die ersten 90 Tage für Weg 1

Reihenfolge bewusst so gewählt: erst beweisen, dass jemand zahlt, dann bauen.

| Zeitraum | Schritt | Inhalt |
|---|---|---|
| Tag 1–14 | Zehn Gespräche vor der ersten Codezeile | Teamleiter aus verschiedenen Strukturen befragen. Leitfrage: „Was kostet dich dein aktuelles Chaos jeden Monat?“ Nennt niemand eine Zahl, fehlt die Zahlungsbereitschaft. |
| Tag 15–45 | Markenneutral und mandantenfähig | Vorwerk-Bezüge entfernen, Organisation als oberste Datenebene einziehen, Produktkatalog pro Mandant befüllbar, Logo und Farben pro Mandant konfigurierbar. |
| Tag 46–70 | Bezahlen, Einladen, Betreiben | Stripe-Abo pro Sitz, Selbstregistrierung mit Team-Einladung, EU-Hosting mit Backups und Monitoring, AV-Vertragsvorlage und Löschkonzept. |
| Tag 71–90 | Zehn Pilotteams zum halben Preis | 9 € statt 19 € pro Sitz gegen wöchentliches Feedback und Referenznennung. Ziel ist nicht Umsatz, sondern belastbare Kündigungsquoten. |

**Erfolgskriterium:** Wie viele der zehn Pilotteams zahlen nach sechs Monaten den vollen
Preis? Bei sieben oder mehr trägt das Geschäft und Vertrieb ist die richtige Investition.
Bei drei oder weniger existiert ein Werkzeug, das Leute nett finden, aber nicht brauchen –
dann ist Weg 2 der ehrlichere Plan.

## Quellen

- [Sensor Tower – 5-Year Market Forecast: App Spending Will Reach $233 Billion by 2026](https://sensortower.com/blog/sensor-tower-app-market-forecast-2026)
- [RevenueCat – State of Subscription Apps 2026](https://www.revenuecat.com/state-of-subscription-apps) und [Business-Teilbericht](https://www.revenuecat.com/state-of-subscription-apps-2026-business/)
- [Airbridge – Subscription App Pricing by Category: 2026 Benchmarks](https://www.airbridge.io/en/blog/subscription-app-pricing-by-category-2026-benchmark)
- [Epixel – Direct selling 2026: Key growth markets](https://www.epixelmlmsoftware.com/blog/global-direct-selling-growth-hotspots)
- [Stats N Data – Global MLM Software Market 2026–2033](https://www.statsndata.org/report/mlm-software-market-151591)
- [asappz – Vertical SaaS 2026](https://www.asappz.com/blog/vertical-saas-2026) · [Business Research Insights – Vertical SaaS Market Size](https://www.businessresearchinsights.com/market-reports/vertical-saas-market-117289)
- [Trillet – Voice AI Market Size and Agency Opportunity 2026](https://trillet.ai/blogs/voice-ai-market-size-and-agency-opportunity-2026) · [AInora – State of AI Voice Agents 2026](https://ainora.lt/blog/state-of-ai-voice-agents-report-2026)
- [Acquire.com – Biannual Acquisition Multiples Report, Januar 2026](https://blog.acquire.com/acquire-com-biannual-acquisition-multiples-report-jan-2026/) · [bigideasdb – SaaS Valuation Multiples 2026](https://bigideasdb.com/saas-valuation-multiples-2026)

> Marktgrößen stammen von Analysehäusern und weichen je nach Quelle und Abgrenzung
> erheblich voneinander ab. Die Modellrechnung ist eine Annahme, keine Prognose.
