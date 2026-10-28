import type { Payload, SanitizedConfig } from 'payload'
import { convertMarkdownToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import { getRichTextField } from './fields'

type EditorConfig = Parameters<typeof convertMarkdownToLexical>[0]['editorConfig']

/** Editor config of a rich text field (its own features), falling back to the default editor. */
export const editorConfigFor = async (payload: Payload, collection: string, path: string): Promise<EditorConfig> => {
  const field = getRichTextField(payload, collection, path)
  const editor = field?.editor as { editorConfig?: EditorConfig } | undefined
  if (field && editor?.editorConfig) return editorConfigFactory.fromField({ field: field as never })
  return editorConfigFactory.default({ config: payload.config as SanitizedConfig })
}

/** Model output is Markdown; rich text fields store Lexical JSON built with the field's own editor config. */
export const markdownToLexical = async (
  payload: Payload,
  collection: string,
  path: string,
  markdown: string,
): Promise<Record<string, unknown>> => {
  const editorConfig = await editorConfigFor(payload, collection, path)
  return convertMarkdownToLexical({ editorConfig, markdown }) as unknown as Record<string, unknown>
}
