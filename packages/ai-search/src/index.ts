export { aiSearch, searchModuleDefinition } from './plugin'
export type { AiSearchOptions, ResolvedSearchOptions } from './options'
export { resolveOptions } from './options'
export { searchOffers, getSearchEngine, createSearchEngine, SearchEngine } from './engine'
export type { SearchInput, SearchResult } from './engine'
export { getRecommendations, computeCooccurrence, recsCacheControl } from './recs'
export type { RecsInput, RecItem, RecsKind } from './recs'
export { OFFERINGS_TABLE, offeringsMigrationSQL, rowToSummary } from './vectorTable'
export { indexOfferings, reindexAll } from './indexing'
export { runLearningReport, analyzeEvents } from './learning'
export { searchOfferingsTool, recommendOfferingsTool, compact as compactOffering } from './tools'
export type { CompactOffering } from './tools'
export {
  parsePricePhrase,
  validateParsedFilters,
  validateExplicitFilters,
  toMinor,
  toMajor,
  type SearchFilters,
  type ExplicitFilters,
} from './filters'
export { reciprocalRankFusion, applyBusinessRules, expandWithSynonyms, buildSynonymMap } from './ranking'
export { SLUGS, TASKS, TOOL_NAMES, OFFERINGS_TABLE_NAME } from './constants'
