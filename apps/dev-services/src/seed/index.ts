/**
 * Seed the services demo (a Dhaka beauty & wellness clinic): locations with opening hours, services
 * (English + Bangla, BDT minor units), staff, pages, FAQs, users and a few bookings.
 *
 *   pnpm --filter dev-services seed [--force]
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Payload } from 'payload'
import type { Location, Service, User } from '../payload-types'

const here = path.dirname(fileURLToPath(import.meta.url))
try {
  process.loadEnvFile(path.resolve(here, '../../.env'))
} catch {
  // rely on the environment
}

const PASSWORD = process.env.SEED_PASSWORD || 'Passw0rd!dev'
const opts = { overrideAccess: true, depth: 0 } as const
const tk = (taka: number) => taka * 100

const richText = (...paragraphs: string[]) => ({
  root: {
    type: 'root',
    format: '' as const,
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: paragraphs.map((text) => ({
      type: 'paragraph',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      textFormat: 0,
      textStyle: '',
      children: [{ type: 'text', text, format: 0, style: '', mode: 'normal', detail: 0, version: 1 }],
    })),
  },
})

type Day = NonNullable<Location['openingHours']>[number]['day']
const week = (open: string, close: string, days: Day[] = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu']) => days.map((day) => ({ day, open, close }))

const services: { slug: string; en: string; bn: string; price: number; duration: number; category: NonNullable<Service['category']> }[] = [
  { slug: 'haircut-women', en: "Women's Haircut & Blow-dry", bn: 'মহিলাদের চুল কাটা ও ব্লো-ড্রাই', price: tk(1200), duration: 60, category: 'hair' },
  { slug: 'haircut-men', en: "Men's Haircut", bn: 'পুরুষদের চুল কাটা', price: tk(500), duration: 30, category: 'hair' },
  { slug: 'hair-colour', en: 'Hair Colour (full)', bn: 'চুলে রং (পুরো)', price: tk(3500), duration: 120, category: 'hair' },
  { slug: 'facial-gold', en: 'Gold Facial', bn: 'গোল্ড ফেসিয়াল', price: tk(2500), duration: 75, category: 'skin' },
  { slug: 'acne-consultation', en: 'Acne Consultation (Dermatologist)', bn: 'ব্রণ পরামর্শ (চর্মরোগ বিশেষজ্ঞ)', price: tk(1500), duration: 30, category: 'health' },
  { slug: 'mehndi-bridal', en: 'Bridal Mehndi', bn: 'ব্রাইডাল মেহেদি', price: tk(6000), duration: 180, category: 'skin' },
  { slug: 'spa-massage-60', en: 'Aromatherapy Massage 60 min', bn: 'অ্যারোমাথেরাপি ম্যাসাজ ৬০ মিনিট', price: tk(2800), duration: 60, category: 'spa' },
  { slug: 'manicure-pedicure', en: 'Manicure & Pedicure', bn: 'ম্যানিকিউর ও পেডিকিউর', price: tk(1600), duration: 90, category: 'skin' },
]

export const seed = async (payload: Payload, { force = false } = {}) => {
  const n = await payload.count({ collection: 'services', overrideAccess: true })
  if (n.totalDocs > 0 && !force) return payload.logger.info('[seed] services already exist — skipping (use --force).')

  for (const u of [
    { email: 'super@example.test', name: 'Super Admin', roles: ['super-admin'] },
    { email: 'content@example.test', name: 'Content Editor', roles: ['content'] },
    { email: 'support@example.test', name: 'Front Desk', roles: ['support'] },
  ] satisfies Pick<User, 'email' | 'name' | 'roles'>[]) {
    await payload.create({ collection: 'users', data: { ...u, password: PASSWORD }, ...opts })
  }
  const customer = await payload.create({
    collection: 'users',
    data: { email: 'nusrat@example.test', name: 'Nusrat Jahan', roles: ['customer'], password: PASSWORD },
    ...opts,
  })

  const gulshan = await payload.create({
    collection: 'locations',
    locale: 'en',
    data: { name: 'Gulshan Branch', address: 'House 7, Road 45, Gulshan 2, Dhaka', phone: '+8801700000010', openingHours: week('10:00', '20:00') },
    ...opts,
  })
  await payload.update({ collection: 'locations', id: gulshan.id, locale: 'bn', data: { name: 'গুলশান শাখা', address: 'বাড়ি ৭, রোড ৪৫, গুলশান ২, ঢাকা' }, ...opts })
  const dhanmondi = await payload.create({
    collection: 'locations',
    locale: 'en',
    data: { name: 'Dhanmondi Branch', address: 'House 21, Road 8, Dhanmondi, Dhaka', phone: '+8801700000011', openingHours: week('11:00', '21:00', ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']) },
    ...opts,
  })
  await payload.update({ collection: 'locations', id: dhanmondi.id, locale: 'bn', data: { name: 'ধানমন্ডি শাখা' }, ...opts })

  const ids: Record<string, number> = {}
  for (const s of services) {
    const d = await payload.create({
      collection: 'services',
      locale: 'en',
      data: { title: s.en, slug: s.slug, price: s.price, duration: s.duration, category: s.category, summary: `${s.en} — ${s.duration} minutes.`, description: richText(`${s.en}. Duration ${s.duration} minutes. Price ৳${s.price / 100}.`), _status: 'published' },
      ...opts,
    })
    await payload.update({ collection: 'services', id: d.id, locale: 'bn', data: { title: s.bn, summary: `${s.bn} — ${s.duration} মিনিট।`, _status: 'published' }, ...opts })
    ids[s.slug] = d.id
  }

  const staff = [
    { name: 'Farzana Akter', services: ['haircut-women', 'hair-colour', 'haircut-men'], location: gulshan.id },
    { name: 'Rafiq Islam', services: ['haircut-men', 'spa-massage-60'], location: dhanmondi.id },
    { name: 'Dr. Shirin Sultana', services: ['acne-consultation'], location: gulshan.id },
    { name: 'Moumita Das', services: ['facial-gold', 'mehndi-bridal', 'manicure-pedicure'], location: dhanmondi.id },
  ]
  const staffIds: number[] = []
  for (const s of staff) {
    const d = await payload.create({ collection: 'staff', data: { name: s.name, services: s.services.map((x) => ids[x]), location: s.location }, ...opts })
    staffIds.push(d.id)
  }

  const at = (daysAhead: number, hourLocal: number) => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + daysAhead)
    d.setUTCHours(hourLocal - 6, 0, 0, 0) // Asia/Dhaka is UTC+6
    return d.toISOString()
  }
  await payload.create({ collection: 'bookings', data: { service: ids['haircut-women'], start: at(1, 11), end: at(1, 12), staff: staffIds[0], location: gulshan.id, status: 'confirmed', customer: customer.id, name: 'Nusrat Jahan', email: 'nusrat@example.test' }, ...opts })
  await payload.create({ collection: 'bookings', data: { service: ids['facial-gold'], start: at(2, 15), end: at(2, 16), staff: staffIds[3], location: dhanmondi.id, status: 'tentative', name: 'Walk-in', phone: '+8801900000000' }, ...opts })

  for (const p of [
    { slug: 'about', en: ['About Glow Clinic', 'Two branches in Gulshan and Dhanmondi. Licensed dermatologist on site at Gulshan.'], bn: ['গ্লো ক্লিনিক সম্পর্কে', 'গুলশান ও ধানমন্ডিতে দুটি শাখা। গুলশানে লাইসেন্সপ্রাপ্ত চর্মরোগ বিশেষজ্ঞ আছেন।'] },
    { slug: 'cancellation-policy', en: ['Cancellation policy', 'Cancel or reschedule free up to 6 hours before your appointment. Late cancellations are charged 50%.'], bn: ['বাতিল নীতি', 'অ্যাপয়েন্টমেন্টের ৬ ঘণ্টা আগে পর্যন্ত বিনামূল্যে বাতিল বা সময় পরিবর্তন করা যায়। দেরিতে বাতিলে ৫০% চার্জ।'] },
  ]) {
    const d = await payload.create({ collection: 'pages', locale: 'en', data: { title: p.en[0], slug: p.slug, content: richText(p.en[1]), _status: 'published' }, ...opts })
    await payload.update({ collection: 'pages', id: d.id, locale: 'bn', data: { title: p.bn[0], content: richText(p.bn[1]), _status: 'published' }, ...opts })
  }
  for (const f of [
    { en: ['Do I need to book in advance?', 'Walk-ins are welcome, but booking guarantees your slot. Bridal mehndi needs 3 days notice.'], bn: ['আগে থেকে বুকিং করতে হবে?', 'ওয়াক-ইন স্বাগত, তবে বুকিং করলে সময় নিশ্চিত থাকে। ব্রাইডাল মেহেদির জন্য ৩ দিন আগে জানাতে হবে।'] },
    { en: ['How can I pay?', 'Cash, bKash, Nagad or card at the counter.'], bn: ['কিভাবে পেমেন্ট করব?', 'কাউন্টারে নগদ, বিকাশ, নগদ (মোবাইল) বা কার্ড।'] },
    { en: ['Is the Dhanmondi branch open on Friday?', 'Yes, Dhanmondi is open every day 11 am–9 pm. Gulshan is closed on Fridays.'], bn: ['ধানমন্ডি শাখা কি শুক্রবার খোলা?', 'হ্যাঁ, ধানমন্ডি প্রতিদিন সকাল ১১টা–রাত ৯টা খোলা। গুলশান শুক্রবার বন্ধ।'] },
  ]) {
    const d = await payload.create({ collection: 'faqs', locale: 'en', data: { question: f.en[0], answer: f.en[1] }, ...opts })
    await payload.update({ collection: 'faqs', id: d.id, locale: 'bn', data: { question: f.bn[0], answer: f.bn[1] }, ...opts })
  }
  payload.logger.info(`[seed] services demo seeded (password: ${PASSWORD})`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../payload.config')
  const payload = await getPayload({ config })
  try {
    await seed(payload, { force: process.argv.includes('--force') })
  } finally {
    await payload.destroy?.()
  }
  process.exit(0)
}
