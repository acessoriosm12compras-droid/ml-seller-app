import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// O tema (claro/escuro) é aplicado antes do paint por um script no index.html
// e gerenciado em runtime pelo ThemeContext.

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
