/** Bumped by ai-providers / ai-models / ai-routes afterChange hooks so clients reload on next call. */
let version = 0
export const invalidateRouting = (): void => {
  version++
}
export const routingVersion = (): number => version
