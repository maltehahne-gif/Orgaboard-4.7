import { esc, icon, truncate } from '../util.mjs';
import { productGrid, categoryNav, shareBar, faqBlock, faqSchema, relatedProducts } from '../components.mjs';
import { fishes } from '../../data/fish.mjs';
import { hams } from '../../data/hams.mjs';
import { woods } from '../../data/woods.mjs';
import { grains, getProduct } from '../../data/catalog.mjs';
import { site } from '../../data/site.mjs';

function fact(label, value) {
  if (!value) return '';
  return `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
}

function levelBadge(level) {
  const cls = level === 'Einsteiger' ? 'badge-ok' : level === 'Profi' ? 'badge-todo' : 'badge-info';
  return `<span class="badge ${cls}">${esc(level)}</span>`;
}

/* ============================== RÄUCHERFISCH ============================== */

export function fishHubPage() {
  const body = `<div class="page"><div class="wrap">
  <div class="page-head">
    <span class="eyebrow">Räucherfisch-Guide</span>
    <h1>Der beste Räucherfisch</h1>
    <p class="lead">Jede Fischart bringt eigene Anforderungen mit: Fettgehalt, Gewicht, Festigkeit des Fleisches
      und Haltbarkeit am Haken. Hier finden Sie zu jeder Art die vollständige Anleitung – von der Vorbereitung
      bis zur Kerntemperatur.</p>
  </div>
  <div class="topic-grid">
    ${fishes
      .map(
        (f) => `<a class="topic-card" href="/raeucherfisch/${f.slug}/">
      <span class="topic-icon">${icon('fish', 24)}</span>
      <h3>${esc(f.name)} ${levelBadge(f.level)}</h3>
      <p>${esc(f.teaser)}</p>
      <span class="go">${esc(f.method)} ${icon('arrow', 15)}</span>
    </a>`
      )
      .join('\n')}
  </div>
  <div class="note" style="margin-top:30px"><p><strong>Noch nie geräuchert?</strong>
    Fangen Sie mit der <a href="/raeucherfisch/forelle/">Forelle</a> an und lesen Sie vorher das
    <a href="/raeucherwissen/anfaengerwissen/">Anfängerwissen</a>. Danach ist der Rest deutlich einfacher.</p></div>
</div></div>`;

  return {
    path: '/raeucherfisch/',
    activeNav: '/raeucherfisch/',
    title: 'Räucherfisch-Guide',
    metaTitle: `Räucherfisch – welcher Fisch, welcher Haken, welches Holz | ${site.name}`,
    metaDescription:
      'Räucherfisch-Guide zu Forelle, Lachs, Aal, Makrele, Saibling, Hering, Zander, Karpfen, Heilbutt und Dorsch: Vorbereitung, Lake, Temperatur, Räucherzeit und Kerntemperatur.',
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/raeucherfisch/', label: 'Räucherfisch' },
    ],
    body,
  };
}

export function fishPage(f) {
  const hook = getProduct(f.hook);
  const wood = getProduct(f.wood);
  const url = `${site.baseUrl}/raeucherfisch/${f.slug}/`;
  const others = fishes.filter((x) => x.slug !== f.slug).slice(0, 4);

  const body = `<div class="page"><div class="wrap">
  <div class="page-head">
    <span class="eyebrow">Räucherfisch-Guide</span>
    <h1>${esc(f.name)} räuchern</h1>
    <p class="lead">${esc(f.lead)}</p>
    <p style="margin-top:12px">${levelBadge(f.level)} <span class="badge badge-info">${esc(f.method)}</span></p>
  </div>

  <div class="article">
    <section>
      <h2 id="vorbereitung">Vorbereitung</h2>
      <ol class="list-num">${f.preparation.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>
    </section>

    <div class="factbox">
      <h3>${esc(f.name)} auf einen Blick</h3>
      <dl class="factlist">
        ${fact('Lake', f.brine)}
        ${fact('Salzzeit', f.saltTime)}
        ${fact('Trocknung', f.drying)}
        ${fact('Räucherhaken', hook ? `${hook.name}${f.hookNote ? ' – ' + f.hookNote : ''}` : null)}
        ${fact('Räuchermehl', wood ? `${wood.name}${f.woodNote ? ' – ' + f.woodNote : ''}` : null)}
        ${fact('Temperatur', f.temperature)}
        ${fact('Räucherdauer', f.duration)}
        ${fact('Kerntemperatur', f.coreTemp)}
      </dl>
    </div>

    <section>
      <h2 id="fehler">Typische Fehler</h2>
      <div class="note warn"><ul style="margin:0;padding-left:18px">
        ${f.mistakes.map((m) => `<li>${esc(m)}</li>`).join('')}
      </ul></div>
    </section>

    <section>
      <h2 id="tipps">Profi-Tipps</h2>
      <ul class="list-check">${f.proTips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </section>

    ${shareBar(url, `${f.name} räuchern`)}
  </div>

  ${relatedProducts(f.products, `Das brauchen Sie für ${f.name}`)}

  <div class="content-block">
    <h2>Weitere Fischarten</h2>
    <div class="topic-grid">
      ${others
        .map(
          (o) => `<a class="topic-card" href="/raeucherfisch/${o.slug}/">
        <span class="topic-icon">${icon('fish', 22)}</span>
        <h3>${esc(o.name)}</h3><p>${esc(o.teaser)}</p>
        <span class="go">Anleitung ansehen ${icon('arrow', 15)}</span>
      </a>`
        )
        .join('')}
    </div>
  </div>
</div></div>`;

  const recipe = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: `${f.name} räuchern`,
    description: truncate(f.lead, 250),
    recipeCategory: 'Räuchern',
    keywords: `${f.name}, räuchern, ${f.method}`,
    image: `${site.baseUrl}/assets/img/og-default.svg`,
    recipeIngredient: [
      f.name,
      f.brine,
      wood ? wood.name : 'Räuchermehl',
    ],
    recipeInstructions: [
      ...f.preparation.map((p, i) => ({ '@type': 'HowToStep', position: i + 1, text: p })),
      { '@type': 'HowToStep', position: f.preparation.length + 1, text: `Salzen: ${f.saltTime}` },
      { '@type': 'HowToStep', position: f.preparation.length + 2, text: `Trocknen: ${f.drying}` },
      { '@type': 'HowToStep', position: f.preparation.length + 3, text: `Räuchern: ${f.temperature} – ${f.duration}` },
    ],
  };

  return {
    path: `/raeucherfisch/${f.slug}/`,
    activeNav: '/raeucherfisch/',
    title: `${f.name} räuchern`,
    metaTitle: `${f.name} räuchern – Anleitung, Temperatur & Zeit | ${site.name}`,
    metaDescription: `${f.name} räuchern: ${f.teaser} Mit Lake, Salzzeit, Trocknung, passendem Haken, Räuchermehl, Temperatur und Kerntemperatur.`,
    ogType: 'article',
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/raeucherfisch/', label: 'Räucherfisch' },
      { href: `/raeucherfisch/${f.slug}/`, label: f.name },
    ],
    body,
    schemas: [recipe],
  };
}

/* ================================ SCHINKEN ================================ */

export function hamHubPage() {
  const body = `<div class="page"><div class="wrap">
  <div class="page-head">
    <span class="eyebrow">Räucherwissen</span>
    <h1>Schinken selber machen</h1>
    <p class="lead">Vom milden Lachsschinken bis zum monatelang luftgetrockneten Rohschinken: Jede Sorte hat
      ihr eigenes Fleischstück, ihr eigenes Verfahren und ihren eigenen Anspruch. Hier finden Sie zu jeder
      Variante den vollständigen Ablauf – und die Sicherheitshinweise, die dazugehören.</p>
  </div>

  <div class="note warn">
    <p><strong>Zur Dosierung:</strong> Auf diesen Seiten stehen bewusst keine Grammangaben für Pökelsalz.
    Pökelmischungen unterscheiden sich im Salz- und Nitritgehalt – verbindlich ist ausschließlich die
    Dosier- und Zeitangabe des Herstellers auf Ihrer Packung.</p>
  </div>

  <div class="topic-grid" style="margin-top:26px">
    ${hams
      .map(
        (h) => `<a class="topic-card" href="/schinken-selber-machen/${h.slug}/">
      <span class="topic-icon">${icon('meat', 24)}</span>
      <h3>${esc(h.name)} ${levelBadge(h.level)}</h3>
      <p>${esc(h.teaser)}</p>
      <span class="go">${h.smoked === true ? 'Geräuchert' : h.smoked === false ? 'Ohne Rauch' : 'Rauch optional'} ${icon('arrow', 15)}</span>
    </a>`
      )
      .join('\n')}
  </div>

  <div class="content-block">
    <h2>Womit anfangen?</h2>
    <div class="steps">
      <div class="step"><span class="step-num"></span><div><h3>Lachsschinken</h3>
        <p>Kleines Stück, kurze Pökelzeit, milder Geschmack. Die höchste Erfolgsquote von allen.</p></div></div>
      <div class="step"><span class="step-num"></span><div><h3>Bauchspeck</h3>
        <p>Der hohe Fettanteil verzeiht Fehler bei Trocknung und Rauchführung.</p></div></div>
      <div class="step"><span class="step-num"></span><div><h3>Große Keulenstücke</h3>
        <p>Längere Pökelzeiten, mehr Erfahrung nötig – aber ohne Reifeschrank machbar.</p></div></div>
      <div class="step"><span class="step-num"></span><div><h3>Lufttrocknung ohne Rauch</h3>
        <p>Parma- und Serrano-Art erst, wenn ein geeigneter Reifeort tatsächlich vorhanden ist.</p></div></div>
    </div>
  </div>
</div></div>`;

  return {
    path: '/schinken-selber-machen/',
    activeNav: '/schinken-selber-machen/',
    title: 'Schinken selber machen',
    metaTitle: `Schinken selber machen – Pökeln, Räuchern, Reifen | ${site.name}`,
    metaDescription:
      'Schinken selber machen: Lachsschinken, Schwarzwälder Art, Parma Art, Serrano Art, Rindersaftschinken, Bauchspeck und mehr – mit Ablauf, Fehlern und Sicherheitshinweisen.',
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/schinken-selber-machen/', label: 'Schinken selber machen' },
    ],
    body,
  };
}

export function hamPage(h) {
  const url = `${site.baseUrl}/schinken-selber-machen/${h.slug}/`;
  const mix = getProduct(h.mixture);

  const body = `<div class="page"><div class="wrap">
  <div class="page-head">
    <span class="eyebrow">Schinken selber machen</span>
    <h1>${esc(h.name)}</h1>
    <p class="lead">${esc(h.lead)}</p>
    <p style="margin-top:12px">${levelBadge(h.level)}
      <span class="badge badge-info">${h.smoked === true ? 'Kalt geräuchert' : h.smoked === false ? 'Ohne Rauch' : 'Rauch optional'}</span></p>
  </div>

  <div class="article">
    <div class="factbox">
      <h3>Ablauf im Überblick</h3>
      <dl class="factlist">
        ${fact('Fleischstück', h.cut)}
        ${fact('Pökelmischung', mix ? mix.name + (h.mixtureNote ? ' – ' + h.mixtureNote : '') : null)}
        ${fact('Pökeln', h.curing)}
        ${fact('Pökeldauer', h.curingTime)}
        ${fact('Durchbrennen', h.durchbrennen)}
        ${fact('Trocknen', h.drying)}
        ${fact('Räuchern', h.smoking)}
        ${fact('Reifen', h.ripening)}
        ${fact('Lagern', h.storage)}
      </dl>
    </div>

    <section>
      <h2 id="vorbereitung">Vorbereitung</h2>
      <ol class="list-num">${h.preparation.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>
    </section>

    <section>
      <h2 id="fehler">Typische Fehler</h2>
      <div class="note warn"><ul style="margin:0;padding-left:18px">
        ${h.mistakes.map((m) => `<li>${esc(m)}</li>`).join('')}
      </ul></div>
    </section>

    <section>
      <h2 id="sicherheit">Sicherheitshinweise</h2>
      <ul class="list-check">${h.safety.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
    </section>

    ${shareBar(url, h.name)}
  </div>

  ${relatedProducts(h.products, 'Passende Produkte aus dem Shop')}
</div></div>`;

  const recipe = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: h.name,
    description: truncate(h.lead, 250),
    recipeCategory: 'Pökeln und Räuchern',
    image: `${site.baseUrl}/assets/img/og-default.svg`,
    recipeIngredient: [h.cut, mix ? mix.name : 'Pökelmischung nach Herstellerangabe'],
    recipeInstructions: [
      ...h.preparation.map((p, i) => ({ '@type': 'HowToStep', position: i + 1, text: p })),
      { '@type': 'HowToStep', position: h.preparation.length + 1, text: `Pökeln: ${h.curing}` },
      { '@type': 'HowToStep', position: h.preparation.length + 2, text: `Durchbrennen: ${h.durchbrennen}` },
      { '@type': 'HowToStep', position: h.preparation.length + 3, text: `Trocknen: ${h.drying}` },
      { '@type': 'HowToStep', position: h.preparation.length + 4, text: `Räuchern: ${h.smoking}` },
      { '@type': 'HowToStep', position: h.preparation.length + 5, text: `Reifen: ${h.ripening}` },
    ],
  };

  return {
    path: `/schinken-selber-machen/${h.slug}/`,
    activeNav: '/schinken-selber-machen/',
    title: h.name,
    metaTitle: `${h.name} selber machen – Anleitung | ${site.name}`,
    metaDescription: `${h.name}: ${h.teaser} Fleischstück, Pökeln, Durchbrennen, Trocknen, Räuchern, Reifen und Lagern Schritt für Schritt.`,
    ogType: 'article',
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/schinken-selber-machen/', label: 'Schinken selber machen' },
      { href: `/schinken-selber-machen/${h.slug}/`, label: h.name },
    ],
    body,
    schemas: [recipe],
  };
}

/* =============================== RÄUCHERMEHL ============================== */

export function woodHubPage() {
  const body = `<div class="page"><div class="wrap"><div class="shop-layout">
  ${categoryNav({ activeMain: 'raeuchermehl', activeKnowledge: 'raeuchermehl-verstehen' })}
  <div>
    <div class="page-head">
      <span class="eyebrow">Räucherwissen</span>
      <h1>Räuchermehl verstehen</h1>
      <p class="lead">Das Räuchermehl entscheidet über Aroma, Rauchintensität und Farbe Ihres Räuchergutes.
        Wir führen fünf Holzarten – jede in vier Körnungen. Hier steht, welche wozu passt.</p>
    </div>

    <p><a class="btn btn-primary" href="/berater/raeuchermehl/">${icon('wood', 18)} Welches Räuchermehl brauche ich?</a></p>

    <div class="content-block">
      <h2>Die fünf Holzarten</h2>
      <div class="topic-grid">
        ${woods
          .map(
            (w) => `<a class="topic-card" href="/raeuchermehl/${w.slug}/">
          <span class="topic-icon">${icon('wood', 24)}</span>
          <h3>${esc(w.name)}</h3>
          <p>${esc(w.teaser)}</p>
          <span class="go">${esc(w.intensity)} ${icon('arrow', 15)}</span>
        </a>`
          )
          .join('\n')}
      </div>
    </div>

    <div class="content-block">
      <h2>Die vier Körnungen</h2>
      <p class="muted">Jede Holzart ist in vier Körnungen erhältlich. Die Körnung entscheidet darüber, wie das
        Mehl glimmt – und damit, ob es in Ihre Räucherschnecke, in die Räucherpfanne oder direkt auf die
        Wärmequelle gehört.</p>
      <div class="steps">
        ${grains
          .map(
            (g) => `<div class="step"><span class="step-num"></span><div>
          <h3>${esc(g.label)}</h3>
          <p>${esc(g.text)}</p>
          <p class="small muted" style="margin-top:6px">Gut für: ${esc(g.best.join(', '))}${g.mm ? ' · Siebweite: ' + esc(g.mm) : ' · Siebweite noch nicht hinterlegt'}</p>
        </div></div>`
          )
          .join('\n')}
      </div>
      <div class="note"><p><strong>Räucherschnecke:</strong> Körnung 1 ist auch besonders gut für Räucherschnecken
        geeignet – sie glimmt gleichmäßig und lange durch. Körnung 4 fällt durch das Gitter und verlischt.</p></div>
    </div>

    <div class="content-block">
      <h2>Holzarten im Vergleich</h2>
      <div class="table-scroll"><table class="data-table">
        <caption>Aroma, Intensität und Farbe der fünf Holzarten</caption>
        <thead><tr><th scope="col">Holz</th><th scope="col">Aroma</th><th scope="col">Intensität</th><th scope="col">Farbe</th><th scope="col">Passt zu</th></tr></thead>
        <tbody>
          ${woods
            .map(
              (w) =>
                `<tr><th scope="row"><a href="/raeuchermehl/${w.slug}/">${esc(w.name)}</a></th><td>${esc(w.aroma)}</td><td>${esc(w.intensity)}</td><td>${esc(w.color)}</td><td>${esc(w.fish)}</td></tr>`
            )
            .join('')}
        </tbody>
      </table></div>
    </div>
  </div>
</div></div></div>`;

  return {
    path: '/raeuchermehl/',
    activeNav: '/raeuchermehl/',
    title: 'Räuchermehl verstehen',
    metaTitle: `Räuchermehl: Holzarten & Körnungen erklärt | ${site.name}`,
    metaDescription:
      'Buche, Erle, Birke, Eiche oder Kirsche? Welche Körnung für Räucherschnecke, Kalt- oder Heißrauch? Alle Holzarten und Körnungen verständlich erklärt.',
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/raeuchermehl/', label: 'Räuchermehl' },
    ],
    body,
  };
}

export function woodPage(w) {
  const product = getProduct(w.product);
  const url = `${site.baseUrl}/raeuchermehl/${w.slug}/`;

  const body = `<div class="page"><div class="wrap"><div class="shop-layout">
  ${categoryNav({ activeMain: 'raeuchermehl', activeSub: `raeuchermehl-${w.slug}` })}
  <div>
    <div class="page-head">
      <span class="eyebrow">Räuchermehl</span>
      <h1>Räuchermehl ${esc(w.name)}</h1>
      <p class="lead">${esc(w.teaser)}</p>
    </div>

    <div class="article" style="max-width:none">
      <div class="factbox">
        <h3>${esc(w.name)} im Profil</h3>
        <dl class="factlist">
          ${fact('Aroma', w.aroma)}
          ${fact('Rauchintensität', w.intensity)}
          ${fact('Farbe des Räuchergutes', w.color)}
          ${fact('Geeignete Fischarten', w.fish)}
          ${fact('Geeignete Fleischarten', w.meat)}
          ${fact('Schinken', w.ham)}
          ${fact('Käse', w.cheese)}
          ${fact('Kombination mit anderen Holzarten', w.combine)}
          ${fact('Körnungsempfehlung', w.grainTip)}
        </dl>
      </div>

      <section>
        <h2 id="koernungen">Welche Körnung von ${esc(w.name)}?</h2>
        <div class="table-scroll"><table class="data-table">
          <thead><tr><th scope="col">Körnung</th><th scope="col">Eigenschaft</th><th scope="col">Gut für</th></tr></thead>
          <tbody>
            ${grains
              .map((g) => `<tr><th scope="row">${esc(g.label)}</th><td>${esc(g.text)}</td><td>${esc(g.best.join(', '))}</td></tr>`)
              .join('')}
          </tbody>
        </table></div>
        <div class="note"><p>Körnung 1 ist auch besonders gut für <strong>Räucherschnecken</strong> geeignet.</p></div>
      </section>

      ${shareBar(url, `Räuchermehl ${w.name}`)}
    </div>

    ${product ? `<div class="content-block"><h2>${esc(w.name)} im Shop</h2>${productGrid([product])}</div>` : ''}

    <div class="content-block">
      <h2>Andere Holzarten</h2>
      <div class="topic-grid">
        ${woods
          .filter((o) => o.slug !== w.slug)
          .map(
            (o) => `<a class="topic-card" href="/raeuchermehl/${o.slug}/">
          <span class="topic-icon">${icon('wood', 22)}</span>
          <h3>${esc(o.name)}</h3><p>${esc(o.teaser)}</p>
          <span class="go">Ansehen ${icon('arrow', 15)}</span>
        </a>`
          )
          .join('')}
      </div>
    </div>
  </div>
</div></div></div>`;

  return {
    path: `/raeuchermehl/${w.slug}/`,
    activeNav: '/raeuchermehl/',
    title: `Räuchermehl ${w.name}`,
    metaTitle: `Räuchermehl ${w.name} – Aroma, Farbe & Körnung | ${site.name}`,
    metaDescription: `Räuchermehl ${w.name}: ${w.aroma} Für welche Fisch- und Fleischarten es passt, welche Körnung Sie brauchen und womit es sich kombinieren lässt.`,
    ogType: 'article',
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/raeuchermehl/', label: 'Räuchermehl' },
      { href: `/raeuchermehl/${w.slug}/`, label: w.name },
    ],
    body,
  };
}
