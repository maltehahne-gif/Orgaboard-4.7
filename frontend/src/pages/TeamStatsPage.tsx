import {useCallback,useEffect,useState} from 'react'
import {Download} from 'lucide-react'
import {api,downloadFile,money} from '../lib/api'
import {StatCard} from '../components/StatCard'
import {TeamOverview} from '../components/TeamOverview'
import {LoadError} from '../components/LoadError'
import {useToast} from '../components/Toast'

type S={revenue_today_cents:number;revenue_week_cents:number;revenue_month_cents:number;units_week:number;employees:number;average_units_per_employee:number;units_target:number;units_percent:number}

export function TeamStatsPage(){
  const [s,setS]=useState<S|null>(null)
  const [fehler,setFehler]=useState<string|null>(null)
  const [exporting,setExporting]=useState(false)
  const toast=useToast()

  const laden=useCallback(()=>{
    setFehler(null)
    api<S>('/team/stats')
      .then(setS)
      .catch(err=>setFehler(err instanceof Error?err.message:'Die Teamstatistiken sind gerade nicht erreichbar.'))
  },[])

  useEffect(()=>{laden()},[laden])

  async function exportExcel(){
    setExporting(true)
    try{
      await downloadFile('/team/stats/export.xlsx','Teamstatistik.xlsx')
    }catch(error){
      toast(error instanceof Error?error.message:'Export fehlgeschlagen.','error')
    }finally{
      setExporting(false)
    }
  }

  if(fehler)return <div className="page">
    <div className="page-head"><div><h1>Teamstatistiken</h1><p>Aggregierte Teamkennzahlen aus Verkäufen.</p></div></div>
    <LoadError meldung={fehler} onRetry={laden}/>
  </div>

  if(!s)return <div className="loading">Teamstatistiken werden geladen…</div>

  return <div className="page">
    <div className="page-head">
      <div>
        <h1>Teamstatistiken</h1>
        <p>Aggregierte Teamkennzahlen aus Verkäufen.</p>
      </div>
      <button type="button" disabled={exporting} onClick={exportExcel}>
        <Download size={18}/>
        {exporting?'Export läuft …':'Excel exportieren'}
      </button>
    </div>
    <div className="stat-grid">
      <StatCard label="Teamumsatz heute" value={money(s.revenue_today_cents)} accent="green"/>
      <StatCard label="Teamumsatz Woche" value={money(s.revenue_week_cents)} accent="green"/>
      <StatCard label="Teamumsatz Monat" value={money(s.revenue_month_cents)}/>
      <StatCard label="Einheiten Team" value={`${s.units_week}`}/>
      <StatCard label="Mitarbeiter" value={`${s.employees}`}/>
      <StatCard label="Ø Einheiten / Mitarbeiter" value={`${s.average_units_per_employee}`}/>
    </div>
    <TeamOverview/>
  </div>
}
