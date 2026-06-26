import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { HeaderPlayerSearch } from '@/components/shared/HeaderPlayerSearch'

const navigateMock = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

describe('HeaderPlayerSearch', () => {
  it('검색 submit은 API를 await하지 않고 즉시 navigate', async () => {
    navigateMock.mockReset()
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HeaderPlayerSearch />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('플레이어 검색'), 'fencing')
    await user.keyboard('{Enter}')

    expect(navigateMock).toHaveBeenCalledWith(`/player/${encodeURIComponent('fencing')}`)
  })
})
