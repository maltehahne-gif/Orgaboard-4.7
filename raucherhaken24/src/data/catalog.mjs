/**
 * PRODUKTKATALOG - EINZIGE QUELLE DER WAHRHEIT
 * =============================================
 * Shop, Produktseiten, Berater, KI-Assistent, Warenkorb und strukturierte Daten
 * lesen ausschliesslich aus dieser Datei. Es gibt keinen zweiten Datenstand.
 *
 * REGELN (bewusst so umgesetzt):
 *  - `price: null`  -> Preis ist NICHT gepflegt. Es wird kein Preis geschaetzt
 *                      oder erfunden. Das Frontend zeigt "Preis auf Anfrage".
 *  - `specs.*: null`-> Technische Angabe liegt nicht vor. Es wird nichts geraten.
 *  - `images: []`   -> Kein Produktbild vorhanden, es wird ein neutraler
 *                      Platzhalter auf weisser Flaeche gezeigt.
 *
 * Sobald echte Werte eingetragen werden, aendert sich die Darstellung
 * automatisch (Preis, Warenkorb-Button, Schema.org Offer, Galerie).
 */

/** Materialoptionen fuer Haken. Bezeichnungen nach Werkstoffnummer. */
export const materials = {
  va: {
    id: 'va',
    label: 'VA (Sammelbegriff)',
    steelNo: null,
    summary:
      '„VA" ist kein eigener Werkstoff, sondern die Abkürzung für „Versuchsschmelze Austenit" und wird umgangssprachlich für rostfreie Edelstähle benutzt. Wer „VA" liest, sollte immer nachfragen, ob V2A oder V4A gemeint ist.',
  },
  v2a: {
    id: 'v2a',
    label: 'V2A (1.4301 / 1.4571-frei)',
    steelNo: '1.4301',
    summary:
      'Der klassische rostfreie Edelstahl. Für Süßwasser, normale Küchen- und Räucherbedingungen sehr gut geeignet und deutlich günstiger als V4A.',
  },
  v4a: {
    id: 'v4a',
    label: 'V4A (1.4571 / 1.4404)',
    steelNo: '1.4571',
    summary:
      'Enthält zusätzlich Molybdän und ist dadurch deutlich widerstandsfähiger gegen Chloride – also gegen Salz. Erste Wahl bei Salzlake, Meerwasser und Dauerbelastung.',
  },
};

/** Koernungen des Raeuchermehls. Millimeterangaben bewusst offen (TODO). */
export const grains = [
  {
    id: 'k1',
    label: 'Körnung 1 – fein',
    mm: null, // TODO: exakte Siebweite aus eigener Produktspezifikation eintragen
    text:
      'Feinste Körnung. Glimmt sehr gleichmäßig und lange, ohne stark aufzuflammen. Besonders gut für Räucherschnecken (Kaltrauchgeneratoren) und für langes Kalträuchern geeignet.',
    best: ['Räucherschnecke', 'Kalträuchern', 'Käse', 'Schinken'],
  },
  {
    id: 'k2',
    label: 'Körnung 2 – mittelfein',
    mm: null, // TODO
    text:
      'Der Allrounder. Läuft in der Schnecke noch zuverlässig und eignet sich gleichzeitig gut für die Räucherpfanne oder den Sparbrand im Warm- und Heißrauch.',
    best: ['Kalträuchern', 'Warmräuchern', 'Heißräuchern', 'Fisch'],
  },
  {
    id: 'k3',
    label: 'Körnung 3 – grob',
    mm: null, // TODO
    text:
      'Gibt mehr Rauch in kürzerer Zeit. Typisch für den Heißrauch im Räucherofen, wenn das Mehl direkt auf die Wärmequelle kommt.',
    best: ['Heißräuchern', 'Räucherofen', 'Fisch'],
  },
  {
    id: 'k4',
    label: 'Körnung 4 – sehr grob',
    mm: null, // TODO
    text:
      'Grobe Späne für kräftigen, schnellen Rauch bei hoher Temperatur. Für Räucherschnecken ist diese Körnung nicht gedacht – sie fällt durch und verlischt.',
    best: ['Heißräuchern', 'Grill', 'Fleisch'],
  },
];

const hookVariants = [
  // TODO: Nur die Varianten aktiv lassen, die tatsaechlich im Sortiment sind.
  { id: 'v2a', label: 'V2A', material: 'v2a', price: null, sku: null },
  { id: 'v4a', label: 'V4A', material: 'v4a', price: null, sku: null },
];

const emptySpecs = {
  material: null, // wird bei Haken ueber die Variante bestimmt
  laenge: null, // TODO: Laenge in mm
  staerke: null, // TODO: Drahtstaerke in mm
  inhalt: null, // TODO: Fuellmenge / Gewicht
  gewicht: null, // TODO
};

export const products = [
  /* ============================ RÄUCHERHAKEN ============================ */
  {
    slug: 'raeucherhaken-standard',
    name: 'Räucherhaken Standard',
    category: 'raeucherhaken',
    sub: 'raeucherhaken-standard',
    short: 'Der klassische Einzeldorn-Haken für Forelle, Makrele und ähnliche Fische.',
    lead:
      'Der Standard-Räucherhaken ist der Haken, mit dem die meisten anfangen – und bei dem die meisten bleiben. Ein Dorn wird durch den Kopf des Fisches gestochen, der Fisch hängt senkrecht im Rauch.',
    price: null,
    variants: hookVariants,
    specs: { ...emptySpecs },
    what:
      'Ein einteiliger Räucherhaken aus rostfreiem Edelstahl mit einem Dorn und einer Aufhängung für Räucherstange oder Rohr.',
    forWhom:
      'Für alle, die Fische in typischer Portionsgröße räuchern – Forelle, Makrele, Saibling, kleinere Salmoniden. Der richtige Einstieg für Anfänger.',
    when:
      'Immer dann, wenn der Fisch im Ganzen geräuchert wird und ein einzelner Durchstich genug Halt gibt. Bei sehr schweren oder sehr weichen Fischen besser Doppeldorn oder 3-Dorn wählen.',
    whichVariant:
      'Räuchern Sie überwiegend Süßwasserfisch und spülen die Haken nach Gebrauch ab, reicht V2A. Wer regelmäßig in kräftiger Salzlake arbeitet oder die Haken lange feucht liegen lässt, fährt mit V4A langfristig besser.',
    application: [
      'Fisch nach dem Lakebad gut abtropfen und antrocknen lassen.',
      'Den Dorn von unten durch das Maul oder direkt hinter dem Kopf durch das feste Kopffleisch stechen.',
      'Der Haken muss im Knochen bzw. im festen Gewebe sitzen, nicht nur im Bauchlappen.',
      'Fisch an der Räucherstange senkrecht aufhängen, Abstand zum Nachbarfisch lassen, damit der Rauch überall hinkommt.',
    ],
    care: [
      'Direkt nach dem Räuchern warm abspülen, solange Fett und Eiweiß noch weich sind.',
      'Keine Stahlwolle und keine Drahtbürste aus normalem Stahl verwenden – Fremdrost setzt sich auf der Oberfläche fest.',
      'Trocken lagern. Feuchte Haken in geschlossenen Boxen sind die häufigste Ursache für Flugrost.',
    ],
    safety: [
      'Die Dornen sind spitz – beim Transport und beim Einhängen auf Abstand achten.',
      'Haken erst prüfen, bevor der volle Räucherofen bewegt wird.',
    ],
    faq: [
      {
        q: 'Wie viele Haken brauche ich?',
        a: 'Als Faustregel einen Haken pro Fisch, plus einige Ersatzhaken. Wie viele Fische nebeneinander Platz haben, hängt von der Breite Ihres Räucherofens ab.',
      },
      {
        q: 'Kann ich den Standardhaken auch für Fleisch verwenden?',
        a: 'Für kleinere Stücke ja. Für Schinken und schwere Fleischstücke ist ein Fleischerhaken in S-Form die bessere Wahl, weil er die Last besser verteilt.',
      },
    ],
    suitedFor: ['forelle', 'makrele', 'saibling', 'hering'],
    tags: ['haken', 'einsteiger', 'forelle', 'standard'],
    related: ['raeucherhaken-doppeldorn', 'raeucherhaken-kralle', 'raeuchermehl-buche'],
    images: [], // TODO: echte Produktfotos auf weissem Hintergrund hinterlegen
  },
  {
    slug: 'raeucherhaken-kralle',
    name: 'Räucherhaken Kralle',
    category: 'raeucherhaken',
    sub: 'raeucherhaken-kralle',
    short: 'Mehrere Spitzen greifen wie eine Kralle – sicherer Halt bei weichem Fleisch.',
    lead:
      'Der Krallenhaken verteilt die Last auf mehrere Spitzen. Dadurch reißt weiches Gewebe deutlich seltener aus als beim einzelnen Dorn.',
    price: null,
    variants: hookVariants,
    specs: { ...emptySpecs },
    what:
      'Räucherhaken, dessen Ende in mehrere nach innen gebogene Spitzen ausläuft. Diese Spitzen greifen gemeinsam in das Räuchergut.',
    forWhom:
      'Für alle, denen schon einmal ein Fisch vom Haken gefallen ist. Besonders sinnvoll bei fettem, weichem oder sehr warmem Räuchergut.',
    when:
      'Wenn Fisch oder Fleisch beim Heißräuchern weich wird und der Einzeldorn ausreißen könnte, oder wenn Stücke ohne festen Knochenpunkt aufgehängt werden.',
    whichVariant:
      'Wie bei allen Haken: V2A für Süßwasser und normale Nutzung, V4A bei intensivem Salzkontakt.',
    application: [
      'Räuchergut so einhängen, dass alle Spitzen greifen – nicht nur eine.',
      'Bei Fisch die Spitzen im festen Kopf- oder Nackenbereich ansetzen.',
      'Beim Aufhängen kurz die Last prüfen, bevor die Stange in den Ofen geht.',
    ],
    care: [
      'Zwischen den Spitzen sammeln sich Fett und Eiweißreste – dort besonders gründlich reinigen.',
      'Nach dem Spülen vollständig trocknen lassen.',
    ],
    safety: ['Mehrere Spitzen bedeuten mehrere Verletzungsquellen – vorsichtig greifen und lagern.'],
    faq: [
      {
        q: 'Ist der Krallenhaken besser als der Standardhaken?',
        a: 'Nicht grundsätzlich besser, sondern für andere Fälle gedacht. Beim festen, mittelgroßen Fisch reicht der Standardhaken. Beim weichen oder schweren Räuchergut spielt die Kralle ihren Vorteil aus.',
      },
    ],
    suitedFor: ['lachs', 'makrele', 'fleisch'],
    tags: ['haken', 'kralle', 'weich', 'halt'],
    related: ['raeucherhaken-3-dorn', 'raeucherhaken-doppeldorn', 'fleischerhaken-s-form-5mm'],
    images: [],
  },
  {
    slug: 'raeucherhaken-standard-aal',
    name: 'Räucherhaken Standard Aal',
    category: 'raeucherhaken',
    sub: 'raeucherhaken-standard-aal',
    short: 'Speziell für den Aal – hält den langen, schweren und sehr glatten Fisch.',
    lead:
      'Aal ist der anspruchsvollste Kandidat am Haken: lang, schwer, fett und ausgesprochen glatt. Dieser Haken ist genau darauf ausgelegt.',
    price: null,
    variants: hookVariants,
    specs: { ...emptySpecs },
    what:
      'Räucherhaken in einer Form, die den Aal sicher hinter dem Kopf fasst und ihn während des gesamten Räuchervorgangs senkrecht hält.',
    forWhom: 'Für alle, die Aal räuchern – im Verein, im Betrieb oder zu Hause.',
    when:
      'Immer beim Aal. Ein normaler Standardhaken reißt beim Aal deutlich schneller aus, weil das Gewicht an einem einzelnen Punkt zieht und die Haut extrem glatt ist.',
    whichVariant:
      'Aal wird fast immer kräftig gesalzen. Wer häufig Aal räuchert, sollte V4A ernsthaft in Betracht ziehen.',
    application: [
      'Aal nach dem Salzen gründlich abspülen und die Schleimschicht vollständig entfernen – sonst rutscht er.',
      'Den Haken hinter dem Kopf durch das feste Nackenfleisch führen.',
      'Aale hängen frei und dürfen sich nicht berühren, sonst bleiben helle Stellen ohne Rauch.',
    ],
    care: [
      'Aal hinterlässt besonders viel Fett. Haken zeitnah heiß abspülen.',
      'Bei eingebranntem Fett in heißem Wasser mit Spülmittel einweichen statt kratzen.',
    ],
    safety: [
      'Frisch geräucherter Aal ist heiß und schwer – Haken beim Abnehmen mit Handschuh greifen.',
    ],
    faq: [
      {
        q: 'Warum rutscht mir der Aal trotzdem vom Haken?',
        a: 'In den meisten Fällen liegt es nicht am Haken, sondern an der Vorbereitung: Wenn die Schleimschicht nicht vollständig entfernt wurde, hält kein Haken zuverlässig. Aal vor dem Räuchern mit Salz abreiben und gründlich abspülen.',
      },
    ],
    suitedFor: ['aal'],
    tags: ['haken', 'aal', 'schwer', 'glatt'],
    related: ['raeucherlauge-aal', 'raeuchermehl-erle', 'raeucherhaken-doppeldorn'],
    images: [],
  },
  {
    slug: 'raeucherhaken-doppeldorn',
    name: 'Räucherhaken Doppeldorn',
    category: 'raeucherhaken',
    sub: 'raeucherhaken-doppeldorn',
    short: 'Zwei Dornen, doppelte Auflage – für schwerere Fische und lange Räuchergänge.',
    lead:
      'Zwei Dornen teilen sich die Last. Das reduziert den Druck pro Einstichpunkt und hält den Fisch außerdem gerader im Rauch.',
    price: null,
    variants: hookVariants,
    specs: { ...emptySpecs },
    what: 'Räucherhaken mit zwei parallelen Dornen an einer gemeinsamen Aufhängung.',
    forWhom:
      'Für alle, die größere Fische räuchern oder deren Fische beim Heißräuchern schon einmal abgerissen sind.',
    when:
      'Ab etwa der Größenordnung, in der ein Fisch mit einem Dorn nicht mehr sicher hängt – beispielsweise große Forellen, Lachsseiten am Stück oder kräftige Karpfen. Auch dann sinnvoll, wenn der Fisch lange im Ofen bleibt und weich wird.',
    whichVariant: 'V2A für den normalen Einsatz, V4A bei starker Salzbelastung.',
    application: [
      'Beide Dornen im festen Gewebe ansetzen, nicht in den Bauchlappen.',
      'Auf gleichmäßige Belastung achten – der Fisch soll gerade hängen.',
      'Nach 15–20 Minuten im Ofen kurz kontrollieren, ob alles noch sitzt.',
    ],
    care: ['Wie alle Haken: zeitnah reinigen, trocken lagern, keinen Fremdstahl verwenden.'],
    safety: ['Zwei Spitzen, doppelte Vorsicht beim Hantieren im engen Ofen.'],
    faq: [
      {
        q: 'Ab welchem Gewicht sollte ich auf Doppeldorn wechseln?',
        a: 'Eine feste Grenze in Kilogramm lässt sich nicht seriös angeben, weil sie von Fischart, Gewebefestigkeit und Räuchertemperatur abhängt. Praktische Regel: Sobald sich der Fisch am Einzeldorn spürbar durchzieht oder der Einstich beim Aufhängen einreißt, ist der Doppeldorn dran.',
      },
    ],
    suitedFor: ['lachs', 'karpfen', 'zander', 'forelle'],
    tags: ['haken', 'schwer', 'gross', 'doppeldorn'],
    related: ['raeucherhaken-3-dorn', 'raeucherhaken-standard', 'raeucherhaken-kralle'],
    images: [],
  },
  {
    slug: 'raeucherhaken-3-dorn',
    name: 'Räucherhaken 3-Dorn',
    category: 'raeucherhaken',
    sub: 'raeucherhaken-3-dorn',
    short: 'Drei Auflagepunkte für sehr schweres oder sehr weiches Räuchergut.',
    lead:
      'Wenn selbst zwei Dornen zu wenig sind: Der 3-Dorn-Haken verteilt das Gewicht auf drei Punkte und ist damit die stabilste Aufhängung im Sortiment.',
    price: null,
    variants: hookVariants,
    specs: { ...emptySpecs },
    what: 'Räucherhaken mit drei Dornen an gemeinsamer Aufhängung.',
    forWhom: 'Für schwere Fische, große Fleischstücke und alles, was lange im warmen Rauch hängt.',
    when:
      'Bei sehr schwerem Räuchergut, bei fettem Fisch, der beim Heißräuchern deutlich weich wird, und immer dann, wenn ein Abriss besonders ärgerlich wäre.',
    whichVariant: 'V2A im Normalfall, V4A bei dauerhaftem Salzkontakt.',
    application: [
      'Alle drei Dornen greifen lassen – ein halb eingehängtes Stück ist gefährlicher als ein Einzeldorn.',
      'Gewicht mittig ausrichten, damit der Haken nicht kippt.',
    ],
    care: ['Zwischenräume gründlich reinigen, trocken lagern.'],
    safety: ['Schweres Räuchergut nie über Kopf einhängen – Stange herausnehmen und außerhalb bestücken.'],
    faq: [
      {
        q: 'Wann 3-Dorn statt Doppeldorn?',
        a: 'Wenn das Räuchergut deutlich schwerer ist oder besonders weich wird. Der 3-Dorn ist die Reserve für die schwierigen Fälle, nicht der Standard für jeden Fisch.',
      },
    ],
    suitedFor: ['lachs', 'karpfen', 'fleisch', 'heilbutt'],
    tags: ['haken', 'schwer', '3-dorn', 'sicherheit'],
    related: ['raeucherhaken-doppeldorn', 'fleischerhaken-s-form-5mm', 'raeucherhaken-kralle'],
    images: [],
  },
  {
    slug: 'raeucherhaken-filet',
    name: 'Räucherhaken Filet',
    category: 'raeucherhaken',
    sub: 'raeucherhaken-filet',
    short: 'Für Filets und Seiten, die ohne Kopf und ohne Knochen hängen müssen.',
    lead:
      'Filets haben keinen festen Knochenpunkt. Der Filethaken ist genau dafür gemacht: Er hält die Seite so, dass sie nicht ausreißt und nicht verrutscht.',
    price: null,
    variants: hookVariants,
    specs: { ...emptySpecs },
    what: 'Räucherhaken für filetiertes Räuchergut ohne tragende Knochenstruktur.',
    forWhom: 'Für alle, die Lachsseiten, Forellenfilets oder Stremellachs herstellen.',
    when:
      'Immer dann, wenn kein Kopf mehr vorhanden ist oder das Räuchergut flach hängen soll – zum Beispiel bei Stremellachs.',
    whichVariant:
      'Filets werden häufig in kräftiger Lake vorbereitet – V4A ist hier besonders langlebig.',
    application: [
      'Filet nach dem Salzen antrocknen lassen, bis sich eine leicht klebrige Haut (Pellicle) bildet – erst dann hält es gut.',
      'Haken im dicken Nackenteil des Filets ansetzen, nicht im dünnen Bauchlappen.',
      'Filets mit Abstand hängen, damit der Rauch beide Seiten erreicht.',
    ],
    care: ['Nach Gebrauch heiß abspülen und trocknen.'],
    safety: ['Filets nach dem Räuchern zügig herunterkühlen und kalt lagern.'],
    faq: [
      {
        q: 'Warum reißt mein Lachsfilet trotzdem ein?',
        a: 'Meist ist das Filet zu nass aufgehängt worden. Ohne angetrocknete Oberfläche ist das Gewebe deutlich weicher. Zusätzlich hilft es, den Haken weiter oben im festen Nackenfleisch anzusetzen.',
      },
    ],
    suitedFor: ['lachs', 'forelle', 'saibling'],
    tags: ['haken', 'filet', 'lachs', 'stremellachs'],
    related: ['stremellachs-gewuerz', 'raeuchermehl-erle', 'raeucherhaken-kralle'],
    images: [],
  },
  /* =========================== FLEISCHERHAKEN =========================== */
  {
    slug: 'fleischerhaken-s-form-5mm',
    name: 'Fleischerhaken S-Form 5 mm',
    category: 'fleischerhaken',
    sub: 'fleischerhaken-s-form',
    short: 'Klassischer S-Haken mit 5 mm Materialstärke für schwere Fleischstücke.',
    lead:
      'Der S-Haken ist die Standardaufhängung im Fleischerhandwerk: oben über die Stange, unten ins Fleisch. Schlicht, stabil, unverwüstlich.',
    price: null,
    variants: [{ id: 'standard', label: '5 mm', material: null, price: null, sku: null }],
    specs: { ...emptySpecs, staerke: '5 mm' },
    what:
      'Ein S-förmig gebogener Haken aus 5 mm starkem Material zum Aufhängen von Fleisch, Schinken und Würsten an Stange oder Rohr.',
    forWhom: 'Für alle, die Schinken pökeln, trocknen, reifen oder räuchern.',
    when:
      'Bei allen Fleischstücken, die über längere Zeit hängen: Schinken beim Durchbrennen, beim Trocknen, beim Kalträuchern und beim Reifen.',
    whichVariant:
      'Die 5-mm-Ausführung deckt den typischen Hausgebrauch ab. Für sehr schwere Stücke gilt: lieber zwei Haken setzen als einen überlasten.',
    application: [
      'Fleisch an einer festen Stelle anstechen – bei Schinken möglichst durch Sehne oder festes Muskelgewebe.',
      'Oberes Ende über Stange oder Rohr hängen und Sitz prüfen.',
      'Beim Reifen ausreichend Abstand lassen, damit Luft zirkulieren kann.',
    ],
    care: [
      'Nach jedem Durchgang reinigen, besonders bei Pökelware mit Salzresten.',
      'Trocken aufbewahren.',
    ],
    safety: [
      'Nie mehr Gewicht anhängen, als der Haken und die Stange sicher tragen.',
      'Bei Fleisch gilt durchgehend die Kühlkette: beim Pökeln und Durchbrennen im Kühlbereich arbeiten.',
    ],
    faq: [
      {
        q: 'Wie viel Gewicht trägt ein 5-mm-Haken?',
        a: 'Eine belastbare Zahl geben wir hier bewusst nicht an, weil sie von Material, Fertigung und Aufhängung abhängt. Wenn Sie eine verbindliche Tragkraft brauchen, fragen Sie sie bitte konkret zum Artikel an – wir geben nur bestätigte Werte weiter.',
      },
    ],
    suitedFor: ['schinken', 'fleisch', 'wurst'],
    tags: ['fleischerhaken', 'schinken', 's-haken', 'reifen'],
    related: ['lachsschinken-mischung', 'schwarzwaelder-art-mischung', 'raeuchermehl-buche'],
    images: [],
  },
  /* ============================= RÄUCHERMEHL ============================= */
  {
    slug: 'raeuchermehl-buche',
    name: 'Räuchermehl Buche',
    category: 'raeuchermehl',
    sub: 'raeuchermehl-buche',
    short: 'Der Klassiker. Kräftiger, klarer Rauch und schöne goldbraune Farbe.',
    lead:
      'Buche ist das meistverwendete Räuchermehl im deutschsprachigen Raum – und das aus gutem Grund: Es ist neutral genug für fast alles und gibt gleichzeitig die klassische Räucherfarbe.',
    price: null,
    variants: null, // wird aus `grains` erzeugt
    grainVariants: true,
    specs: { ...emptySpecs },
    wood: 'buche',
    what: 'Räuchermehl aus Buchenholz, erhältlich in vier Körnungen.',
    forWhom: 'Für Einsteiger und für alle, die ein zuverlässiges Standardmehl suchen.',
    when:
      'Wenn Sie ein Mehl für alles wollen: Forelle, Makrele, Schinken, Speck, Wurst. Buche ist die sichere Wahl, wenn Sie noch nicht wissen, welches Aroma Sie mögen.',
    whichVariant:
      'Für die Räucherschnecke und für langes Kalträuchern Körnung 1 oder 2. Für den Heißrauch im Räucherofen Körnung 3 oder 4.',
    application: [
      'Im Räucherofen: Mehl gleichmäßig in die Räucherschale geben, nicht auftürmen.',
      'In der Räucherschnecke: Körnung 1 oder 2 locker einfüllen, nicht festdrücken.',
      'Mehl muss trocken sein. Feuchtes Mehl glimmt unregelmäßig und erzeugt bitteren Rauch.',
    ],
    care: ['Trocken und geschlossen lagern, damit das Mehl nicht zieht.'],
    safety: [
      'Glimmendes Räuchermehl niemals unbeaufsichtigt lassen.',
      'Nur im Freien oder in dafür vorgesehenen Öfen verwenden – Rauchgase nicht in geschlossenen Räumen einatmen.',
    ],
    faq: [
      {
        q: 'Ist Buche für Fisch oder für Fleisch?',
        a: 'Für beides. Buche ist die neutralste der gängigen Holzarten und passt zu Fisch, Fleisch, Schinken und Wurst gleichermaßen.',
      },
      {
        q: 'Warum wird mein Räuchergut zu dunkel?',
        a: 'Meist zu viel Mehl, zu wenig Luft oder zu lange Rauchzeit. Weniger Mehl nachlegen und für gleichmäßigen Abzug sorgen.',
      },
    ],
    suitedFor: ['forelle', 'makrele', 'schinken', 'fleisch', 'wurst'],
    tags: ['mehl', 'buche', 'klassiker', 'allrounder'],
    related: ['raeuchermehl-erle', 'raeuchermehl-eiche', 'raeucherhaken-standard'],
    images: [],
  },
  {
    slug: 'raeuchermehl-erle',
    name: 'Räuchermehl Erle',
    category: 'raeuchermehl',
    sub: 'raeuchermehl-erle',
    short: 'Mild und leicht süßlich – die traditionelle Wahl für Fisch.',
    lead:
      'Erle ist das Fischholz. Der Rauch ist deutlich milder als Buche, das Aroma leicht süßlich, die Farbe eher hell- bis goldbraun.',
    price: null,
    variants: null,
    grainVariants: true,
    specs: { ...emptySpecs },
    wood: 'erle',
    what: 'Räuchermehl aus Erlenholz in vier Körnungen.',
    forWhom: 'Für alle, die Fisch räuchern und den Eigengeschmack erhalten wollen.',
    when:
      'Bei Forelle, Lachs, Saibling und Aal. Immer dann, wenn der Rauch den Fisch unterstützen und nicht überdecken soll.',
    whichVariant:
      'Kalträuchern von Lachs: Körnung 1 in der Räucherschnecke. Heißräuchern von Forelle: Körnung 2 oder 3.',
    application: [
      'Sparsam dosieren – Erle wirkt feiner, verträgt aber trotzdem keine Überdosis.',
      'Gut mit Buche kombinierbar, wenn etwas mehr Farbe gewünscht ist.',
    ],
    care: ['Trocken lagern.'],
    safety: ['Glimmendes Mehl beaufsichtigen, nicht in geschlossenen Räumen verwenden.'],
    faq: [
      {
        q: 'Erle oder Buche für Forelle?',
        a: 'Beides funktioniert. Erle ergibt einen feineren, süßlicheren Geschmack und hellere Farbe, Buche einen kräftigeren Rauch mit mehr Farbe. Viele mischen beide.',
      },
    ],
    suitedFor: ['forelle', 'lachs', 'saibling', 'aal', 'hering'],
    tags: ['mehl', 'erle', 'fisch', 'mild'],
    related: ['raeuchermehl-buche', 'raeucherlauge-forelle', 'raeucherhaken-filet'],
    images: [],
  },
  {
    slug: 'raeuchermehl-birke',
    name: 'Räuchermehl Birke',
    category: 'raeuchermehl',
    sub: 'raeuchermehl-birke',
    short: 'Würzig-herb mit heller Farbe – nordisch geprägt.',
    lead:
      'Birke gibt einen eigenständigen, leicht harzig-würzigen Rauch. In Nord- und Osteuropa ist sie traditionell verbreitet, hierzulande ist sie der Geheimtipp für Abwechslung.',
    price: null,
    variants: null,
    grainVariants: true,
    specs: { ...emptySpecs },
    wood: 'birke',
    what: 'Räuchermehl aus Birkenholz in vier Körnungen.',
    forWhom: 'Für Erfahrene, die vom Standardaroma weg wollen.',
    when: 'Bei Hering, Makrele und kräftigen Fischen sowie bei Wurst und Speck.',
    whichVariant: 'Körnung 2 als Allrounder, Körnung 1 für den Kaltrauch.',
    application: [
      'Zunächst gemischt mit Buche ausprobieren, um das Aroma kennenzulernen.',
      'Sparsam einsetzen – Birke setzt sich geschmacklich durch.',
    ],
    care: ['Trocken lagern.'],
    safety: ['Nur im Freien bzw. im Räucherofen verwenden.'],
    faq: [
      {
        q: 'Warum schmeckt Birke anders als Buche?',
        a: 'Birke enthält andere Holzinhaltsstoffe und bringt dadurch eine würzigere, leicht herbe Note mit. Wer den klassischen Räuchergeschmack erwartet, sollte Birke zunächst mit Buche mischen.',
      },
    ],
    suitedFor: ['hering', 'makrele', 'wurst', 'fleisch'],
    tags: ['mehl', 'birke', 'wuerzig'],
    related: ['raeuchermehl-buche', 'raeuchermehl-eiche'],
    images: [],
  },
  {
    slug: 'raeuchermehl-eiche',
    name: 'Räuchermehl Eiche',
    category: 'raeuchermehl',
    sub: 'raeuchermehl-eiche',
    short: 'Kräftig, herb und dunkel – das Holz für Schinken und Speck.',
    lead:
      'Eiche ist das kräftigste der gängigen Räucherhölzer. Sie gibt viel Farbe und einen tiefen, herben Rauchgeschmack – klassisch für Schwarzwälder Art und deftigen Speck.',
    price: null,
    variants: null,
    grainVariants: true,
    specs: { ...emptySpecs },
    wood: 'eiche',
    what: 'Räuchermehl aus Eichenholz in vier Körnungen.',
    forWhom: 'Für Schinkenmacher und alle, die kräftigen, dunklen Rauch mögen.',
    when: 'Bei Schinken, Speck, Rohwurst und kräftigem Fleisch. Für zarten Fisch eher ungeeignet.',
    whichVariant: 'Kalträuchern von Schinken: Körnung 1 in der Räucherschnecke.',
    application: [
      'Vorsichtig dosieren – Eiche kann bei zu langer Rauchzeit bitter werden.',
      'Häufig als Mischung mit Buche verwendet, um die Herbe abzurunden.',
    ],
    care: ['Trocken lagern.'],
    safety: ['Glimmendes Mehl beaufsichtigen.'],
    faq: [
      {
        q: 'Kann ich Eiche für Forelle nehmen?',
        a: 'Möglich, aber meist zu dominant. Der herbe Rauch überdeckt den feinen Fischgeschmack. Für Forelle sind Erle oder Buche die bessere Wahl.',
      },
    ],
    suitedFor: ['schinken', 'speck', 'wurst', 'fleisch'],
    tags: ['mehl', 'eiche', 'kraeftig', 'schinken'],
    related: ['raeuchermehl-buche', 'schwarzwaelder-art-mischung', 'fleischerhaken-s-form-5mm'],
    images: [],
  },
  {
    slug: 'raeuchermehl-kirsche',
    name: 'Räuchermehl Kirsche',
    category: 'raeuchermehl',
    sub: 'raeuchermehl-kirsche',
    short: 'Fruchtig-mild mit warmer, rötlicher Farbe.',
    lead:
      'Kirsche ist ein Fruchtholz: mild, leicht süßlich, mit einer angenehm warmen Farbe. Sie ist das Aroma für alle, die es feiner mögen.',
    price: null,
    variants: null,
    grainVariants: true,
    specs: { ...emptySpecs },
    wood: 'kirsche',
    what: 'Räuchermehl aus Kirschholz in vier Körnungen.',
    forWhom: 'Für Feinschmecker, für Geflügel, für Käse und für milde Schinken.',
    when:
      'Bei Geflügel, Käse, Lachs und überall dort, wo ein mildes, fruchtiges Aroma und eine schöne Farbe gewünscht sind.',
    whichVariant: 'Für Käse im Kaltrauch: Körnung 1. Für Geflügel im Warmrauch: Körnung 2 oder 3.',
    application: [
      'Sehr gut als Mischpartner: Kirsche mit Buche gibt Farbe plus Frucht.',
      'Bei Käse besonders niedrige Temperatur halten.',
    ],
    care: ['Trocken lagern.'],
    safety: ['Käse nur im Kaltrauch – bei zu hoher Temperatur schmilzt er.'],
    faq: [
      {
        q: 'Welches Holz für Käse?',
        a: 'Kirsche und Buche in feiner Körnung sind die gängige Wahl, weil sie mild sind und den Käse nicht überdecken. Wichtig ist vor allem die Temperatur: Käse gehört in den Kaltrauch.',
      },
    ],
    suitedFor: ['kaese', 'gefluegel', 'lachs', 'schinken'],
    tags: ['mehl', 'kirsche', 'fruchtig', 'kaese', 'mild'],
    related: ['raeuchermehl-erle', 'raeuchermehl-buche'],
    images: [],
  },
  /* ============================ RÄUCHERLAUGEN ============================ */
  {
    slug: 'raeucherlauge-forelle',
    name: 'Räucherlauge Forelle',
    category: 'raeucherlaugen',
    sub: 'raeucherlauge-forelle',
    short: 'Fertige Lake speziell für Forelle und ähnliche Salmoniden.',
    lead:
      'Die Lake macht mehr als salzen: Sie würzt, festigt das Fleisch und sorgt dafür, dass der Fisch beim Räuchern nicht austrocknet.',
    price: null,
    variants: null,
    specs: { ...emptySpecs },
    what: 'Abgestimmte Räucherlauge zum Ansetzen des Salzbades für Forelle.',
    forWhom: 'Für alle, die nicht selbst mischen möchten – und für Einsteiger.',
    when: 'Vor jedem Räuchergang, üblicherweise über Nacht.',
    whichVariant: 'Eine Sorte, dosiert nach Packungsangabe.',
    application: [
      'Lake nach der Angabe auf der Verpackung ansetzen – die Herstellerangabe hat immer Vorrang.',
      'Fische vollständig untertauchen, im Kühlen stehen lassen.',
      'Nach dem Lakebad kurz abspülen und antrocknen lassen, bis die Haut matt-klebrig ist.',
    ],
    care: ['Trocken und verschlossen lagern.'],
    safety: [
      'Lake immer im Kühlbereich ansetzen, nicht bei Zimmertemperatur stehen lassen.',
      'Gebrauchte Lake nicht wiederverwenden.',
    ],
    faq: [
      {
        q: 'Wie lange muss die Forelle in die Lake?',
        a: 'Üblich ist über Nacht, also grob 8–12 Stunden im Kühlen. Verbindlich ist immer die Dosier- und Zeitangabe auf der Packung, weil sie zur Salzkonzentration der Mischung gehört.',
      },
    ],
    suitedFor: ['forelle', 'saibling'],
    tags: ['lake', 'lauge', 'forelle', 'einsteiger'],
    related: ['raeuchermehl-erle', 'raeucherhaken-standard', 'fischgewuerz'],
    images: [],
  },
  {
    slug: 'raeucherlauge-aal',
    name: 'Räucherlauge Aal',
    category: 'raeucherlaugen',
    sub: 'raeucherlauge-aal',
    short: 'Kräftigere Lake für den fetten, aromatischen Aal.',
    lead:
      'Aal ist fett und kräftig im Eigengeschmack. Die Lake ist entsprechend deutlicher abgestimmt als bei Forelle.',
    price: null,
    variants: null,
    specs: { ...emptySpecs },
    what: 'Räucherlauge zum Ansetzen des Salzbades für Aal.',
    forWhom: 'Für alle, die Aal räuchern.',
    when: 'Vor dem Räuchern, nach dem Schlachten und gründlichen Entschleimen.',
    whichVariant: 'Eine Sorte, dosiert nach Packungsangabe.',
    application: [
      'Aal zuerst entschleimen, sonst wirkt die Lake ungleichmäßig.',
      'Lake nach Packungsangabe ansetzen, Aal vollständig untertauchen, kühl stellen.',
      'Nach dem Lakebad abspülen und gut antrocknen lassen.',
    ],
    care: ['Trocken und verschlossen lagern.'],
    safety: ['Kühlkette einhalten. Aal ist fett und verdirbt bei Wärme schnell.'],
    faq: [
      {
        q: 'Warum ist die Lake für Aal anders?',
        a: 'Fettes, kräftiges Fleisch nimmt Salz und Aroma anders auf als magerer Fisch. Deshalb sind Salzgehalt und Würzung auf den Aal abgestimmt.',
      },
    ],
    suitedFor: ['aal'],
    tags: ['lake', 'lauge', 'aal'],
    related: ['raeucherhaken-standard-aal', 'raeuchermehl-erle'],
    images: [],
  },
  {
    slug: 'raeucherlauge-lachs',
    name: 'Räucherlauge Lachs',
    category: 'raeucherlaugen',
    sub: 'raeucherlauge-lachs',
    short: 'Für Lachsseiten, Stremellachs und kalt geräucherten Lachs.',
    lead:
      'Lachs wird häufig als Seite oder Filet geräuchert. Die Lake ist darauf abgestimmt, dass das Fleisch fest wird, ohne zu versalzen.',
    price: null,
    variants: null,
    specs: { ...emptySpecs },
    what: 'Räucherlauge für Lachs, Lachsforelle und ähnliche Filets.',
    forWhom: 'Für alle, die Lachsseiten selbst räuchern.',
    when: 'Vor dem Kalt- oder Warmräuchern von Lachsfilets.',
    whichVariant: 'Eine Sorte, dosiert nach Packungsangabe.',
    application: [
      'Filet in der Lake vollständig bedecken, kühl stellen.',
      'Nach dem Salzen gründlich abspülen und im Kühlschrank antrocknen lassen, bis sich eine Pellicle bildet.',
      'Erst dann in den Rauch – nasse Filets nehmen Rauch ungleichmäßig an.',
    ],
    care: ['Trocken und verschlossen lagern.'],
    safety: [
      'Kalt geräucherter Lachs wird nicht durcherhitzt. Nur einwandfreie, kühlkettentreue Ware verwenden und kühl lagern.',
    ],
    faq: [
      {
        q: 'Lake oder Trockensalzung für Lachs?',
        a: 'Beides ist üblich. Die Lake wirkt gleichmäßiger und ist für Einsteiger einfacher zu steuern; die Trockensalzung entzieht mehr Wasser und ergibt ein festeres Ergebnis.',
      },
    ],
    suitedFor: ['lachs'],
    tags: ['lake', 'lauge', 'lachs', 'stremellachs'],
    related: ['raeucherhaken-filet', 'stremellachs-gewuerz', 'graved-lachs-gewuerz'],
    images: [],
  },
  /* =============================== GEWÜRZE =============================== */
  {
    slug: 'fischgewuerz',
    name: 'Fischgewürz',
    category: 'gewuerze',
    sub: 'fischgewuerze',
    short: 'Abgestimmte Würzmischung für Räucherfisch aller Art.',
    lead: 'Ergänzt die Lake oder würzt den Fisch direkt vor dem Räuchern.',
    price: null,
    variants: null,
    specs: { ...emptySpecs },
    what: 'Gewürzmischung für Fisch, passend zum Räuchern.',
    forWhom: 'Für alle, die über das reine Salz hinaus würzen möchten.',
    when: 'Beim Ansetzen der Lake oder unmittelbar vor dem Aufhängen.',
    whichVariant: 'Eine Mischung, dosiert nach Packungsangabe.',
    application: [
      'Nach Packungsangabe dosieren.',
      'In der Lake gut auflösen bzw. verteilen, damit alle Fische gleichmäßig gewürzt sind.',
    ],
    care: ['Trocken, dunkel und verschlossen lagern.'],
    safety: ['Zutaten- und Allergenangaben auf der Verpackung beachten.'],
    faq: [
      {
        q: 'Kann ich Gewürz und Lake kombinieren?',
        a: 'Ja, das ist der übliche Weg. Achten Sie nur darauf, den Salzgehalt der Lake nicht zusätzlich zu erhöhen, wenn die Gewürzmischung bereits Salz enthält.',
      },
    ],
    suitedFor: ['forelle', 'makrele', 'lachs', 'hering'],
    tags: ['gewuerz', 'fisch'],
    related: ['raeucherlauge-forelle', 'raeuchermehl-erle'],
    images: [],
  },
  {
    slug: 'graved-lachs-gewuerz',
    name: 'Graved-Lachs-Gewürz',
    category: 'gewuerze',
    sub: 'graved-lachs-gewuerze',
    short: 'Für gebeizten Lachs nach skandinavischer Art – ganz ohne Rauch.',
    lead:
      'Graved Lachs wird nicht geräuchert, sondern gebeizt: Salz, Zucker und Dill ziehen im Kühlschrank Wasser aus dem Fisch und machen ihn schnittfest.',
    price: null,
    variants: null,
    specs: { ...emptySpecs },
    what: 'Beizmischung für Graved Lachs.',
    forWhom: 'Für alle, die Lachs ohne Räucherofen veredeln möchten.',
    when: 'Wenn kein Räucherofen zur Verfügung steht oder ein frischeres Aroma gewünscht ist.',
    whichVariant: 'Eine Mischung, dosiert nach Packungsangabe.',
    application: [
      'Lachsseite mit der Mischung nach Packungsangabe einreiben.',
      'Beschwert im Kühlschrank ziehen lassen, dabei täglich wenden.',
      'Austretende Flüssigkeit abgießen, anschließend abspülen und trocken tupfen.',
    ],
    care: ['Trocken und verschlossen lagern.'],
    safety: [
      'Graved Lachs wird roh gegessen. Nur einwandfreie Ware verwenden, durchgehend kühlen und zügig verbrauchen.',
      'Für Schwangere, Kleinkinder, ältere und immungeschwächte Personen sind rohe Fischerzeugnisse nicht geeignet.',
    ],
    faq: [
      {
        q: 'Ist Graved Lachs dasselbe wie Räucherlachs?',
        a: 'Nein. Graved Lachs wird gebeizt, nicht geräuchert. Er schmeckt frischer und deutlich weniger rauchig.',
      },
    ],
    suitedFor: ['lachs'],
    tags: ['gewuerz', 'graved', 'lachs', 'beizen'],
    related: ['raeucherlauge-lachs', 'stremellachs-gewuerz'],
    images: [],
  },
  {
    slug: 'stremellachs-gewuerz',
    name: 'Stremellachs-Gewürz',
    category: 'gewuerze',
    sub: 'stremellachs',
    short: 'Für warm geräucherten Lachs in Streifen – saftig und würzig.',
    lead:
      'Stremellachs ist warm geräucherter Lachs, der in Streifen („Stremel") geschnitten wird. Er ist saftiger und kräftiger als kalt geräucherter Lachs.',
    price: null,
    variants: null,
    specs: { ...emptySpecs },
    what: 'Gewürzmischung für Stremellachs.',
    forWhom: 'Für alle mit Räucherofen, die Lachs warm räuchern möchten.',
    when: 'Beim Warm- oder Heißräuchern von Lachsfilets.',
    whichVariant: 'Eine Mischung, dosiert nach Packungsangabe.',
    application: [
      'Filet salzen bzw. lakieren, abspülen, antrocknen lassen.',
      'Mit der Mischung würzen und auf Filethaken oder Rost in den Ofen geben.',
      'Warm räuchern, bis die gewünschte Kerntemperatur erreicht ist.',
    ],
    care: ['Trocken und verschlossen lagern.'],
    safety: ['Beim Warmräuchern von Fisch eine Kerntemperatur von mindestens 62 °C anstreben.'],
    faq: [
      {
        q: 'Worin unterscheidet sich Stremellachs von Räucherlachs?',
        a: 'Räucherlachs im klassischen Sinn wird kalt geräuchert und roh dünn aufgeschnitten. Stremellachs wird warm geräuchert, ist dadurch gegart, blättert leicht und schmeckt kräftiger.',
      },
    ],
    suitedFor: ['lachs'],
    tags: ['gewuerz', 'stremellachs', 'lachs', 'warmraeuchern'],
    related: ['raeucherhaken-filet', 'raeucherlauge-lachs', 'raeuchermehl-erle'],
    images: [],
  },
  {
    slug: 'fleischgewuerz',
    name: 'Fleischgewürz',
    category: 'gewuerze',
    sub: 'fleischgewuerze',
    short: 'Würzmischung für Fleisch, Speck und Wurst.',
    lead: 'Für alles, was nicht aus dem Wasser kommt: Nacken, Bauch, Speck und Rohwurst.',
    price: null,
    variants: null,
    specs: { ...emptySpecs },
    what: 'Gewürzmischung für Fleischerzeugnisse.',
    forWhom: 'Für alle, die Fleisch räuchern, pökeln oder Wurst machen.',
    when: 'Beim Würzen vor dem Pökeln oder beim Herstellen von Rohwurst.',
    whichVariant: 'Eine Mischung, dosiert nach Packungsangabe.',
    application: [
      'Nach Packungsangabe dosieren.',
      'Gleichmäßig einmassieren, damit keine ungewürzten Stellen bleiben.',
    ],
    care: ['Trocken, dunkel und verschlossen lagern.'],
    safety: ['Beim Pökeln zusätzlich die Hinweise zur Pökelmischung beachten.'],
    faq: [
      {
        q: 'Ersetzt das Gewürz die Pökelmischung?',
        a: 'Nein. Gewürze würzen, Pökelmischungen konservieren und stabilisieren die Farbe. Wer pökelt, braucht beides bzw. eine dafür vorgesehene Mischung.',
      },
    ],
    suitedFor: ['fleisch', 'speck', 'wurst'],
    tags: ['gewuerz', 'fleisch', 'wurst'],
    related: ['raeuchermehl-eiche', 'fleischerhaken-s-form-5mm'],
    images: [],
  },
  /* ========================== SCHINKEN & PÖKELN ========================== */
  {
    slug: 'lachsschinken-mischung',
    name: 'Pökelmischung Lachsschinken',
    category: 'schinken-poekeln',
    sub: 'lachsschinken',
    short: 'Für milden Lachsschinken aus dem Schweinerücken.',
    lead:
      'Lachsschinken hat nichts mit Lachs zu tun – der Name kommt von der lachsähnlichen Farbe des mageren Rückenstücks. Er ist mild, mager und der ideale Einstieg ins Schinkenmachen.',
    price: null,
    variants: null,
    specs: { ...emptySpecs },
    what: 'Abgestimmte Pökelmischung für Lachsschinken.',
    forWhom: 'Für Einsteiger im Schinkenmachen.',
    when: 'Beim Pökeln von Schweinerücken (Lachs) ohne Knochen.',
    whichVariant: 'Eine Mischung, dosiert ausschließlich nach Packungsangabe.',
    application: [
      'Fleisch parieren und trocken tupfen.',
      'Pökelmischung exakt nach der Dosierangabe auf der Verpackung einmassieren.',
      'Vakuumiert oder im geschlossenen Gefäß im Kühlschrank pökeln – Dauer nach Packungsangabe und Stärke des Stücks.',
      'Danach durchbrennen, trocknen und je nach Wunsch kalt räuchern.',
    ],
    care: ['Trocken, dunkel und verschlossen lagern.'],
    safety: [
      'Dosierung und Pökeldauer richten sich immer nach der Angabe des Herstellers auf der Packung.',
      'Beim Pökeln durchgehend im Kühlbereich arbeiten (Kühlschranktemperatur).',
      'Bei Unsicherheit lieber weniger Salz und länger pökeln als umgekehrt zu wenig Zeit.',
    ],
    faq: [
      {
        q: 'Warum heißt er Lachsschinken?',
        a: 'Wegen der Farbe und der Form des Stücks, nicht wegen des Fisches. Verwendet wird der magere Schweinerücken.',
      },
      {
        q: 'Wie lange muss Lachsschinken pökeln?',
        a: 'Das hängt von Dicke des Stücks und von der Mischung ab. Verbindlich ist die Zeitangabe auf der Verpackung – wir nennen hier bewusst keine allgemeine Zahl, weil sie zur konkreten Mischung gehört.',
      },
    ],
    suitedFor: ['schinken', 'schwein'],
    tags: ['poekeln', 'schinken', 'lachsschinken', 'einsteiger'],
    related: ['fleischerhaken-s-form-5mm', 'raeuchermehl-buche'],
    images: [],
  },
  {
    slug: 'schwarzwaelder-art-mischung',
    name: 'Pökelmischung Schwarzwälder Art',
    category: 'schinken-poekeln',
    sub: 'schwarzwaelder-art',
    short: 'Kräftig gewürzt für Schinken nach Schwarzwälder Art.',
    lead:
      'Wacholder, Knoblauch, Koriander und kräftiger Kaltrauch – das ist die typische Richtung. Wichtig: „nach Schwarzwälder Art" ist die korrekte Bezeichnung für selbst hergestellte Ware, denn „Schwarzwälder Schinken" ist geschützt.',
    price: null,
    variants: null,
    specs: { ...emptySpecs },
    what: 'Pökelmischung für Schinken nach Schwarzwälder Art.',
    forWhom: 'Für alle, die kräftig gewürzten, kalt geräucherten Schinken mögen.',
    when: 'Beim Pökeln von Schweinekeule oder Oberschale.',
    whichVariant: 'Eine Mischung, dosiert nach Packungsangabe.',
    application: [
      'Fleisch parieren, Mischung nach Packungsangabe einmassieren.',
      'Pökeln, durchbrennen, trocknen.',
      'Anschließend kalt räuchern – klassisch mit Buche, gern mit Eichenanteil.',
    ],
    care: ['Trocken, dunkel und verschlossen lagern.'],
    safety: [
      'Dosierung und Pökeldauer strikt nach Packungsangabe.',
      'Kalträuchern findet unter 25 °C statt. Höhere Temperaturen sind beim Rohschinken ein Fehler.',
    ],
    faq: [
      {
        q: 'Darf ich meinen Schinken „Schwarzwälder Schinken" nennen?',
        a: 'Nein. Die Bezeichnung ist geschützt und an Herkunft und Herstellung im Schwarzwald gebunden. Für selbst hergestellte Ware ist „nach Schwarzwälder Art" die richtige Formulierung.',
      },
    ],
    suitedFor: ['schinken', 'schwein'],
    tags: ['poekeln', 'schinken', 'schwarzwaelder', 'kaltraeuchern'],
    related: ['raeuchermehl-eiche', 'raeuchermehl-buche', 'fleischerhaken-s-form-5mm'],
    images: [],
  },
  {
    slug: 'parma-art-mischung',
    name: 'Pökelmischung Parma Art',
    category: 'schinken-poekeln',
    sub: 'parma-art',
    short: 'Für luftgetrockneten Schinken nach Parmaer Art – ohne Rauch.',
    lead:
      'Parma-Art bedeutet: nur Salz, Zeit und Luft. Kein Rauch, keine kräftige Würzung – dafür eine lange Reifezeit, in der das Aroma entsteht.',
    price: null,
    variants: null,
    specs: { ...emptySpecs },
    what: 'Pökelmischung für luftgetrockneten Schinken nach Parmaer Art.',
    forWhom: 'Für Geduldige mit geeignetem Reifeplatz.',
    when:
      'Wenn ein kühler, gut belüfteter Reifeort mit stabiler Luftfeuchte zur Verfügung steht – ohne den funktioniert Lufttrocknung nicht.',
    whichVariant: 'Eine Mischung, dosiert nach Packungsangabe.',
    application: [
      'Keule sorgfältig parieren, Mischung nach Packungsangabe aufbringen.',
      'Pökeln und durchbrennen nach Packungsangabe.',
      'Anschließend über Monate kühl und kontrolliert reifen lassen – nicht räuchern.',
    ],
    care: ['Trocken, dunkel und verschlossen lagern.'],
    safety: [
      'Lufttrocknung über lange Zeiträume stellt hohe Anforderungen an Hygiene, Temperatur und Luftfeuchte.',
      'Bei Schimmelbildung: Edelschimmel ist weiß und trocken, alles Grüne, Schwarze oder Schmierige ist ein Abbruchgrund.',
      '„Parmaschinken" ist eine geschützte Herkunftsbezeichnung. Selbst hergestellte Ware heißt „nach Parmaer Art".',
    ],
    faq: [
      {
        q: 'Kann ich Parma-Art im Kühlschrank reifen lassen?',
        a: 'Nur eingeschränkt. Ein normaler Kühlschrank ist zu trocken und die Luft steht. Für lange Reifezeiten braucht es einen Reifeschrank oder einen geeigneten Keller mit kontrollierter Luftfeuchte.',
      },
    ],
    suitedFor: ['schinken', 'schwein'],
    tags: ['poekeln', 'schinken', 'parma', 'lufttrocknung'],
    related: ['serrano-art-mischung', 'fleischerhaken-s-form-5mm'],
    images: [],
  },
  {
    slug: 'serrano-art-mischung',
    name: 'Pökelmischung Serrano Art',
    category: 'schinken-poekeln',
    sub: 'serrano-art',
    short: 'Für spanisch inspirierten Rohschinken, luftgetrocknet.',
    lead:
      'Serrano-Art ist der spanische Verwandte: ebenfalls luftgetrocknet, etwas kräftiger im Salz und meist kürzer gereift als Parma-Art.',
    price: null,
    variants: null,
    specs: { ...emptySpecs },
    what: 'Pökelmischung für Rohschinken nach Serrano Art.',
    forWhom: 'Für alle, die Lufttrocknung ausprobieren möchten.',
    when: 'Bei geeignetem Reifeplatz, ähnlich wie bei Parma-Art.',
    whichVariant: 'Eine Mischung, dosiert nach Packungsangabe.',
    application: [
      'Pökeln nach Packungsangabe, durchbrennen, anschließend kontrolliert reifen.',
      'Nicht räuchern – das Aroma kommt aus Salz und Zeit.',
    ],
    care: ['Trocken, dunkel und verschlossen lagern.'],
    safety: [
      'Hygiene, Temperatur und Luftfeuchte konsequent kontrollieren.',
      '„Jamón Serrano" ist eine geschützte Bezeichnung – selbst hergestellte Ware heißt „nach Serrano Art".',
    ],
    faq: [
      {
        q: 'Was ist der Unterschied zu Parma-Art?',
        a: 'Beide werden luftgetrocknet. Serrano-Art ist in der Regel etwas kräftiger gesalzen und wird kürzer gereift, Parma-Art milder und länger.',
      },
    ],
    suitedFor: ['schinken', 'schwein'],
    tags: ['poekeln', 'schinken', 'serrano', 'lufttrocknung'],
    related: ['parma-art-mischung', 'fleischerhaken-s-form-5mm'],
    images: [],
  },
  {
    slug: 'rindersaftschinken-mischung',
    name: 'Pökelmischung Rindersaftschinken',
    category: 'schinken-poekeln',
    sub: 'rindersaftschinken',
    short: 'Für saftigen, gegarten Schinken aus Rindfleisch.',
    lead:
      'Rindersaftschinken wird gepökelt und anschließend gegart – nicht roh gereift. Dadurch ist er saftig, schnittfest und deutlich schneller fertig als ein Rohschinken.',
    price: null,
    variants: null,
    specs: { ...emptySpecs },
    what: 'Pökelmischung für Rindersaftschinken.',
    forWhom: 'Für alle, die keinen Reifeschrank haben und trotzdem eigenen Schinken machen wollen.',
    when: 'Wenn es schneller gehen soll und ein gegartes Ergebnis gewünscht ist.',
    whichVariant: 'Eine Mischung, dosiert nach Packungsangabe.',
    application: [
      'Rindfleisch parieren, Mischung nach Packungsangabe einbringen.',
      'Im Kühlbereich pökeln, anschließend durchbrennen.',
      'Garen bis zur vorgesehenen Kerntemperatur, optional vorher leicht räuchern.',
    ],
    care: ['Trocken, dunkel und verschlossen lagern.'],
    safety: [
      'Gegarte Schinken über die Kerntemperatur steuern, nicht über die Zeit. Ein Kernthermometer ist Pflicht.',
      'Nach dem Garen zügig abkühlen und kühl lagern.',
    ],
    faq: [
      {
        q: 'Ist Saftschinken einfacher als Rohschinken?',
        a: 'Ja, deutlich. Es entfällt die lange Reifephase mit ihren Anforderungen an Klima und Hygiene. Für den Einstieg ist ein Saftschinken die risikoärmere Wahl.',
      },
    ],
    suitedFor: ['schinken', 'rind'],
    tags: ['poekeln', 'schinken', 'rind', 'saftschinken', 'einsteiger'],
    related: ['lachsschinken-mischung', 'fleischerhaken-s-form-5mm'],
    images: [],
  },
];

/* ============================ HILFSFUNKTIONEN ============================ */

export function getProduct(slug) {
  return products.find((p) => p.slug === slug) || null;
}

export function productsByCategory(categorySlug) {
  return products.filter((p) => p.category === categorySlug);
}

export function productsBySub(subSlug) {
  return products.filter((p) => p.sub === subSlug);
}

/** Erzeugt die tatsaechlichen Kaufvarianten eines Produkts. */
export function resolveVariants(product) {
  if (product.grainVariants) {
    return grains.map((g) => ({
      id: g.id,
      label: g.label,
      material: null,
      price: product.price,
      sku: null,
    }));
  }
  if (Array.isArray(product.variants) && product.variants.length) return product.variants;
  return [];
}

/** true, wenn fuer das Produkt mindestens ein echter Preis gepflegt ist. */
export function hasPrice(product) {
  if (typeof product.price === 'number') return true;
  return resolveVariants(product).some((v) => typeof v.price === 'number');
}
