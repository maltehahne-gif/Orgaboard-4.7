import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  Check,
  ChevronDown,
  Download,
  Plus,
  Search,
  Ban,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'

import {
  api,
  downloadFile,
  formatDateTime,
  money,
} from '../lib/api'

import type {
  Customer,
  Product,
  Sale,
} from '../types'

import {Modal} from '../components/Modal'
import {ProductCombobox} from '../components/ProductCombobox'
import {useToast} from '../components/Toast'
import {useAuth} from '../lib/auth'
import {useLocation,useNavigate} from 'react-router-dom'


type CatalogProduct = Product & {
  category?:string | null
  description?:string | null

  price?:{
    amount_cents?:number
    currency?:string
  } | null

  prices?:Array<{
    amount_cents?:number
    currency?:string
  }>

  technical?:{
    article_number?:string
    k70_group?:string
    available?:boolean
  }
}


type SaleItemForm = {
  product_id:string
  quantity:number
  price_eur:string
  search:string
}


type SalesEmployeeOption = {
  id:string
  display_name:string
}


const dt=()=>(
  new Date()
    .toISOString()
    .slice(0,16)
)


function productPriceCents(
  product:CatalogProduct
):number|null{

  const direct=
    product.price?.amount_cents

  if(typeof direct==='number'){
    return direct
  }


  if(Array.isArray(product.prices)){

    const found=
      product.prices.find(
        price=>
          typeof price?.amount_cents
          === 'number'
      )

    if(
      found
      && typeof found.amount_cents
        === 'number'
    ){
      return found.amount_cents
    }
  }

  return null
}


function productPriceText(
  product:CatalogProduct
){

  const cents=
    productPriceCents(product)

  if(cents===null){
    return 'Preis nicht hinterlegt'
  }

  return money(cents)
}


function customerName(
  customer:Customer
){

  const c:any=customer

  if(c.full_name){
    return c.full_name
  }

  return [
    c.first_name,
    c.last_name,
  ]
    .filter(Boolean)
    .join(' ')
    || c.name
    || 'Kunde'
}


export function SalesPage(){

  const toast=useToast()

  const {me}=useAuth()

  const isTeamLeader=
    me?.role==='TEAM_LEADER'

  const location=useLocation()
  const navigate=useNavigate()

  const [rows,setRows]=
    useState<Sale[]>([])

  const [customers,setCustomers]=
    useState<Customer[]>([])

  const [products,setProducts]=
    useState<CatalogProduct[]>([])


  const [employees,setEmployees]=
    useState<SalesEmployeeOption[]>([])

  const [salesSearch,setSalesSearch]=
    useState('')

  const [salesPeriod,setSalesPeriod]=
    useState('all')

  const [salesFrom,setSalesFrom]=
    useState('')

  const [salesTo,setSalesTo]=
    useState('')

  const [salesEmployee,setSalesEmployee]=
    useState('')

  const [salesProduct,setSalesProduct]=
    useState('')


  const [open,setOpen]=
    useState(false)

  const [busy,setBusy]=
    useState(false)

  const [exporting,setExporting]=
    useState(false)

  const [customerSearch,setCustomerSearch]=
    useState('')

  const [customerSearchOpen,setCustomerSearchOpen]=
    useState(false)


  const emptyItem=():SaleItemForm=>({
    product_id:'',
    quantity:1,
    price_eur:'',
    search:'',
  })


  const [form,setForm]=useState({
    customer_id:'',
    sold_at:dt(),
    channel:'other',
    notes:'',
    items:[
      emptyItem(),
    ] as SaleItemForm[],
  })


  async function load(){

    const [
      salesData,
      customerData,
      productData,
    ]=await Promise.all([

      api<Sale[]>('/sales'),

      api<Customer[]>(
        '/customers'
      ),

      api<CatalogProduct[]>(
        '/products?include_unverified=true'
      ),

    ])

    setRows(salesData)
    setCustomers(customerData)
    setProducts(productData)
  }


  useEffect(()=>{
    load().catch(console.error)
  },[])


  /* Sales employee filters */
  useEffect(()=>{

    if(!isTeamLeader){
      setEmployees([])
      setSalesEmployee('')
      return
    }

    api<SalesEmployeeOption[]>(
      '/team/employees'
    )
      .then(setEmployees)
      .catch(console.error)

  },[isTeamLeader])


  function resetForm(){

    setForm({
      customer_id:'',
      sold_at:dt(),
      channel:'other',
      notes:'',
      items:[
        emptyItem(),
      ],
    })

    setCustomerSearch('')
    setCustomerSearchOpen(false)
  }


  useEffect(()=>{
    const state=location.state as any
    if(state?.openCreate){
      resetForm()
      // Aus der Kundenakte heraus ist der Kunde schon bekannt - ihn dort
      // erneut zu suchen waere ein ueberfluessiger Schritt.
      if(state.customerId){
        setForm(current=>({...current,customer_id:state.customerId}))
        setCustomerSearch(state.customerName || '')
      }
      setOpen(true)
      navigate(location.pathname,{replace:true,state:null})
    }
  },[location.state])


  function addItem(){

    setForm(current=>({
      ...current,

      items:[
        ...current.items,
        emptyItem(),
      ],
    }))
  }


  function removeItem(
    index:number
  ){

    setForm(current=>{

      if(current.items.length===1){
        return current
      }

      return {
        ...current,

        items:
          current.items.filter(
            (_,i)=>i!==index
          ),
      }
    })
  }


  function updateItem(
    index:number,
    changes:Partial<SaleItemForm>
  ){

    setForm(current=>({
      ...current,

      items:
        current.items.map(
          (item,i)=>
            i===index
              ? {
                  ...item,
                  ...changes,
                }
              : item
        ),
    }))
  }


  function chooseProduct(
    index:number,
    product:CatalogProduct
  ){

    const cents=
      productPriceCents(product)

    updateItem(
      index,
      {
        product_id:
          product.id,

        search:
          product.name,

        price_eur:
          cents===null
            ? ''
            : (
                cents / 100
              ).toFixed(2),
      }
    )
  }


  function customerMatches(
    search:string
  ){

    const query=
      search
        .trim()
        .toLowerCase()

    const list=
      customers.filter(customer=>{

        const c:any=customer

        const text=[
          customerName(customer),
          c.phone,
          c.email,
          c.street,
          c.house_number,
          c.postal_code,
          c.city,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return !query
          ||text.includes(query)
      })

    return list.slice(0,8)
  }


  function chooseCustomer(
    customer:Customer
  ){

    setForm(current=>({
      ...current,
      customer_id:customer.id,
    }))

    setCustomerSearch(
      customerName(customer)
    )

    setCustomerSearchOpen(false)
  }


  function productMatches(
    search:string
  ){

    const query=
      search
        .trim()
        .toLowerCase()

    /* Die Obergrenze lag bei 8 bzw. 10 - sie stammt aus der Zeit, als die
       Liste im Formular stand und jede weitere Zeile die Felder darunter
       weggeschoben hat. Die Liste scrollt jetzt in sich selbst, also darf
       sie so viele Treffer zeigen, wie man tatsaechlich sucht. Die
       Suchregel darunter ist unveraendert. */
    if(!query){
      return products.slice(0,50)
    }


    return products
      .filter(product=>{

        const text=[
          product.name,
          product.category,
          product.description,
          product.technical?.article_number,
          product.technical?.k70_group,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return text.includes(query)
      })
      .slice(0,50)
  }


  function selectedProduct(
    item:SaleItemForm
  ){

    return products.find(
      product=>
        product.id
        === item.product_id
    )
  }


  const filteredSales=
    useMemo(()=>{

      const normalize=(value:any)=>
        String(value||'')
          .trim()
          .toLowerCase()

      const query=
        normalize(salesSearch)

      const productQuery=
        normalize(salesProduct)

      const now=
        new Date()

      let periodStart:
        Date|null=null

      let periodEnd:
        Date|null=null


      if(salesPeriod==='today'){

        periodStart=
          new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
          )

        periodEnd=
          new Date(periodStart)

        periodEnd.setDate(
          periodEnd.getDate()+1
        )
      }


      if(salesPeriod==='week'){

        periodStart=
          new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
          )

        const weekday=
          (periodStart.getDay()+6)%7

        periodStart.setDate(
          periodStart.getDate()-weekday
        )

        periodEnd=
          new Date(periodStart)

        periodEnd.setDate(
          periodEnd.getDate()+7
        )
      }


      if(salesPeriod==='month'){

        periodStart=
          new Date(
            now.getFullYear(),
            now.getMonth(),
            1,
          )

        periodEnd=
          new Date(
            now.getFullYear(),
            now.getMonth()+1,
            1,
          )
      }


      if(
        salesPeriod==='custom'
        && salesFrom
      ){

        periodStart=
          new Date(
            `${salesFrom}T00:00:00`
          )
      }


      if(
        salesPeriod==='custom'
        && salesTo
      ){

        periodEnd=
          new Date(
            `${salesTo}T00:00:00`
          )

        periodEnd.setDate(
          periodEnd.getDate()+1
        )
      }


      return rows.filter(sale=>{

        const current:any=sale

        const soldAt=
          new Date(current.sold_at)

        if(
          periodStart
          && soldAt<periodStart
        ){
          return false
        }

        if(
          periodEnd
          && soldAt>=periodEnd
        ){
          return false
        }


        if(
          isTeamLeader
          && salesEmployee
          && current.employee_id
            !==salesEmployee
        ){
          return false
        }


        const customer=
          customers.find(
            item=>
              item.id
              ===current.customer_id
          )

        const itemNames=
          (current.items||[])
            .map((item:any)=>{

              const product=
                products.find(
                  entry=>
                    entry.id
                    ===item.product_id
                )

              return (
                item.name
                ||product?.name
                ||''
              )
            })


        const itemCategories=
          (current.items||[])
            .map((item:any)=>{

              const product=
                products.find(
                  entry=>
                    entry.id
                    ===item.product_id
                )

              return product?.category||''
            })


        if(productQuery){

          const productText=
            normalize([
              ...itemNames,
              ...itemCategories,
            ].join(' '))

          if(
            !productText.includes(
              productQuery
            )
          ){
            return false
          }
        }


        if(query){

          const searchText=
            normalize([
              current.customer_name,
              customer
                ?customerName(customer)
                :'',
              current.notes,
              current.channel,
              ...itemNames,
              ...itemCategories,
            ].join(' '))

          if(
            !searchText.includes(query)
          ){
            return false
          }
        }


        return true
      })

    },[
      rows,
      customers,
      products,
      salesSearch,
      salesPeriod,
      salesFrom,
      salesTo,
      salesEmployee,
      salesProduct,
      isTeamLeader,
    ])


  function resetSalesFilters(){

    setSalesSearch('')
    setSalesPeriod('all')
    setSalesFrom('')
    setSalesTo('')
    setSalesEmployee('')
    setSalesProduct('')
  }


  const totalCents=
    useMemo(()=>{

      return form.items.reduce(
        (sum,item)=>{

          const price=
            Number(
              item.price_eur
                .replace(',','.')
            )

          const quantity=
            Number(item.quantity)

          if(
            !Number.isFinite(price)
            || !Number.isFinite(quantity)
          ){
            return sum
          }

          return (
            sum
            + Math.round(
                price
                * 100
                * quantity
              )
          )
        },
        0
      )

    },[
      form.items,
    ])


  async function save(
    event:FormEvent
  ){

    event.preventDefault()

    if(busy)return


    const invalid=
      form.items.some(
        item=>
          !item.product_id
          || item.quantity<=0
          || !item.price_eur
      )


    if(invalid){

      toast(
        'Bitte bei jedem Eintrag ein Produkt auswählen.'
      )

      return
    }


    setBusy(true)

    try{

      await api(
        '/sales',
        {
          method:'POST',

          body:JSON.stringify({

            customer_id:
              form.customer_id
              || null,

            sold_at:
              new Date(
                form.sold_at
              ).toISOString(),

            channel:
              form.channel,

            notes:
              form.notes
              || null,

            items:
              form.items.map(
                item=>({

                  product_id:
                    item.product_id,

                  quantity:
                    Number(
                      item.quantity
                    ),

                  unit_price_cents:
                    Math.round(
                      Number(
                        item.price_eur
                          .replace(',','.')
                      )
                      * 100
                    ),
                })
              ),
          }),
        }
      )


      toast(
        'Verkauf gespeichert. Umsatz und Einheiten wurden aktualisiert.'
      )

      setOpen(false)
      resetForm()

      await load()

    }catch(error){

      toast(
        error instanceof Error
          ? error.message
          : 'Fehler'
      )

    }finally{
      setBusy(false)
    }
  }


  async function exportExcel(){
    setExporting(true)
    try{
      const query=filteredSales
        .map(sale=>`ids=${encodeURIComponent(sale.id)}`)
        .join('&')
      await downloadFile(
        `/sales/export.xlsx${query?`?${query}`:''}`,
        'Verkaufsdaten.xlsx',
      )
    }catch(error){
      toast(
        error instanceof Error
          ? error.message
          : 'Export fehlgeschlagen.',
        'error'
      )
    }finally{
      setExporting(false)
    }
  }


  async function wiederherstellen(
    sale:Sale
  ){

    if(!window.confirm(
      'Storno zurücknehmen?\n\n'
      +'Der Verkauf zählt danach wieder in allen Auswertungen.'
    ))return

    try{

      await api(
        `/sales/${sale.id}/restore`,
        {method:'POST'}
      )

      toast('Storno wurde zurückgenommen.')
      await load()

    }catch(error){

      toast(
        error instanceof Error
          ? error.message
          : 'Der Verkauf konnte nicht wiederhergestellt werden.',
        'error'
      )
    }
  }


  async function stornieren(
    sale:Sale
  ){

    const grund=window.prompt(
      'Verkauf stornieren?\n\n'
      +'Der Verkauf bleibt mit allen Angaben erhalten, zählt aber '
      +'in keiner Auswertung mehr.\n\n'
      +'Grund (optional):',
      ''
    )

    // Abbrechen liefert null; ein leerer Text ist ein bewusstes
    // "ohne Angabe" und darf durchgehen.
    if(grund===null){
      return
    }

    try{

      await api(
        `/sales/${sale.id}/cancel`,
        {
          method:'POST',
          body:JSON.stringify({reason:grund||null}),
        }
      )

      toast('Verkauf wurde storniert.')
      await load()

    }catch(error){

      toast(
        error instanceof Error
          ? error.message
          : 'Der Verkauf konnte nicht storniert werden.',
        'error'
      )
    }
  }


  return(
    <div className="page">

      <div className="page-head">

        <div>
          <h1>Verkäufe</h1>

          <p>
            Mehrere Produkte pro Verkauf;
            Kennzahlen werden automatisch berechnet.
          </p>
        </div>


        <div className="page-head-actions">

          <button
            type="button"
            disabled={exporting}
            onClick={exportExcel}
            title="Aktuell gefilterte Verkäufe als Excel-Datei herunterladen"
          >
            <Download size={18}/>
            {exporting?'Export läuft …':'Excel exportieren'}
          </button>

          <button
            className="primary"
            type="button"
            onClick={()=>{
              resetForm()
              setOpen(true)
            }}
          >
            <Plus size={18}/>
            Verkauf erfassen
          </button>

        </div>

      </div>


      <section className="sales-filter-panel card">

        <div className="sales-filter-search">

          <Search size={17}/>

          <input
            type="search"
            value={salesSearch}
            onChange={event=>
              setSalesSearch(
                event.target.value
              )
            }
            placeholder="Verkäufe suchen – Kunde, Produkt, Notiz …"
          />

        </div>


        <label>
          Zeitraum

          <select
            value={salesPeriod}
            onChange={event=>
              setSalesPeriod(
                event.target.value
              )
            }
          >
            <option value="all">
              Alle
            </option>

            <option value="today">
              Heute
            </option>

            <option value="week">
              Diese Woche
            </option>

            <option value="month">
              Dieser Monat
            </option>

            <option value="custom">
              Eigener Zeitraum
            </option>
          </select>
        </label>


        {salesPeriod==='custom'&&
          <>
            <label>
              Von

              <input
                type="date"
                value={salesFrom}
                onChange={event=>
                  setSalesFrom(
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Bis

              <input
                type="date"
                value={salesTo}
                min={salesFrom||undefined}
                onChange={event=>
                  setSalesTo(
                    event.target.value
                  )
                }
              />
            </label>
          </>
        }


        {isTeamLeader&&
          <label>
            Mitarbeiter

            <select
              value={salesEmployee}
              onChange={event=>
                setSalesEmployee(
                  event.target.value
                )
              }
            >
              <option value="">
                Alle Mitarbeiter
              </option>

              {employees.map(
                employee=>
                  <option
                    key={employee.id}
                    value={employee.id}
                  >
                    {employee.display_name}
                  </option>
              )}
            </select>
          </label>
        }


        <label>
          Produkt

          <input
            type="search"
            list="sales-product-filter-list"
            value={salesProduct}
            onChange={event=>
              setSalesProduct(
                event.target.value
              )
            }
            placeholder="Alle Produkte"
          />

          <datalist id="sales-product-filter-list">
            {products.map(
              product=>
                <option
                  key={product.id}
                  value={product.name}
                />
            )}
          </datalist>
        </label>


        <button
          type="button"
          className="sales-filter-reset"
          onClick={resetSalesFilters}
        >
          <X size={16}/>
          Filter zurücksetzen
        </button>


        <div className="sales-filter-result">
          <strong>
            {filteredSales.length}
          </strong>
          {' '}
          {filteredSales.length===1
            ?'Verkauf'
            :'Verkäufe'
          }
        </div>

      </section>


      <div className="table-card">

        <table>

          <thead>
            <tr>
              <th>Datum</th>
              <th>Kunde</th>
              <th>Produkte</th>
              <th>Umsatz</th>
              <th>Aktion</th>
            </tr>
          </thead>


          <tbody>

            {filteredSales.length===0 && (
              <tr>
                <td
                  colSpan={5}
                  className="empty"
                >
                  Keine Verkäufe für diese Auswahl gefunden.
                </td>
              </tr>
            )}


            {filteredSales.map(sale=>{

              const s:any=sale

              const customer=
                customers.find(
                  c=>c.id===s.customer_id
                )

              const units=
                Number(s.units || 0)


              return(
                <tr key={sale.id}>

                  <td>
                    {formatDateTime(
                      s.sold_at
                    )}
                  </td>

                  <td>
                    {customer
                      ? customerName(customer)
                      : '—'
                    }
                  </td>

                  <td>
                    {units}
                    {' '}
                    {units===1
                      ? 'Einheit'
                      : 'Einheiten'
                    }
                  </td>

                  <td>
                    {money(
                      Number(
                        s.total_cents
                        || 0
                      )
                    )}
                  </td>

                  <td>
                    {sale.cancelled ? (
                      <span className="sale-cancelled-cell">
                        <span
                          className="sale-cancelled-flag"
                          title={
                            sale.cancellation_reason
                            || 'Ohne Angabe eines Grundes'
                          }
                        >
                          <Ban size={14}/> Storniert
                        </span>

                        {isTeamLeader&&
                          <button
                            type="button"
                            className="icon-button"
                            onClick={()=>
                              wiederherstellen(sale)
                            }
                            title="Storno zurücknehmen"
                          >
                            <RotateCcw size={16}/>
                          </button>
                        }
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="danger-button"
                        onClick={()=>
                          stornieren(sale)
                        }
                        title="Verkauf stornieren; er bleibt erhalten, zählt aber nicht mehr"
                      >
                        <Ban size={16}/>
                        Stornieren
                      </button>
                    )}
                  </td>

                </tr>
              )
            })}

          </tbody>

        </table>

      </div>


      {open && (
      <Modal
        onClose={()=>
          setOpen(false)
        }
        title="Verkauf erfassen"
      >

        <form
          className="sale-fast-form"
          onSubmit={save}
        >


          <div className="sale-base-grid">

            <label className="sale-customer-label">
              Kunde

              <div className="sale-customer-search">

                <Search size={17}/>

                <input
                  type="text"
                  value={customerSearch}
                  placeholder="Kunde suchen ..."
                  autoComplete="off"

                  onFocus={()=>
                    setCustomerSearchOpen(true)
                  }

                  onChange={event=>{

                    setCustomerSearch(
                      event.target.value
                    )

                    setCustomerSearchOpen(true)

                    setForm(current=>({
                      ...current,
                      customer_id:'',
                    }))
                  }}
                />

                {customerSearch&&(
                  <button
                    type="button"
                    className="sale-customer-clear"
                    title="Kundenauswahl löschen"
                    onClick={()=>{

                      setCustomerSearch('')

                      setCustomerSearchOpen(true)

                      setForm(current=>({
                        ...current,
                        customer_id:'',
                      }))
                    }}
                  >
                    <X size={15}/>
                  </button>
                )}

                {customerSearchOpen&&(
                  <div className="sale-customer-results">

                    {customerMatches(
                      customerSearch
                    ).length===0 ? (

                      <div className="sale-customer-empty">
                        Kein Kunde gefunden
                      </div>

                    ) : (

                      customerMatches(
                        customerSearch
                      ).map(customer=>{

                        const c:any=customer

                        return(
                          <button
                            type="button"
                            key={customer.id}
                            className={
                              form.customer_id
                                ===customer.id
                                ?'selected'
                                :''
                            }
                            onClick={()=>
                              chooseCustomer(
                                customer
                              )
                            }
                          >
                            <span className="sale-customer-result-icon">
                              {form.customer_id===customer.id
                                ?<Check size={15}/>
                                :<Search size={14}/>
                              }
                            </span>

                            <span className="sale-customer-result-text">
                              <strong>
                                {customerName(
                                  customer
                                )}
                              </strong>

                              <small>
                                {[
                                  c.city,
                                  c.phone,
                                  c.email,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')
                                }
                              </small>
                            </span>
                          </button>
                        )
                      })

                    )}

                  </div>
                )}

              </div>
            </label>


            <label>
              Datum

              <input
                type="datetime-local"
                value={form.sold_at}
                onChange={event=>
                  setForm({
                    ...form,
                    sold_at:
                      event.target.value,
                  })
                }
                required
              />
            </label>


            <label>
              Verkaufskanal

              <select
                value={form.channel}
                onChange={event=>
                  setForm({
                    ...form,
                    channel:
                      event.target.value,
                  })
                }
              >
                <option value="other">
                  Sonstiges
                </option>

                <option value="field">
                  Außendienst
                </option>

                <option value="online">
                  Online
                </option>
              </select>
            </label>

          </div>


          <div className="sale-products-head">

            <div>
              <h3>
                Produkte
              </h3>

              <p>
                Einfach Produktname,
                Modell oder Kategorie suchen.
              </p>
            </div>


            <button
              type="button"
              onClick={addItem}
            >
              <Plus size={16}/>
              Weiteres Produkt
            </button>

          </div>


          <div className="sale-product-list">

            {form.items.map(
              (item,index)=>{

                const selected=
                  selectedProduct(item)

                const matches=
                  productMatches(
                    item.search
                  )


                return(
                  <div
                    className="sale-product-entry"
                    key={index}
                  >

                    <div className="sale-product-number">
                      {index+1}
                    </div>


                    <div className="sale-product-main">

                      <ProductCombobox
                        label="Produkt suchen"
                        placeholder="z. B. VK7, SP7, Polster, Roboter…"
                        value={item.search}
                        options={matches.map(
                          produkt=>({
                            id:produkt.id,
                            name:produkt.name,
                            category:
                              produkt.category
                              ||'Produkt',
                            meta:[
                              produkt.technical?.k70_group,
                              produkt.technical?.article_number
                                ? `Art. ${produkt.technical.article_number}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')
                              ||null,
                            price:
                              productPriceCents(produkt)===null
                                ? null
                                : productPriceText(produkt),
                          })
                        )}
                        emptyText="Kein Produkt gefunden. Du kannst es zuerst im Produktkatalog anlegen."
                        onChange={wert=>
                          updateItem(
                            index,
                            {
                              search:wert,
                              product_id:'',
                              price_eur:'',
                            }
                          )
                        }
                        onSelect={eintrag=>{
                          const produkt=
                            products.find(
                              p=>p.id===eintrag.id
                            )

                          if(produkt){
                            chooseProduct(
                              index,
                              produkt
                            )
                          }
                        }}
                        onClear={()=>
                          updateItem(
                            index,
                            {
                              search:'',
                              product_id:'',
                              price_eur:'',
                            }
                          )
                        }
                      />


                      {selected && (
                        <div className="sale-selected-product">

                          <div className="sale-selected-check">
                            <Check size={18}/>
                          </div>


                          <div className="sale-selected-info">

                            <strong>
                              {selected.name}
                            </strong>

                            <span>
                              {selected.category
                                || 'Produkt'
                              }
                              {selected.technical?.k70_group
                                ? ` · ${selected.technical.k70_group}`
                                : ''
                              }
                              {selected.technical?.article_number
                                ? ` · Art. ${selected.technical.article_number}`
                                : ''
                              }
                            </span>

                            {selected.description && (
                              <p>
                                {selected.description}
                              </p>
                            )}

                          </div>

                        </div>
                      )}


                      <div className="sale-product-values">

                        <label>
                          Menge

                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={
                              item.quantity
                            }
                            onChange={event=>
                              updateItem(
                                index,
                                {
                                  quantity:
                                    Math.max(
                                      1,
                                      Number(
                                        event.target.value
                                      )
                                      || 1
                                    ),
                                }
                              )
                            }
                          />
                        </label>


                        <label>
                          Preis pro Stück

                          <div className="sale-price-input">

                            <input
                              value={
                                item.price_eur
                              }
                              inputMode="decimal"
                              placeholder="0,00"
                              onChange={event=>
                                updateItem(
                                  index,
                                  {
                                    price_eur:
                                      event.target.value,
                                  }
                                )
                              }
                              required
                            />

                            <span>€</span>

                          </div>
                        </label>

                      </div>


                      {form.items.length>1 && (
                        <button
                          type="button"
                          className="sale-remove-product"
                          onClick={()=>
                            removeItem(index)
                          }
                        >
                          <Trash2 size={15}/>
                          Produkt entfernen
                        </button>
                      )}

                    </div>

                  </div>
                )
              }
            )}

          </div>


          <label>
            Notizen

            <textarea
              value={form.notes}
              onChange={event=>
                setForm({
                  ...form,
                  notes:
                    event.target.value,
                })
              }
              placeholder="Optional"
              rows={3}
            />
          </label>


          <div className="sale-fast-total">

            <span>
              Gesamt
            </span>

            <strong>
              {money(totalCents)}
            </strong>

          </div>


          <div className="info-box">
            <span>
              💡
            </span>

            <div>
              Der hinterlegte Produktpreis
              wird automatisch übernommen.
              Bei Bedarf kann er vor dem
              Speichern angepasst werden.
            </div>
          </div>


          <div className="form-actions">

            <button
              type="button"
              onClick={()=>
                setOpen(false)
              }
            >
              Abbrechen
            </button>

            <button
              className="primary"
              type="submit"
              disabled={busy}
            >
              {busy
                ? 'Speichern…'
                : 'Verkauf speichern'
              }
            </button>

          </div>

        </form>

      </Modal>
      )}

    </div>
  )
}
