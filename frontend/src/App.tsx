import {Navigate,Route,Routes,useLocation} from 'react-router-dom'
import {useAuth} from './lib/auth'
import {darfVerwalten, istSystemAdmin} from './lib/roles'
import {AppShell} from './components/AppShell'
import {LoginPage} from './pages/LoginPage'
import {DashboardPage} from './pages/DashboardPage'
import {AIPage} from './pages/AIPage'
import {AppointmentsPage} from './pages/AppointmentsPage'
import {RoutePlanningPage} from './pages/RoutePlanningPage'
import {CustomersPage} from './pages/CustomersPage'
import {CustomerDetailPage} from './pages/CustomerDetailPage'
import {CrmPipelinePage} from './pages/CrmPipelinePage'
import {FollowUpsPage} from './pages/FollowUpsPage'
import {HistoryPage} from './pages/HistoryPage'
import {ProductsPage} from './pages/ProductsPage'
import {OffersPage} from './pages/OffersPage'
import {SalesPage} from './pages/SalesPage'
import SalesReportPage from './pages/SalesReportPage'
import {RentalsPage} from './pages/RentalsPage'
import {BuntewochePage} from './pages/BuntewochePage'
import {MessagesPage} from './pages/MessagesPage'
import {ProfilePage} from './pages/ProfilePage'
import {TeamPage} from './pages/TeamPage'
import {TeamStatsPage} from './pages/TeamStatsPage'
import {AdminPage} from './pages/AdminPage'
import {ManagementCockpitPage} from './pages/ManagementCockpitPage'
import {ComparisonPage} from './pages/ComparisonPage'
import {TradeInsPage} from './pages/TradeInsPage'
import {ReportsPage} from './pages/ReportsPage'
import {SysAdminPage} from './pages/SysAdminPage'

function Guard(){const {me,loading}=useAuth();const location=useLocation();if(loading)return <div className="splash">OrgaBoard wird geladen…</div>;if(!me)return <Navigate to={{pathname:'/login',search:location.search}} replace/>;return <AppShell/>}
function SA({children}:{children:React.ReactNode}){const {me}=useAuth();return istSystemAdmin(me?.role)?<>{children}</>:<Navigate to="/" replace/>}
function TL({children}:{children:React.ReactNode}){const {me}=useAuth();return darfVerwalten(me?.role)?<>{children}</>:<Navigate to="/" replace/>}
// Ein Passwort-Reset-Link zeigt auf /login und muss dort auch dann noch
// funktionieren, wenn ausgerechnet dieser Browser gerade angemeldet ist -
// sonst würde ein angemeldeter Benutzer sofort zur Startseite umgeleitet und
// das Token wäre verloren, bevor die Seite es lesen konnte.
function LoginRoute(){const {me}=useAuth();const location=useLocation();const hatResetToken=new URLSearchParams(location.search).has('reset_token');if(me&&!hatResetToken)return <Navigate to="/" replace/>;return <LoginPage/>}
export default function App(){return <Routes><Route path="/login" element={<LoginRoute/>}/><Route element={<Guard/>}><Route index element={<DashboardPage/>}/><Route path="ki" element={<AIPage/>}/><Route path="termine" element={<AppointmentsPage/>}/><Route path="routenplanung" element={<RoutePlanningPage/>}/><Route path="kunden" element={<CustomersPage/>}/><Route path="kunden/:customerId" element={<CustomerDetailPage/>}/><Route path="pipeline" element={<CrmPipelinePage/>}/><Route path="nachfassen" element={<FollowUpsPage/>}/><Route path="verlauf" element={<HistoryPage/>}/><Route path="produkte" element={<ProductsPage/>}/><Route path="angebote" element={<OffersPage/>}/><Route path="verkaeufe" element={<SalesPage/>}/><Route path="verkaufstabelle" element={<SalesReportPage/>}/><Route path="berichte" element={<ReportsPage/>}/><Route path="verleih" element={<RentalsPage/>}/><Route path="altgeraete" element={<TradeInsPage/>}/><Route path="buntewoche" element={<BuntewochePage/>}/><Route path="nachrichten" element={<MessagesPage/>}/><Route path="profil" element={<ProfilePage/>}/><Route path="cockpit" element={<TL><ManagementCockpitPage/></TL>}/><Route path="vergleich" element={<TL><ComparisonPage/></TL>}/><Route path="team" element={<TL><TeamPage/></TL>}/><Route path="teamstatistiken" element={<TL><TeamStatsPage/></TL>}/><Route path="verwaltung" element={<TL><AdminPage/></TL>}/><Route path="system" element={<SA><SysAdminPage/></SA>}/></Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes>}
