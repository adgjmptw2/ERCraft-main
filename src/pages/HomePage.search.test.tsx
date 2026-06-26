import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { HomePage } from '@/pages/HomePage'

const navigateMock = vi.fn()
const searchPlayersMock = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('@/api/erClient', () => ({
  isRealMode: () => true,
}))

vi.mock('@/api/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/player')>()
  return {
    ...actual,
    searchPlayers: (...args: unknown[]) => searchPlayersMock(...args),
  }
})

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/player/:nickname" element={<div>profile</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('HomePage search submit (real mode)', () => {
  it('자동완성 없이 검색 버튼으로 즉시 프로필 이동 — nickname only, search API 미대기', async () => {
    navigateMock.mockReset()
    searchPlayersMock.mockImplementation(() => new Promise(() => undefined))
    const user = userEvent.setup()
    renderHome()

    await user.type(screen.getByLabelText('닉네임'), '절단마술사')
    await user.click(screen.getByRole('button', { name: '검색' }))

    expect(searchPlayersMock).not.toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith(`/player/${encodeURIComponent('절단마술사')}`)
  })
})
