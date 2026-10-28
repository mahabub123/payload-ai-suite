import type { AiChannelsOptions, ChannelName } from '../options'
import { createEmailDriver } from './email'
import { createMessengerDriver, createWhatsAppDriver } from './meta'
import type { ChannelDriver } from './types'

export * from './types'
export { createWhatsAppDriver, createMessengerDriver } from './meta'
export { createEmailDriver } from './email'

/** Build the enabled drivers from options. */
export const createDrivers = (
  options: AiChannelsOptions,
  source: Record<string, string | undefined> = process.env,
): Map<ChannelName, ChannelDriver> => {
  const m = new Map<ChannelName, ChannelDriver>()
  if (options.whatsapp) m.set('whatsapp', createWhatsAppDriver(options.whatsapp, source))
  if (options.messenger) m.set('messenger', createMessengerDriver(options.messenger, source))
  if (options.email) m.set('email', createEmailDriver(options.email, source))
  return m
}
