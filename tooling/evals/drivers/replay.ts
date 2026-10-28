/** Scores previously recorded outputs (from `--record`), e.g. the nightly real-model run, offline. */
import { readFile } from 'node:fs/promises'
import type { AssistantOutput, ContentOutput, Driver, SearchOutput } from '../lib/types'

export interface Recording {
  route: string
  recordedAt: string
  assistant: Record<string, AssistantOutput>
  search: Record<string, SearchOutput>
  content: Record<string, ContentOutput>
}

export const createReplayDriver = async (file: string): Promise<Driver & { recording: Recording }> => {
  const recording = JSON.parse(await readFile(file, 'utf8')) as Recording
  const miss = { error: 'not recorded' }
  return {
    name: `replay:${recording.route}`,
    recording,
    assistant: async (c) => recording.assistant[c.id] ?? { text: '', tools: [], cards: [], ...miss },
    search: async (c) => recording.search[c.id] ?? { slugs: [], ...miss },
    content: async (c) => recording.content[c.id] ?? { text: '', ...miss },
  }
}
