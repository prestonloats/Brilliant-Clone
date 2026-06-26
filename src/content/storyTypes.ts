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
// ids are kebab-case and match the asset filenames under `public/scenery/<id>.webp`. Kept here
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
  | 'animals-cooking-2'
  | 'animals-cooking-3'
  | 'animals-cooking-fashion'
  | 'animals-cooking-fashion-2'
  | 'animals-fashion'
  | 'animals-fashion-2'
  | 'animals-fashion-3'
  | 'animals-fashion-4'
  | 'animals-pirates'
  | 'animals-pirates-2'
  | 'animals-pirates-3'
  | 'animals-pirates-4'
  | 'animals-pirates-cooking'
  | 'animals-pirates-cooking-2'
  | 'animals-pirates-fashion'
  | 'animals-pirates-fashion-2'
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
  | 'cooking-fashion-2'
  | 'cooking-fashion-3'
  | 'cooking-fashion-4'
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
  | 'fantasy-animals-cooking-2'
  | 'fantasy-animals-fashion'
  | 'fantasy-animals-fashion-2'
  | 'fantasy-animals-pirates'
  | 'fantasy-animals-pirates-2'
  | 'fantasy-cooking'
  | 'fantasy-cooking-fashion'
  | 'fantasy-cooking-fashion-2'
  | 'fantasy-fashion'
  | 'fantasy-fashion-2'
  | 'fantasy-fashion-3'
  | 'fantasy-fashion-4'
  | 'fantasy-mystery'
  | 'fantasy-mystery-2'
  | 'fantasy-mystery-3'
  | 'fantasy-mystery-animals'
  | 'fantasy-mystery-animals-2'
  | 'fantasy-mystery-cooking'
  | 'fantasy-mystery-cooking-2'
  | 'fantasy-mystery-fashion'
  | 'fantasy-mystery-fashion-2'
  | 'fantasy-mystery-pirates'
  | 'fantasy-mystery-pirates-2'
  | 'fantasy-mystery-sports'
  | 'fantasy-mystery-sports-2'
  | 'fantasy-pirates'
  | 'fantasy-pirates-2'
  | 'fantasy-pirates-3'
  | 'fantasy-pirates-cooking'
  | 'fantasy-pirates-cooking-2'
  | 'fantasy-pirates-fashion'
  | 'fantasy-pirates-fashion-2'
  | 'fantasy-sports'
  | 'fantasy-sports-animals'
  | 'fantasy-sports-animals-2'
  | 'fantasy-sports-cooking'
  | 'fantasy-sports-cooking-2'
  | 'fantasy-sports-fashion'
  | 'fantasy-sports-fashion-2'
  | 'fantasy-sports-pirates'
  | 'fantasy-sports-pirates-2'
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
  | 'mystery-animals-2'
  | 'mystery-animals-3'
  | 'mystery-animals-cooking'
  | 'mystery-animals-cooking-2'
  | 'mystery-animals-fashion'
  | 'mystery-animals-fashion-2'
  | 'mystery-animals-pirates'
  | 'mystery-animals-pirates-2'
  | 'mystery-cooking'
  | 'mystery-cooking-2'
  | 'mystery-cooking-3'
  | 'mystery-cooking-fashion'
  | 'mystery-cooking-fashion-2'
  | 'mystery-fashion'
  | 'mystery-fashion-2'
  | 'mystery-fashion-3'
  | 'mystery-fashion-4'
  | 'mystery-pirates'
  | 'mystery-pirates-2'
  | 'mystery-pirates-3'
  | 'mystery-pirates-4'
  | 'mystery-pirates-cooking'
  | 'mystery-pirates-cooking-2'
  | 'mystery-pirates-fashion'
  | 'mystery-pirates-fashion-2'
  | 'mystery-sports'
  | 'mystery-sports-2'
  | 'mystery-sports-3'
  | 'mystery-sports-4'
  | 'mystery-sports-animals'
  | 'mystery-sports-animals-2'
  | 'mystery-sports-cooking'
  | 'mystery-sports-cooking-2'
  | 'mystery-sports-fashion'
  | 'mystery-sports-fashion-2'
  | 'mystery-sports-pirates'
  | 'mystery-sports-pirates-2'
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
  | 'pirates-cooking-2'
  | 'pirates-cooking-3'
  | 'pirates-cooking-4'
  | 'pirates-cooking-fashion'
  | 'pirates-cooking-fashion-2'
  | 'pirates-fashion'
  | 'pirates-fashion-2'
  | 'pirates-fashion-3'
  | 'pirates-fashion-4'
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
  | 'space-animals-cooking-2'
  | 'space-animals-fashion'
  | 'space-animals-fashion-2'
  | 'space-animals-pirates'
  | 'space-animals-pirates-2'
  | 'space-bazaar'
  | 'space-castle'
  | 'space-concert'
  | 'space-cooking'
  | 'space-cooking-2'
  | 'space-cooking-3'
  | 'space-cooking-fashion'
  | 'space-cooking-fashion-2'
  | 'space-fantasy'
  | 'space-fantasy-animals'
  | 'space-fantasy-cooking'
  | 'space-fantasy-cooking-2'
  | 'space-fantasy-fashion'
  | 'space-fantasy-fashion-2'
  | 'space-fantasy-mystery'
  | 'space-fantasy-mystery-2'
  | 'space-fantasy-pirates'
  | 'space-fantasy-sports'
  | 'space-fantasy-sports-2'
  | 'space-farm'
  | 'space-fashion'
  | 'space-fashion-2'
  | 'space-fashion-3'
  | 'space-kitchen'
  | 'space-mystery'
  | 'space-mystery-2'
  | 'space-mystery-animals'
  | 'space-mystery-animals-2'
  | 'space-mystery-cooking'
  | 'space-mystery-cooking-2'
  | 'space-mystery-fashion'
  | 'space-mystery-fashion-2'
  | 'space-mystery-pirates'
  | 'space-mystery-pirates-2'
  | 'space-mystery-sports'
  | 'space-mystery-sports-2'
  | 'space-pirates'
  | 'space-pirates-2'
  | 'space-pirates-3'
  | 'space-pirates-4'
  | 'space-pirates-cooking'
  | 'space-pirates-cooking-2'
  | 'space-pirates-fashion'
  | 'space-pirates-fashion-2'
  | 'space-runway'
  | 'space-sports'
  | 'space-sports-2'
  | 'space-sports-3'
  | 'space-sports-animals'
  | 'space-sports-animals-2'
  | 'space-sports-cooking'
  | 'space-sports-cooking-2'
  | 'space-sports-fashion'
  | 'space-sports-fashion-2'
  | 'space-sports-pirates'
  | 'space-sports-pirates-2'
  | 'space-station'
  | 'space-station-exterior'
  | 'space-zoo'
  | 'spaceship-bridge'
  | 'spaceship-corridor'
  | 'spooky-attic'
  | 'sports-animals'
  | 'sports-animals-2'
  | 'sports-animals-3'
  | 'sports-animals-cooking'
  | 'sports-animals-cooking-2'
  | 'sports-animals-fashion'
  | 'sports-animals-fashion-2'
  | 'sports-animals-pirates'
  | 'sports-animals-pirates-2'
  | 'sports-cooking'
  | 'sports-cooking-2'
  | 'sports-cooking-3'
  | 'sports-cooking-fashion'
  | 'sports-cooking-fashion-2'
  | 'sports-fashion'
  | 'sports-fashion-2'
  | 'sports-fashion-3'
  | 'sports-fashion-4'
  | 'sports-pirates'
  | 'sports-pirates-2'
  | 'sports-pirates-3'
  | 'sports-pirates-4'
  | 'sports-pirates-cooking'
  | 'sports-pirates-cooking-2'
  | 'sports-pirates-fashion'
  | 'sports-pirates-fashion-2'
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

// A persisted snapshot of a chapter's OPENING narrative beat (the opening/bridge prose shown when
// that chapter began). Captured when the chapter starts so it survives `segments` compaction and
// stays reviewable. `sceneId` is omitted when absent (Firestore rejects undefined), like segments.
export type ChapterBeat = {
  chapter: number // 1-based chapter this narrative opens
  text: string // the chapter's opening/bridge (setup) narrative prose
  sceneId?: SceneId // the setup beat's matched background image (omitted when absent)
  // --- The learner's checkpoint action + its outcome (OPTIONAL/back-compatible) ---
  // Folded in once the learner chooses and the "what happens next" continuation is generated, so the
  // recap re-reads the SAME setup -> choice -> outcome the chapter was first played with. Each is
  // omitted when absent (e.g. legacy beats, or the current chapter before its choice was made).
  userChoice?: string // what the learner typed at this chapter's checkpoint
  outcomeText?: string // the "what happened next" continuation produced from that choice
  outcomeSceneId?: SceneId // the outcome beat's matched background image (omitted when absent)
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
  // OPTIONAL/back-compatible: a persisted snapshot of each chapter's OPENING narrative beat, so
  // the prose that began a chapter survives `segments` compaction and stays reviewable (Back can
  // reach "[chapter text] then that chapter's questions"). Omitted when none captured yet.
  chapterBeats?: ChapterBeat[]
  // Rolling summary of older segments for context-window management (plan section 8).
  narrativeSummary: string

  createdAt: string
  updatedAt: string
  // Schema version so future migrations are safe (mirrors STORAGE_KEY versioning). v2 adds the
  // session `id` (library) and the question `history`/`historyIndex` (back/forward review).
  schemaVersion: 2
}
