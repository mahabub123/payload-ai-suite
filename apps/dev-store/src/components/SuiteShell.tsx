'use client'
import { AISuiteProvider, AssistantWidget } from 'payload-ai-react'
import type { ReactNode } from 'react'

/** Client boundary: provider + floating assistant on every storefront page. */
export const SuiteShell = ({ children, locale }: { children: ReactNode; locale: string }) => (
  <AISuiteProvider baseUrl="/api/ai" locale={locale} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined}>
    {children}
    <AssistantWidget loginUrl="/account" />
  </AISuiteProvider>
)
