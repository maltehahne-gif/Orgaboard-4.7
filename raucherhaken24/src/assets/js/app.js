/* Räucherhaken24 – Frontend-Logik.
   Bewusst ohne Framework: eine Datei, keine externen Abhängigkeiten.
   Alles, was hier passiert, läuft lokal im Browser. */
(function () {
  'use strict';

  var DATA = window.RH24 || { config: {}, products: [], index: [] };
  var CFG = DATA.config || {};
  var CART_KEY = 'rh24.cart.v1';
  var FAV_KEY = 'rh24.favorites.v1';
  var SEEN_KEY = 'rh24.seen.v1';

  /* ----------------------------- Hilfsmittel ----------------------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function readStore(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* z.B. privater Modus */ }
  }

  function money(value) {
    if (typeof value !== 'number' || !isFinite(value)) return null;
    return value.toFixed(2).replace('.', ',') + ' ' + (CFG.currencySymbol || '€');
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function status(el, message, tone) {
    if (!el) return;
    el.textContent = message;
    el.className = 'form-status is-visible ' + (tone || 'ok');
  }

  function productBySlug(slug) {
    for (var i = 0; i < DATA.products.length; i++) {
      if (DATA.products[i].slug === slug) return DATA.products[i];
    }
    return null;
  }

  /* ------------------------------ Warenkorb ------------------------------ */

  var Cart = {
    all: function () { return readStore(CART_KEY, []); },
    save: function (items) { writeStore(CART_KEY, items); Cart.refreshBadge(); },
    lineId: function (slug, variant) { return slug + '::' + (variant || ''); },

    add: function (entry) {
      var items = Cart.all();
      var id = Cart.lineId(entry.slug, entry.variant);
      var found = null;
      for (var i = 0; i < items.length; i++) { if (items[i].id === id) { found = items[i]; break; } }
      if (found) {
        found.qty = Math.min(999, found.qty + entry.qty);
      } else {
        entry.id = id;
        items.push(entry);
      }
      Cart.save(items);
      return items;
    },

    setQty: function (id, qty) {
      var items = Cart.all().map(function (it) {
        if (it.id === id) it.qty = Math.max(1, Math.min(999, qty));
        return it;
      });
      Cart.save(items);
    },

    remove: function (id) {
      Cart.save(Cart.all().filter(function (it) { return it.id !== id; }));
    },

    count: function () {
      return Cart.all().reduce(function (sum, it) { return sum + it.qty; }, 0);
    },

    /** Nur Positionen mit gepflegtem Preis fließen in die Summe ein. */
    totals: function () {
      var items = Cart.all();
      var subtotal = 0;
      var requestCount = 0;
      items.forEach(function (it) {
        if (typeof it.price === 'number') subtotal += it.price * it.qty;
        else requestCount += it.qty;
      });
      var shipping = null;
      if (subtotal > 0 && typeof CFG.shipping === 'object' && CFG.shipping) {
        if (typeof CFG.shipping.freeFrom === 'number' && subtotal >= CFG.shipping.freeFrom) shipping = 0;
        else if (typeof CFG.shipping.flatRate === 'number') shipping = CFG.shipping.flatRate;
      }
      return {
        items: items,
        subtotal: subtotal,
        requestCount: requestCount,
        shipping: shipping,
        discount: Cart.discount(subtotal),
        total: subtotal + (shipping || 0) - Cart.discount(subtotal),
      };
    },

    voucher: function () { return readStore('rh24.voucher.v1', null); },
    discount: function (subtotal) {
      var v = Cart.voucher();
      if (!v || typeof v.percent !== 'number') return 0;
      return Math.round(subtotal * v.percent) / 100;
    },

    refreshBadge: function () {
      var n = Cart.count();
      $$('[data-cart-count]').forEach(function (el) {
        el.textContent = String(n);
        if (n > 0) el.removeAttribute('hidden'); else el.setAttribute('hidden', '');
      });
    },
  };

  /* --------------------------- Kopfbereich / Nav -------------------------- */

  function initNav() {
    var toggle = $('.nav-toggle');
    var nav = $('#mainnav');
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        var open = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
      });
    }
    var catToggle = $('.catnav-drawer-toggle');
    var catnav = $('#catnav');
    if (catToggle && catnav) {
      catToggle.addEventListener('click', function () {
        var open = catnav.classList.toggle('is-open');
        catToggle.setAttribute('aria-expanded', String(open));
      });
    }
  }

  /* -------------------------------- Suche -------------------------------- */

  function searchIndex(query) {
    var q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    var terms = q.split(/\s+/);
    var scored = [];
    (DATA.index || []).forEach(function (entry) {
      var hay = entry.s;
      var score = 0;
      for (var i = 0; i < terms.length; i++) {
        var pos = hay.indexOf(terms[i]);
        if (pos === -1) return;
        score += pos < 40 ? 3 : 1;
      }
      if (entry.t.toLowerCase().indexOf(q) === 0) score += 6;
      scored.push({ entry: entry, score: score });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, 12).map(function (s) { return s.entry; });
  }

  function initSearch() {
    var input = $('#site-search');
    var box = $('#search-results');
    var btn = $('#site-search-btn');
    if (!input || !box) return;

    var activeIndex = -1;

    function render(results) {
      activeIndex = -1;
      if (!results.length) {
        box.innerHTML = input.value.trim().length >= 2
          ? '<p class="search-empty">Kein Treffer. Versuchen Sie es mit einem anderen Begriff – oder fragen Sie den Räucherberater.</p>'
          : '';
        input.setAttribute('aria-expanded', String(Boolean(input.value.trim().length >= 2)));
        return;
      }
      box.innerHTML = results.map(function (r) {
        return '<a href="' + escapeHtml(r.u) + '" role="option"><span class="sr-kind">' +
          escapeHtml(r.k) + '</span><span>' + escapeHtml(r.t) + '</span></a>';
      }).join('');
      input.setAttribute('aria-expanded', 'true');
    }

    input.addEventListener('input', function () { render(searchIndex(input.value)); });
    input.addEventListener('keydown', function (ev) {
      var links = $$('a', box);
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        if (!links.length) return;
        ev.preventDefault();
        activeIndex += ev.key === 'ArrowDown' ? 1 : -1;
        if (activeIndex < 0) activeIndex = links.length - 1;
        if (activeIndex >= links.length) activeIndex = 0;
        links.forEach(function (l, i) { l.classList.toggle('is-active', i === activeIndex); });
        links[activeIndex].focus();
      } else if (ev.key === 'Enter' && activeIndex === -1) {
        ev.preventDefault();
        if (input.value.trim()) location.href = '/suche/?q=' + encodeURIComponent(input.value.trim());
      } else if (ev.key === 'Escape') {
        box.innerHTML = '';
        input.setAttribute('aria-expanded', 'false');
      }
    });
    if (btn) {
      btn.addEventListener('click', function () {
        if (input.value.trim()) location.href = '/suche/?q=' + encodeURIComponent(input.value.trim());
      });
    }
    document.addEventListener('click', function (ev) {
      if (!ev.target.closest('.header-search')) { box.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); }
    });
  }

  function initSearchPage() {
    var form = $('[data-search-page-form]');
    var out = $('[data-search-page-results]');
    if (!form || !out) return;
    var field = $('#q', form);

    function run(q) {
      var results = searchIndex(q || '');
      if (!q || q.length < 2) { out.innerHTML = ''; return; }
      if (!results.length) {
        out.innerHTML = '<h2>Keine Treffer für „' + escapeHtml(q) + '“</h2>' +
          '<p class="muted">Versuchen Sie einen anderen Begriff oder fragen Sie den Räucherberater unten rechts.</p>';
        return;
      }
      out.innerHTML = '<h2>' + results.length + ' Treffer für „' + escapeHtml(q) + '“</h2>' +
        '<div class="split">' + results.map(function (r) {
          return '<div class="knowledge-card"><h3><a href="' + escapeHtml(r.u) + '">' + escapeHtml(r.t) +
            '</a></h3><p class="small muted">' + escapeHtml(r.k) + '</p></div>';
        }).join('') + '</div>';
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      run(field.value.trim());
      history.replaceState(null, '', '/suche/?q=' + encodeURIComponent(field.value.trim()));
    });

    var initial = new URLSearchParams(location.search).get('q');
    if (initial) { field.value = initial; run(initial.trim()); }
  }

  /* ------------------------------- Galerie ------------------------------- */

  function initGallery() {
    var main = $('#gallery-main');
    var img = $('#gallery-img');
    if (!main || !img) return;

    main.addEventListener('click', function () {
      main.classList.toggle('is-zoomed');
      if (!main.classList.contains('is-zoomed')) img.style.transformOrigin = 'center center';
    });
    main.addEventListener('mousemove', function (ev) {
      if (!main.classList.contains('is-zoomed')) return;
      var rect = main.getBoundingClientRect();
      var x = ((ev.clientX - rect.left) / rect.width) * 100;
      var y = ((ev.clientY - rect.top) / rect.height) * 100;
      img.style.transformOrigin = x + '% ' + y + '%';
    });
    main.addEventListener('mouseleave', function () { main.classList.remove('is-zoomed'); });

    $$('[data-gallery-thumb]').forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        img.src = thumb.getAttribute('data-gallery-thumb');
        $$('[data-gallery-thumb]').forEach(function (t) { t.setAttribute('aria-current', String(t === thumb)); });
      });
    });
  }

  /* ---------------------------- Produktseite ----------------------------- */

  function initProductPage() {
    var box = $('.buybox');
    if (!box) return;

    document.body.classList.add('has-sticky-buy');

    var slug = box.getAttribute('data-product');
    var name = box.getAttribute('data-name');
    var image = box.getAttribute('data-image');
    var url = box.getAttribute('data-url');
    var variantSel = $('[data-variant]', box);
    var qtyInput = $('[data-qty-input]', box);
    var statusEl = $('[data-cart-status]', box);

    $$('[data-qty]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var delta = parseInt(b.getAttribute('data-qty'), 10);
        var next = Math.max(1, Math.min(999, (parseInt(qtyInput.value, 10) || 1) + delta));
        qtyInput.value = String(next);
      });
    });

    function currentVariant() {
      if (!variantSel) return { id: '', label: '', price: null };
      var opt = variantSel.options[variantSel.selectedIndex];
      var raw = opt.getAttribute('data-price');
      return { id: opt.value, label: opt.textContent.split(' – ')[0], price: raw === '' ? null : parseFloat(raw) };
    }

    function addToCart(isRequest) {
      var v = currentVariant();
      var product = productBySlug(slug);
      var price = v.price;
      if (price == null && product && typeof product.price === 'number') price = product.price;
      Cart.add({
        slug: slug, name: name, variant: v.id, variantLabel: v.label,
        qty: Math.max(1, parseInt(qtyInput ? qtyInput.value : '1', 10) || 1),
        price: typeof price === 'number' ? price : null,
        img: image, url: url,
      });
      if (isRequest) {
        status(statusEl, 'Auf die Anfrageliste gesetzt. Für diesen Artikel ist noch kein Preis hinterlegt – er wird nicht mitgerechnet.', 'warn');
      } else {
        status(statusEl, 'Artikel wurde in den Warenkorb gelegt.', 'ok');
      }
    }

    $$('[data-add-to-cart]').forEach(function (btn) {
      btn.addEventListener('click', function () { addToCart(btn.hasAttribute('data-request-only')); });
    });

    // Zuletzt angesehen (rein lokal)
    var seen = readStore(SEEN_KEY, []).filter(function (s) { return s !== slug; });
    seen.unshift(slug);
    writeStore(SEEN_KEY, seen.slice(0, 12));
  }

  /* --------------------------- Warenkorb-Seite --------------------------- */

  function renderCartPage() {
    var page = $('[data-cart-page]');
    if (!page) return;

    var list = $('[data-cart-list]', page);
    var empty = $('[data-cart-empty]', page);
    var summary = $('[data-cart-summary]', page);
    var t = Cart.totals();

    if (!t.items.length) {
      list.innerHTML = '';
      empty.removeAttribute('hidden');
      summary.setAttribute('hidden', '');
      return;
    }
    empty.setAttribute('hidden', '');
    summary.removeAttribute('hidden');

    list.innerHTML = t.items.map(function (it) {
      var lineTotal = typeof it.price === 'number' ? money(it.price * it.qty) : null;
      return '<article class="cart-item" data-line="' + escapeHtml(it.id) + '">' +
        '<span class="thumb"><img src="' + escapeHtml(it.img) + '" alt="" loading="lazy" /></span>' +
        '<div><h3><a href="' + escapeHtml(it.url) + '">' + escapeHtml(it.name) + '</a></h3>' +
        (it.variantLabel ? '<span class="variant">' + escapeHtml(it.variantLabel) + '</span>' : '') +
        (typeof it.price === 'number' ? '' : '<div><span class="badge badge-todo">Anfrageposition – kein Preis hinterlegt</span></div>') +
        '</div>' +
        '<div class="line-end">' +
        '<div class="qty"><button type="button" data-line-qty="-1" aria-label="Menge verringern">−</button>' +
        '<input type="number" value="' + it.qty + '" min="1" max="999" data-line-input aria-label="Menge" />' +
        '<button type="button" data-line-qty="1" aria-label="Menge erhöhen">+</button></div>' +
        '<strong>' + (lineTotal || 'auf Anfrage') + '</strong>' +
        '<button type="button" class="link-remove" data-line-remove>Entfernen</button>' +
        '</div></article>';
    }).join('');

    $$('[data-line]', list).forEach(function (row) {
      var id = row.getAttribute('data-line');
      var input = $('[data-line-input]', row);
      $$('[data-line-qty]', row).forEach(function (b) {
        b.addEventListener('click', function () {
          Cart.setQty(id, (parseInt(input.value, 10) || 1) + parseInt(b.getAttribute('data-line-qty'), 10));
          renderCartPage();
        });
      });
      input.addEventListener('change', function () { Cart.setQty(id, parseInt(input.value, 10) || 1); renderCartPage(); });
      $('[data-line-remove]', row).addEventListener('click', function () { Cart.remove(id); renderCartPage(); });
    });

    renderTotals(t);
  }

  function renderTotals(t) {
    t = t || Cart.totals();
    $$('[data-sum-subtotal]').forEach(function (el) { el.textContent = money(t.subtotal) || '0,00 €'; });
    $$('[data-sum-total]').forEach(function (el) {
      el.textContent = t.subtotal > 0 ? money(t.total) : (t.requestCount > 0 ? 'auf Anfrage' : '0,00 €');
    });
    $$('[data-sum-shipping]').forEach(function (el) {
      if (t.shipping === 0) el.textContent = 'kostenfrei';
      else if (typeof t.shipping === 'number') el.textContent = money(t.shipping);
      else el.textContent = 'noch nicht hinterlegt';
    });
    var reqRow = $('[data-sum-request-row]');
    if (reqRow) {
      if (t.requestCount > 0) {
        reqRow.removeAttribute('hidden');
        $('[data-sum-request]').textContent = t.requestCount + ' Artikel ohne Preis';
      } else reqRow.setAttribute('hidden', '');
    }
    var discRow = $('[data-sum-discount-row]');
    if (discRow) {
      if (t.discount > 0) {
        discRow.removeAttribute('hidden');
        $('[data-sum-discount]').textContent = '−' + money(t.discount);
      } else discRow.setAttribute('hidden', '');
    }
  }

  function initVoucher() {
    var form = $('[data-voucher-form]');
    if (!form) return;
    var statusEl = $('[data-voucher-status]');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var code = $('#voucher', form).value.trim().toUpperCase();
      if (!code) { status(statusEl, 'Bitte geben Sie einen Code ein.', 'err'); return; }
      var list = CFG.vouchers || [];
      var hit = null;
      for (var i = 0; i < list.length; i++) { if (String(list[i].code).toUpperCase() === code) hit = list[i]; }
      if (hit) {
        writeStore('rh24.voucher.v1', hit);
        status(statusEl, 'Gutschein „' + code + '“ wurde übernommen.', 'ok');
      } else {
        status(statusEl, 'Dieser Code ist nicht hinterlegt. Gutscheine werden nach Anbindung des Backends serverseitig geprüft.', 'err');
      }
      renderTotals();
    });
  }

  /* ------------------------------- Checkout ------------------------------- */

  function initCheckout() {
    var form = $('[data-checkout-form]');
    if (!form) return;

    var itemsBox = $('[data-checkout-items]');
    var t = Cart.totals();
    if (itemsBox) {
      itemsBox.innerHTML = t.items.length
        ? t.items.map(function (it) {
            return '<div class="sum-row"><span>' + it.qty + '× ' + escapeHtml(it.name) +
              (it.variantLabel ? ' <small class="muted">(' + escapeHtml(it.variantLabel) + ')</small>' : '') +
              '</span><strong>' + (typeof it.price === 'number' ? money(it.price * it.qty) : 'auf Anfrage') + '</strong></div>';
          }).join('')
        : '<p class="muted small">Ihr Warenkorb ist leer. <a href="/shop/">Zum Shop</a></p>';
    }
    renderTotals(t);

    var toggle = $('[data-toggle-shipping]', form);
    var shipFields = $('[data-shipping-fields]', form);
    if (toggle && shipFields) {
      toggle.addEventListener('change', function () {
        if (toggle.checked) shipFields.setAttribute('hidden', '');
        else shipFields.removeAttribute('hidden');
      });
    }

    var printBtn = $('[data-print-order]');
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var statusEl = $('[data-checkout-status]', form);
      var invalid = [];
      $$('[required]', form).forEach(function (f) {
        var ok = f.type === 'checkbox' ? f.checked : String(f.value).trim().length > 0;
        if (f.type === 'email' && ok) ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.value);
        f.setAttribute('aria-invalid', String(!ok));
        if (!ok) invalid.push(f);
      });
      if (invalid.length) {
        status(statusEl, 'Bitte prüfen Sie die markierten Felder (' + invalid.length + ').', 'err');
        invalid[0].focus();
        return;
      }
      if (!Cart.all().length) {
        status(statusEl, 'Ihr Warenkorb ist leer.', 'err');
        return;
      }
      status(statusEl,
        'Ihre Angaben sind vollständig. Die Bestellung kann noch nicht übermittelt werden, weil der Bestell- und Zahlungsprozess noch nicht angebunden ist (POST /api/orders). Sie können die Übersicht ausdrucken oder uns über das Kontaktformular erreichen.',
        'warn');
    });
  }

  /* ------------------ Formulare ohne Backend-Anbindung -------------------- */

  function initStubForms() {
    $$('[data-auth-form]').forEach(function (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var statusEl = $('[data-auth-status]', form);
        var invalid = [];
        $$('[required]', form).forEach(function (f) {
          var ok = f.type === 'checkbox' ? f.checked : String(f.value).trim().length > 0;
          if (f.type === 'email' && ok) ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.value);
          if (f.type === 'password' && ok && f.minLength > 0) ok = f.value.length >= f.minLength;
          f.setAttribute('aria-invalid', String(!ok));
          if (!ok) invalid.push(f);
        });
        if (invalid.length) {
          status(statusEl, 'Bitte prüfen Sie die markierten Felder.', 'err');
          invalid[0].focus();
          return;
        }
        // Passwörter werden bewusst NICHT gespeichert, gehasht oder weiterverarbeitet.
        $$('input[type="password"]', form).forEach(function (f) { f.value = ''; });
        status(statusEl,
          'Eingaben sind gültig. Es gibt aber noch keine Benutzerverwaltung – Login und Registrierung werden serverseitig umgesetzt und sind derzeit nicht angebunden.',
          'warn');
      });
    });

    var contact = $('[data-contact-form]');
    if (contact) {
      contact.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var statusEl = $('[data-contact-status]', contact);
        var invalid = [];
        $$('[required]', contact).forEach(function (f) {
          var ok = f.type === 'checkbox' ? f.checked : String(f.value).trim().length > 0;
          if (f.type === 'email' && ok) ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.value);
          f.setAttribute('aria-invalid', String(!ok));
          if (!ok) invalid.push(f);
        });
        if (invalid.length) {
          status(statusEl, 'Bitte prüfen Sie die markierten Felder.', 'err');
          invalid[0].focus();
          return;
        }
        status(statusEl,
          'Ihre Nachricht ist vollständig, kann aber noch nicht versendet werden: Der Mailversand (POST /api/contact) ist noch nicht angebunden.',
          'warn');
      });
    }
  }

  /* -------------------------------- Teilen -------------------------------- */

  function initShare() {
    $$('[data-copy-link]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var wrap = btn.closest('.share');
        var url = wrap ? wrap.getAttribute('data-share-url') : location.href;
        var done = function () {
          var old = btn.innerHTML;
          btn.innerHTML = 'Link kopiert';
          setTimeout(function () { btn.innerHTML = old; }, 1800);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done, function () { window.prompt('Link kopieren:', url); });
        } else {
          window.prompt('Link kopieren:', url);
        }
      });
    });
  }

  /* --------------------- Merkliste / zuletzt angesehen -------------------- */

  function renderMiniList(container, slugs, emptyText) {
    if (!container) return;
    var found = slugs.map(productBySlug).filter(Boolean).slice(0, 6);
    if (!found.length) { container.innerHTML = '<p class="muted small">' + emptyText + '</p>'; return; }
    container.innerHTML = found.map(function (p) {
      return '<div class="ai-product"><span class="pt"><img src="' + escapeHtml(p.img) + '" alt="" loading="lazy" /></span>' +
        '<span><strong><a href="' + escapeHtml(p.url) + '">' + escapeHtml(p.name) + '</a></strong>' +
        '<small>' + escapeHtml(p.short) + '</small></span></div>';
    }).join('');
  }

  function initAccountLists() {
    renderMiniList($('[data-recently-viewed]'), readStore(SEEN_KEY, []), 'Noch keine Produkte angesehen.');
    renderMiniList($('[data-favorites]'), readStore(FAV_KEY, []), 'Noch keine Artikel vorgemerkt.');
  }

  /* ------------------------------- Berater -------------------------------- */

  function initAdvisor() {
    var root = $('[data-advisor]');
    var configEl = $('[data-advisor-config]');
    if (!root || !configEl) return;

    var cfg = JSON.parse(configEl.textContent);
    var stage = $('[data-advisor-stage]', root);
    var progress = $('[data-advisor-progress]', root);
    var answers = {};
    var stepIndex = 0;

    function drawProgress() {
      progress.innerHTML = cfg.steps.map(function (_, i) {
        return '<span class="' + (i < stepIndex ? 'is-done' : '') + '"></span>';
      }).join('');
    }

    function matches(rule) {
      var when = rule.when || {};
      for (var key in when) {
        if (!Object.prototype.hasOwnProperty.call(when, key)) continue;
        if (when[key].indexOf(answers[key]) === -1) return false;
      }
      return true;
    }

    function resolve() {
      for (var i = 0; i < cfg.rules.length; i++) {
        if (matches(cfg.rules[i])) return cfg.rules[i].result;
      }
      return cfg.fallback;
    }

    function productHtml(slugs) {
      var found = (slugs || []).map(function (s) { return cfg.products[s] ? Object.assign({ slug: s }, cfg.products[s]) : null; })
        .filter(Boolean);
      if (!found.length) return '';
      return '<div class="product-grid">' + found.map(function (p) {
        return '<article class="product-card"><a class="product-media" href="' + escapeHtml(p.url) + '" tabindex="-1" aria-hidden="true">' +
          '<img src="' + escapeHtml(p.img) + '" alt="" loading="lazy" /></a>' +
          '<div class="product-body"><h3><a href="' + escapeHtml(p.url) + '">' + escapeHtml(p.name) + '</a></h3>' +
          '<p class="desc">' + escapeHtml(p.short) + '</p>' +
          '<div class="product-foot"><a class="btn btn-secondary" style="padding:8px 14px;min-height:38px;font-size:0.85rem" href="' +
          escapeHtml(p.url) + '">Zum Artikel</a></div></div></article>';
      }).join('') + '</div>';
    }

    function showResult() {
      stepIndex = cfg.steps.length;
      drawProgress();
      var res = resolve();
      var material = '';
      if (cfg.materialAdvice && answers.einsatz && cfg.materialAdvice[answers.einsatz]) {
        var m = cfg.materialAdvice[answers.einsatz];
        material = '<div class="reco"><span class="for">Empfohlenes Material</span><div class="pick">' +
          escapeHtml(m.pick) + '</div><p>' + escapeHtml(m.text) +
          '</p><p style="margin-top:8px"><a href="/raeucherwissen/va-v2a-v4a/">Unterschiede nachlesen</a></p></div>';
      }
      var links = (res.links || []).map(function (l) {
        return '<a class="btn btn-secondary" href="' + escapeHtml(l.href) + '">' + escapeHtml(l.label) + '</a>';
      }).join(' ');

      stage.innerHTML = '<div class="advisor-result">' +
        '<div class="result-head"><h3>Unsere Empfehlung: ' + escapeHtml(res.title) + '</h3><p>' + escapeHtml(res.text) + '</p></div>' +
        (material ? '<div class="reco-grid">' + material + '</div>' : '') +
        productHtml(res.products) +
        '<div class="advisor-actions">' + links +
        '<button type="button" class="btn btn-ghost" data-advisor-restart>Neu starten</button></div>' +
        '</div>';

      $('[data-advisor-restart]', stage).addEventListener('click', function () {
        answers = {}; stepIndex = 0; drawStep();
      });
    }

    function drawStep() {
      if (stepIndex >= cfg.steps.length) { showResult(); return; }
      drawProgress();
      var step = cfg.steps[stepIndex];
      stage.innerHTML = '<p class="advisor-question">' + escapeHtml(step.question) + '</p>' +
        '<div class="advisor-options">' + step.options.map(function (o) {
          return '<button type="button" class="advisor-option" data-value="' + escapeHtml(o.value) + '">' +
            escapeHtml(o.label) + (o.hint ? '<small>' + escapeHtml(o.hint) + '</small>' : '') + '</button>';
        }).join('') + '</div>' +
        (stepIndex > 0 ? '<p style="margin-top:16px"><button type="button" class="btn btn-ghost" data-advisor-back>← Zurück</button></p>' : '');

      $$('[data-value]', stage).forEach(function (btn) {
        btn.addEventListener('click', function () {
          answers[step.id] = btn.getAttribute('data-value');
          stepIndex++;
          drawStep();
        });
      });
      var back = $('[data-advisor-back]', stage);
      if (back) back.addEventListener('click', function () { stepIndex = Math.max(0, stepIndex - 1); drawStep(); });
    }

    drawStep();
  }

  /* ------------------------------ Initialisierung ------------------------- */

  function init() {
    Cart.refreshBadge();
    initNav();
    initSearch();
    initSearchPage();
    initGallery();
    initProductPage();
    renderCartPage();
    initVoucher();
    initCheckout();
    initStubForms();
    initShare();
    initAccountLists();
    initAdvisor();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.RH24App = { Cart: Cart, money: money, productBySlug: productBySlug };
})();
