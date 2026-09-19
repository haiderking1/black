import { transform } from 'sucrase'

/**
 * Erase TypeScript type syntax from a compute plan.
 *
 * The worker is node:vm, so it only runs JavaScript. Models copy `as` and
 * annotations from the declaration dump; those must not fail compile.
 * Types are not checked. Provider schemas still validate at the bridge.
 */
export function stripPlanTypes(code: string): string {
  return transform(code, {
    transforms: ['typescript'],
    disableESTransforms: true,
    keepUnusedImports: true,
    filePath: 'compute-plan.ts',
  }).code
}
