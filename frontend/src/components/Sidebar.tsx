import {
  Home,
  Bot,
  CalendarDays,
  Users,
  Route,
  Mail,
  ShoppingCart,
  Package,
  Star,
  History,
  User,
  Plus,
  FileText,
  Table2,
  ChevronRight,
  ChevronDown
} from "lucide-react"

import {NavLink} from "react-router-dom"
import {useState} from "react"

const mainItems = [
  {title:"Dashboard",path:"/",icon:Home},
  {title:"KI",path:"/ai",icon:Bot},
]

const dailyItems = [
  {title:"Termine",path:"/appointments",icon:CalendarDays},
  {title:"Kunden",path:"/customers",icon:Users},
  {title:"Routenplanung",path:"/routes",icon:Route},
  {title:"Nachrichten",path:"/messages",icon:Mail,badge:3},
]

const salesItems = [
  {title:"Neuer Verkauf",path:"/sales/new",icon:Plus},
  {title:"Verkaufsübersicht",path:"/sales",icon:FileText},
  {title:"Verkaufstabelle",path:"/sales/table",icon:Table2},
  {title:"Rechnungen / PDFs",path:"/invoices",icon:FileText},
]


export default function Sidebar(){

 const [salesOpen,setSalesOpen]=useState(true)

 return (
  <aside className="
    w-[290px]
    min-h-screen
    bg-[#081014]
    border-r border-white/10
    text-white
    px-5 py-6
    backdrop-blur-xl
  ">

    {/* Logo */}
    <div className="
      flex items-center gap-3
      mb-8
    ">
      <div className="
        w-11 h-11
        rounded-2xl
        bg-green-500
        flex items-center justify-center
        shadow-lg shadow-green-500/30
      ">
        <span className="font-bold text-black">
          O
        </span>
      </div>

      <div>
        <h1 className="font-semibold text-xl">
          OrgaBoard
        </h1>
        <p className="text-xs text-white/50">
          Vertriebssystem
        </p>
      </div>
    </div>


    {/* Profil */}
    <div className="
      flex items-center gap-3
      p-3
      rounded-2xl
      bg-white/5
      mb-8
      hover:bg-white/10
      transition
    ">
      <div className="
        w-10 h-10
        rounded-full
        border border-green-400
        flex items-center justify-center
      ">
        BH
      </div>

      <div>
        <div className="font-medium">
          Björn Hahne
        </div>
        <div className="text-xs text-white/50">
          Vertriebspartner
        </div>
      </div>
    </div>



    <Section title="HAUPTMENÜ"/>

    {mainItems.map(item=>(
      <MenuItem key={item.title} {...item}/>
    ))}



    <Section title="TAGESGESCHÄFT"/>

    {dailyItems.map(item=>(
      <MenuItem key={item.title} {...item}/>
    ))}



    <Section title="VERKAUF"/>

    <button
      onClick={()=>setSalesOpen(!salesOpen)}
      className="
      w-full
      flex items-center justify-between
      px-4 py-3
      rounded-2xl
      bg-green-600/20
      hover:bg-green-600/30
      transition
      "
    >
      <span className="flex items-center gap-3">
        <ShoppingCart size={20}/>
        Verkäufe
      </span>

      {salesOpen
      ?<ChevronDown size={18}/>
      :<ChevronRight size={18}/>
      }

    </button>



    <div className={`
      overflow-hidden
      transition-all duration-300
      ${salesOpen?"max-h-80 mt-2":"max-h-0"}
    `}>

      <div className="
        ml-4
        border-l
        border-green-500/40
        pl-4
      ">

      {salesItems.map(item=>(
        <MenuItem key={item.title} {...item} small/>
      ))}

      </div>

    </div>



    <Section title="VERWALTUNG"/>

    <MenuItem
      title="Verlauf"
      path="/history"
      icon={History}
    />

    <MenuItem
      title="Profil"
      path="/profile"
      icon={User}
    />


  </aside>
 )
}



function Section({title}:{title:string}){
 return (
  <div className="
    text-xs
    text-white/40
    mt-6 mb-3
    tracking-widest
  ">
    {title}
  </div>
 )
}



function MenuItem({
 title,
 path,
 icon:Icon,
 badge,
 small
}:any){

return(
 <NavLink
 to={path}
 className={({isActive})=>`
 ${small?"text-sm":"text-base"}
 flex items-center justify-between
 px-4 py-3
 rounded-2xl
 mb-1
 transition-all duration-300
 hover:bg-white/10
 ${
 isActive
 ?"bg-green-500 text-black shadow-lg shadow-green-500/20"
 :"text-white/80"
 }
 `}
 >

 <span className="flex items-center gap-3">
  <Icon size={20}/>
  {title}
 </span>


 {badge &&
 <span className="
 bg-green-500
 text-black
 text-xs
 rounded-full
 px-2 py-1
 ">
 {badge}
 </span>
 }


 </NavLink>
)

}
