import type { AutomationDefinition } from './types'

/**
 * Example automation: "new review -> summarize -> alert if negative".
 * Create it with `payload.create({ collection: 'ai-automations', data: reviewAlertAutomation('reviews', ['owner@example.com']) })`.
 */
export const reviewAlertAutomation = (reviewCollection = 'reviews', emailTo: string[] = []): AutomationDefinition => ({
  name: 'New review → summarize → alert if negative',
  enabled: true,
  trigger: { type: 'collection', collection: reviewCollection, operation: 'create', condition: null },
  steps: [
    { type: 'summarize', instructions: 'Summarize what the customer liked and disliked.', outputKey: 'summary' },
    {
      type: 'classify',
      instructions: 'Classify the overall sentiment of the review as exactly one of: positive, neutral, negative.',
      outputKey: 'sentiment',
    },
  ],
  approval: { required: false },
  action: {
    type: 'notify',
    when: { field: 'outputs.sentiment', op: 'equals', value: 'negative' },
    channel: emailTo.length ? 'email' : 'admin',
    emailTo,
    subject: 'Negative review received',
  },
})
