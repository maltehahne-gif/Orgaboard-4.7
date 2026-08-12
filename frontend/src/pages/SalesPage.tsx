import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  Check,
  ChevronDown,
  Package,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import {
  api,
  formatDateTime,
  money,
} from '../lib/api'

import type {
  Customer,
  Product,
  Sale,
} from '../types'

import {Modal} from '../components/Modal'
import {useToast} from '../components/Toast'


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
}


type SaleItemForm = {
  product_id:string
  quantity:number
  price_eur:string
  search:string
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


  const [rows,setRows]=
    useState<Sale[]>([])

  const [customers,setCustomers]=
    useState<Customer[]>([])

  const [products,setProducts]=
    useState<CatalogProduct[]>([])


  const [open,setOpen]=
    useState(false)

  const [busy,setBusy]=
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
  }


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


  function productMatches(
    search:string
  ){

    const query=
      search
        .trim()
        .toLowerCase()

    if(!query){
      return products.slice(0,8)
    }


    return products
      .filter(product=>{

        const text=[
          product.name,
          product.category,
          product.description,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return text.includes(query)
      })
      .slice(0,10)
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


  async function removeSale(
    sale:Sale
  ){

    if(
      !window.confirm(
        'Verkauf wirklich löschen?\n\n'
        +'Umsatz und Einheiten werden danach '
        +'automatisch neu berechnet.\n\n'
        +'Diese Aktion kann nicht rückgängig gemacht werden.'
      )
    ){
      return
    }


    try{

      await api(
        `/sales/${sale.id}`,
        {
          method:'DELETE',
        }
      )

      toast(
        'Verkauf wurde gelöscht.'
      )

      await load()

    }catch(error){

      toast(
        error instanceof Error
          ? error.message
          : 'Der Verkauf konnte nicht gelöscht werden.'
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

            {rows.length===0 && (
              <tr>
                <td
                  colSpan={5}
                  className="empty"
                >
                  Noch keine Verkäufe erfasst.
                </td>
              </tr>
            )}


            {rows.map(sale=>{

              const s:any=sale

              const customer=
                customers.find(
                  c=>c.id===s.customer_id
                )

              const itemCount=
                Array.isArray(s.items)
                  ? s.items.reduce(
                      (
                        count:number,
                        item:any
                      )=>
                        count
                        + Number(
                            item.quantity
                            || 0
                          ),
                      0
                    )
                  : 0


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
                    {itemCount}
                    {' '}
                    {itemCount===1
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
                    <button
                      type="button"
                      className="danger-button"
                      onClick={()=>
                        removeSale(sale)
                      }
                      title="Fehleintrag löschen"
                    >
                      <Trash2 size={16}/>
                      Löschen
                    </button>
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

            <label>
              Kunde

              <select
                value={
                  form.customer_id
                }
                onChange={event=>
                  setForm({
                    ...form,
                    customer_id:
                      event.target.value,
                  })
                }
              >
                <option value="">
                  Kein Kunde ausgewählt
                </option>

                {customers.map(
                  customer=>(
                    <option
                      key={customer.id}
                      value={customer.id}
                    >
                      {customerName(
                        customer
                      )}
                    </option>
                  )
                )}
              </select>
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

                const showResults=
                  !selected
                  || item.search
                    !== selected.name


                return(
                  <div
                    className="sale-product-entry"
                    key={index}
                  >

                    <div className="sale-product-number">
                      {index+1}
                    </div>


                    <div className="sale-product-main">

                      <label className="sale-search-label">

                        Produkt suchen

                        <div className="sale-product-search">

                          <Search size={19}/>

                          <input
                            type="text"
                            value={item.search}
                            placeholder="z. B. VK7, SP7, Polster, Roboter…"
                            autoComplete="off"
                            onChange={event=>{

                              updateItem(
                                index,
                                {
                                  search:
                                    event.target.value,

                                  product_id:'',
                                  price_eur:'',
                                }
                              )
                            }}
                          />

                          {item.search && (
                            <button
                              type="button"
                              className="sale-search-clear"
                              onClick={()=>
                                updateItem(
                                  index,
                                  {
                                    search:'',
                                    product_id:'',
                                    price_eur:'',
                                  }
                                )
                              }
                            >
                              <X size={16}/>
                            </button>
                          )}

                        </div>

                      </label>


                      {showResults && (
                        <div className="sale-product-results">

                          {matches.length===0 ? (

                            <div className="sale-product-no-result">
                              Kein Produkt gefunden.
                              Du kannst es zuerst im
                              Produktkatalog anlegen.
                            </div>

                          ) : (

                            matches.map(
                              product=>(
                                <button
                                  key={product.id}
                                  type="button"
                                  className="sale-product-result"
                                  onClick={()=>
                                    chooseProduct(
                                      index,
                                      product
                                    )
                                  }
                                >

                                  <div className="sale-result-icon">
                                    <Package size={19}/>
                                  </div>


                                  <div className="sale-result-content">

                                    <strong>
                                      {product.name}
                                    </strong>

                                    <span className="sale-result-category">
                                      {product.category
                                        || 'Produkt'
                                      }
                                    </span>

                                    {product.description && (
                                      <small>
                                        {product.description}
                                      </small>
                                    )}

                                  </div>


                                  <div className="sale-result-price">
                                    {productPriceText(
                                      product
                                    )}
                                  </div>

                                </button>
                              )
                            )
                          )}

                        </div>
                      )}


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
