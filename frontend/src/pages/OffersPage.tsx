import {FormEvent, useEffect, useMemo, useState} from 'react'
import {
  Ban,
  Check,
  Copy,
  Download,
  Mail,
  Plus,
  Search,
  ShoppingCart,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import {api, downloadFile, formatDateTime, money} from '../lib/api'
import type {Customer, Offer, Product} from '../types'
import {Modal} from '../components/Modal'
import {ProductCombobox} from '../components/ProductCombobox'
import {useToast} from '../components/Toast'
import {useAuth} from '../lib/auth'
import {darfVerwalten} from '../lib/roles'
import {heuteIso} from '../lib/datum'
import {useLocation, useNavigate} from 'react-router-dom'

type CatalogProduct = Product & {
  category?:string|null
  price?:{amount_cents?:number}|null
}

type ItemForm = {product_id:string; quantity:number; price_eur:string; search:string}
type OfferEmployee = {id:string; display_name:string}

const STATUS_OPTIONS: {value:string; label:string}[] = [
  {value:'', label:'Alle Status'},
  {value:'draft', label:'Entwurf'},
  {value:'sent', label:'Versendet'},
  {value:'accepted', label:'Angenommen'},
  {value:'rejected', label:'Abgelehnt'},
  {value:'expired', label:'Abgelaufen'},
  {value:'converted', label:'In Verkauf umgewandelt'},
]

function customerName(c:Customer){
  const any:any = c
  return any.full_name || [any.first_name, any.last_name].filter(Boolean).join(' ') || 'Kunde'
}

function productPriceCents(p:CatalogProduct):number|null{
  return typeof p.price?.amount_cents === 'number' ? p.price.amount_cents : null
}

export function OffersPage(){
  const toast = useToast()
  const {me} = useAuth()
  const isTeamLeader = darfVerwalten(me?.role)
  const location = useLocation()
  const navigate = useNavigate()

  const [rows, setRows] = useState<Offer[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [employees, setEmployees] = useState<OfferEmployee[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  const [customerSearch, setCustomerSearch] = useState('')
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false)

  const emptyItem = ():ItemForm => ({product_id:'', quantity:1, price_eur:'', search:''})

  const [form, setForm] = useState({
    customer_id:'',
    employee_id:'',
    valid_until:'',
    discount_percent:0,
    notes:'',
    items:[emptyItem()] as ItemForm[],
  })

  async function load(){
    const [offerData, customerData, productData] = await Promise.all([
      api<Offer[]>('/offers'),
      api<Customer[]>('/customers'),
      api<CatalogProduct[]>('/products?include_unverified=true'),
    ])
    setRows(offerData)
    setCustomers(customerData)
    setProducts(productData)
  }

  useEffect(() => { load().catch(console.error) }, [])

  useEffect(() => {
    if (!isTeamLeader) { setEmployees([]); return }
    api<OfferEmployee[]>('/team/employees').then(setEmployees).catch(console.error)
  }, [isTeamLeader])

  useEffect(() => {
    const state = location.state as any
    if (state?.openCreate) {
      resetForm()
      if (state.customerId) {
        setForm(current => ({...current, customer_id: state.customerId}))
        setCustomerSearch(state.customerName || '')
      }
      setOpen(true)
      navigate(location.pathname, {replace:true, state:null})
    }
  }, [location.state])

  function resetForm(){
    setForm({customer_id:'', employee_id:'', valid_until:'', discount_percent:0, notes:'', items:[emptyItem()]})
    setCustomerSearch('')
    setCustomerSearchOpen(false)
  }

  function addItem(){
    setForm(current => ({...current, items:[...current.items, emptyItem()]}))
  }

  function removeItem(index:number){
    setForm(current => current.items.length === 1 ? current : ({...current, items: current.items.filter((_, i) => i !== index)}))
  }

  function updateItem(index:number, changes:Partial<ItemForm>){
    setForm(current => ({...current, items: current.items.map((item, i) => i === index ? {...item, ...changes} : item)}))
  }

  function chooseProduct(index:number, product:CatalogProduct){
    const cents = productPriceCents(product)
    updateItem(index, {product_id: product.id, search: product.name, price_eur: cents === null ? '' : (cents / 100).toFixed(2)})
  }

  function customerMatches(query:string){
    const q = query.trim().toLowerCase()
    return customers.filter(c => {
      const any:any = c
      const text = [customerName(c), any.phone, any.email, any.city].filter(Boolean).join(' ').toLowerCase()
      return !q || text.includes(q)
    }).slice(0, 8)
  }

  function productMatches(query:string){
    const q = query.trim().toLowerCase()
    // Die alte Obergrenze von 8/10 stammt aus der Zeit, als die Liste im
    // Formular stand und jede Zeile die Felder darunter weggeschoben hat.
    // Sie scrollt jetzt in sich selbst; die Suchregel bleibt dieselbe.
    if (!q) return products.slice(0, 50)
    return products.filter(p => [p.name, p.category, p.description].filter(Boolean).join(' ').toLowerCase().includes(q)).slice(0, 50)
  }

  function selectedProduct(item:ItemForm){
    return products.find(p => p.id === item.product_id)
  }

  const subtotalCents = useMemo(() => form.items.reduce((sum, item) => {
    const price = Number(item.price_eur.replace(',', '.'))
    const qty = Number(item.quantity)
    if (!Number.isFinite(price) || !Number.isFinite(qty)) return sum
    return sum + Math.round(price * 100 * qty)
  }, 0), [form.items])

  const discountCents = Math.round(subtotalCents * form.discount_percent / 100)
  const totalCents = subtotalCents - discountCents

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(offer => {
      if (statusFilter && offer.status !== statusFilter) return false
      if (!q) return true
      const text = [offer.number, offer.customer_name, offer.employee_name, offer.notes].filter(Boolean).join(' ').toLowerCase()
      return text.includes(q)
    })
  }, [rows, statusFilter, search])

  async function save(event:FormEvent){
    event.preventDefault()
    if (busy) return
    if (!form.customer_id) { toast('Bitte einen Kunden auswählen.'); return }
    if (isTeamLeader && !form.employee_id) { toast('Bitte einen Mitarbeiter auswählen.'); return }
    const invalid = form.items.some(item => !item.product_id || item.quantity <= 0 || !item.price_eur)
    if (invalid) { toast('Bitte bei jedem Eintrag ein Produkt auswählen.'); return }

    setBusy(true)
    try {
      await api('/offers', {
        method:'POST',
        body: JSON.stringify({
          customer_id: form.customer_id,
          employee_id: isTeamLeader ? form.employee_id : null,
          valid_until: form.valid_until || null,
          discount_percent: form.discount_percent,
          notes: form.notes || null,
          items: form.items.map(item => ({
            product_id: item.product_id,
            quantity: Number(item.quantity),
            unit_price_cents: Math.round(Number(item.price_eur.replace(',', '.')) * 100),
          })),
        }),
      })
      toast('Angebot gespeichert.')
      setOpen(false)
      resetForm()
      await load()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Fehler', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function run(offer:Offer, action:string, fn:() => Promise<void>){
    setActionBusy(offer.id + action)
    try {
      await fn()
      await load()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Aktion fehlgeschlagen.', 'error')
    } finally {
      setActionBusy(null)
    }
  }

  async function send(offer:Offer){
    await run(offer, 'send', async () => {
      await api(`/offers/${offer.id}/send`, {method:'POST'})
      toast('Angebot als versendet markiert.')
    })
  }

  async function accept(offer:Offer){
    await run(offer, 'accept', async () => {
      await api(`/offers/${offer.id}/accept`, {method:'POST'})
      toast('Angebot als angenommen markiert.')
    })
  }

  async function reject(offer:Offer){
    const reason = window.prompt('Grund für die Ablehnung (optional):', '')
    if (reason === null) return
    await run(offer, 'reject', async () => {
      await api(`/offers/${offer.id}/reject`, {method:'POST', body: JSON.stringify({reason: reason || null})})
      toast('Angebot als abgelehnt markiert.')
    })
  }

  async function convert(offer:Offer){
    if (!window.confirm(`Angebot ${offer.number} in einen Verkauf umwandeln?\n\nProdukte, Mengen und Preise werden ohne erneute Eingabe übernommen.`)) return
    await run(offer, 'convert', async () => {
      await api(`/offers/${offer.id}/convert-to-sale`, {method:'POST', body: JSON.stringify({})})
      toast('Angebot wurde in einen Verkauf umgewandelt.')
    })
  }

  async function duplicate(offer:Offer){
    await run(offer, 'duplicate', async () => {
      await api(`/offers/${offer.id}/duplicate`, {method:'POST'})
      toast('Angebot wurde dupliziert.')
    })
  }

  async function remove(offer:Offer){
    if (!window.confirm(`Angebot ${offer.number} löschen?`)) return
    await run(offer, 'delete', async () => {
      await api(`/offers/${offer.id}`, {method:'DELETE'})
      toast('Angebot wurde gelöscht.')
    })
  }

  async function emailOffer(offer:Offer){
    await run(offer, 'email', async () => {
      await api(`/offers/${offer.id}/email`, {method:'POST', body: JSON.stringify({})})
      toast('Angebot wurde per E-Mail versendet.')
    })
  }

  async function pdf(offer:Offer){
    try {
      await downloadFile(`/offers/${offer.id}/pdf`, `${offer.number}.pdf`)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'PDF konnte nicht erzeugt werden.', 'error')
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Angebote</h1>
          <p>Aus einem Kunden erstellt, mit Positionen, Gültigkeit und Statuslauf bis zum Verkauf.</p>
        </div>
        <div className="page-head-actions">
          <button className="primary" type="button" onClick={() => { resetForm(); setOpen(true) }}>
            <Plus size={18} />
            Angebot erstellen
          </button>
        </div>
      </div>

      <section className="sales-filter-panel card">
        <div className="sales-filter-search">
          <Search size={17} />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Angebote suchen – Nummer, Kunde, Mitarbeiter …" />
        </div>

        <label>
          Status
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </label>

        <div className="sales-filter-result">
          <strong>{filteredRows.length}</strong> {filteredRows.length === 1 ? 'Angebot' : 'Angebote'}
        </div>
      </section>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Nummer</th>
              <th>Kunde</th>
              <th>Gültig bis</th>
              <th>Betrag</th>
              <th>Status</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr><td colSpan={6} className="empty">Keine Angebote für diese Auswahl gefunden.</td></tr>
            )}
            {filteredRows.map(offer => (
              <tr key={offer.id}>
                <td>{offer.number}</td>
                <td>{offer.customer_name}</td>
                <td>{offer.valid_until ? new Intl.DateTimeFormat('de-DE').format(new Date(offer.valid_until)) : '–'}</td>
                <td>{money(offer.total_cents)}</td>
                <td><span className={`offer-status offer-status-${offer.status}`}>{offer.status_label}</span></td>
                <td>
                  <div className="offer-actions">
                    <button type="button" className="icon-button" title="Als PDF herunterladen" onClick={() => pdf(offer)}>
                      <Download size={16} />
                    </button>
                    {offer.can_send && (
                      <button type="button" className="icon-button" title="Per E-Mail versenden" disabled={actionBusy === offer.id + 'email'} onClick={() => emailOffer(offer)}>
                        <Mail size={16} />
                      </button>
                    )}
                    {offer.can_send && (
                      <button type="button" className="icon-button" title="Als versendet markieren" disabled={actionBusy === offer.id + 'send'} onClick={() => send(offer)}>
                        <Send size={16} />
                      </button>
                    )}
                    {offer.can_accept && (
                      <button type="button" className="icon-button" title="Annehmen" disabled={actionBusy === offer.id + 'accept'} onClick={() => accept(offer)}>
                        <Check size={16} />
                      </button>
                    )}
                    {offer.can_reject && (
                      <button type="button" className="icon-button" title="Ablehnen" disabled={actionBusy === offer.id + 'reject'} onClick={() => reject(offer)}>
                        <Ban size={16} />
                      </button>
                    )}
                    {offer.can_convert && (
                      <button type="button" className="icon-button" title="In Verkauf umwandeln" disabled={actionBusy === offer.id + 'convert'} onClick={() => convert(offer)}>
                        <ShoppingCart size={16} />
                      </button>
                    )}
                    <button type="button" className="icon-button" title="Duplizieren" disabled={actionBusy === offer.id + 'duplicate'} onClick={() => duplicate(offer)}>
                      <Copy size={16} />
                    </button>
                    {offer.can_delete && (
                      <button type="button" className="icon-button" title="Löschen" disabled={actionBusy === offer.id + 'delete'} onClick={() => remove(offer)}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal onClose={() => setOpen(false)} title="Angebot erstellen" closeDisabled={busy}>
          <form className="sale-fast-form" onSubmit={save}>
            <div className="sale-base-grid">
              {isTeamLeader && (
                <label>
                  Mitarbeiter
                  <select required value={form.employee_id} onChange={e => setForm({...form, employee_id: e.target.value})}>
                    <option value="">Mitarbeiter auswählen</option>
                    {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}
                  </select>
                </label>
              )}

              <label className="sale-customer-label">
                Kunde
                <div className="sale-customer-search">
                  <Search size={17} />
                  <input
                    type="text"
                    value={customerSearch}
                    placeholder="Kunde suchen ..."
                    autoComplete="off"
                    onFocus={() => setCustomerSearchOpen(true)}
                    onChange={e => {
                      setCustomerSearch(e.target.value)
                      setCustomerSearchOpen(true)
                      setForm(current => ({...current, customer_id:''}))
                    }}
                  />
                  {customerSearch && (
                    <button type="button" className="sale-customer-clear" onClick={() => { setCustomerSearch(''); setCustomerSearchOpen(true); setForm(current => ({...current, customer_id:''})) }}>
                      <X size={15} />
                    </button>
                  )}
                  {customerSearchOpen && (
                    <div className="sale-customer-results">
                      {customerMatches(customerSearch).length === 0 ? (
                        <div className="sale-customer-empty">Kein Kunde gefunden</div>
                      ) : customerMatches(customerSearch).map(c => (
                        <button
                          type="button"
                          key={c.id}
                          className={form.customer_id === c.id ? 'selected' : ''}
                          onClick={() => {
                            setForm(current => ({...current, customer_id: c.id}))
                            setCustomerSearch(customerName(c))
                            setCustomerSearchOpen(false)
                          }}
                        >
                          <span className="sale-customer-result-icon">
                            {form.customer_id === c.id ? <Check size={15} /> : <Search size={14} />}
                          </span>
                          <span className="sale-customer-result-text">
                            <strong>{customerName(c)}</strong>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </label>

              <label>
                Gültig bis
                <input type="date" value={form.valid_until} min={heuteIso()} onChange={e => setForm({...form, valid_until: e.target.value})} />
              </label>

              {isTeamLeader && (
                <label>
                  Rabatt (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.discount_percent}
                    onChange={e => setForm({...form, discount_percent: Math.min(100, Math.max(0, Number(e.target.value) || 0))})}
                  />
                </label>
              )}
            </div>

            <div className="sale-products-head">
              <div>
                <h3>Produkte</h3>
                <p>Einfach Produktname, Modell oder Kategorie suchen.</p>
              </div>
              <button type="button" onClick={addItem}>
                <Plus size={16} />
                Weiteres Produkt
              </button>
            </div>

            <div className="sale-product-list">
              {form.items.map((item, index) => {
                const selected = selectedProduct(item)
                const matches = productMatches(item.search)
                return (
                  <div className="sale-product-entry" key={index}>
                    <div className="sale-product-number">{index + 1}</div>
                    <div className="sale-product-main">
                      <ProductCombobox
                        label="Produkt suchen"
                        placeholder="z. B. VK7, SP7, Polster, Roboter…"
                        value={item.search}
                        options={matches.map(p => ({
                          id: p.id,
                          name: p.name,
                          category: p.category || 'Produkt',
                          price: productPriceCents(p) === null
                            ? null
                            : money(productPriceCents(p) as number),
                        }))}
                        onChange={wert => updateItem(index, {search: wert, product_id:'', price_eur:''})}
                        onSelect={eintrag => {
                          const produkt = products.find(p => p.id === eintrag.id)
                          if (produkt) chooseProduct(index, produkt)
                        }}
                        onClear={() => updateItem(index, {search:'', product_id:'', price_eur:''})}
                      />

                      <div className="sale-product-values">
                        <label>
                          Menge
                          <input type="number" min={1} step={1} value={item.quantity} onChange={e => updateItem(index, {quantity: Math.max(1, Number(e.target.value) || 1)})} />
                        </label>
                        <label>
                          Preis pro Stück
                          <div className="sale-price-input">
                            <input value={item.price_eur} inputMode="decimal" placeholder="0,00" onChange={e => updateItem(index, {price_eur: e.target.value})} required />
                            <span>€</span>
                          </div>
                        </label>
                      </div>

                      {form.items.length > 1 && (
                        <button type="button" className="sale-remove-product" onClick={() => removeItem(index)}>
                          <Trash2 size={15} />
                          Produkt entfernen
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <label>
              Notizen
              <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Optional" rows={3} />
            </label>

            <div className="sale-fast-total">
              <span>Zwischensumme</span>
              <strong>{money(subtotalCents)}</strong>
            </div>
            {form.discount_percent > 0 && (
              <div className="sale-fast-total">
                <span>Rabatt ({form.discount_percent}%)</span>
                <strong>−{money(discountCents)}</strong>
              </div>
            )}
            <div className="sale-fast-total">
              <span>Gesamtbetrag</span>
              <strong>{money(totalCents)}</strong>
            </div>

            <div className="form-actions">
              <button type="button" onClick={() => setOpen(false)} disabled={busy}>Abbrechen</button>
              <button className="primary" type="submit" disabled={busy}>{busy ? 'Speichern…' : 'Angebot speichern'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
