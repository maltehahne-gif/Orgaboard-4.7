/**
 * Schinken selber machen.
 *
 * WICHTIG ZUR DOSIERUNG:
 * Es werden hier bewusst KEINE Gramm-Angaben für Pökelsalz genannt.
 * Pökelmischungen unterscheiden sich in Salz- und Nitritgehalt; verbindlich ist
 * ausschliesslich die Dosier- und Zeitangabe des Herstellers auf der Packung.
 */

export const curingSafetyNote =
  'Dosierung und Pökeldauer richten sich ausschließlich nach der Angabe auf der Verpackung Ihrer Pökelmischung. Mischungen unterscheiden sich im Salz- und Nitritgehalt – eine allgemeine Grammzahl wäre nicht seriös und im Zweifel gefährlich.';

export const hams = [
  {
    slug: 'lachsschinken',
    name: 'Lachsschinken',
    level: 'Einsteiger',
    smoked: true,
    teaser: 'Mager, mild und schnell fertig – der beste Einstieg ins Schinkenmachen.',
    lead:
      'Lachsschinken ist der Einsteigerschinken schlechthin: ein schlankes Stück, kurze Pökelzeit, überschaubare Reifezeit und ein Ergebnis, das fast immer gelingt. Mit Lachs hat er nur die Farbe gemeinsam.',
    cut: 'Schweinerücken (Lachs) ohne Knochen, pariert.',
    mixture: 'lachsschinken-mischung',
    preparation: [
      'Silberhaut und überschüssiges Fett entfernen.',
      'Fleisch trocken tupfen und kalt halten.',
    ],
    curing:
      'Pökelmischung nach Packungsangabe gleichmäßig einmassieren, dann vakuumiert oder im geschlossenen Behälter im Kühlschrank pökeln.',
    curingTime: 'Nach Packungsangabe, abhängig von der Dicke des Stücks.',
    durchbrennen:
      'Nach dem Pökeln abspülen, trocken tupfen und im Kühlschrank durchbrennen lassen. Faustregel: etwa ein Drittel bis die Hälfte der Pökelzeit. In dieser Phase verteilt sich das Salz gleichmäßig im Fleisch.',
    drying:
      'Anschließend an der Luft trocknen, bis die Oberfläche griffig-trocken ist. Feuchte Oberflächen nehmen den Rauch fleckig an.',
    smoking:
      'Kalträuchern bei unter 25 °C. Üblich sind mehrere Durchgänge von 8–12 Stunden mit Ruhephasen von 12–24 Stunden dazwischen.',
    ripening: 'Nach dem Räuchern kühl nachreifen lassen, bis der gewünschte Gewichtsverlust erreicht ist.',
    storage: 'Kühl und dunkel, am Stück deutlich länger haltbar als aufgeschnitten.',
    mistakes: [
      'Zu warm geräuchert – über 25 °C beginnt das Fleisch zu garen, der Schinken wird strohig.',
      'Durchbrennen übersprungen – der Schinken schmeckt außen salzig und innen fad.',
      'Zu feucht in den Rauch gehängt – ungleichmäßige Farbe und bitterer Beigeschmack.',
    ],
    safety: [
      curingSafetyNote,
      'Beim Pökeln durchgehend im Kühlbereich arbeiten.',
      'Beim Kalträuchern konsequent unter 25 °C bleiben.',
    ],
    products: ['lachsschinken-mischung', 'fleischerhaken-s-form-5mm', 'raeuchermehl-buche'],
  },
  {
    slug: 'schwarzwaelder-art',
    name: 'Schinken nach Schwarzwälder Art',
    level: 'Fortgeschritten',
    smoked: true,
    teaser: 'Kräftig gewürzt, kalt geräuchert, dunkel in der Farbe.',
    lead:
      'Wacholder, Knoblauch und Koriander treffen auf kräftigen Kaltrauch. Beachten Sie: „Schwarzwälder Schinken" ist eine geschützte Herkunftsbezeichnung – selbst hergestellte Ware heißt korrekt „nach Schwarzwälder Art".',
    cut: 'Schweinekeule bzw. Oberschale ohne Knochen.',
    mixture: 'schwarzwaelder-art-mischung',
    preparation: ['Fleisch sauber parieren, Sehnen und lose Teile entfernen.'],
    curing: 'Pökelmischung nach Packungsangabe einmassieren, kühl pökeln.',
    curingTime: 'Nach Packungsangabe – große Keulenstücke brauchen deutlich länger als Lachsschinken.',
    durchbrennen: 'Abspülen, trocken tupfen und im Kühlen durchbrennen lassen.',
    drying: 'An der Luft trocknen, bis die Oberfläche griffig ist.',
    smoking:
      'Kalträuchern unter 25 °C, klassisch mit Buche, häufig mit Eichenanteil. Mehrere Durchgänge mit Ruhephasen.',
    ripening: 'Kühl reifen lassen, bis die gewünschte Festigkeit erreicht ist.',
    storage: 'Kühl, dunkel und luftig.',
    mistakes: [
      'Zu kurz gepökelt bei dickem Stück – der Kern bleibt unbehandelt.',
      'Zu viel Rauch am Stück – der Schinken wird bitter statt würzig.',
    ],
    safety: [
      curingSafetyNote,
      'Große Stücke brauchen längere Pökelzeiten. Im Zweifel eher länger pökeln.',
      'Die Bezeichnung „Schwarzwälder Schinken" ist geschützt.',
    ],
    products: ['schwarzwaelder-art-mischung', 'raeuchermehl-eiche', 'fleischerhaken-s-form-5mm'],
  },
  {
    slug: 'parma-art',
    name: 'Schinken nach Parmaer Art',
    level: 'Profi',
    smoked: false,
    teaser: 'Nur Salz, Luft und viel Zeit – ohne Rauch, dafür mit Anspruch an den Reifeort.',
    lead:
      'Parma-Art ist Lufttrocknung in Reinform. Es gibt keinen Rauch, der Fehler überdeckt – das Ergebnis entsteht ausschließlich aus Salz, Temperatur, Luftfeuchte und Zeit. Ohne geeigneten Reifeplatz sollte man es nicht versuchen.',
    cut: 'Schweinekeule, möglichst am Stück.',
    mixture: 'parma-art-mischung',
    preparation: ['Keule sorgfältig parieren und trocken tupfen.'],
    curing: 'Mischung nach Packungsangabe aufbringen, kühl pökeln.',
    curingTime: 'Nach Packungsangabe – bei ganzen Keulen sind lange Zeiträume normal.',
    durchbrennen: 'Ausgiebig durchbrennen lassen, damit sich das Salz vollständig verteilt.',
    drying: 'Oberfläche abtrocknen lassen, danach beginnt die eigentliche Reifephase.',
    smoking: 'Kein Räuchern. Parma-Art wird ausschließlich luftgetrocknet.',
    ripening:
      'Über Monate kühl bei kontrollierter Luftfeuchte reifen lassen. Zu trocken bedeutet Trockenrand, zu feucht bedeutet Schimmelrisiko.',
    storage: 'Kühl und dunkel, am Stück hängend.',
    mistakes: [
      'Reifeort zu warm oder zu trocken – außen hart, innen roh.',
      'Keine Luftzirkulation – Schimmel- und Verderbrisiko.',
      'Zu früh angeschnitten – der Schinken braucht seine Zeit.',
    ],
    safety: [
      curingSafetyNote,
      'Lange Reifezeiten stellen hohe Anforderungen an Hygiene und Klimaführung.',
      'Weißer, trockener Edelschimmel ist normal. Grüne, schwarze oder schmierige Beläge sind ein Abbruchgrund.',
      '„Prosciutto di Parma" ist geschützt – selbst hergestellte Ware heißt „nach Parmaer Art".',
    ],
    products: ['parma-art-mischung', 'fleischerhaken-s-form-5mm'],
  },
  {
    slug: 'serrano-art',
    name: 'Schinken nach Serrano Art',
    level: 'Profi',
    smoked: false,
    teaser: 'Der spanische Verwandte: etwas kräftiger im Salz, etwas kürzer gereift.',
    lead:
      'Serrano-Art folgt demselben Prinzip wie Parma-Art, ist aber in der Regel etwas salziger und wird kürzer gereift. Auch hier gilt: kein Rauch, sondern Luft und Zeit.',
    cut: 'Schweinekeule.',
    mixture: 'serrano-art-mischung',
    preparation: ['Keule parieren und trocken tupfen.'],
    curing: 'Mischung nach Packungsangabe aufbringen, kühl pökeln.',
    curingTime: 'Nach Packungsangabe.',
    durchbrennen: 'Im Kühlen durchbrennen lassen.',
    drying: 'Oberfläche trocknen lassen.',
    smoking: 'Kein Räuchern.',
    ripening: 'Kühl und kontrolliert reifen, kürzer als bei Parma-Art.',
    storage: 'Kühl, dunkel, hängend.',
    mistakes: [
      'Klima nicht kontrolliert – der häufigste Grund für Fehlversuche.',
      'Zu große Stücke für den vorhandenen Reifeplatz gewählt.',
    ],
    safety: [
      curingSafetyNote,
      'Temperatur und Luftfeuchte über die gesamte Reifezeit im Blick behalten.',
      '„Jamón Serrano" ist eine geschützte Bezeichnung.',
    ],
    products: ['serrano-art-mischung', 'fleischerhaken-s-form-5mm'],
  },
  {
    slug: 'rindersaftschinken',
    name: 'Rindersaftschinken',
    level: 'Einsteiger',
    smoked: 'optional',
    teaser: 'Gepökelt und gegart statt roh gereift – ohne Reifeschrank machbar.',
    lead:
      'Der Saftschinken ist die pragmatische Variante: Er wird gepökelt und anschließend gegart. Damit entfällt die anspruchsvolle Reifephase komplett – ideal, wenn kein Reifeort zur Verfügung steht.',
    cut: 'Rindfleisch aus der Oberschale oder Nuss.',
    mixture: 'rindersaftschinken-mischung',
    preparation: ['Fleisch parieren, Sehnen entfernen.'],
    curing: 'Mischung nach Packungsangabe einbringen, im Kühlbereich pökeln.',
    curingTime: 'Nach Packungsangabe.',
    durchbrennen: 'Kurz im Kühlen durchbrennen lassen.',
    drying: 'Oberfläche abtrocknen lassen, wenn anschließend geräuchert werden soll.',
    smoking: 'Optional kurz kalt oder warm räuchern – der Saftschinken funktioniert auch ohne Rauch.',
    ripening: 'Entfällt. Stattdessen: Garen bis zur vorgesehenen Kerntemperatur.',
    storage: 'Nach dem Garen zügig abkühlen, kühl lagern und zeitnah verbrauchen.',
    mistakes: [
      'Über die Zeit statt über die Kerntemperatur gegart – das Ergebnis wird trocken.',
      'Nach dem Garen zu langsam abgekühlt.',
    ],
    safety: [
      curingSafetyNote,
      'Kerntemperatur mit dem Thermometer kontrollieren, nicht schätzen.',
      'Nach dem Garen zügig herunterkühlen und durchgehend kühl lagern.',
    ],
    products: ['rindersaftschinken-mischung', 'fleischerhaken-s-form-5mm'],
  },
  {
    slug: 'bauchspeck',
    name: 'Bauchspeck',
    level: 'Einsteiger',
    smoked: true,
    teaser: 'Deftig, dankbar und günstig – ein sehr guter zweiter Versuch.',
    lead:
      'Bauchspeck verzeiht viel: Der hohe Fettanteil verhindert, dass das Stück austrocknet. Wer beim Lachsschinken Blut geleckt hat, macht als Nächstes Speck.',
    cut: 'Schweinebauch mit Schwarte oder ohne, am Stück.',
    mixture: 'fleischgewuerz',
    mixtureNote:
      'Eine Pökelmischung ist erforderlich; das Fleischgewürz ergänzt sie geschmacklich, ersetzt sie aber nicht.',
    preparation: ['Bauch auf gleichmäßige Dicke zuschneiden, Knorpel und Knochenreste entfernen.'],
    curing: 'Pökelmischung nach Packungsangabe einreiben, kühl pökeln.',
    curingTime: 'Nach Packungsangabe.',
    durchbrennen: 'Abspülen, trocken tupfen, im Kühlen durchbrennen lassen.',
    drying: 'An der Luft trocknen lassen, bis die Oberfläche griffig ist.',
    smoking: 'Kalträuchern unter 25 °C, klassisch mit Buche oder Eiche. Mehrere Durchgänge.',
    ripening: 'Kurze Nachreifung reicht aus.',
    storage: 'Kühl und dunkel.',
    mistakes: [
      'Zu dünne Stücke – sie trocknen beim Räuchern zu stark aus.',
      'Zu viele Rauchdurchgänge – der Speck wird bitter.',
    ],
    safety: [curingSafetyNote, 'Beim Kalträuchern unter 25 °C bleiben.'],
    products: ['fleischgewuerz', 'raeuchermehl-eiche', 'fleischerhaken-s-form-5mm'],
  },
  {
    slug: 'nussschinken',
    name: 'Nussschinken',
    level: 'Fortgeschritten',
    smoked: true,
    teaser: 'Aus der Nuss der Keule – gleichmäßig geformt und dadurch gut kalkulierbar.',
    lead:
      'Die Nuss ist ein kompaktes, rundes Teilstück der Keule. Weil sie überall etwa gleich dick ist, salzt und trocknet sie sehr gleichmäßig – das macht den Nussschinken angenehm berechenbar.',
    cut: 'Nuss aus der Schweinekeule.',
    mixture: 'schwarzwaelder-art-mischung',
    mixtureNote: 'Je nach gewünschter Würzrichtung auch mit einer milderen Mischung möglich.',
    preparation: ['Nuss parieren, Fettdeckel je nach Geschmack belassen.'],
    curing: 'Nach Packungsangabe pökeln.',
    curingTime: 'Nach Packungsangabe.',
    durchbrennen: 'Im Kühlen durchbrennen lassen.',
    drying: 'Bis zur griffigen Oberfläche trocknen.',
    smoking: 'Kalträuchern unter 25 °C in mehreren Durchgängen.',
    ripening: 'Kühl reifen, bis die gewünschte Schnittfestigkeit erreicht ist.',
    storage: 'Kühl und dunkel, am Stück.',
    mistakes: ['Zu früh angeschnitten – der Kern ist dann noch zu weich.'],
    safety: [curingSafetyNote, 'Kühlkette beim Pökeln einhalten.'],
    products: ['schwarzwaelder-art-mischung', 'raeuchermehl-buche', 'fleischerhaken-s-form-5mm'],
  },
  {
    slug: 'kochschinken',
    name: 'Kochschinken',
    level: 'Einsteiger',
    smoked: 'optional',
    teaser: 'Gepökelt und gebrüht – mild, saftig und in wenigen Tagen fertig.',
    lead:
      'Kochschinken ist der mildeste Vertreter: gepökelt, dann bei niedriger Temperatur gegart. Kein Reifeschrank, keine lange Wartezeit, kein Schimmelrisiko.',
    cut: 'Schweinekeule, Oberschale oder Nuss.',
    mixture: 'lachsschinken-mischung',
    mixtureNote: 'Auch mit einer speziellen Kochschinken-Mischung möglich, sofern vorhanden.',
    preparation: ['Fleisch parieren, gleichmäßig zuschneiden.'],
    curing: 'Nach Packungsangabe pökeln, im Kühlbereich.',
    curingTime: 'Nach Packungsangabe.',
    durchbrennen: 'Kurz durchbrennen lassen.',
    drying: 'Nur nötig, wenn anschließend geräuchert wird.',
    smoking: 'Optional leicht räuchern, klassisch bleibt der Kochschinken ungeräuchert.',
    ripening: 'Entfällt.',
    storage: 'Gekühlt lagern und zügig verbrauchen – Kochschinken ist nicht lange haltbar.',
    mistakes: [
      'Zu heiß gegart – der Schinken wird trocken und verliert Saft.',
      'Zu lange gelagert – ohne Reifung ist die Haltbarkeit begrenzt.',
    ],
    safety: [
      curingSafetyNote,
      'Bei niedriger Temperatur garen und die Kerntemperatur kontrollieren.',
      'Nach dem Garen zügig abkühlen und kühl lagern.',
    ],
    products: ['lachsschinken-mischung', 'fleischerhaken-s-form-5mm'],
  },
];

export function getHam(slug) {
  return hams.find((h) => h.slug === slug) || null;
}
