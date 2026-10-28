# @payload-ai-suite/ai-media — Media AI

Alt text and tags on upload, background removal, variations, lifestyle shots and image-to-listing (design §10.7).
Generated images are always saved as **new** media docs labelled AI-generated; originals are never replaced.

```ts
import { aiMedia } from '@payload-ai-suite/ai-media'

plugins: [
  aiCore({ /* … */ }),
  aiMedia({ collections: ['media'], locales: ['en', 'bn'], overwriteAlt: false }),
]
```

## Options (`AiMediaOptions`)

| option | default | meaning |
| --- | --- | --- |
| `collections` | `['media']` if it exists and is an upload collection | Upload collections to enhance. A wrong explicit slug throws at startup. |
| `describeOnUpload` | `true` | afterChange hook queues `ai-media-describe` for new image files. |
| `overwriteAlt` | `false` | Only empty alt text is filled unless true. |
| `altField` / `tagsField` | `'alt'` / `'aiTags'` | `tagsField: false` disables tags. The tags field is added when missing. |
| `locales` | default locale | Locales to write alt text for when the alt field is localized (Bangla wording supported). |
| `describeTask` | `'fast'` | Task class (`fast` or `chat`) for the vision call. |
| `queue`, `maxImageBytes`, `resolveImage` | — | Job queue; inline file size cap (10 MB); custom image reader (e.g. private S3). |

Fields added to managed collections (sidebar, read-only, locked after create): `aiGenerated`, `aiSource`
(relationship to the original), `aiModel`, `aiOperation` (hidden), plus the tags field.

## Endpoints — `POST /api/ai/media/:op` (roles `content`, store-admin, super-admin)

Body `{ id, collection?, locale?, instructions?, scene?, n? (1-4), size?, apply? }`.

- `alt-text`, `tag` — suggestion (vision); `apply: true` writes it with the caller's access.
- `remove-background`, `variation`, `lifestyle` — `services.ai.generateImage` with the source image; returns `{ created: [{ id, url }] }`.
- `image-to-listing` — vision → `{ draft: { title, description, attributes, tags, categoryIds }, fieldValues }` for a review form; nothing is saved. Categories are validated against the category adapter.

Docs with `aiExclude: true` are refused/skipped; doc fields go through `guardrails.redact` before reaching a prompt.
Budget stops return a clear `budget_exceeded` message; the job stops quietly instead of retrying.

## Recursion guard

Every write made by this module passes `context: { aiMediaSkip: true }` (`SKIP_CONTEXT_KEY`); the hook ignores those
writes, AI-generated images and non-image files. Queue failures are logged and never fail the upload.
