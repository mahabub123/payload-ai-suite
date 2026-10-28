import Link from 'next/link'
import { Recs, StoreSearch } from '@/components/StoreSearch'
import { formatBDT, listProducts } from '@/lib/catalog'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const products = await listProducts('en', 12).catch(() => [])
  return (
    <>
      <StoreSearch />
      <h2>New arrivals</h2>
      <ul className="grid" data-testid="product-grid">
        {products.map((p) => (
          <li key={p.id} className="card">
            <Link href={`/products/${p.slug}`}>
              {p.imageUrl && <img src={p.imageUrl} alt="" width={240} height={240} />}
              <span className="title">{p.title}</span>
              <span className="price">{formatBDT(p.priceMinor)}</span>
              {!p.inStock && <span className="oos">Out of stock</span>}
            </Link>
          </li>
        ))}
        {products.length === 0 && <li>No products yet — run <code>pnpm --filter dev-store seed</code>.</li>}
      </ul>
      <Recs kind="for-you" title="Recommended for you" />
    </>
  )
}
