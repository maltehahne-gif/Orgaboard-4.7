import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  Plus,
  Search,
  Package,
  X,
} from 'lucide-react'

import {api} from '../lib/api'


type ProductRecord = {
  id:string
  name:string
  category?:string
  description?:string | null
  verified?:boolean
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


function getPrice(product:ProductRecord){

  const cents =
    product.price?.amount_cents
    ?? product.prices?.[0]?.amount_cents

  if(typeof cents !== 'number'){
    return null
  }

  return cents / 100
}


export function ProductsPage(){

  const [products,setProducts]=
    useState<ProductRecord[]>([])

  const [search,setSearch]=
    useState('')

  const [showForm,setShowForm]=
    useState(false)

  const [busy,setBusy]=
    useState(false)

  const [message,setMessage]=
    useState('')

  const [error,setError]=
    useState('')

  const [form,setForm]=useState({
    name:'',
    category:'',
    description:'',
    price:'',
  })


  async function load(){

    try{

      const result:any =
        await api(
          '/products?include_unverified=true'
        )

      setProducts(
        Array.isArray(result)
          ? result
          : []
      )

    }catch(err){

      console.error(err)

    }
  }


  useEffect(()=>{
    load()
  },[])


  const filtered=
    useMemo(()=>{

      const q=
        search
          .trim()
          .toLowerCase()

      if(!q){
        return products
      }

      return products.filter(product=>{

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

        return text.includes(q)
      })

    },[
      products,
      search,
    ])


  function resetForm(){

    setForm({
      name:'',
      category:'',
      description:'',
      price:'',
    })

    setError('')
    setMessage('')
  }


  async function saveProduct(
    event:FormEvent
  ){

    event.preventDefault()

    if(busy)return

    const price=
      Number(
        form.price
          .replace(',','.')
      )

    if(
      !form.name.trim()
      || !form.category.trim()
      || !form.description.trim()
      || !Number.isFinite(price)
      || price < 0
    ){
      setError(
        'Bitte Produktname, Kategorie, Beschreibung und Preis vollständig ausfüllen.'
      )
      return
    }

    setBusy(true)
    setError('')
    setMessage('')

    try{

      await api(
        '/products/import',
        {
          method:'POST',

          body:JSON.stringify({
            name:form.name.trim(),
            category:form.category.trim(),
            description:
              form.description.trim(),

            functions:[],
            variants:[],
            accessories:[],

            source_kind:
              'manual_verified',

            verified:true,

            price:{
              amount_cents:
                Math.round(price * 100),

              currency:'EUR',

              source_url:
                'manual-entry',

              verified:true,
            },
          }),
        }
      )

      setMessage(
        'Produkt wurde gespeichert.'
      )

      resetForm()
      setShowForm(false)

      await load()

    }catch(err){

      setError(
        err instanceof Error
          ? err.message
          : 'Produkt konnte nicht gespeichert werden.'
      )

    }finally{
      setBusy(false)
    }
  }


  return(
    <section className="simple-products-page">

      <div className="simple-products-head">

        <div>
          <h1>Produktkatalog</h1>

          <p>
            Produkte schnell finden und für
            Verkäufe verwenden.
          </p>
        </div>


        <button
          className="primary"
          type="button"
          onClick={()=>{
            resetForm()
            setShowForm(true)
          }}
        >
          <Plus size={18}/>
          Neues Produkt
        </button>

      </div>


      <div className="simple-product-search">

        <Search size={20}/>

        <input
          value={search}
          onChange={event=>
            setSearch(
              event.target.value
            )
          }
          placeholder="Produkt suchen – z. B. VK7, SP7, Polster, Roboter…"
        />

      </div>


      <div className="simple-product-count">
        {filtered.length}
        {' '}
        Produkte
      </div>


      <div className="simple-product-grid">

        {filtered.map(product=>{

          const price=
            getPrice(product)

          return(
            <article
              className="simple-product-card"
              key={product.id}
            >

              <div className="simple-product-icon">
                <Package size={23}/>
              </div>


              <div className="simple-product-category">
                {product.category || 'Produkt'}
                {product.technical?.k70_group
                  ? ` · ${product.technical.k70_group}`
                  : ''
                }
              </div>


              <h3>
                {product.name}
              </h3>

              {product.technical?.article_number && (
                <div className="simple-product-sku">
                  Artikel-Nr. {product.technical.article_number}
                </div>
              )}


              {product.description && (
                <p>
                  {product.description}
                </p>
              )}


              <div className="simple-product-card-bottom">

                {price!==null ? (
                  <strong>
                    {price.toLocaleString(
                      'de-DE',
                      {
                        style:'currency',
                        currency:'EUR',
                      }
                    )}
                  </strong>
                ) : (
                  <span>
                    Preis nicht hinterlegt
                  </span>
                )}

              </div>

            </article>
          )
        })}

      </div>


      {showForm && (

        <div
          className="simple-product-modal-backdrop"
          onMouseDown={()=>
            setShowForm(false)
          }
        >

          <form
            className="simple-product-modal"
            onSubmit={saveProduct}
            onMouseDown={event=>
              event.stopPropagation()
            }
          >

            <div className="simple-product-modal-head">

              <div>
                <h2>
                  Neues Produkt
                </h2>

                <p>
                  Nur die wichtigen Angaben.
                </p>
              </div>

              <button
                type="button"
                className="simple-product-close"
                onClick={()=>
                  setShowForm(false)
                }
              >
                <X size={20}/>
              </button>

            </div>


            <label>
              Produktname

              <input
                value={form.name}
                onChange={event=>
                  setForm({
                    ...form,
                    name:event.target.value,
                  })
                }
                placeholder="z. B. Kobold VK7 Akku-Staubsauger"
                required
              />
            </label>


            <label>
              Kategorie

              <input
                value={form.category}
                onChange={event=>
                  setForm({
                    ...form,
                    category:event.target.value,
                  })
                }
                placeholder="z. B. Akku-Staubsauger"
                required
              />
            </label>


            <label>
              Beschreibung

              <textarea
                value={form.description}
                onChange={event=>
                  setForm({
                    ...form,
                    description:event.target.value,
                  })
                }
                rows={4}
                placeholder="Kurze verständliche Produktbeschreibung"
                required
              />
            </label>


            <label>
              Preis in EUR

              <input
                value={form.price}
                onChange={event=>
                  setForm({
                    ...form,
                    price:event.target.value,
                  })
                }
                inputMode="decimal"
                placeholder="949,00"
                required
              />
            </label>


            {error && (
              <div className="simple-product-error">
                {error}
              </div>
            )}


            {message && (
              <div className="simple-product-success">
                {message}
              </div>
            )}


            <div className="simple-product-actions">

              <button
                type="button"
                onClick={()=>
                  setShowForm(false)
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
                  : 'Produkt speichern'
                }
              </button>

            </div>

          </form>

        </div>
      )}

    </section>
  )
}
