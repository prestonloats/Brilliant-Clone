// Workaround for a Node.js 24.17.0 regression that makes firebase-tools'
// bundled node-fetch@2 throw ERR_STREAM_PREMATURE_CLOSE on gzip responses
// (e.g. firebaserules.googleapis.com / firebasehosting.googleapis.com during deploy).
//
// Node 24.17.0's http.Agent security fix changes keep-alive socket reuse timing,
// which tears down node-fetch's gzip stream early. Disabling keep-alive on the
// global agents forces a fresh socket per request and avoids the false-positive
// "Premature close" error.
//
// Used only as: NODE_OPTIONS="--require ./scripts/node24-keepalive-fix.cjs" firebase deploy ...
const http = require('node:http')
const https = require('node:https')

http.globalAgent = new http.Agent({ keepAlive: false })
https.globalAgent = new https.Agent({ keepAlive: false })
