# Engineering conventions (read before writing code)

- Package manager: pnpm workspaces. Node >= 22. TypeScript 5.9 strict, ESM, `moduleResolution: Bundler`.
- Packages ship TypeScript source (`exports` → `./src/*.ts`); `publishConfig` maps to `dist`. Relative imports have NO file extension.
- Package names: `@payload-ai-suite/<dir>`. Payload 3.92.1, `ai` (Vercel AI SDK) v7, zod v4. Check the installed type definitions under node_modules rather than relying on memory — APIs changed across major versions.
- Contracts live in `packages/ai-core/src/contracts/*`. They are the shared API between packages. Do NOT change them unilaterally; if a contract truly blocks you, make the smallest additive change (optional field / new member), and list it in your final report.
- Modules: export `aiXxx(options) => Plugin` built with `createAIModulePlugin(def)` from ai-core. Never call a model, vendor SDK, or vector SQL directly — use `getAI(payload)` services (`ai`, `agent`, `vectors`, `knowledge`, `prompts`, `guardrails`, `memory`, `actions`, `usage`, `budgets`, `audit`).
- Business data only through `ctx.adapters` (concept adapters) with `ctx.adapterCtx` (caller access). Jobs use `services.systemContext(payload, { module, tenant })`.
- Endpoints: define with `AIEndpointDefinition` (path must start `/ai/`), validated with zod; the core guard pipeline handles identity, tenant, access, rate limit, budget, Turnstile. Streaming handlers return `AsyncIterable<StreamWireEvent>`.
- Collections: slug prefix `ai-`, `admin.group: 'AI Suite'`, access functions per §12 access matrix (use helpers exported by ai-core: `access.*`). Add a `tenant` field only via the core helper `withTenantField()` so it's applied consistently.
- Jobs: Payload Jobs Queue tasks, slug `ai-<module>-<name>`, idempotent, retries set.
- Money: integer minor units. Hash identifiers used only for joining (`services.crypto.hashId`).
- Admin UI components: put client components in `src/components/*.tsx` with 'use client', export them from `src/exports/client.ts`; server components from `src/exports/rsc.ts`. Reference them in config by path string `'@payload-ai-suite/<pkg>/client#ComponentName'`.
- Tests: Vitest, colocated `*.test.ts` under `src/`. No test may call a paid API — use `@payload-ai-suite/ai-core/testing` (mock provider, mock services) or local fakes.
- Comments: brief, only where intent isn't obvious. No placeholder TODOs in delivered code unless it is truly external (e.g. a vendor credential).
- Run `pnpm --filter <pkg> typecheck` and `pnpm --filter <pkg> test` before finishing.
