import { ViteReactSSG } from 'vite-react-ssg'
import { routes } from './routes'
import './index.css'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

if (!googleClientId) {
  console.warn('VITE_GOOGLE_CLIENT_ID missing — OAuth login will not work');
}

// Export for vite-react-ssg (replaces ReactDOM.createRoot)
export const createRoot = ViteReactSSG(
  { routes },
  // Setup fn: runs on both client and server
  ({ isClient }) => {
    if (isClient && googleClientId) {
      // GoogleOAuthProvider is mounted inside AppLayout conditionally
    }
  },
)
