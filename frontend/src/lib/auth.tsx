import React, {createContext, useContext, useEffect, useState} from 'react'
import {AUTH_EXPIRED_EVENT, api} from './api'
import type {Me} from '../types'

type AuthValue={me:Me|null;loading:boolean;login:(email:string,password:string,rememberMe?:boolean)=>Promise<void>;logout:()=>Promise<void>;refresh:()=>Promise<void>}
const AuthContext=createContext<AuthValue|null>(null)

export function AuthProvider({children}:{children:React.ReactNode}){
  const [me,setMe]=useState<Me|null>(null); const [loading,setLoading]=useState(true)
  const refresh=async()=>{try{setMe(await api<Me>('/auth/me'))}catch{setMe(null)}}
  useEffect(()=>{refresh().finally(()=>setLoading(false))},[])

  // Zentrale Behandlung einer abgelaufenen Sitzung: jeder Aufruf über
  // lib/api meldet ein eigenes 401 hier statt an jede Seite einzeln. Den
  // Zustand einfach zu leeren reicht - App.tsx leitet einen Benutzer ohne
  // "me" ohnehin schon zum Login um, hier ist also keine zusätzliche
  // Navigation nötig, und es entsteht kein Redirect-Flackern durch zwei
  // Stellen, die gleichzeitig etwas am Pfad ändern wollen.
  useEffect(()=>{
    const aufSitzungsablauf=()=>setMe(null)
    window.addEventListener(AUTH_EXPIRED_EVENT,aufSitzungsablauf)
    return ()=>window.removeEventListener(AUTH_EXPIRED_EVENT,aufSitzungsablauf)
  },[])

  const login=async(email:string,password:string,rememberMe=true)=>{setMe(await api<Me>('/auth/login',{method:'POST',body:JSON.stringify({email,password,remember_me:rememberMe})}))}
  const logout=async()=>{await api('/auth/logout',{method:'POST'});setMe(null)}
  return <AuthContext.Provider value={{me,loading,login,logout,refresh}}>{children}</AuthContext.Provider>
}
export function useAuth(){const v=useContext(AuthContext);if(!v)throw new Error('AuthProvider fehlt');return v}
