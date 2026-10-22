import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AdminPage from './AdminPage'
import './index.css'

const isAdmin = window.location.pathname.replace(/\/+$/, '').endsWith('/admin')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isAdmin ? <AdminPage /> : <App />}
  </React.StrictMode>,
)
