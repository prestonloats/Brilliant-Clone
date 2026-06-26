// The fixed scenery-image catalog the LLM matches story beats to, plus tiny lookups.
//
// Mirrors the `interests.ts` pattern: the `SceneId` union is a pure content type (in
// `storyTypes.ts`) so the persistence/runtime layers can reference a chosen scene without
// importing this module, while the human DESCRIPTIONS, the asset PATH, and the validation
// lookups live here in a React-free `.ts` module so BOTH the prompt builder
// (`storyPrompts.ts`) and the persistence normalizer (`backend/validation.ts`) share one
// source of truth — and the lookups can be unit-tested under `node --test`.
//
// Every `id` matches an asset shipped at `public/scenery/<id>.webp`, served at `/scenery/<id>.webp`
// in dev and in the (root) Firebase Hosting deploy.

import type { SceneId, StoryInterestId, StoryTheme } from '../content/storyTypes'
import { getInterestLabel } from './interests'

export type SceneEntry = {
  id: SceneId
  // A short human label (used for the image's alt text and any UI caption).
  label: string
  // A plain-language description of the SETTING the image depicts. This is what the model reads
  // when matching a story beat to an image, so it is written as "where this is" in simple words.
  description: string
}

// The catalog. Order is alphabetical by id (matches the asset folder) and is not significant.
export const SCENERY_CATALOG: readonly SceneEntry[] = [
  { id: 'abandoned-factory', label: 'Abandoned factory', description: 'A dark abandoned factory interior with rusted machinery' },
  { id: 'airport-runway', label: 'Airport runway', description: 'An airport runway with planes beside a glass terminal' },
  { id: 'alien-desert', label: 'Alien desert', description: 'A red alien desert planet with rock arches and twin suns' },
  { id: 'alien-jungle', label: 'Alien jungle', description: 'A glowing alien jungle of strange plants on a distant planet' },
  { id: 'alien-ocean', label: 'Alien ocean', description: 'A strange alien ocean world with floating islands and twin moons' },
  { id: 'alien-planet', label: 'Alien planet', description: 'An alien planet with glowing plants and moons in the sky' },
  { id: 'amusement-park', label: 'Amusement park', description: 'A cheerful amusement park with a roller coaster and rides' },
  { id: 'ancient-ruins', label: 'Ancient ruins', description: 'Crumbling stone ruins of a lost ancient civilization' },
  { id: 'animals-cooking', label: 'Animals & Cooking', description: 'A blend of the animals and cooking themes' },
  { id: 'animals-cooking-fashion', label: 'Animals, Cooking & Fashion', description: 'A blend of the animals, cooking, and fashion themes' },
  { id: 'animals-fashion', label: 'Animals & Fashion', description: 'A blend of the animals and fashion themes' },
  { id: 'animals-pirates', label: 'Animals & Pirates', description: 'A blend of the animals and pirates themes' },
  { id: 'animals-pirates-cooking', label: 'Animals, Pirates & Cooking', description: 'A blend of the animals, pirates, and cooking themes' },
  { id: 'animals-pirates-fashion', label: 'Animals, Pirates & Fashion', description: 'A blend of the animals, pirates, and fashion themes' },
  { id: 'aquarium-tank', label: 'Aquarium', description: 'A large aquarium tank full of colorful fish and sea creatures' },
  { id: 'aquarium-tunnel', label: 'Aquarium tunnel', description: 'A walk-through glass aquarium tunnel surrounded by fish' },
  { id: 'arcade', label: 'Arcade', description: 'A neon video game arcade full of glowing cabinets' },
  { id: 'art-gallery', label: 'Art gallery', description: 'A museum art gallery hung with framed paintings' },
  { id: 'art-studio', label: 'Art studio', description: 'A bright artist studio with easels, canvases, and paint' },
  { id: 'asteroid-field', label: 'Asteroid field', description: 'A field of drifting rocky asteroids in deep space' },
  { id: 'autumn-space-station', label: 'Autumn space station', description: 'A space station greenhouse full of autumn trees and falling leaves with stars outside' },
  { id: 'autumn-woods', label: 'Autumn woods', description: 'A forest of trees with red, orange, and gold autumn leaves' },
  { id: 'bakery-shop', label: 'Bakery shop', description: 'A cozy bakery with fresh bread and pastries on display' },
  { id: 'bamboo-forest', label: 'Bamboo forest', description: 'A dense grove of tall green bamboo with sunlight filtering through' },
  { id: 'baseball-field', label: 'Baseball field', description: 'A sunny baseball diamond with a grass outfield and stands' },
  { id: 'basketball-court', label: 'Basketball court', description: 'An indoor basketball court with polished floors and hoops' },
  { id: 'bowling-alley', label: 'Bowling alley', description: 'An indoor bowling alley with polished lanes and pins' },
  { id: 'butterfly-garden', label: 'Butterfly garden', description: 'A glass greenhouse full of butterflies and blooming flowers' },
  { id: 'cake-shop', label: 'Cake shop', description: 'A fancy cake and pastry bakery with tiered decorated cakes in glass cases' },
  { id: 'candy-castle', label: 'Candy castle', description: 'A fairytale castle built from candy, frosting, and lollipops' },
  { id: 'candy-forest', label: 'Candy forest', description: 'A whimsical forest of giant candy canes and gumdrop trees' },
  { id: 'candy-shop', label: 'Candy shop', description: 'A colorful candy shop with jars of bright sweets' },
  { id: 'canyon-gorge', label: 'Canyon gorge', description: 'A deep rocky canyon gorge with steep cliff walls' },
  { id: 'carnival-midway', label: 'Carnival midway', description: 'A carnival midway lined with game booths and string lights' },
  { id: 'castle-hall', label: 'Castle hall', description: 'The grand stone interior hall of a castle' },
  { id: 'circus-tent', label: 'Circus tent', description: 'A colorful striped big-top circus tent with flags' },
  { id: 'city-skyline', label: 'City skyline', description: 'A modern city skyline of tall buildings' },
  { id: 'classroom', label: 'Classroom', description: 'A friendly school classroom with a chalkboard and desks' },
  { id: 'cloud-castle', label: 'Cloud castle', description: 'A white castle with tall towers floating on a fluffy cloud' },
  { id: 'cloud-kingdom', label: 'Cloud kingdom', description: 'A kingdom of floating palaces perched on the clouds' },
  { id: 'cloud-stadium', label: 'Cloud stadium', description: 'A sports stadium built on a kingdom of fluffy clouds high in the sky' },
  { id: 'construction-site', label: 'Construction site', description: 'A busy construction site with cranes and steel frames' },
  { id: 'cooking-class', label: 'Cooking class', description: 'A bright cooking class kitchen with prep stations, mixing bowls, and fresh ingredients' },
  { id: 'cooking-fashion', label: 'Cooking & Fashion', description: 'A blend of the cooking and fashion themes' },
  { id: 'coral-skyline', label: 'Coral skyline', description: 'A city skyline of living coral towers rising above the ocean waves' },
  { id: 'costume-workshop', label: 'Costume workshop', description: 'A fashion costume workshop full of elaborate gowns and outfits on racks' },
  { id: 'couture-house', label: 'Couture house', description: 'A high-fashion couture house showroom with designer gowns on display' },
  { id: 'cozy-kitchen', label: 'Cozy kitchen', description: 'A warm home kitchen with food cooking on the stove' },
  { id: 'crystal-cavern', label: 'Crystal cavern', description: 'A glowing underground cavern full of crystals' },
  { id: 'crystal-farm', label: 'Crystal farm', description: 'Farm fields and barns growing among giant glowing crystals' },
  { id: 'crystal-forest', label: 'Crystal forest', description: 'A shimmering forest of giant glowing crystal trees' },
  { id: 'crystal-pool', label: 'Crystal pool', description: 'A serene glowing pool of crystal-clear water in a luminous underground grotto' },
  { id: 'crystal-temple', label: 'Crystal temple', description: 'An ancient temple with grand columns carved from glowing crystal' },
  { id: 'dark-cave', label: 'Dark cave', description: 'A dark, shadowy underground cave' },
  { id: 'desert-aquarium', label: 'Desert aquarium', description: 'A giant glass aquarium full of fish standing among desert sand dunes' },
  { id: 'desert-dunes', label: 'Desert dunes', description: 'Rolling sand dunes in a sunny desert' },
  { id: 'desert-oasis', label: 'Desert oasis', description: 'A palm-fringed oasis pool among golden desert dunes' },
  { id: 'desert-train-station', label: 'Desert train station', description: 'A lonely train station and tracks among tall desert sand dunes' },
  { id: 'design-studio', label: 'Design studio', description: 'A fashion design studio with sketches, fabrics, and mannequins' },
  { id: 'detective-office', label: 'Detective office', description: 'A dim noir detective office with case files and rain on the window' },
  { id: 'detective-study', label: 'Detective\'s study', description: 'A noir detective\'s study with a clue board of pinned photos and red string, a desk, and a lamp' },
  { id: 'dino-lagoon', label: 'Dino lagoon', description: 'Long-necked sea dinosaurs swimming in a prehistoric lagoon' },
  { id: 'dino-snow', label: 'Dino snowland', description: 'Woolly dinosaurs and mammoths in a snowy ice-age landscape' },
  { id: 'dino-volcano', label: 'Dino volcano', description: 'Dinosaurs roaming a prehistoric valley near a smoking volcano' },
  { id: 'dinosaur-jungle', label: 'Dinosaur jungle', description: 'Friendly dinosaurs roaming a steamy prehistoric jungle' },
  { id: 'dog-park', label: 'Dog park', description: 'A sunny green park with agility ramps and tennis balls' },
  { id: 'donut-shop', label: 'Donut shop', description: 'A cheerful donut bakery with racks of glazed, sprinkled, and frosted pastries' },
  { id: 'dragon-bakery', label: 'Dragon bakery', description: 'A cozy bakery where a friendly dragon heats the ovens with fire' },
  { id: 'dragon-harbor', label: 'Dragon harbor', description: 'Dragons perched above the docks of a busy seaside harbor' },
  { id: 'dragon-lair', label: 'Dragon lair', description: 'A cavernous dragon lair piled with gold treasure' },
  { id: 'dragon-mountain', label: 'Dragon mountain', description: 'A dragon soaring over jagged snowy mountain peaks' },
  { id: 'dragon-stadium', label: 'Dragon stadium', description: 'A huge sports stadium with a dragon circling overhead' },
  { id: 'dragon-volcano', label: 'Dragon volcano', description: 'A mighty dragon perched on an erupting volcano glowing with lava' },
  { id: 'dungeon-corridor', label: 'Dungeon corridor', description: 'A gloomy stone dungeon corridor' },
  { id: 'egyptian-pyramids', label: 'Egyptian pyramids', description: 'Great pyramids rising from ancient Egyptian desert sands' },
  { id: 'egyptian-space-station', label: 'Egyptian space station', description: 'A space station shaped like golden Egyptian pyramids among the stars' },
  { id: 'enchanted-bakery', label: 'Enchanted bakery', description: 'A magical bakery where glowing pastries float and sparkle' },
  { id: 'enchanted-forest', label: 'Enchanted forest', description: 'A magical, glowing enchanted forest' },
  { id: 'fairy-castle', label: 'Fairy castle', description: 'A delicate fairy castle with slender glowing towers in a glade' },
  { id: 'fairy-glade', label: 'Fairy glade', description: 'A glowing fairy glade with floating sparkles and soft light' },
  { id: 'fairy-greenhouse', label: 'Fairy greenhouse', description: 'A glass greenhouse of glowing magical flowers in a fairy glade' },
  { id: 'fairy-harbor', label: 'Fairy harbor', description: 'Tiny glowing boats at a magical little harbor in a fairy glade' },
  { id: 'fairy-tea-party', label: 'Fairy tea party', description: 'A tiny fairy tea party set on toadstools in an enchanted glade' },
  { id: 'fairy-train-station', label: 'Fairy train station', description: 'A tiny magical train station glowing in an enchanted fairy glade' },
  { id: 'fantasy-animals', label: 'Fantasy & Animals', description: 'A blend of the fantasy and animals themes' },
  { id: 'fantasy-animals-cooking', label: 'Fantasy, Animals & Cooking', description: 'A blend of the fantasy, animals, and cooking themes' },
  { id: 'fantasy-animals-fashion', label: 'Fantasy, Animals & Fashion', description: 'A blend of the fantasy, animals, and fashion themes' },
  { id: 'fantasy-animals-pirates', label: 'Fantasy, Animals & Pirates', description: 'A blend of the fantasy, animals, and pirates themes' },
  { id: 'fantasy-cooking', label: 'Fantasy & Cooking', description: 'A blend of the fantasy and cooking themes' },
  { id: 'fantasy-cooking-fashion', label: 'Fantasy, Cooking & Fashion', description: 'A blend of the fantasy, cooking, and fashion themes' },
  { id: 'fantasy-fashion', label: 'Fantasy & Fashion', description: 'A blend of the fantasy and fashion themes' },
  { id: 'fantasy-mystery', label: 'Fantasy & Mystery', description: 'A blend of the fantasy and mystery themes' },
  { id: 'fantasy-mystery-animals', label: 'Fantasy, Mystery & Animals', description: 'A blend of the fantasy, mystery, and animals themes' },
  { id: 'fantasy-mystery-cooking', label: 'Fantasy, Mystery & Cooking', description: 'A blend of the fantasy, mystery, and cooking themes' },
  { id: 'fantasy-mystery-fashion', label: 'Fantasy, Mystery & Fashion', description: 'A blend of the fantasy, mystery, and fashion themes' },
  { id: 'fantasy-mystery-pirates', label: 'Fantasy, Mystery & Pirates', description: 'A blend of the fantasy, mystery, and pirates themes' },
  { id: 'fantasy-mystery-sports', label: 'Fantasy, Mystery & Sports', description: 'A blend of the fantasy, mystery, and sports themes' },
  { id: 'fantasy-pirates', label: 'Fantasy & Pirates', description: 'A blend of the fantasy and pirates themes' },
  { id: 'fantasy-pirates-cooking', label: 'Fantasy, Pirates & Cooking', description: 'A blend of the fantasy, pirates, and cooking themes' },
  { id: 'fantasy-pirates-fashion', label: 'Fantasy, Pirates & Fashion', description: 'A blend of the fantasy, pirates, and fashion themes' },
  { id: 'fantasy-sports', label: 'Fantasy & Sports', description: 'A blend of the fantasy and sports themes' },
  { id: 'fantasy-sports-animals', label: 'Fantasy, Sports & Animals', description: 'A blend of the fantasy, sports, and animals themes' },
  { id: 'fantasy-sports-cooking', label: 'Fantasy, Sports & Cooking', description: 'A blend of the fantasy, sports, and cooking themes' },
  { id: 'fantasy-sports-fashion', label: 'Fantasy, Sports & Fashion', description: 'A blend of the fantasy, sports, and fashion themes' },
  { id: 'fantasy-sports-pirates', label: 'Fantasy, Sports & Pirates', description: 'A blend of the fantasy, sports, and pirates themes' },
  { id: 'farm-barnyard', label: 'Farm barnyard', description: 'A farm barnyard with a red barn and farm animals' },
  { id: 'farmers-market', label: 'Farmers market', description: 'An outdoor farmers market with produce and flower stalls' },
  { id: 'fashion-boutique', label: 'Fashion boutique', description: 'A chic fashion boutique with racks of stylish outfits, tall mirrors, and elegant displays' },
  { id: 'fashion-photoshoot', label: 'Fashion photoshoot', description: 'A bright fashion photo studio with backdrops, softbox lights, and cameras' },
  { id: 'fashion-runway', label: 'Fashion runway', description: 'A bright fashion runway with a long catwalk and bold lights' },
  { id: 'ferris-wheel', label: 'Ferris wheel', description: 'A giant glowing ferris wheel at a fair at sunset' },
  { id: 'fire-station', label: 'Fire station', description: 'A fire station garage with a shiny red fire truck' },
  { id: 'floating-islands', label: 'Floating islands', description: 'Islands floating in the sky among the clouds' },
  { id: 'floating-market', label: 'Floating market', description: 'A market of stalls spread across islands floating in the sky' },
  { id: 'flower-meadow', label: 'Flower meadow', description: 'A bright open meadow full of wildflowers' },
  { id: 'foggy-alley', label: 'Foggy alley', description: 'A foggy noir mystery city alley at night under a flickering streetlamp on wet cobblestones' },
  { id: 'foggy-graveyard', label: 'Foggy graveyard', description: 'A foggy graveyard at night with old tombstones' },
  { id: 'forest-clearing', label: 'Forest clearing', description: 'A peaceful clearing in a green forest' },
  { id: 'frozen-bazaar', label: 'Frozen bazaar', description: 'A busy market of stalls built on a frozen lake of ice' },
  { id: 'frozen-lake', label: 'Frozen lake', description: 'A frozen lake surrounded by snow and ice' },
  { id: 'futuristic-city', label: 'Futuristic city', description: 'A neon-lit futuristic city skyline at night' },
  { id: 'ghost-market', label: 'Ghost market', description: 'A foggy night market of glowing stalls among graveyard tombstones' },
  { id: 'greek-temple', label: 'Greek temple', description: 'The white marble columns of an ancient Greek temple' },
  { id: 'greek-underwater-temple', label: 'Greek underwater temple', description: 'Sunken Greek temple columns and statues deep underwater on a reef' },
  { id: 'harbor-docks', label: 'Harbor docks', description: 'A coastal harbor with wooden docks and moored boats' },
  { id: 'hat-boutique', label: 'Hat boutique', description: 'A quaint fashion hat boutique full of stylish hats on stands and mirrors' },
  { id: 'haunted-aquarium', label: 'Haunted aquarium', description: 'A dark, eerie aquarium with glowing tanks in an abandoned haunted hall' },
  { id: 'haunted-bakery', label: 'Haunted bakery', description: 'A spooky old bakery shop inside a creaky haunted house' },
  { id: 'haunted-circus', label: 'Haunted circus', description: 'A spooky abandoned circus tent under a full moon' },
  { id: 'haunted-fairground', label: 'Haunted fairground', description: 'A creepy abandoned fairground with a broken ferris wheel' },
  { id: 'haunted-forest', label: 'Haunted forest', description: 'A dark haunted forest of twisted glowing trees and fog' },
  { id: 'haunted-lighthouse', label: 'Haunted lighthouse', description: 'A spooky abandoned lighthouse on a foggy rocky coast at night' },
  { id: 'haunted-mansion', label: 'Haunted mansion', description: 'A spooky old haunted mansion' },
  { id: 'horse-stable', label: 'Horse stable', description: 'A wooden horse stable with stalls, hay, and a paddock' },
  { id: 'hot-air-balloons', label: 'Hot air balloons', description: 'A sky full of colorful hot air balloons over green hills' },
  { id: 'ice-cream-parlor', label: 'Ice cream parlor', description: 'A retro ice cream parlor with a sundae counter and stools' },
  { id: 'ice-palace', label: 'Ice palace', description: 'A glittering palace with tall spires carved from blue ice and snow' },
  { id: 'ice-rink', label: 'Ice rink', description: 'An indoor ice skating rink with smooth glossy ice' },
  { id: 'icy-fjord', label: 'Icy fjord', description: 'A narrow icy fjord between steep snow-covered cliffs' },
  { id: 'jewelry-boutique', label: 'Jewelry boutique', description: 'A sparkling fashion jewelry boutique with glass cases of necklaces, rings, and gems' },
  { id: 'jungle-aquarium', label: 'Jungle aquarium', description: 'A massive aquarium tank overgrown with plants inside a green jungle' },
  { id: 'jungle-skyscrapers', label: 'Jungle skyscrapers', description: 'Overgrown skyscrapers wrapped in jungle vines and trees' },
  { id: 'jungle-temple', label: 'Jungle temple', description: 'An overgrown ancient temple deep in the jungle' },
  { id: 'jungle-waterfall', label: 'Jungle waterfall', description: 'A lush green jungle with a tall cascading waterfall' },
  { id: 'knight-tournament', label: 'Knight tournament', description: 'A medieval jousting tournament field with colorful banners' },
  { id: 'lava-bakery', label: 'Lava bakery', description: 'A bakery with stone ovens fired by glowing lava in a volcanic cavern' },
  { id: 'lava-fortress', label: 'Lava fortress', description: 'A dark obsidian fortress beside flowing rivers of lava' },
  { id: 'library-hall', label: 'Library hall', description: 'A grand public library reading hall with tall bookshelves' },
  { id: 'lighthouse-coast', label: 'Lighthouse coast', description: 'A lighthouse on a rocky ocean coast' },
  { id: 'lunar-base', label: 'Lunar base', description: 'A domed lunar base with rovers on the gray cratered moon surface under a starry sky' },
  { id: 'makeup-studio', label: 'Makeup studio', description: 'A glamorous fashion makeup and styling studio with lit vanity mirrors and cosmetics' },
  { id: 'mansion-library', label: 'Mansion library', description: 'A grand manor library of tall bookshelves with a hidden door' },
  { id: 'market-bazaar', label: 'Market bazaar', description: 'A busy outdoor market bazaar full of stalls' },
  { id: 'medieval-aquarium', label: 'Medieval aquarium', description: 'A great stone hall with huge fish tanks inside a medieval castle' },
  { id: 'medieval-arena', label: 'Medieval arena', description: 'A basketball court inside a medieval stone town square' },
  { id: 'medieval-town', label: 'Medieval town', description: 'A cobblestone street in a medieval town with timber houses' },
  { id: 'mermaid-lagoon', label: 'Mermaid lagoon', description: 'A sparkling mermaid lagoon with coral, shells, and clear water' },
  { id: 'moon-farm', label: 'Moon farm', description: 'A farm with barns and fields under glass domes on the moon' },
  { id: 'moon-surface', label: 'Moon surface', description: 'The gray cratered surface of the moon under a starry sky' },
  { id: 'mountain-cliff', label: 'Mountain cliff', description: 'A high rocky mountain cliff with a wide view' },
  { id: 'mountain-lake', label: 'Mountain lake', description: 'A calm mountain lake mirroring snowy peaks' },
  { id: 'movie-theater', label: 'Movie theater', description: 'A classic movie theater auditorium with a big screen' },
  { id: 'museum-hall', label: 'Museum hall', description: 'A natural history museum hall with a dinosaur skeleton' },
  { id: 'mushroom-metropolis', label: 'Mushroom metropolis', description: 'A towering city skyline built from giant glowing mushrooms' },
  { id: 'mushroom-village', label: 'Mushroom village', description: 'A whimsical village built among giant glowing mushrooms' },
  { id: 'music-stage', label: 'Music stage', description: 'A bright concert stage with colorful spotlights and speakers' },
  { id: 'mystery-animals', label: 'Mystery & Animals', description: 'A blend of the mystery and animals themes' },
  { id: 'mystery-animals-cooking', label: 'Mystery, Animals & Cooking', description: 'A blend of the mystery, animals, and cooking themes' },
  { id: 'mystery-animals-fashion', label: 'Mystery, Animals & Fashion', description: 'A blend of the mystery, animals, and fashion themes' },
  { id: 'mystery-animals-pirates', label: 'Mystery, Animals & Pirates', description: 'A blend of the mystery, animals, and pirates themes' },
  { id: 'mystery-cooking', label: 'Mystery & Cooking', description: 'A blend of the mystery and cooking themes' },
  { id: 'mystery-cooking-fashion', label: 'Mystery, Cooking & Fashion', description: 'A blend of the mystery, cooking, and fashion themes' },
  { id: 'mystery-fashion', label: 'Mystery & Fashion', description: 'A blend of the mystery and fashion themes' },
  { id: 'mystery-pirates', label: 'Mystery & Pirates', description: 'A blend of the mystery and pirates themes' },
  { id: 'mystery-pirates-cooking', label: 'Mystery, Pirates & Cooking', description: 'A blend of the mystery, pirates, and cooking themes' },
  { id: 'mystery-pirates-fashion', label: 'Mystery, Pirates & Fashion', description: 'A blend of the mystery, pirates, and fashion themes' },
  { id: 'mystery-sports', label: 'Mystery & Sports', description: 'A blend of the mystery and sports themes' },
  { id: 'mystery-sports-animals', label: 'Mystery, Sports & Animals', description: 'A blend of the mystery, sports, and animals themes' },
  { id: 'mystery-sports-cooking', label: 'Mystery, Sports & Cooking', description: 'A blend of the mystery, sports, and cooking themes' },
  { id: 'mystery-sports-fashion', label: 'Mystery, Sports & Fashion', description: 'A blend of the mystery, sports, and fashion themes' },
  { id: 'mystery-sports-pirates', label: 'Mystery, Sports & Pirates', description: 'A blend of the mystery, sports, and pirates themes' },
  { id: 'neon-bamboo-grove', label: 'Neon bamboo grove', description: 'A bamboo forest lit by glowing neon lights of a future city' },
  { id: 'ninja-dojo', label: 'Ninja dojo', description: 'A hidden ninja dojo with training dummies and paper lanterns' },
  { id: 'ocean-shore', label: 'Ocean shore', description: 'A sandy beach along the ocean shore' },
  { id: 'outer-space', label: 'Outer space', description: 'Deep outer space with stars and planets' },
  { id: 'pirate-asteroid-port', label: 'Pirate asteroid port', description: 'A pirate ship docked at a port on a floating asteroid in space' },
  { id: 'pirate-captain-cabin', label: 'Pirate captain\'s cabin', description: 'A pirate captain\'s cabin with sea charts, a lantern, a spyglass, and a treasure chest' },
  { id: 'pirate-cove', label: 'Pirate cove', description: 'A hidden pirate cove with an anchored galleon, palm trees, and barrels' },
  { id: 'pirate-fort', label: 'Pirate fort', description: 'A stone island fort flying pirate flags above the crashing sea' },
  { id: 'pirate-island-market', label: 'Pirate island market', description: 'A bustling pirate port market on a tropical island' },
  { id: 'pirate-jungle-camp', label: 'Pirate jungle camp', description: 'A hidden pirate camp of tents and torches deep in the jungle' },
  { id: 'pirate-lagoon', label: 'Pirate lagoon', description: 'A calm tropical lagoon with a pirate ship anchored near jungle cliffs' },
  { id: 'pirate-ship-deck', label: 'Pirate ship deck', description: 'The wooden deck of a sailing pirate ship' },
  { id: 'pirate-shipwreck', label: 'Pirate shipwreck', description: 'A weathered pirate galleon shipwreck half-buried on a sandy beach' },
  { id: 'pirate-tavern', label: 'Pirate tavern', description: 'A lively seaside pirate tavern with hanging lanterns, barrels, and wooden tables' },
  { id: 'pirate-treasure-cave', label: 'Pirate treasure cave', description: 'A pirate cave piled with gold coins and jeweled chests by the sea' },
  { id: 'pirate-volcano-cove', label: 'Pirate volcano cove', description: 'A pirate ship anchored in a cove beside a smoking volcano' },
  { id: 'pirates-cooking', label: 'Pirates & Cooking', description: 'A blend of the pirates and cooking themes' },
  { id: 'pirates-cooking-fashion', label: 'Pirates, Cooking & Fashion', description: 'A blend of the pirates, cooking, and fashion themes' },
  { id: 'pirates-fashion', label: 'Pirates & Fashion', description: 'A blend of the pirates and fashion themes' },
  { id: 'pizza-shop', label: 'Pizza shop', description: 'A cozy pizzeria with a brick oven and checkered tables' },
  { id: 'planetarium', label: 'Planetarium', description: 'A planetarium dome projecting glowing stars and planets' },
  { id: 'race-track', label: 'Race track', description: 'A motor racing track with curves, grandstands, and start lights' },
  { id: 'rainbow-falls', label: 'Rainbow falls', description: 'A magical waterfall cascading in shimmering rainbow colors' },
  { id: 'recording-studio', label: 'Recording studio', description: 'A cozy music recording studio with a mixing board and mics' },
  { id: 'restaurant-kitchen', label: 'Restaurant kitchen', description: 'A busy restaurant kitchen with gleaming steel cooking stations, hanging pots, and cookware' },
  { id: 'river-bank', label: 'River bank', description: 'The grassy bank of a flowing river' },
  { id: 'robot-city', label: 'Robot city', description: 'A sleek city of robots and glowing neon skyscrapers' },
  { id: 'robot-farm', label: 'Robot farm', description: 'Friendly robots tending rows of crops on a sunny farm' },
  { id: 'robot-lab', label: 'Robot lab', description: 'A high-tech robotics laboratory full of machines and screens' },
  { id: 'rolling-hills', label: 'Rolling hills', description: 'Green rolling grassy hills under a bright blue sky' },
  { id: 'safari-animals', label: 'Safari animals', description: 'A group of wild animals grazing on the open savanna' },
  { id: 'samurai-castle', label: 'Samurai castle', description: 'A Japanese samurai castle among blooming cherry blossoms' },
  { id: 'savanna-plains', label: 'Savanna plains', description: 'A wide golden savanna with scattered acacia trees' },
  { id: 'savanna-spaceport', label: 'Savanna spaceport', description: 'A rocket launch pad on the open African savanna at dusk' },
  { id: 'science-lab', label: 'Science lab', description: 'A science laboratory with beakers, flasks, and microscopes' },
  { id: 'sewing-studio', label: 'Sewing studio', description: 'A fashion design sewing studio with dress forms, patterns, fabric, and outfits' },
  { id: 'shoe-boutique', label: 'Shoe boutique', description: 'A stylish fashion shoe boutique with shelves of designer shoes and handbags' },
  { id: 'skate-park', label: 'Skate park', description: 'A concrete skate park with ramps, rails, and a half-pipe' },
  { id: 'ski-slope', label: 'Ski slope', description: 'A snowy ski slope with chairlifts and pine trees' },
  { id: 'sky-ruins', label: 'Sky ruins', description: 'Crumbling ancient ruins on green islands floating in the clouds' },
  { id: 'snowy-harbor', label: 'Snowy harbor', description: 'A harbor of docks and boats covered in heavy snow and ice' },
  { id: 'snowy-mountain', label: 'Snowy mountain', description: 'A tall snow-covered mountain peak' },
  { id: 'snowy-temple', label: 'Snowy temple', description: 'A grand ancient Greek temple half-buried in snow on a mountain peak' },
  { id: 'soccer-field', label: 'Soccer field', description: 'A green soccer field with goals in an open stadium' },
  { id: 'space-animals', label: 'Space & Animals', description: 'A blend of the space and animals themes' },
  { id: 'space-animals-cooking', label: 'Space, Animals & Cooking', description: 'A blend of the space, animals, and cooking themes' },
  { id: 'space-animals-fashion', label: 'Space, Animals & Fashion', description: 'A blend of the space, animals, and fashion themes' },
  { id: 'space-animals-pirates', label: 'Space, Animals & Pirates', description: 'A blend of the space, animals, and pirates themes' },
  { id: 'space-bazaar', label: 'Space bazaar', description: 'A busy alien market bazaar aboard a starlit space station' },
  { id: 'space-castle', label: 'Space castle', description: 'A medieval castle with towers floating among stars and planets' },
  { id: 'space-concert', label: 'Space concert', description: 'A glowing concert stage floating in outer space among stars' },
  { id: 'space-cooking', label: 'Space & Cooking', description: 'A blend of the space and cooking themes' },
  { id: 'space-cooking-fashion', label: 'Space, Cooking & Fashion', description: 'A blend of the space, cooking, and fashion themes' },
  { id: 'space-fantasy', label: 'Space & Fantasy', description: 'A blend of the space and fantasy themes' },
  { id: 'space-fantasy-animals', label: 'Space, Fantasy & Animals', description: 'A blend of the space, fantasy, and animals themes' },
  { id: 'space-fantasy-cooking', label: 'Space, Fantasy & Cooking', description: 'A blend of the space, fantasy, and cooking themes' },
  { id: 'space-fantasy-fashion', label: 'Space, Fantasy & Fashion', description: 'A blend of the space, fantasy, and fashion themes' },
  { id: 'space-fantasy-mystery', label: 'Space, Fantasy & Mystery', description: 'A blend of the space, fantasy, and mystery themes' },
  { id: 'space-fantasy-pirates', label: 'Space, Fantasy & Pirates', description: 'A blend of the space, fantasy, and pirates themes' },
  { id: 'space-fantasy-sports', label: 'Space, Fantasy & Sports', description: 'A blend of the space, fantasy, and sports themes' },
  { id: 'space-farm', label: 'Space farm', description: 'A farm with barns and fields on a platform floating in outer space' },
  { id: 'space-fashion', label: 'Space & Fashion', description: 'A blend of the space and fashion themes' },
  { id: 'space-kitchen', label: 'Space kitchen', description: 'A cooking galley kitchen aboard a spaceship with a window to the stars' },
  { id: 'space-mystery', label: 'Space & Mystery', description: 'A blend of the space and mystery themes' },
  { id: 'space-mystery-animals', label: 'Space, Mystery & Animals', description: 'A blend of the space, mystery, and animals themes' },
  { id: 'space-mystery-cooking', label: 'Space, Mystery & Cooking', description: 'A blend of the space, mystery, and cooking themes' },
  { id: 'space-mystery-fashion', label: 'Space, Mystery & Fashion', description: 'A blend of the space, mystery, and fashion themes' },
  { id: 'space-mystery-pirates', label: 'Space, Mystery & Pirates', description: 'A blend of the space, mystery, and pirates themes' },
  { id: 'space-mystery-sports', label: 'Space, Mystery & Sports', description: 'A blend of the space, mystery, and sports themes' },
  { id: 'space-pirates', label: 'Space & Pirates', description: 'A blend of the space and pirates themes' },
  { id: 'space-pirates-cooking', label: 'Space, Pirates & Cooking', description: 'A blend of the space, pirates, and cooking themes' },
  { id: 'space-pirates-fashion', label: 'Space, Pirates & Fashion', description: 'A blend of the space, pirates, and fashion themes' },
  { id: 'space-runway', label: 'Space runway', description: 'A glamorous fashion runway aboard a space station with stars outside' },
  { id: 'space-sports', label: 'Space & Sports', description: 'A blend of the space and sports themes' },
  { id: 'space-sports-animals', label: 'Space, Sports & Animals', description: 'A blend of the space, sports, and animals themes' },
  { id: 'space-sports-cooking', label: 'Space, Sports & Cooking', description: 'A blend of the space, sports, and cooking themes' },
  { id: 'space-sports-fashion', label: 'Space, Sports & Fashion', description: 'A blend of the space, sports, and fashion themes' },
  { id: 'space-sports-pirates', label: 'Space, Sports & Pirates', description: 'A blend of the space, sports, and pirates themes' },
  { id: 'space-station', label: 'Space station', description: 'The interior of a futuristic space station' },
  { id: 'space-station-exterior', label: 'Space station exterior', description: 'The exterior of a space station with solar panels orbiting a planet among the stars' },
  { id: 'space-zoo', label: 'Space zoo', description: 'A zoo of alien creatures in glowing glass habitats on a space station' },
  { id: 'spaceship-bridge', label: 'Spaceship bridge', description: 'The command bridge of a futuristic spaceship with glowing control panels and a viewscreen of stars' },
  { id: 'spaceship-corridor', label: 'Spaceship corridor', description: 'A sleek sci-fi spaceship corridor lined with glowing panels and round airlock doors' },
  { id: 'spooky-attic', label: 'Spooky attic', description: 'A spooky dusty attic full of old trunks, cobwebs, draped sheets, and moonlight' },
  { id: 'sports-animals', label: 'Sports & Animals', description: 'A blend of the sports and animals themes' },
  { id: 'sports-animals-cooking', label: 'Sports, Animals & Cooking', description: 'A blend of the sports, animals, and cooking themes' },
  { id: 'sports-animals-fashion', label: 'Sports, Animals & Fashion', description: 'A blend of the sports, animals, and fashion themes' },
  { id: 'sports-animals-pirates', label: 'Sports, Animals & Pirates', description: 'A blend of the sports, animals, and pirates themes' },
  { id: 'sports-cooking', label: 'Sports & Cooking', description: 'A blend of the sports and cooking themes' },
  { id: 'sports-cooking-fashion', label: 'Sports, Cooking & Fashion', description: 'A blend of the sports, cooking, and fashion themes' },
  { id: 'sports-fashion', label: 'Sports & Fashion', description: 'A blend of the sports and fashion themes' },
  { id: 'sports-pirates', label: 'Sports & Pirates', description: 'A blend of the sports and pirates themes' },
  { id: 'sports-pirates-cooking', label: 'Sports, Pirates & Cooking', description: 'A blend of the sports, pirates, and cooking themes' },
  { id: 'sports-pirates-fashion', label: 'Sports, Pirates & Fashion', description: 'A blend of the sports, pirates, and fashion themes' },
  { id: 'sports-stadium', label: 'Sports stadium', description: 'A large sports stadium with a green field and packed stands' },
  { id: 'starry-campsite', label: 'Starry campsite', description: 'A campsite under a starry night sky' },
  { id: 'steampunk-city', label: 'Steampunk city', description: 'A brass-and-gear steampunk city with flying airships' },
  { id: 'stormy-sea', label: 'Stormy sea', description: 'A rough stormy sea with tall crashing waves under dark clouds' },
  { id: 'sushi-bar', label: 'Sushi bar', description: 'A sushi restaurant counter with bamboo mats, fresh ingredients, and plates of sushi' },
  { id: 'swamp-marsh', label: 'Swamp marsh', description: 'A misty swamp marsh with murky water' },
  { id: 'swimming-pool', label: 'Swimming pool', description: 'An indoor competition swimming pool with marked lanes' },
  { id: 'tailor-shop', label: 'Tailor shop', description: 'A cozy tailor\'s shop with sewing machines, bolts of fabric, and a dress form' },
  { id: 'tennis-court', label: 'Tennis court', description: 'An outdoor tennis court with a net and green clay surface' },
  { id: 'toy-store', label: 'Toy store', description: 'A bright toy store with shelves full of colorful toys' },
  { id: 'train-station', label: 'Train station', description: 'The grand interior of an old train station' },
  { id: 'train-yard', label: 'Train yard', description: 'A railway yard full of colorful trains and tracks' },
  { id: 'treasure-island', label: 'Treasure island', description: 'A sandy pirate treasure island with palm trees, a rocky cove, and a buried treasure map' },
  { id: 'treehouse-village', label: 'Treehouse village', description: 'A village of treehouses linked by rope bridges in tall trees' },
  { id: 'tropical-beach', label: 'Tropical beach', description: 'A palm-lined tropical beach with turquoise water and white sand' },
  { id: 'underwater-castle', label: 'Underwater castle', description: 'A grand castle deep beneath the sea surrounded by fish' },
  { id: 'underwater-city', label: 'Underwater city', description: 'A glowing city of towers and domes deep under the sea' },
  { id: 'underwater-farm', label: 'Underwater farm', description: 'An underwater kelp farm with rows of glowing sea plants' },
  { id: 'underwater-reef', label: 'Underwater reef', description: 'A colorful coral reef deep underwater' },
  { id: 'underwater-stadium', label: 'Underwater stadium', description: 'A sports stadium inside a glass dome on the ocean floor' },
  { id: 'underwater-volcano', label: 'Underwater volcano', description: 'An erupting volcano glowing with lava on the deep ocean floor' },
  { id: 'unicorn-meadow', label: 'Unicorn meadow', description: 'A sunny flower meadow with unicorns and a bright rainbow' },
  { id: 'viking-longship', label: 'Viking longship', description: 'A viking longship with a striped sail on a cold northern sea' },
  { id: 'village-square', label: 'Village square', description: 'The central square of a small village' },
  { id: 'volcano-crater', label: 'Volcano crater', description: 'The crater of a smoking volcano' },
  { id: 'volcano-spaceport', label: 'Volcano spaceport', description: 'A rocket spaceport built inside a smoking volcanic crater' },
  { id: 'waterfall-valley', label: 'Waterfall valley', description: 'A tall waterfall cascading down cliffs into a lush green valley' },
  { id: 'wild-west-town', label: 'Wild west town', description: 'A dusty wild west frontier town main street' },
  { id: 'windmill-fields', label: 'Windmill fields', description: 'Open countryside fields with windmills' },
  { id: 'windmill-village', label: 'Windmill village', description: 'A village of windmills among colorful tulip fields' },
  { id: 'witch-hut', label: 'Witch hut', description: 'A creepy witch\'s hut on stilts in dark twisted woods' },
  { id: 'wizard-arena', label: 'Wizard arena', description: 'A magical glowing sports arena beside a tall wizard tower' },
  { id: 'wizard-kitchen', label: 'Wizard kitchen', description: 'A cozy kitchen full of bubbling potions inside a wizard tower' },
  { id: 'wizard-library', label: 'Wizard library', description: 'A towering wizard library of glowing floating spellbooks' },
  { id: 'wizard-observatory', label: 'Wizard observatory', description: 'A wizard observatory with a giant brass telescope under the stars' },
  { id: 'wizard-tower', label: 'Wizard tower', description: 'The cluttered interior study of a tall wizard\'s tower' },
  { id: 'zero-gravity-arena', label: 'Zero-gravity arena', description: 'A futuristic sports arena where the court floats in zero gravity' },
  { id: 'zoo-entrance', label: 'Zoo entrance', description: 'A colorful zoo entrance with arches and animal statues' },
  { id: 'animals-cooking-2', label: 'Animals & Cooking', description: 'A blend of the animals and cooking themes' },
  { id: 'animals-cooking-3', label: 'Animals & Cooking', description: 'A blend of the animals and cooking themes' },
  { id: 'animals-cooking-fashion-2', label: 'Animals & Cooking & Fashion', description: 'A blend of the animals, cooking, and fashion themes' },
  { id: 'animals-fashion-2', label: 'Animals & Fashion', description: 'A blend of the animals and fashion themes' },
  { id: 'animals-fashion-3', label: 'Animals & Fashion', description: 'A blend of the animals and fashion themes' },
  { id: 'animals-fashion-4', label: 'Animals & Fashion', description: 'A blend of the animals and fashion themes' },
  { id: 'animals-pirates-2', label: 'Animals & Pirates', description: 'A blend of the animals and pirates themes' },
  { id: 'animals-pirates-3', label: 'Animals & Pirates', description: 'A blend of the animals and pirates themes' },
  { id: 'animals-pirates-4', label: 'Animals & Pirates', description: 'A blend of the animals and pirates themes' },
  { id: 'animals-pirates-cooking-2', label: 'Animals & Pirates & Cooking', description: 'A blend of the animals, pirates, and cooking themes' },
  { id: 'animals-pirates-fashion-2', label: 'Animals & Pirates & Fashion', description: 'A blend of the animals, pirates, and fashion themes' },
  { id: 'cooking-fashion-2', label: 'Cooking & Fashion', description: 'A blend of the cooking and fashion themes' },
  { id: 'cooking-fashion-3', label: 'Cooking & Fashion', description: 'A blend of the cooking and fashion themes' },
  { id: 'cooking-fashion-4', label: 'Cooking & Fashion', description: 'A blend of the cooking and fashion themes' },
  { id: 'fantasy-animals-cooking-2', label: 'Fantasy & Animals & Cooking', description: 'A blend of the fantasy, animals, and cooking themes' },
  { id: 'fantasy-animals-fashion-2', label: 'Fantasy & Animals & Fashion', description: 'A blend of the fantasy, animals, and fashion themes' },
  { id: 'fantasy-animals-pirates-2', label: 'Fantasy & Animals & Pirates', description: 'A blend of the fantasy, animals, and pirates themes' },
  { id: 'fantasy-cooking-fashion-2', label: 'Fantasy & Cooking & Fashion', description: 'A blend of the fantasy, cooking, and fashion themes' },
  { id: 'fantasy-fashion-2', label: 'Fantasy & Fashion', description: 'A blend of the fantasy and fashion themes' },
  { id: 'fantasy-fashion-3', label: 'Fantasy & Fashion', description: 'A blend of the fantasy and fashion themes' },
  { id: 'fantasy-fashion-4', label: 'Fantasy & Fashion', description: 'A blend of the fantasy and fashion themes' },
  { id: 'fantasy-mystery-2', label: 'Fantasy & Mystery', description: 'A blend of the fantasy and mystery themes' },
  { id: 'fantasy-mystery-3', label: 'Fantasy & Mystery', description: 'A blend of the fantasy and mystery themes' },
  { id: 'fantasy-mystery-animals-2', label: 'Fantasy & Mystery & Animals', description: 'A blend of the fantasy, mystery, and animals themes' },
  { id: 'fantasy-mystery-cooking-2', label: 'Fantasy & Mystery & Cooking', description: 'A blend of the fantasy, mystery, and cooking themes' },
  { id: 'fantasy-mystery-fashion-2', label: 'Fantasy & Mystery & Fashion', description: 'A blend of the fantasy, mystery, and fashion themes' },
  { id: 'fantasy-mystery-pirates-2', label: 'Fantasy & Mystery & Pirates', description: 'A blend of the fantasy, mystery, and pirates themes' },
  { id: 'fantasy-mystery-sports-2', label: 'Fantasy & Mystery & Sports', description: 'A blend of the fantasy, mystery, and sports themes' },
  { id: 'fantasy-pirates-2', label: 'Fantasy & Pirates', description: 'A blend of the fantasy and pirates themes' },
  { id: 'fantasy-pirates-3', label: 'Fantasy & Pirates', description: 'A blend of the fantasy and pirates themes' },
  { id: 'fantasy-pirates-cooking-2', label: 'Fantasy & Pirates & Cooking', description: 'A blend of the fantasy, pirates, and cooking themes' },
  { id: 'fantasy-pirates-fashion-2', label: 'Fantasy & Pirates & Fashion', description: 'A blend of the fantasy, pirates, and fashion themes' },
  { id: 'fantasy-sports-animals-2', label: 'Fantasy & Sports & Animals', description: 'A blend of the fantasy, sports, and animals themes' },
  { id: 'fantasy-sports-cooking-2', label: 'Fantasy & Sports & Cooking', description: 'A blend of the fantasy, sports, and cooking themes' },
  { id: 'fantasy-sports-fashion-2', label: 'Fantasy & Sports & Fashion', description: 'A blend of the fantasy, sports, and fashion themes' },
  { id: 'fantasy-sports-pirates-2', label: 'Fantasy & Sports & Pirates', description: 'A blend of the fantasy, sports, and pirates themes' },
  { id: 'mystery-animals-2', label: 'Mystery & Animals', description: 'A blend of the mystery and animals themes' },
  { id: 'mystery-animals-3', label: 'Mystery & Animals', description: 'A blend of the mystery and animals themes' },
  { id: 'mystery-animals-cooking-2', label: 'Mystery & Animals & Cooking', description: 'A blend of the mystery, animals, and cooking themes' },
  { id: 'mystery-animals-fashion-2', label: 'Mystery & Animals & Fashion', description: 'A blend of the mystery, animals, and fashion themes' },
  { id: 'mystery-animals-pirates-2', label: 'Mystery & Animals & Pirates', description: 'A blend of the mystery, animals, and pirates themes' },
  { id: 'mystery-cooking-2', label: 'Mystery & Cooking', description: 'A blend of the mystery and cooking themes' },
  { id: 'mystery-cooking-3', label: 'Mystery & Cooking', description: 'A blend of the mystery and cooking themes' },
  { id: 'mystery-cooking-fashion-2', label: 'Mystery & Cooking & Fashion', description: 'A blend of the mystery, cooking, and fashion themes' },
  { id: 'mystery-fashion-2', label: 'Mystery & Fashion', description: 'A blend of the mystery and fashion themes' },
  { id: 'mystery-fashion-3', label: 'Mystery & Fashion', description: 'A blend of the mystery and fashion themes' },
  { id: 'mystery-fashion-4', label: 'Mystery & Fashion', description: 'A blend of the mystery and fashion themes' },
  { id: 'mystery-pirates-2', label: 'Mystery & Pirates', description: 'A blend of the mystery and pirates themes' },
  { id: 'mystery-pirates-3', label: 'Mystery & Pirates', description: 'A blend of the mystery and pirates themes' },
  { id: 'mystery-pirates-4', label: 'Mystery & Pirates', description: 'A blend of the mystery and pirates themes' },
  { id: 'mystery-pirates-cooking-2', label: 'Mystery & Pirates & Cooking', description: 'A blend of the mystery, pirates, and cooking themes' },
  { id: 'mystery-pirates-fashion-2', label: 'Mystery & Pirates & Fashion', description: 'A blend of the mystery, pirates, and fashion themes' },
  { id: 'mystery-sports-2', label: 'Mystery & Sports', description: 'A blend of the mystery and sports themes' },
  { id: 'mystery-sports-3', label: 'Mystery & Sports', description: 'A blend of the mystery and sports themes' },
  { id: 'mystery-sports-4', label: 'Mystery & Sports', description: 'A blend of the mystery and sports themes' },
  { id: 'mystery-sports-animals-2', label: 'Mystery & Sports & Animals', description: 'A blend of the mystery, sports, and animals themes' },
  { id: 'mystery-sports-cooking-2', label: 'Mystery & Sports & Cooking', description: 'A blend of the mystery, sports, and cooking themes' },
  { id: 'mystery-sports-fashion-2', label: 'Mystery & Sports & Fashion', description: 'A blend of the mystery, sports, and fashion themes' },
  { id: 'mystery-sports-pirates-2', label: 'Mystery & Sports & Pirates', description: 'A blend of the mystery, sports, and pirates themes' },
  { id: 'pirates-cooking-2', label: 'Pirates & Cooking', description: 'A blend of the pirates and cooking themes' },
  { id: 'pirates-cooking-3', label: 'Pirates & Cooking', description: 'A blend of the pirates and cooking themes' },
  { id: 'pirates-cooking-4', label: 'Pirates & Cooking', description: 'A blend of the pirates and cooking themes' },
  { id: 'pirates-cooking-fashion-2', label: 'Pirates & Cooking & Fashion', description: 'A blend of the pirates, cooking, and fashion themes' },
  { id: 'pirates-fashion-2', label: 'Pirates & Fashion', description: 'A blend of the pirates and fashion themes' },
  { id: 'pirates-fashion-3', label: 'Pirates & Fashion', description: 'A blend of the pirates and fashion themes' },
  { id: 'pirates-fashion-4', label: 'Pirates & Fashion', description: 'A blend of the pirates and fashion themes' },
  { id: 'space-animals-cooking-2', label: 'Space & Animals & Cooking', description: 'A blend of the space, animals, and cooking themes' },
  { id: 'space-animals-fashion-2', label: 'Space & Animals & Fashion', description: 'A blend of the space, animals, and fashion themes' },
  { id: 'space-animals-pirates-2', label: 'Space & Animals & Pirates', description: 'A blend of the space, animals, and pirates themes' },
  { id: 'space-cooking-2', label: 'Space & Cooking', description: 'A blend of the space and cooking themes' },
  { id: 'space-cooking-3', label: 'Space & Cooking', description: 'A blend of the space and cooking themes' },
  { id: 'space-cooking-fashion-2', label: 'Space & Cooking & Fashion', description: 'A blend of the space, cooking, and fashion themes' },
  { id: 'space-fantasy-cooking-2', label: 'Space & Fantasy & Cooking', description: 'A blend of the space, fantasy, and cooking themes' },
  { id: 'space-fantasy-fashion-2', label: 'Space & Fantasy & Fashion', description: 'A blend of the space, fantasy, and fashion themes' },
  { id: 'space-fantasy-mystery-2', label: 'Space & Fantasy & Mystery', description: 'A blend of the space, fantasy, and mystery themes' },
  { id: 'space-fantasy-sports-2', label: 'Space & Fantasy & Sports', description: 'A blend of the space, fantasy, and sports themes' },
  { id: 'space-fashion-2', label: 'Space & Fashion', description: 'A blend of the space and fashion themes' },
  { id: 'space-fashion-3', label: 'Space & Fashion', description: 'A blend of the space and fashion themes' },
  { id: 'space-mystery-2', label: 'Space & Mystery', description: 'A blend of the space and mystery themes' },
  { id: 'space-mystery-animals-2', label: 'Space & Mystery & Animals', description: 'A blend of the space, mystery, and animals themes' },
  { id: 'space-mystery-cooking-2', label: 'Space & Mystery & Cooking', description: 'A blend of the space, mystery, and cooking themes' },
  { id: 'space-mystery-fashion-2', label: 'Space & Mystery & Fashion', description: 'A blend of the space, mystery, and fashion themes' },
  { id: 'space-mystery-pirates-2', label: 'Space & Mystery & Pirates', description: 'A blend of the space, mystery, and pirates themes' },
  { id: 'space-mystery-sports-2', label: 'Space & Mystery & Sports', description: 'A blend of the space, mystery, and sports themes' },
  { id: 'space-pirates-2', label: 'Space & Pirates', description: 'A blend of the space and pirates themes' },
  { id: 'space-pirates-3', label: 'Space & Pirates', description: 'A blend of the space and pirates themes' },
  { id: 'space-pirates-4', label: 'Space & Pirates', description: 'A blend of the space and pirates themes' },
  { id: 'space-pirates-cooking-2', label: 'Space & Pirates & Cooking', description: 'A blend of the space, pirates, and cooking themes' },
  { id: 'space-pirates-fashion-2', label: 'Space & Pirates & Fashion', description: 'A blend of the space, pirates, and fashion themes' },
  { id: 'space-sports-2', label: 'Space & Sports', description: 'A blend of the space and sports themes' },
  { id: 'space-sports-3', label: 'Space & Sports', description: 'A blend of the space and sports themes' },
  { id: 'space-sports-animals-2', label: 'Space & Sports & Animals', description: 'A blend of the space, sports, and animals themes' },
  { id: 'space-sports-cooking-2', label: 'Space & Sports & Cooking', description: 'A blend of the space, sports, and cooking themes' },
  { id: 'space-sports-fashion-2', label: 'Space & Sports & Fashion', description: 'A blend of the space, sports, and fashion themes' },
  { id: 'space-sports-pirates-2', label: 'Space & Sports & Pirates', description: 'A blend of the space, sports, and pirates themes' },
  { id: 'sports-animals-2', label: 'Sports & Animals', description: 'A blend of the sports and animals themes' },
  { id: 'sports-animals-3', label: 'Sports & Animals', description: 'A blend of the sports and animals themes' },
  { id: 'sports-animals-cooking-2', label: 'Sports & Animals & Cooking', description: 'A blend of the sports, animals, and cooking themes' },
  { id: 'sports-animals-fashion-2', label: 'Sports & Animals & Fashion', description: 'A blend of the sports, animals, and fashion themes' },
  { id: 'sports-animals-pirates-2', label: 'Sports & Animals & Pirates', description: 'A blend of the sports, animals, and pirates themes' },
  { id: 'sports-cooking-2', label: 'Sports & Cooking', description: 'A blend of the sports and cooking themes' },
  { id: 'sports-cooking-3', label: 'Sports & Cooking', description: 'A blend of the sports and cooking themes' },
  { id: 'sports-cooking-fashion-2', label: 'Sports & Cooking & Fashion', description: 'A blend of the sports, cooking, and fashion themes' },
  { id: 'sports-fashion-2', label: 'Sports & Fashion', description: 'A blend of the sports and fashion themes' },
  { id: 'sports-fashion-3', label: 'Sports & Fashion', description: 'A blend of the sports and fashion themes' },
  { id: 'sports-fashion-4', label: 'Sports & Fashion', description: 'A blend of the sports and fashion themes' },
  { id: 'sports-pirates-2', label: 'Sports & Pirates', description: 'A blend of the sports and pirates themes' },
  { id: 'sports-pirates-3', label: 'Sports & Pirates', description: 'A blend of the sports and pirates themes' },
  { id: 'sports-pirates-4', label: 'Sports & Pirates', description: 'A blend of the sports and pirates themes' },
  { id: 'sports-pirates-cooking-2', label: 'Sports & Pirates & Cooking', description: 'A blend of the sports, pirates, and cooking themes' },
  { id: 'sports-pirates-fashion-2', label: 'Sports & Pirates & Fashion', description: 'A blend of the sports, pirates, and fashion themes' },
] as const

const BY_ID = new Map<SceneId, SceneEntry>(SCENERY_CATALOG.map((entry) => [entry.id, entry]))

// Every catalog id, handy for prompts and tests.
export const SCENE_IDS: readonly SceneId[] = SCENERY_CATALOG.map((entry) => entry.id)

// The literal string the model returns when no image fits the scene (kept here so the prompt
// builder and the parser agree on it).
export const NO_SCENE = 'none'

// Type guard: true only for an id that exists in the catalog (and therefore has a real asset).
export const isSceneId = (value: unknown): value is SceneId =>
  typeof value === 'string' && BY_ID.has(value as SceneId)

// Coerce arbitrary (model/persisted) input to a known SceneId, or null. Trims surrounding
// whitespace/quotes and lowercases so minor model formatting differences still match.
export const coerceSceneId = (value: unknown): SceneId | null => {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().replace(/^["'`]+|["'`]+$/g, '').trim().toLowerCase()
  return isSceneId(cleaned) ? cleaned : null
}

// The public asset path for a scene image. The app deploys at the site root, so a leading-slash
// absolute path resolves in both `vite dev` and the Firebase Hosting deploy. Assets are WebP
// (resized + re-encoded from the source art by `scripts/optimize-scenery.mjs`) to keep the deploy
// and per-image transfer small.
export const scenerySrc = (id: SceneId): string => `/scenery/${id}.webp`

// The human label / setting description for a known id (empty string for an unknown id so
// callers never render "undefined").
export const getSceneLabel = (id: SceneId): string => BY_ID.get(id)?.label ?? ''
export const getSceneDescription = (id: SceneId): string => BY_ID.get(id)?.description ?? ''

// A theme-appropriate DEFAULT scene for a set of chosen interests. Used for the OFFLINE fallback
// beats (when the AI — including the scene matcher — is unavailable) so a fallback chapter still
// shows a fitting background instead of rendering image-less. Maps the first recognized interest to
// a catalog scene, with a neutral, always-valid default. Every value is a real catalog id.
const DEFAULT_SCENE_BY_INTEREST: Record<StoryInterestId, SceneId> = {
  space: 'outer-space',
  fantasy: 'enchanted-forest',
  mystery: 'city-skyline',
  sports: 'sports-stadium',
  animals: 'safari-animals',
  pirates: 'pirate-ship-deck',
  cooking: 'cozy-kitchen',
  fashion: 'fashion-runway',
}

// Tiny stop-word list so common joiner words in an interest label ("Mystery & detectives",
// "Cooking and baking") never become scoring terms.
const SCENE_TERM_STOP_WORDS = new Set(['and', 'the', 'with', 'for', 'of', 'a', 'an'])

// Split a phrase into lowercased word tokens worth matching on (drops tiny/joiner words).
const toSceneTerms = (phrase: string): string[] =>
  phrase
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !SCENE_TERM_STOP_WORDS.has(word))

// All scoring TERMS for a theme: the learner's freeform words PLUS, for each chosen preset interest,
// the words of its id and human label (from interests.ts). A crude singular stem of each plural term
// is added too so a plural like "pirates"/"animals" still matches a "pirate ship"/"farm animal"
// scene. Deduped. Pure + deterministic so the scorer (and tests) are stable.
const interestTermsForTheme = (theme: Pick<StoryTheme, 'interestIds' | 'freeformInterest'>): string[] => {
  const terms = new Set<string>()
  const add = (word: string): void => {
    if (word.length < 3) return
    terms.add(word)
    if (word.length > 3 && word.endsWith('s')) terms.add(word.slice(0, -1))
  }
  for (const word of toSceneTerms(theme.freeformInterest ?? '')) add(word)
  for (const id of theme.interestIds) {
    add(id)
    for (const word of toSceneTerms(getInterestLabel(id))) add(word)
  }
  return [...terms]
}

// --- Interest scene pools (the IN-interest sets the distribution draws from) -----------------

// Keyword fingerprints for each SUGGESTED (preset) interest — a curated, BROADER vocabulary than the
// bare id/label terms, so a scene that is THEMATICALLY tied to an interest (e.g. "alien-planet" ->
// space, "dragon-lair" -> fantasy, "soccer-field" -> sports, "bakery-shop" -> cooking) is recognized
// as reachable from that interest even when it does not literally contain the interest's name. Each
// entry is a lowercased substring matched against a scene's id + label + description. Shared by BOTH
// the in-interest pool (scenesForInterests) and the off-interest pool (OFF_INTEREST_SCENES below).
const SUGGESTED_INTEREST_KEYWORDS: Record<StoryInterestId, readonly string[]> = {
  space: ['space', 'sci-fi', 'alien', 'planet', 'moon', 'asteroid', 'rocket', 'spaceship', 'spaceport', 'galaxy', 'cosmic', 'orbit', 'robot', 'android', 'futuristic', 'cyber', 'neon', 'steampunk', 'observatory', 'planetarium', 'zero-gravity'],
  fantasy: ['fantasy', 'dragon', 'wizard', 'witch', 'fairy', 'magic', 'enchant', 'castle', 'crystal', 'mushroom', 'unicorn', 'mermaid', 'knight', 'rune', 'spell', 'floating', 'cloud', 'palace', 'rainbow', 'fortress', 'goblin', 'gnome', 'troll'],
  mystery: ['mystery', 'detective', 'haunted', 'ghost', 'graveyard', 'spooky', 'foggy', 'eerie', 'creepy', 'abandoned', 'dungeon', 'noir', 'clue'],
  sports: ['sport', 'stadium', 'soccer', 'basketball', 'baseball', 'tennis', 'bowling', 'skate', 'ski-', 'ski ', 'racing', 'race-track', 'race track', 'arena', 'rink', 'hockey', 'olympic', 'court'],
  animals: ['animal', 'wildlife', 'safari', 'zoo', 'dog', 'horse', 'stable', 'butterfly', 'dino', 'dinosaur', 'farm', 'barn', 'aquarium', 'reef', 'fish', 'puppy', 'kitten'],
  pirates: ['pirate', 'treasure', 'galleon', 'buccaneer'],
  cooking: ['cooking', 'baking', 'bakery', 'kitchen', 'candy', 'pizza', 'ice cream', 'ice-cream', 'chef', 'pastry', 'treat', 'bread', 'dessert', 'cafe', 'restaurant', 'sweets', 'farmers'],
  fashion: ['fashion', 'design', 'runway', 'outfit', 'gown', 'couture', 'boutique', 'catwalk', 'tailor'],
}

// The BROAD keyword fingerprint for a theme: every SUGGESTED_INTEREST_KEYWORDS keyword for each
// chosen preset interest, PLUS the learner's freeform words (with the SAME crude singular stem used
// by interestTermsForTheme, so "dragons" still matches a "dragon" scene). Deduped. Used to gather the
// POOL of scenes thematically tied to the chosen interests — a richer match than the literal id/label
// scoring in interestTermsForTheme (e.g. "fantasy" reaches dragon/wizard/fairy scenes here, but 0 of
// them literally). Pure + deterministic.
const interestKeywordsForTheme = (theme: Pick<StoryTheme, 'interestIds' | 'freeformInterest'>): string[] => {
  const terms = new Set<string>()
  const add = (word: string): void => {
    if (word.length < 3) return
    terms.add(word)
    if (word.length > 3 && word.endsWith('s')) terms.add(word.slice(0, -1))
  }
  for (const word of toSceneTerms(theme.freeformInterest ?? '')) add(word)
  for (const id of theme.interestIds) {
    for (const keyword of SUGGESTED_INTEREST_KEYWORDS[id] ?? []) terms.add(keyword)
  }
  return [...terms]
}

// The generic "blend-combo" tiles depict MULTIPLE interests at once (their description begins with
// "A blend of ...", e.g. `cooking-fashion`). They are excluded from a SINGLE chosen interest's pool
// so one interest prefers PURE single-topic scenes instead of combo art mixing in interests the
// learner did not pick. (For a set of 2+ interests the combos ARE on-theme and stay in the pool.)
const BLEND_COMBO_DESCRIPTION_PREFIX = 'a blend of'
const isBlendComboScene = (entry: SceneEntry): boolean =>
  entry.description.trim().toLowerCase().startsWith(BLEND_COMBO_DESCRIPTION_PREFIX)

// The POOL of catalog scenes thematically associated with the chosen interests, matched by the BROAD
// SUGGESTED_INTEREST_KEYWORDS fingerprint (against each scene's id + label + description) plus the
// learner's freeform words. When EXACTLY ONE interest is chosen, the blend-combo tiles are excluded
// so a single interest spreads across pure single-topic scenes. Pure + deterministic (follows the
// catalog's order). Used to DISTRIBUTE the offline default scene (defaultSceneForInterests) and to
// shortlist the AI scene picker (buildScenePrompt). May be empty when nothing matches (e.g. no
// interests at all, or freeform-only text the fingerprint can't place) — callers fall back then.
export const scenesForInterests = (theme: Pick<StoryTheme, 'interestIds' | 'freeformInterest'>): SceneId[] => {
  const keywords = interestKeywordsForTheme(theme)
  if (keywords.length === 0) return []
  const excludeBlends = theme.interestIds.length === 1
  const pool: SceneId[] = []
  for (const entry of SCENERY_CATALOG) {
    if (excludeBlends && isBlendComboScene(entry)) continue
    const haystack = `${entry.id} ${entry.label} ${entry.description}`.toLowerCase()
    if (keywords.some((keyword) => haystack.includes(keyword))) pool.push(entry.id)
  }
  return pool
}

// A theme-appropriate DEFAULT scene for a chosen interest SET. Used for the OFFLINE fallback beats
// (when the AI scene matcher is unavailable) AND as the backstop when the matcher returns nothing,
// so a beat is still illustrated on-theme instead of rendering image-less.
//
// It now DISTRIBUTES: it draws RANDOMLY (via the injectable `rng`, default Math.random) from the
// broad pool of scenes tied to the chosen interests (scenesForInterests), so a SINGLE interest no
// longer collapses to one fixed image on every offline / AI-failure beat. `rng` is injectable +
// seedable so the pick is PURE/deterministic in tests (mirrors pickRandomOffInterestScene).
//
// When the broad pool is empty (a freeform-only theme the fingerprint can't place), it falls back to
// the original literal id/label SCORING (which still prefers a combo scene reflecting 2+ interests),
// then the first-recognized-preset curated default (DEFAULT_SCENE_BY_INTEREST), then a neutral
// always-valid scene.
export const defaultSceneForInterests = (
  theme: Pick<StoryTheme, 'interestIds' | 'freeformInterest'>,
  rng: () => number = Math.random,
): SceneId => {
  // Primary: spread across the broad interest pool (mirrors pickRandomOffInterestScene's draw).
  const pool = scenesForInterests(theme)
  if (pool.length > 0) {
    const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length))
    return pool[index]
  }

  // Fallback: the original literal id/label scoring for themes the broad fingerprint can't place.
  const terms = interestTermsForTheme(theme)

  // The first recognized preset's curated default — both the no-match fallback and the tie-break
  // winner when it scores as well as the best scene.
  let presetDefault: SceneId | undefined
  for (const id of theme.interestIds) {
    if (DEFAULT_SCENE_BY_INTEREST[id]) {
      presetDefault = DEFAULT_SCENE_BY_INTEREST[id]
      break
    }
  }

  let topScene: SceneId | null = null
  let topScore = 0
  let presetDefaultScore = 0
  for (const entry of SCENERY_CATALOG) {
    const haystack = `${entry.id} ${entry.label} ${entry.description}`.toLowerCase()
    let score = 0
    for (const term of terms) {
      if (haystack.includes(term)) score += 1
    }
    if (entry.id === presetDefault) presetDefaultScore = score
    if (score > topScore) {
      topScore = score
      topScene = entry.id
    }
  }

  if (topScore > 0 && presetDefault && presetDefaultScore === topScore) return presetDefault
  if (topScore > 0 && topScene) return topScene
  return presetDefault ?? 'rolling-hills'
}

// --- Off-interest scene pool (the "surprise me" set) -----------------------------------------

// The flattened set of ALL suggested-interest keywords (SUGGESTED_INTEREST_KEYWORDS is defined with
// the in-interest pools above, since both pools share that one fingerprint), so a scene can be tested
// for reflecting ANY suggested interest at all.
const ALL_INTEREST_KEYWORDS: readonly string[] = Object.values(SUGGESTED_INTEREST_KEYWORDS).flat()

// True when a scene reflects NONE of the suggested interests' keywords — i.e. it is thematically
// unrelated to space, fantasy, mystery, sports, animals, pirates, cooking, AND fashion, so a learner
// picking only from the suggested interests would essentially never have it surfaced.
const isOffInterestScene = (entry: SceneEntry): boolean => {
  const haystack = `${entry.id} ${entry.label} ${entry.description}`.toLowerCase()
  return !ALL_INTEREST_KEYWORDS.some((keyword) => haystack.includes(keyword))
}

// The "off-interest" pool: catalog scenes that are UNLIKELY to be selected from the suggested
// interests alone (they share no interest term). Used as the surprise pool when a learner starts
// WITHOUT choosing any interest, so the adventure can be seeded around a scene they would not
// normally land on. Order follows the (alphabetical) catalog and is not significant.
export const OFF_INTEREST_SCENES: readonly SceneId[] = SCENERY_CATALOG.filter(isOffInterestScene).map(
  (entry) => entry.id,
)

// Pick ONE scene at random from the off-interest pool (rng injectable for deterministic tests).
// Falls back to the neutral always-valid default if the pool is somehow empty.
export const pickRandomOffInterestScene = (rng: () => number = Math.random): SceneId => {
  if (OFF_INTEREST_SCENES.length === 0) return 'rolling-hills'
  const index = Math.min(OFF_INTEREST_SCENES.length - 1, Math.floor(rng() * OFF_INTEREST_SCENES.length))
  return OFF_INTEREST_SCENES[index]
}
