const { mkdirSync, writeFileSync } = require('node:fs')

mkdirSync('dist-tests', { recursive: true })
writeFileSync('dist-tests/package.json', JSON.stringify({ type: 'commonjs' }))
