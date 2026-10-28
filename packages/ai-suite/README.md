# @payload-ai-suite/ai-suite

The one-line install for the Payload AI Suite. `aiSuite(options)` does three things:

1. builds the business adapters with `createAdapters({ preset, overrides, custom })`, or uses `options.adapters`;
2. installs `aiCore()`, passing through every core option (providers, routes, budgets, tenant, locales, roles and so on);
3. installs each enabled module in phase order: `content → search → assistant → marketing → support → channels → insights → media → copilot`.

All of this is returned as a single Payload plugin (`slug: 'ai-suite'`). Put it **after** plugins that create the collections it maps, such as `ecommercePlugin`.

```ts
import { aiSuite } from '@payload-ai-suite/ai-suite'

aiSuite({
  preset: 'ecommerce',
  providers: [{ id: 'openai', type: 'openai', apiKeyEnv: 'OPENAI_API_KEY' }],
  routes: { chat: ['openai:gpt-5-mini'], embed: ['openai:text-embedding-3-small'] },
  modules: { content: true, search: { hybrid: true }, assistant: true },
})
```

`modules.<key>` accepts `true` (use the defaults), an options object, or `false`/omitted (installs nothing). Invalid combinations throw an `AISuiteConfigError` that lists every problem it found.

This package also re-exports the ai-core public API, `createAdapters`, and every module's plugin factory and options type.
