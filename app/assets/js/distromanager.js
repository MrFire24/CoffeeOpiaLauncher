const { DistributionAPI } = require('helios-core/common')
const fs   = require('fs')
const path = require('path')

const ConfigManager = require('./configmanager')

// Old WesterosCraft url.
// exports.REMOTE_DISTRO_URL = 'http://mc.westeroscraft.com/WesterosCraftLauncher/distribution.json'
// Previous (file.garden): 'https://file.garden/aII_x0KjWXYbh8IN/CoffeeOpia/distribution.json'
// Local test host: 'http://localhost:8080/lastshot-distro.json' (serve.bat = python http.server 8080).
// Public host: Timeweb Object Storage (S3, s3.twcstorage.ru) — reachable inside
// Russia without a VPN (Netlify was DPI-blocked there). Bucket last-shot-files,
// folder lastshot-upload. One line to change if the host moves.
exports.REMOTE_DISTRO_URL = 'https://s3.twcstorage.ru/last-shot-files/lastshot-upload/lastshot-distro.json'

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    false
)

// Resilient distribution-index fetch. Each attempt is:
//   1. Cache-busted (`?_=<ts>`) so a CDN/proxy can't pin a stale/failed copy.
//   2. Bounded by a timeout — helios-core fetches with `got` and NO timeout, so a
//      host that accepts the TCP connection but stalls (DPI throttling, or a
//      foreign VPN adding latency to a Russian host) would otherwise hang the
//      loading screen FOREVER (the UI only shows after this resolves).
// And we RETRY a few times: a single flaky fetch must not dead-end the launcher.
// On total failure we return { data: null } so helios falls back to pullLocal
// (on-disk cache, then the bundled distribution below).
const _pullRemote = api.pullRemote.bind(api)
api.pullRemote = async function () {
    const sep = exports.REMOTE_DISTRO_URL.includes('?') ? '&' : '?'
    const DISTRO_TIMEOUT_MS = 12000
    const MAX_ATTEMPTS = 3
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        this.remoteUrl = exports.REMOTE_DISTRO_URL + sep + '_=' + Date.now()
        const res = await Promise.race([
            _pullRemote(),
            new Promise(resolve => setTimeout(() => resolve({ data: null }), DISTRO_TIMEOUT_MS))
        ])
        if (res != null && res.data != null) {
            return res
        }
    }
    return { data: null }
}

// Last-resort fallback: a distribution shipped INSIDE the launcher
// (app/assets/distribution.json, refreshed at release time). helios' pullLocal
// only reads the user's on-disk cache; a FRESH install has none, so if the remote
// host is momentarily unreachable at first launch the launcher would hard-fatal
// ("Unable to Load Distribution Index"). Falling back to the bundled copy lets it
// open anyway — stale but functional; the next successful remote pull overwrites
// the on-disk cache. This is what turned "worked once, then a blip = dead" into a
// recoverable state.
const _pullLocal = api.pullLocal.bind(api)
api.pullLocal = async function () {
    const local = await _pullLocal()
    if (local != null) {
        return local
    }
    try {
        const bundled = path.join(__dirname, '..', 'distribution.json')
        return JSON.parse(fs.readFileSync(bundled, 'utf-8'))
    } catch (_e) {
        return null
    }
}

exports.DistroAPI = api