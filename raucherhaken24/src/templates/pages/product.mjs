import { esc, icon, money, truncate } from '../util.mjs';
import {
  productGrid, priceLabel, productImage, PLACEHOLDER_IMG, categoryNav,
  faqBlock, faqSchema, shareBar, productUrl,
} from '../components.mjs';
import { categories } from '../../data/categories.mjs';
import { site, commerce } from '../../data/site.mjs';
import { getProduct, resolveVariants, hasPrice, materials, products } from '../../data/catalog.mjs';

function specRow(label, value) {
  if (value === null || value === undefined || value === '') {
    return `<tr><th scope="row">${esc(label)}</th><td class="todo">noch nicht hinterlegt</td></tr>`;
  }
  return `<tr><th scope="row">${esc(label)}</th><td>${esc(value)}</td></tr>`;
}

function gallery(product) {
  const imgs = product.images && product.images.length ? product.images : [PLACEHOLDER_IMG];
  const thumbs =
    imgs.length > 1
      ? `<div class="gallery-thumbs">${imgs
          .map(
            (src, i) =>
              `<button type="button" data-gallery-thumb="${esc(src)}" aria-current="${i === 0}"><img src="${esc(src)}" alt="Ansicht ${i + 1}" loading="lazy" /></button>`
          )
          .join('')}</div>`
      : '';
  return `<div class="gallery">
    <div class="gallery-main" id="gallery-main" data-zoom>
      <img src="${esc(imgs[0])}" alt="${esc(product.name)}" id="gallery-img" width="600" height="600" decoding="async" />
      <span class="zoom-hint">${icon('zoom', 14)} Zum Vergrößern klicken</span>
    </div>
    ${thumbs}
    ${imgs[0] === PLACEHOLDER_IMG ? '<p class="small muted" style="margin-top:10px">Für diesen Artikel ist noch kein Produktfoto hinterlegt. Es wird bewusst kein fremdes Bild gezeigt.</p>' : ''}
  </div>`;
}

function buybox(product) {
  const variants = resolveVariants(product);
  const priced = hasPrice(product);
  const variantField = variants.length
    ? `<div class="field">
      <label for="variant">${product.grainVariants ? 'Körnung' : 'Ausführung'} wählen</label>
      <select id="variant" data-variant>
        ${variants
          .map(
            (v) =>
              `<option value="${esc(v.id)}" data-price="${typeof v.price === 'number' ? v.price : ''}">${esc(v.label)}${typeof v.price === 'number' ? ' – ' + money(v.price, commerce.currencySymbol) : ''}</option>`
          )
          .join('')}
      </select>
      ${product.grainVariants ? '<span class="hint">Körnung 1 ist auch besonders gut für Räucherschnecken geeignet.</span>' : ''}
    </div>`
    : '';

  const buyButton = priced
    ? `<button type="button" class="btn btn-primary btn-block" data-add-to-cart>${icon('cart', 18)} In den Warenkorb</button>`
    : `<button type="button" class="btn btn-primary btn-block" data-add-to-cart data-request-only>${icon('mail', 18)} Auf die Anfrageliste</button>`;

  return `<div class="buybox"
    data-product="${esc(product.slug)}"
    data-name="${esc(product.name)}"
    data-image="${esc(productImage(product))}"
    data-url="${esc(productUrl(product.slug))}">
    <div class="price-row">
      ${priceLabel(product)}
      ${priced ? '' : '<span class="badge badge-todo">Preis noch nicht gepflegt</span>'}
    </div>
    <p class="vat-note">${priced ? esc(commerce.vatRateNote) : 'Für diesen Artikel ist noch kein Preis hinterlegt. Wir nennen bewusst keinen geschätzten Betrag – Sie können ihn über die Anfrageliste erfragen.'}</p>
    ${variantField}
    <div class="buy-row">
      <div class="field" style="margin:0">
        <label for="qty">Menge</label>
        <div class="qty">
          <button type="button" data-qty="-1" aria-label="Menge verringern">−</button>
          <input type="number" id="qty" value="1" min="1" max="999" inputmode="numeric" data-qty-input />
          <button type="button" data-qty="1" aria-label="Menge erhöhen">+</button>
        </div>
      </div>
      <div class="field" style="margin:0">${buyButton}</div>
    </div>
    <p class="small muted" style="margin-top:12px">${icon('info', 14)} Verfügbarkeit auf Anfrage – der Lagerbestand ist noch nicht an den Shop angebunden.</p>
    <div class="form-status" data-cart-status role="status"></div>
  </div>`;
}

function materialBlock(product) {
  const variants = resolveVariants(product);
  const usesSteel = variants.some((v) => v.material === 'v2a' || v.material === 'v4a');
  if (!usesSteel) return '';
  return `<div class="content-block">
    <h2>Material</h2>
    <p>Dieser Artikel ist in rostfreiem Edelstahl erhältlich. Der Unterschied zwischen den Varianten
      betrifft vor allem die Beständigkeit gegen Salz.</p>
    <div class="qa-grid">
      <div class="qa-item"><h3>${esc(materials.v2a.label)}</h3><p>${esc(materials.v2a.summary)}</p></div>
      <div class="qa-item"><h3>${esc(materials.v4a.label)}</h3><p>${esc(materials.v4a.summary)}</p></div>
    </div>
    <p style="margin-top:14px"><a class="btn btn-secondary" href="/raeucherwissen/va-v2a-v4a/">${icon('book', 17)} VA, V2A und V4A ausführlich vergleichen</a></p>
  </div>`;
}

export function productPage(product) {
  const cat = categories.find((c) => c.slug === product.category);
  const sub = cat ? cat.children.find((s) => s.slug === product.sub) : null;
  const url = site.baseUrl + productUrl(product.slug);
  const variants = resolveVariants(product);

  const related = (product.related || []).map(getProduct).filter(Boolean);
  const alsoInteresting = products
    .filter(
      (p) =>
        p.slug !== product.slug &&
        !related.some((r) => r.slug === p.slug) &&
        (p.category === product.category || (p.tags || []).some((t) => (product.tags || []).includes(t)))
    )
    .slice(0, 4);

  const qa = [
    ['Was ist dieses Produkt?', product.what],
    ['Für wen ist es geeignet?', product.forWhom],
    ['Wann sollte ich dieses Produkt verwenden?', product.when],
    ['Welche Variante brauche ich?', product.whichVariant],
  ].filter(([, v]) => v);

  const body = `<div class="page"><div class="wrap"><div class="shop-layout">
  ${categoryNav({ activeMain: product.category, activeSub: product.sub })}
  <div>
    <div class="product-detail">
      ${gallery(product)}
      <div class="product-info">
        <span class="eyebrow">${esc(sub ? sub.label : cat ? cat.label : '')}</span>
        <h1>${esc(product.name)}</h1>
        <p class="product-lead">${esc(product.lead || product.short)}</p>
        ${buybox(product)}
        <table class="spec-table">
          <caption class="visually-hidden">Technische Angaben</caption>
          <tbody>
            ${specRow('Material', variants.some((v) => v.material) ? variants.filter((v) => v.material).map((v) => v.label).join(' / ') : product.specs.material)}
            ${specRow('Länge', product.specs.laenge)}
            ${specRow('Stärke', product.specs.staerke)}
            ${specRow('Inhalt / Füllmenge', product.specs.inhalt)}
            ${specRow('Geeignet für', (product.suitedFor || []).length ? product.suitedFor.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(', ') : null)}
          </tbody>
        </table>
        <p class="small muted">Angaben mit dem Hinweis „noch nicht hinterlegt“ werden bewusst nicht geschätzt.
          Sobald die geprüften Werte vorliegen, erscheinen sie hier automatisch.</p>
        ${shareBar(url, product.name)}
      </div>
    </div>

    <div class="content-block">
      <h2>Das Wichtigste zu diesem Artikel</h2>
      <div class="qa-grid">
        ${qa.map(([q, a]) => `<div class="qa-item"><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join('\n')}
      </div>
    </div>

    ${
      product.application && product.application.length
        ? `<div class="content-block"><h2>Anwendung</h2><ol class="list-num">${product.application
            .map((a) => `<li>${esc(a)}</li>`)
            .join('')}</ol></div>`
        : ''
    }

    ${materialBlock(product)}

    ${
      product.care && product.care.length
        ? `<div class="content-block"><h2>Pflege</h2><ul class="list-check">${product.care
            .map((c) => `<li>${esc(c)}</li>`)
            .join('')}</ul></div>`
        : ''
    }

    ${
      product.safety && product.safety.length
        ? `<div class="content-block"><h2>Sicherheit</h2><div class="note warn"><ul style="margin:0;padding-left:18px">${product.safety
            .map((s) => `<li>${esc(s)}</li>`)
            .join('')}</ul></div></div>`
        : ''
    }

    ${faqBlock(product.faq)}
    ${related.length ? `<div class="content-block"><h2>Passende Produkte</h2>${productGrid(related)}</div>` : ''}
    ${alsoInteresting.length ? `<div class="content-block"><h2>Das könnte ebenfalls interessant sein</h2>${productGrid(alsoInteresting)}</div>` : ''}
  </div>
</div></div></div>

<div class="sticky-buy">
  ${priceLabel(product)}
  <button type="button" class="btn btn-primary" data-add-to-cart data-sticky${hasPrice(product) ? '' : ' data-request-only'}>
    ${hasPrice(product) ? 'In den Warenkorb' : 'Auf die Anfrageliste'}
  </button>
</div>`;

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: truncate(product.lead || product.short, 300),
    category: cat ? cat.label : undefined,
    url,
  };
  // Offer nur bei tatsaechlich gepflegtem Preis - keine erfundenen Preisdaten.
  if (hasPrice(product)) {
    const p = typeof product.price === 'number' ? product.price : variants.find((v) => typeof v.price === 'number').price;
    productSchema.offers = {
      '@type': 'Offer',
      price: p.toFixed(2),
      priceCurrency: commerce.currency,
      url,
    };
  }

  return {
    path: productUrl(product.slug),
    activeNav: '/shop/',
    title: product.name,
    metaTitle: `${product.name} kaufen | ${site.name}`,
    metaDescription: `${product.short} ${product.forWhom || ''}`,
    ogType: 'product',
    breadcrumbs: [
      { href: '/', label: 'Start' },
      { href: '/shop/', label: 'Shop' },
      ...(cat ? [{ href: `/kategorie/${cat.slug}/`, label: cat.label }] : []),
      ...(sub && sub.label !== product.name ? [{ href: `/kategorie/${product.category}/${sub.slug}/`, label: sub.label }] : []),
      { href: productUrl(product.slug), label: product.name },
    ],
    body,
    schemas: [productSchema, faqSchema(product.faq)].filter(Boolean),
  };
}
