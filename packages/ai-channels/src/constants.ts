export const MODULE = 'channels'
export const IDENTITIES = 'ai-channel-identities'
export const MESSAGES = 'ai-channel-messages'
export const TASK_INBOUND = 'ai-channels-inbound'
export const TASK_SEND = 'ai-channels-send'

/** Platform message limits (characters). */
export const LIMITS = { whatsapp: 4096, messenger: 2000, email: 100_000 } as const

/** Meta customer-service window. */
export const WINDOW_MS = 24 * 60 * 60 * 1000
