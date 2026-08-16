import React from 'react'
import ReactDOM from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import App from './App'
import {AuthProvider} from './lib/auth'
import {ToastProvider} from './components/Toast'
import {ErrorBoundary} from './components/ErrorBoundary'
import './styles.css'
import './shell.css'
// Nach styles.css: die Anmeldeseite hat dort ueber die Zeit mehrere
// Gestaltungen angesammelt. Die aktuelle steht hier und gewinnt dadurch,
// ohne dass in der grossen Sammeldatei etwas umgeschrieben werden muss.
import './login.css'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><AuthProvider><ToastProvider><ErrorBoundary bereich="OrgaBoard"><App/></ErrorBoundary></ToastProvider></AuthProvider></BrowserRouter></React.StrictMode>)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
