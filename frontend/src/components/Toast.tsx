import React,{createContext,useContext,useState} from 'react'
const C=createContext<(msg:string,kind?:'ok'|'error')=>void>(()=>{})
export function ToastProvider({children}:{children:React.ReactNode}){const [toast,setToast]=useState<{msg:string;kind:string}|null>(null);const show=(msg:string,kind:'ok'|'error'='ok')=>{setToast({msg,kind});window.setTimeout(()=>setToast(null),3500)};return <C.Provider value={show}>{children}{toast&&<div className={`toast ${toast.kind}`}>{toast.msg}</div>}</C.Provider>}
export const useToast=()=>useContext(C)
