// Story Mode content/runtime types.
//
// Kept here (next to the content model in `./types`) so content-model types stay
// independent of runtime/back-end code, matching the split noted at the top of
// `src/content/types.ts`. The runtime/persistence shapes (`StorySession` and
// friends) are re-exported through `src/domain.ts` alongside the other
// persistence types so the app and backends import them from one place.

import type { LessonId, LessonStep } from './types'

// A small fixed catalog the learner chooses from on the interest screen, plus a free-text "other".
export type StoryInterestId =
  | 'space'
  | 'fantasy'
  | 'mystery'
  | 'sports'
  | 'animals'
  | 'pirates'
  | 'cooking'
  | 'fashion'

export type StoryInterest = {
  id: StoryInterestId
  label: string // e.g. "Sci-fi"
  emoji?: string // optional, for the selection card
}

// A fixed catalog of pre-generated background images the LLM may match a story beat to. The
// ids are kebab-case and match the asset filenames under `public/scenery/<id>.png`. Kept here
// (a pure content type, like StoryInterestId) so the persistence/runtime layers can type the
// chosen scene without importing the React-free CATALOG (descriptions + path helpers live in
// `src/story/scenery.ts`, mirroring the StoryInterestId / INTEREST_CATALOG split).
export type SceneId =
  | 'abandoned-factory'
  | 'airport-runway'
  | 'alien-desert'
  | 'alien-jungle'
  | 'alien-ocean'
  | 'alien-planet'
  | 'amusement-park'
  | 'ancient-ruins'
  | 'animals-cooking'
  | 'animals-cooking-fashion'
  | 'animals-fashion'
  | 'animals-pirates'
  | 'animals-pirates-cooking'
  | 'animals-pirates-fashion'
  | 'aquarium-tank'
  | 'aquarium-tunnel'
  | 'arcade'
  | 'art-gallery'
  | 'art-studio'
  | 'asteroid-field'
  | 'autumn-space-station'
  | 'autumn-woods'
  | 'bakery-shop'
  | 'bamboo-forest'
  | 'baseball-field'
  | 'basketball-court'
  | 'bowling-alley'
  | 'butterfly-garden'
  | 'cake-shop'
  | 'candy-castle'
  | 'candy-forest'
  | 'candy-shop'
  | 'canyon-gorge'
  | 'carnival-midway'
  | 'castle-hall'
  | 'circus-tent'
  | 'city-skyline'
  | 'classroom'
  | 'cloud-castle'
  | 'cloud-kingdom'
  | 'cloud-stadium'
  | 'construction-site'
  | 'cooking-class'
  | 'cooking-fashion'
  | 'coral-skyline'
  | 'costume-workshop'
  | 'couture-house'
  | 'cozy-kitchen'
  | 'crystal-cavern'
  | 'crystal-farm'
  | 'crystal-forest'
  | 'crystal-pool'
  | 'crystal-temple'
  | 'dark-cave'
  | 'desert-aquarium'
  | 'desert-dunes'
  | 'desert-oasis'
  | 'desert-train-station'
  | 'design-studio'
  | 'detective-office'
  | 'detective-study'
  | 'dino-lagoon'
  | 'dino-snow'
  | 'dino-volcano'
  | 'dinosaur-jungle'
  | 'dog-park'
  | 'donut-shop'
  | 'dragon-bakery'
  | 'dragon-harbor'
  | 'dragon-lair'
  | 'dragon-mountain'
  | 'dragon-stadium'
  | 'dragon-volcano'
  | 'dungeon-corridor'
  | 'egyptian-pyramids'
  | 'egyptian-space-station'
  | 'enchanted-bakery'
  | 'enchanted-forest'
  | 'fairy-castle'
  | 'fairy-glade'
  | 'fairy-greenhouse'
  | 'fairy-harbor'
  | 'fairy-tea-party'
  | 'fairy-train-station'
  | 'fantasy-animals'
  | 'fantasy-animals-cooking'
  | 'fantasy-animals-fashion'
  | 'fantasy-animals-pirates'
  | 'fantasy-cooking'
  | 'fantasy-cooking-fashion'
  | 'fantasy-fashion'
  | 'fantasy-mystery'
  | 'fantasy-mystery-animals'
  | 'fantasy-mystery-cooking'
  | 'fantasy-mystery-fashion'
  | 'fantasy-mystery-pirates'
  | 'fantasy-mystery-sports'
  | 'fantasy-pirates'
  | 'fantasy-pirates-cooking'
  | 'fantasy-pirates-fashion'
  | 'fantasy-sports'
  | 'fantasy-sports-animals'
  | 'fantasy-sports-cooking'
  | 'fantasy-sports-fashion'
  | 'fantasy-sports-pirates'
  | 'farm-barnyard'
  | 'farmers-market'
  | 'fashion-boutique'
  | 'fashion-photoshoot'
  | 'fashion-runway'
  | 'ferris-wheel'
  | 'fire-station'
  | 'floating-islands'
  | 'floating-market'
  | 'flower-meadow'
  | 'foggy-alley'
  | 'foggy-graveyard'
  | 'forest-clearing'
  | 'frozen-bazaar'
  | 'frozen-lake'
  | 'futuristic-city'
  | 'ghost-market'
  | 'greek-temple'
  | 'greek-underwater-temple'
  | 'harbor-docks'
  | 'hat-boutique'
  | 'haunted-aquarium'
  | 'haunted-bakery'
  | 'haunted-circus'
  | 'haunted-fairground'
  | 'haunted-forest'
  | 'haunted-lighthouse'
  | 'haunted-mansion'
  | 'horse-stable'
  | 'hot-air-balloons'
  | 'ice-cream-parlor'
  | 'ice-palace'
  | 'ice-rink'
  | 'icy-fjord'
  | 'jewelry-boutique'
  | 'jungle-aquarium'
  | 'jungle-skyscrapers'
  | 'jungle-temple'
  | 'jungle-waterfall'
  | 'knight-tournament'
  | 'lava-bakery'
  | 'lava-fortress'
  | 'library-hall'
  | 'lighthouse-coast'
  | 'lunar-base'
  | 'makeup-studio'
  | 'mansion-library'
  | 'market-bazaar'
  | 'medieval-aquarium'
  | 'medieval-arena'
  | 'medieval-town'
  | 'mermaid-lagoon'
  | 'moon-farm'
  | 'moon-surface'
  | 'mountain-cliff'
  | 'mountain-lake'
  | 'movie-theater'
  | 'museum-hall'
  | 'mushroom-metropolis'
  | 'mushroom-village'
  | 'music-stage'
  | 'mystery-animals'
  | 'mystery-animals-cooking'
  | 'mystery-animals-fashion'
  | 'mystery-animals-pirates'
  | 'mystery-cooking'
  | 'mystery-cooking-fashion'
  | 'mystery-fashion'
  | 'mystery-pirates'
  | 'mystery-pirates-cooking'
  | 'mystery-pirates-fashion'
  | 'mystery-sports'
  | 'mystery-sports-animals'
  | 'mystery-sports-cooking'
  | 'mystery-sports-fashion'
  | 'mystery-sports-pirates'
  | 'neon-bamboo-grove'
  | 'ninja-dojo'
  | 'ocean-shore'
  | 'outer-space'
  | 'pirate-asteroid-port'
  | 'pirate-captain-cabin'
  | 'pirate-cove'
  | 'pirate-fort'
  | 'pirate-island-market'
  | 'pirate-jungle-camp'
  | 'pirate-lagoon'
  | 'pirate-ship-deck'
  | 'pirate-shipwreck'
  | 'pirate-tavern'
  | 'pirate-treasure-cave'
  | 'pirate-volcano-cove'
  | 'pirates-cooking'
  | 'pirates-cooking-fashion'
  | 'pirates-fashion'
  | 'pizza-shop'
  | 'planetarium'
  | 'race-track'
  | 'rainbow-falls'
  | 'recording-studio'
  | 'restaurant-kitchen'
  | 'river-bank'
  | 'robot-city'
  | 'robot-farm'
  | 'robot-lab'
  | 'rolling-hills'
  | 'safari-animals'
  | 'samurai-castle'
  | 'savanna-plains'
  | 'savanna-spaceport'
  | 'science-lab'
  | 'sewing-studio'
  | 'shoe-boutique'
  | 'skate-park'
  | 'ski-slope'
  | 'sky-ruins'
  | 'snowy-harbor'
  | 'snowy-mountain'
  | 'snowy-temple'
  | 'soccer-field'
  | 'space-animals'
  | 'space-animals-cooking'
  | 'space-animals-fashion'
  | 'space-animals-pirates'
  | 'space-bazaar'
  | 'space-castle'
  | 'space-concert'
  | 'space-cooking'
  | 'space-cooking-fashion'
  | 'space-fantasy'
  | 'space-fantasy-animals'
  | 'space-fantasy-cooking'
  | 'space-fantasy-fashion'
  | 'space-fantasy-mystery'
  | 'space-fantasy-pirates'
  | 'space-fantasy-sports'
  | 'space-farm'
  | 'space-fashion'
  | 'space-kitchen'
  | 'space-mystery'
  | 'space-mystery-animals'
  | 'space-mystery-cooking'
  | 'space-mystery-fashion'
  | 'space-mystery-pirates'
  | 'space-mystery-sports'
  | 'space-pirates'
  | 'space-pirates-cooking'
  | 'space-pirates-fashion'
  | 'space-runway'
  | 'space-sports'
  | 'space-sports-animals'
  | 'space-sports-cooking'
  | 'space-sports-fashion'
  | 'space-sports-pirates'
  | 'space-station'
  | 'space-station-exterior'
  | 'space-zoo'
  | 'spaceship-bridge'
  | 'spaceship-corridor'
  | 'spooky-attic'
  | 'sports-animals'
  | 'sports-animals-cooking'
  | 'sports-animals-fashion'
  | 'sports-animals-pirates'
  | 'sports-cooking'
  | 'sports-cooking-fashion'
  | 'sports-fashion'
  | 'sports-pirates'
  | 'sports-pirates-cooking'
  | 'sports-pirates-fashion'
  | 'sports-stadium'
  | 'starry-campsite'
  | 'steampunk-city'
  | 'stormy-sea'
  | 'sushi-bar'
  | 'swamp-marsh'
  | 'swimming-pool'
  | 'tailor-shop'
  | 'tennis-court'
  | 'toy-store'
  | 'train-station'
  | 'train-yard'
  | 'treasure-island'
  | 'treehouse-village'
  | 'tropical-beach'
  | 'underwater-castle'
  | 'underwater-city'
  | 'underwater-farm'
  | 'underwater-reef'
  | 'underwater-stadium'
  | 'underwater-volcano'
  | 'unicorn-meadow'
  | 'viking-longship'
  | 'village-square'
  | 'volcano-crater'
  | 'volcano-spaceport'
  | 'waterfall-valley'
  | 'wild-west-town'
  | 'windmill-fields'
  | 'windmill-village'
  | 'witch-hut'
  | 'wizard-arena'
  | 'wizard-kitchen'
  | 'wizard-library'
  | 'wizard-observatory'
  | 'wizard-tower'
  | 'zero-gravity-arena'
  | 'zoo-entrance'

// A selectable custom-character option the UI offers, mirroring `StoryInterest`: a stable `id`
// the theme stores plus a human `label` for display and prompts. The catalogs live in
// `src/story/characterPresets.ts` (personalities + backstories), kept React-free so the UI, the
// prompt builders, and the persistence-layer normalizer share one source of truth.
export type CharacterPreset = {
  id: string
  label: string
}

// A supporting-cast member the learner adds (e.g. a friend or family member).
//
// Chosen approach (documented): personality/backstory are PRESET REFERENCES by id
// (`personalityId` -> CHARACTER_PERSONALITIES, `backstoryId` -> CHARACTER_BACKSTORIES), NOT
// freeform strings — the small id reference is easy to validate ("keep only known ids") and to
// render. Only `name` is user free text (capped/sanitized at the persistence layer). Both
// preset fields are optional so a character can be just a name.
export type CustomCharacter = {
  id: string // stable client-generated id (used to edit/remove the entry)
  name: string // user free text, sanitized + capped at MAX_CHARACTER_NAME_LEN
  personalityId?: string // optional CHARACTER_PERSONALITIES id
  backstoryId?: string // optional CHARACTER_BACKSTORIES id
}

// Where the story's MAIN character (the protagonist) comes from:
// - 'displayName': the signed-in user's display name (the controller resolves it from the auth
//    user at begin time, so `mainCharacterName` may be empty until then)
// - 'random': let the LLM invent a fictional protagonist (the legacy/default behavior)
// - 'custom': a user-typed name carried in `mainCharacterName`
export type MainCharacterSource = 'displayName' | 'random' | 'custom'

export type StoryTheme = {
  interestIds: StoryInterestId[] // 1..3 chosen interests
  freeformInterest?: string // optional sanitized free text (<= 80 chars)
  // Derived once at session start so every prompt is consistent and cheap:
  premise: string // 1-2 sentence world premise produced by the LLM at session start
  protagonist: string // short name/role the LLM chose, reused across segments
  // --- Custom-character additions (all OPTIONAL + back-compatible) ---
  // Supporting cast (friends/family) woven into the story. Capped at MAX_CUSTOM_CHARACTERS by
  // normalization; absent means "no custom cast".
  characters?: CustomCharacter[]
  // How the protagonist is chosen. Absent is treated as the default 'random'; the controller
  // may override `protagonist` from this choice at session start.
  mainCharacterSource?: MainCharacterSource
  // The main character's name when source is 'displayName' or 'custom'. For 'displayName' the
  // controller fills this from the authenticated user at begin time, so it may be empty here.
  mainCharacterName?: string
}

export type StorySegment = {
  index: number // 0-based segment order
  text: string // 1-2 paragraph narrative the LLM produced
  userChoice?: string // what the learner typed at the checkpoint that FOLLOWED this segment
  // OPTIONAL/back-compatible: a pre-generated background image the LLM matched to THIS beat's
  // setting (a `SceneId` from the scenery catalog), or absent when nothing fit / matching was
  // unavailable. Persisted so resume re-shows the same image without re-asking the model.
  sceneId?: SceneId
  createdAt: string
}

// The result of re-theming one bundled LessonStep. We persist the *source identity* plus the
// rethemed *display text*, never a second copy of the answer key.
export type ThemedQuestion = {
  sourceLessonId: LessonId
  sourceStepId: string // original step.id in the bundled lesson
  stepType: LessonStep['type'] // 'input' | 'mcq' | 'operation-choice' | 'sequence'
  // Rethemed display text, keyed so applyRetheme can map it back onto a clone of the source step.
  themedPrompt: string
  themedOptions?: { id: string; label: string }[] // mcq/operation-choice: same ids as source
  themedTiles?: { id: string; label: string }[] // sequence: same ids as source
  // Whether the LLM call succeeded; false means we are showing the original (fallback) text.
  themed: boolean
  // Seed for the deterministic NUMBER variant applied to the bundled step before re-theming
  // (see engine `randomizeQuestionNumbers`). Persisted so resume rebuilds the EXACT same
  // randomized question — the answer key is always recomputed by code, never stored, so a bad
  // seed can at worst produce a different correct variant or fall back, never a wrong key.
  // OPTIONAL/back-compatible: absent means the bundled numbers were shown verbatim (legacy).
  variantSeed?: number
  // --- Question-architecture additions (OPTIONAL + back-compatible) ---
  // The id of the code-authoritative architecture that produced this question (its persisted
  // identity + anti-repeat key). Present on all NEW (question-bank) questions; absent on legacy
  // lesson-reuse questions. Architecture questions also set `sourceLessonId = requiredLessonId`
  // and `sourceStepId = "arch:<id>"`, so the existing source-identity fields stay populated.
  architectureId?: string
  // uint32 seed that deterministically rebuilds the EXACT filled architecture instance (and its
  // code-computed answer key) on resume, mirroring `variantSeed`. Absent on legacy questions.
  paramSeed?: number
  generatedAt: string
}

export type StorySessionStatus = 'active' | 'ended'

export type StorySession = {
  // Stable unique id. A user keeps MANY saved stories (a library) plus an "active session"
  // pointer, so every session must be addressable on its own (added in schema v2). Legacy
  // single-session data is migrated to an `id` on read (see backend/validation.ts).
  id: string
  userId: string
  theme: StoryTheme
  status: StorySessionStatus

  // Progress toward the next checkpoint and lifetime totals.
  questionsSolvedTotal: number
  questionsSinceCheckpoint: number // resets to 0 at each checkpoint (fires at CHECKPOINT_INTERVAL)

  // The LIVE question at the front edge of the story — the one whose correct answer advances
  // the loop. Persisted so a refresh/resume returns to the same themed question.
  currentQuestion?: ThemedQuestion

  // Ordered history of every themed question served, oldest first. Enough to RE-RENDER each one
  // for back/forward review (source identity + themed display text, mirroring how resume
  // rehydrates via `applyRetheme`). The LAST entry mirrors `currentQuestion` at the live edge.
  history: ThemedQuestion[]
  // Index into `history` of the question currently displayed. At the live edge it equals
  // `history.length - 1`; a smaller value means the learner is REVIEWING a past question
  // (read-only — reviewing never advances counters or fires checkpoints).
  historyIndex: number

  // Anti-repeat memory: source step ids served, most-recent last (capped, see plan section 4).
  servedStepIds: string[] // values are `${lessonId}:${stepId}`

  // Narrative.
  segments: StorySegment[]
  // Rolling summary of older segments for context-window management (plan section 8).
  narrativeSummary: string

  createdAt: string
  updatedAt: string
  // Schema version so future migrations are safe (mirrors STORAGE_KEY versioning). v2 adds the
  // session `id` (library) and the question `history`/`historyIndex` (back/forward review).
  schemaVersion: 2
}
