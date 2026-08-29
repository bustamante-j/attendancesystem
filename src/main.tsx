import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './app/App'
import { ConfirmProvider } from './components/ConfirmDialog'
import { AuthProvider } from './features/auth/AuthProvider'
import { PwaProvider } from './features/pwa/PwaProvider'
import { ThemeProvider } from './features/theme/ThemeProvider'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <PwaProvider>
        <BrowserRouter>
          <AuthProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </AuthProvider>
        </BrowserRouter>
      </PwaProvider>
    </ThemeProvider>
  </StrictMode>,
)
