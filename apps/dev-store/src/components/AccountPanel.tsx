'use client'
import { useEffect, useState } from 'react'

type Order = { id: string; orderNumber?: string; status?: string; amount?: number; currency?: string; shippingStatus?: string }

/** Minimal customer login + "my orders" using Payload's REST API (cookie session). */
export const AccountPanel = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState<{ email: string } | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState<string | null>(null)

  const loadOrders = async () => {
    const r = await fetch('/api/orders?depth=0&limit=20', { credentials: 'include' })
    if (r.ok) setOrders(((await r.json()) as { docs: Order[] }).docs)
  }

  useEffect(() => {
    void fetch('/api/users/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { user?: { email: string } }) => {
        if (d.user) {
          setUser(d.user)
          void loadOrders()
        }
      })
  }, [])

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const r = await fetch('/api/users/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!r.ok) return setError('Login failed')
    setUser(((await r.json()) as { user: { email: string } }).user)
    await loadOrders()
  }

  if (!user)
    return (
      <form onSubmit={login} className="login" data-testid="login-form">
        <input aria-label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input aria-label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit">Log in</button>
        {error && <p role="alert">{error}</p>}
      </form>
    )

  return (
    <div data-testid="orders">
      <p>Signed in as {user.email}</p>
      <ul>
        {orders.map((o) => (
          <li key={o.id} data-testid="order-row">
            <strong>{o.orderNumber ?? o.id}</strong> — {o.status} / {o.shippingStatus ?? 'pending'} —{' '}
            {o.amount != null ? `${o.currency === 'BDT' ? '৳' : '$'}${(o.amount / 100).toFixed(2)}` : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}
