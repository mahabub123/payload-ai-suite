import { expect, type Page } from '@playwright/test'

export const PASSWORD = process.env.SEED_PASSWORD ?? 'Passw0rd!dev'
export const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025'

export const users = {
  customerA: 'ayesha@example.test',
  customerB: 'bilal@example.test',
  content: 'content@example.test',
  marketing: 'marketing@example.test',
  support: 'support@example.test',
  admin: 'admin@example.test',
} as const

/** Storefront login through the account page (cookie session shared with /api/ai/*). */
export const shopperLogin = async (page: Page, email: string) => {
  await page.goto('/account')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByTestId('orders')).toBeVisible()
}

export const adminLogin = async (page: Page, email: string) => {
  await page.goto('/admin/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /login/i }).click()
  await page.waitForURL(/\/admin(?!\/login)/)
}

/** Opens the floating assistant and sends a message; returns the assistant log locator. */
export const askAssistant = async (page: Page, message: string) => {
  const launcher = page.getByRole('button', { name: /assistant|chat|help/i }).first()
  if (await launcher.isVisible().catch(() => false)) await launcher.click()
  const input = page.getByRole('textbox', { name: /message|ask/i }).last()
  await input.fill(message)
  await input.press('Enter')
  const log = page.getByRole('log').last()
  await expect(log).toBeVisible()
  return log
}

interface MailpitSummary {
  ID: string
  Subject: string
  To: { Address: string }[]
  Created: string
}

/** Waits for the newest email to `to` in Mailpit and returns its first 6-digit code. */
export const waitForOtp = async (to: string, sinceMs = Date.now() - 60_000, timeoutMs = 30_000): Promise<string> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)
    const { messages } = (await r.json()) as { messages: MailpitSummary[] }
    const fresh = messages.find((m) => new Date(m.Created).getTime() >= sinceMs)
    if (fresh) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${fresh.ID}`)).json()) as { Text: string; HTML: string }
      const code = `${msg.Text} ${msg.HTML}`.match(/\b(\d{6})\b/)?.[1]
      if (code) return code
    }
    await new Promise((res) => setTimeout(res, 1000))
  }
  throw new Error(`No OTP email for ${to} in Mailpit within ${timeoutMs} ms`)
}

export const clearMailpit = async () => {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' }).catch(() => undefined)
}
