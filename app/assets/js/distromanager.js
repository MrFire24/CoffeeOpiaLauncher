const { DistributionAPI } = require('helios-core/common')
const got  = require('got')
const fs   = require('fs')
const path = require('path')

const ConfigManager = require('./configmanager')

// Distribution shipped inside the launcher (app/assets/distribution.json, refreshed
// at release time). Used as a last-resort fallback and to seed the on-disk cache so
// the launcher works even when the remote host is unreachable. __dirname here is
// app/assets/js, so the bundled copy sits one level up in app/assets.
const BUNDLED_DISTRO_PATH = path.join(__dirname, '..', 'distribution.json')

// Where the currently-loaded distribution came from, so the UI can warn the player
// when they're NOT on a fresh copy from the host:
//   'remote' — freshly fetched from the host (all good, no warning)
//   'cache'  — host unreachable, using the last successfully-downloaded copy on disk
//   'bundle' — host unreachable AND no disk cache (fresh install) → built-in copy
// Read by uibinder.showMainUI() to decide whether to show the landing warning.
exports.distroSource = 'remote'

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

// Resilient distribution-index fetch. We do the fetch ourselves (instead of
// helios' pullRemote) so we can control three things helios can't:
//   1. Cache-bust (`?_=<ts>`) so a CDN/proxy can't pin a stale/failed copy.
//   2. A timeout — helios fetches with `got` and NO timeout, so a host that
//      accepts the TCP connection but stalls (DPI throttling, or a foreign VPN
//      adding latency to a Russian host) would hang the loading screen FOREVER.
//   3. `decompress: false` — our host (Cyberduck upload) tags .json objects with
//      a bogus `Content-Encoding: gzip` while the body is plain text. got would
//      try to gunzip it and throw Z_DATA_ERROR ("incorrect header check"). We
//      fetch the raw buffer and JSON.parse it ourselves, sidestepping the lie.
// And we RETRY a few times: a single flaky fetch must not dead-end the launcher.
// On total failure we return { data: null } so getDistribution() falls back to
// pullLocal (on-disk cache, then the bundled distribution below).
api.pullRemote = async function () {
    const sep = exports.REMOTE_DISTRO_URL.includes('?') ? '&' : '?'
    const DISTRO_TIMEOUT_MS = 12000
    const MAX_ATTEMPTS = 3
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const url = exports.REMOTE_DISTRO_URL + sep + '_=' + Date.now()
        try {
            const res = await got.get(url, {
                responseType: 'buffer',
                decompress: false,
                timeout: { request: DISTRO_TIMEOUT_MS }
            })
            const data = JSON.parse(res.body.toString('utf-8'))
            exports.distroSource = 'remote'
            return { data }
        } catch (_e) {
            // timeout / network / parse error — try again, then fall through to cache
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
        exports.distroSource = 'cache'
        return local
    }
    try {
        const bundled = JSON.parse(fs.readFileSync(BUNDLED_DISTRO_PATH, 'utf-8'))
        exports.distroSource = 'bundle'
        return bundled
    } catch (_e) {
        return null
    }
}

// Seed the on-disk distribution cache from the bundled copy on first run.
//
// Why this is necessary in ADDITION to the pullLocal override above: pressing
// Play spawns a SEPARATE helios receiver process (FullRepairReceiver) to validate
// and download game files. That subprocess builds its own DistributionAPI and
// calls getDistributionLocalLoadOnly() -> pullLocal(), reading ONLY the on-disk
// cache — our in-renderer pullLocal override does NOT run there. So a player who
// cannot reach the remote host (e.g. the host aborts their connection) gets the
// launcher open (renderer fallback) but then hits
// "FATAL: Unable to load distribution from local disk" at Play time.
//
// Writing the bundled distribution to the on-disk cache path when it is missing
// gives EVERY process — renderer and receiver subprocess — a distribution to read.
// Only seeds when absent, so a fresher distro from a successful remote pull is
// never clobbered. Must be kept in sync with the hosted distro on each pack regen.
try {
    const cachePath = path.join(ConfigManager.getLauncherDirectory(), 'distribution.json')
    if (!fs.existsSync(cachePath)) {
        fs.mkdirSync(path.dirname(cachePath), { recursive: true })
        fs.copyFileSync(BUNDLED_DISTRO_PATH, cachePath)
    }
} catch (_e) { /* non-fatal: falls through to normal remote/local load */ }

exports.DistroAPI = api