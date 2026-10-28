import { expect, test } from '@playwright/test'
import { adminLogin, apiPost, askAssistant, users } from './helpers'

test.describe('staff', () => {
  test('content editor enriches a product description with AI (nothing auto-publishes)', async ({ page }) => {
    await adminLogin(page, users.content)
    await page.goto('/admin/collections/products')
    await page.getByRole('link', { name: 'Brass Hurricane Lamp' }).click()
    // Every AI-enabled field has its own button; use the one on the Description (rich text) field.
    await page.locator('.rich-text-lexical').getByRole('button', { name: '✨ AI' }).click()
    await page.getByRole('button', { name: 'Write description' }).click()
    const insert = page.getByRole('button', { name: 'Insert', exact: true })
    await expect(insert).toBeEnabled()
    await insert.click()
    // Products autosave drafts: the edit lands as an unpublished change and is never published by the AI.
    await expect(page.getByText('Last saved', { exact: false })).toBeVisible()
    await expect(page.getByText(/Status:\s*Changed/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Publish changes' })).toBeVisible()
  })

  test('marketing approver approves a drafted campaign', async ({ page }) => {
    // Create a campaign and draft its first step via the API as the marketing user, then approve in the admin.
    await adminLogin(page, users.marketing)
    const created = await apiPost(page, '/api/ai-campaigns', { name: 'Eid welcome', kind: 'welcome', steps: [{ delayHours: 0 }] })
    expect(created.status()).toBe(201)
    const id = (await created.json()).doc.id
    const draft = await apiPost(page, '/api/ai/marketing/drafts', { brief: 'Eid welcome: 10% off panjabi', campaignId: String(id), save: true, productCount: 0 })
    expect(draft.status()).toBe(200)
    await page.goto(`/admin/collections/ai-campaigns/${id}`)
    await page.getByRole('button', { name: /review & approve/i }).click()
    await page.getByRole('dialog', { name: 'Approve campaign' }).getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(page.getByText(/approved/i).first()).toBeVisible()
  })

  test('support agent answers a hand-off ticket with a suggested reply', async ({ browser }) => {
    // Shopper asks for a human -> ticket. Wait for the reply: closing the page mid-stream aborts the turn.
    const shopper = await browser.newPage()
    await shopper.goto('/')
    const log = await askAssistant(shopper, 'I want to talk to a human about a damaged parcel')
    await expect(log).toContainText(/passed this to our team/i)
    await shopper.close()

    const page = await browser.newPage()
    await adminLogin(page, users.support)
    await page.goto('/admin/collections/ai-tickets')
    await page.getByRole('link').filter({ hasText: /damaged|human|hand/i }).first().click()
    await page.getByRole('button', { name: /suggest/i }).click()
    const reply = page.getByRole('textbox', { name: 'Reply (edit before sending)' })
    await expect(reply).not.toBeEmpty()
    await page.getByRole('button', { name: 'Send reply' }).click()
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
