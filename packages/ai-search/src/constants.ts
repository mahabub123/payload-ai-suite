export const MODULE = 'search'

export const OFFERINGS_TABLE_NAME = 'ai_offerings'

export const SLUGS = {
  events: 'ai-search-events',
  recs: 'ai-recs',
  reports: 'ai-search-reports',
} as const

export const TASKS = {
  index: 'ai-search-index-offering',
  reindex: 'ai-search-reindex',
  cooccurrence: 'ai-search-recs-cooccurrence',
  learning: 'ai-search-learning-report',
} as const

export const PROMPTS = {
  parseFilters: 'search-parse-filters',
  learningSuggest: 'search-learning-suggest',
} as const

export const TOOL_NAMES = {
  search: 'searchOfferings',
  recommend: 'recommendOfferings',
} as const
