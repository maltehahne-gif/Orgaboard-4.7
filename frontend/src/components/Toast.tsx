import React,{createContext,useCallback,useContext,useEffect,useRef,useState} from 'react'

const C=createContext<(msg:string,kind?:'ok'|'error')=>void>(()=>{})

export function ToastProvider({children}:{children:React.ReactNode}){
  const [toast,setToast]=useState<{msg:string;kind:string}|null>(null)
  const zeitgeber=useRef<number|undefined>(undefined)

  /* Die Meldefunktion behält ihre Kennung. Vorher entstand sie bei jedem
     Rendern neu; damit änderte sich der Kontextwert, sobald eine Meldung
     erschien oder wieder verschwand. Jede Seite, die toast in einer
     Abhängigkeitsliste führt - Termine, Rechnungen, Kunden -, lud daraufhin
     ihre Daten neu und baute die WebSocket-Verbindung neu auf. Zweimal je
     Meldung, ohne dass sich irgendetwas geändert hätte. */
  const show=useCallback((msg:string,kind:'ok'|'error'='ok')=>{
    setToast({msg,kind})
    // Der alte Zeitgeber muss weg: sonst räumt er die gerade erst
    // erschienene Meldung nach dem Rest seiner Laufzeit ab.
    window.clearTimeout(zeitgeber.current)
    zeitgeber.current=window.setTimeout(()=>setToast(null),3500)
  },[])

  useEffect(()=>()=>window.clearTimeout(zeitgeber.current),[])

  return <C.Provider value={show}>{children}{toast&&<div className={`toast ${toast.kind}`}>{toast.msg}</div>}</C.Provider>
}

export const useToast=()=>useContext(C)
