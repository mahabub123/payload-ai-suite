# Graph Report - payload ai  (2026-10-30)

## Corpus Check
- 454 files · ~486,758 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1661 nodes · 2833 edges · 40 communities detected
- Extraction: 62% EXTRACTED · 38% INFERRED · 0% AMBIGUOUS · INFERRED: 1071 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]

## God Nodes (most connected - your core abstractions)
1. `join()` - 82 edges
2. `find()` - 77 edges
3. `get()` - 64 edges
4. `stringify()` - 37 edges
5. `update()` - 36 edges
6. `create()` - 30 edges
7. `createFakePayload()` - 24 edges
8. `sendCampaignStep()` - 22 edges
9. `systemContext()` - 20 edges
10. `SearchEngine` - 20 edges

## Surprising Connections (you probably didn't know these)
- `golden()` --calls--> `join()`  [INFERRED]
  tooling/evals/run.ts → packages/ai-content/src/fields.ts
- `runSuites()` --calls--> `mean()`  [INFERRED]
  tooling/evals/run.ts → packages/ai-insights/src/anomaly.ts
- `main()` --calls--> `text()`  [INFERRED]
  tooling/redteam/run.ts → packages/ai-channels/src/endpoints.ts
- `main()` --calls--> `match()`  [INFERRED]
  tooling/redteam/run.ts → packages/ai-core/src/usage/fake-payload.ts
- `docText()` --calls--> `find()`  [INFERRED]
  tooling/evals/drivers/mock.ts → packages/ai-adapters/src/local.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (79): rewrite(), withExtension(), judge(), hoursFromRows(), SYSTEM(), para(), sections(), waBody() (+71 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (59): rows(), L(), CircuitBreaker, cronDueBetween(), cronMatches(), parseCron(), parseField(), doc() (+51 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (80): applyBulkReview(), createBulkRun(), existingPairs(), getBulkReview(), idOf(), loadRun(), mapLimit(), pendingForRun() (+72 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (66): budgetMessage(), defaultLocale(), describeMedia(), generateDescription(), proposeSegment(), AIError, allowsFallback(), countsForBreaker() (+58 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (53): coreOptions(), errMessage(), local(), sessionHash(), tenantData(), tenantField(), tenantWhere(), SearchEngine (+45 more)

### Community 5 - "Community 5"
Cohesion: 0.03
Nodes (46): propose(), setup(), setup(), checkAccess(), auditChange(), hookCrypto(), assignVersion(), compactResult() (+38 more)

### Community 6 - "Community 6"
Cohesion: 0.04
Nodes (56): extract(), fill(), guess(), adminBase(), apiBase(), ApiRequestError, callApi(), errorMessage() (+48 more)

### Community 7 - "Community 7"
Cohesion: 0.04
Nodes (46): names(), setup(), textOf(), conv(), setup(), text(), seed(), make() (+38 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (64): dbOf(), findMessage(), getIdentity(), getMessage(), isUniqueViolation(), updateIdentity(), updateMessage(), normalizeSubject() (+56 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (54): approvalProblems(), approveCampaign(), approveEndpoint(), pauseEndpoint(), revokeApprovalOnEdit(), compare(), evaluateSegment(), matchCondition() (+46 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (46): anomalyLine(), chartValue(), dailySeries(), evaluateSeries(), fmt(), minSpreadFor(), runAnomalies(), detectAnomaly() (+38 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (29): createAIModulePlugin(), getSuiteState(), assistantEndpoints(), createWebhookEndpoints(), storedMessages(), getSearchEngine(), optionsFromConfig(), searchOffers() (+21 more)

### Community 12 - "Community 12"
Cohesion: 0.06
Nodes (25): labelOf(), money(), reader(), readOpts(), defineTool(), lineItems(), attrValue(), buildCopilotTools() (+17 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (26): onKeyDown(), submit(), pageFromLocation(), patchLast(), send(), match(), isInStock(), productBySlug() (+18 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (12): bulkTask(), describeTask(), buildEndpoints(), aiContent(), aiMedia(), contentModule(), mediaModule(), apply() (+4 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (21): createAdapters(), formatValidation(), asCands(), detectCurrency(), isObj(), list(), makeEnv(), mergeOne() (+13 more)

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (15): setup(), build(), createEmailDriver(), extractAddress(), extractName(), parseLinkEmail(), parseMessageIds(), stripQuotedReply() (+7 more)

### Community 17 - "Community 17"
Cohesion: 0.11
Nodes (16): aiSuite(), buildSuitePlugins(), moduleOptions(), baseConfig(), fails(), run(), toCoreOptions(), aiTicketsCollection() (+8 more)

### Community 18 - "Community 18"
Cohesion: 0.13
Nodes (16): findOwnOrder(), norm(), resolveOrderAccess(), verifiedCustomerCtx(), systemAdapterCtx(), beginTurn(), findVerifiedIdentity(), hasOrderIdentity() (+8 more)

### Community 19 - "Community 19"
Cohesion: 0.17
Nodes (19): adminFieldOnly(), adminOnly(), anyone(), hasAnyRole(), isAdminUser(), isStaffUser(), publishedOrStaff(), roles() (+11 more)

### Community 20 - "Community 20"
Cohesion: 0.09
Nodes (5): createAIClient(), createProviderRegistry(), chat(), setup(), invalidateRouting()

### Community 21 - "Community 21"
Cohesion: 0.12
Nodes (12): composeStep(), hasCollection(), pickProducts(), recItemIds(), applyRedaction(), excludedPaths(), extractClaims(), redactWithFields() (+4 more)

### Community 22 - "Community 22"
Cohesion: 0.12
Nodes (9): createKnowledgeService(), indexLocales(), existingHashes(), indexOfferings(), inLocale(), offeringHash(), offeringRowIds(), reindexAll() (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.12
Nodes (9): AISuiteRequestError, randomId(), useAISuite(), RecommendationsBlock(), useAssistantChat(), useRecommendations(), useSearch(), sessionId() (+1 more)

### Community 24 - "Community 24"
Cohesion: 0.18
Nodes (9): renderPrompt(), verifyAnswer(), checkNumbers(), collectEvidence(), extractNumbers(), isSupported(), normalizeDigits(), stripNumbers() (+1 more)

### Community 25 - "Community 25"
Cohesion: 0.12
Nodes (5): trigger(), invalidateAutomationCache(), hook(), automationAfterChange(), runHook()

### Community 26 - "Community 26"
Cohesion: 0.23
Nodes (9): coreAdminCollections(), aiModelsCollection(), aiRoutesCollection(), micros(), aiProvidersCollection(), aiAuditCollection(), aiUsageCollection(), aiUsageDailyCollection() (+1 more)

### Community 27 - "Community 27"
Cohesion: 0.18
Nodes (4): usdToMicros(), buildProvider(), openRouterCost(), createSdkProvider()

### Community 28 - "Community 28"
Cohesion: 0.39
Nodes (5): bestMatch(), defaultModelInfo(), inferCapabilities(), lookupCatalog(), norm()

### Community 29 - "Community 29"
Cohesion: 0.36
Nodes (5): baseLang(), isUsable(), preferLocale(), resolveRouteConfig(), same()

### Community 30 - "Community 30"
Cohesion: 0.4
Nodes (3): generateMetadata(), NotFound(), ProductPage()

### Community 32 - "Community 32"
Cohesion: 0.5
Nodes (3): chunkText(), hashContent(), splitLong()

### Community 34 - "Community 34"
Cohesion: 0.83
Nodes (2): env(), providersFromEnv()

### Community 35 - "Community 35"
Cohesion: 0.67
Nodes (2): down(), up()

### Community 36 - "Community 36"
Cohesion: 0.67
Nodes (2): generateMetadata(), Page()

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (2): getTurnstileToken(), load()

### Community 45 - "Community 45"
Cohesion: 0.67
Nodes (1): ChannelSendError

### Community 48 - "Community 48"
Cohesion: 0.67
Nodes (1): FrontendLayout()

### Community 49 - "Community 49"
Cohesion: 0.67
Nodes (1): Layout()

### Community 50 - "Community 50"
Cohesion: 0.67
Nodes (1): SuiteShell()

## Knowledge Gaps
- **Thin community `Community 34`** (4 nodes): `providers.ts`, `providers.ts`, `env()`, `providersFromEnv()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (4 nodes): `down()`, `up()`, `20261027_215307_ai_suite_vectors.ts`, `20261027_215307_ai_suite_vectors.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (4 nodes): `page.tsx`, `page.tsx`, `generateMetadata()`, `Page()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (3 nodes): `turnstile.ts`, `getTurnstileToken()`, `load()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (3 nodes): `types.ts`, `ChannelSendError`, `.constructor()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (3 nodes): `layout.tsx`, `layout.tsx`, `FrontendLayout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (3 nodes): `layout.tsx`, `layout.tsx`, `Layout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (3 nodes): `SuiteShell.tsx`, `SuiteShell.tsx`, `SuiteShell()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `join()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 10`, `Community 12`, `Community 13`, `Community 15`, `Community 16`, `Community 17`, `Community 21`, `Community 24`?**
  _High betweenness centrality (0.195) - this node is a cross-community bridge._
- **Why does `find()` connect `Community 2` to `Community 0`, `Community 1`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 10`, `Community 11`, `Community 12`, `Community 13`, `Community 15`, `Community 18`, `Community 21`, `Community 24`?**
  _High betweenness centrality (0.148) - this node is a cross-community bridge._
- **Why does `get()` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 10`, `Community 11`, `Community 18`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Are the 78 inferred relationships involving `join()` (e.g. with `golden()` and `main()`) actually correct?**
  _`join()` has 78 INFERRED edges - model-reasoned connections that need verification._
- **Are the 70 inferred relationships involving `find()` (e.g. with `docText()` and `mockAssistant()`) actually correct?**
  _`find()` has 70 INFERRED edges - model-reasoned connections that need verification._
- **Are the 57 inferred relationships involving `get()` (e.g. with `tokenFrom()` and `refreshBlocks()`) actually correct?**
  _`get()` has 57 INFERRED edges - model-reasoned connections that need verification._
- **Are the 36 inferred relationships involving `stringify()` (e.g. with `main()` and `haystack()`) actually correct?**
  _`stringify()` has 36 INFERRED edges - model-reasoned connections that need verification._