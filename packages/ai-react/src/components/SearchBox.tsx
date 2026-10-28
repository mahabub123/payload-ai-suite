'use client'
import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { OfferingSummary } from 'payload-ai-core/wire'
import { formatMoney } from '../format'
import { useSearch } from '../hooks/useSearch'
import type { UseSearchOptions } from '../hooks/useSearch'
import { useSearchEvents } from '../hooks/useSearchEvents'
import { useAISuite } from '../provider'
import { labelsFor } from './labels'
import { AISuiteStyles } from './styles'

export interface SearchBoxProps extends Omit<UseSearchOptions, 'initialQuery'> {
  placeholder?: string
  className?: string
  /** Default: navigate to item.url. */
  onSelect?: (item: OfferingSummary) => void
  /** Called on Enter without a highlighted result (e.g. go to the results page). */
  onSubmit?: (query: string) => void
  defaultStyles?: boolean
  /** Max items in the dropdown. Default 6. */
  maxItems?: number
}

/** Instant-search combobox with keyboard navigation and click tracking. */
export const SearchBox = ({ placeholder, className, onSelect, onSubmit, defaultStyles = true, maxItems = 6, ...searchOpts }: SearchBoxProps) => {
  const client = useAISuite()
  const labels = labelsFor(client.config.locale)
  const s = useSearch({ limit: maxItems, ...searchOpts })
  const events = useSearchEvents()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const id = useId()
  const items = s.items.slice(0, maxItems)
  const expanded = open && s.query.trim().length > 0 && (items.length > 0 || !s.loading)

  const choose = (item: OfferingSummary, position: number) => {
    events.trackClick(item.id, { position, query: s.query, searchId: s.searchId })
    setOpen(false)
    if (onSelect) onSelect(item)
    else if (item.url && typeof window !== 'undefined') window.location.assign(item.url)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, -1))
    } else if (e.key === 'Enter') {
      if (active >= 0 && items[active]) {
        e.preventDefault()
        choose(items[active], active)
      } else if (onSubmit) {
        e.preventDefault()
        setOpen(false)
        onSubmit(s.query)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <div className={`ais-root ais-search${className ? ` ${className}` : ''}`}>
      {defaultStyles ? <AISuiteStyles /> : null}
      <input
        className="ais-input"
        type="search"
        role="combobox"
        aria-label={placeholder ?? labels.search}
        aria-expanded={expanded}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
        placeholder={placeholder ?? labels.search}
        value={s.query}
        onChange={(e) => {
          s.setQuery(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
      />
      {expanded ? (
        <ul id={`${id}-list`} role="listbox" className="ais-dropdown" aria-busy={s.loading}>
          {items.length ? (
            items.map((it, i) => (
              <li
                key={it.id}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                className="ais-option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(it, i)}
              >
                {it.imageUrl ? <img src={it.imageUrl} alt="" /> : null}
                <span style={{ flex: 1 }}>{it.title}</span>
                {it.price ? <span className="ais-price">{formatMoney(it.price, client.config.locale)}</span> : null}
              </li>
            ))
          ) : (
            <li className="ais-option" role="option" aria-selected={false} aria-disabled>
              {labels.noResults}
            </li>
          )}
        </ul>
      ) : null}
    </div>
  )
}
