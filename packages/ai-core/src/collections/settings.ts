import type { GlobalConfig } from 'payload'
import type { AICoreOptions, TaskClass } from '../contracts'
import { TASK_CLASSES } from '../contracts'
import { access } from '../access'
import { invalidateRouting } from '../router/state'
import { ALL_MODULES, DEFAULT_SETTINGS, invalidateAllSettings } from '../settings'
import { ADMIN_GROUP, SLUGS } from './slugs'
import { auditChange } from './helpers'

export interface AISettingsGlobalOptions extends Partial<AICoreOptions> {
  /** Modules offered in enabledModules (default: all suite modules). */
  knownModules?: string[]
  /** Show the usage dashboard as a tab on the global (default true). */
  usageDashboard?: boolean
}

const d = DEFAULT_SETTINGS

/** ai-settings: enabled modules, brand voice, limits, budgets, retention, default routes. Super admin only; keys stay in env. */
export const aiSettingsGlobal = (options: AISettingsGlobalOptions = {}): GlobalConfig => {
  const modules = options.knownModules ?? [...ALL_MODULES]
  return {
    slug: SLUGS.settings,
    label: 'AI settings',
    admin: { group: ADMIN_GROUP },
    access: { read: access.superAdmin, update: access.superAdmin },
    fields: [
      {
        type: 'tabs',
        tabs: [
          {
            label: 'General',
            fields: [
              {
                name: 'enabledModules',
                type: 'select',
                hasMany: true,
                options: modules.map((m) => ({ label: m, value: m })),
                admin: { description: 'Disabled modules hide their UI and block their endpoints; data is kept. Empty = all installed modules.' },
              },
              { name: 'brandVoice', type: 'textarea', admin: { description: 'Shared brand-voice block added to prompts.' } },
              { name: 'allowedDomains', type: 'text', hasMany: true, admin: { description: 'Domains AI output may link to.' } },
              { name: 'noTraining', type: 'checkbox', defaultValue: true, label: 'Ask providers not to train on our data' },
            ],
          },
          {
            label: 'Limits',
            name: 'limits',
            fields: [
              { name: 'visitorPerMinute', type: 'number', defaultValue: d.limits.visitorPerMinute, min: 1 },
              { name: 'visitorPerDay', type: 'number', defaultValue: d.limits.visitorPerDay, min: 1 },
              { name: 'maxInputChars', type: 'number', defaultValue: d.limits.maxInputChars, min: 100 },
              { name: 'maxOutputTokensShopper', type: 'number', defaultValue: d.limits.maxOutputTokensShopper, min: 16 },
            ],
          },
          {
            label: 'Budgets',
            name: 'budgets',
            description: 'Amounts in micro-USD (1,000,000 = $1). Warn at 80%, block at 100%.',
            fields: [
              { name: 'monthlyMicros', type: 'number', min: 0, defaultValue: options.budgets?.monthlyMicros, admin: { description: 'Monthly budget for this site/tenant.' } },
              {
                name: 'perModule',
                type: 'array',
                fields: [
                  { name: 'module', type: 'select', required: true, options: modules.map((m) => ({ label: m, value: m })) },
                  { name: 'share', type: 'number', min: 0, max: 1, admin: { description: 'Share of the monthly budget (0..1).' } },
                  { name: 'limitMicros', type: 'number', min: 0, admin: { description: 'Or an absolute monthly limit (wins over share).' } },
                ],
              },
            ],
          },
          {
            label: 'Retention',
            name: 'retention',
            fields: [
              { name: 'shopperChatsDays', type: 'number', defaultValue: options.retention?.shopperChatsDays ?? d.retention.shopperChatsDays },
              { name: 'staffChatsDays', type: 'number', defaultValue: options.retention?.staffChatsDays ?? d.retention.staffChatsDays },
              { name: 'usageDays', type: 'number', defaultValue: options.retention?.usageDays ?? d.retention.usageDays },
              { name: 'auditDays', type: 'number', defaultValue: options.retention?.auditDays ?? d.retention.auditDays },
            ],
          },
          {
            label: 'Default routes',
            description: 'Model per task class. ai-routes entries (module/tenant/locale) override these.',
            fields: [
              {
                name: 'routes',
                type: 'array',
                fields: [
                  { name: 'task', type: 'select', required: true, options: TASK_CLASSES.map((t: TaskClass) => ({ label: t, value: t })) },
                  { name: 'models', type: 'text', hasMany: true, required: true, admin: { description: 'Ordered providerId:modelId list.' } },
                  { name: 'timeoutMs', type: 'number', min: 1000 },
                  { name: 'maxRetries', type: 'number', min: 0, max: 3 },
                ],
              },
            ],
          },
          ...(options.usageDashboard === false
            ? []
            : [
                {
                  label: 'Usage',
                  fields: [{ name: 'usageDashboard', type: 'ui' as const, admin: { components: { Field: '@payload-ai-suite/ai-core/client#UsageDashboard' } } }],
                },
              ]),
        ],
      },
    ],
    hooks: {
      afterChange: [
        async ({ doc, previousDoc, req }) => {
          invalidateAllSettings()
          invalidateRouting()
          await auditChange(req, options as AICoreOptions, { action: 'settings.update', target: { collection: SLUGS.settings }, before: previousDoc, after: doc })
          return doc
        },
      ],
    },
  }
}
