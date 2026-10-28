# Graph Report - ai-core  (2026-10-28)

## Corpus Check
- 84 files · ~53,975 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 341 nodes · 423 edges · 19 communities detected
- Extraction: 76% EXTRACTED · 24% INFERRED · 0% AMBIGUOUS · INFERRED: 102 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]

## God Nodes (most connected - your core abstractions)
1. `createCoreServices()` - 18 edges
2. `stringify()` - 9 edges
3. `rolesOf()` - 8 edges
4. `setup()` - 8 edges
5. `get()` - 8 edges
6. `header()` - 8 edges
7. `resolveIdentity()` - 8 edges
8. `createAIContext()` - 8 edges
9. `createFakePayload()` - 7 edges
10. `json()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `createCoreServices()` --calls--> `createSettingsLoader()`  [INFERRED]
  src/services.ts → src/settings/index.ts
- `createCoreServices()` --calls--> `createVectorStore()`  [INFERRED]
  src/services.ts → src/vectors/index.ts
- `initCore()` --calls--> `createCoreServices()`  [INFERRED]
  src/plugin.ts → src/services.ts
- `options()` --calls--> `createMockProvider()`  [INFERRED]
  src/plugin.test.ts → src/testing/index.ts
- `setup()` --calls--> `tool()`  [INFERRED]
  src/agent/agent.test.ts → src/plugin.test.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (15): setup(), createFakePayload(), auditChange(), hookCrypto(), createAuditService(), createBudgetService(), createCrypto(), createGuardrails() (+7 more)

### Community 1 - "Community 1"
Cohesion: 0.14
Nodes (22): actorKey(), clientIp(), cookiesOf(), cookieString(), createAIContext(), enforceRateLimit(), enforceTurnstile(), errorResponse() (+14 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (13): checkAccess(), createActionService(), invalidatePromptCaches(), isStaffCtx(), onPromptActivated(), ownCustomerMemory(), coreOptionsFromReq(), defaultRoles() (+5 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (9): createFakeServices(), createMemoryService(), createMockProvider(), createTestContext(), createToolContext(), deleteConversations(), runRetention(), c() (+1 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (5): createAIClient(), createProviderRegistry(), chat(), setup(), invalidateRouting()

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (7): getSuiteState(), make(), aiTicketsCollection(), roles(), coreBCollections(), initCore(), setAI()

### Community 6 - "Community 6"
Cohesion: 0.14
Nodes (11): propose(), setup(), compactResult(), createAgentRuntime(), createToolRegistry(), isStaffActor(), maxTierFor(), runCall() (+3 more)

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (7): applyRedaction(), excludedPaths(), extractClaims(), redactWithFields(), renderMarkdown(), sanitizeHtml(), toNumber()

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (5): toJson(), toolOutput(), toToolSet(), options(), tool()

### Community 9 - "Community 9"
Cohesion: 0.21
Nodes (9): sseFrame(), assertIdent(), createVectorStore(), pad(), stringify(), tableDDL(), validateSpec(), vectorMigrationSQL() (+1 more)

### Community 10 - "Community 10"
Cohesion: 0.19
Nodes (2): CircuitBreaker, get()

### Community 11 - "Community 11"
Cohesion: 0.23
Nodes (9): coreAdminCollections(), aiModelsCollection(), aiRoutesCollection(), micros(), aiProvidersCollection(), aiAuditCollection(), aiUsageCollection(), aiUsageDailyCollection() (+1 more)

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (4): usdToMicros(), buildProvider(), openRouterCost(), createSdkProvider()

### Community 13 - "Community 13"
Cohesion: 0.28
Nodes (6): AIError, allowsFallback(), countsForBreaker(), fromStatus(), isAIError(), mapProviderError()

### Community 14 - "Community 14"
Cohesion: 0.36
Nodes (5): baseLang(), isUsable(), preferLocale(), resolveRouteConfig(), same()

### Community 15 - "Community 15"
Cohesion: 0.48
Nodes (5): createSettingsLoader(), isNum(), mergeSettings(), pickNum(), strings()

### Community 16 - "Community 16"
Cohesion: 0.43
Nodes (4): bestMatch(), defaultModelInfo(), inferCapabilities(), lookupCatalog()

### Community 18 - "Community 18"
Cohesion: 0.5
Nodes (2): chunkText(), splitLong()

### Community 19 - "Community 19"
Cohesion: 0.67
Nodes (2): para(), sections()

## Knowledge Gaps
- **Thin community `Community 10`** (13 nodes): `CircuitBreaker`, `.allow()`, `.constructor()`, `.failure()`, `.reset()`, `.state()`, `.success()`, `cmp()`, `get()`, `matchesWhere()`, `norm()`, `circuit.ts`, `fakePayload.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (5 nodes): `chunkText()`, `hashContent()`, `splitLong()`, `tail()`, `chunker.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (4 nodes): `makeAdapter()`, `para()`, `sections()`, `chunker.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createCoreServices()` connect `Community 0` to `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 9`, `Community 15`?**
  _High betweenness centrality (0.226) - this node is a cross-community bridge._
- **Why does `stringify()` connect `Community 9` to `Community 1`, `Community 2`, `Community 6`, `Community 7`, `Community 8`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Why does `get()` connect `Community 10` to `Community 0`, `Community 1`, `Community 2`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Are the 17 inferred relationships involving `createCoreServices()` (e.g. with `initCore()` and `createCrypto()`) actually correct?**
  _`createCoreServices()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `stringify()` (e.g. with `redactWithFields()` and `toJson()`) actually correct?**
  _`stringify()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `rolesOf()` (e.g. with `ownCustomerMemory()` and `roles()`) actually correct?**
  _`rolesOf()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `setup()` (e.g. with `createFakeServices()` and `createToolRegistry()`) actually correct?**
  _`setup()` has 6 INFERRED edges - model-reasoned connections that need verification._