import type { Payload } from 'payload'
import type { CoreServices } from '../contracts'
import { AIError } from '../contracts'

const instances = new WeakMap<Payload, CoreServices>()

/** Called once by the core plugin's onInit. */
export const setAI = (payload: Payload, services: CoreServices): void => {
  instances.set(payload, services)
}

/** Core services for this Payload instance. Throws if ai-core is not installed or not initialised yet. */
export const getAI = (payload: Payload): CoreServices => {
  const s = instances.get(payload)
  if (!s) throw new AIError('unavailable', 'AI core is not initialised. Is aiCore() installed before the modules?')
  return s
}

export const hasAI = (payload: Payload): boolean => instances.has(payload)
