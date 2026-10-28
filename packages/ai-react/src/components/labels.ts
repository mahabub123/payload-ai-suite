export interface Labels {
  open: string
  close: string
  title: string
  aiNotice: string
  placeholder: string
  send: string
  stop: string
  newChat: string
  thinking: string
  confirm: string
  cancel: string
  inStock: string
  outOfStock: string
  onlyLeft: (n: number) => string
  addedToCart: string
  subtotal: string
  order: string
  handoff: (reply: string) => string
  sources: string
  verifyTitle: string
  orderNumber: string
  email: string
  sendCode: string
  code: string
  verifyCode: string
  login: string
  helpful: string
  notHelpful: string
  noResults: string
  loadMore: string
  search: string
  booked: string
  leadSaved: string
  pickSlot: string
  expires: string
}

export const LABELS: Record<'en' | 'bn', Labels> = {
  en: {
    open: 'Open chat assistant',
    close: 'Close chat',
    title: 'Shop assistant',
    aiNotice: 'You are chatting with an AI assistant. It can make mistakes; prices and stock come from our store.',
    placeholder: 'Ask about products, orders, returns…',
    send: 'Send',
    stop: 'Stop',
    newChat: 'New chat',
    thinking: 'Checking…',
    confirm: 'Confirm',
    cancel: 'Cancel',
    inStock: 'In stock',
    outOfStock: 'Out of stock',
    onlyLeft: (n) => `Only ${n} left`,
    addedToCart: 'Added to cart',
    subtotal: 'Subtotal',
    order: 'Order',
    handoff: (r) => `A team member will reply ${r}.`,
    sources: 'Sources',
    verifyTitle: 'Verify your order',
    orderNumber: 'Order number',
    email: 'Email',
    sendCode: 'Send code',
    code: '6-digit code',
    verifyCode: 'Verify',
    login: 'Log in',
    helpful: 'Helpful',
    notHelpful: 'Not helpful',
    noResults: 'No results',
    loadMore: 'Load more',
    search: 'Search',
    booked: 'Tentative booking',
    leadSaved: 'Thanks! We saved your request and will contact you.',
    pickSlot: 'Book',
    expires: 'Expires',
  },
  bn: {
    open: 'চ্যাট সহকারী খুলুন',
    close: 'চ্যাট বন্ধ করুন',
    title: 'শপ সহকারী',
    aiNotice: 'আপনি একটি AI সহকারীর সাথে কথা বলছেন। এটি ভুল করতে পারে; দাম ও স্টক আমাদের স্টোর থেকে আসে।',
    placeholder: 'পণ্য, অর্ডার, রিটার্ন নিয়ে জিজ্ঞাসা করুন…',
    send: 'পাঠান',
    stop: 'থামান',
    newChat: 'নতুন চ্যাট',
    thinking: 'যাচাই করছি…',
    confirm: 'নিশ্চিত করুন',
    cancel: 'বাতিল',
    inStock: 'স্টকে আছে',
    outOfStock: 'স্টকে নেই',
    onlyLeft: (n) => `মাত্র ${n}টি বাকি`,
    addedToCart: 'কার্টে যোগ হয়েছে',
    subtotal: 'সাবটোটাল',
    order: 'অর্ডার',
    handoff: (r) => `আমাদের টিমের একজন ${r} উত্তর দেবেন।`,
    sources: 'উৎস',
    verifyTitle: 'অর্ডার যাচাই করুন',
    orderNumber: 'অর্ডার নম্বর',
    email: 'ইমেইল',
    sendCode: 'কোড পাঠান',
    code: '৬-সংখ্যার কোড',
    verifyCode: 'যাচাই',
    login: 'লগ ইন',
    helpful: 'সহায়ক',
    notHelpful: 'সহায়ক নয়',
    noResults: 'কিছু পাওয়া যায়নি',
    loadMore: 'আরও দেখুন',
    search: 'খুঁজুন',
    booked: 'অস্থায়ী বুকিং',
    leadSaved: 'ধন্যবাদ! আপনার অনুরোধ সংরক্ষিত হয়েছে, আমরা যোগাযোগ করব।',
    pickSlot: 'বুক করুন',
    expires: 'মেয়াদ',
  },
}

export const labelsFor = (locale: string, overrides?: Partial<Labels>): Labels => ({
  ...(locale.toLowerCase().startsWith('bn') ? LABELS.bn : LABELS.en),
  ...overrides,
})
