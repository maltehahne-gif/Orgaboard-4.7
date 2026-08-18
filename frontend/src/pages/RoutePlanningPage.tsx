import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import {
  Apple,
  CalendarClock,
  Car,
  ChevronDown,
  ChevronUp,
  Clock3,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  Route,
  TriangleAlert,
} from 'lucide-react'

import {api} from '../lib/api'
import {appleMapsHref,googleMapsHref,telefonnummerBereinigen as cleanPhone} from '../lib/mobile'
import {calculateOrder,scheduleStops} from '../lib/route'
import type {Located,Position,StopPlan} from '../lib/route'
import {useAuth} from '../lib/auth'
import {darfVerwalten} from '../lib/roles'
import {useToast} from '../components/Toast'
import type {Appointment} from '../types'


type EmployeeOption={
  id:string
  display_name:string
}

/* Reihenfolge und Tagesplan liegen in lib/route.ts - dort sind sie ohne
   diese Seite prüfbar. Hier bleiben nur die Namen, die die Oberfläche
   ohnehin schon benutzt. */
type LocatedAppointment=Located<Appointment>
type PlannedStop=StopPlan<Appointment>

type UnresolvedStop={
  appointment:Appointment
  reason:string
}

type RoutePlan={
  start:Position
  stops:PlannedStop[]
  unresolved:UnresolvedStop[]
  geometry:[number,number][]
  totalDistanceKm:number
  totalTravelMinutes:number
  finishAt:string|null
  /* Fahrzeit- und Streckenmatrix bleiben erhalten, damit ein von Hand
     umsortierter Stopp seine Ankunftszeiten sofort neu berechnen kann,
     ohne den Routing-Dienst erneut zu befragen. */
  located:LocatedAppointment[]
  durations:number[][]
  distances:number[][]
  order:number[]
}




const geocodeCachePrefix =
  'orgaboard-route-geocode:'


function sleep(ms:number){
  return new Promise(resolve=>
    window.setTimeout(resolve,ms)
  )
}


function localDayBounds(){
  const start=new Date()
  start.setHours(0,0,0,0)

  const end=new Date(start)
  end.setDate(end.getDate()+1)

  return {
    start:start.toISOString(),
    end:end.toISOString(),
  }
}


function formatTime(value:string|null){
  if(!value)return '–'

  return new Intl.DateTimeFormat(
    'de-DE',
    {
      hour:'2-digit',
      minute:'2-digit',
    }
  ).format(new Date(value))
}


function escapeHtml(value:string){
  return value
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;")
}


function haversineKm(
  a:Position,
  b:Position,
){
  const radius=6371

  const toRad=(value:number)=>
    value*Math.PI/180

  const dLat=toRad(b.lat-a.lat)
  const dLon=toRad(b.lon-a.lon)

  const lat1=toRad(a.lat)
  const lat2=toRad(b.lat)

  const h=
    Math.sin(dLat/2)**2+
    Math.cos(lat1)*
    Math.cos(lat2)*
    Math.sin(dLon/2)**2

  return radius*
    2*
    Math.atan2(
      Math.sqrt(h),
      Math.sqrt(1-h),
    )
}


function fallbackLeg(
  a:Position,
  b:Position,
){
  const distanceKm=
    haversineKm(a,b)*1.22

  const travelMinutes=
    Math.max(
      2,
      Math.round(
        distanceKm/42*60+2
      )
    )

  return {
    distanceKm,
    travelMinutes,
  }
}


async function geocode(
  address:string,
):Promise<Position|null>{
  const normalized=
    address
      .trim()
      .toLowerCase()
      .replace(/\s+/g,' ')

  const cacheKey=
    geocodeCachePrefix+normalized

  const cached=
    sessionStorage.getItem(cacheKey)

  if(cached){
    try{
      return JSON.parse(cached)
    }catch{
      sessionStorage.removeItem(
        cacheKey
      )
    }
  }

  const url=
    'https://nominatim.openstreetmap.org/search'
    +`?format=jsonv2`
    +`&limit=1`
    +`&countrycodes=de`
    +`&q=${encodeURIComponent(address)}`

  const response=await fetch(
    url,
    {
      headers:{
        'Accept':'application/json',
        'Accept-Language':'de',
      },
    }
  )

  if(!response.ok){
    return null
  }

  const rows=
    await response.json()

  if(!Array.isArray(rows)||!rows.length){
    return null
  }

  const position={
    lat:Number(rows[0].lat),
    lon:Number(rows[0].lon),
  }

  if(
    !Number.isFinite(position.lat)
    ||!Number.isFinite(position.lon)
  ){
    return null
  }

  sessionStorage.setItem(
    cacheKey,
    JSON.stringify(position),
  )

  return position
}


async function getRouteMatrix(
  positions:Position[],
){
  const size=positions.length

  const durations:number[][]=
    Array.from(
      {length:size},
      ()=>Array(size).fill(0)
    )

  const distances:number[][]=
    Array.from(
      {length:size},
      ()=>Array(size).fill(0)
    )

  try{
    const coords=
      positions
        .map(
          point=>
            `${point.lon},${point.lat}`
        )
        .join(';')

    const response=await fetch(
      `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`
    )

    if(!response.ok){
      throw new Error(
        'Routing-Dienst nicht erreichbar'
      )
    }

    const data=await response.json()

    if(
      data.code!=='Ok'
      ||!Array.isArray(data.durations)
    ){
      throw new Error(
        'Keine Routing-Daten'
      )
    }

    for(let i=0;i<size;i++){
      for(let j=0;j<size;j++){
        const seconds=
          data.durations?.[i]?.[j]

        const metres=
          data.distances?.[i]?.[j]

        if(
          typeof seconds==='number'
          &&typeof metres==='number'
        ){
          durations[i][j]=
            seconds/60

          distances[i][j]=
            metres/1000
        }else{
          const fallback=
            fallbackLeg(
              positions[i],
              positions[j],
            )

          durations[i][j]=
            fallback.travelMinutes

          distances[i][j]=
            fallback.distanceKm
        }
      }
    }

  }catch{
    for(let i=0;i<size;i++){
      for(let j=0;j<size;j++){
        if(i===j)continue

        const fallback=
          fallbackLeg(
            positions[i],
            positions[j],
          )

        durations[i][j]=
          fallback.travelMinutes

        distances[i][j]=
          fallback.distanceKm
      }
    }
  }

  return {
    durations,
    distances,
  }
}




async function getGeometry(
  positions:Position[],
):Promise<[number,number][]>{
  if(positions.length<2){
    return []
  }

  try{
    const coords=
      positions
        .map(
          point=>
            `${point.lon},${point.lat}`
        )
        .join(';')

    const response=await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
    )

    if(!response.ok){
      throw new Error()
    }

    const data=
      await response.json()

    const coordinates=
      data.routes?.[0]
        ?.geometry
        ?.coordinates

    if(!Array.isArray(coordinates)){
      throw new Error()
    }

    return coordinates.map(
      (point:number[])=>
        [
          point[1],
          point[0],
        ] as [number,number]
    )

  }catch{
    return positions.map(
      point=>[
        point.lat,
        point.lon,
      ]
    )
  }
}


export function RoutePlanningPage(){
  const {me}=useAuth()
  const toast=useToast()

  const mapElement=
    useRef<HTMLDivElement|null>(
      null
    )

  const mapRef=
    useRef<L.Map|null>(
      null
    )

  const [employees,setEmployees]=
    useState<EmployeeOption[]>([])

  const [employeeId,setEmployeeId]=
    useState(
      me?.employee?.id||''
    )

  const [appointments,setAppointments]=
    useState<Appointment[]>([])

  const [plan,setPlan]=
    useState<RoutePlan|null>(null)

  const [loading,setLoading]=
    useState(false)

  const [locationStatus,setLocationStatus]=
    useState(
      'Standort noch nicht ermittelt'
    )


  useEffect(()=>{
    if(
      !darfVerwalten(me?.role)
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


  async function loadAppointments(){
    if(!employeeId){
      setAppointments([])
      return
    }

    try{
      const bounds=
        localDayBounds()

      const params=
        new URLSearchParams({
          start:bounds.start,
          end:bounds.end,
          employee_id:employeeId,
        })

      const rows=
        await api<Appointment[]>(
          `/appointments?${params.toString()}`
        )

      setAppointments(
        rows.filter(
          appointment=>
            appointment.status
              !=='completed'
            &&appointment.status
              !=='cancelled'
        )
      )

    }catch(error){
      toast(
        error instanceof Error
          ?error.message
          :'Termine konnten nicht geladen werden.',
        'error',
      )
    }
  }


  useEffect(()=>{
    setPlan(null)

    if(employeeId){
      void loadAppointments()
    }
  },[employeeId])


  const sortedAppointments=
    useMemo(
      ()=>[...appointments]
        .sort(
          (a,b)=>
            new Date(a.start_at)
              .getTime()
            -
            new Date(b.start_at)
              .getTime()
        ),
      [appointments],
    )


  async function buildPlan(
    start:Position,
  ){
    const located:
      LocatedAppointment[]=[]

    const unresolved:
      UnresolvedStop[]=[]

    for(
      let index=0;
      index<sortedAppointments.length;
      index++
    ){
      const appointment=
        sortedAppointments[index]

      if(!appointment.address){
        unresolved.push({
          appointment,
          reason:
            'Keine Adresse hinterlegt',
        })
        continue
      }

      try{
        const point=
          await geocode(
            appointment.address
          )

        if(point){
          located.push({
            appointment,
            ...point,
          })
        }else{
          unresolved.push({
            appointment,
            reason:
              'Adresse konnte nicht gefunden werden',
          })
        }
      }catch{
        unresolved.push({
          appointment,
          reason:
            'Adresse konnte nicht gefunden werden',
        })
      }

      if(
        index<
        sortedAppointments.length-1
      ){
        await sleep(1100)
      }
    }


    if(!located.length){
      setPlan({
        start,
        stops:[],
        unresolved,
        geometry:[],
        totalDistanceKm:0,
        totalTravelMinutes:0,
        finishAt:null,
        located:[],
        durations:[],
        distances:[],
        order:[],
      })
      return
    }


    const positions=[
      start,
      ...located.map(
        stop=>({
          lat:stop.lat,
          lon:stop.lon,
        })
      ),
    ]

    const {
      durations,
      distances,
    }=await getRouteMatrix(
      positions
    )

    const order=
      calculateOrder(
        located,
        durations,
        distances,
      )

    const schedule=
      scheduleStops(
        order,
        located,
        durations,
        distances,
      )

    const orderedPositions=[
      start,
      ...schedule.stops.map(
        stop=>({
          lat:stop.lat,
          lon:stop.lon,
        })
      ),
    ]

    const geometry=
      await getGeometry(
        orderedPositions
      )


    setPlan({
      start,
      unresolved,
      geometry,
      located,
      durations,
      distances,
      order,
      ...schedule,
    })
  }


  /**
   * Einen Stopp von Hand nach oben oder unten schieben.
   *
   * Die Zeiten werden sofort aus der gespeicherten Matrix neu gerechnet, der
   * Streckenverlauf auf der Karte danach nachgeladen - so bleibt die Liste
   * ohne Wartezeit bedienbar, auch wenn der Routing-Dienst gerade langsam ist.
   */
  function moveStop(
    position:number,
    direction:-1|1,
  ){
    if(!plan)return

    const target=position+direction
    if(target<0||target>=plan.order.length)return

    const order=[...plan.order]
    const merken=order[position]
    order[position]=order[target]
    order[target]=merken

    const schedule=
      scheduleStops(
        order,
        plan.located,
        plan.durations,
        plan.distances,
      )

    setPlan({...plan,order,...schedule})

    void getGeometry([
      plan.start,
      ...schedule.stops.map(
        stop=>({lat:stop.lat,lon:stop.lon})
      ),
    ]).then(geometry=>{
      setPlan(current=>
        current?{...current,geometry}:current
      )
    })
  }


  function requestRoute(){
    if(!employeeId){
      toast(
        'Bitte Mitarbeiter auswählen.',
        'error',
      )
      return
    }

    if(!navigator.geolocation){
      toast(
        'Standortermittlung wird auf diesem Gerät nicht unterstützt.',
        'error',
      )
      return
    }

    setLoading(true)
    setLocationStatus(
      'Aktueller Standort wird ermittelt …'
    )

    navigator.geolocation
      .getCurrentPosition(
        position=>{
          const start={
            lat:
              position.coords.latitude,
            lon:
              position.coords.longitude,
          }

          setLocationStatus(
            'Aktueller Standort erkannt'
          )

          void buildPlan(start)
            .then(()=>{
              toast(
                'Tagesroute wurde berechnet.'
              )
            })
            .catch(error=>{
              toast(
                error instanceof Error
                  ?error.message
                  :'Route konnte nicht berechnet werden.',
                'error',
              )
            })
            .finally(()=>{
              setLoading(false)
            })
        },

        error=>{
          setLoading(false)

          if(error.code===1){
            setLocationStatus(
              'Standortzugriff nicht erlaubt'
            )

            toast(
              'Bitte Standortzugriff im Browser erlauben.',
              'error',
            )
          }else{
            setLocationStatus(
              'Standort konnte nicht ermittelt werden'
            )

            toast(
              'Standort konnte nicht ermittelt werden.',
              'error',
            )
          }
        },

        {
          enableHighAccuracy:true,
          timeout:15000,
          maximumAge:60000,
        }
      )
  }


  useEffect(()=>{
    mapRef.current?.remove()
    mapRef.current=null

    if(
      !plan
      ||!plan.stops.length
      ||!mapElement.current
    ){
      return
    }

    const map=
      L.map(
        mapElement.current
      )

    mapRef.current=map

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom:19,
        attribution:
          '&copy; OpenStreetMap',
      }
    ).addTo(map)


    L.circleMarker(
      [
        plan.start.lat,
        plan.start.lon,
      ],
      {
        radius:9,
        weight:3,
        color:'#50dd89',
        fillColor:'#102c1d',
        fillOpacity:1,
      }
    )
      .addTo(map)
      .bindPopup(
        '<strong>Aktueller Standort</strong>'
      )


    for(const stop of plan.stops){
      const products=
        stop.appointment.products
          ?.length
          ?stop.appointment.products
            .map(product=>
              escapeHtml(product.name)
            )
            .join(', ')
          :'–'

      const phone=
        stop.appointment.phone
          ?`<br><a href="tel:${cleanPhone(stop.appointment.phone)}">${escapeHtml(stop.appointment.phone)}</a>`
          :''

      const icon=
        L.divIcon({
          className:
            'orgaboard-route-marker',

          html:
            `<span>${stop.sequence}</span>`,

          iconSize:[34,34],
          iconAnchor:[17,17],
        })

      L.marker(
        [
          stop.lat,
          stop.lon,
        ],
        {icon},
      )
        .addTo(map)
        .bindPopup(
          `<div class="route-popup">`
          +`<strong>${stop.sequence}. ${escapeHtml(stop.appointment.customer_name||'Termin')}</strong>`
          +`<br>${escapeHtml(stop.appointment.address||'')}`
          +`<br>Termin: ${formatTime(stop.appointment.start_at)} Uhr`
          +phone
          +`<br><small>Produkte: ${products}</small>`
          +`</div>`
        )
    }


    if(plan.geometry.length>1){
      L.polyline(
        plan.geometry.map(
          point=>[
            point[0],
            point[1],
          ] as L.LatLngExpression
        ),
        {
          color:'#2fd174',
          weight:5,
          opacity:.78,
        }
      ).addTo(map)
    }


    const bounds=
      L.latLngBounds([
        [
          plan.start.lat,
          plan.start.lon,
        ],
        ...plan.stops.map(
          stop=>[
            stop.lat,
            stop.lon,
          ] as L.LatLngExpression
        ),
      ])

    map.fitBounds(
      bounds,
      {
        padding:[35,35],
        maxZoom:14,
      }
    )

    window.setTimeout(
      ()=>map.invalidateSize(),
      100,
    )

    return ()=>{
      map.remove()

      if(mapRef.current===map){
        mapRef.current=null
      }
    }
  },[plan])


  function googleRouteUrl(){
    if(
      !plan
      ||!plan.stops.length
    ){
      return '#'
    }

    const last=
      plan.stops[
        plan.stops.length-1
      ]

    const params=
      new URLSearchParams({
        api:'1',

        origin:
          `${plan.start.lat},${plan.start.lon}`,

        destination:
          `${last.lat},${last.lon}`,

        travelmode:'driving',
      })

    const waypoints=
      plan.stops
        .slice(0,-1)
        .map(
          stop=>
            `${stop.lat},${stop.lon}`
        )
        .join('|')

    if(waypoints){
      params.set(
        'waypoints',
        waypoints,
      )
    }

    return (
      'https://www.google.com/maps/dir/?'
      +params.toString()
    )
  }


  return <div className="page route-planning-page">

    <div className="page-head route-planning-head">
      <div>
        <h1>Routenplanung</h1>

        <p>
          Die heutigen Kundentermine
          sinnvoll und zeitsparend anfahren.
        </p>
      </div>

      <button
        type="button"
        className="primary route-main-button"
        disabled={
          loading
          ||!employeeId
        }
        onClick={requestRoute}
      >
        {loading
          ?<RefreshCw
            size={18}
            className="route-loading-icon"
          />
          :<LocateFixed size={18}/>
        }

        {loading
          ?'Route wird berechnet …'
          :'Standort verwenden & Route planen'}
      </button>
    </div>


    {darfVerwalten(me?.role)&&
      <section className="card route-employee-select">
        <label>
          Route für Mitarbeiter

          <select
            value={employeeId}
            onChange={event=>
              setEmployeeId(
                event.target.value
              )
            }
          >
            <option value="">
              Mitarbeiter auswählen
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
      </section>
    }


    <div className="route-location-line">
      <LocateFixed size={15}/>

      <span>
        {locationStatus}
      </span>
    </div>


    {!plan&&
      <div className="route-start-grid">

        <section className="card route-today-card">
          <div className="section-title">
            <CalendarClock size={20}/>
            <h2>Termine heute</h2>
          </div>

          {!sortedAppointments.length&&
            <div className="route-empty-state">
              <MapPin size={32}/>

              <strong>
                Keine offenen Termine heute
              </strong>
            </div>
          }

          {sortedAppointments.map(
            (appointment,index)=>
              <div
                className="route-today-row"
                key={appointment.id}
              >
                <span>
                  {index+1}
                </span>

                <div>
                  <strong>
                    {appointment.customer_name
                      ||'Termin'}
                  </strong>

                  <small>
                    {formatTime(
                      appointment.start_at
                    )} Uhr
                    {' · '}
                    {appointment.address
                      ||'Keine Adresse hinterlegt'}
                  </small>
                </div>
              </div>
          )}
        </section>


        <section className="card route-explanation">
          <Route size={34}/>

          <h2>
            Optimale Tagesroute
          </h2>

          <p>
            OrgaBoard berücksichtigt
            Fahrstrecken und die vereinbarten
            Terminzeiten.
          </p>

          <p>
            Verspätungen werden bei der
            Reihenfolge besonders stark
            berücksichtigt.
          </p>
        </section>

      </div>
    }


    {plan&&
      <>
        <div className="route-summary">

          <section className="card">
            <MapPin size={20}/>
            <strong>
              {plan.stops.length}
            </strong>
            <span>Kundenstopps</span>
          </section>

          <section className="card">
            <Route size={20}/>
            <strong>
              {plan.totalDistanceKm
                .toLocaleString(
                  'de-DE',
                  {
                    maximumFractionDigits:1,
                  }
                )} km
            </strong>
            <span>Gesamtstrecke</span>
          </section>

          <section className="card">
            <Car size={20}/>
            <strong>
              {plan.totalTravelMinutes} min
            </strong>
            <span>Fahrzeit</span>
          </section>

          <section className="card">
            <Clock3 size={20}/>
            <strong>
              {formatTime(plan.finishAt)} Uhr
            </strong>
            <span>voraussichtlich fertig</span>
          </section>

        </div>


        {!!plan.stops.length&&
          <div className="route-map-buttons">

            <a
              className="primary"
              href={googleRouteUrl()}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation size={17}/>
              Komplette Route in Google Maps
            </a>

            <a
              href={appleMapsHref(
                plan.stops[0].lat,
                plan.stops[0].lon,
              )}
              target="_blank"
              rel="noreferrer"
            >
              <Apple size={17}/>
              Nächster Stopp in Apple Maps
            </a>

            <button
              type="button"
              onClick={requestRoute}
              disabled={loading}
            >
              <RefreshCw size={17}/>
              Neu berechnen
            </button>

          </div>
        }


        {!!plan.stops.length&&
          <section className="card route-map-box">

            <div className="route-map-head">
              <div>
                <h2>Routenvorschau</h2>
                <p>
                  Startpunkt und alle
                  Kundenstopps des Tages
                </p>
              </div>

              <small>
                OpenStreetMap
              </small>
            </div>

            <div
              ref={mapElement}
              className="route-map-canvas"
            />

          </section>
        }


        <section className="route-order-section">

          <div className="route-order-head">
            <h2>
              Empfohlene Reihenfolge
            </h2>

            <p>
              Terminzeiten haben Vorrang vor
              einer rein kürzesten Strecke.
            </p>
          </div>


          {!plan.stops.length&&
            <div className="card route-empty-state">
              <MapPin size={32}/>
              <strong>
                Keine planbaren Stopps
              </strong>
            </div>
          }


          <div className="route-stop-list">

            {plan.stops.map((stop,position)=>{
              const appointment=
                stop.appointment

              const isLate=
                stop.lateMinutes>0

              const hasWait=
                !isLate
                &&stop.waitMinutes>0

              return <article
                className="card route-stop"
                key={appointment.id}
              >

                <div className="route-stop-order">
                  <button
                    type="button"
                    className="route-move"
                    onClick={()=>moveStop(position,-1)}
                    disabled={position===0}
                    aria-label="Stopp nach vorne verschieben"
                    title="Stopp nach vorne verschieben"
                  >
                    <ChevronUp size={15}/>
                  </button>

                  <div className="route-stop-number">
                    {stop.sequence}
                  </div>

                  <button
                    type="button"
                    className="route-move"
                    onClick={()=>moveStop(position,1)}
                    disabled={position===plan.stops.length-1}
                    aria-label="Stopp nach hinten verschieben"
                    title="Stopp nach hinten verschieben"
                  >
                    <ChevronDown size={15}/>
                  </button>
                </div>

                <div className="route-stop-content">

                  <div className="route-stop-title">
                    <div>
                      <h3>
                        {appointment.customer_name
                          ||'Termin'}
                      </h3>

                      <p>
                        <MapPin size={14}/>
                        {appointment.address}
                      </p>
                    </div>

                    <span className={
                      isLate
                        ?'route-status late'
                        :hasWait
                          ?'route-status wait'
                          :'route-status good'
                    }>
                      {isLate
                        ?`${stop.lateMinutes} Min. verspätet`
                        :hasWait
                          ?`${stop.waitMinutes} Min. Puffer`
                          :'Zeitlich passend'}
                    </span>
                  </div>


                  <div className="route-stop-data">

                    <span>
                      <Car size={15}/>
                      {stop.travelMinutes}
                      {' '}Min. Fahrt
                    </span>

                    <span>
                      {stop.distanceKm}
                      {' '}km
                    </span>

                    <span>
                      <Clock3 size={15}/>
                      Ankunft
                      {' '}
                      {formatTime(
                        stop.arrivalAt
                      )}
                    </span>

                    <strong>
                      Termin
                      {' '}
                      {formatTime(
                        appointment.start_at
                      )}
                    </strong>

                  </div>


                  {!!appointment.products?.length&&
                    <div className="route-product-list">
                      <small>
                        Produkte beim Termin
                      </small>

                      <div>
                        {appointment.products
                          .map(product=>
                            <span
                              key={product.id}
                            >
                              {product.name}
                            </span>
                          )
                        }
                      </div>
                    </div>
                  }


                  <div className="route-stop-buttons">

                    {appointment.phone&&
                      <a
                        href={`tel:${cleanPhone(appointment.phone)}`}
                      >
                        <Phone size={16}/>
                        Anrufen
                      </a>
                    }

                    {/* Beide ohne Startpunkt: die Karten-App nimmt den
                        aktuellen Standort. Vorher begann die Apple-Route
                        immer am Tagesstart - vom vierten Stopp aus also
                        von zu Hause -, und Google zeigte über /search/
                        nur eine Stecknadel statt einer Wegbeschreibung. */}
                    <a
                      href={appleMapsHref(stop.lat,stop.lon)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Apple size={16}/>
                      Apple Maps
                    </a>

                    <a
                      href={googleMapsHref(stop.lat,stop.lon)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Navigation size={16}/>
                      Google Maps
                    </a>

                  </div>

                </div>

              </article>
            })}

          </div>

        </section>


        {!!plan.unresolved.length&&
          <section className="card route-warning">

            <div className="section-title">
              <TriangleAlert size={20}/>
              <h2>Adressen prüfen</h2>
            </div>

            <p>
              Diese Termine konnten nicht
              automatisch auf der Karte
              gefunden werden:
            </p>

            {plan.unresolved.map(
              item=>
                <div
                  className="route-warning-row"
                  key={item.appointment.id}
                >
                  <div>
                    <strong>
                      {item.appointment.customer_name
                        ||'Termin'}
                    </strong>

                    <small>
                      {formatTime(
                        item.appointment.start_at
                      )} Uhr
                      {' · '}
                      {item.appointment.address
                        ||'Keine Adresse'}
                    </small>
                  </div>

                  <span>
                    {item.reason}
                  </span>
                </div>
            )}

          </section>
        }

      </>
    }

  </div>
}
