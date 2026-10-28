import type { SuiteRole } from 'payload-ai-core'

export interface AiMarketingSequenceFlags {
  abandonedCart?: boolean
  welcome?: boolean
  winBack?: boolean
  postPurchaseReview?: boolean
}

export interface AiMarketingOptions {
  /** Suite role allowed to approve and send campaigns (store-admin and super-admin always pass). Default 'marketing-approver'. */
  approvalRole?: SuiteRole
  /** Max emails sent per UTC day across all campaigns. Default 2000. */
  dailySendLimit?: number
  /** From address for campaign emails. Defaults to Payload's email adapter default. */
  fromAddress?: string
  /** Base URL of the unsubscribe endpoint. Default `${serverURL}/api/ai/marketing/unsubscribe`. */
  unsubscribeUrlBase?: string
  /** Enable/disable triggered sequences. All default to true. */
  sequences?: AiMarketingSequenceFlags
  /** Four-eyes rule: the author of a campaign may not approve it. Default false. */
  fourEyes?: boolean
}

export interface ResolvedMarketingOptions {
  approvalRole: SuiteRole
  dailySendLimit: number
  fromAddress?: string
  unsubscribeUrlBase?: string
  sequences: Required<AiMarketingSequenceFlags>
  fourEyes: boolean
}

export const resolveOptions = (o: AiMarketingOptions = {}): ResolvedMarketingOptions => ({
  approvalRole: o.approvalRole ?? 'marketing-approver',
  dailySendLimit: o.dailySendLimit ?? 2000,
  fromAddress: o.fromAddress,
  unsubscribeUrlBase: o.unsubscribeUrlBase,
  sequences: {
    abandonedCart: o.sequences?.abandonedCart ?? true,
    welcome: o.sequences?.welcome ?? true,
    winBack: o.sequences?.winBack ?? true,
    postPurchaseReview: o.sequences?.postPurchaseReview ?? true,
  },
  fourEyes: o.fourEyes ?? false,
})
