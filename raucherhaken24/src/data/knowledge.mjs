/**
 * Räucherwissen - redaktionelle Artikel.
 * Bloecke: p (Absatz), ul/ol (Liste), note (Hinweiskasten), table (Vergleich),
 * steps (nummerierte Schrittfolge).
 */

export const articles = [
  {
    slug: 'va-v2a-v4a',
    title: 'VA, V2A und V4A verständlich erklärt',
    metaTitle: 'VA, V2A oder V4A? Edelstahl für Räucherhaken im Vergleich',
    metaDescription:
      'V2A oder V4A für Räucherhaken? Unterschiede bei Rost, Salz, Reinigung und Lebensdauer – mit Vergleichstabelle und klarer Kaufempfehlung für Einsteiger.',
    lead:
      'Bei Räucherhaken taucht ständig die Frage auf: V2A oder V4A? Der Preisunterschied ist spürbar, der Unterschied im Alltag aber nicht immer. Hier steht, worauf es wirklich ankommt.',
    sections: [
      {
        title: 'Was bedeutet eigentlich „VA"?',
        blocks: [
          {
            type: 'p',
            text:
              '„VA" steht für „Versuchsschmelze Austenit" und ist kein eigener Werkstoff, sondern ein Sammelbegriff für rostfreie austenitische Edelstähle. Wenn irgendwo nur „VA" steht, ist damit noch nichts über die tatsächliche Beständigkeit gesagt. Fragen Sie in dem Fall nach, ob V2A oder V4A gemeint ist.',
          },
          {
            type: 'ul',
            items: [
              '<strong>V2A</strong> entspricht im Wesentlichen dem Werkstoff 1.4301 – der klassische rostfreie Stahl aus Küche und Haushalt.',
              '<strong>V4A</strong> steht für 1.4571 bzw. 1.4404 – zusätzlich mit Molybdän legiert.',
            ],
          },
        ],
      },
      {
        title: 'Der eine entscheidende Unterschied: Salz',
        blocks: [
          {
            type: 'p',
            text:
              'Beide Stähle rosten unter normalen Bedingungen nicht. Der Unterschied zeigt sich erst dort, wo Chloride ins Spiel kommen – also überall dort, wo Salz ist. Und beim Räuchern ist immer Salz im Spiel: in der Lake, im Pökelsalz, an der Fischhaut.',
          },
          {
            type: 'p',
            text:
              'Das Molybdän im V4A macht die schützende Passivschicht widerstandsfähiger gegen genau diesen Angriff. V2A kann bei dauerhaftem Salzkontakt sogenannte Lochfraßkorrosion entwickeln: kleine, punktförmige Vertiefungen, die sich nicht mehr wegpolieren lassen.',
          },
          {
            type: 'note',
            tone: 'info',
            text:
              'Wichtig: V2A rostet nicht, weil es „schlecht" wäre. Es rostet, wenn es dauerhaft in Salzlake liegt und danach nicht abgespült wird. Wer seine Haken pflegt, hält auch V2A jahrelang einwandfrei.',
          },
        ],
      },
      {
        title: 'Vergleich auf einen Blick',
        blocks: [
          {
            type: 'table',
            caption: 'V2A und V4A im direkten Vergleich',
            head: ['Kriterium', 'V2A (1.4301)', 'V4A (1.4571 / 1.4404)'],
            rows: [
              ['Rostfrei im Normalgebrauch', 'Ja', 'Ja'],
              ['Beständig gegen Salzlake', 'Bedingt – bei Dauerkontakt Lochfraß möglich', 'Sehr gut'],
              ['Meerwasser / Seeluft', 'Eingeschränkt geeignet', 'Geeignet'],
              ['Verhalten bei Dauerfeuchte', 'Empfindlicher, muss trocken gelagert werden', 'Deutlich unempfindlicher'],
              ['Reinigung', 'Warm abspülen, trocknen', 'Warm abspülen, trocknen'],
              ['Lebensdauer bei Salzbetrieb', 'Kürzer', 'Länger'],
              ['Preis', 'Günstiger', 'Höher'],
              ['Typische Anwendung', 'Süßwasserfisch, Hobbybetrieb, gepflegte Haken', 'Kräftige Lake, Küstenbetrieb, gewerblicher Dauereinsatz'],
            ],
          },
        ],
      },
      {
        title: 'Reinigung und Lebensdauer',
        blocks: [
          {
            type: 'ol',
            items: [
              'Haken direkt nach dem Räuchern warm abspülen, solange Fett und Eiweiß noch weich sind.',
              'Keine Stahlwolle und keine Drahtbürste aus normalem Stahl benutzen. Deren Partikel bleiben auf der Oberfläche haften und rosten dort – das sieht aus wie Rost am Haken, ist aber Fremdrost.',
              'Nach dem Spülen vollständig trocknen lassen, bevor die Haken weggeräumt werden.',
              'Nicht feucht in geschlossenen Boxen lagern. Das ist die mit Abstand häufigste Ursache für Flugrost.',
            ],
          },
          {
            type: 'note',
            tone: 'warn',
            text:
              'Flugrost auf Edelstahl kommt fast immer von außen – von Fremdstahl, von rostenden Nachbarteilen oder von einer Drahtbürste. Er lässt sich meist mit einem Edelstahlreiniger entfernen.',
          },
        ],
      },
      {
        title: 'Unsere Empfehlung',
        blocks: [
          {
            type: 'recommendation',
            items: [
              {
                for: 'Einsteiger, Hobby, Süßwasserfisch',
                pick: 'V2A',
                why: 'Sie räuchern gelegentlich Forelle oder Makrele, spülen die Haken danach ab und lagern sie trocken? Dann ist V2A völlig ausreichend und die vernünftigere Investition.',
              },
              {
                for: 'Kräftige Lake, Aal, Salzhaltiges, Küstennähe',
                pick: 'V4A',
                why: 'Wer regelmäßig in kräftiger Salzlake arbeitet, Aal räuchert oder in Küstennähe lagert, hat mit V4A langfristig weniger Ärger.',
              },
              {
                for: 'Gewerblicher oder Vereinsbetrieb',
                pick: 'V4A',
                why: 'Bei täglichem Einsatz, vielen Nutzern und wenig Zeit für Pflege zahlt sich die höhere Beständigkeit schnell aus.',
              },
            ],
          },
          {
            type: 'p',
            text:
              'Kurzfassung für Ungeduldige: Im Zweifel V2A kaufen und die Haken pflegen. Wenn Sie viel mit Salz arbeiten oder die Pflege realistisch nicht durchhalten, nehmen Sie V4A.',
          },
        ],
      },
    ],
    faq: [
      {
        q: 'Ist V4A immer besser als V2A?',
        a: 'Beständiger ja, besser nicht automatisch. Wer Süßwasserfisch räuchert und die Haken pflegt, merkt im Alltag keinen Unterschied und zahlt bei V4A nur mehr.',
      },
      {
        q: 'Woran erkenne ich, ob ein Haken V2A oder V4A ist?',
        a: 'Mit bloßem Auge nicht. Beide sehen gleich aus. Verlassen Sie sich auf die Werkstoffangabe des Herstellers – 1.4301 ist V2A, 1.4571 bzw. 1.4404 ist V4A.',
      },
      {
        q: 'Mein Edelstahlhaken hat Rostpunkte. Ist er kaputt?',
        a: 'Meist nicht. In den allermeisten Fällen handelt es sich um Fremdrost, der sich mit Edelstahlreiniger entfernen lässt. Echter Lochfraß zeigt sich als kleine Vertiefung im Material und lässt sich nicht wegpolieren.',
      },
    ],
    products: ['raeucherhaken-standard', 'raeucherhaken-doppeldorn', 'raeucherhaken-standard-aal'],
  },
  {
    slug: 'temperaturen',
    title: 'Räuchertemperaturen: kalt, warm und heiß',
    metaTitle: 'Räuchertemperaturen – Kalträuchern, Warmräuchern, Heißräuchern',
    metaDescription:
      'Welche Temperatur beim Räuchern? Kalt-, Warm- und Heißräuchern im Überblick, mit Kerntemperaturen für Fisch und Fleisch und den typischen Fehlerquellen.',
    lead:
      'Die Temperatur entscheidet darüber, ob Ihr Räuchergut konserviert oder gegart wird. Sie ist der wichtigste Stellhebel überhaupt – wichtiger als das Holz und wichtiger als die Zeit.',
    sections: [
      {
        title: 'Die drei Verfahren',
        blocks: [
          {
            type: 'table',
            caption: 'Verfahren, Temperaturbereich und Wirkung',
            head: ['Verfahren', 'Temperatur', 'Wirkung', 'Typisch für'],
            rows: [
              ['Kalträuchern', 'unter 25 °C (ideal 15–20 °C)', 'Gart nicht. Konserviert, trocknet, aromatisiert.', 'Rohschinken, Lachs, Speck, Käse'],
              ['Warmräuchern', '25–50 °C', 'Gart nicht vollständig. Zwischenstufe.', 'Brühwurst, Vorstufen'],
              ['Heißräuchern', '50–85 °C', 'Gart durch. Kurz haltbar.', 'Forelle, Makrele, Aal, Stremellachs'],
            ],
          },
          {
            type: 'note',
            tone: 'warn',
            text:
              'Die 25-°C-Grenze beim Kalträuchern ist kein Richtwert, sondern eine harte Grenze. Darüber beginnt das Eiweiß zu gerinnen – der Rohschinken wird strohig, der Lachs verliert seine Struktur, der Käse schwitzt.',
          },
        ],
      },
      {
        title: 'Kerntemperaturen, die Sie kennen sollten',
        blocks: [
          {
            type: 'p',
            text:
              'Beim Heißräuchern entscheidet nicht die Uhr, sondern das Thermometer. Ein Kernthermometer ist die günstigste Anschaffung mit dem größten Effekt auf Ihr Ergebnis.',
          },
          {
            type: 'table',
            caption: 'Kerntemperaturen beim Heißräuchern',
            head: ['Räuchergut', 'Kerntemperatur', 'Hinweis'],
            rows: [
              ['Fisch (heiß geräuchert)', 'mindestens 62 °C, 30 Minuten gehalten – sicher bei 65 °C', 'Im dicksten Teil messen, nicht am Knochen.'],
              ['Geflügel', '72–74 °C', 'Geflügel immer vollständig durchgaren.'],
              ['Saft- und Kochschinken', 'nach Rezept, üblich um 68–70 °C', 'Über die Kerntemperatur steuern, nicht über die Zeit.'],
            ],
          },
        ],
      },
      {
        title: 'Der typische Temperaturverlauf beim Fisch',
        blocks: [
          {
            type: 'steps',
            items: [
              { title: 'Trocknen', text: '40–50 °C, ohne Rauch. Die Oberfläche muss trocken werden, sonst haftet der Rauch nicht und die Farbe wird fleckig.' },
              { title: 'Garen', text: '75–90 °C, bis die Kerntemperatur erreicht ist. In dieser Phase wird der Fisch gar.' },
              { title: 'Räuchern', text: '60–70 °C mit Rauch. Jetzt kommen Farbe und Aroma dazu.' },
            ],
          },
          {
            type: 'p',
            text:
              'Wer diese drei Phasen zusammenwirft und von Anfang an mit voller Hitze und viel Rauch arbeitet, bekommt außen dunkle, innen rohe Fische mit platzender Haut. Die Reihenfolge ist kein Ritual, sondern der Grund, warum es funktioniert.',
          },
        ],
      },
      {
        title: 'Häufige Fehler bei der Temperaturführung',
        blocks: [
          {
            type: 'ul',
            items: [
              'Zu heiß gestartet – die Haut platzt, der Fisch verliert Saft.',
              'Beim Kalträuchern über 25 °C gekommen – häufig im Sommer, deshalb ist Kaltrauch Wintersache.',
              'Nur nach Zeit gearbeitet statt nach Kerntemperatur.',
              'Thermometer an der falschen Stelle – am Knochen oder im Ofenraum statt im dicksten Fleischteil.',
              'Ofentür zu oft geöffnet – jede Kontrolle kostet Temperatur und verlängert den Vorgang.',
            ],
          },
        ],
      },
    ],
    faq: [
      {
        q: 'Kann ich im Sommer kalträuchern?',
        a: 'Nur eingeschränkt. Sobald die Außentemperatur dauerhaft über etwa 20 °C liegt, wird es schwierig, im Ofen unter 25 °C zu bleiben. Kalträuchern ist klassischerweise Wintersache.',
      },
      {
        q: 'Wie messe ich die Kerntemperatur beim Fisch richtig?',
        a: 'Im dicksten Bereich hinter dem Kopf, parallel zur Wirbelsäule, ohne den Knochen zu berühren. Am Knochen misst man zu hohe Werte.',
      },
    ],
    products: [],
  },
  {
    slug: 'raeucherzeiten',
    title: 'Räucherzeiten: Richtwerte für Fisch, Fleisch und Käse',
    metaTitle: 'Räucherzeiten – Richtwerte für Fisch, Schinken, Speck und Käse',
    metaDescription:
      'Wie lange räuchern? Richtwerte für Forelle, Aal, Lachs, Schinken, Speck und Käse – und warum die Kerntemperatur wichtiger ist als die Uhr.',
    lead:
      'Räucherzeiten sind Anhaltspunkte, keine Rezepte. Ofenbauart, Beladung, Außentemperatur und Größe des Räucherguts verschieben jede Zeitangabe. Nutzen Sie die folgenden Werte zur Planung – und entscheiden Sie am Ende über Kerntemperatur und Aussehen.',
    sections: [
      {
        title: 'Richtwerte Heißräuchern',
        blocks: [
          {
            type: 'table',
            caption: 'Übliche Gesamtdauer inklusive Trocknen und Garen',
            head: ['Räuchergut', 'Gesamtdauer', 'Davon Rauchzeit'],
            rows: [
              ['Forelle', '1,5–2,5 Stunden', '30–60 Minuten'],
              ['Makrele', '1,5–2 Stunden', '30–45 Minuten'],
              ['Hering / Bückling', '45–90 Minuten', '20–40 Minuten'],
              ['Aal', '2–3 Stunden', '45–90 Minuten'],
              ['Zander', '1,5–2 Stunden', '30–45 Minuten'],
              ['Karpfen', '2–3 Stunden', '45–60 Minuten'],
              ['Stremellachs', '1–2 Stunden', '30–60 Minuten'],
            ],
          },
        ],
      },
      {
        title: 'Richtwerte Kalträuchern',
        blocks: [
          {
            type: 'p',
            text:
              'Beim Kalträuchern wird in Durchgängen gearbeitet: Rauchphase, dann Ruhephase. Die Ruhephasen sind kein Leerlauf – in ihnen verteilt sich das Aroma im Räuchergut und die scharfen Rauchnoten runden sich ab.',
          },
          {
            type: 'table',
            caption: 'Durchgänge und Ruhezeiten',
            head: ['Räuchergut', 'Durchgänge', 'Je Durchgang', 'Ruhephase'],
            rows: [
              ['Lachs (kalt)', '2–4', '8–12 Stunden', '12–24 Stunden'],
              ['Rohschinken', '3–6', '8–12 Stunden', '12–24 Stunden'],
              ['Bauchspeck', '3–5', '8–12 Stunden', '12–24 Stunden'],
              ['Käse', '1–2', '2–6 Stunden', '1–2 Tage im Kühlschrank'],
            ],
          },
          {
            type: 'note',
            tone: 'info',
            text:
              'Käse braucht deutlich weniger Rauch als die meisten erwarten. Zwei bis vier Stunden reichen oft völlig aus – und der Käse sollte danach ein bis zwei Tage im Kühlschrank ruhen, bevor er verkostet wird.',
          },
        ],
      },
      {
        title: 'Warum Zeitangaben trügerisch sind',
        blocks: [
          {
            type: 'ul',
            items: [
              'Ein voll beladener Ofen braucht länger als ein halb beladener.',
              'Im Winter kühlt der Ofen bei jedem Öffnen stärker aus.',
              'Ein 300-g-Fisch und ein 800-g-Fisch sind zwei verschiedene Aufgaben.',
              'Elektro-, Gas- und Holzöfen halten die Temperatur unterschiedlich stabil.',
            ],
          },
          {
            type: 'p',
            text:
              'Deshalb gilt: Zeiten zum Planen, Kerntemperatur zum Entscheiden. Wer sich beim Heißräuchern ein Kernthermometer anschafft, spart sich das Rätselraten dauerhaft.',
          },
        ],
      },
    ],
    faq: [
      {
        q: 'Kann man zu lange räuchern?',
        a: 'Ja. Zu lange oder zu dichter Rauch macht das Ergebnis bitter und beißend. Mehr Rauch ist nicht mehr Geschmack – ab einem gewissen Punkt ist es einfach nur zu viel.',
      },
      {
        q: 'Muss ich zwischen den Durchgängen wirklich ruhen lassen?',
        a: 'Beim Kalträuchern ja. Ohne Ruhephasen wirkt der Rauch scharf und liegt nur außen auf. Die Pausen sind der Grund, warum gut gemachter Rohschinken rund schmeckt.',
      },
    ],
    products: [],
  },
  {
    slug: 'anfaengerwissen',
    title: 'Anfängerwissen: Ihr erster Räuchergang',
    metaTitle: 'Räuchern für Anfänger – der erste Räuchergang Schritt für Schritt',
    metaDescription:
      'Räuchern lernen: Was Sie wirklich brauchen, wie der erste Räuchergang mit Forelle abläuft und welche Anfängerfehler Sie sich sparen können.',
    lead:
      'Sie haben noch nie geräuchert und wissen nicht, wo Sie anfangen sollen? Dann fangen Sie mit Forelle an. Hier steht, was Sie brauchen, wie der erste Durchgang abläuft und welche Fehler fast alle machen.',
    sections: [
      {
        title: 'Was Sie wirklich brauchen',
        blocks: [
          {
            type: 'ul',
            items: [
              '<strong>Einen Räucherofen</strong> – Tisch-, Schrank- oder Tonnenofen. Für den Anfang genügt jedes Modell, das eine Temperatur halten kann.',
              '<strong>Räucherhaken</strong> – einen pro Fisch, plus ein paar Ersatzhaken.',
              '<strong>Räuchermehl</strong> – Buche oder Erle, Körnung 2 oder 3.',
              '<strong>Salz oder eine fertige Räucherlauge</strong> – die Lauge nimmt Ihnen das Abwiegen ab.',
              '<strong>Ein Kernthermometer</strong> – die günstigste Anschaffung mit der größten Wirkung.',
              '<strong>Einen Eimer oder eine Wanne</strong> für das Lakebad, die vollständig in den Kühlbereich passt.',
            ],
          },
          {
            type: 'note',
            tone: 'info',
            text:
              'Was Sie am Anfang nicht brauchen: fünf Holzarten, eine Räucherschnecke und ein Reifeschrank. Erst der erste gelungene Fisch, dann das Zubehör.',
          },
        ],
      },
      {
        title: 'Der erste Räuchergang – Schritt für Schritt',
        blocks: [
          {
            type: 'steps',
            items: [
              { title: 'Fisch vorbereiten', text: 'Forelle ausnehmen, die Blutlinie an der Wirbelsäule gründlich auskratzen, innen und außen kalt abspülen.' },
              { title: 'Lake ansetzen', text: 'Salzlake mit rund 6–8 % Salz oder eine fertige Räucherlauge nach Packungsangabe. Die Fische müssen vollständig untertauchen.' },
              { title: 'Über Nacht salzen', text: '8–12 Stunden im Kühlen. Nicht bei Zimmertemperatur stehen lassen.' },
              { title: 'Abspülen und trocknen', text: 'Kurz abspülen, aufhängen und 1–2 Stunden an der Luft trocknen, bis die Haut matt und leicht klebrig ist. Diesen Schritt überspringen die meisten – und wundern sich über fleckige Fische.' },
              { title: 'Ofen vorheizen und trocknen', text: 'Ohne Rauch bei 40–50 °C, bis die Fische wirklich trocken sind.' },
              { title: 'Garen', text: 'Auf 80–90 °C hochgehen, bis im dicksten Teil 62–65 °C erreicht sind.' },
              { title: 'Räuchern', text: 'Auf 60–70 °C zurückgehen und das Räuchermehl aufgeben. 30–60 Minuten, bis die Farbe stimmt.' },
              { title: 'Abnehmen und ruhen lassen', text: 'Fische kurz abkühlen lassen, dann vom Haken nehmen. Lauwarm schmecken sie am besten.' },
            ],
          },
        ],
      },
      {
        title: 'Die fünf häufigsten Anfängerfehler',
        blocks: [
          {
            type: 'ol',
            items: [
              '<strong>Den Fisch nass aufgehängt.</strong> Ohne trockene Oberfläche haftet kein Rauch. Das Ergebnis ist fleckig und blass.',
              '<strong>Die Blutlinie nicht entfernt.</strong> Sie schmeckt bitter, und zwar deutlich.',
              '<strong>Zu viel Räuchermehl auf einmal.</strong> Mehr Mehl bedeutet nicht mehr Aroma, sondern bitteren Rauch.',
              '<strong>Zu heiß begonnen.</strong> Die Haut platzt, der Fisch trocknet aus.',
              '<strong>Nach Gefühl statt nach Kerntemperatur gearbeitet.</strong> Ein Thermometer für wenige Euro beendet dieses Problem dauerhaft.',
            ],
          },
        ],
      },
      {
        title: 'Sicherheit von Anfang an',
        blocks: [
          {
            type: 'ul',
            items: [
              'Glimmendes Räuchermehl nie unbeaufsichtigt lassen.',
              'Nur im Freien oder in dafür vorgesehenen Öfen räuchern – Rauchgase gehören nicht in geschlossene Räume.',
              'Beim Salzen und Pökeln durchgehend im Kühlbereich arbeiten.',
              'Heiß geräucherten Fisch zügig herunterkühlen und gekühlt lagern. Er ist nur wenige Tage haltbar.',
              'Ofen und Haken auf sicheren Stand bzw. sicheren Sitz prüfen, bevor es losgeht.',
            ],
          },
        ],
      },
    ],
    faq: [
      {
        q: 'Welcher Fisch eignet sich für den ersten Versuch?',
        a: 'Forelle. Sie ist gut verfügbar, hängt sicher am Haken, verzeiht Temperaturschwankungen und schmeckt schon beim ersten Mal gut. Makrele ist die ebenso dankbare Alternative.',
      },
      {
        q: 'Brauche ich unbedingt eine fertige Räucherlauge?',
        a: 'Nein, eine selbst angesetzte Salzlake funktioniert genauso. Die fertige Lauge nimmt Ihnen aber das Abwiegen und Abschmecken ab – für den Einstieg ist das eine echte Erleichterung.',
      },
      {
        q: 'Wie viele Fische passen in meinen Ofen?',
        a: 'So viele, wie mit deutlichem Abstand nebeneinander hängen können. Berühren sich zwei Fische, bleiben an den Kontaktstellen helle Streifen ohne Rauch.',
      },
    ],
    products: ['raeucherhaken-standard', 'raeucherlauge-forelle', 'raeuchermehl-buche'],
  },
  {
    slug: 'fisch-raeuchern',
    title: 'Fisch räuchern: das Grundwissen',
    metaTitle: 'Fisch räuchern – Anleitung, Temperaturen und Vorbereitung',
    metaDescription:
      'Fisch räuchern lernen: Vorbereitung, Lake, Trocknen, Temperaturführung und Kerntemperatur – verständlich erklärt, mit Übersicht zu allen Fischarten.',
    lead:
      'Fisch räuchern ist keine Geheimwissenschaft. Es sind vier Schritte, die aufeinander aufbauen – und drei davon passieren, bevor überhaupt Rauch im Spiel ist.',
    sections: [
      {
        title: 'Die vier Schritte',
        blocks: [
          {
            type: 'steps',
            items: [
              { title: 'Vorbereiten', text: 'Ausnehmen, Blutlinie entfernen, abspülen. Was hier liegen bleibt, schmeckt später bitter.' },
              { title: 'Salzen', text: 'In der Lake oder trocken. Salz würzt, festigt das Fleisch und entzieht Wasser.' },
              { title: 'Trocknen', text: 'Der am meisten unterschätzte Schritt. Ohne trockene Oberfläche haftet der Rauch nicht.' },
              { title: 'Räuchern', text: 'Erst trocknen, dann garen, dann räuchern – in dieser Reihenfolge.' },
            ],
          },
        ],
      },
      {
        title: 'Heiß oder kalt?',
        blocks: [
          {
            type: 'p',
            text:
              'Heiß geräucherter Fisch ist gegart: Forelle, Makrele, Aal, Bückling. Er ist sofort essfertig und hält sich nur wenige Tage. Kalt geräucherter Fisch bleibt roh: Lachs, Heilbutt. Er wird dünn aufgeschnitten und ist länger haltbar, verlangt aber deutlich mehr Erfahrung und einwandfreie Rohware.',
          },
          {
            type: 'note',
            tone: 'info',
            text: 'Für den Einstieg gilt ohne Einschränkung: heiß räuchern. Kaltrauch ist die zweite Lektion, nicht die erste.',
          },
        ],
      },
      {
        title: 'Welches Salz, welche Konzentration?',
        blocks: [
          {
            type: 'ul',
            items: [
              'Übliche Lakekonzentration für Fisch: rund 6–8 % Salz, bei feinen Fischen wie Saibling eher weniger.',
              'Fertige Räucherlaugen nach Packungsangabe ansetzen – dort ist die Konzentration bereits abgestimmt.',
              'Die Lake immer im Kühlen ansetzen und den Fisch vollständig untertauchen.',
              'Gebrauchte Lake nicht wiederverwenden.',
            ],
          },
        ],
      },
      {
        title: 'Der Trocknungsschritt entscheidet',
        blocks: [
          {
            type: 'p',
            text:
              'Nach dem Lakebad wird kurz abgespült und der Fisch aufgehängt, bis die Haut matt und leicht klebrig ist. Diese dünne Eiweißschicht heißt Pellicle. An ihr haftet der Rauch – ohne sie wird der Fisch fleckig, blass und nimmt den Rauch ungleichmäßig an.',
          },
          {
            type: 'p',
            text:
              'Für Fisch im Heißrauch reichen 1–2 Stunden an der Luft. Bei Lachsfilets für den Kaltrauch sind es eher 12–24 Stunden offen im Kühlschrank.',
          },
        ],
      },
    ],
    faq: [
      {
        q: 'Muss ich den Fisch nach dem Salzen abspülen?',
        a: 'Ja. Sonst bleibt Salz auf der Haut zurück, das Ergebnis wird zu salzig und es können sich weiße Ränder bilden.',
      },
      {
        q: 'Woran erkenne ich, dass der Fisch fertig ist?',
        a: 'An der Kerntemperatur: mindestens 62 °C im dicksten Teil. Der traditionelle Handgriff: Beim garen Fisch lässt sich die Rückenflosse leicht herausziehen.',
      },
    ],
    products: ['raeucherhaken-standard', 'raeucherlauge-forelle', 'raeuchermehl-erle'],
  },
  {
    slug: 'fleisch-raeuchern',
    title: 'Fleisch räuchern: Grundlagen und Verfahren',
    metaTitle: 'Fleisch räuchern – Pökeln, Kalträuchern und Verfahren im Überblick',
    metaDescription:
      'Fleisch räuchern: Warum Pökeln vorher nötig ist, wie Kalträuchern abläuft und worin sich Rohschinken, Saftschinken und Speck unterscheiden.',
    lead:
      'Bei Fleisch kommt vor dem Rauch immer ein Schritt, den Fisch nicht kennt: das Pökeln. Wer diesen Schritt versteht, versteht das ganze Verfahren.',
    sections: [
      {
        title: 'Warum Fleisch gepökelt wird',
        blocks: [
          {
            type: 'p',
            text:
              'Fisch wird gesalzen und relativ kurz danach geräuchert und meist auch gegart. Fleisch hängt beim Rohschinken dagegen über Wochen. Das Pökeln macht das Fleisch in dieser Zeit stabil: Es entzieht Wasser, senkt die Wasseraktivität, stabilisiert die Farbe und wirkt gegen unerwünschte Mikroorganismen.',
          },
          {
            type: 'note',
            tone: 'warn',
            text:
              'Dosierung und Pökeldauer richten sich ausschließlich nach der Angabe des Herstellers auf Ihrer Pökelmischung. Mischungen unterscheiden sich im Salz- und Nitritgehalt – deshalb finden Sie hier bewusst keine allgemeine Grammzahl.',
          },
        ],
      },
      {
        title: 'Die Phasen beim Rohschinken',
        blocks: [
          {
            type: 'steps',
            items: [
              { title: 'Pökeln', text: 'Mischung nach Packungsangabe einbringen, im Kühlbereich pökeln. Dickere Stücke brauchen länger.' },
              { title: 'Durchbrennen', text: 'Nach dem Pökeln abspülen und ruhen lassen, damit sich das Salz gleichmäßig verteilt. Faustregel: etwa ein Drittel bis die Hälfte der Pökelzeit.' },
              { title: 'Trocknen', text: 'An der Luft, bis die Oberfläche griffig-trocken ist. Feuchte Oberflächen nehmen Rauch fleckig an.' },
              { title: 'Kalträuchern', text: 'Unter 25 °C, in mehreren Durchgängen mit Ruhephasen dazwischen.' },
              { title: 'Reifen', text: 'Kühl nachreifen lassen, bis die gewünschte Festigkeit erreicht ist.' },
            ],
          },
        ],
      },
      {
        title: 'Rohschinken, Saftschinken, Speck – der Unterschied',
        blocks: [
          {
            type: 'table',
            caption: 'Verfahren im Vergleich',
            head: ['Art', 'Verfahren', 'Zeitaufwand', 'Anspruch'],
            rows: [
              ['Rohschinken', 'Pökeln, kalträuchern, reifen', 'Wochen bis Monate', 'Hoch – Klima muss stimmen'],
              ['Saft-/Kochschinken', 'Pökeln, garen', 'Tage', 'Gering – kein Reifeort nötig'],
              ['Bauchspeck', 'Pökeln, kalträuchern', 'Wochen', 'Mittel – verzeiht viel'],
              ['Lufttrockner (Parma-/Serrano-Art)', 'Pökeln, lufttrocknen, kein Rauch', 'Monate', 'Sehr hoch'],
            ],
          },
        ],
      },
      {
        title: 'Womit anfangen?',
        blocks: [
          {
            type: 'p',
            text:
              'Mit Lachsschinken. Kleines Stück, überschaubare Pökelzeit, milder Geschmack, hohe Erfolgsquote. Danach Bauchspeck, weil das Fett Fehler verzeiht. Erst dann große Keulenstücke – und Lufttrocknung ohne Rauch erst, wenn ein geeigneter Reifeort tatsächlich vorhanden ist.',
          },
        ],
      },
    ],
    faq: [
      {
        q: 'Kann ich Fleisch ohne Pökelsalz räuchern?',
        a: 'Für kurz gegarte Stücke, die anschließend gekühlt und schnell verbraucht werden, ist das möglich. Für Rohschinken mit wochenlanger Reifung ist Pökeln der etablierte und sicherheitsrelevante Weg – dort sollte man nicht improvisieren.',
      },
      {
        q: 'Wie lange muss mein Schinken pökeln?',
        a: 'Das hängt von Dicke des Stücks und von Ihrer Mischung ab. Verbindlich ist die Zeitangabe des Herstellers auf der Verpackung.',
      },
    ],
    products: ['lachsschinken-mischung', 'fleischerhaken-s-form-5mm', 'raeuchermehl-buche'],
  },
];

export function getArticle(slug) {
  return articles.find((a) => a.slug === slug) || null;
}
