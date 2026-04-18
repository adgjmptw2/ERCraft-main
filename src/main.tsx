import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { RankingPage } from '@/pages/RankingPage'
import './index.css'

const queryClient = new QueryClient()

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/player/:nickname', element: <ProfilePage /> },
  { path: '/ranking', element: <RankingPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  { path: '*', element: <NotFoundPage /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
