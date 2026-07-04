const { DistributionAPI } = require('helios-core/common')

const ConfigManager = require('./configmanager')

// Old WesterosCraft url.
// exports.REMOTE_DISTRO_URL = 'http://mc.westeroscraft.com/WesterosCraftLauncher/distribution.json'
// Previous (file.garden): 'https://file.garden/aII_x0KjWXYbh8IN/CoffeeOpia/distribution.json'
// Local test host: 'http://localhost:8080/lastshot-distro.json' (serve.bat = python http.server 8080).
// Public host: Netlify (drop the staged upload folder). One line to change if the host moves.
// Use the production URL (harmonious-lily-e0a3cc.netlify.app) — NOT a deploy-specific
// <hash>--harmonious-lily permalink, which freezes to one upload.
exports.REMOTE_DISTRO_URL = 'https://harmonious-lily-e0a3cc.netlify.app/lastshot-distro.json'

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
    return _pullRemote()
}

exports.DistroAPI = api