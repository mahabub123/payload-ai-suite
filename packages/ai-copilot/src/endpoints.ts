import { z } from 'zod'
import type { AIEndpointDefinition, AITool } from 'payload-ai-core'
import { applyChangeset, discardChangeset } from './changesets'
import { copilotChat } from './chat'
import { decideRun } from './automations/runner'
import type { ResolvedCopilotOptions } from './options'

const idParams = z.object({ params: z.object({ id: z.string().min(1) }) }).passthrough()

export const buildEndpoints = (opts: ResolvedCopilotOptions, tools: AITool[]): AIEndpointDefinition<any>[] => {
  const endpoints: AIEndpointDefinition<any>[] = [
    {
      path: '/ai/copilot/chat',
      method: 'post',
      module: 'copilot',
      access: 'staff',
      surface: 'admin',
      input: z.object({
        message: z.string().min(1).max(4000),
        conversationId: z.string().optional(),
        page: z.object({ collection: z.string().optional(), id: z.union([z.string(), z.number()]).optional(), url: z.string().optional() }).optional(),
      }),
      handler: async ({ ctx, services, input }) => copilotChat(services, ctx, input, tools, opts.collections),
    },
    {
      path: '/ai/copilot/changesets/:id/apply',
      method: 'post',
      module: 'copilot',
      access: 'staff',
      surface: 'admin',
      budget: false,
      input: idParams,
      handler: async ({ ctx, services, input, req }) =>
        applyChangeset(services, ctx, input.params.id, {
          allowed: opts.collections,
          tenantField: opts.tenantField,
          idempotencyKey: req.headers?.get?.('idempotency-key') ?? undefined,
        }),
    },
    {
      path: '/ai/copilot/changesets/:id/discard',
      method: 'post',
      module: 'copilot',
      access: 'staff',
      surface: 'admin',
      budget: false,
      input: idParams,
      handler: async ({ ctx, services, input }) => discardChangeset(services, ctx, input.params.id, { tenantField: opts.tenantField }),
    },
  ]
  if (opts.automations) {
    for (const decision of ['approve', 'reject'] as const) {
      endpoints.push({
        path: `/ai/automations/runs/:id/${decision}`,
        method: 'post',
        module: 'copilot',
        access: 'staff',
        surface: 'admin',
        budget: false,
        input: idParams,
        handler: async ({ ctx, services, input }) => decideRun(services, ctx, input.params.id, decision, opts.defaultApprovalRole),
      })
    }
  }
  return endpoints
}
