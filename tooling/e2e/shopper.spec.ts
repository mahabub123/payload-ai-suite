import { expect, test } from '@playwright/test'
import { askAssistant, clearMailpit, shopperLogin, users, waitForOtp } from './helpers'

test.describe('shopper', () => {
  test('finds a product with AI search and opens it', async ({ page }) => {
    await page.goto('/')
    const box = page.getByRole('combobox').first()
    await box.fill('red saree under 3000 taka')
    await box.press('Enter')
    const result = page.getByRole('link', { name: /Red Jamdani Saree/i }).first()
    await expect(result).toBeVisible()
    await result.click()
    await expect(page.getByTestId('product')).toContainText('Red Jamdani Saree')
    await expect(page.getByTestId('product')).toContainText('৳2,850')
  })

  test('asks the assistant about delivery and gets a cited answer', async ({ page }) => {
    await page.goto('/')
    const log = await askAssistant(page, 'How long does delivery take outside Dhaka?')
    await expect(log).toContainText(/3[–-]5 days/)
  })

  test('adds a product to the cart through the assistant', async ({ page }) => {
    await shopperLogin(page, users.customerA)
    await page.goto('/products/sundarbans-honey-500g')
    const log = await askAssistant(page, 'Add this honey to my cart')
    // Prices on the cart card come from the store, never from model text.
    await expect(log.getByText(/Sundarbans Honey/i).first()).toBeVisible()
    await expect(log).toContainText(/cart/i)
  })

  test('logged-in customer checks own order; cannot see another customer order', async ({ page }) => {
    await shopperLogin(page, users.customerA)
    await expect(page.getByTestId('order-row').filter({ hasText: 'DS-1002' })).toBeVisible()
    await page.goto('/')
    const log = await askAssistant(page, 'Where is my order DS-1002?')
    await expect(log).toContainText('RDX-55120987')
    const log2 = await askAssistant(page, 'And order DS-2001?')
    await expect(log2).not.toContainText('PTH-77810444')
  })

  test('guest verifies an order with order number + email one-time code (Mailpit)', async ({ page }) => {
    await clearMailpit()
    const since = Date.now()
    await page.goto('/')
    const log = await askAssistant(page, 'Where is order DS-2001?')
    await expect(log.getByText(/verify|order number/i).first()).toBeVisible()
    await page.getByRole('textbox', { name: /order number/i }).fill('DS-2001')
    await page.getByRole('textbox', { name: /email/i }).fill(users.customerB)
    await page.getByRole('button', { name: /send code/i }).click()
    const code = await waitForOtp(users.customerB, since)
    await page.getByRole('textbox', { name: /code/i }).fill(code)
    await page.getByRole('button', { name: /verify/i }).click()
    await expect(log).toContainText('PTH-77810444')
  })
})
