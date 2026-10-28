import type { AITool } from '../contracts'

/** Identity helper that keeps input/output types inferred. */
export const defineTool = <I, O>(tool: AITool<I, O>): AITool<I, O> => tool
