import {Navigate,Route,Routes} from 'react-router-dom'
import {useAuth} from './lib/auth'
import {AppShell} from './components/AppShell'
import {LoginPage} from './pages/LoginPage'
import {DashboardPage} from './pages/DashboardPage'
import {AIPage} from './pages/AIPage'
import {AppointmentsPage} from './pages/AppointmentsPage'
import {RoutePlanningPage} from './pages/RoutePlanningPage'
import {CustomersPage} from './pages/CustomersPage'
import {HistoryPage} from './pages/HistoryPage'
import {ProductsPage} from './pages/ProductsPage'
import {SalesPage} from './pages/SalesPage'
import {RentalsPage} from './pages/RentalsPage'
import {BuntewochePage} from './pages/BuntewochePage'
import {MessagesPage} from './pages/MessagesPage'
import {ProfilePage} from './pages/ProfilePage'
import {TeamPage} from './pages/TeamPage'
import {TeamStatsPage} from './pages/TeamStatsPage'

function Guard(){const {me,loading}=useAuth();if(loading)return <div className="splash">OrgaBoard wird geladen…</div>;if(!me)return <Navigate to="/login" replace/>;return <AppShell/>}
function TL({children}:{children:React.ReactNode}){const {me}=useAuth();return me?.role==='TEAM_LEADER'?<>{children}</>:<Navigate to="/" replace/>}
export default function App(){const {me}=useAuth();return <Routes><Route path="/login" element={me?<Navigate to="/" replace/>:<LoginPage/>}/><Route element={<Guard/>}><Route index element={<DashboardPage/>}/><Route path="ki" element={<AIPage/>}/><Route path="termine" element={<AppointmentsPage/>}/><Route path="routenplanung" element={<RoutePlanningPage/>}/><Route path="kunden" element={<CustomersPage/>}/><Route path="verlauf" element={<HistoryPage/>}/><Route path="produkte" element={<ProductsPage/>}/><Route path="verkaeufe" element={<SalesPage/>}/><Route path="verleih" element={<RentalsPage/>}/><Route path="buntewoche" element={<BuntewochePage/>}/><Route path="nachrichten" element={<MessagesPage/>}/><Route path="profil" element={<ProfilePage/>}/><Route path="team" element={<TL><TeamPage/></TL>}/><Route path="teamstatistiken" element={<TL><TeamStatsPage/></TL>}/></Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes>}
