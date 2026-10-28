'use client'
import React, { useState } from 'react'
import { useAuth, useConfig } from '@payloadcms/ui'
import { CopilotPanel } from './CopilotPanel'

/** Admin provider: renders the admin plus a floating copilot button and drawer for logged-in staff. */
export const CopilotProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const { config } = useConfig()
  const [open, setOpen] = useState(false)
  const apiRoute = `${config?.serverURL ?? ''}${config?.routes?.api ?? '/api'}`
  return (
    <>
      {children}
      {user && (
        <>
          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open AI copilot"
              style={{
                position: 'fixed',
                right: 20,
                bottom: 20,
                zIndex: 100,
                borderRadius: 999,
                padding: '10px 16px',
                border: '1px solid var(--theme-elevation-200)',
                background: 'var(--theme-elevation-50)',
                color: 'var(--theme-text)',
                cursor: 'pointer',
              }}
            >
              ✦ Copilot
            </button>
          )}
          {open && (
            <aside
              style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: 'min(440px, 100vw)',
                zIndex: 100,
                boxShadow: '0 0 24px rgba(0,0,0,.2)',
              }}
            >
              <CopilotPanel apiRoute={apiRoute} onClose={() => setOpen(false)} />
            </aside>
          )}
        </>
      )}
    </>
  )
}
