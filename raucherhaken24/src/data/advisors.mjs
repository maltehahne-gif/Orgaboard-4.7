/**
 * Interaktive Produktberater.
 * Fragen und Ergebnisse sind reine Daten - die Auswertung passiert im Browser
 * (assets/js/app.js). Empfohlen werden ausschliesslich Produkt-Slugs, die es
 * im Katalog tatsaechlich gibt; der Build prueft das (scripts/check.mjs).
 */

export const advisors = {
  raeuchermehl: {
    id: 'raeuchermehl',
    title: 'Welches Räuchermehl brauche ich?',
    intro:
      'Zwei Fragen – danach wissen Sie, welche Holzart und welche Körnung zu Ihrem Vorhaben passt.',
    steps: [
      {
        id: 'ziel',
        question: 'Was möchten Sie räuchern?',
        options: [
          { value: 'forelle', label: 'Forelle', hint: 'auch Saibling und ähnliche Salmoniden' },
          { value: 'aal', label: 'Aal', hint: 'fett und kräftig im Eigengeschmack' },
          { value: 'lachs', label: 'Lachs', hint: 'Seite, Filet oder Stremellachs' },
          { value: 'fleisch', label: 'Fleisch', hint: 'Speck, Wurst, Nacken' },
          { value: 'schinken', label: 'Schinken', hint: 'Rohschinken, Lachsschinken' },
          { value: 'kaese', label: 'Käse', hint: 'nur im Kaltrauch' },
        ],
      },
      {
        id: 'verfahren',
        question: 'Womit räuchern Sie?',
        options: [
          { value: 'schnecke', label: 'Räucherschnecke', hint: 'Kaltrauchgenerator / Sparbrand' },
          { value: 'kalt', label: 'Kalträuchern', hint: 'unter 25 °C, mehrere Durchgänge' },
          { value: 'heiss', label: 'Heißräuchern', hint: 'Räucherofen, 50–85 °C' },
        ],
      },
    ],
    /** Ergebnisregeln - die erste passende Regel gewinnt. */
    rules: [
      {
        when: { ziel: ['kaese'] },
        result: {
          title: 'Kirsche oder Buche – Körnung 1',
          text:
            'Käse gehört ausschließlich in den Kaltrauch. Kirsche gibt eine milde, fruchtige Note und eine schöne Farbe; Buche ist die neutralere Alternative. In beiden Fällen: feine Körnung, kurze Rauchzeit und danach ein bis zwei Tage im Kühlschrank ruhen lassen.',
          products: ['raeuchermehl-kirsche', 'raeuchermehl-buche'],
          links: [
            { label: 'Räucherzeiten für Käse', href: '/raeucherwissen/raeucherzeiten/' },
            { label: 'Temperaturen verstehen', href: '/raeucherwissen/temperaturen/' },
          ],
        },
      },
      {
        when: { ziel: ['schinken'], verfahren: ['schnecke', 'kalt'] },
        result: {
          title: 'Buche mit Eichenanteil – Körnung 1',
          text:
            'Für Rohschinken im Kaltrauch ist Buche die Basis; ein Anteil Eiche gibt Kraft und Farbe. Feine Körnung, weil die Durchgänge lang sind und das Mehl gleichmäßig durchglimmen muss.',
          products: ['raeuchermehl-buche', 'raeuchermehl-eiche'],
          links: [
            { label: 'Schinken selber machen', href: '/schinken-selber-machen/' },
            { label: 'Fleisch räuchern', href: '/raeucherwissen/fleisch-raeuchern/' },
          ],
        },
      },
      {
        when: { ziel: ['schinken'] },
        result: {
          title: 'Buche – Körnung 2',
          text:
            'Buche ist bei Schinken die verlässliche Wahl. Körnung 2 ist der Allrounder, wenn Sie nicht ausschließlich mit der Schnecke arbeiten.',
          products: ['raeuchermehl-buche'],
          links: [{ label: 'Schinken selber machen', href: '/schinken-selber-machen/' }],
        },
      },
      {
        when: { ziel: ['fleisch'], verfahren: ['schnecke', 'kalt'] },
        result: {
          title: 'Eiche oder Buche – Körnung 1',
          text:
            'Für Speck und Rohwurst im Kaltrauch ist Eiche das kräftige Aroma, Buche das mildere. Feine Körnung für die langen Durchgänge. Eiche eher sparsam – bei zu langer Rauchzeit wird sie herb.',
          products: ['raeuchermehl-eiche', 'raeuchermehl-buche'],
          links: [{ label: 'Fleisch räuchern', href: '/raeucherwissen/fleisch-raeuchern/' }],
        },
      },
      {
        when: { ziel: ['fleisch'] },
        result: {
          title: 'Buche – Körnung 3',
          text:
            'Für Fleisch im Heißrauch gibt Buche in gröberer Körnung schnell und zuverlässig Rauch. Birke ist die würzigere Alternative, wenn Sie Abwechslung suchen.',
          products: ['raeuchermehl-buche', 'raeuchermehl-birke'],
          links: [{ label: 'Temperaturen verstehen', href: '/raeucherwissen/temperaturen/' }],
        },
      },
      {
        when: { ziel: ['lachs'], verfahren: ['schnecke', 'kalt'] },
        result: {
          title: 'Erle – Körnung 1',
          text:
            'Erle ist die klassische Wahl für kalt geräucherten Lachs: mild, leicht süßlich, mit heller Farbe. Feine Körnung, weil in der Schnecke gleichmäßig und lange geglimmt werden muss.',
          products: ['raeuchermehl-erle'],
          links: [
            { label: 'Lachs räuchern', href: '/raeucherfisch/lachs/' },
            { label: 'Filethaken ansehen', href: '/produkt/raeucherhaken-filet/' },
          ],
        },
      },
      {
        when: { ziel: ['lachs'] },
        result: {
          title: 'Erle – Körnung 2 bis 3',
          text:
            'Für warm geräucherten Lachs (Stremellachs) passt Erle in mittlerer Körnung. Wer mehr Farbe möchte, mischt Buche dazu; Kirsche gibt eine feine Fruchtnote.',
          products: ['raeuchermehl-erle', 'raeuchermehl-kirsche'],
          links: [{ label: 'Lachs räuchern', href: '/raeucherfisch/lachs/' }],
        },
      },
      {
        when: { ziel: ['aal'] },
        result: {
          title: 'Erle oder Buche – Körnung 2 bis 3',
          text:
            'Aal ist fett und kräftig und verträgt beide Hölzer. Erle bleibt feiner, Buche gibt mehr Farbe und Kraft. Beim Heißräuchern die gröbere Körnung wählen.',
          products: ['raeuchermehl-erle', 'raeuchermehl-buche'],
          links: [
            { label: 'Aal räuchern', href: '/raeucherfisch/aal/' },
            { label: 'Aalhaken ansehen', href: '/produkt/raeucherhaken-standard-aal/' },
          ],
        },
      },
      {
        when: { ziel: ['forelle'], verfahren: ['schnecke', 'kalt'] },
        result: {
          title: 'Erle – Körnung 1',
          text:
            'Kalt geräucherte Forelle ist eine feine Sache – und braucht ein mildes Holz. Erle in feiner Körnung läuft in der Schnecke zuverlässig durch.',
          products: ['raeuchermehl-erle'],
          links: [{ label: 'Forelle räuchern', href: '/raeucherfisch/forelle/' }],
        },
      },
      {
        when: { ziel: ['forelle'] },
        result: {
          title: 'Erle oder Buche – Körnung 2 bis 3',
          text:
            'Für die Forelle im Heißrauch: Erle für mild und fein, Buche für kräftiger und mehr Farbe. Viele mischen beides. Körnung 2 oder 3, je nachdem wie schnell Ihr Ofen Rauch braucht.',
          products: ['raeuchermehl-erle', 'raeuchermehl-buche'],
          links: [
            { label: 'Forelle räuchern', href: '/raeucherfisch/forelle/' },
            { label: 'Anfängerwissen', href: '/raeucherwissen/anfaengerwissen/' },
          ],
        },
      },
    ],
    fallback: {
      title: 'Buche – Körnung 2',
      text:
        'Buche in mittlerer Körnung ist die sichere Wahl, wenn Sie sich noch nicht festgelegt haben. Sie passt zu Fisch, Fleisch und Schinken gleichermaßen.',
      products: ['raeuchermehl-buche'],
      links: [{ label: 'Räuchermehl verstehen', href: '/raeuchermehl/' }],
    },
  },

  haken: {
    id: 'haken',
    title: 'Welcher Räucherhaken passt zu meinem Räuchergut?',
    intro: 'Drei Fragen zu Räuchergut, Gewicht und Einsatz – danach kennen Sie Form und Material.',
    steps: [
      {
        id: 'gut',
        question: 'Was hängen Sie auf?',
        options: [
          { value: 'ganzfisch', label: 'Ganzer Fisch', hint: 'Forelle, Makrele, Saibling, Hering' },
          { value: 'aal', label: 'Aal', hint: 'lang, schwer, sehr glatt' },
          { value: 'filet', label: 'Filet oder Seite', hint: 'Lachsseite, Stremellachs, Forellenfilet' },
          { value: 'weich', label: 'Weicher Fisch', hint: 'Dorsch, Kabeljau, sehr fetter Fisch' },
          { value: 'fleisch', label: 'Fleisch oder Schinken', hint: 'Schinken, Bauch, Wurst' },
        ],
      },
      {
        id: 'gewicht',
        question: 'Wie schwer ist ein einzelnes Stück ungefähr?',
        options: [
          { value: 'leicht', label: 'Bis etwa 1 kg', hint: 'Portionsforelle, Makrele, Hering' },
          { value: 'mittel', label: 'Etwa 1 bis 2,5 kg', hint: 'große Forelle, mittlerer Zander' },
          { value: 'schwer', label: 'Über 2,5 kg', hint: 'Lachsseite, Karpfen, großer Aal' },
        ],
      },
      {
        id: 'einsatz',
        question: 'Wie intensiv nutzen Sie die Haken?',
        options: [
          { value: 'hobby', label: 'Gelegentlich, Süßwasser', hint: 'Haken werden nach Gebrauch abgespült' },
          { value: 'salz', label: 'Kräftige Lake oder Küste', hint: 'viel Salz, feuchte Lagerung' },
          { value: 'gewerbe', label: 'Sehr häufig / gewerblich', hint: 'täglicher Einsatz, wenig Pflegezeit' },
        ],
      },
    ],
    rules: [
      {
        when: { gut: ['aal'] },
        result: {
          title: 'Räucherhaken Standard Aal',
          text:
            'Beim Aal ist der Aalhaken nicht optional. Ein normaler Standardhaken reißt aus, weil das gesamte Gewicht an einem Punkt zieht und die Haut extrem glatt ist. Wichtig bleibt trotzdem: Der Aal muss vorher gründlich entschleimt werden, sonst hält kein Haken.',
          products: ['raeucherhaken-standard-aal'],
          links: [{ label: 'Aal räuchern', href: '/raeucherfisch/aal/' }],
        },
      },
      {
        when: { gut: ['filet'] },
        result: {
          title: 'Räucherhaken Filet',
          text:
            'Filets haben keinen tragenden Knochenpunkt. Der Filethaken fasst die Seite so, dass sie nicht ausreißt. Setzen Sie ihn im festen Nackenteil an, nicht im dünnen Bauchlappen – und hängen Sie das Filet erst auf, wenn sich eine Pellicle gebildet hat.',
          products: ['raeucherhaken-filet'],
          links: [
            { label: 'Lachs räuchern', href: '/raeucherfisch/lachs/' },
            { label: 'Stremellachs-Gewürz', href: '/produkt/stremellachs-gewuerz/' },
          ],
        },
      },
      {
        when: { gut: ['weich'] },
        result: {
          title: 'Räucherhaken Kralle',
          text:
            'Bei weichem, blättrigem Fleisch verteilt die Kralle die Last auf mehrere Spitzen. Ein einzelner Dorn reißt hier zuverlässig aus. Alternativ ist es bei Dorsch völlig legitim, auf einem Rost statt am Haken zu räuchern.',
          products: ['raeucherhaken-kralle', 'raeucherhaken-filet'],
          links: [{ label: 'Dorsch räuchern', href: '/raeucherfisch/dorsch/' }],
        },
      },
      {
        when: { gut: ['fleisch'] },
        result: {
          title: 'Fleischerhaken S-Form 5 mm',
          text:
            'Für Schinken, Bauch und Wurst ist der S-Haken die richtige Aufhängung: oben über die Stange, unten ins Fleisch. Bei sehr schweren Stücken lieber zwei Haken setzen als einen überlasten.',
          products: ['fleischerhaken-s-form-5mm'],
          links: [{ label: 'Schinken selber machen', href: '/schinken-selber-machen/' }],
        },
      },
      {
        when: { gut: ['ganzfisch'], gewicht: ['schwer'] },
        result: {
          title: 'Räucherhaken 3-Dorn',
          text:
            'Über 2,5 kg gehört das Gewicht auf mehrere Punkte verteilt. Der 3-Dorn ist die stabilste Aufhängung und die richtige Wahl, wenn ein Abriss besonders ärgerlich wäre.',
          products: ['raeucherhaken-3-dorn', 'raeucherhaken-doppeldorn'],
          links: [{ label: 'Karpfen räuchern', href: '/raeucherfisch/karpfen/' }],
        },
      },
      {
        when: { gut: ['ganzfisch'], gewicht: ['mittel'] },
        result: {
          title: 'Räucherhaken Doppeldorn',
          text:
            'Ab etwa einem Kilogramm zieht sich der Fisch am Einzeldorn spürbar durch. Zwei Dornen halbieren den Druck pro Einstich und halten den Fisch außerdem gerader im Rauch.',
          products: ['raeucherhaken-doppeldorn', 'raeucherhaken-kralle'],
          links: [{ label: 'Forelle räuchern', href: '/raeucherfisch/forelle/' }],
        },
      },
      {
        when: { gut: ['ganzfisch'] },
        result: {
          title: 'Räucherhaken Standard',
          text:
            'Für Fisch in Portionsgröße ist der Standardhaken genau richtig – ein Dorn durch das feste Kopffleisch, fertig. Er ist der Haken, mit dem die meisten anfangen und bei dem die meisten bleiben.',
          products: ['raeucherhaken-standard'],
          links: [
            { label: 'Anfängerwissen', href: '/raeucherwissen/anfaengerwissen/' },
            { label: 'Forelle räuchern', href: '/raeucherfisch/forelle/' },
          ],
        },
      },
    ],
    fallback: {
      title: 'Räucherhaken Standard',
      text:
        'Wenn Sie sich nicht sicher sind, ist der Standardhaken der richtige Start. Er deckt den größten Teil der üblichen Fische ab.',
      products: ['raeucherhaken-standard'],
      links: [{ label: 'Alle Räucherhaken', href: '/kategorie/raeucherhaken/' }],
    },
    /** Materialempfehlung ergänzt jedes Ergebnis, abhängig von der 3. Frage. */
    materialAdvice: {
      hobby: {
        pick: 'V2A',
        text:
          'Bei gelegentlichem Einsatz in Süßwasser und normaler Pflege ist V2A völlig ausreichend – abspülen, trocknen, trocken lagern.',
      },
      salz: {
        pick: 'V4A',
        text:
          'Bei kräftiger Salzlake oder Küstennähe ist V4A die langlebigere Wahl. Das Molybdän schützt die Passivschicht gegen Chloride.',
      },
      gewerbe: {
        pick: 'V4A',
        text:
          'Bei täglichem Einsatz, vielen Nutzern und wenig Zeit für Pflege zahlt sich V4A schnell aus.',
      },
    },
  },
};
