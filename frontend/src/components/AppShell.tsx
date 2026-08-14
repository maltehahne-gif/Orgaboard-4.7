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
  Menu,
  Package,
  PackageCheck,
  Route as RouteIcon,
  Search,
  Settings,
  ShoppingCart,
  Table2,
  Users,
  X,
} from 'lucide-react'
import type {LucideIcon} from 'lucide-react'
import {useEffect, useState} from 'react'
import {NavLink, Outlet, useLocation} from 'react-router-dom'
import {useAuth} from '../lib/auth'
import {api} from '../lib/api'
import {connectRealtime} from '../lib/realtime'
import {GlobalSearch} from './GlobalSearch'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  short?: string
}

type NavGroup = {
  title: string | null
  items: NavItem[]
  teamLeaderOnly?: boolean
}

/**
 * Die Navigation ist nach Arbeitsabläufen gruppiert statt als eine lange Liste.
 * Ohne Gruppen standen 15 gleichwertige Einträge untereinander - Verlauf lag
 * zwischen Kunden und Produkten, Verkaufstabelle weit weg von Verkäufe.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [
      {to: '/', label: 'Dashboard', icon: Home},
      {to: '/ki', label: 'KI', icon: Bot},
    ],
  },
  {
    title: 'Tagesgeschäft',
    items: [
      {to: '/termine', label: 'Termine', icon: CalendarDays},
      {to: '/kunden', label: 'Kunden', icon: ContactRound},
      {to: '/routenplanung', label: 'Routenplanung', icon: RouteIcon, short: 'Route'},
      {to: '/nachrichten', label: 'Nachrichten', icon: Mail},
    ],
  },
  {
    title: 'Verkauf',
    items: [
      {to: '/verkaeufe', label: 'Verkäufe', icon: ShoppingCart},
      {to: '/verkaufstabelle', label: 'Verkaufstabelle', icon: Table2, short: 'Tabelle'},
      {to: '/produkte', label: 'Produkte', icon: Package},
      {to: '/verleih', label: 'Verleih', icon: PackageCheck},
      {to: '/buntewoche', label: 'Buntewoche', icon: Gauge},
    ],
  },
  {
    title: 'Team',
    teamLeaderOnly: true,
    items: [
      {to: '/team', label: 'Team', icon: Users},
      {to: '/teamstatistiken', label: 'Teamstatistiken', icon: BarChart3, short: 'Statistik'},
    ],
  },
  {
    title: 'Verwaltung',
    items: [
      {to: '/verlauf', label: 'Verlauf', icon: History},
      {to: '/profil', label: 'Profil', icon: Settings},
    ],
  },
]

// Auf dem Handy tragen fünf feste Reiter die Hauptwege. Alles Weitere liegt
// hinter "Mehr" - eine waagerecht scrollende Leiste mit 15 Zielen ist auf einem
// Telefon nicht bedienbar.
const MOBILE_TABS: NavItem[] = [
  {to: '/', label: 'Start', icon: Home},
  {to: '/termine', label: 'Termine', icon: CalendarDays},
  {to: '/kunden', label: 'Kunden', icon: ContactRound},
  {to: '/verkaeufe', label: 'Verkäufe', icon: ShoppingCart},
]

type Unread = {total: number}

function useUnreadMessages() {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let active = true

    const load = () => {
      api<Unread>('/messages/unread')
        .then(data => {
          if (active) setUnread(data.total || 0)
        })
        .catch(() => {
          if (active) setUnread(0)
        })
    }

    load()
    const disconnect = connectRealtime(event => {
      if (String(event.type || '').startsWith('message.')) load()
    })

    return () => {
      active = false
      disconnect()
    }
  }, [])

  return unread
}

function visibleGroups(isTeamLeader: boolean) {
  return NAV_GROUPS.filter(group => !group.teamLeaderOnly || isTeamLeader)
}

export function AppShell() {
  const {me, logout} = useAuth()
  const unread = useUnreadMessages()
  const location = useLocation()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  const isTeamLeader = me?.role === 'TEAM_LEADER'
  const groups = visibleGroups(isTeamLeader)
  const badge = unread > 99 ? '99+' : String(unread)

  // Beim Seitenwechsel schließen, sonst bleibt die Schublade über der neuen Seite.
  useEffect(() => {
    setDrawerOpen(false)
    setMobileSearchOpen(false)
  }, [location.pathname])

  // Hintergrund nicht mitscrollen lassen, solange die Schublade offen ist.
  useEffect(() => {
    document.body.classList.toggle('ob-scroll-locked', drawerOpen)
    return () => document.body.classList.remove('ob-scroll-locked')
  }, [drawerOpen])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const initials = me?.full_name
    ?.split(' ')
    .map(part => part[0])
    .slice(0, 2)
    .join('')

  const roleLabel = isTeamLeader ? 'Teamleiter' : 'Vertriebspartner'

  const navLink = (item: NavItem, onNavigate?: () => void) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      className={({isActive}) => (isActive ? 'ob-nav-link is-active' : 'ob-nav-link')}
    >
      <item.icon size={19} strokeWidth={1.9} aria-hidden="true" />
      <span className="ob-nav-label">{item.label}</span>
      {item.to === '/nachrichten' && unread > 0 && (
        <span className="ob-nav-badge">{badge}</span>
      )}
    </NavLink>
  )

  const activeTitle =
    groups
      .flatMap(group => group.items)
      .find(item =>
        item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
      )?.label ?? 'OrgaBoard'

  return (
    <div className="ob-shell">
      {/* ---------- Seitenleiste: Desktop und Tablet ---------- */}
      <aside className="ob-sidebar">
        <div className="ob-brand">
          <span className="ob-brand-mark" aria-hidden="true">
            <CalendarDays size={18} strokeWidth={2.2} />
          </span>
          <span className="ob-brand-text">
            <strong>OrgaBoard</strong>
            <small>Vertriebssystem</small>
          </span>
        </div>

        <NavLink to="/profil" className="ob-profile">
          <span className="ob-avatar">{initials}</span>
          <span className="ob-profile-text">
            <strong>{me?.full_name}</strong>
            <small>{roleLabel}</small>
          </span>
        </NavLink>

        <nav className="ob-nav" aria-label="Hauptnavigation">
          {groups.map(group => (
            <div className="ob-nav-group" key={group.title ?? 'start'}>
              {group.title && <p className="ob-nav-title">{group.title}</p>}
              {group.items.map(item => navLink(item))}
            </div>
          ))}
        </nav>

        <button className="ob-logout" onClick={logout}>
          <LogOut size={18} strokeWidth={1.9} aria-hidden="true" />
          <span className="ob-nav-label">Abmelden</span>
        </button>
      </aside>

      {/* ---------- Inhalt ---------- */}
      <div className="ob-main">
        <header className="ob-topbar">
          <button
            type="button"
            className="ob-icon-button ob-only-mobile"
            onClick={() => setDrawerOpen(true)}
            aria-label="Menü öffnen"
          >
            <Menu size={22} />
          </button>

          <span className="ob-topbar-title ob-only-mobile">{activeTitle}</span>

          <div className="ob-topbar-search">
            <GlobalSearch />
          </div>

          <button
            type="button"
            className="ob-icon-button ob-only-mobile"
            onClick={() => setMobileSearchOpen(open => !open)}
            aria-label={mobileSearchOpen ? 'Suche schließen' : 'Suchen'}
            aria-expanded={mobileSearchOpen}
          >
            {mobileSearchOpen ? <X size={22} /> : <Search size={22} />}
          </button>

          <span className="ob-topbar-name">{me?.employee?.display_name}</span>
        </header>

        {mobileSearchOpen && (
          <div className="ob-mobile-search">
            <GlobalSearch />
          </div>
        )}

        <main className="ob-content">
          <Outlet />
        </main>
      </div>

      {/* ---------- Reiterleiste: nur Handy ---------- */}
      <nav className="ob-tabbar" aria-label="Schnellzugriff">
        {MOBILE_TABS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({isActive}) => (isActive ? 'ob-tab is-active' : 'ob-tab')}
          >
            <item.icon size={21} strokeWidth={1.9} aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        ))}

        <button
          type="button"
          className={drawerOpen ? 'ob-tab is-active' : 'ob-tab'}
          onClick={() => setDrawerOpen(true)}
          aria-label="Weitere Bereiche"
        >
          <span className="ob-tab-icon-wrap">
            <Menu size={21} strokeWidth={1.9} aria-hidden="true" />
            {unread > 0 && <span className="ob-tab-dot" aria-hidden="true" />}
          </span>
          <span>Mehr</span>
        </button>
      </nav>

      {/* ---------- Schublade: alle Bereiche auf dem Handy ---------- */}
      <div
        className={drawerOpen ? 'ob-drawer-backdrop is-open' : 'ob-drawer-backdrop'}
        onClick={() => setDrawerOpen(false)}
      />

      <aside
        className={drawerOpen ? 'ob-drawer is-open' : 'ob-drawer'}
        aria-hidden={!drawerOpen}
      >
        <div className="ob-drawer-head">
          <NavLink to="/profil" className="ob-profile">
            <span className="ob-avatar">{initials}</span>
            <span className="ob-profile-text">
              <strong>{me?.full_name}</strong>
              <small>{roleLabel}</small>
            </span>
          </NavLink>

          <button
            type="button"
            className="ob-icon-button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Menü schließen"
          >
            <X size={22} />
          </button>
        </div>

        <nav className="ob-nav" aria-label="Alle Bereiche">
          {groups.map(group => (
            <div className="ob-nav-group" key={group.title ?? 'start'}>
              {group.title && <p className="ob-nav-title">{group.title}</p>}
              {group.items.map(item => navLink(item, () => setDrawerOpen(false)))}
            </div>
          ))}
        </nav>

        <button className="ob-logout" onClick={logout}>
          <LogOut size={18} strokeWidth={1.9} aria-hidden="true" />
          <span className="ob-nav-label">Abmelden</span>
        </button>
      </aside>
    </div>
  )
}
