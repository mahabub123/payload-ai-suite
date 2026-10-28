import type { ReactNode } from 'react'
import Link from 'next/link'
import { SuiteShell } from '@/components/SuiteShell'
import './styles.css'

export const metadata = { title: 'AI Dev Store', description: 'Payload AI Suite demo storefront' }

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SuiteShell locale="en">
          <header className="top">
            <Link href="/" className="brand">
              AI Dev Store · এআই দোকান
            </Link>
            <nav>
              <Link href="/account">Account</Link>
              <Link href="/admin">Admin</Link>
            </nav>
          </header>
          <main>{children}</main>
          <footer className="foot">AI answers may be imperfect. Prices and stock always come from the store.</footer>
        </SuiteShell>
      </body>
    </html>
  )
}
