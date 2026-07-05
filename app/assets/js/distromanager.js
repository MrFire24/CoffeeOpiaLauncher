const { DistributionAPI } = require('helios-core/common')

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

// Cache-bust the distribution index fetch. Pressing Play (dlAsync ->
// refreshDistributionOrFallback -> pullRemote) should always pull the freshly
// pushed distribution.json, but a CDN (Netlify / GitHub Pages) may serve a
// stale cached copy. Appending a unique query on each pull bypasses that cache.
// Mod/artifact URLs are unaffected (they stay fixed) — only the index refreshes.
const _pullRemote = api.pullRemote.bind(api)
api.pullRemote = function () {
    const sep = exports.REMOTE_DISTRO_URL.includes('?') ? '&' : '?'
    this.remoteUrl = exports.REMOTE_DISTRO_URL + sep + '_=' + Date.now()
    // Bound the remote fetch with a timeout. helios-core fetches the distribution
    // with `got` and NO timeout, so a host that accepts the TCP connection but
    // never sends a response (typical of DPI filtering / throttling in some
    // regions) hangs the launcher on the loading screen FOREVER — the UI only
    // shows after this resolves. Racing a timeout makes us return null, so
    // getDistribution() falls back to the cached distribution (pullLocal) and the
    // launcher opens instead of hanging.
    const DISTRO_TIMEOUT_MS = 10000
    return Promise.race([
        _pullRemote(),
        new Promise(resolve => setTimeout(() => resolve({ data: null }), DISTRO_TIMEOUT_MS))
    ])
}

exports.DistroAPI = api