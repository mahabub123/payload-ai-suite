import type { Faq, Policy } from '../payload-types'
/** Seed data for the dev store. Prices are BDT minor units (poisha): ৳1,250 = 125000. */

export interface SeedCategory {
  slug: string
  en: string
  bn: string
}

export interface SeedProduct {
  slug: string
  en: string
  bn: string
  descEn: string
  descBn: string
  category: string
  price: number
  usd?: number
  inventory: number
  brand: string
  color: string
  tags: string[]
  specs?: [string, string][]
  /** Variant products: option values per variant type. */
  variants?: { type: 'size' | 'color'; values: string[]; inventoryEach: number }
}

export const categories: SeedCategory[] = [
  { slug: 'sarees', en: 'Sarees', bn: 'শাড়ি' },
  { slug: 'panjabi', en: 'Panjabi', bn: 'পাঞ্জাবি' },
  { slug: 'electronics', en: 'Electronics', bn: 'ইলেকট্রনিক্স' },
  { slug: 'kitchen', en: 'Kitchen', bn: 'রান্নাঘর' },
  { slug: 'books', en: 'Books', bn: 'বই' },
  { slug: 'beauty', en: 'Beauty', bn: 'সৌন্দর্য' },
  { slug: 'groceries', en: 'Groceries', bn: 'মুদি পণ্য' },
  { slug: 'home-decor', en: 'Home Decor', bn: 'ঘর সাজানো' },
]

const tk = (taka: number) => Math.round(taka * 100)

export const products: SeedProduct[] = [
  { slug: 'red-jamdani-saree', en: 'Red Jamdani Saree', bn: 'লাল জামদানি শাড়ি', descEn: 'Handwoven Dhakai jamdani in deep red with gold motifs. 6 yards with blouse piece.', descBn: 'সোনালি নকশায় গাঢ় লাল ঢাকাই জামদানি। ব্লাউজ পিসসহ ৬ গজ।', category: 'sarees', price: tk(2850), usd: 2500, inventory: 8, brand: 'Tangail Looms', color: 'red', tags: ['jamdani', 'handloom', 'festive'], specs: [['Fabric', 'Cotton-silk'], ['Length', '6 yards']] },
  { slug: 'blue-tangail-cotton-saree', en: 'Blue Tangail Cotton Saree', bn: 'নীল টাঙ্গাইল সুতি শাড়ি', descEn: 'Lightweight everyday Tangail cotton saree in sky blue.', descBn: 'হালকা আকাশি নীল টাঙ্গাইল সুতি শাড়ি, প্রতিদিনের জন্য।', category: 'sarees', price: tk(1450), inventory: 15, brand: 'Tangail Looms', color: 'blue', tags: ['cotton', 'everyday'] },
  { slug: 'green-katan-silk-saree', en: 'Green Katan Silk Saree', bn: 'সবুজ কাতান সিল্ক শাড়ি', descEn: 'Rich Benarasi-style katan silk in emerald green for weddings.', descBn: 'বিয়ের জন্য পান্না সবুজ বেনারসি ধাঁচের কাতান সিল্ক।', category: 'sarees', price: tk(7900), usd: 6900, inventory: 3, brand: 'Mirpur Silk House', color: 'green', tags: ['silk', 'wedding'] },
  { slug: 'red-cotton-saree-budget', en: 'Red Printed Cotton Saree', bn: 'লাল প্রিন্টেড সুতি শাড়ি', descEn: 'Soft printed cotton saree in red with white border. Easy care.', descBn: 'সাদা পাড়ের নরম লাল প্রিন্টেড সুতি শাড়ি। সহজ যত্ন।', category: 'sarees', price: tk(990), inventory: 0, brand: 'Aarong Basics', color: 'red', tags: ['cotton', 'budget'] },
  { slug: 'white-cotton-panjabi', en: 'White Cotton Panjabi', bn: 'সাদা সুতি পাঞ্জাবি', descEn: 'Classic white cotton panjabi with subtle embroidery on the placket.', descBn: 'প্লাকেটে হালকা সূচিকর্মসহ ক্লাসিক সাদা সুতি পাঞ্জাবি।', category: 'panjabi', price: tk(1650), usd: 1500, inventory: 0, brand: 'Dhaka Tailors', color: 'white', tags: ['eid', 'cotton'], variants: { type: 'size', values: ['S', 'M', 'L', 'XL'], inventoryEach: 6 } },
  { slug: 'maroon-silk-panjabi', en: 'Maroon Silk Panjabi', bn: 'মেরুন সিল্ক পাঞ্জাবি', descEn: 'Festive maroon silk-blend panjabi with mandarin collar.', descBn: 'ম্যান্ডারিন কলারসহ উৎসবের মেরুন সিল্ক মিশ্রিত পাঞ্জাবি।', category: 'panjabi', price: tk(3200), inventory: 0, brand: 'Dhaka Tailors', color: 'maroon', tags: ['eid', 'silk', 'festive'], variants: { type: 'size', values: ['M', 'L', 'XL'], inventoryEach: 4 } },
  { slug: 'kids-yellow-panjabi', en: 'Kids Yellow Panjabi', bn: 'বাচ্চাদের হলুদ পাঞ্জাবি', descEn: 'Bright yellow cotton panjabi for kids aged 4–10.', descBn: '৪–১০ বছরের শিশুদের জন্য উজ্জ্বল হলুদ সুতি পাঞ্জাবি।', category: 'panjabi', price: tk(850), inventory: 20, brand: 'Little Dhaka', color: 'yellow', tags: ['kids', 'cotton'] },
  { slug: 'walton-smartphone-x9', en: 'Walton Smartphone X9 (128GB)', bn: 'ওয়ালটন স্মার্টফোন এক্স৯ (১২৮জিবি)', descEn: '6.6" display, 5000mAh battery, 128GB storage, dual SIM.', descBn: '৬.৬" ডিসপ্লে, ৫০০০ এমএএইচ ব্যাটারি, ১২৮জিবি স্টোরেজ, ডুয়াল সিম।', category: 'electronics', price: tk(18999), usd: 16500, inventory: 12, brand: 'Walton', color: 'black', tags: ['phone', '5000mAh'], specs: [['Storage', '128GB'], ['Battery', '5000mAh'], ['Warranty', '1 year']] },
  { slug: 'bluetooth-earbuds-pro', en: 'Bluetooth Earbuds Pro', bn: 'ব্লুটুথ ইয়ারবাডস প্রো', descEn: 'Noise-cancelling true wireless earbuds with 30h total battery.', descBn: 'নয়েজ ক্যান্সেলিং ট্রু ওয়্যারলেস ইয়ারবাডস, মোট ৩০ ঘণ্টা ব্যাটারি।', category: 'electronics', price: tk(3499), usd: 2999, inventory: 25, brand: 'SoundBD', color: 'white', tags: ['audio', 'wireless'], variants: { type: 'color', values: ['White', 'Black'], inventoryEach: 12 } },
  { slug: 'rechargeable-desk-fan', en: 'Rechargeable Desk Fan', bn: 'রিচার্জেবল টেবিল ফ্যান', descEn: '12-inch rechargeable fan with LED light; runs 6 hours during load-shedding.', descBn: 'এলইডি লাইটসহ ১২ ইঞ্চি রিচার্জেবল ফ্যান; লোডশেডিংয়ে ৬ ঘণ্টা চলে।', category: 'electronics', price: tk(2750), inventory: 30, brand: 'Walton', color: 'white', tags: ['fan', 'load-shedding'] },
  { slug: 'power-bank-20000', en: 'Power Bank 20000mAh', bn: 'পাওয়ার ব্যাংক ২০০০০ এমএএইচ', descEn: 'Fast-charging 20000mAh power bank with USB-C PD 22.5W.', descBn: 'ইউএসবি-সি পিডি ২২.৫ ওয়াট দ্রুত চার্জিং ২০০০০ এমএএইচ পাওয়ার ব্যাংক।', category: 'electronics', price: tk(2199), usd: 1999, inventory: 40, brand: 'SoundBD', color: 'black', tags: ['charging'] },
  { slug: 'smart-led-tv-43', en: 'Smart LED TV 43"', bn: 'স্মার্ট এলইডি টিভি ৪৩"', descEn: '43-inch Full HD Android smart TV with built-in YouTube.', descBn: 'ইউটিউবসহ ৪৩ ইঞ্চি ফুল এইচডি অ্যান্ড্রয়েড স্মার্ট টিভি।', category: 'electronics', price: tk(32500), inventory: 5, brand: 'Walton', color: 'black', tags: ['tv'] },
  { slug: 'non-stick-frying-pan', en: 'Non-stick Frying Pan 26cm', bn: 'নন-স্টিক ফ্রাইং প্যান ২৬ সেমি', descEn: 'PFOA-free non-stick pan, works on gas and induction.', descBn: 'পিএফওএ-মুক্ত নন-স্টিক প্যান, গ্যাস ও ইন্ডাকশনে চলে।', category: 'kitchen', price: tk(1250), inventory: 18, brand: 'Kiam', color: 'black', tags: ['cookware'] },
  { slug: 'pressure-cooker-5l', en: 'Pressure Cooker 5L', bn: 'প্রেশার কুকার ৫ লিটার', descEn: 'Aluminium 5-litre pressure cooker with safety valve.', descBn: 'সেফটি ভাল্বসহ অ্যালুমিনিয়াম ৫ লিটার প্রেশার কুকার।', category: 'kitchen', price: tk(2400), inventory: 10, brand: 'Kiam', color: 'silver', tags: ['cookware'] },
  { slug: 'rice-cooker-1-8l', en: 'Electric Rice Cooker 1.8L', bn: 'ইলেকট্রিক রাইস কুকার ১.৮ লিটার', descEn: 'Keeps rice warm for 12 hours; includes steamer tray.', descBn: '১২ ঘণ্টা ভাত গরম রাখে; স্টিমার ট্রে সহ।', category: 'kitchen', price: tk(2950), usd: 2600, inventory: 14, brand: 'Miyako', color: 'white', tags: ['appliance'] },
  { slug: 'clay-tea-cups-set', en: 'Clay Tea Cups (Set of 6)', bn: 'মাটির চায়ের কাপ (৬টির সেট)', descEn: 'Traditional terracotta tea cups from Bogura potters.', descBn: 'বগুড়ার কুমারদের তৈরি ঐতিহ্যবাহী মাটির চায়ের কাপ।', category: 'kitchen', price: tk(450), inventory: 50, brand: 'Mati Craft', color: 'brown', tags: ['handmade', 'terracotta'] },
  { slug: 'book-gitanjali', en: 'Gitanjali — Rabindranath Tagore', bn: 'গীতাঞ্জলি — রবীন্দ্রনাথ ঠাকুর', descEn: 'Hardcover Bangla edition of the Nobel-winning poems.', descBn: 'নোবেলজয়ী কবিতার হার্ডকভার বাংলা সংস্করণ।', category: 'books', price: tk(380), inventory: 35, brand: 'Ananda', color: 'blue', tags: ['poetry', 'classic'] },
  { slug: 'book-padma-nadir-majhi', en: 'Padma Nadir Majhi — Manik Bandopadhyay', bn: 'পদ্মা নদীর মাঝি — মানিক বন্দ্যোপাধ্যায়', descEn: 'Classic novel about fishermen on the Padma river.', descBn: 'পদ্মা নদীর জেলেদের জীবন নিয়ে ক্লাসিক উপন্যাস।', category: 'books', price: tk(320), inventory: 22, brand: 'Bishwo Shahitto', color: 'green', tags: ['novel', 'classic'] },
  { slug: 'book-learn-python-bangla', en: 'Learn Python (Bangla)', bn: 'পাইথন শিখি (বাংলা)', descEn: 'Beginner programming book in Bangla with exercises.', descBn: 'অনুশীলনসহ বাংলায় প্রোগ্রামিং শেখার বই।', category: 'books', price: tk(550), inventory: 0, brand: 'Adarsha', color: 'yellow', tags: ['programming'] },
  { slug: 'mustard-oil-1l', en: 'Pure Mustard Oil 1L', bn: 'খাঁটি সরিষার তেল ১ লিটার', descEn: 'Cold-pressed (ghani) mustard oil from Sirajganj.', descBn: 'সিরাজগঞ্জের ঘানি ভাঙা খাঁটি সরিষার তেল।', category: 'groceries', price: tk(320), inventory: 60, brand: 'Ghani Fresh', color: 'yellow', tags: ['oil', 'organic'] },
  { slug: 'chinigura-rice-5kg', en: 'Chinigura Aromatic Rice 5kg', bn: 'চিনিগুড়া সুগন্ধি চাল ৫ কেজি', descEn: 'Fragrant small-grain rice, ideal for polao and payesh.', descBn: 'পোলাও ও পায়েসের জন্য সুগন্ধি ছোট দানার চাল।', category: 'groceries', price: tk(780), inventory: 45, brand: 'Pran', color: 'white', tags: ['rice'] },
  { slug: 'sundarbans-honey-500g', en: 'Sundarbans Honey 500g', bn: 'সুন্দরবনের মধু ৫০০ গ্রাম', descEn: 'Raw khalisha flower honey collected in the Sundarbans.', descBn: 'সুন্দরবনের খলিশা ফুলের কাঁচা মধু।', category: 'groceries', price: tk(650), usd: 600, inventory: 28, brand: 'Mou Bari', color: 'amber', tags: ['honey', 'organic'] },
  { slug: 'premium-tea-sylhet', en: 'Sylhet Premium Tea 400g', bn: 'সিলেট প্রিমিয়াম চা ৪০০ গ্রাম', descEn: 'Strong CTC black tea from Sylhet gardens.', descBn: 'সিলেটের বাগানের কড়া সিটিসি কালো চা।', category: 'groceries', price: tk(290), inventory: 70, brand: 'Finlay', color: 'black', tags: ['tea'] },
  { slug: 'herbal-neem-face-wash', en: 'Herbal Neem Face Wash', bn: 'হারবাল নিম ফেসওয়াশ', descEn: 'Gentle neem and turmeric face wash for oily skin.', descBn: 'তৈলাক্ত ত্বকের জন্য কোমল নিম ও হলুদ ফেসওয়াশ।', category: 'beauty', price: tk(260), inventory: 40, brand: 'Kumarika', color: 'green', tags: ['skincare'] },
  { slug: 'coconut-hair-oil', en: 'Coconut Hair Oil 200ml', bn: 'নারকেল চুলের তেল ২০০ মিলি', descEn: '100% pure coconut oil for hair and skin.', descBn: 'চুল ও ত্বকের জন্য ১০০% খাঁটি নারকেল তেল।', category: 'beauty', price: tk(180), inventory: 80, brand: 'Parachute', color: 'white', tags: ['haircare'] },
  { slug: 'kajal-pencil', en: 'Kajal Pencil Black', bn: 'কাজল পেন্সিল কালো', descEn: 'Smudge-proof kajal that lasts 12 hours.', descBn: '১২ ঘণ্টা স্থায়ী স্মাজ-প্রুফ কাজল।', category: 'beauty', price: tk(220), inventory: 0, brand: 'Lakme', color: 'black', tags: ['makeup'] },
  { slug: 'nakshi-kantha-throw', en: 'Nakshi Kantha Throw', bn: 'নকশি কাঁথা', descEn: 'Hand-stitched nakshi kantha from Jessore, 5x7 ft.', descBn: 'যশোরের হাতে সেলাই করা নকশি কাঁথা, ৫x৭ ফুট।', category: 'home-decor', price: tk(4200), usd: 3800, inventory: 6, brand: 'Mati Craft', color: 'red', tags: ['handmade', 'kantha'] },
  { slug: 'jute-floor-mat', en: 'Jute Floor Mat', bn: 'পাটের পাপোশ', descEn: 'Eco-friendly braided jute mat, 60x90cm.', descBn: 'পরিবেশবান্ধব বেণি করা পাটের পাপোশ, ৬০x৯০ সেমি।', category: 'home-decor', price: tk(690), inventory: 33, brand: 'Golden Fibre', color: 'beige', tags: ['jute', 'eco'], variants: { type: 'color', values: ['Natural', 'Blue'], inventoryEach: 15 } },
  { slug: 'brass-hurricane-lamp', en: 'Brass Hurricane Lamp', bn: 'পিতলের হারিকেন', descEn: 'Decorative brass hurricane lantern with glass chimney.', descBn: 'কাচের চিমনিসহ সাজসজ্জার পিতলের হারিকেন।', category: 'home-decor', price: tk(1850), inventory: 9, brand: 'Dhamrai Metal', color: 'gold', tags: ['brass', 'vintage'] },
  { slug: 'bamboo-wall-shelf', en: 'Bamboo Wall Shelf', bn: 'বাঁশের দেয়াল তাক', descEn: 'Three-tier bamboo wall shelf, easy to mount.', descBn: 'তিন তাকের বাঁশের দেয়াল তাক, সহজে লাগানো যায়।', category: 'home-decor', price: tk(1150), inventory: 12, brand: 'Golden Fibre', color: 'brown', tags: ['bamboo'] },
]

export const colorHex: Record<string, string> = {
  red: '#b91c1c', blue: '#1d4ed8', green: '#15803d', white: '#e5e7eb', maroon: '#7f1d1d', yellow: '#eab308',
  black: '#111827', silver: '#9ca3af', brown: '#78350f', amber: '#d97706', beige: '#d6c7a1', gold: '#b45309',
}

export const faqs: { en: [string, string]; bn: [string, string]; topic: NonNullable<Faq['topic']> }[] = [
  { topic: 'shipping', en: ['How long does delivery take?', 'Inside Dhaka 1–2 days; outside Dhaka 3–5 days. You get an SMS with the tracking number when the order ships.'], bn: ['ডেলিভারিতে কত দিন লাগে?', 'ঢাকার ভিতরে ১–২ দিন; ঢাকার বাইরে ৩–৫ দিন। অর্ডার পাঠানো হলে ট্র্যাকিং নম্বরসহ এসএমএস পাবেন।'] },
  { topic: 'shipping', en: ['How much is the delivery charge?', 'Delivery is ৳60 inside Dhaka and ৳120 outside Dhaka. Orders above ৳3,000 ship free.'], bn: ['ডেলিভারি চার্জ কত?', 'ঢাকার ভিতরে ৳৬০ এবং ঢাকার বাইরে ৳১২০। ৳৩,০০০ এর বেশি অর্ডারে ডেলিভারি ফ্রি।'] },
  { topic: 'payment', en: ['Which payment methods do you accept?', 'Cash on delivery, bKash, Nagad and Visa/Mastercard.'], bn: ['কোন কোন পেমেন্ট পদ্ধতি গ্রহণ করেন?', 'ক্যাশ অন ডেলিভারি, বিকাশ, নগদ এবং ভিসা/মাস্টারকার্ড।'] },
  { topic: 'returns', en: ['Can I return a product?', 'Yes, unused items can be returned within 7 days of delivery. Sarees and panjabi must have tags attached.'], bn: ['পণ্য ফেরত দেওয়া যাবে?', 'হ্যাঁ, ডেলিভারির ৭ দিনের মধ্যে অব্যবহৃত পণ্য ফেরত দেওয়া যাবে। শাড়ি ও পাঞ্জাবিতে ট্যাগ থাকতে হবে।'] },
  { topic: 'returns', en: ['How long do refunds take?', 'Refunds are sent to your bKash/Nagad or card within 5–7 working days after we receive the item.'], bn: ['রিফান্ড পেতে কত দিন লাগে?', 'পণ্য পাওয়ার পর ৫–৭ কর্মদিবসের মধ্যে বিকাশ/নগদ বা কার্ডে রিফান্ড পাঠানো হয়।'] },
  { topic: 'products', en: ['Are your jamdani sarees handwoven?', 'Yes. All jamdani sarees are handwoven by artisans in Narayanganj and Tangail.'], bn: ['আপনাদের জামদানি শাড়ি কি হাতে বোনা?', 'হ্যাঁ। সব জামদানি শাড়ি নারায়ণগঞ্জ ও টাঙ্গাইলের কারিগরদের হাতে বোনা।'] },
  { topic: 'products', en: ['Do electronics come with warranty?', 'Walton and SoundBD electronics include a 1-year manufacturer warranty. Keep your invoice.'], bn: ['ইলেকট্রনিক্সে কি ওয়ারেন্টি আছে?', 'ওয়ালটন ও সাউন্ডবিডি পণ্যে ১ বছরের ম্যানুফ্যাকচারার ওয়ারেন্টি আছে। ইনভয়েস রেখে দিন।'] },
  { topic: 'account', en: ['How do I track my order?', 'Log in and open My account, or ask the assistant with your order number (for example DS-1001).'], bn: ['আমার অর্ডার কিভাবে ট্র্যাক করব?', 'লগ ইন করে "আমার অ্যাকাউন্ট" খুলুন, অথবা অর্ডার নম্বর দিয়ে অ্যাসিস্ট্যান্টকে জিজ্ঞেস করুন (যেমন DS-1001)।'] },
]

export const policies: { slug: string; kind: Policy['kind']; en: [string, string[]]; bn: [string, string[]] }[] = [
  { slug: 'shipping', kind: 'shipping', en: ['Shipping Policy', ['We deliver across Bangladesh through Pathao and RedX.', 'Inside Dhaka: 1–2 days, ৳60. Outside Dhaka: 3–5 days, ৳120. Free delivery above ৳3,000.', 'Orders placed before 2 pm ship the same day (except Fridays).']], bn: ['শিপিং নীতি', ['আমরা পাঠাও ও রেডএক্সের মাধ্যমে সারা বাংলাদেশে ডেলিভারি দিই।', 'ঢাকার ভিতরে: ১–২ দিন, ৳৬০। ঢাকার বাইরে: ৩–৫ দিন, ৳১২০। ৳৩,০০০ এর বেশি হলে ফ্রি ডেলিভারি।', 'দুপুর ২টার আগে অর্ডার করলে সেদিনই পাঠানো হয় (শুক্রবার ছাড়া)।']] },
  { slug: 'returns', kind: 'returns', en: ['Returns & Exchanges', ['Unused items in original packaging can be returned within 7 days of delivery.', 'Exchanges for size or colour are free once per order.', 'Groceries, beauty products and books cannot be returned once opened.', 'Refunds are issued within 5–7 working days to the original payment method.']], bn: ['ফেরত ও বিনিময়', ['ডেলিভারির ৭ দিনের মধ্যে মূল প্যাকেটে অব্যবহৃত পণ্য ফেরত দেওয়া যাবে।', 'সাইজ বা রঙ বদল প্রতি অর্ডারে একবার বিনামূল্যে।', 'মুদি, সৌন্দর্য পণ্য ও বই খোলার পর ফেরত হবে না।', 'মূল পেমেন্ট মাধ্যমে ৫–৭ কর্মদিবসে রিফান্ড দেওয়া হয়।']] },
  { slug: 'warranty', kind: 'warranty', en: ['Warranty', ['Electronics carry the manufacturer warranty stated on the product page (usually 1 year).', 'Warranty does not cover physical or water damage.']], bn: ['ওয়ারেন্টি', ['ইলেকট্রনিক্সে পণ্যের পাতায় উল্লিখিত ম্যানুফ্যাকচারার ওয়ারেন্টি থাকে (সাধারণত ১ বছর)।', 'শারীরিক বা পানিতে ক্ষতি ওয়ারেন্টির আওতায় নয়।']] },
  { slug: 'privacy', kind: 'privacy', en: ['Privacy Policy', ['We only use your data to process orders and, if you opt in, to send offers.', 'Our AI assistant never shares your order details with other customers. You can ask us to delete your chat history at any time.']], bn: ['গোপনীয়তা নীতি', ['আমরা শুধু অর্ডার প্রসেস করতে এবং আপনি সম্মতি দিলে অফার পাঠাতে আপনার তথ্য ব্যবহার করি।', 'আমাদের এআই অ্যাসিস্ট্যান্ট কখনো আপনার অর্ডারের তথ্য অন্য গ্রাহকের সাথে শেয়ার করে না। যেকোনো সময় চ্যাট ইতিহাস মুছে ফেলতে বলতে পারেন।']] },
]

export const pages: { slug: string; en: [string, string[]]; bn: [string, string[]] }[] = [
  { slug: 'about', en: ['About us', ['AI Dev Store sells handloom textiles, local groceries and everyday electronics from all over Bangladesh.', 'Our showroom is at House 12, Road 5, Dhanmondi, Dhaka. Open Saturday–Thursday, 10 am–8 pm.']], bn: ['আমাদের সম্পর্কে', ['এআই ডেভ স্টোর সারা বাংলাদেশের তাঁতের কাপড়, দেশি মুদি পণ্য ও দৈনন্দিন ইলেকট্রনিক্স বিক্রি করে।', 'আমাদের শোরুম: বাড়ি ১২, রোড ৫, ধানমন্ডি, ঢাকা। শনি–বৃহস্পতি, সকাল ১০টা–রাত ৮টা।']] },
  { slug: 'contact', en: ['Contact', ['Call 09600-000000 or email help@example.test. WhatsApp support is available 10 am–8 pm.']], bn: ['যোগাযোগ', ['০৯৬০০-০০০০০০ নম্বরে কল করুন বা help@example.test এ ইমেইল করুন। হোয়াটসঅ্যাপ সাপোর্ট সকাল ১০টা–রাত ৮টা।']] },
]

export const posts: { slug: string; en: [string, string, string[]]; bn: [string, string, string[]]; related: string[] }[] = [
  { slug: 'how-to-care-for-jamdani', related: ['red-jamdani-saree', 'green-katan-silk-saree'], en: ['How to care for your jamdani saree', 'Dry clean first, store in muslin.', ['Dry clean the first two washes.', 'Store folded in a muslin cloth and refold every few months to avoid creases tearing.']], bn: ['জামদানি শাড়ির যত্ন কিভাবে নেবেন', 'প্রথমে ড্রাই ক্লিন, মসলিনে রাখুন।', ['প্রথম দুইবার ড্রাই ক্লিন করুন।', 'মসলিন কাপড়ে ভাঁজ করে রাখুন এবং কয়েক মাস পরপর ভাঁজ বদলান।']] },
  { slug: 'eid-gift-guide', related: ['white-cotton-panjabi', 'maroon-silk-panjabi', 'sundarbans-honey-500g'], en: ['Eid gift guide', 'Panjabi, honey and more.', ['Panjabi in every size, Sundarbans honey and clay tea cups make thoughtful Eid gifts.']], bn: ['ঈদ উপহার গাইড', 'পাঞ্জাবি, মধু ও আরও অনেক কিছু।', ['সব সাইজের পাঞ্জাবি, সুন্দরবনের মধু ও মাটির কাপ ঈদের সুন্দর উপহার।']] },
]

export const reviews: { product: string; customer: 'A' | 'B'; rating: number; title: string; body: string; locale: 'en' | 'bn'; status: 'approved' | 'pending' | 'held' }[] = [
  { product: 'red-jamdani-saree', customer: 'A', rating: 5, title: 'Beautiful weave', body: 'The colour is exactly as shown and the weave is very fine. Got many compliments.', locale: 'en', status: 'approved' },
  { product: 'red-jamdani-saree', customer: 'B', rating: 4, title: 'সুন্দর শাড়ি', body: 'শাড়িটা খুব সুন্দর, তবে ডেলিভারি একদিন দেরি হয়েছে।', locale: 'bn', status: 'approved' },
  { product: 'walton-smartphone-x9', customer: 'B', rating: 4, title: 'Great battery', body: 'Battery easily lasts two days. Camera is average in low light.', locale: 'en', status: 'approved' },
  { product: 'walton-smartphone-x9', customer: 'A', rating: 2, title: 'Heats up', body: 'Phone gets warm while gaming and the charger was missing from the box.', locale: 'en', status: 'approved' },
  { product: 'bluetooth-earbuds-pro', customer: 'A', rating: 5, title: 'Worth it', body: 'Noise cancelling works well on Dhaka buses!', locale: 'en', status: 'approved' },
  { product: 'rechargeable-desk-fan', customer: 'B', rating: 5, title: 'লোডশেডিংয়ে কাজের', body: 'লোডশেডিংয়ের সময় প্রায় ৬ ঘণ্টা চলে। খুব কাজের।', locale: 'bn', status: 'approved' },
  { product: 'sundarbans-honey-500g', customer: 'A', rating: 5, title: 'Real honey', body: 'Thick and fragrant, tastes like real khalisha honey.', locale: 'en', status: 'approved' },
  { product: 'sundarbans-honey-500g', customer: 'B', rating: 1, title: 'Spam', body: 'BUY CHEAP FOLLOWERS at http://spam.example — best price!!!', locale: 'en', status: 'held' },
  { product: 'non-stick-frying-pan', customer: 'B', rating: 3, title: 'OK pan', body: 'Coating started wearing off after two months of daily use.', locale: 'en', status: 'approved' },
  { product: 'white-cotton-panjabi', customer: 'A', rating: 4, title: 'আরামদায়ক', body: 'কাপড় আরামদায়ক, তবে সাইজ একটু বড়। এক সাইজ ছোট নিন।', locale: 'bn', status: 'approved' },
  { product: 'nakshi-kantha-throw', customer: 'B', rating: 5, title: 'Art piece', body: 'Stunning handwork, hangs on our wall now.', locale: 'en', status: 'pending' },
  { product: 'pressure-cooker-5l', customer: 'A', rating: 4, title: 'Solid', body: 'Cooks beef in 20 minutes. Whistle is loud.', locale: 'en', status: 'approved' },
]
