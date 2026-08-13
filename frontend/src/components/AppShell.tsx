import {
  BarChart3,
  Bot,
  CalendarDays,
  ContactRound,
  Gauge,
  History,
  Home,
  LogOut,
  Mail,
  Package,
  PackageCheck,
  Route as RouteIcon,
  Settings,
  ShoppingCart,
  Users,
} from 'lucide-react'
import {
  useEffect,
  useState,
} from 'react'
import {
  NavLink,
  Outlet,
} from 'react-router-dom'
import {useAuth} from '../lib/auth'
import {api} from '../lib/api'
import {connectRealtime} from '../lib/realtime'
import {Logo} from './Logo'
import {GlobalSearch} from './GlobalSearch'

const base=[
  ['/','Dashboard',Home],
  ['/ki','KI',Bot],
  ['/termine','Termine',CalendarDays],
  ['/routenplanung','Routenplanung',RouteIcon],
  ['/kunden','Kunden',ContactRound],
  ['/verlauf','Verlauf',History],
  ['/produkte','Produkte',Package],
  ['/verkaeufe','Verkäufe',ShoppingCart],
  ['/verleih','Verleih',PackageCheck],
  ['/buntewoche','Buntewoche',Gauge],
  ['/nachrichten','Nachrichten',Mail],
  ['/profil','Profil',Settings],
] as const

type Unread={
  total:number
}

export function AppShell(){
  const {me,logout}=useAuth()
  const [unreadMessages,setUnreadMessages]=useState(0)

  const links=me?.role==='TEAM_LEADER'
    ?[
      ...base.slice(0,-1),
      ['/team','Team',Users] as const,
      ['/teamstatistiken','Teamstatistiken',BarChart3] as const,
      base[base.length-1],
    ]
    :base

  useEffect(()=>{
    let active=true

    const load=()=>{
      api<Unread>('/messages/unread')
        .then(data=>{
          if(active)setUnreadMessages(data.total||0)
        })
        .catch(()=>{
          if(active)setUnreadMessages(0)
        })
    }

    load()

    const disconnect=connectRealtime(event=>{
      if(String(event.type||'').startsWith('message.')){
        load()
      }
    })

    return ()=>{
      active=false
      disconnect()
    }
  },[])

  const badge=unreadMessages>99
    ? '99+'
    : String(unreadMessages)

  return <div className="app-shell">
    <aside className="sidebar">
      <Logo/>

      <div className="profile-mini">
        <div className="avatar">
          {me?.full_name
            ?.split(' ')
            .map(x=>x[0])
            .slice(0,2)
            .join('')}
        </div>

        <div>
          <strong>{me?.full_name}</strong>
          <small>
            {me?.role==='TEAM_LEADER'
              ? 'Teamleiter'
              : 'Vertriebspartner'}
          </small>
        </div>
      </div>

      <nav>
        {links.map(([to,label,Icon])=>
          <NavLink
            key={to}
            to={to}
            end={to==='/'}
            className={({isActive})=>
              isActive?'active':''
            }
          >
            <Icon size={18}/>
            <span>{label}</span>

            {label==='Nachrichten'&&unreadMessages>0&&
              <span className="nav-message-badge">
                {badge}
              </span>
            }
          </NavLink>
        )}
      </nav>

      <button
        className="logout"
        onClick={logout}
      >
        <LogOut size={18}/>
        Abmelden
      </button>
    </aside>

    <div className="main">
      <header className="topbar">
        <GlobalSearch/>
        <div className="topbar-name">
          {me?.employee?.display_name}
        </div>
      </header>

      <main className="content">
        <Outlet/>
      </main>
    </div>

    <nav className="mobile-nav">
      {links.map(([to,label,Icon])=>
        <NavLink
          key={to}
          to={to}
          end={to==='/'}
        >
          <span className="mobile-nav-icon-wrap">
            <Icon size={20}/>

            {label==='Nachrichten'&&unreadMessages>0&&
              <span className="mobile-message-badge">
                {badge}
              </span>
            }
          </span>

          <span>{label}</span>
        </NavLink>
      )}

      <button
        type="button"
        className="mobile-logout-button"
        onClick={()=>logout()}
        aria-label="Abmelden"
        title="Abmelden"
      >
        <LogOut size={20}/>
        <span>Abmelden</span>
      </button>
    </nav>
  </div>
}
