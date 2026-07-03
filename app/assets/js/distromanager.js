const { DistributionAPI } = require('helios-core/common')

const ConfigManager = require('./configmanager')

// Old WesterosCraft url.
// exports.REMOTE_DISTRO_URL = 'http://mc.westeroscraft.com/WesterosCraftLauncher/distribution.json'
// Previous (file.garden): 'https://file.garden/aII_x0KjWXYbh8IN/CoffeeOpia/distribution.json'
// Local test host: 'http://localhost:8080/lastshot-distro.json' (serve.bat = python http.server 8080).
// Public host: Netlify (drop the staged upload folder). One line to change if the host moves.
exports.REMOTE_DISTRO_URL = 'https://benevolent-semolina-d50eae.netlify.app/lastshot-distro.json'

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    false
)

exports.DistroAPI = api