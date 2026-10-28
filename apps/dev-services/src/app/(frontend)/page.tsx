import config from '@payload-config'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const payload = await getPayload({ config })
  const { docs } = await payload
    .find({ collection: 'services', limit: 20, overrideAccess: false, depth: 0 })
    .catch(() => ({ docs: [] as Record<string, any>[] }))
  return (
    <>
      <h1>Book a treatment</h1>
      <p>Ask the assistant: “Do you have a haircut slot on Saturday afternoon?”</p>
      <ul className="grid" data-testid="services">
        {docs.map((s: Record<string, any>) => (
          <li key={s.id} className="card">
            <strong>{s.title}</strong>
            <span>{s.duration} min · ৳{((s.price ?? 0) / 100).toLocaleString('en-BD')}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
