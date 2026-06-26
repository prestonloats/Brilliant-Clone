// Optimize the scenery art for the web: resize the oversized source PNGs down to a sane display
// width and re-encode them as WebP, which cuts the per-image weight ~90%+ with no visible loss at
// the size the app actually renders them (the story column is max-width 760px, so ~1024px wide is
// already ~1.35x retina). The original PNGs are MOVED to a git-ignored backup folder rather than
// deleted, so nothing is lost and you can re-run at a different size/quality later.
//
// Usage:
//   node scripts/optimize-scenery.mjs            convert every public/scenery/*.png -> .webp
//   node scripts/optimize-scenery.mjs --keep     keep the source PNGs in place (don't move them)
//   MAX_WIDTH=1280 QUALITY=82 node scripts/optimize-scenery.mjs   tweak the output

import { mkdir, readdir, rename, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCENERY_DIR = join(ROOT, 'public', 'scenery')
const BACKUP_DIR = join(ROOT, 'scenery-originals')

const MAX_WIDTH = Number(process.env.MAX_WIDTH ?? 1024)
const QUALITY = Number(process.env.QUALITY ?? 80)
const KEEP_ORIGINALS = process.argv.includes('--keep')

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1)

async function main() {
  const entries = await readdir(SCENERY_DIR)
  const pngs = entries.filter((name) => name.toLowerCase().endsWith('.png'))

  if (pngs.length === 0) {
    console.log('No PNGs found in public/scenery — nothing to do (already optimized?).')
    return
  }

  if (!KEEP_ORIGINALS) await mkdir(BACKUP_DIR, { recursive: true })

  console.log(`Optimizing ${pngs.length} images -> WebP (max width ${MAX_WIDTH}px, quality ${QUALITY})\n`)

  let beforeTotal = 0
  let afterTotal = 0
  let done = 0

  for (const name of pngs) {
    const srcPath = join(SCENERY_DIR, name)
    const outName = `${name.slice(0, -'.png'.length)}.webp`
    const outPath = join(SCENERY_DIR, outName)

    const beforeBytes = (await stat(srcPath)).size

    await sharp(srcPath)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(outPath)

    const afterBytes = (await stat(outPath)).size

    if (!KEEP_ORIGINALS) await rename(srcPath, join(BACKUP_DIR, name))

    beforeTotal += beforeBytes
    afterTotal += afterBytes
    done += 1
    if (done % 50 === 0 || done === pngs.length) {
      console.log(`  ${done}/${pngs.length} done`)
    }
  }

  const saved = beforeTotal - afterTotal
  const pct = ((saved / beforeTotal) * 100).toFixed(1)
  console.log('\nDone.')
  console.log(`  Before: ${mb(beforeTotal)} MB`)
  console.log(`  After:  ${mb(afterTotal)} MB`)
  console.log(`  Saved:  ${mb(saved)} MB (${pct}%)`)
  if (!KEEP_ORIGINALS) {
    console.log(`\nOriginal PNGs moved to ./scenery-originals (git-ignored). Delete that folder to reclaim disk once you're happy.`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
