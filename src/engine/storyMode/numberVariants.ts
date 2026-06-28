// Story Mode multi-step number-variation engine (BARREL).
//
// This module was split into focused submodules under `./numberVariants/` so each concern can be
// edited in isolation (an audit flagged that it mixed two roles):
//   - `./numberVariants/linearParser`     the PURE linear-equation parser shared by both roles.
//   - `./numberVariants/textScanners`     the LIVE `*InText` scanners used by `themedCoherence.ts`.
//   - `./numberVariants/variantGenerators` the LEGACY `randomize*` variant generators reachable only
//                                          via the legacy branch of `src/story/rehydrateQuestion.ts`.
//
// This file now just re-exports the SAME public API the monolithic module exported, so every existing
// import from `./numberVariants` keeps working unchanged and the public surface is byte-identical.
//
// (See `randomizeQuestionNumbers.ts` for `Rng`, `mulberry32`, `createVariantSeed`, and the one-step
// `randomizeQuestionNumbers` engine this module builds on.)

export { coordinateWalkInText, linearSolutionsInText } from './numberVariants/textScanners'
export {
  randomizeCoordinateWalkInput,
  randomizeMultiStepInput,
  randomizeOperationChoiceVariant,
  randomizeSequenceVariant,
} from './numberVariants/variantGenerators'
