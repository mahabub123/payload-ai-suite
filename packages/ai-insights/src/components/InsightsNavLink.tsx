'use client'
import React from 'react'
import { useInsightsApi } from './useInsightsApi'

export const InsightsNavLink: React.FC = () => {
  const { admin } = useInsightsApi()
  return (
    <a href={`${admin}/ai-insights`} className="nav__link" style={{ display: 'block', padding: '4px 0' }}>
      <span className="nav__link-label">Ask your data</span>
    </a>
  )
}

export default InsightsNavLink
