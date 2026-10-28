import type { ReactNode } from 'react'
import { SuiteShell } from '@/components/SuiteShell'
import './styles.css'

export const metadata = { title: 'AI Dev Services', description: 'Payload AI Suite services-preset demo' }

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SuiteShell locale="en">
          <header className="top">
            <span className="brand">Glow Clinic · গ্লো ক্লিনিক</span>
            <a href="/admin">Admin</a>
          </header>
          <main>{children}</main>
        </SuiteShell>
      </body>
    </html>
  )
}
