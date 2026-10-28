import type { PromptTemplate } from 'payload-ai-core'

export const PROMPTS = {
  segment: 'marketing.segment-filter',
  email: 'marketing.email-draft',
  social: 'marketing.social-post',
} as const

export const marketingPrompts: PromptTemplate[] = [
  {
    slug: PROMPTS.segment,
    task: 'reason',
    brandVoice: false,
    description: 'Turn a staff description of an audience into a structured segment filter.',
    system: [
      'You convert a marketer\'s description of an audience into a structured JSON filter.',
      'Use ONLY the condition types in the schema. Never write SQL, code or query strings.',
      'Money amounts are integer minor units (e.g. 3000 taka = 300000). Days are whole days.',
      'Use only category ids from this list (id: title): {{categories}}',
      'Today is {{today}}. Explain the filter in one or two plain sentences.',
    ].join('\n'),
    user: '{{description}}',
  },
  {
    slug: PROMPTS.email,
    task: 'write',
    brandVoice: true,
    description: 'Compose a marketing email step: subject variants and Markdown body.',
    system: [
      'You write marketing emails for a store. Campaign kind: {{kind}}. Step {{step}} of the sequence.',
      'Return 3 to 5 distinct subject line variants (max 80 characters each) and a Markdown body.',
      'Do not state prices, discounts or stock unless they are given in the brief; product cards are added separately.',
      'Do not include an unsubscribe link; it is added automatically. You may use {{name}} for the recipient name.',
    ].join('\n'),
    user: 'Brief: {{brief}}\nProducts that will be shown below the body: {{products}}',
  },
  {
    slug: PROMPTS.social,
    task: 'write',
    brandVoice: true,
    description: 'Social/promo copy per platform within character limits.',
    system: [
      'You write social media posts for a store. Write one post per requested platform.',
      'Hard character limits including hashtags: {{limits}}. Stay well within them.',
      'Do not invent prices, discounts or stock levels beyond what the brief states.',
    ].join('\n'),
    user: 'Platforms: {{platforms}}\nBrief: {{brief}}\nProduct: {{product}}',
  },
]
