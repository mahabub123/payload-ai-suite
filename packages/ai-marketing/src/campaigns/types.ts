export type CampaignKind = 'one-off' | 'abandoned-cart' | 'welcome' | 'win-back' | 'post-purchase-review'
export type CampaignStatus = 'draft' | 'pending-approval' | 'approved' | 'scheduled' | 'sending' | 'sent' | 'paused'
export type DraftStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'skipped'

export const CAMPAIGN_KINDS: CampaignKind[] = ['one-off', 'abandoned-cart', 'welcome', 'win-back', 'post-purchase-review']
export const CAMPAIGN_STATUSES: CampaignStatus[] = ['draft', 'pending-approval', 'approved', 'scheduled', 'sending', 'sent', 'paused']
/** Triggered sequences stay active after approval; one-off campaigns finish as 'sent'. */
export const SEQUENCE_KINDS: CampaignKind[] = ['abandoned-cart', 'welcome', 'win-back', 'post-purchase-review']

export interface ProductBlock {
  offeringId: string
  title: string
  url?: string
  imageUrl?: string
  price?: { amount: number; currency: string }
}

export interface CampaignStep {
  id?: string
  delayHours?: number | null
  subjectVariants?: { subject: string; id?: string }[] | null
  chosenSubject?: string | null
  markdown?: string | null
  html?: string | null
  text?: string | null
  productBlocks?: ProductBlock[] | null
}

export interface CampaignDoc {
  id: string | number
  name: string
  kind: CampaignKind
  segment?: string | number | { id: string | number } | null
  steps?: CampaignStep[] | null
  status: CampaignStatus
  author?: string | null
  approvedBy?: string | null
  approvedAt?: string | null
  approvedHash?: string | null
  scheduledAt?: string | null
  tenant?: string | number | { id: string | number } | null
}

export interface Recipient {
  email: string
  customerId?: string
  name?: string
  /** Extra idempotency dimension for triggered sequences (cart id, order id). */
  ref?: string
}

export const relId = (v: unknown): string | undefined => {
  if (v === null || v === undefined || v === '') return undefined
  if (typeof v === 'object') return relId((v as { id?: unknown }).id)
  return String(v)
}
