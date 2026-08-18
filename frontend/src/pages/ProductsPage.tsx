import {
  FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  Archive,
  ArchiveRestore,
  Euro,
  Plus,
  Search,
  Package,
  X,
} from 'lucide-react'

import {ProductPrices} from '../components/ProductPrices'
import {LoadError} from '../components/LoadError'
import {useAuth} from '../lib/auth'
import {darfVerwalten} from '../lib/roles'
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

  const {me}=useAuth()
  const istTeamleiter=darfVerwalten(me?.role)

  // Katalog, Archiv und Preisverwaltung teilen sich die Seite.
  // Archivierte Produkte bleiben erhalten, weil Verkaeufe auf sie verweisen.
  // Sie verschwinden nur aus den Auswahllisten.
  const [ansicht,setAnsicht]=
    useState<'katalog'|'archiv'|'preise'>('katalog')

  const zeigeArchiv=
    ansicht==='archiv'

  const [products,setProducts]=
    useState<ProductRecord[]>([])

  const [search,setSearch]=
    useState('')


  const [categoryFilter,setCategoryFilter]=
    useState('')

  const [priceFilter,setPriceFilter]=
    useState('all')

  // Preisspanne in Euro, als Text, damit ein leeres Feld auch leer bleibt.
  const [priceFrom,setPriceFrom]=
    useState('')

  const [priceTo,setPriceTo]=
    useState('')

  const [sortierung,setSortierung]=
    useState('name')

  const [showForm,setShowForm]=
    useState(false)

  const [busy,setBusy]=
    useState(false)

  // Barrierefreiheit fuer den eigenen (nicht ueber die zentrale <Modal>
  // laufenden) Dialog "Neues Produkt": eigenes Erscheinungsbild bleibt
  // erhalten, Fokus-Verhalten und Escape entsprechen trotzdem der zentralen
  // Modal-Komponente.
  const formTitleId=useId()
  const formDialogRef=useRef<HTMLFormElement|null>(null)
  const formTrigger=useRef<HTMLElement|null>(null)

  useEffect(()=>{
    if(!showForm)return

    formTrigger.current=document.activeElement as HTMLElement|null
    formDialogRef.current?.focus()

    function onKeyDown(event:KeyboardEvent){
      if(event.key==='Escape'){
        if(busy)return
        event.preventDefault()
        setShowForm(false)
        return
      }

      if(event.key!=='Tab')return
      const dialog=formDialogRef.current
      if(!dialog)return
      const fokusierbar=Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      if(fokusierbar.length===0)return
      const erste=fokusierbar[0]
      const letzte=fokusierbar[fokusierbar.length-1]
      if(event.shiftKey&&document.activeElement===erste){
        event.preventDefault()
        letzte.focus()
      }else if(!event.shiftKey&&document.activeElement===letzte){
        event.preventDefault()
        erste.focus()
      }
    }

    document.addEventListener('keydown',onKeyDown)
    return ()=>{
      document.removeEventListener('keydown',onKeyDown)
      formTrigger.current?.focus?.()
    }
  },[showForm,busy])

  const [message,setMessage]=
    useState('')

  const [error,setError]=
    useState('')

  const [ladefehler,setLadefehler]=
    useState('')

  const [aktivBusyId,setAktivBusyId]=
    useState<string|null>(null)

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
          zeigeArchiv
            ? '/products/archived'
            : '/products?include_unverified=true'
        )

      setProducts(
        Array.isArray(result)
          ? result
          : []
      )
      setLadefehler('')

    }catch(err){

      setLadefehler(
        err instanceof Error
          ? err.message
          : 'Produkte konnten nicht geladen werden'
      )

    }
  }


  useEffect(()=>{
    if(ansicht!=='preise')load()
  },[ansicht])


  async function setzeAktiv(
    product:ProductRecord,
    aktiv:boolean
  ){
    if(aktivBusyId===product.id)return
    setAktivBusyId(product.id)
    try{
      await api(
        `/products/${product.id}/active`,
        {
          method:'PATCH',
          body:JSON.stringify({active:aktiv}),
        }
      )
      setMessage(
        aktiv
          ? `${product.name} ist wieder aktiv`
          : `${product.name} wurde archiviert`
      )
      await load()
    }catch(err){
      setError(
        err instanceof Error
          ? err.message
          : 'Konnte nicht geändert werden'
      )
    }finally{
      setAktivBusyId(null)
    }
  }


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


  const categories=
    useMemo(()=>{

      return Array.from(
        new Set(
          products
            .map(product=>
              product.category?.trim()
            )
            .filter(
              (value):value is string=>
                Boolean(value)
            )
        )
      )
        .sort(
          (a,b)=>
            a.localeCompare(
              b,
              'de'
            )
        )

    },[products])


  const visibleProducts=
    useMemo(()=>{

      return filtered.filter(product=>{

        if(
          categoryFilter
          &&product.category
            !==categoryFilter
        ){
          return false
        }


        const hasPrice=
          getPrice(product)!==null


        if(
          priceFilter==='with'
          &&!hasPrice
        ){
          return false
        }


        if(
          priceFilter==='without'
          &&hasPrice
        ){
          return false
        }


        // Preisspanne. Ein Produkt ohne Preis faellt heraus, sobald eine
        // Grenze gesetzt ist - sonst taeuscht die Liste Treffer vor.
        const von=
          priceFrom.trim()
            ? Number(priceFrom.replace(',','.'))
            : null

        const bis=
          priceTo.trim()
            ? Number(priceTo.replace(',','.'))
            : null

        if(von!==null&&Number.isFinite(von)){
          const preis=getPrice(product)
          if(preis===null||preis<von)return false
        }

        if(bis!==null&&Number.isFinite(bis)){
          const preis=getPrice(product)
          if(preis===null||preis>bis)return false
        }


        return true
      })

    },[
      filtered,
      categoryFilter,
      priceFilter,
      priceFrom,
      priceTo,
    ])


  const sortierteProdukte=
    useMemo(()=>{

      const liste=[...visibleProducts]

      // Produkte ohne Preis stehen beim Sortieren nach Preis am Ende -
      // sie sind keine "0 Euro".
      const nachPreis=(richtung:number)=>
        (a:ProductRecord,b:ProductRecord)=>{
          const pa=getPrice(a)
          const pb=getPrice(b)
          if(pa===null&&pb===null)return 0
          if(pa===null)return 1
          if(pb===null)return -1
          return (pa-pb)*richtung
        }

      if(sortierung==='preis-auf')return liste.sort(nachPreis(1))
      if(sortierung==='preis-ab')return liste.sort(nachPreis(-1))

      if(sortierung==='kategorie'){
        return liste.sort((a,b)=>
          (a.category||'').localeCompare(b.category||'','de')
          ||a.name.localeCompare(b.name,'de')
        )
      }

      return liste.sort((a,b)=>a.name.localeCompare(b.name,'de'))

    },[visibleProducts,sortierung])


  function resetProductFilters(){

    setSearch('')
    setCategoryFilter('')
    setPriceFilter('all')
    setPriceFrom('')
    setPriceTo('')
    setSortierung('name')
  }


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
          <h1>
            {ansicht==='archiv'
              ? 'Archivierte Produkte'
              : ansicht==='preise'
                ? 'Preisverwaltung'
                : 'Produktkatalog'}
          </h1>

          <p>
            {ansicht==='archiv'
              ? 'Nicht mehr in Auswahllisten. Bisherige Verkäufe bleiben erhalten.'
              : ansicht==='preise'
                ? 'Alle Preise an einer Stelle – mit Verlauf und CSV-Import.'
                : 'Produkte schnell finden und für Verkäufe verwenden.'}
          </p>

          {istTeamleiter&&
            <div className="rental-tabs produkt-tabs">
              <button
                type="button"
                className={ansicht==='katalog'?'plain-button is-active':'plain-button'}
                onClick={()=>setAnsicht('katalog')}
              >
                <Package size={15}/> Katalog
              </button>
              <button
                type="button"
                className={ansicht==='preise'?'plain-button is-active':'plain-button'}
                onClick={()=>setAnsicht('preise')}
              >
                <Euro size={15}/> Preise
              </button>
              <button
                type="button"
                className={ansicht==='archiv'?'plain-button is-active':'plain-button'}
                onClick={()=>setAnsicht('archiv')}
              >
                <Archive size={15}/> Archiv
              </button>
            </div>
          }
        </div>


        {istTeamleiter&&ansicht!=='preise'&&
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
        }

      </div>


      {ansicht==='preise'?<ProductPrices/>:<>


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


      <div className="simple-product-filters">

        <label>
          Kategorie

          <select
            value={categoryFilter}
            onChange={event=>
              setCategoryFilter(
                event.target.value
              )
            }
          >
            <option value="">
              Alle Kategorien
            </option>

            {categories.map(category=>
              <option
                key={category}
                value={category}
              >
                {category}
              </option>
            )}
          </select>
        </label>


        <label>
          Preis

          <select
            value={priceFilter}
            onChange={event=>
              setPriceFilter(
                event.target.value
              )
            }
          >
            <option value="all">
              Alle
            </option>

            <option value="with">
              Preis vorhanden
            </option>

            <option value="without">
              Preis fehlt
            </option>
          </select>
        </label>


        <label className="preisspanne">
          Preis von – bis

          <span>
            <input
              value={priceFrom}
              onChange={event=>
                setPriceFrom(event.target.value)
              }
              inputMode="decimal"
              placeholder="0"
              aria-label="Preis ab"
            />

            <input
              value={priceTo}
              onChange={event=>
                setPriceTo(event.target.value)
              }
              inputMode="decimal"
              placeholder="ohne Grenze"
              aria-label="Preis bis"
            />
          </span>
        </label>


        <label>
          Sortierung

          <select
            value={sortierung}
            onChange={event=>
              setSortierung(event.target.value)
            }
          >
            <option value="name">
              Name A–Z
            </option>

            <option value="kategorie">
              Kategorie
            </option>

            <option value="preis-auf">
              Preis aufsteigend
            </option>

            <option value="preis-ab">
              Preis absteigend
            </option>
          </select>
        </label>


        <button
          type="button"
          onClick={resetProductFilters}
        >
          <X size={16}/>
          Filter zurücksetzen
        </button>

      </div>


      <div className="simple-product-count">
        {sortierteProdukte.length}
        {' '}
        {sortierteProdukte.length===1?'Produkt':'Produkte'}
      </div>

      {ladefehler && <LoadError meldung={ladefehler} onRetry={load} />}

      <div className="simple-product-grid">

        {sortierteProdukte.map(product=>{

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


              <h2>
                {product.name}
              </h2>

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

                {istTeamleiter&&
                  <button
                    type="button"
                    className="product-archive-button"
                    disabled={aktivBusyId===product.id}
                    onClick={()=>setzeAktiv(
                      product,
                      zeigeArchiv
                    )}
                    title={
                      zeigeArchiv
                        ? 'Wieder aktiv setzen'
                        : 'Aus den Auswahllisten nehmen; Verkäufe bleiben erhalten'
                    }
                  >
                    {zeigeArchiv
                      ? <><ArchiveRestore size={15}/> Zurückholen</>
                      : <><Archive size={15}/> Archivieren</>}
                  </button>
                }

              </div>

            </article>
          )
        })}

      </div>

      </>}


      {showForm && (

        <div
          className="simple-product-modal-backdrop"
          onMouseDown={()=>{
            if(!busy)setShowForm(false)
          }}
        >

          <form
            className="simple-product-modal"
            onSubmit={saveProduct}
            onMouseDown={event=>
              event.stopPropagation()
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby={formTitleId}
            ref={formDialogRef}
            tabIndex={-1}
          >

            <div className="simple-product-modal-head">

              <div>
                <h2 id={formTitleId}>
                  Neues Produkt
                </h2>

                <p>
                  Nur die wichtigen Angaben.
                </p>
              </div>

              <button
                type="button"
                className="simple-product-close"
                aria-label="Schließen"
                disabled={busy}
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
                disabled={busy}
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
