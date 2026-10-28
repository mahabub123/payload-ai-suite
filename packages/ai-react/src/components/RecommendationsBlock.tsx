'use client'
import { useRecommendations } from '../hooks/useRecommendations'
import type { UseRecommendationsOptions } from '../hooks/useRecommendations'
import { useAISuite } from '../provider'
import { ProductsCard } from './cards'
import { AISuiteStyles } from './styles'

export interface RecommendationsBlockProps extends UseRecommendationsOptions {
  title?: string
  className?: string
  defaultStyles?: boolean
}

/** "Similar items" / "Bought together" / "For you" block. Renders nothing when empty. */
export const RecommendationsBlock = ({ title, className, defaultStyles = true, ...opts }: RecommendationsBlockProps) => {
  const client = useAISuite()
  const { items } = useRecommendations(opts)
  if (!items.length) return null
  return (
    <section className={`ais-root${className ? ` ${className}` : ''}`} aria-label={title ?? 'Recommendations'}>
      {defaultStyles ? <AISuiteStyles /> : null}
      {title ? <h2>{title}</h2> : null}
      <ProductsCard items={items} locale={client.config.locale} />
    </section>
  )
}
