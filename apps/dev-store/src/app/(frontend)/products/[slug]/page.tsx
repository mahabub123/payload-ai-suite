import { notFound } from 'next/navigation'
import { Recs } from '@/components/StoreSearch'
import { formatBDT, getProduct } from '@/lib/catalog'

export const dynamic = 'force-dynamic'

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const p = await getProduct(slug)
  if (!p) notFound()
  return (
    <article className="product" data-testid="product" data-offering-id={p.id}>
      {p.imageUrl && <img src={p.imageUrl} alt="" width={420} height={420} />}
      <div>
        <h1>{p.title}</h1>
        {p.brand && <p className="brand-line">{p.brand}</p>}
        <p className="price">{formatBDT(p.priceMinor)}</p>
        <p>{p.inStock ? 'In stock' : 'Out of stock'}</p>
        {p.specs.length > 0 && (
          <dl>
            {p.specs.map((s) => (
              <div key={s.label}>
                <dt>{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="hint">Ask the assistant: “Add this to my cart” or “Does it come in blue?”</p>
      </div>
      <section className="wide">
        <Recs offeringId={p.id} kind="similar" title="Similar products" />
        <Recs offeringId={p.id} kind="bought-together" title="Frequently bought together" />
      </section>
    </article>
  )
}
