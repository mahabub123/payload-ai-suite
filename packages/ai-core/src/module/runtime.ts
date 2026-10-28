import type { Payload } from 'payload'
import type { CoreServices } from '../contracts'
import { AIError } from '../contracts'

/**
 * Kept on globalThis: in `next dev`, a code change re-evaluates this module while Payload keeps its cached
 * instance (and does not re-run onInit), so a module-level map would lose every service until a restart.
 */
const REGISTRY = Symbol.for('payload-ai-suite.instances')
const g = globalThis as typeof globalThis & { [REGISTRY]?: WeakMap<Payload, CoreServices> }
const instances = (g[REGISTRY] ??= new WeakMap<Payload, CoreServices>())

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
