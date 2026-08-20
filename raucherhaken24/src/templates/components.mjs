import { esc, icon, money } from './util.mjs';
import { categories, knowledgeNav } from '../data/categories.mjs';
import { commerce } from '../data/site.mjs';
import { getProduct, resolveVariants, hasPrice } from '../data/catalog.mjs';

export const PLACEHOLDER_IMG = '/assets/img/produkt-platzhalter.svg';

export function productUrl(slug) {
  return `/produkt/${slug}/`;
}

export function productImage(product) {
  const first = product.images && product.images.length ? product.images[0] : null;
  return first || PLACEHOLDER_IMG;
}

/** Preisdarstellung. Ohne gepflegten Preis wird NICHTS geschätzt. */
export function priceLabel(product) {
  if (hasPrice(product)) {
    const p = typeof product.price === 'number'
      ? product.price
      : resolveVariants(product).find((v) => typeof v.price === 'number').price;
    return `<span class="price">${esc(money(p, commerce.currencySymbol))}</span>`;
  }
  return `<span class="price-none">Preis auf Anfrage</span>`;
}

export function productCard(product) {
  const img = productImage(product);
  const isPlaceholder = img === PLACEHOLDER_IMG;
  const cat = categories.find((c) => c.slug === product.category);
  return `<article class="product-card">
  <a class="product-media" href="${productUrl(product.slug)}" tabindex="-1" aria-hidden="true">
    <img src="${esc(img)}" alt="" loading="lazy" decoding="async" width="320" height="240" />
    ${isPlaceholder ? '<span class="badge badge-todo" style="position:absolute;top:10px;left:10px">Foto folgt</span>' : ''}
  </a>
  <div class="product-body">
    <span class="cat">${esc(cat ? cat.label : '')}</span>
    <h3><a href="${productUrl(product.slug)}">${esc(product.name)}</a></h3>
    <p class="desc">${esc(product.short)}</p>
    <div class="product-foot">
      ${priceLabel(product)}
      <a class="btn btn-secondary" style="padding:8px 14px;min-height:38px;font-size:0.85rem" href="${productUrl(product.slug)}">Details</a>
    </div>
  </div>
</article>`;
}

export function productGrid(list) {
  if (!list.length) {
    return `<div class="empty-state"><p>In dieser Kategorie sind noch keine Artikel hinterlegt.</p></div>`;
  }
  return `<div class="product-grid">${list.map(productCard).join('\n')}</div>`;
}

/**
 * Linke Kategorienavigation.
 * activeMain / activeSub steuern die Hervorhebung.
 */
export function categoryNav({ activeMain = null, activeSub = null, activeKnowledge = null } = {}) {
  const groups = categories
    .map((cat) => {
      const mainActive = cat.slug === activeMain ? ' is-active' : '';
      const subs = cat.children
        .map((sub) => {
          const active = sub.slug === activeSub ? ' class="is-active"' : '';
          return `<li><a href="/kategorie/${cat.slug}/${sub.slug}/"${active}>${esc(sub.label)}</a></li>`;
        })
        .join('');
      return `<div class="catnav-group">
      <a class="catnav-main${mainActive}" href="/kategorie/${cat.slug}/">${esc(cat.label)}</a>
      <ul class="catnav-sub">${subs}</ul>
    </div>`;
    })
    .join('');

  const knowledge = knowledgeNav.children
    .map((k) => {
      const active = k.slug === activeKnowledge ? ' class="is-active"' : '';
      return `<li><a href="${knowledgeHref(k.slug)}"${active}>${esc(k.label)}</a></li>`;
    })
    .join('');

  return `<button type="button" class="catnav-drawer-toggle" aria-expanded="false" aria-controls="catnav">
    ${icon('menu', 18)} Kategorien
  </button>
  <nav class="catnav" id="catnav" aria-label="Kategorien">
    <h2>Sortiment</h2>
    ${groups}
    <div class="catnav-group catnav-knowledge">
      <a class="catnav-main" href="/raeucherwissen/">${esc(knowledgeNav.label)}</a>
      <ul class="catnav-sub">${knowledge}</ul>
    </div>
  </nav>`;
}

/** Wissens-Slugs, die auf eigene Hub-Seiten zeigen. */
export function knowledgeHref(slug) {
  if (slug === 'schinken-selber-machen') return '/schinken-selber-machen/';
  if (slug === 'raeuchermehl-verstehen') return '/raeuchermehl/';
  return `/raeucherwissen/${slug}/`;
}

/* ------------------------- Redaktionelle Blöcke ------------------------- */

export function renderBlock(block) {
  switch (block.type) {
    case 'p':
      return `<p>${block.text}</p>`;
    case 'ul':
      return `<ul>${block.items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
    case 'ol':
      return `<ol>${block.items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
    case 'note':
      return `<div class="note ${esc(block.tone || 'info')}"><p>${block.text}</p></div>`;
    case 'table':
      return `<div class="table-scroll"><table class="data-table">
        ${block.caption ? `<caption>${esc(block.caption)}</caption>` : ''}
        <thead><tr>${block.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${block.rows
          .map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`)
          .join('')}</tbody>
      </table></div>`;
    case 'steps':
      return `<div class="steps">${block.items
        .map(
          (s) => `<div class="step"><span class="step-num"></span><div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div></div>`
        )
        .join('')}</div>`;
    case 'recommendation':
      return `<div class="reco-grid">${block.items
        .map(
          (r) => `<div class="reco"><span class="for">${esc(r.for)}</span><div class="pick">${esc(r.pick)}</div><p>${esc(r.why)}</p></div>`
        )
        .join('')}</div>`;
    default:
      return '';
  }
}

export function renderSections(sections) {
  return sections
    .map(
      (s) => `<section><h2 id="${slugifyHeading(s.title)}">${esc(s.title)}</h2>
      ${s.blocks.map(renderBlock).join('\n')}</section>`
    )
    .join('\n');
}

export function slugifyHeading(text) {
  return String(text)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* --------------------------------- FAQ ---------------------------------- */

export function faqBlock(faq, heading = 'Häufige Fragen') {
  if (!faq || !faq.length) return '';
  const items = faq
    .map(
      (f) => `<details class="accordion"><summary>${esc(f.q)}</summary><div class="acc-body"><p>${esc(f.a)}</p></div></details>`
    )
    .join('\n');
  return `<div class="content-block"><h2>${esc(heading)}</h2>${items}</div>`;
}

export function faqSchema(faq) {
  if (!faq || !faq.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/* -------------------------------- Teilen -------------------------------- */

export function shareBar(url, title) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return `<div class="share" data-share-url="${esc(url)}" data-share-title="${esc(title)}">
  <span>Teilen:</span>
  <a href="https://wa.me/?text=${t}%20${u}" target="_blank" rel="noopener">${icon('whatsapp', 16)} WhatsApp</a>
  <a href="https://www.facebook.com/sharer/sharer.php?u=${u}" target="_blank" rel="noopener">${icon('facebook', 16)} Facebook</a>
  <a href="mailto:?subject=${t}&amp;body=${u}">${icon('mail', 16)} E-Mail</a>
  <button type="button" data-copy-link>${icon('link', 16)} Link kopieren</button>
</div>`;
}

/* ---------------------- Produktkacheln für Querlinks -------------------- */

export function relatedProducts(slugs, heading = 'Passende Produkte') {
  const list = (slugs || []).map(getProduct).filter(Boolean);
  if (!list.length) return '';
  return `<div class="content-block"><h2>${esc(heading)}</h2>${productGrid(list)}</div>`;
}
