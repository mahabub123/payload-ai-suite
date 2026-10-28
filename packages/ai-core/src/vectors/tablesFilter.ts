/** Plugin-owned raw-SQL tables (pgvector). Payload's schema push must not touch them. */
export const AI_VECTOR_TABLES = ['ai_knowledge', 'ai_offerings'] as const

/**
 * Pass to `postgresAdapter({ tablesFilter: aiSuiteTablesFilter() })`.
 * Without it, Payload's dev push sees the vector tables as unknown, tries to drop them, and
 * drizzle-kit's push introspection fails (it drops query params: "there is no parameter $1").
 */
export const aiSuiteTablesFilter = (extra: string[] = []): string[] =>
  [...AI_VECTOR_TABLES, ...extra].map((t) => `!${t}`)
