import { expect, test } from '@playwright/test'
import { adminLogin, askAssistant, users } from './helpers'

test.describe('staff', () => {
  test('content editor enriches a product description with AI (nothing auto-publishes)', async ({ page }) => {
    await adminLogin(page, users.content)
    await page.goto('/admin/collections/products')
    await page.getByRole('link', { name: 'Brass Hurricane Lamp' }).click()
    await page.getByRole('button', { name: /AI|write with ai|generate/i }).first().click()
    await page.getByRole('menuitem', { name: /write/i }).click().catch(() => undefined)
    const accept = page.getByRole('button', { name: /accept|insert|use/i }).first()
    await expect(accept).toBeVisible()
    await accept.click()
    await page.getByRole('button', { name: /save draft/i }).click()
    await expect(page.getByText(/saved|updated/i).first()).toBeVisible()
  })

  test('marketing approver approves a drafted campaign', async ({ page }) => {
    // Draft via the API as the marketing user, then approve in the admin.
    await adminLogin(page, users.marketing)
    const draft = await page.request.post('/api/ai/marketing/drafts', {
      data: { kind: 'campaign', brief: 'Eid sale: 10% off panjabi', segment: { all: true }, locale: 'en' },
    })
    expect([200, 201]).toContain(draft.status())
    await page.goto('/admin/collections/ai-campaigns')
    await page.getByRole('link').filter({ hasText: /eid/i }).first().click()
    await page.getByRole('button', { name: /approve/i }).click()
    await expect(page.getByText(/approved/i).first()).toBeVisible()
  })

  test('support agent answers a hand-off ticket with a suggested reply', async ({ browser }) => {
    // Shopper asks for a human -> ticket.
    const shopper = await browser.newPage()
    await shopper.goto('/')
    await askAssistant(shopper, 'I want to talk to a human about a damaged parcel')
    await shopper.close()

    const page = await browser.newPage()
    await adminLogin(page, users.support)
    await page.goto('/admin/collections/ai-tickets')
    await page.getByRole('link').filter({ hasText: /damaged|human|hand/i }).first().click()
    await page.getByRole('button', { name: /suggest/i }).click()
    const reply = page.getByRole('textbox', { name: /reply/i })
    await expect(reply).not.toBeEmpty()
    await page.getByRole('button', { name: /send|save/i }).first().click()
    await expect(page.getByText(/sent|saved|answered/i).first()).toBeVisible()
  })

  test('customer role cannot open the admin panel', async ({ page }) => {
    await page.goto('/admin/login')
    await page.locator('input[name="email"]').fill(users.customerA)
    await page.locator('input[name="password"]').fill(process.env.SEED_PASSWORD ?? 'Passw0rd!dev')
    await page.getByRole('button', { name: /login/i }).click()
    await expect(page.getByText(/not allowed|unauthorized|no access/i).first()).toBeVisible()
  })
})
