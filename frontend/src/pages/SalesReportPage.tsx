import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  Loader2,
  RotateCcw,
  Table2,
} from 'lucide-react'


import {api,money} from '../lib/api'
import {useAuth} from '../lib/auth'
import {useToast} from '../components/Toast'

import type {
  Appointment,
  Customer,
  Product,
  Sale,
} from '../types'


type EmployeeOption={
  id:string
  display_name:string
}


type ProductColumn=
  |'roboter'
  |'kobold'
  |'tiger'
  |'elektrobuerste'
  |'saugwischer'
  |'polsterbuerste'
  |'service'
  |'demotuecher'


type SaleMetrics={
  promotion:string
  recommendation:string
  premium:string
  koData:string
  aom:string

  targetCustomer:string
  customer:string

  fixedArea:string
  whiteArea:string

  jobTicket:string
  profiRecommendation:string
  profiPremium:string

  oldDevice:string

  products:Record<ProductColumn,string>

  units:number
  productRevenue:number
  k70Revenue:number
}


type ReportRow={
  sale:Sale
  customer:Customer|null
  appointment:Appointment|null
  metrics:SaleMetrics
}


const DAYS=[
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
]


const PRODUCT_COLUMNS:{
  key:ProductColumn
  label:string
}[]=[
  {key:'roboter',label:'Roboter'},
  {key:'kobold',label:'Kobold'},
  {key:'tiger',label:'Tiger'},
  {key:'elektrobuerste',label:'Elektrobürste'},
  {key:'saugwischer',label:'Saugwischer'},
  {key:'polsterbuerste',label:'Polsterbürste'},
  {key:'service',label:'Service'},
  {key:'demotuecher',label:'Demotücher'},
]


function startOfWeek(
  value=new Date()
){
  const result=new Date(value)

  const day=
    (result.getDay()+6)%7

  result.setDate(
    result.getDate()-day
  )

  result.setHours(
    0,0,0,0
  )

  return result
}


function addDays(
  value:Date,
  days:number,
){
  const result=new Date(value)

  result.setDate(
    result.getDate()+days
  )

  return result
}


function sameDay(
  value:string,
  day:Date,
){
  const date=new Date(value)

  return (
    date.getFullYear()
      ===day.getFullYear()
    &&
    date.getMonth()
      ===day.getMonth()
    &&
    date.getDate()
      ===day.getDate()
  )
}


function formatDate(
  value:Date,
){
  return new Intl.DateTimeFormat(
    'de-DE',
    {
      day:'2-digit',
      month:'2-digit',
      year:'numeric',
    }
  ).format(value)
}


function formatTime(
  value:string,
){
  return new Intl.DateTimeFormat(
    'de-DE',
    {
      hour:'2-digit',
      minute:'2-digit',
    }
  ).format(
    new Date(value)
  )
}


function normalize(
  value:string|null|undefined
){
  return (value||'')
    .toLowerCase()
    .replaceAll('ä','ae')
    .replaceAll('ö','oe')
    .replaceAll('ü','ue')
    .replaceAll('ß','ss')
}


function hasNote(
  sale:Sale,
  expression:RegExp,
){
  return expression.test(
    normalize(sale.notes)
  )
}


function productKinds(
  name:string,
):Set<ProductColumn>{
  const text=normalize(name)

  const result=
    new Set<ProductColumn>()


  if(
    /\bvr7\b/.test(text)
    ||/\brb7\b/.test(text)
    ||text.includes('roboter')
  ){
    result.add('roboter')
  }


  if(
    /\btiger\b/.test(text)
    ||/\bvt300\b/.test(text)
  ){
    result.add('tiger')
  }


  if(
    /\beb7\b/.test(text)
    ||/\beb400\b/.test(text)
    ||text.includes('elektrobuerste')
  ){
    result.add(
      'elektrobuerste'
    )
  }


  if(
    /\bsp7\b/.test(text)
    ||text.includes('saugwischer')
  ){
    result.add(
      'saugwischer'
    )
  }


  if(
    /\bpb7\b/.test(text)
    ||text.includes('polsterbuerste')
  ){
    result.add(
      'polsterbuerste'
    )
  }


  if(
    text.includes('service')
  ){
    result.add('service')
  }


  if(
    text.includes('demotuch')
    ||text.includes('demotuecher')
  ){
    result.add(
      'demotuecher'
    )
  }


  if(
    /\bvk7\b/.test(text)
    ||/\bvm7\b/.test(text)
    ||/\bvg100\b/.test(text)
    ||text.includes('kobold')
  ){
    result.add('kobold')
  }


  return result
}


function customerAddress(
  customer:Customer|null,
){
  if(!customer)return ''

  return [
    customer.street,
    customer.house_number,
    customer.postal_code,
    customer.city,
  ]
    .filter(Boolean)
    .join(' ')
}


function isK70(
  product:Product|undefined,
){
  return normalize(
    product?.category
  ).trim()==='k70'
}


function emptyProducts(){
  return {
    roboter:'',
    kobold:'',
    tiger:'',
    elektrobuerste:'',
    saugwischer:'',
    polsterbuerste:'',
    service:'',
    demotuecher:'',
  } satisfies Record<
    ProductColumn,
    string
  >
}


function buildMetrics(
  sale:Sale,
  appointment:Appointment|null,
  productsById:Map<string,Product>,
):SaleMetrics{

  const soldAmounts=
    new Map<ProductColumn,number>()

  let productRevenue=0
  let k70Revenue=0


  for(const item of sale.items||[]){

    const product=
      productsById.get(
        item.product_id
      )

    const itemTotal=
      Number(
        item.total_cents
        ??(
          item.quantity
          *item.unit_price_cents
        )
      )


    if(isK70(product)){
      k70Revenue+=itemTotal
    }else{
      productRevenue+=itemTotal
    }


    for(
      const kind
      of productKinds(
        item.name
        ||product?.name
        ||''
      )
    ){
      soldAmounts.set(
        kind,
        (
          soldAmounts.get(kind)
          ||0
        )
        +Number(item.quantity||0)
      )
    }
  }


  const presented=
    new Set<ProductColumn>()

  for(
    const product
    of appointment?.products||[]
  ){
    for(
      const kind
      of productKinds(
        product.name
      )
    ){
      presented.add(kind)
    }
  }


  const productCells=
    emptyProducts()


  for(
    const column
    of PRODUCT_COLUMNS
  ){
    const sold=
      soldAmounts.get(
        column.key
      )||0

    if(sold>0){
      productCells[column.key]=
        String(sold)

    }else if(
      presented.has(
        column.key
      )
    ){
      productCells[column.key]='X'
    }
  }


  const appointmentType=
    appointment?.appointment_type


  const isRecommendation=
    appointmentType==='recommendation'

  const isPremium=
    appointmentType==='premium_checkin'

  const isPromotion=
    sale.channel==='promotion'
    ||appointmentType==='promotion'


  const targetCustomer=
    hasNote(
      sale,
      /zielkunde/
    )


  return {
    promotion:
      isPromotion?'X':'',

    recommendation:
      isRecommendation?'X':'',

    premium:
      isPremium?'X':'',

    koData:
      hasNote(
        sale,
        /\bko[\s-]*daten\b/
      )
        ?'X'
        :'',

    aom:
      hasNote(
        sale,
        /\baom\b/
      )
        ?'X'
        :'',

    targetCustomer:
      targetCustomer?'X':'',

    customer:
      targetCustomer?'':'X',

    fixedArea:
      hasNote(
        sale,
        /festgebiet/
      )
        ?'X'
        :'',

    whiteArea:
      hasNote(
        sale,
        /weissgebiet/
      )
        ?'X'
        :'',

    jobTicket:
      hasNote(
        sale,
        /job[\s-]*ticket/
      )
        ?'X'
        :'',

    profiRecommendation:
      hasNote(
        sale,
        /profi.*empfehlung/
      )
        ?'X'
        :'',

    profiPremium:
      hasNote(
        sale,
        /profi.*premium/
      )
        ?'X'
        :'',

    oldDevice:
      hasNote(
        sale,
        /altgeraet/
      )
        ?'X'
        :'',

    products:
      productCells,

    units:
      Number(
        sale.units||0
      ),

    productRevenue,
    k70Revenue,
  }
}


function sumMark(
  rows:ReportRow[],
  getter:(row:ReportRow)=>string,
){
  return rows.reduce(
    (sum,row)=>
      sum+
      (
        getter(row)
          ?1
          :0
      ),
    0
  )
}


function sumProduct(
  rows:ReportRow[],
  key:ProductColumn,
){
  return rows.reduce(
    (sum,row)=>{
      const value=
        row.metrics.products[key]

      const number=
        Number(value)

      return sum+
        (
          Number.isFinite(number)
            ?number
            :0
        )
    },
    0
  )
}


export function SalesReportPage(){

  const {me}=useAuth()
  const toast=useToast()

  const sheetRef=
    useRef<HTMLDivElement|null>(
      null
    )

  const [employees,setEmployees]=
    useState<EmployeeOption[]>([])

  const [employeeId,setEmployeeId]=
    useState(
      me?.employee?.id||''
    )

  const [weekOffset,setWeekOffset]=
    useState(0)

  const [sales,setSales]=
    useState<Sale[]>([])

  const [customers,setCustomers]=
    useState<Customer[]>([])

  const [products,setProducts]=
    useState<Product[]>([])

  const [appointments,setAppointments]=
    useState<Appointment[]>([])

  const [loading,setLoading]=
    useState(false)

  const [pdfBusy,setPdfBusy]=
    useState(false)


  const weekStart=
    useMemo(()=>{
      const date=startOfWeek()

      date.setDate(
        date.getDate()
        +(weekOffset*7)
      )

      return date
    },[
      weekOffset,
    ])


  const weekEnd=
    useMemo(
      ()=>addDays(
        weekStart,
        7
      ),
      [
        weekStart,
      ],
    )


  useEffect(()=>{

    if(
      me?.role!=='TEAM_LEADER'
    ){
      setEmployeeId(
        me?.employee?.id||''
      )
      return
    }


    api<EmployeeOption[]>(
      '/team/employees'
    )
      .then(rows=>{
        setEmployees(rows)

        setEmployeeId(
          current=>
            current
            ||me?.employee?.id
            ||rows[0]?.id
            ||''
        )
      })
      .catch(()=>{
        toast(
          'Mitarbeiter konnten nicht geladen werden.',
          'error',
        )
      })

  },[
    me?.role,
    me?.employee?.id,
  ])


  useEffect(()=>{

    if(!employeeId){
      return
    }


    let active=true


    async function load(){

      setLoading(true)

      try{

        const employeeQuery=
          new URLSearchParams({
            employee_id:employeeId,
          })


        const appointmentQuery=
          new URLSearchParams({
            employee_id:employeeId,
            start:
              weekStart.toISOString(),
            end:
              weekEnd.toISOString(),
          })


        const [
          saleRows,
          customerRows,
          productRows,
          appointmentRows,
        ]=await Promise.all([

          api<Sale[]>(
            `/sales?${employeeQuery.toString()}`
          ),

          api<Customer[]>(
            `/customers?${employeeQuery.toString()}`
          ),

          api<Product[]>(
            '/products?include_unverified=true'
          ),

          api<Appointment[]>(
            `/appointments?${appointmentQuery.toString()}`
          ),

        ])


        if(!active)return


        setSales(
          saleRows.filter(sale=>{
            const time=
              new Date(
                sale.sold_at
              ).getTime()

            return (
              time>=weekStart.getTime()
              &&time<weekEnd.getTime()
            )
          })
        )

        setCustomers(
          customerRows
        )

        setProducts(
          productRows
        )

        setAppointments(
          appointmentRows
        )

      }catch(error){

        if(!active)return

        toast(
          error instanceof Error
            ?error.message
            :'Verkaufstabelle konnte nicht geladen werden.',
          'error',
        )

      }finally{
        if(active){
          setLoading(false)
        }
      }
    }


    void load()


    return ()=>{
      active=false
    }

  },[
    employeeId,
    weekOffset,
  ])


  const customerMap=
    useMemo(
      ()=>new Map(
        customers.map(
          customer=>[
            customer.id,
            customer,
          ]
        )
      ),
      [
        customers,
      ],
    )


  const productMap=
    useMemo(
      ()=>new Map(
        products.map(
          product=>[
            product.id,
            product,
          ]
        )
      ),
      [
        products,
      ],
    )


  const appointmentMap=
    useMemo(
      ()=>new Map(
        appointments.map(
          appointment=>[
            appointment.id,
            appointment,
          ]
        )
      ),
      [
        appointments,
      ],
    )


  const actualRows=
    useMemo<ReportRow[]>(
      ()=>sales
        .slice()
        .sort(
          (a,b)=>
            new Date(a.sold_at)
              .getTime()
            -
            new Date(b.sold_at)
              .getTime()
        )
        .map(sale=>{

          const customer=
            customerMap.get(
              sale.customer_id
            )||null

          const appointment=
            sale.appointment_id
              ?appointmentMap.get(
                sale.appointment_id
              )||null
              :null

          return {
            sale,
            customer,
            appointment,
            metrics:
              buildMetrics(
                sale,
                appointment,
                productMap,
              ),
          }
        }),
      [
        sales,
        customerMap,
        appointmentMap,
        productMap,
      ],
    )


  const selectedEmployeeName=
    me?.role==='TEAM_LEADER'
      ?(
        employees.find(
          employee=>
            employee.id
            ===employeeId
        )?.display_name
        ||me?.employee?.display_name
        ||''
      )
      :(
        me?.employee?.display_name
        ||''
      )


  const totalUnits=
    actualRows.reduce(
      (sum,row)=>
        sum+row.metrics.units,
      0
    )


  const totalProductRevenue=
    actualRows.reduce(
      (sum,row)=>
        sum+
        row.metrics.productRevenue,
      0
    )


  const totalK70Revenue=
    actualRows.reduce(
      (sum,row)=>
        sum+
        row.metrics.k70Revenue,
      0
    )


  async function exportPdf(){

    if(
      !sheetRef.current
      ||pdfBusy
    ){
      return
    }

    setPdfBusy(true)

    try{

      const printWindow=
        window.open(
          '',
          '_blank',
          'noopener,noreferrer'
        )

      if(!printWindow){
        throw new Error(
          'Das PDF-Fenster wurde vom Browser blockiert. Bitte Pop-ups für OrgaBoard erlauben.'
        )
      }

      const sheet=
        sheetRef.current

      const styles=
        Array.from(
          document.querySelectorAll(
            'link[rel="stylesheet"], style'
          )
        )
        .map(node=>{
          if(
            node instanceof HTMLLinkElement
          ){
            return `<link rel="stylesheet" href="${node.href}">`
          }

          return node.outerHTML
        })
        .join('\n')

      printWindow.document.open()

      printWindow.document.write(`
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Verkaufstabelle</title>

${styles}

<style>
  @page{
    size:A4 landscape;
    margin:5mm;
  }

  html,
  body{
    margin:0 !important;
    padding:0 !important;
    background:#fff !important;
    color:#000 !important;
  }

  body{
    -webkit-print-color-adjust:exact !important;
    print-color-adjust:exact !important;
  }

  .sales-week-sheet{
    width:100% !important;
    min-width:0 !important;
    margin:0 !important;
    padding:0 !important;
    background:#fff !important;
    color:#000 !important;
  }

  .sales-week-table{
    width:100% !important;
    color:#000 !important;
  }

  .sales-week-table *,
  .sales-week-sheet *,
  .sales-week-sheet-meta,
  .sales-sheet-footnote{
    color:#000 !important;
  }

  .sales-week-table th,
  .sales-week-table td{
    color:#000 !important;
  }
</style>
</head>

<body>
${sheet.outerHTML}

<script>
window.addEventListener('load', function(){
  setTimeout(function(){
    window.focus();
    window.print();
  }, 700);
});
<\/script>

</body>
</html>
      `)

      printWindow.document.close()

      toast(
        'Druckfenster geöffnet – dort PDF auswählen.'
      )

    }catch(error){

      toast(
        error instanceof Error
          ?error.message
          :'PDF konnte nicht geöffnet werden.',
        'error',
      )

    }finally{

      window.setTimeout(
        ()=>{
          setPdfBusy(false)
        },
        1000,
      )
    }
  }


  return <div className="page sales-report-page">

    <div className="page-head sales-report-page-head">

      <div>
        <h1>Verkaufstabelle</h1>

        <p>
          Wochenübersicht nach der
          bisherigen Papier-Vorlage.
          Es werden ausschließlich
          tatsächlich gespeicherte
          Verkäufe eingetragen.
        </p>
      </div>


      <button
        type="button"
        className="primary"
        onClick={()=>
          void exportPdf()
        }
        disabled={
          pdfBusy
          ||loading
        }
      >
        {pdfBusy
          ?<Loader2
            size={18}
            className="sales-report-spin"
          />
          :<FileDown size={18}/>
        }

        {pdfBusy
          ?'PDF wird erstellt …'
          :'PDF exportieren'}
      </button>

    </div>


    <div className="sales-report-toolbar">

      {me?.role==='TEAM_LEADER'&&
        <label>
          Mitarbeiter

          <select
            value={employeeId}
            onChange={event=>
              setEmployeeId(
                event.target.value
              )
            }
          >
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


      <div className="sales-report-week-nav">

        <button
          type="button"
          onClick={()=>
            setWeekOffset(
              value=>value-1
            )
          }
          title="Vorherige Woche"
        >
          <ChevronLeft size={18}/>
        </button>


        <div>
          <small>
            Verkaufswoche
          </small>

          <strong>
            {formatDate(weekStart)}
            {' – '}
            {formatDate(
              addDays(
                weekEnd,
                -1
              )
            )}
          </strong>
        </div>


        <button
          type="button"
          onClick={()=>
            setWeekOffset(
              value=>value+1
            )
          }
          title="Nächste Woche"
        >
          <ChevronRight size={18}/>
        </button>


        {weekOffset!==0&&
          <button
            type="button"
            onClick={()=>
              setWeekOffset(0)
            }
            title="Aktuelle Woche"
          >
            <RotateCcw size={17}/>
          </button>
        }

      </div>

    </div>


    {loading&&
      <div className="sales-report-loading">
        <Loader2
          size={22}
          className="sales-report-spin"
        />
        Verkaufstabelle wird geladen …
      </div>
    }


    <div className="sales-report-scroll">

      <div
        className="sales-week-sheet"
        ref={sheetRef}
      >

        <div className="sales-week-sheet-meta">
          <span>
            {selectedEmployeeName}
          </span>

          <span>
            {formatDate(weekStart)}
            {' – '}
            {formatDate(
              addDays(
                weekEnd,
                -1
              )
            )}
          </span>
        </div>


        <table className="sales-week-table">

          <colgroup>
            <col className="col-day"/>
            <col className="col-time"/>
            <col className="col-customer"/>

            <col className="col-mark"/>
            <col className="col-mark"/>
            <col className="col-mark"/>
            <col className="col-mark"/>
            <col className="col-mark"/>

            <col className="col-mark"/>
            <col className="col-mark"/>

            <col className="col-mark"/>
            <col className="col-mark"/>

            <col className="col-mark"/>
            <col className="col-mark"/>
            <col className="col-mark"/>

            <col className="col-mark"/>

            {PRODUCT_COLUMNS.map(
              column=>
                <col
                  key={column.key}
                  className="col-product"
                />
            )}

            <col className="col-units"/>
            <col className="col-revenue"/>
            <col className="col-revenue"/>
          </colgroup>


          <thead>

            <tr className="sales-sheet-group-row">

              <th
                rowSpan={2}
                className="sales-sheet-logo-cell"
              >
                <div className="sales-sheet-logo">
                  <i/>
                  <i/>
                  <i/>
                  <i/>
                </div>
              </th>

              <th
                rowSpan={2}
                className="sales-sheet-main-head"
              >
                Uhrzeit
              </th>

              <th
                rowSpan={2}
                className="sales-sheet-main-head"
              >
                Kunde, Anschrift
              </th>

              <th colSpan={5}>
                Kontaktweg
              </th>

              <th colSpan={2}>
                Kunde
              </th>

              <th colSpan={2}>
                Gebiet
              </th>

              <th colSpan={3}>
                Profi
              </th>

              <th colSpan={1}>
                Kunde
              </th>

              <th colSpan={8}>
                Vorgeführt = X /
                Verkauft = Anzahl
              </th>

              <th colSpan={3}>
                Einheiten und Umsätze
              </th>

            </tr>


            <tr className="sales-sheet-label-row">

              <th className="sheet-contact-promotion vertical">
                <span>Promotion</span>
              </th>

              <th className="sheet-contact-recommendation vertical">
                <span>Empfehlung</span>
              </th>

              <th className="sheet-contact-premium vertical">
                <span>Premium Check In</span>
              </th>

              <th className="sheet-contact-ko vertical">
                <span>KO Daten</span>
              </th>

              <th className="sheet-contact-aom vertical">
                <span>AOM</span>
              </th>

              <th className="vertical">
                <span>Zielkunde</span>
              </th>

              <th className="vertical">
                <span>Kunde</span>
              </th>

              <th className="vertical">
                <span>Festgebiet</span>
              </th>

              <th className="vertical">
                <span>Weißgebiet</span>
              </th>

              <th className="vertical">
                <span>Job Ticket</span>
              </th>

              <th className="sheet-profi-recommendation vertical">
                <span>Empfehlung</span>
              </th>

              <th className="sheet-profi-premium vertical">
                <span>Premium Check In</span>
              </th>

              <th className="vertical">
                <span>Altgeräte</span>
              </th>

              {PRODUCT_COLUMNS.map(
                column=>
                  <th
                    key={column.key}
                    className="vertical"
                  >
                    <span>
                      {column.label}
                    </span>
                  </th>
              )}

              <th>
                Einh.
              </th>

              <th>
                Umsatz
                <br/>
                Produkte
              </th>

              <th>
                Umsatz
                <br/>
                K70
              </th>

            </tr>

          </thead>


          <tbody>

            {DAYS.map(
              (dayName,dayIndex)=>{

                const day=
                  addDays(
                    weekStart,
                    dayIndex
                  )


                const dayRows=
                  actualRows.filter(
                    row=>
                      sameDay(
                        row.sale.sold_at,
                        day,
                      )
                  )


                const minimumRows=
                  dayIndex===6
                    ?3
                    :5


                const rowCount=
                  Math.max(
                    minimumRows,
                    dayRows.length,
                  )


                return Array
                  .from({
                    length:rowCount,
                  })
                  .map((_,rowIndex)=>{

                    const row=
                      dayRows[rowIndex]
                      ||null


                    return <tr
                      key={
                        `${dayName}-${rowIndex}-${row?.sale.id||'leer'}`
                      }
                      className={
                        rowIndex===rowCount-1
                          ?'sales-sheet-day-end'
                          :''
                      }
                    >

                      {rowIndex===0&&
                        <th
                          rowSpan={rowCount}
                          className="sales-sheet-day"
                        >
                          {dayName}
                        </th>
                      }


                      <td className="sales-sheet-time">
                        {row
                          ?formatTime(
                            row.sale.sold_at
                          )
                          :''
                        }
                      </td>


                      <td className="sales-sheet-customer">

                        {row&&
                          <>
                            <strong>
                              {row.customer?.full_name
                                ||row.sale.customer_name
                                ||''
                              }
                            </strong>

                            <small>
                              {customerAddress(
                                row.customer
                              )}
                            </small>
                          </>
                        }

                      </td>


                      <td className="sheet-contact-promotion">
                        {row?.metrics.promotion||''}
                      </td>

                      <td className="sheet-contact-recommendation">
                        {row?.metrics.recommendation||''}
                      </td>

                      <td className="sheet-contact-premium">
                        {row?.metrics.premium||''}
                      </td>

                      <td className="sheet-contact-ko">
                        {row?.metrics.koData||''}
                      </td>

                      <td className="sheet-contact-aom">
                        {row?.metrics.aom||''}
                      </td>

                      <td>
                        {row?.metrics.targetCustomer||''}
                      </td>

                      <td>
                        {row?.metrics.customer||''}
                      </td>

                      <td>
                        {row?.metrics.fixedArea||''}
                      </td>

                      <td>
                        {row?.metrics.whiteArea||''}
                      </td>

                      <td>
                        {row?.metrics.jobTicket||''}
                      </td>

                      <td className="sheet-profi-recommendation">
                        {row?.metrics.profiRecommendation||''}
                      </td>

                      <td className="sheet-profi-premium">
                        {row?.metrics.profiPremium||''}
                      </td>

                      <td>
                        {row?.metrics.oldDevice||''}
                      </td>


                      {PRODUCT_COLUMNS.map(
                        column=>
                          <td
                            key={column.key}
                            className="sales-sheet-product-cell"
                          >
                            {row
                              ?.metrics
                              .products[
                                column.key
                              ]
                              ||''
                            }
                          </td>
                      )}


                      <td className="sales-sheet-number">
                        {row
                          ?row.metrics.units
                          :''
                        }
                      </td>

                      <td className="sales-sheet-money">
                        {row&&row.metrics.productRevenue
                          ?money(
                            row.metrics.productRevenue
                          )
                          :''
                        }
                      </td>

                      <td className="sales-sheet-money">
                        {row&&row.metrics.k70Revenue
                          ?money(
                            row.metrics.k70Revenue
                          )
                          :''
                        }
                      </td>

                    </tr>
                  })
              }
            )}


            <tr className="sales-sheet-total-row">

              <th colSpan={3}>
                Summe
              </th>

              <td className="sheet-contact-promotion">
                {sumMark(
                  actualRows,
                  row=>
                    row.metrics.promotion
                )||''}
              </td>

              <td className="sheet-contact-recommendation">
                {sumMark(
                  actualRows,
                  row=>
                    row.metrics.recommendation
                )||''}
              </td>

              <td className="sheet-contact-premium">
                {sumMark(
                  actualRows,
                  row=>
                    row.metrics.premium
                )||''}
              </td>

              <td className="sheet-contact-ko">
                {sumMark(
                  actualRows,
                  row=>
                    row.metrics.koData
                )||''}
              </td>

              <td className="sheet-contact-aom">
                {sumMark(
                  actualRows,
                  row=>
                    row.metrics.aom
                )||''}
              </td>

              <td>
                {sumMark(
                  actualRows,
                  row=>
                    row.metrics.targetCustomer
                )||''}
              </td>

              <td>
                {sumMark(
                  actualRows,
                  row=>
                    row.metrics.customer
                )||''}
              </td>

              <td>
                {sumMark(
                  actualRows,
                  row=>
                    row.metrics.fixedArea
                )||''}
              </td>

              <td>
                {sumMark(
                  actualRows,
                  row=>
                    row.metrics.whiteArea
                )||''}
              </td>

              <td>
                {sumMark(
                  actualRows,
                  row=>
                    row.metrics.jobTicket
                )||''}
              </td>

              <td className="sheet-profi-recommendation">
                {sumMark(
                  actualRows,
                  row=>
                    row.metrics.profiRecommendation
                )||''}
              </td>

              <td className="sheet-profi-premium">
                {sumMark(
                  actualRows,
                  row=>
                    row.metrics.profiPremium
                )||''}
              </td>

              <td className="sales-sheet-alt-total">
                {sumMark(
                  actualRows,
                  row=>
                    row.metrics.oldDevice
                )||''}
              </td>


              {PRODUCT_COLUMNS.map(
                column=>
                  <td
                    key={column.key}
                    className="sales-sheet-number"
                  >
                    {sumProduct(
                      actualRows,
                      column.key
                    )||''}
                  </td>
              )}


              <td className="sales-sheet-number">
                {totalUnits||''}
              </td>

              <td className="sales-sheet-money">
                {totalProductRevenue
                  ?money(
                    totalProductRevenue
                  )
                  :''
                }
              </td>

              <td className="sales-sheet-money">
                {totalK70Revenue
                  ?money(
                    totalK70Revenue
                  )
                  :''
                }
              </td>

            </tr>

          </tbody>

        </table>


        <div className="sales-sheet-footnote">
          Vorgeführt = X · Verkauft = Anzahl ·
          ausschließlich tatsächlich gespeicherte Verkäufe
        </div>

      </div>

    </div>

  </div>
}
