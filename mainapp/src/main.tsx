import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Toaster } from 'react-hot-toast';
import ScrollToTop from './components/ScrollToTop'; // Import ScrollToTop for UX improvement
import { ThemeProvider } from './context/ThemeProvider';
import { PreferencesProvider } from './context/PreferencesProvider';
// AuthProvider removed - using Redux for authentication
import { store, persistor } from './store/store';
import { queryClient } from './lib/reactQuery';
import { clearMockData } from './utils/clearMockData';
import { StorageManager } from './utils/storageManager';
import { tabSyncManager } from './utils/tabSyncManager';
import { secureStorage } from './utils/secureStorage';
import './index.css';
import App from './App.tsx';

// Clear mock data on app startup for production experience
clearMockData();

// Monitor localStorage usage and auto-cleanup if needed
StorageManager.monitor();

// Initialize multi-tab synchronization
tabSyncManager.initialize();

// Initialize secure storage (encryption) and migrate sensitive data
secureStorage.initialize().then(async () => {
  // Migrate any existing sensitive data to encrypted storage
  await StorageManager.migrateSensitiveData();
}).catch(error => {
  console.error('❌ Failed to initialize secure storage:', error);
});

// ============================================================================
// SERVICE WORKER REGISTRATION
// ============================================================================
/**
 * Register Service Worker for PWA capabilities
 * - Offline support
 * - Caching strategies
 * - Auto-updates on new deployments
 * - Only active in production builds
 */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // Import service worker registration from vite-plugin-pwa
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      immediate: true, // Auto-update
    });
  }).catch((error) => {
    console.error('Service Worker error:', error);
  });
}

/**
 * Application Root with Providers
 * 
 * Provider Hierarchy:
 * 1. StrictMode - React development checks
 * 2. Redux Provider - Global state management
 * 3. PersistGate - Redux persistence (localStorage)
 * 4. QueryClientProvider - React Query for data fetching & caching
 * 5. BrowserRouter - Routing
 * 6. ThemeProvider - Theme management (migrating to Redux)
 * 7. AuthProvider - Authentication (migrating to Redux)
 * 8. PreferencesProvider - User preferences (migrating to Redux)
 * 
 * Note: Context providers are kept for backward compatibility during migration
 * They will be removed once all components are migrated to Redux
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            {/* ScrollToTop ensures every route change starts at the top of the page */}
            <ScrollToTop />
            <ThemeProvider>
              <PreferencesProvider>
                <App />
                {/* SpeedInsights component for Vercel performance monitoring */}
                <SpeedInsights />
                {/* Toast Notifications */}
                <Toaster
                  position="top-right"
                  toastOptions={{
                    duration: 5000,
                    style: {
                      background: '#ffffff',
                      color: '#1f2937',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.75rem',
                      padding: '16px',
                    },
                    success: {
                      iconTheme: {
                        primary: '#10b981',
                        secondary: '#ffffff',
                      },
                    },
                    error: {
                      iconTheme: {
                        primary: '#ef4444',
                        secondary: '#ffffff',
                      },
                    },
                  }}
                />
              </PreferencesProvider>
            </ThemeProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </PersistGate>
    </Provider>
  </StrictMode>,
)
