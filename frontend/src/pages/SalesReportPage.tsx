

const exportPDF = async () => {
  const element = document.querySelector("table");

  if (!element) {
    alert("Keine Tabelle gefunden");
    return;
  }

  const canvas = await html2canvas(element, {
    scale: 2
  });

  const pdf = new jsPDF("landscape", "mm", "a4");

  const img = canvas.toDataURL("image/png");

  const width = pdf.internal.pageSize.getWidth();
  const height = canvas.height * width / canvas.width;

  pdf.addImage(img, "PNG", 0, 10, width, height);
  pdf.save("Export.pdf");
};

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

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


  
async function exportPdf() {
  try {
    const element = sheetRef.current;

    if (!element) {
      toast({
        title: "Fehler",
        description: "Verkaufstabelle konnte nicht gefunden werden.",
      });
      return;
    }

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const width = pdf.internal.pageSize.getWidth();
    const height = (canvas.height * width) / canvas.width;

    pdf.addImage(
      imgData,
      "PNG",
      5,
      5,
      width - 10,
      height
    );

    pdf.save(
      `Verkaufstabelle_${new Date()
        .toLocaleDateString("de-DE")
        .replaceAll(".", "-")}.pdf`
    );

    toast({
      title: "PDF erstellt",
      description: "Die Verkaufstabelle wurde heruntergeladen.",
    });

  } catch (error) {
    console.error(error);

    toast({
      title: "PDF Fehler",
      description: "PDF konnte nicht erstellt werden.",
    });
  }
}
