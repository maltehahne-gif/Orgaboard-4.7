/* Räucherhaken24 – KI-Räucherberater.
   Beantwortet Fragen ausschließlich aus den gepflegten Produkt- und Wissensdaten
   (window.RH24). Es werden keine Produkte, Preise oder technischen Daten erfunden:
   Was nicht hinterlegt ist, wird als "nicht hinterlegt" benannt. */
(function () {
  'use strict';

  var DATA = window.RH24 || {};
  var ADVICE = DATA.advice || {};
  var PRODUCTS = DATA.products || [];
  var HISTORY_KEY = 'rh24.chat.v1';
  var MAX_HISTORY = 40;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  }
  function has(text) {
    for (var i = 1; i < arguments.length; i++) {
      if (text.indexOf(norm(arguments[i])) !== -1) return true;
    }
    return false;
  }
  function product(slug) {
    for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].slug === slug) return PRODUCTS[i];
    return null;
  }

  /* --------------------------- Erkennungshilfen --------------------------- */

  var FISH_ALIASES = {
    forelle: ['forelle', 'forellen', 'bachforelle', 'regenbogenforelle'],
    lachs: ['lachs', 'lachsseite', 'stremellachs', 'graved'],
    aal: ['aal', 'aale', 'raeucheraal'],
    makrele: ['makrele', 'makrelen'],
    saibling: ['saibling', 'saiblinge'],
    hering: ['hering', 'heringe', 'bueckling'],
    zander: ['zander'],
    karpfen: ['karpfen'],
    heilbutt: ['heilbutt'],
    dorsch: ['dorsch', 'kabeljau'],
  };

  function detectFish(text) {
    var list = ADVICE.fish || [];
    for (var slug in FISH_ALIASES) {
      if (!Object.prototype.hasOwnProperty.call(FISH_ALIASES, slug)) continue;
      for (var i = 0; i < FISH_ALIASES[slug].length; i++) {
        if (text.indexOf(FISH_ALIASES[slug][i]) !== -1) {
          for (var j = 0; j < list.length; j++) if (list[j].slug === slug) return list[j];
        }
      }
    }
    return null;
  }

  function detectHam(text) {
    var list = ADVICE.hams || [];
    for (var i = 0; i < list.length; i++) {
      if (text.indexOf(norm(list[i].name)) !== -1 || text.indexOf(norm(list[i].slug.replace(/-/g, ' '))) !== -1) return list[i];
    }
    if (has(text, 'lachsschinken')) return list.filter(function (h) { return h.slug === 'lachsschinken'; })[0] || null;
    if (has(text, 'schwarzwaelder', 'schwarzwald')) return list.filter(function (h) { return h.slug === 'schwarzwaelder-art'; })[0] || null;
    if (has(text, 'parma')) return list.filter(function (h) { return h.slug === 'parma-art'; })[0] || null;
    if (has(text, 'serrano')) return list.filter(function (h) { return h.slug === 'serrano-art'; })[0] || null;
    if (has(text, 'speck', 'bauch')) return list.filter(function (h) { return h.slug === 'bauchspeck'; })[0] || null;
    return null;
  }

  function detectWeightKg(text) {
    var m = text.match(/(\d+[.,]?\d*)\s*(kg|kilo)/);
    if (m) return parseFloat(m[1].replace(',', '.'));
    var g = text.match(/(\d{3,4})\s*(g|gramm)/);
    if (g) return parseFloat(g[1]) / 1000;
    return null;
  }

  /* ------------------------------ Antworten ------------------------------- */

  function answerMaterial() {
    var m = ADVICE.materials || {};
    return {
      html: '<p><strong>V2A oder V4A?</strong> Der Unterschied zeigt sich beim Salz.</p>' +
        '<ul><li><strong>V2A (1.4301):</strong> ' + esc(m.v2a || '') + '</li>' +
        '<li><strong>V4A (1.4571/1.4404):</strong> ' + esc(m.v4a || '') + '</li></ul>' +
        '<p>Kurz gesagt: Süßwasser und gepflegte Haken → V2A reicht. Kräftige Lake, Aal, Küste oder täglicher Einsatz → V4A.</p>',
      speech: 'V2A ist der klassische rostfreie Edelstahl und reicht für Süßwasser und normale Pflege. V4A enthält zusätzlich Molybdän und ist deutlich beständiger gegen Salz. Wer viel mit kräftiger Lake arbeitet, nimmt V4A.',
      links: [{ label: 'Ausführlicher Vergleich', href: '/raeucherwissen/va-v2a-v4a/' }],
      products: ['raeucherhaken-standard', 'raeucherhaken-doppeldorn'],
    };
  }

  function answerHook(text) {
    var fish = detectFish(text);
    var kg = detectWeightKg(text);

    if (fish && fish.slug === 'aal') {
      return {
        html: '<p>Für <strong>Aal</strong> brauchen Sie den <strong>Räucherhaken Standard Aal</strong>. Ein normaler Haken reißt aus, weil das ganze Gewicht an einem Punkt zieht und die Haut extrem glatt ist.</p>' +
          '<p>Wichtig davor: Aal gründlich entschleimen – sonst rutscht er von jedem Haken.</p>',
        speech: 'Für Aal brauchen Sie den Aalhaken. Wichtig ist außerdem, den Aal vorher gründlich zu entschleimen, sonst rutscht er von jedem Haken.',
        products: ['raeucherhaken-standard-aal'],
        links: [{ label: 'Aal räuchern', href: '/raeucherfisch/aal/' }],
      };
    }
    if (has(text, 'filet', 'seite', 'stremel')) {
      return {
        html: '<p>Für <strong>Filets und Seiten</strong> ist der <strong>Räucherhaken Filet</strong> gedacht – Filets haben keinen tragenden Knochenpunkt.</p>' +
          '<p>Setzen Sie ihn im festen Nackenteil an und hängen Sie erst auf, wenn sich eine Pellicle gebildet hat.</p>',
        speech: 'Für Filets und ganze Seiten nehmen Sie den Filethaken. Setzen Sie ihn im festen Nackenteil an, nicht im dünnen Bauchlappen.',
        products: ['raeucherhaken-filet'],
        links: [{ label: 'Lachs räuchern', href: '/raeucherfisch/lachs/' }],
      };
    }
    if (has(text, 'schinken', 'fleisch', 'wurst', 'speck')) {
      return {
        html: '<p>Für <strong>Fleisch und Schinken</strong> ist der <strong>Fleischerhaken S-Form 5 mm</strong> die richtige Aufhängung.</p>' +
          '<p>Bei sehr schweren Stücken lieber zwei Haken setzen als einen überlasten.</p>',
        speech: 'Für Fleisch und Schinken nehmen Sie den Fleischerhaken in S-Form. Bei sehr schweren Stücken lieber zwei Haken setzen.',
        products: ['fleischerhaken-s-form-5mm'],
        links: [{ label: 'Schinken selber machen', href: '/schinken-selber-machen/' }],
      };
    }
    if (has(text, 'dorsch', 'kabeljau', 'weich')) {
      return {
        html: '<p>Bei <strong>weichem, blättrigem Fisch</strong> verteilt der <strong>Krallenhaken</strong> die Last auf mehrere Spitzen. Ein Einzeldorn reißt hier aus.</p>',
        speech: 'Bei weichem Fisch wie Dorsch nehmen Sie den Krallenhaken. Ein Einzeldorn reißt im weichen Fleisch aus.',
        products: ['raeucherhaken-kralle', 'raeucherhaken-filet'],
        links: [{ label: 'Dorsch räuchern', href: '/raeucherfisch/dorsch/' }],
      };
    }

    if (kg !== null) {
      var pick, why;
      if (kg > 2.5) {
        pick = 'raeucherhaken-3-dorn';
        why = 'Über 2,5 kg gehört das Gewicht auf mehrere Punkte verteilt – der 3-Dorn ist die stabilste Aufhängung.';
      } else if (kg >= 1) {
        pick = 'raeucherhaken-doppeldorn';
        why = 'Ab etwa einem Kilogramm zieht sich der Fisch am Einzeldorn spürbar durch. Zwei Dornen halbieren den Druck pro Einstich.';
      } else {
        pick = 'raeucherhaken-standard';
        why = 'Bis etwa einem Kilogramm reicht der Standardhaken mit einem Dorn durch das feste Kopffleisch.';
      }
      var kgText = String(kg).replace('.', ',');
      return {
        html: '<p>Bei etwa <strong>' + esc(kgText) + ' kg</strong>' + (fish ? ' ' + esc(fish.name) : '') +
          ': ' + esc(why) + '</p><p class="small">Eine feste Grenze in Kilogramm gibt es nicht – sie hängt von Fischart, Gewebefestigkeit und Räuchertemperatur ab. Sobald sich der Einstich beim Aufhängen durchzieht, ist der nächstgrößere Haken dran.</p>',
        speech: 'Bei etwa ' + kgText + ' Kilogramm: ' + why,
        products: [pick],
        links: [{ label: 'Haken-Berater', href: '/berater/haken/' }],
      };
    }

    return {
      html: '<p>Für Fisch in Portionsgröße ist der <strong>Räucherhaken Standard</strong> die richtige Wahl. Ab etwa 1 kg wird der <strong>Doppeldorn</strong> sinnvoll, über 2,5 kg der <strong>3-Dorn</strong>.</p>' +
        '<p>Verraten Sie mir Fischart und ungefähres Gewicht, dann werde ich genauer.</p>',
      speech: 'Für Fisch in Portionsgröße nehmen Sie den Standardhaken. Ab etwa einem Kilogramm den Doppeldorn, über zweieinhalb Kilogramm den Drei-Dorn. Nennen Sie mir Fischart und Gewicht, dann werde ich genauer.',
      products: ['raeucherhaken-standard', 'raeucherhaken-doppeldorn'],
      links: [{ label: 'Haken-Berater starten', href: '/berater/haken/' }],
    };
  }

  function answerWood(text) {
    var fish = detectFish(text);
    var woods = ADVICE.woods || [];

    function woodBySlug(s) {
      for (var i = 0; i < woods.length; i++) if (woods[i].slug === s) return woods[i];
      return null;
    }

    if (has(text, 'kaese', 'kase')) {
      return {
        html: '<p>Für <strong>Käse</strong>: Kirsche oder Buche in <strong>Körnung 1</strong> – und ausschließlich im Kaltrauch unter 25 °C.</p>' +
          '<p>Zwei bis vier Stunden Rauch reichen meist. Danach ein bis zwei Tage im Kühlschrank ruhen lassen.</p>',
        speech: 'Für Käse nehmen Sie Kirsche oder Buche in Körnung 1 und räuchern ausschließlich kalt, unter 25 Grad. Zwei bis vier Stunden reichen meist.',
        products: ['raeuchermehl-kirsche', 'raeuchermehl-buche'],
        links: [{ label: 'Räucherzeiten', href: '/raeucherwissen/raeucherzeiten/' }],
      };
    }
    if (has(text, 'schinken', 'poekel', 'speck')) {
      return {
        html: '<p>Für <strong>Schinken und Speck</strong> ist <strong>Buche</strong> die Basis, ein Anteil <strong>Eiche</strong> gibt Kraft und Farbe. Im Kaltrauch Körnung 1.</p>',
        speech: 'Für Schinken und Speck nehmen Sie Buche als Basis, mit einem Anteil Eiche für mehr Kraft und Farbe. Im Kaltrauch Körnung 1.',
        products: ['raeuchermehl-buche', 'raeuchermehl-eiche'],
        links: [{ label: 'Schinken selber machen', href: '/schinken-selber-machen/' }],
      };
    }
    if (fish) {
      var recSlug = fish.wood ? fish.wood.replace('raeuchermehl-', '') : 'buche';
      var w = woodBySlug(recSlug) || woodBySlug('buche');
      return {
        html: '<p>Für <strong>' + esc(fish.name) + '</strong> empfehlen wir <strong>' + esc(w.name) + '</strong>: ' + esc(w.aroma) + '</p>' +
          '<p>' + esc(fish.woodNote || '') + '</p>' +
          '<p class="small">Körnung: 1 für Räucherschnecke und Kaltrauch, 2–3 für den Heißrauch im Ofen.</p>',
        speech: 'Für ' + fish.name + ' empfehlen wir ' + w.name + '. ' + w.aroma + ' Körnung 1 für die Räucherschnecke, Körnung 2 bis 3 für den Heißrauch.',
        products: [fish.wood || 'raeuchermehl-buche'],
        links: [{ label: fish.name + ' räuchern', href: fish.url }, { label: 'Räuchermehl-Berater', href: '/berater/raeuchermehl/' }],
      };
    }
    return {
      html: '<p>Kurz zusammengefasst:</p><ul>' +
        woods.map(function (w) { return '<li><strong>' + esc(w.name) + ':</strong> ' + esc(w.teaser) + '</li>'; }).join('') +
        '</ul><p>Sagen Sie mir, was Sie räuchern möchten – dann nenne ich Holzart und Körnung.</p>',
      speech: 'Buche ist der Allrounder, Erle das milde Fischholz, Birke würzig, Eiche kräftig für Schinken und Kirsche fruchtig und mild. Sagen Sie mir, was Sie räuchern möchten.',
      products: ['raeuchermehl-buche', 'raeuchermehl-erle'],
      links: [{ label: 'Räuchermehl-Berater', href: '/berater/raeuchermehl/' }],
    };
  }

  function answerGrain(text) {
    var grains = ADVICE.grains || [];
    if (has(text, 'schnecke', 'sparbrand', 'generator')) {
      return {
        html: '<p>Für die <strong>Räucherschnecke</strong> ist <strong>Körnung 1</strong> die richtige Wahl – sie glimmt gleichmäßig und lange durch. Körnung 2 funktioniert ebenfalls zuverlässig.</p>' +
          '<p>Körnung 4 ist dafür nicht gedacht: Die groben Späne fallen durch das Gitter und die Schnecke verlischt.</p>',
        speech: 'Für die Räucherschnecke nehmen Sie Körnung 1, sie glimmt gleichmäßig und lange durch. Körnung 2 geht auch. Körnung 4 fällt durch und verlischt.',
        products: ['raeuchermehl-buche', 'raeuchermehl-erle'],
        links: [{ label: 'Räuchermehl verstehen', href: '/raeuchermehl/' }],
      };
    }
    return {
      html: '<p>Die vier Körnungen:</p><ul>' +
        grains.map(function (g) { return '<li><strong>' + esc(g.label) + ':</strong> ' + esc(g.text) + '</li>'; }).join('') +
        '</ul><p class="small">Die genauen Siebweiten in Millimetern sind bei uns noch nicht hinterlegt – wir geben hier bewusst keine geschätzten Werte an.</p>',
      speech: 'Körnung 1 ist fein und ideal für Räucherschnecke und Kaltrauch. Körnung 2 ist der Allrounder. Körnung 3 gibt mehr Rauch im Heißrauch. Körnung 4 ist sehr grob und nichts für die Schnecke.',
      products: [],
      links: [{ label: 'Räuchermehl verstehen', href: '/raeuchermehl/' }],
    };
  }

  function answerFish(fish) {
    return {
      html: '<p><strong>' + esc(fish.name) + '</strong> – ' + esc(fish.method) + ' (' + esc(fish.level) + ')</p>' +
        '<ul>' +
        '<li><strong>Lake:</strong> ' + esc(fish.brine) + '</li>' +
        '<li><strong>Salzzeit:</strong> ' + esc(fish.saltTime) + '</li>' +
        '<li><strong>Temperatur:</strong> ' + esc(fish.temperature) + '</li>' +
        '<li><strong>Dauer:</strong> ' + esc(fish.duration) + '</li>' +
        '<li><strong>Kerntemperatur:</strong> ' + esc(fish.coreTemp) + '</li>' +
        '</ul>',
      speech: fish.name + ': ' + fish.method + '. Lake: ' + fish.brine + ' Salzzeit: ' + fish.saltTime +
        ' Temperatur: ' + fish.temperature + ' Dauer: ' + fish.duration,
      products: [fish.hook, fish.wood].filter(Boolean),
      links: [{ label: 'Vollständige Anleitung', href: fish.url }],
    };
  }

  function answerHam(ham) {
    var mix = ham.mixture ? product(ham.mixture) : null;
    return {
      html: '<p><strong>' + esc(ham.name) + '</strong> (' + esc(ham.level) + ')</p>' +
        '<ul><li><strong>Fleischstück:</strong> ' + esc(ham.cut) + '</li>' +
        (mix ? '<li><strong>Pökelmischung:</strong> ' + esc(mix.name) + '</li>' : '') +
        '<li><strong>Ablauf:</strong> Pökeln, Durchbrennen, Trocknen, ' +
        (ham.smoked === false ? 'Lufttrocknen ohne Rauch' : 'Kalträuchern') + ', Reifen</li></ul>' +
        '<p class="small"><strong>Wichtig:</strong> Dosierung und Pökeldauer richten sich ausschließlich nach der Angabe auf der Packung Ihrer Pökelmischung. Ich nenne dafür bewusst keine Grammzahl.</p>',
      speech: ham.name + '. Fleischstück: ' + ham.cut + '. Der Ablauf ist Pökeln, Durchbrennen, Trocknen, ' +
        (ham.smoked === false ? 'Lufttrocknen ohne Rauch' : 'Kalträuchern') +
        ' und Reifen. Dosierung und Pökeldauer immer nach der Angabe auf der Packung.',
      products: ham.products || (mix ? [mix.slug] : []),
      links: [{ label: 'Anleitung ' + ham.name, href: ham.url }],
    };
  }

  function answerTemperature(text) {
    var fish = detectFish(text);
    if (fish) {
      return {
        html: '<p>Für <strong>' + esc(fish.name) + '</strong>: ' + esc(fish.temperature) + '</p>' +
          '<p><strong>Kerntemperatur:</strong> ' + esc(fish.coreTemp) + '</p>',
        speech: 'Für ' + fish.name + ': ' + fish.temperature + ' Kerntemperatur: ' + fish.coreTemp,
        products: [],
        links: [{ label: fish.name + ' räuchern', href: fish.url }],
      };
    }
    return {
      html: '<p>Die drei Verfahren:</p><ul>' +
        '<li><strong>Kalträuchern:</strong> unter 25 °C – gart nicht, konserviert.</li>' +
        '<li><strong>Warmräuchern:</strong> 25–50 °C.</li>' +
        '<li><strong>Heißräuchern:</strong> 50–85 °C – gart durch.</li></ul>' +
        '<p>Kerntemperatur bei heiß geräuchertem Fisch: mindestens 62 °C, 30 Minuten gehalten. Geflügel 72–74 °C.</p>',
      speech: 'Kalträuchern findet unter 25 Grad statt und gart nicht. Warmräuchern zwischen 25 und 50 Grad. Heißräuchern zwischen 50 und 85 Grad, dabei gart das Räuchergut durch. Fisch braucht eine Kerntemperatur von mindestens 62 Grad.',
      products: [],
      links: [{ label: 'Temperaturen verstehen', href: '/raeucherwissen/temperaturen/' }],
    };
  }

  function answerDuration(text) {
    var fish = detectFish(text);
    if (fish) {
      return {
        html: '<p><strong>' + esc(fish.name) + ':</strong> ' + esc(fish.duration) + '</p>' +
          '<p class="small">Zeiten sind Richtwerte. Verbindlich ist die Kerntemperatur: ' + esc(fish.coreTemp) + '</p>',
        speech: fish.name + ': ' + fish.duration + ' Verbindlich ist aber die Kerntemperatur, nicht die Uhr.',
        products: [],
        links: [{ label: fish.name + ' räuchern', href: fish.url }],
      };
    }
    return {
      html: '<p>Grobe Richtwerte beim Heißräuchern: Forelle 1,5–2,5 Stunden, Makrele 1,5–2 Stunden, Aal 2–3 Stunden.</p>' +
        '<p>Beim Kalträuchern arbeitet man in Durchgängen von 8–12 Stunden mit Ruhephasen dazwischen.</p>' +
        '<p class="small">Entscheidend ist beim Heißräuchern die Kerntemperatur, nicht die Uhr.</p>',
      speech: 'Beim Heißräuchern rechnet man grob mit anderthalb bis drei Stunden, je nach Fisch. Beim Kalträuchern arbeitet man in Durchgängen von 8 bis 12 Stunden mit Ruhephasen. Entscheidend ist aber die Kerntemperatur.',
      products: [],
      links: [{ label: 'Räucherzeiten', href: '/raeucherwissen/raeucherzeiten/' }],
    };
  }

  function answerPrice() {
    return {
      html: '<p>Preise kann ich Ihnen hier noch nicht nennen: In unserem Katalog sind derzeit keine Preise gepflegt, ' +
        'und ich nenne grundsätzlich keine geschätzten Beträge.</p>' +
        '<p>Sie können den Artikel auf die Anfrageliste setzen oder uns direkt fragen.</p>',
      speech: 'Preise sind derzeit nicht gepflegt, und ich nenne grundsätzlich keine geschätzten Beträge. Sie können den Artikel auf die Anfrageliste setzen oder uns direkt fragen.',
      products: [],
      links: [{ label: 'Kontakt aufnehmen', href: '/kontakt/' }],
    };
  }

  function answerSpecs() {
    return {
      html: '<p>Maße, Drahtstärken und Tragkräfte sind bei uns noch nicht als geprüfte Werte hinterlegt. ' +
        'Ich gebe dazu bewusst keine Schätzung ab – eine falsche Tragkraftangabe wäre gefährlich.</p>' +
        '<p>Fragen Sie diese Angabe bitte konkret zum Artikel an, dann bekommen Sie einen bestätigten Wert.</p>',
      speech: 'Maße und Tragkräfte sind noch nicht als geprüfte Werte hinterlegt. Ich schätze das bewusst nicht. Fragen Sie die Angabe bitte konkret zum Artikel an.',
      products: [],
      links: [{ label: 'Kontakt aufnehmen', href: '/kontakt/' }],
    };
  }

  function answerBeginner() {
    return {
      html: '<p>Fangen Sie mit <strong>Forelle</strong> an. Sie brauchen dafür:</p>' +
        '<ul><li>Räucherofen</li><li>Räucherhaken Standard – einen pro Fisch</li>' +
        '<li>Räuchermehl Buche oder Erle, Körnung 2–3</li><li>Salz oder eine fertige Räucherlauge</li>' +
        '<li>ein Kernthermometer</li></ul>' +
        '<p>Ablauf: ausnehmen, über Nacht salzen, 1–2 Stunden antrocknen, dann trocknen bei 40–50 °C, garen bei 80–90 °C, räuchern bei 60–70 °C.</p>',
      speech: 'Fangen Sie mit Forelle an. Sie brauchen einen Räucherofen, Standardhaken, Buchen- oder Erlenmehl, Salz oder eine Räucherlauge und ein Kernthermometer. Ablauf: ausnehmen, über Nacht salzen, antrocknen, dann trocknen, garen und räuchern.',
      products: ['raeucherhaken-standard', 'raeuchermehl-buche', 'raeucherlauge-forelle'],
      links: [{ label: 'Anfängerwissen', href: '/raeucherwissen/anfaengerwissen/' }],
    };
  }

  function searchProducts(text) {
    var hits = [];
    PRODUCTS.forEach(function (p) {
      var hay = norm(p.name + ' ' + p.short + ' ' + (p.tags || []).join(' '));
      var words = text.split(/\s+/).filter(function (w) { return w.length > 3; });
      var score = 0;
      words.forEach(function (w) { if (hay.indexOf(w) !== -1) score++; });
      if (score > 0) hits.push({ slug: p.slug, score: score });
    });
    hits.sort(function (a, b) { return b.score - a.score; });
    return hits.slice(0, 3).map(function (h) { return h.slug; });
  }

  function fallback(text) {
    var found = searchProducts(text);
    if (found.length) {
      return {
        html: '<p>Sicher bin ich mir nicht – aber diese Artikel passen möglicherweise zu Ihrer Frage:</p>',
        speech: 'Sicher bin ich mir nicht. Vielleicht passen diese Artikel zu Ihrer Frage.',
        products: found,
        links: [{ label: 'Beratung', href: '/berater/' }, { label: 'Kontakt', href: '/kontakt/' }],
      };
    }
    return {
      html: '<p>Das kann ich aus unseren Daten nicht sicher beantworten – und ich rate hier bewusst nicht.</p>' +
        '<p>Womit ich helfen kann: Hakenauswahl, Räuchermehl und Körnung, V2A/V4A, Temperaturen, Räucherzeiten, ' +
        'Anleitungen zu zehn Fischarten und acht Schinkenarten.</p>',
      speech: 'Das kann ich aus unseren Daten nicht sicher beantworten, und ich rate hier bewusst nicht. Ich helfe bei Hakenauswahl, Räuchermehl, Materialien, Temperaturen, Räucherzeiten und Anleitungen.',
      products: [],
      links: [{ label: 'Alle Beratungen', href: '/berater/' }, { label: 'Kontakt', href: '/kontakt/' }],
    };
  }

  /** Zentrale Absichtserkennung. */
  function respond(rawInput) {
    var text = norm(rawInput);
    if (!text.trim()) return fallback(text);

    if (has(text, 'preis', 'kostet', 'kosten', 'euro', 'guenstig')) return answerPrice();
    if (has(text, 'tragkraft', 'belastbar', 'wie lang ist', 'laenge', 'durchmesser', 'staerke in mm', 'masse'))
      return answerSpecs();
    if (has(text, 'v2a', 'v4a', 'edelstahl', 'material', 'rost', '1.4301', '1.4571')) return answerMaterial();
    if (has(text, 'koernung', 'schnecke', 'sparbrand', 'generator')) return answerGrain(text);
    if (has(text, 'haken', 'aufhaeng', 'dorn', 'kralle')) return answerHook(text);
    if (has(text, 'mehl', 'holz', 'buche', 'erle', 'birke', 'eiche', 'kirsche', 'spaene')) return answerWood(text);
    if (has(text, 'anfaenger', 'anfangen', 'erste mal', 'einsteiger', 'neu im')) return answerBeginner();

    var ham = detectHam(text);
    if (ham && has(text, 'schinken', 'poekel', 'speck', 'machen', 'herstellen', 'brauche')) return answerHam(ham);

    if (has(text, 'temperatur', 'grad', 'kalt raeuchern', 'kaltraeuchern', 'heiss', 'kerntemperatur'))
      return answerTemperature(text);
    if (has(text, 'wie lange', 'dauer', 'zeit', 'stunden')) return answerDuration(text);

    var fish = detectFish(text);
    if (fish) return answerFish(fish);
    if (ham) return answerHam(ham);

    return fallback(text);
  }

  /* ------------------------------- Oberfläche ----------------------------- */

  var panel, scroll, form, input, micBtn, ttsBtn, launcher;
  var speakEnabled = false;
  var recognition = null;

  function productCard(slug) {
    var p = product(slug);
    if (!p) return '';
    return '<a class="ai-product" href="' + esc(p.url) + '">' +
      '<span class="pt"><img src="' + esc(p.img) + '" alt="" loading="lazy" /></span>' +
      '<span><strong>' + esc(p.name) + '</strong><small>' + esc(p.short) + '</small></span></a>';
  }

  function appendMessage(role, html, meta) {
    var el = document.createElement('div');
    el.className = 'ai-msg ' + role;
    var body = html;
    if (meta && meta.products && meta.products.length) {
      var cards = meta.products.map(productCard).filter(Boolean).join('');
      if (cards) body += '<div class="ai-products">' + cards + '</div>';
    }
    if (meta && meta.links && meta.links.length) {
      body += '<div class="ai-links">' + meta.links.map(function (l) {
        return '<a href="' + esc(l.href) + '">' + esc(l.label) + '</a>';
      }).join('') + '</div>';
    }
    el.innerHTML = body;
    scroll.appendChild(el);
    scroll.scrollTop = scroll.scrollHeight;
  }

  function saveHistory(entry) {
    var h = [];
    try { h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { h = []; }
    h.push(entry);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-MAX_HISTORY))); } catch (e) { /* ignorieren */ }
  }

  function loadHistory() {
    var h = [];
    try { h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { h = []; }
    if (!h.length) {
      appendMessage('bot',
        '<p>Guten Tag! Ich bin der Räucherberater. Fragen Sie mich nach Haken, Räuchermehl, Körnung, ' +
        'Temperaturen, Räucherzeiten oder einer Anleitung.</p>' +
        '<p class="small">Ich antworte nur aus unserem Sortiment und unseren Wissensseiten – erfundene Produkte oder Preise bekommen Sie von mir nicht.</p>');
      return;
    }
    h.forEach(function (m) { appendMessage(m.role, m.html, m.meta); });
  }

  function speak(text) {
    if (!speakEnabled || !('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'de-DE';
      u.rate = 1;
      window.speechSynthesis.speak(u);
    } catch (e) { /* Sprachausgabe nicht verfügbar */ }
  }

  function ask(question) {
    var userHtml = '<p>' + esc(question) + '</p>';
    appendMessage('user', userHtml);
    saveHistory({ role: 'user', html: userHtml });

    var answer = respond(question);
    var meta = { products: answer.products, links: answer.links };
    appendMessage('bot', answer.html, meta);
    saveHistory({ role: 'bot', html: answer.html, meta: meta });
    speak(answer.speech);
  }

  var QUICK = [
    'Welchen Haken brauche ich für eine 2,5 kg Forelle?',
    'Welches Räuchermehl nehme ich für Aal?',
    'Wie räuchere ich Makrelen?',
    'Was ist der Unterschied zwischen V2A und V4A?',
    'Welche Körnung brauche ich für meine Räucherschnecke?',
    'Ich möchte Lachsschinken machen. Was brauche ich?',
  ];

  function initSpeechInput() {
    var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) {
      micBtn.setAttribute('disabled', '');
      micBtn.title = 'Spracheingabe wird von diesem Browser nicht unterstützt';
      return;
    }
    recognition = new Rec();
    recognition.lang = 'de-DE';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.addEventListener('result', function (ev) {
      var said = ev.results[0][0].transcript;
      input.value = said;
      ask(said);
      input.value = '';
    });
    recognition.addEventListener('end', function () { micBtn.classList.remove('is-recording'); });
    recognition.addEventListener('error', function () {
      micBtn.classList.remove('is-recording');
      appendMessage('bot', '<p>Die Spracheingabe hat nicht funktioniert. Bitte prüfen Sie die Mikrofonfreigabe – oder tippen Sie Ihre Frage.</p>');
    });

    micBtn.addEventListener('click', function () {
      if (micBtn.classList.contains('is-recording')) {
        recognition.stop();
        return;
      }
      try {
        recognition.start();
        micBtn.classList.add('is-recording');
      } catch (e) { /* bereits gestartet */ }
    });
  }

  function open() {
    panel.removeAttribute('hidden');
    panel.classList.add('is-open');
    launcher.setAttribute('aria-expanded', 'true');
    input.focus();
    scroll.scrollTop = scroll.scrollHeight;
  }
  function close() {
    panel.classList.remove('is-open');
    panel.setAttribute('hidden', '');
    launcher.setAttribute('aria-expanded', 'false');
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  function init() {
    panel = document.getElementById('ai-panel');
    launcher = document.getElementById('ai-launcher');
    if (!panel || !launcher) return;
    scroll = document.getElementById('ai-scroll');
    form = document.getElementById('ai-form');
    input = document.getElementById('ai-input');
    micBtn = document.getElementById('ai-mic');
    ttsBtn = document.getElementById('ai-tts');

    var quick = document.getElementById('ai-quick');
    quick.innerHTML = QUICK.map(function (q) {
      return '<button type="button">' + esc(q) + '</button>';
    }).join('');
    $$('button', quick).forEach(function (b) {
      b.addEventListener('click', function () { ask(b.textContent); });
    });

    loadHistory();

    launcher.addEventListener('click', function () {
      if (panel.classList.contains('is-open')) close(); else open();
    });
    document.getElementById('ai-close').addEventListener('click', close);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && panel.classList.contains('is-open')) close();
    });
    $$('[data-open-ai]').forEach(function (b) { b.addEventListener('click', open); });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var value = input.value.trim();
      if (!value) return;
      ask(value);
      input.value = '';
    });

    ttsBtn.addEventListener('click', function () {
      speakEnabled = !speakEnabled;
      ttsBtn.classList.toggle('is-on', speakEnabled);
      ttsBtn.setAttribute('aria-pressed', String(speakEnabled));
      if (!speakEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
    });
    if (!('speechSynthesis' in window)) {
      ttsBtn.setAttribute('disabled', '');
      ttsBtn.title = 'Sprachausgabe wird von diesem Browser nicht unterstützt';
    }

    initSpeechInput();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.RH24Berater = { respond: respond };
})();
