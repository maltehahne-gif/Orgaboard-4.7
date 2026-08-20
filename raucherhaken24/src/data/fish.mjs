/**
 * Räucherfisch-Guide.
 * Angegeben sind die in der Praxis etablierten Temperatur- und Zeitfenster.
 * Sie sind Richtwerte: Ofen, Größe und Fettgehalt verschieben sie immer etwas.
 * Verbindlich ist am Ende die Kerntemperatur, nicht die Uhr.
 */

export const HOT_SMOKE_CORE = '62 °C (mindestens 30 Minuten gehalten) bzw. sicher 65 °C';

export const fishes = [
  {
    slug: 'forelle',
    name: 'Forelle',
    method: 'Heißräuchern',
    level: 'Einsteiger',
    teaser: 'Der Klassiker und der beste Einstieg. Verzeiht Fehler und gelingt zuverlässig.',
    lead:
      'Die Forelle ist der Fisch, mit dem fast jeder anfängt. Sie ist gut verfügbar, hat eine feste Haut, hängt sicher am Haken und schmeckt schon beim ersten Versuch gut.',
    preparation: [
      'Fisch ausnehmen, die Blutlinie entlang der Wirbelsäule mit dem Daumennagel gründlich auskratzen – sie schmeckt sonst bitter.',
      'Innen und außen kalt abspülen.',
      'Kiemen entfernen, wenn der Kopf dranbleibt.',
    ],
    brine: 'Salzlake mit rund 6–8 % Salz oder eine fertige Räucherlauge nach Packungsangabe.',
    saltTime: '8–12 Stunden im Kühlen, üblicherweise über Nacht.',
    drying:
      'Abspülen, abtropfen lassen und 1–2 Stunden an der Luft trocknen, bis die Haut matt und leicht klebrig ist. Dieser Schritt entscheidet über Farbe und Rauchannahme.',
    hook: 'raeucherhaken-standard',
    hookNote: 'Bei sehr großen Forellen auf Doppeldorn wechseln.',
    wood: 'raeuchermehl-erle',
    woodNote: 'Erle für mild und fein, Buche für kräftiger und mehr Farbe.',
    temperature: 'Trocknen 40–50 °C, Garen 80–90 °C, anschließend Räuchern 60–70 °C.',
    duration: 'Insgesamt etwa 1,5–2,5 Stunden, davon 30–60 Minuten reine Rauchzeit.',
    coreTemp: HOT_SMOKE_CORE,
    mistakes: [
      'Fisch zu nass aufgehängt – die Haut wird fleckig und der Rauch haftet nicht.',
      'Blutlinie nicht entfernt – der Fisch schmeckt bitter.',
      'Zu heiß angefangen – die Haut platzt und der Fisch wird trocken.',
      'Zu viel Räuchermehl auf einmal – bitterer, beißender Geschmack.',
    ],
    proTips: [
      'Ein Kernthermometer im dicksten Teil hinter dem Kopf ersetzt jedes Zeitgefühl.',
      'Die Rückenflosse lässt sich beim garen Fisch leicht herausziehen – der klassische Handgriff zur Kontrolle.',
      'Abstand zwischen den Fischen halten, sonst bleiben helle Stellen ohne Rauch.',
    ],
    products: ['raeucherhaken-standard', 'raeucherlauge-forelle', 'raeuchermehl-erle', 'fischgewuerz'],
  },
  {
    slug: 'lachs',
    name: 'Lachs',
    method: 'Kalträuchern oder Warmräuchern',
    level: 'Fortgeschritten',
    teaser: 'Kalt geräuchert zum Aufschneiden, warm geräuchert als Stremellachs.',
    lead:
      'Beim Lachs müssen Sie sich zuerst entscheiden: kalt geräuchert – roh, schnittfest, für dünne Scheiben – oder warm geräuchert als Stremellachs, gegart und blättrig. Vorbereitung und Ausrüstung unterscheiden sich deutlich.',
    preparation: [
      'Filet bzw. Seite entgräten – Gräten mit der Grätenzange gegen die Wuchsrichtung ziehen.',
      'Haut dranlassen, sie gibt Halt beim Aufhängen und beim Schneiden.',
      'Auf gleichmäßige Dicke achten, sonst salzt der dünne Teil über.',
    ],
    brine:
      'Trockensalzung (Salz-Zucker-Mischung) oder Räucherlauge Lachs nach Packungsangabe. Trockensalzung ergibt ein festeres Ergebnis.',
    saltTime:
      'Je nach Dicke etwa 8–16 Stunden im Kühlschrank. Anschließend gründlich abspülen, sonst wird es zu salzig.',
    drying:
      '12–24 Stunden im Kühlschrank offen antrocknen lassen, bis sich eine glänzende, klebrige Pellicle bildet. Ohne Pellicle nimmt der Lachs den Rauch fleckig an.',
    hook: 'raeucherhaken-filet',
    hookNote: 'Für ganze Seiten Filethaken, bei hohem Gewicht zusätzlich Doppeldorn.',
    wood: 'raeuchermehl-erle',
    woodNote: 'Erle ist die klassische Wahl, Buche gibt mehr Farbe, Kirsche eine feine Fruchtnote.',
    temperature:
      'Kalträuchern: dauerhaft unter 25 °C, ideal 15–20 °C. Warmräuchern (Stremellachs): 70–85 °C.',
    duration:
      'Kalt: 2–4 Durchgänge à 8–12 Stunden mit Ruhephasen dazwischen. Warm: etwa 1–2 Stunden bis zur Kerntemperatur.',
    coreTemp:
      'Nur beim Warmräuchern relevant: ' + HOT_SMOKE_CORE + '. Kalt geräucherter Lachs bleibt roh.',
    mistakes: [
      'Zu warm kalt geräuchert – über 25 °C beginnt das Eiweiß zu garen, der Lachs wird strohig.',
      'Zu kurz oder gar nicht getrocknet – ungleichmäßige Farbe und Rauchgeschmack.',
      'Nach dem Salzen nicht abgespült – das Ergebnis ist deutlich zu salzig.',
      'Ohne Ruhephase durchgeräuchert – der Rauch wirkt scharf statt rund.',
    ],
    proTips: [
      'Kalträuchern gelingt im Sommer kaum. Die kühle Jahreszeit ist die Lachssaison.',
      'Nach dem letzten Rauchgang mindestens einen Tag im Kühlschrank ruhen lassen – das Aroma rundet sich deutlich.',
      'Für Stremellachs das Filet in breite Streifen schneiden, bevor es in den Rauch geht.',
    ],
    products: ['raeucherhaken-filet', 'raeucherlauge-lachs', 'raeuchermehl-erle', 'stremellachs-gewuerz'],
  },
  {
    slug: 'aal',
    name: 'Aal',
    method: 'Heißräuchern',
    level: 'Fortgeschritten',
    teaser: 'Der anspruchsvollste Kandidat: fett, schwer und extrem glatt.',
    lead:
      'Geräucherter Aal ist eine Spezialität – und der schwierigste Fisch am Haken. Wer die Vorbereitung sauber macht, wird mit einem sehr aromatischen Ergebnis belohnt.',
    preparation: [
      'Aal gründlich entschleimen: mit grobem Salz abreiben und kalt abspülen, bis die Haut nicht mehr rutscht. Dieser Schritt ist Pflicht.',
      'Ausnehmen und die Bauchhöhle sorgfältig säubern.',
      'Kopf dranlassen – daran wird aufgehängt.',
    ],
    brine: 'Räucherlauge Aal nach Packungsangabe oder kräftige Salzlake.',
    saltTime: 'Etwa 8–12 Stunden im Kühlen.',
    drying: 'Abspülen und gut antrocknen lassen. Ein feuchter Aal rutscht selbst vom richtigen Haken.',
    hook: 'raeucherhaken-standard-aal',
    hookNote: 'Der Aalhaken ist hier nicht optional – ein Standardhaken reißt zuverlässig aus.',
    wood: 'raeuchermehl-erle',
    woodNote: 'Erle oder Buche. Aal verträgt auch kräftigeren Rauch.',
    temperature: 'Trocknen 40–50 °C, Garen 70–80 °C, Räuchern 60–70 °C.',
    duration: 'Etwa 2–3 Stunden gesamt, abhängig von der Dicke des Aals.',
    coreTemp: HOT_SMOKE_CORE,
    mistakes: [
      'Nicht entschleimt – der Aal fällt vom Haken.',
      'Zu heiß gegart – das Fett läuft aus und der Aal wird trocken.',
      'Aale hängen sich berührend – an den Kontaktstellen bleiben helle Streifen.',
    ],
    proTips: [
      'Der klassische Gartest: Beim fertigen Aal stellen sich die Rückenflossen auf.',
      'Aal ist fett – etwas mehr Abstand zwischen den Fischen einplanen, damit Fett abtropfen kann.',
      'Nach dem Räuchern kurz abkühlen lassen, dann lässt er sich sauber vom Haken lösen.',
    ],
    products: ['raeucherhaken-standard-aal', 'raeucherlauge-aal', 'raeuchermehl-erle'],
  },
  {
    slug: 'makrele',
    name: 'Makrele',
    method: 'Heißräuchern',
    level: 'Einsteiger',
    teaser: 'Fett, kräftig und dankbar – gelingt fast immer saftig.',
    lead:
      'Die Makrele ist ein Fettfisch und dadurch ausgesprochen unempfindlich. Sie trocknet kaum aus und ist nach der Forelle der zweitbeste Einstiegsfisch.',
    preparation: [
      'Ausnehmen, Blutlinie entfernen, kalt abspülen.',
      'Kiemen herausnehmen.',
    ],
    brine: 'Salzlake mit rund 6–8 % Salz oder fertige Räucherlauge nach Packungsangabe.',
    saltTime: '6–10 Stunden im Kühlen.',
    drying: '1–2 Stunden antrocknen lassen.',
    hook: 'raeucherhaken-standard',
    hookNote: 'Bei sehr großen Makrelen Kralle oder Doppeldorn verwenden.',
    wood: 'raeuchermehl-buche',
    woodNote: 'Buche für den klassischen Geschmack, Birke für eine würzigere Note.',
    temperature: 'Trocknen 40–50 °C, Garen 80–90 °C, Räuchern 60–70 °C.',
    duration: 'Etwa 1,5–2 Stunden.',
    coreTemp: HOT_SMOKE_CORE,
    mistakes: [
      'Zu lange in der Lake – Makrele nimmt Salz schneller auf als Forelle.',
      'Zu heiß – die dünne Haut platzt auf.',
    ],
    proTips: [
      'Makrele ist ideal, um einen neuen Räucherofen einzufahren – sie verzeiht Temperaturschwankungen.',
      'Schmeckt lauwarm direkt aus dem Ofen am besten.',
    ],
    products: ['raeucherhaken-standard', 'raeuchermehl-buche', 'fischgewuerz'],
  },
  {
    slug: 'saibling',
    name: 'Saibling',
    method: 'Heißräuchern',
    level: 'Einsteiger',
    teaser: 'Feiner als die Forelle – braucht milden Rauch und etwas Fingerspitzengefühl.',
    lead:
      'Der Saibling ist der elegante Verwandte der Forelle: feineres Fleisch, zarterer Eigengeschmack. Genau deshalb sollte der Rauch hier zurückhaltend bleiben.',
    preparation: ['Ausnehmen, Blutlinie entfernen, kalt abspülen.'],
    brine: 'Etwas mildere Lake als bei der Forelle, rund 5–7 % Salz.',
    saltTime: '6–10 Stunden im Kühlen.',
    drying: '1–2 Stunden antrocknen lassen.',
    hook: 'raeucherhaken-standard',
    hookNote: 'Standardhaken reicht in der Regel aus.',
    wood: 'raeuchermehl-erle',
    woodNote: 'Erle oder Kirsche. Eiche ist hier zu dominant.',
    temperature: 'Trocknen 40–50 °C, Garen 75–85 °C, Räuchern 60–65 °C.',
    duration: 'Etwa 1,5–2 Stunden.',
    coreTemp: HOT_SMOKE_CORE,
    mistakes: [
      'Zu kräftiges Holz – der feine Eigengeschmack geht verloren.',
      'Zu lange gesalzen – Saibling ist empfindlicher als Forelle.',
    ],
    proTips: ['Weniger Rauch ist beim Saibling mehr. Lieber eine kürzere Rauchphase wählen.'],
    products: ['raeucherhaken-standard', 'raeuchermehl-erle', 'raeuchermehl-kirsche'],
  },
  {
    slug: 'hering',
    name: 'Hering',
    method: 'Heißräuchern',
    level: 'Einsteiger',
    teaser: 'Als Bückling ein Klassiker der Küste – schnell fertig, kräftig im Geschmack.',
    lead:
      'Heiß geräucherter Hering heißt traditionell Bückling. Er ist klein, geht schnell und ist eine gute Gelegenheit, gleich eine ganze Ofenladung zu machen.',
    preparation: [
      'Hering wird traditionell nicht ausgenommen, sondern im Ganzen geräuchert. Wer möchte, nimmt ihn aus.',
      'Kalt abspülen.',
    ],
    brine: 'Salzlake mit rund 8 % Salz.',
    saltTime: '3–6 Stunden – Heringe sind klein und nehmen Salz schnell auf.',
    drying: '1 Stunde antrocknen lassen.',
    hook: 'raeucherhaken-standard',
    hookNote: 'Kleine Fische lassen sich gut dicht an dicht aufhängen, aber ohne Berührung.',
    wood: 'raeuchermehl-buche',
    woodNote: 'Buche oder Birke – Hering verträgt kräftigen Rauch.',
    temperature: 'Trocknen 40 °C, Garen 70–80 °C, Räuchern 60–70 °C.',
    duration: 'Etwa 45–90 Minuten.',
    coreTemp: HOT_SMOKE_CORE,
    mistakes: ['Zu lange in der Lake – der Bückling wird ungenießbar salzig.'],
    proTips: ['Bücklinge schmecken frisch und lauwarm am besten und halten sich nur wenige Tage.'],
    products: ['raeucherhaken-standard', 'raeuchermehl-buche'],
  },
  {
    slug: 'zander',
    name: 'Zander',
    method: 'Heißräuchern',
    level: 'Fortgeschritten',
    teaser: 'Mager und edel – trocknet schnell aus, wenn die Temperatur nicht stimmt.',
    lead:
      'Zander hat sehr mageres, feines Fleisch. Das macht ihn kulinarisch hochwertig und beim Räuchern anspruchsvoll: Der schmale Grat zwischen saftig und trocken ist hier besonders schmal.',
    preparation: [
      'Ausnehmen, Blutlinie entfernen.',
      'Schuppen dranlassen – sie schützen das Fleisch vor dem Austrocknen.',
    ],
    brine: 'Milde Lake mit rund 5–6 % Salz.',
    saltTime: '6–8 Stunden im Kühlen.',
    drying: '1–2 Stunden antrocknen lassen.',
    hook: 'raeucherhaken-doppeldorn',
    hookNote: 'Größere Zander sicher aufhängen – Doppeldorn oder Kralle.',
    wood: 'raeuchermehl-erle',
    woodNote: 'Erle oder Kirsche, mild dosiert.',
    temperature: 'Trocknen 40–50 °C, Garen 70–80 °C, Räuchern 60–65 °C.',
    duration: 'Etwa 1,5–2 Stunden.',
    coreTemp: HOT_SMOKE_CORE,
    mistakes: [
      'Zu heiß gegart – Zander wird trocken und faserig.',
      'Zu lange geräuchert – das feine Aroma verschwindet.',
    ],
    proTips: [
      'Beim Zander lohnt sich das Kernthermometer besonders: bei 62 °C herausnehmen, nicht länger.',
    ],
    products: ['raeucherhaken-doppeldorn', 'raeuchermehl-erle', 'raeucherhaken-kralle'],
  },
  {
    slug: 'karpfen',
    name: 'Karpfen',
    method: 'Heißräuchern',
    level: 'Fortgeschritten',
    teaser: 'Schwer und kräftig – braucht eine stabile Aufhängung und Geduld.',
    lead:
      'Karpfen wird oft unterschätzt. Richtig vorbereitet und geräuchert ist er saftig und aromatisch – vorausgesetzt, er hängt sicher und wird nicht zu heiß gefahren.',
    preparation: [
      'Ausnehmen, Blutlinie gründlich entfernen.',
      'Große Karpfen längs teilen oder als Seiten räuchern.',
      'Bei Verdacht auf Erdgeschmack den Fisch vorher einige Tage in klarem Wasser hältern.',
    ],
    brine: 'Kräftigere Lake mit rund 7–8 % Salz.',
    saltTime: '10–14 Stunden im Kühlen.',
    drying: '2 Stunden antrocknen lassen.',
    hook: 'raeucherhaken-3-dorn',
    hookNote: 'Gewicht auf mehrere Punkte verteilen – 3-Dorn oder Doppeldorn.',
    wood: 'raeuchermehl-buche',
    woodNote: 'Buche, gern mit etwas Eiche für mehr Kraft.',
    temperature: 'Trocknen 40–50 °C, Garen 75–85 °C, Räuchern 60–70 °C.',
    duration: 'Etwa 2–3 Stunden je nach Größe.',
    coreTemp: HOT_SMOKE_CORE,
    mistakes: [
      'Zu leichte Aufhängung – der Karpfen reißt beim Garen ab.',
      'Erdgeschmack ignoriert – er verschwindet durch das Räuchern nicht.',
    ],
    proTips: ['Karpfenseiten hängen ruhiger als ganze Fische und garen gleichmäßiger.'],
    products: ['raeucherhaken-3-dorn', 'raeuchermehl-buche', 'raeuchermehl-eiche'],
  },
  {
    slug: 'heilbutt',
    name: 'Heilbutt',
    method: 'Kalträuchern',
    level: 'Profi',
    teaser: 'Kalt geräuchert eine Delikatesse – teuer im Einkauf, wenig Spielraum für Fehler.',
    lead:
      'Räucherheilbutt wird klassisch kalt geräuchert und hauchdünn aufgeschnitten. Wegen des hohen Warenwerts sollte man hier bereits Erfahrung mit Kaltrauch mitbringen.',
    preparation: [
      'Filet entgräten und auf gleichmäßige Dicke bringen.',
      'Haut je nach Zuschnitt belassen.',
    ],
    brine: 'Trockensalzung mit Salz-Zucker-Mischung.',
    saltTime: '8–14 Stunden im Kühlschrank, danach gründlich abspülen.',
    drying: '12–24 Stunden im Kühlschrank, bis sich eine Pellicle gebildet hat.',
    hook: 'raeucherhaken-filet',
    hookNote: 'Filethaken; alternativ auf einem Rost räuchern.',
    wood: 'raeuchermehl-erle',
    woodNote: 'Erle oder Buche, sehr zurückhaltend dosiert.',
    temperature: 'Dauerhaft unter 25 °C, ideal 15–20 °C.',
    duration: '2–3 Durchgänge à 8–12 Stunden mit Ruhephasen.',
    coreTemp: 'Nicht relevant – Kaltrauch gart nicht. Der Fisch bleibt roh.',
    mistakes: [
      'Zu warm geräuchert – das Filet gart an und verliert die Struktur.',
      'Zu viel Salz oder zu wenig gewässert – der feine Geschmack geht unter.',
    ],
    proTips: [
      'Kalt geräucherten Heilbutt vor dem Aufschneiden gut durchkühlen, dann gelingen dünne Scheiben.',
      'Nur einwandfreie, durchgehend gekühlte Rohware verwenden – das Produkt wird roh gegessen.',
    ],
    products: ['raeucherhaken-filet', 'raeuchermehl-erle'],
  },
  {
    slug: 'dorsch',
    name: 'Dorsch / Kabeljau',
    method: 'Heißräuchern',
    level: 'Fortgeschritten',
    teaser: 'Sehr mager und blättrig – die größte Herausforderung ist der Halt am Haken.',
    lead:
      'Dorsch hat mageres, großblättriges Fleisch. Es zerfällt leicht, sobald es gar ist. Deshalb kommt es hier besonders auf eine sichere Aufhängung und eine moderate Temperatur an.',
    preparation: [
      'Ausnehmen und gründlich abspülen.',
      'Kleine Dorsche im Ganzen, größere als Filet oder Seite räuchern.',
    ],
    brine: 'Milde bis mittlere Lake, rund 6 % Salz.',
    saltTime: '4–8 Stunden im Kühlen.',
    drying: '1–2 Stunden antrocknen lassen.',
    hook: 'raeucherhaken-kralle',
    hookNote: 'Kralle oder Filethaken – ein einzelner Dorn reißt im weichen Fleisch aus.',
    wood: 'raeuchermehl-buche',
    woodNote: 'Buche oder Erle.',
    temperature: 'Trocknen 40 °C, Garen 70–80 °C, Räuchern 60–65 °C.',
    duration: 'Etwa 1–2 Stunden.',
    coreTemp: HOT_SMOKE_CORE,
    mistakes: [
      'Zu spät aus dem Ofen – der Dorsch fällt vom Haken.',
      'Einzeldorn verwendet – reißt im weichen Fleisch aus.',
    ],
    proTips: [
      'Auf einem Rost statt am Haken zu räuchern ist beim Dorsch völlig legitim und deutlich stressfreier.',
    ],
    products: ['raeucherhaken-kralle', 'raeucherhaken-filet', 'raeuchermehl-buche'],
  },
];

export function getFish(slug) {
  return fishes.find((f) => f.slug === slug) || null;
}
