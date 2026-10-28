import type { CollectionConfig } from 'payload'
import type { AICoreOptions, Capability, TaskClass } from '../contracts'
import { TASK_CLASSES } from '../contracts'
import { access } from '../access'
import { invalidateRouting } from '../router/state'
import { ADMIN_GROUP, SLUGS } from './slugs'
import { auditChange } from './helpers'

export const CAPABILITIES: Capability[] = ['chat', 'streaming', 'tools', 'structuredOutput', 'vision', 'embeddings', 'imageGeneration', 'promptCaching', 'batch']

const micros = (label: string) => ({ description: `${label} in micro-USD (1,000,000 = $1).` })

/** ai-models: per-model capability/price overrides on top of the built-in catalog. */
export const aiModelsCollection = (options?: AICoreOptions): CollectionConfig => ({
  slug: SLUGS.models,
  labels: { singular: 'AI model', plural: 'AI models' },
  admin: { group: ADMIN_GROUP, useAsTitle: 'ref', defaultColumns: ['ref', 'capabilities', 'enabled'] },
  access: { read: access.superAdmin, create: access.superAdmin, update: access.superAdmin, delete: access.superAdmin },
  fields: [
    { name: 'providerId', type: 'text', required: true, index: true },
    { name: 'modelId', type: 'text', required: true },
    { name: 'ref', type: 'text', unique: true, index: true, admin: { readOnly: true } },
    { name: 'capabilities', type: 'select', hasMany: true, options: CAPABILITIES.map((c) => ({ label: c, value: c })) },
    { name: 'contextWindow', type: 'number' },
    { name: 'maxOutput', type: 'number' },
    { name: 'embedDims', type: 'number', admin: { description: 'Embedding dimensions (embedding models only).' } },
    { name: 'inputPriceMicrosPerM', type: 'number', admin: micros('Price per million input tokens') },
    { name: 'outputPriceMicrosPerM', type: 'number', admin: micros('Price per million output tokens') },
    { name: 'cachedInputPriceMicrosPerM', type: 'number', admin: micros('Price per million cached input tokens') },
    { name: 'imagePriceMicros', type: 'number', admin: micros('Price per generated image') },
    { name: 'languagesVerified', type: 'text', hasMany: true, admin: { description: 'Locales that passed the language eval, e.g. en, bn.' } },
    { name: 'enabled', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
  ],
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        const providerId = data.providerId ?? originalDoc?.providerId
        const modelId = data.modelId ?? originalDoc?.modelId
        if (providerId && modelId) data.ref = `${providerId}:${modelId}`
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        invalidateRouting()
        await auditChange(req, options, { action: `model.${operation}`, target: { collection: SLUGS.models, id: doc.id }, before: previousDoc, after: doc })
        return doc
      },
    ],
    afterDelete: [() => invalidateRouting()],
  },
})

/** ai-routes: task class -> ordered model list, per scope (global/module/tenant/locale). */
export const aiRoutesCollection = (options?: AICoreOptions): CollectionConfig => ({
  slug: SLUGS.routes,
  labels: { singular: 'AI route', plural: 'AI routes' },
  admin: { group: ADMIN_GROUP, useAsTitle: 'taskClass', defaultColumns: ['taskClass', 'scope', 'scopeValue', 'models', 'enabled'] },
  access: { read: access.superAdmin, create: access.superAdmin, update: access.superAdmin, delete: access.superAdmin },
  fields: [
    { name: 'taskClass', type: 'select', required: true, options: TASK_CLASSES.map((t: TaskClass) => ({ label: t, value: t })) },
    {
      name: 'scope',
      type: 'select',
      required: true,
      defaultValue: 'global',
      options: ['global', 'module', 'tenant', 'locale'].map((v) => ({ label: v, value: v })),
    },
    { name: 'scopeValue', type: 'text', admin: { description: 'Module key, tenant id or locale code (empty for global).', condition: (_, s) => s?.scope !== 'global' } },
    {
      name: 'models',
      type: 'text',
      hasMany: true,
      required: true,
      admin: { description: 'Ordered fallback list of providerId:modelId.' },
      validate: (v: unknown) =>
        Array.isArray(v) && v.length && v.every((x) => typeof x === 'string' && /^[^:\s]+:\S+$/.test(x)) ? true : 'Enter at least one providerId:modelId',
    },
    { name: 'timeoutMs', type: 'number', min: 1000, admin: { description: 'Per-attempt timeout (default 30000).' } },
    { name: 'maxRetries', type: 'number', min: 0, max: 3, admin: { description: 'Retries per model on retryable errors (default 1).' } },
    { name: 'enabled', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
  ],
  hooks: {
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        invalidateRouting()
        await auditChange(req, options, { action: `route.${operation}`, target: { collection: SLUGS.routes, id: doc.id }, before: previousDoc, after: doc })
        return doc
      },
    ],
    afterDelete: [() => invalidateRouting()],
  },
})
