// Scene -> interest-tuple categorization for the scene-categorization redesign.
//
// Mirrors the `interests.ts` / `scenery.ts` split: a pure, React-free `.ts` module so BOTH the
// app and the (node:test) suites can share one source of truth and unit-test the lookups. It maps
// every catalog scene (`SCENE_IDS` / `SCENERY_CATALOG` in `./scenery`) to the SET of suggested
// interests (`StoryInterestId`) it represents, using a hybrid scheme:
//
//   1. COMBOS are DERIVED from the id tokens. A scene id whose '-'-split tokens are ALL interest
//      ids is a blend whose interest set IS those tokens (e.g. `fantasy-cooking` -> {fantasy,
//      cooking}; `fantasy-cooking-fashion` -> the triple). The catalog holds every C(8,2)=28 pair
//      and every C(8,3)=56 triple, so the combos cover all pair/triple interest sets with no table
//      entries needed.
//
//   2. NON-COMBOS use the explicit `SCENE_PRIMARY_INTERESTS` table below. It was BOOTSTRAPPED from
//      the keyword fingerprints (`SUGGESTED_INTEREST_KEYWORDS` in `./scenery`): each pure
//      single-topic scene maps to its one matched interest, and the ~31 scenes whose fingerprint
//      matched 2+ interests were HAND-ASSIGNED their best 1-2 interests (e.g. `dragon-bakery` ->
//      {fantasy, cooking}, `space-farm` -> {space}, `wizard-arena` -> {fantasy}).
//
//   3. UNCOMMON scenes are everything left over — absent from the table AND not a combo. Their
//      interest set is empty (`[]`); these are the off-interest "surprise" scenes a learner would
//      essentially never reach from the suggested interests alone.
//
// All exported helpers are PURE + deterministic (they fold over the catalog in its fixed order).

import type { SceneId, StoryInterestId } from '../content/storyTypes'
import { SCENE_IDS } from './scenery'

// The 8 suggested interests, in their canonical catalog order (matches INTEREST_CATALOG).
export const SUGGESTED_INTEREST_IDS: readonly StoryInterestId[] = [
  'space',
  'fantasy',
  'mystery',
  'sports',
  'animals',
  'pirates',
  'cooking',
  'fashion',
]

const INTEREST_ID_SET: ReadonlySet<string> = new Set<string>(SUGGESTED_INTEREST_IDS)

// The interest set for a COMBO id (all tokens are interest ids), in id-token order, or null when
// the id is not a combo. Pure: derived entirely from the id string.
const comboInterests = (id: SceneId): StoryInterestId[] | null => {
  const tokens = id.split('-')
  if (tokens.length < 2) return null
  if (!tokens.every((token) => INTEREST_ID_SET.has(token))) return null
  return tokens as StoryInterestId[]
}

// Explicit categorization for NON-COMBO scenes. Bootstrapped from SUGGESTED_INTEREST_KEYWORDS
// (single-topic scenes) plus deliberate hand-assignment of the multi-interest, non-blend scenes.
// Any catalog scene absent here AND not a combo is "uncommon" (interest set []).
export const SCENE_PRIMARY_INTERESTS: Partial<Record<SceneId, StoryInterestId[]>> = {
  // --- Single-topic scenes (bootstrapped from SUGGESTED_INTEREST_KEYWORDS) ---
  'abandoned-factory': ['mystery'],
  'airport-runway': ['fashion'],
  'alien-desert': ['space'],
  'alien-jungle': ['space'],
  'alien-planet': ['space'],
  'aquarium-tank': ['animals'],
  'aquarium-tunnel': ['animals'],
  arcade: ['space'],
  'asteroid-field': ['space'],
  'autumn-space-station': ['space'],
  'bakery-shop': ['cooking'],
  'baseball-field': ['sports'],
  'basketball-court': ['sports'],
  'bowling-alley': ['sports'],
  'butterfly-garden': ['animals'],
  'cake-shop': ['cooking'],
  'candy-forest': ['cooking'],
  'candy-shop': ['cooking'],
  'castle-hall': ['fantasy'],
  'cloud-castle': ['fantasy'],
  'cloud-kingdom': ['fantasy'],
  'cooking-class': ['cooking'],
  'costume-workshop': ['fashion'],
  'couture-house': ['fashion'],
  'cozy-kitchen': ['cooking'],
  'crystal-cavern': ['fantasy'],
  'crystal-forest': ['fantasy'],
  'crystal-pool': ['fantasy'],
  'crystal-temple': ['fantasy'],
  'desert-aquarium': ['animals'],
  'design-studio': ['fashion'],
  'detective-office': ['mystery'],
  'detective-study': ['mystery'],
  'dino-lagoon': ['animals'],
  'dino-snow': ['animals'],
  'dino-volcano': ['animals'],
  'dinosaur-jungle': ['animals'],
  'dragon-harbor': ['fantasy'],
  'dragon-mountain': ['fantasy'],
  'dragon-volcano': ['fantasy'],
  'dungeon-corridor': ['mystery'],
  'egyptian-space-station': ['space'],
  'enchanted-forest': ['fantasy'],
  'fairy-castle': ['fantasy'],
  'fairy-glade': ['fantasy'],
  'fairy-greenhouse': ['fantasy'],
  'fairy-harbor': ['fantasy'],
  'fairy-tea-party': ['fantasy'],
  'fairy-train-station': ['fantasy'],
  'farm-barnyard': ['animals'],
  'fashion-boutique': ['fashion'],
  'fashion-photoshoot': ['fashion'],
  'fashion-runway': ['fashion'],
  'floating-islands': ['fantasy'],
  'floating-market': ['fantasy'],
  'foggy-alley': ['mystery'],
  'foggy-graveyard': ['mystery'],
  'futuristic-city': ['space'],
  'ghost-market': ['mystery'],
  'greek-underwater-temple': ['animals'],
  'hat-boutique': ['fashion'],
  'haunted-fairground': ['mystery'],
  'haunted-forest': ['mystery'],
  'haunted-lighthouse': ['mystery'],
  'haunted-mansion': ['mystery'],
  'horse-stable': ['animals'],
  'ice-cream-parlor': ['cooking'],
  'ice-palace': ['fantasy'],
  'ice-rink': ['sports'],
  'jewelry-boutique': ['fashion'],
  'jungle-aquarium': ['animals'],
  'knight-tournament': ['fantasy'],
  'lava-bakery': ['cooking'],
  'lava-fortress': ['fantasy'],
  'lunar-base': ['space'],
  'makeup-studio': ['fashion'],
  'medieval-arena': ['sports'],
  'mermaid-lagoon': ['fantasy'],
  'moon-surface': ['space'],
  'museum-hall': ['animals'],
  'mushroom-metropolis': ['fantasy'],
  'mushroom-village': ['fantasy'],
  'neon-bamboo-grove': ['space'],
  'outer-space': ['space'],
  'pirate-captain-cabin': ['pirates'],
  'pirate-cove': ['pirates'],
  'pirate-fort': ['pirates'],
  'pirate-island-market': ['pirates'],
  'pirate-jungle-camp': ['pirates'],
  'pirate-lagoon': ['pirates'],
  'pirate-ship-deck': ['pirates'],
  'pirate-shipwreck': ['pirates'],
  'pirate-tavern': ['pirates'],
  'pirate-treasure-cave': ['pirates'],
  'pirate-volcano-cove': ['pirates'],
  'pizza-shop': ['cooking'],
  planetarium: ['space'],
  'race-track': ['sports'],
  'rainbow-falls': ['fantasy'],
  'restaurant-kitchen': ['cooking'],
  'robot-city': ['space'],
  'robot-lab': ['space'],
  'safari-animals': ['animals'],
  'samurai-castle': ['fantasy'],
  'savanna-spaceport': ['space'],
  'sewing-studio': ['fashion'],
  'shoe-boutique': ['fashion'],
  'skate-park': ['sports'],
  'ski-slope': ['sports'],
  'sky-ruins': ['fantasy'],
  'soccer-field': ['sports'],
  'space-bazaar': ['space'],
  'space-station': ['space'],
  'space-station-exterior': ['space'],
  'spaceship-bridge': ['space'],
  'spaceship-corridor': ['space'],
  'sports-stadium': ['sports'],
  'steampunk-city': ['space'],
  'stormy-sea': ['fantasy'],
  'sushi-bar': ['cooking'],
  'tailor-shop': ['fashion'],
  'tennis-court': ['sports'],
  'treasure-island': ['pirates'],
  'underwater-farm': ['animals'],
  'underwater-reef': ['animals'],
  'underwater-stadium': ['sports'],
  'unicorn-meadow': ['fantasy'],
  'volcano-spaceport': ['space'],
  'wizard-library': ['fantasy'],
  'wizard-tower': ['fantasy'],
  'zoo-entrance': ['animals'],

  // --- Multi-interest non-blend scenes (hand-assigned their best 1-2 interests) ---
  'alien-ocean': ['space'], // sci-fi alien world; the floating islands are incidental
  'candy-castle': ['fantasy', 'cooking'], // a fairytale castle built from candy + sweets
  'cloud-stadium': ['sports', 'fantasy'], // a sports stadium set on a fantasy cloud kingdom
  'crystal-farm': ['fantasy'], // glowing crystals dominate; no actual animals present
  'dog-park': ['animals'], // a dog park; the agility ramps/tennis balls are dog play
  'donut-shop': ['cooking'], // a donut bakery
  'dragon-bakery': ['fantasy', 'cooking'], // a dragon-run bakery
  'dragon-lair': ['fantasy'], // a dragon's lair; treasure is set dressing, not pirates
  'dragon-stadium': ['fantasy', 'sports'], // a sports stadium with a dragon overhead
  'enchanted-bakery': ['fantasy', 'cooking'], // a magical bakery
  'farmers-market': ['cooking'], // produce/food stalls, not livestock
  'haunted-aquarium': ['mystery', 'animals'], // an eerie/haunted aquarium full of fish
  'haunted-bakery': ['mystery', 'cooking'], // a spooky haunted bakery
  'haunted-circus': ['mystery'], // a spooky abandoned circus; the "full moon" is just night sky
  'medieval-aquarium': ['fantasy', 'animals'], // a medieval castle hall of fish tanks
  'moon-farm': ['space'], // a farm on the moon; sci-fi setting dominates (cf. space-farm)
  'pirate-asteroid-port': ['space', 'pirates'], // a pirate port on an asteroid in space
  'robot-farm': ['space'], // sci-fi robots tending crops; defining feature is the robots
  'space-castle': ['space', 'fantasy'], // a fantasy castle floating in space
  'space-concert': ['space'], // a concert stage in outer space; "floating" is incidental
  'space-farm': ['space'], // a farm floating in outer space; sci-fi setting dominates
  'space-kitchen': ['space', 'cooking'], // a galley kitchen aboard a spaceship
  'space-runway': ['space', 'fashion'], // a fashion runway aboard a space station
  'space-zoo': ['space', 'animals'], // a zoo of alien creatures on a space station
  'spooky-attic': ['mystery'], // a spooky attic; "moonlight" is just lighting
  'underwater-castle': ['fantasy', 'animals'], // a castle under the sea surrounded by fish
  'witch-hut': ['fantasy', 'mystery'], // a witch's hut (fantasy) in creepy dark woods (mystery)
  'wizard-arena': ['fantasy'], // a magical wizard arena; the "sports" cue is the arena alone
  'wizard-kitchen': ['fantasy', 'cooking'], // a potion kitchen inside a wizard tower
  'wizard-observatory': ['space', 'fantasy'], // a wizard's star observatory (astronomy + magic)
  'zero-gravity-arena': ['space', 'sports'], // a sci-fi zero-gravity sports arena
}

// The interest SET a scene represents: combo tokens for blends, the explicit table for non-combos,
// or [] for an uncommon scene. Always returns a fresh array (callers may not mutate the catalog).
export function interestsForScene(id: SceneId): StoryInterestId[] {
  const combo = comboInterests(id)
  if (combo) return combo
  const tabled = SCENE_PRIMARY_INTERESTS[id]
  if (tabled) return [...tabled]
  return []
}

const sameInterestSet = (a: readonly StoryInterestId[], b: readonly StoryInterestId[]): boolean => {
  const sa = new Set<string>(a)
  const sb = new Set<string>(b)
  if (sa.size !== sb.size) return false
  for (const value of sa) if (!sb.has(value)) return false
  return true
}

// Every catalog scene whose interest set EXACTLY equals the given set (order-insensitive; duplicate
// inputs are ignored). Returns ids in catalog order, so the result is stable and deterministic.
export function scenesForExactInterests(ids: readonly StoryInterestId[]): SceneId[] {
  const out: SceneId[] = []
  for (const id of SCENE_IDS) {
    if (sameInterestSet(interestsForScene(id), ids)) out.push(id)
  }
  return out
}

// Pure single-topic scenes for one interest (interest set === exactly {interest}).
export function singlesFor(interest: StoryInterestId): SceneId[] {
  return scenesForExactInterests([interest])
}

// Scenes whose interest set is exactly {a, b} (the matching pair-combo plus any hand-assigned pair).
export function pairScenes(a: StoryInterestId, b: StoryInterestId): SceneId[] {
  return scenesForExactInterests([a, b])
}

// Scenes whose interest set is exactly {a, b, c} (the matching triple-combo blend tiles).
export function tripleScenes(a: StoryInterestId, b: StoryInterestId, c: StoryInterestId): SceneId[] {
  return scenesForExactInterests([a, b, c])
}

// The "uncommon" scenes: not a combo and absent from the table, so their interest set is empty.
export function uncommonScenes(): SceneId[] {
  return SCENE_IDS.filter((id) => interestsForScene(id).length === 0)
}
