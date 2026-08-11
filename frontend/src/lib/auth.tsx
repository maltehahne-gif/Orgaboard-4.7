import React, {createContext, useContext, useEffect, useState} from 'react'
import {api} from './api'
import type {Me} from '../types'

type AuthValue={me:Me|null;loading:boolean;login:(email:string,password:string)=>Promise<void>;logout:()=>Promise<void>;refresh:()=>Promise<void>}
const AuthContext=createContext<AuthValue|null>(null)

export function AuthProvider({children}:{children:React.ReactNode}){
  const [me,setMe]=useState<Me|null>(null); const [loading,setLoading]=useState(true)
  const refresh=async()=>{try{setMe(await api<Me>('/auth/me'))}catch{setMe(null)}}
  useEffect(()=>{refresh().finally(()=>setLoading(false))},[])
  const login=async(email:string,password:string)=>{setMe(await api<Me>('/auth/login',{method:'POST',body:JSON.stringify({email,password})}))}
  const logout=async()=>{await api('/auth/logout',{method:'POST'});setMe(null)}
  return <AuthContext.Provider value={{me,loading,login,logout,refresh}}>{children}</AuthContext.Provider>
}
export function useAuth(){const v=useContext(AuthContext);if(!v)throw new Error('AuthProvider fehlt');return v}
