import type { CollectionConfig } from 'payload'
import type { AICoreOptions, ProviderType } from '../contracts'
import { access } from '../access'
import { invalidateRouting } from '../router/state'
import { ADMIN_GROUP, SLUGS } from './slugs'
import { auditChange, hookCrypto, scrub } from './helpers'

export const PROVIDER_TYPES: ProviderType[] = [
  'openai', 'anthropic', 'google', 'azure', 'bedrock', 'mistral', 'groq', 'xai', 'deepseek', 'cohere', 'openrouter', 'openai-compatible', 'custom',
]

/** ai-providers: connections. Keys come from env by name, or a write-only encrypted BYOK key that is never returned. */
export const aiProvidersCollection = (options?: AICoreOptions): CollectionConfig => {
  const writer = options?.allowTenantKeys ? access.admin : access.superAdmin
  return {
    slug: SLUGS.providers,
    labels: { singular: 'AI provider', plural: 'AI providers' },
    admin: { group: ADMIN_GROUP, useAsTitle: 'name', defaultColumns: ['name', 'providerId', 'type', 'status', 'enabled'] },
    access: { read: writer, create: writer, update: writer, delete: writer },
    fields: [
      { name: 'name', type: 'text', required: true },
      {
        name: 'providerId',
        type: 'text',
        required: true,
        unique: true,
        index: true,
        admin: { description: 'Used in routes as providerId:modelId (no colons).' },
        validate: (v: unknown) => (typeof v === 'string' && /^[a-z0-9][a-z0-9_-]*$/i.test(v) ? true : 'Letters, digits, - and _ only'),
      },
      { name: 'type', type: 'select', required: true, options: PROVIDER_TYPES.map((t) => ({ label: t, value: t })) },
      { name: 'baseURL', type: 'text', admin: { description: 'Required for openai-compatible; optional override otherwise.' } },
      { name: 'headers', type: 'array', fields: [{ name: 'name', type: 'text', required: true }, { name: 'value', type: 'text' }] },
      { name: 'keyEnv', type: 'text', admin: { description: 'Name of the env var holding the API key (preferred). Never the key itself.' } },
      {
        name: 'apiKey',
        type: 'text',
        virtual: true,
        admin: {
          description: options?.allowTenantKeys ? 'Write-only. Stored encrypted (AES-256-GCM) and never shown again.' : 'Disabled: set allowTenantKeys to store keys in the database.',
          readOnly: !options?.allowTenantKeys,
        },
      },
      { name: 'clearKey', type: 'checkbox', virtual: true, admin: { description: 'Remove the stored key on save.' } },
      { name: 'encryptedKey', type: 'text', admin: { hidden: true }, access: { read: () => false } },
      { name: 'keySet', type: 'checkbox', defaultValue: false, admin: { readOnly: true, position: 'sidebar', description: 'A stored key exists.' } },
      { name: 'options', type: 'json', admin: { description: 'Vendor options passed to the SDK factory (e.g. {"apiVersion": "..."}).' } },
      { name: 'enabled', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
      {
        name: 'status',
        type: 'select',
        defaultValue: 'unknown',
        options: ['unknown', 'ok', 'degraded', 'error'].map((v) => ({ label: v, value: v })),
        admin: { readOnly: true, position: 'sidebar' },
      },
      { name: 'lastHealthCheck', type: 'date', admin: { readOnly: true, position: 'sidebar' } },
      { name: 'lastError', type: 'text', admin: { readOnly: true, position: 'sidebar' } },
      {
        name: 'testConnection',
        type: 'ui',
        admin: { position: 'sidebar', components: { Field: '@payload-ai-suite/ai-core/client#ProviderTestButton' } },
      },
    ],
    hooks: {
      beforeChange: [
        ({ data, req, originalDoc }) => {
          const apiKey = typeof data.apiKey === 'string' ? data.apiKey.trim() : ''
          const clear = data.clearKey === true
          delete data.apiKey
          delete data.clearKey
          if (!req.context?.aiInternal) delete data.encryptedKey
          if (apiKey) {
            if (!options?.allowTenantKeys) throw new Error('Storing API keys in the database is disabled (allowTenantKeys: false). Use keyEnv.')
            data.encryptedKey = hookCrypto(options).encrypt(apiKey)
            data.keySet = true
          } else if (clear) {
            data.encryptedKey = null
            data.keySet = false
          } else if (originalDoc) data.keySet = originalDoc.keySet ?? false
          return data
        },
      ],
      afterRead: [
        ({ doc, req }) => {
          delete doc.apiKey
          delete doc.clearKey
          if (!req.context?.aiInternal) delete doc.encryptedKey
          return doc
        },
      ],
      afterChange: [
        async ({ doc, previousDoc, operation, req }) => {
          invalidateRouting()
          if (!req.context?.aiHealthUpdate) {
            await auditChange(req, options, { action: `provider.${operation}`, target: { collection: SLUGS.providers, id: doc.id }, before: scrub(previousDoc), after: scrub(doc) })
          }
          return doc
        },
      ],
      afterDelete: [
        async ({ doc, req }) => {
          invalidateRouting()
          await auditChange(req, options, { action: 'provider.delete', target: { collection: SLUGS.providers, id: doc.id }, before: scrub(doc) })
        },
      ],
    },
  }
}
