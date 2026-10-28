import type { AITool } from '@payload-ai-suite/ai-core'
import type { AssistantToolGroup, ResolvedAssistantOptions } from '../options'
import { addToCart } from './cart'
import { checkStock, getOffering, searchOfferingsFallback } from './catalog'
import { bookSlot, checkAvailability } from './booking'
import { handOff } from './handoff'
import { getPolicy, searchKnowledge } from './knowledge'
import { captureLead } from './leads'
import { getOrderStatus, listMyOrders, proposeReturn, requestOrderVerification } from './orders'

export { addToCart, checkStock, getOffering, searchOfferingsFallback, bookSlot, checkAvailability, handOff, getPolicy, searchKnowledge, captureLead, getOrderStatus, listMyOrders, proposeReturn, requestOrderVerification }

/** Tool names per group. `searchOfferings` may be ai-search's implementation. */
export const TOOL_GROUPS: Record<AssistantToolGroup, string[]> = {
  catalog: ['searchOfferings', 'getOffering', 'checkStock'],
  cart: ['addToCart'],
  orders: ['getOrderStatus', 'listMyOrders', 'requestOrderVerification'],
  returns: ['proposeReturn', 'requestOrderVerification'],
  leads: ['captureLead'],
  booking: ['checkAvailability', 'bookSlot'],
  knowledge: ['getPolicy', 'searchKnowledge'],
}

/** Tools registered by the module definition (searchOfferings is added in onInit only when missing). */
export const assistantTools = (o: ResolvedAssistantOptions): AITool[] => {
  const all: AITool[] = [getOffering, checkStock, getPolicy, searchKnowledge, addToCart, getOrderStatus, listMyOrders, requestOrderVerification, proposeReturn, captureLead, checkAvailability, bookSlot]
  const names = new Set(toolNames(o))
  const tools = all.filter((t) => names.has(t.name))
  if (o.handoff !== false) tools.push(handOff)
  return tools
}

export const toolNames = (o: ResolvedAssistantOptions): string[] => {
  const names = new Set(o.tools.flatMap((g) => TOOL_GROUPS[g]))
  if (o.handoff !== false) names.add('handOff')
  return [...names]
}
