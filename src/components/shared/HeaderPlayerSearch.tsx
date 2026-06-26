import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { buildPlayerProfilePath } from '@/utils/profilePath'

export function HeaderPlayerSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return

    if (trimmed.length < 2) {
      setError('닉네임은 2자 이상 입력해 주세요.')
      return
    }

    setError(null)
    navigate(buildPlayerProfilePath(trimmed))
  }

  return (
    <div className="relative min-w-0 flex-1 sm:w-44 sm:flex-none md:w-52">
      <form className="flex min-w-0 items-center gap-2" onSubmit={handleSubmit}>
        <Input
          aria-label="플레이어 검색"
          autoComplete="off"
          className={cn('h-9 min-w-0 flex-1 text-sm', error && 'border-destructive')}
          placeholder="닉네임 검색"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            if (error) setError(null)
          }}
        />
      </form>
      {error ? <p className="text-destructive absolute top-full mt-1 text-xs">{error}</p> : null}
    </div>
  )
}
