import {
  FormEvent,
  useMemo,
  useState,
} from 'react'
import {
  CheckCircle2,
  CircleSlash2,
  PackageCheck,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react'

import {Modal} from './Modal'
import {useToast} from './Toast'
import {api,money} from '../lib/api'
import type {
  Appointment,
  Product,
} from '../types'


type CatalogProduct=Product&{
  category?:string|null
  description?:string|null
  price?:{
    amount_cents?:number
    currency?:string
  }|null
  technical?:{
    article_number?:string
    k70_group?:string
  }
}

type Outcome=
  |'sale'
  |'rental'
  |'none'
  |null

type SaleItem={
  product_id:string
  search:string
  quantity:number
  price_eur:string
}

type Props={
  appointment:Appointment
  products:Product[]
  onClose:()=>void
  onDone:()=>Promise<void>|void
}

export const NO_RESULT_REASONS:{value:string;label:string}[]=[
  {value:'no_interest',label:'Kein Interesse'},
  {value:'no_budget',label:'Kein Budget'},
  {value:'price_too_high',label:'Preis zu hoch'},
  {value:'no_need',label:'Kein Bedarf'},
  {value:'postponed',label:'Möchte später entscheiden'},
  {value:'competitor',label:'Bei anderem Anbieter gekauft'},
  {value:'not_reached',label:'Kunde nicht angetroffen'},
  {value:'other',label:'Sonstiges'},
]


function localDateTime(
  value=new Date()
){
  const copy=new Date(
    value.getTime()
    -value.getTimezoneOffset()*60_000
  )

  return copy
    .toISOString()
    .slice(0,16)
}


function productPriceCents(
  product:CatalogProduct
){
  const cents=
    product.price?.amount_cents

  return typeof cents==='number'
    ? cents
    : null
}


function productSearchText(
  product:CatalogProduct
){
  return [
    product.name,
    product.category,
    product.description,
    product.technical?.article_number,
    product.technical?.k70_group,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}


export function AppointmentCompletionModal({
  appointment,
  products,
  onClose,
  onDone,
}:Props){
  const toast=useToast()

  const catalog=
    products as CatalogProduct[]

  const [outcome,setOutcome]=
    useState<Outcome>(null)

  const [noResultReason,setNoResultReason]=
    useState('')

  const [busy,setBusy]=
    useState(false)

  const [saleDate,setSaleDate]=
    useState(localDateTime())

  const [saleChannel,setSaleChannel]=
    useState('field')

  const [saleNotes,setSaleNotes]=
    useState('')

  const emptySaleItem=():SaleItem=>({
    product_id:'',
    search:'',
    quantity:1,
    price_eur:'',
  })

  const [saleItems,setSaleItems]=
    useState<SaleItem[]>([
      emptySaleItem(),
    ])

  const issuedDefault=new Date()
  const dueDefault=new Date()
  dueDefault.setDate(
    dueDefault.getDate()+7
  )

  const [rentalSearch,setRentalSearch]=
    useState('')

  const [rentalProductId,setRentalProductId]=
    useState('')

  const [serialNumber,setSerialNumber]=
    useState('')

  const [issuedAt,setIssuedAt]=
    useState(
      localDateTime(issuedDefault)
    )

  const [dueAt,setDueAt]=
    useState(
      localDateTime(dueDefault)
    )

  const [rentalNotes,setRentalNotes]=
    useState('')


  const rentalSelected=useMemo(
    ()=>catalog.find(
      product=>
        product.id===rentalProductId
    ),
    [
      catalog,
      rentalProductId,
    ],
  )


  function matches(search:string){
    const query=
      search
        .trim()
        .toLowerCase()

    if(!query){
      return catalog.slice(0,8)
    }

    return catalog
      .filter(product=>
        productSearchText(product)
          .includes(query)
      )
      .slice(0,10)
  }


  function updateSaleItem(
    index:number,
    changes:Partial<SaleItem>,
  ){
    setSaleItems(current=>
      current.map(
        (item,itemIndex)=>
          itemIndex===index
            ?{
              ...item,
              ...changes,
            }
            :item
      )
    )
  }


  function chooseSaleProduct(
    index:number,
    product:CatalogProduct,
  ){
    const cents=
      productPriceCents(product)

    updateSaleItem(
      index,
      {
        product_id:product.id,
        search:product.name,
        price_eur:
          cents===null
            ?''
            :(cents/100)
              .toFixed(2),
      }
    )
  }


  function chooseRentalProduct(
    product:CatalogProduct,
  ){
    setRentalProductId(
      product.id
    )

    setRentalSearch(
      product.name
    )
  }


  async function finish(
    event?:FormEvent,
  ){
    event?.preventDefault()

    if(busy)return

    if(!outcome)return

    if(
      outcome!=='none'
      && !appointment.customer_id
    ){
      toast(
        'Für Verkauf oder Verleih muss dem Termin zuerst ein Kunde zugeordnet sein.',
        'error',
      )
      return
    }

    if(outcome==='none'&&!noResultReason){
      toast(
        'Bitte einen Grund auswählen, warum es zu keinem Abschluss kam.',
        'error',
      )
      return
    }

    let payload:any={
      outcome,
      ...(outcome==='none'?{no_result_reason:noResultReason}:{}),
    }

    if(outcome==='sale'){
      const invalid=
        saleItems.some(item=>
          !item.product_id
          || item.quantity<1
          || !item.price_eur
          || Number.isNaN(
            Number(
              item.price_eur
                .replace(',','.')
            )
          )
        )

      if(invalid){
        toast(
          'Bitte bei jedem Verkauf ein Produkt, eine Menge und einen Preis angeben.',
          'error',
        )
        return
      }

      payload={
        outcome:'sale',
        sale_sold_at:
          new Date(
            saleDate
          ).toISOString(),

        sale_channel:
          saleChannel,

        sale_notes:
          saleNotes.trim()
          ||null,

        sale_items:
          saleItems.map(item=>({
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
                )*100
              ),
          })),
      }
    }

    if(outcome==='rental'){
      if(!rentalProductId){
        toast(
          'Bitte ein Verleihgerät auswählen.',
          'error',
        )
        return
      }

      if(!issuedAt||!dueAt){
        toast(
          'Bitte Ausgabe und Rückgabe angeben.',
          'error',
        )
        return
      }

      if(
        new Date(dueAt)
        <=new Date(issuedAt)
      ){
        toast(
          'Die geplante Rückgabe muss nach der Ausgabe liegen.',
          'error',
        )
        return
      }

      payload={
        outcome:'rental',

        rental_product_id:
          rentalProductId,

        rental_serial_number:
          serialNumber.trim()
          ||null,

        rental_issued_at:
          new Date(
            issuedAt
          ).toISOString(),

        rental_due_at:
          new Date(
            dueAt
          ).toISOString(),

        rental_notes:
          rentalNotes.trim()
          ||null,
      }
    }

    setBusy(true)

    try{
      await api(
        `/appointments/${appointment.id}/complete`,
        {
          method:'POST',
          body:JSON.stringify(
            payload
          ),
        }
      )

      if(outcome==='sale'){
        toast(
          'Termin durchgeführt und Verkauf gespeichert.'
        )
      }else if(outcome==='rental'){
        toast(
          'Termin durchgeführt und Verleih gespeichert.'
        )
      }else{
        toast(
          'Termin als durchgeführt gespeichert.'
        )
      }

      await onDone()

    }catch(error){
      toast(
        error instanceof Error
          ?error.message
          :'Termin konnte nicht abgeschlossen werden.',
        'error',
      )
    }finally{
      setBusy(false)
    }
  }


  return <Modal
    title="Termin durchgeführt"
    onClose={onClose}
  >
    <div className="appointment-completion">

      <div className="completion-appointment">
        <CheckCircle2 size={22}/>

        <div>
          <strong>
            {appointment.customer_name
              ||'Termin'}
          </strong>

          <small>
            Was ist bei diesem Termin passiert?
          </small>
        </div>
      </div>


      {!appointment.customer_id&&
        <div className="completion-warning">
          Dieser Termin hat keinen Kunden.
          Verkauf und Verleih sind deshalb
          erst möglich, wenn dem Termin ein
          Kunde zugeordnet wurde.
        </div>
      }


      <div className="completion-options">

        <button
          type="button"
          className={
            outcome==='sale'
              ?'active sale'
              :'sale'
          }
          disabled={
            !appointment.customer_id
          }
          onClick={()=>
            setOutcome('sale')
          }
        >
          <span>
            <ShoppingCart size={24}/>
          </span>

          <strong>
            Etwas verkauft
          </strong>

          <small>
            Verkauf direkt erfassen
          </small>
        </button>


        <button
          type="button"
          className={
            outcome==='rental'
              ?'active rental'
              :'rental'
          }
          disabled={
            !appointment.customer_id
          }
          onClick={()=>
            setOutcome('rental')
          }
        >
          <span>
            <PackageCheck size={24}/>
          </span>

          <strong>
            Gerät verliehen
          </strong>

          <small>
            Verleih direkt erfassen
          </small>
        </button>


        <button
          type="button"
          className={
            outcome==='none'
              ?'active none'
              :'none'
          }
          onClick={()=>
            setOutcome('none')
          }
        >
          <span>
            <CircleSlash2 size={24}/>
          </span>

          <strong>
            Nichts
          </strong>

          <small>
            Kein Verkauf / Verleih
          </small>
        </button>

      </div>


      {outcome==='sale'&&
        <form
          className="completion-form"
          onSubmit={finish}
        >
          <div className="completion-section-head">
            <div>
              <h3>
                Verkauf erfassen
              </h3>

              <p>
                Produktauswahl wie im Bereich Verkäufe.
              </p>
            </div>

            <button
              type="button"
              onClick={()=>
                setSaleItems(current=>[
                  ...current,
                  emptySaleItem(),
                ])
              }
            >
              <Plus size={16}/>
              Produkt
            </button>
          </div>


          <div className="completion-sale-meta">

            <label>
              Verkaufsdatum

              <input
                type="datetime-local"
                value={saleDate}
                onChange={event=>
                  setSaleDate(
                    event.target.value
                  )
                }
                required
              />
            </label>


            <label>
              Verkaufskanal

              <select
                value={saleChannel}
                onChange={event=>
                  setSaleChannel(
                    event.target.value
                  )
                }
              >
                <option value="field">
                  Außendienst
                </option>

                <option value="promotion">
                  Promotion
                </option>

                <option value="k70">
                  K70
                </option>

                <option value="other">
                  Sonstiges
                </option>
              </select>
            </label>

          </div>


          <div className="completion-products">

            {saleItems.map(
              (item,index)=>{
                const selectedProduct=
                  catalog.find(
                    product=>
                      product.id
                      ===item.product_id
                  )

                const resultRows=
                  matches(item.search)

                const showResults=
                  !selectedProduct
                  || selectedProduct.name
                    !==item.search

                return <div
                  className="completion-product"
                  key={index}
                >
                  <div className="completion-product-top">

                    <strong>
                      Produkt {index+1}
                    </strong>

                    {saleItems.length>1&&
                      <button
                        type="button"
                        className="icon-danger"
                        onClick={()=>
                          setSaleItems(
                            current=>
                              current.filter(
                                (_,i)=>i!==index
                              )
                          )
                        }
                      >
                        <Trash2 size={15}/>
                      </button>
                    }

                  </div>


                  <label>
                    Produkt suchen

                    <div className="completion-search">
                      <Search size={17}/>

                      <input
                        value={item.search}
                        placeholder="z. B. VK7, SP7, K70 …"
                        autoComplete="off"
                        onChange={event=>
                          updateSaleItem(
                            index,
                            {
                              search:
                                event.target.value,
                              product_id:'',
                              price_eur:'',
                            }
                          )
                        }
                      />
                    </div>
                  </label>


                  {showResults&&
                    <div className="completion-search-results">

                      {resultRows.map(
                        product=>{
                          const cents=
                            productPriceCents(
                              product
                            )

                          return <button
                            type="button"
                            key={product.id}
                            onClick={()=>
                              chooseSaleProduct(
                                index,
                                product
                              )
                            }
                          >
                            <span>
                              <strong>
                                {product.name}
                              </strong>

                              <small>
                                {product.category
                                  ||'Produkt'}
                              </small>
                            </span>

                            <b>
                              {cents===null
                                ?'Preis fehlt'
                                :money(cents)}
                            </b>
                          </button>
                        }
                      )}

                      {resultRows.length===0&&
                        <div className="completion-no-result">
                          Kein Produkt gefunden
                        </div>
                      }

                    </div>
                  }


                  <div className="completion-product-meta">

                    <label>
                      Menge

                      <input
                        type="number"
                        min="1"
                        max="999"
                        value={item.quantity}
                        onChange={event=>
                          updateSaleItem(
                            index,
                            {
                              quantity:
                                Number(
                                  event.target.value
                                ),
                            }
                          )
                        }
                        required
                      />
                    </label>


                    <label>
                      Preis pro Produkt (€)

                      <input
                        inputMode="decimal"
                        value={item.price_eur}
                        placeholder="0,00"
                        onChange={event=>
                          updateSaleItem(
                            index,
                            {
                              price_eur:
                                event.target.value,
                            }
                          )
                        }
                        required
                      />
                    </label>

                  </div>

                </div>
              }
            )}

          </div>


          <label>
            Notizen zum Verkauf

            <textarea
              rows={2}
              value={saleNotes}
              onChange={event=>
                setSaleNotes(
                  event.target.value
                )
              }
            />
          </label>


          <div className="form-actions">
            <button
              type="button"
              onClick={onClose}
            >
              Abbrechen
            </button>

            <button
              className="primary"
              disabled={busy}
            >
              <ShoppingCart size={17}/>

              {busy
                ?'Wird gespeichert …'
                :'Verkauf speichern & Termin abschließen'}
            </button>
          </div>

        </form>
      }


      {outcome==='rental'&&
        <form
          className="completion-form"
          onSubmit={finish}
        >
          <div className="completion-section-head">
            <div>
              <h3>
                Gerät verleihen
              </h3>

              <p>
                Der Verleih erscheint anschließend automatisch
                unter Verleihgeräte.
              </p>
            </div>
          </div>


          <label>
            Gerät suchen

            <div className="completion-search">
              <Search size={17}/>

              <input
                value={rentalSearch}
                placeholder="Produkt oder Gerät suchen …"
                autoComplete="off"
                onChange={event=>{
                  setRentalSearch(
                    event.target.value
                  )
                  setRentalProductId('')
                }}
              />
            </div>
          </label>


          {(
            !rentalSelected
            || rentalSelected.name
              !==rentalSearch
          )&&
            <div className="completion-search-results">

              {matches(rentalSearch)
                .map(product=>
                  <button
                    type="button"
                    key={product.id}
                    onClick={()=>
                      chooseRentalProduct(
                        product
                      )
                    }
                  >
                    <span>
                      <strong>
                        {product.name}
                      </strong>

                      <small>
                        {product.category
                          ||'Gerät'}
                      </small>
                    </span>
                  </button>
                )
              }

            </div>
          }


          <div className="completion-rental-grid">

            <label>
              Seriennummer

              <input
                value={serialNumber}
                onChange={event=>
                  setSerialNumber(
                    event.target.value
                  )
                }
                placeholder="optional"
              />
            </label>


            <label>
              Von

              <input
                type="datetime-local"
                value={issuedAt}
                onChange={event=>
                  setIssuedAt(
                    event.target.value
                  )
                }
                required
              />
            </label>


            <label>
              Bis

              <input
                type="datetime-local"
                value={dueAt}
                onChange={event=>
                  setDueAt(
                    event.target.value
                  )
                }
                required
              />
            </label>

          </div>


          <label>
            Notizen zum Verleih

            <textarea
              rows={2}
              value={rentalNotes}
              onChange={event=>
                setRentalNotes(
                  event.target.value
                )
              }
            />
          </label>


          <div className="form-actions">
            <button
              type="button"
              onClick={onClose}
            >
              Abbrechen
            </button>

            <button
              className="primary"
              disabled={busy}
            >
              <PackageCheck size={17}/>

              {busy
                ?'Wird gespeichert …'
                :'Verleih speichern & Termin abschließen'}
            </button>
          </div>

        </form>
      }


      {outcome==='none'&&
        <div className="completion-none">

          <CircleSlash2 size={30}/>

          <h3>
            Kein Verkauf und kein Verleih
          </h3>

          <p>
            Der Termin wird als
            „durchgeführt“ markiert.
          </p>

          <label className="completion-reason-label">
            Grund
            <select
              value={noResultReason}
              onChange={e=>setNoResultReason(e.target.value)}
              required
            >
              <option value="">Bitte auswählen …</option>
              {NO_RESULT_REASONS.map(reason=>
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              )}
            </select>
          </label>

          <div className="form-actions">
            <button
              type="button"
              onClick={onClose}
            >
              Abbrechen
            </button>

            <button
              type="button"
              className="primary"
              disabled={busy||!noResultReason}
              onClick={()=>
                void finish()
              }
            >
              <CheckCircle2 size={17}/>

              {busy
                ?'Wird gespeichert …'
                :'Als durchgeführt speichern'}
            </button>
          </div>

        </div>
      }

    </div>
  </Modal>
}
