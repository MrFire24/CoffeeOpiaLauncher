# LastShot — distribution & Nebula guide

How to build the `distribution.json` (the file that tells the launcher which
Minecraft version, loader, mods and files to download) and host it.

> The launcher reads the distribution from `REMOTE_DISTRO_URL` in
> `app/assets/js/distromanager.js`. Point it at wherever you host your
> `distribution.json`.

---

## 1. What the distribution is

`distribution.json` is a manifest describing one or more **servers** (mod packs).
For each server it lists the Minecraft version, the loader (Forge/NeoForge/Fabric)
and every **module** (mod / library / file) with a download URL + hash. On launch
the launcher downloads everything into the shared `common/modstore/` and the
per-instance folder, verifies hashes, and starts the game.

You normally generate it with **Nebula** instead of writing it by hand.

---

## 2. Nebula setup

Nebula is a separate Node tool: <https://github.com/dscalzi/Nebula> (clone it
somewhere outside this repo).

```
git clone https://github.com/dscalzi/Nebula.git
cd Nebula
npm install
```

### Enabling NeoForge support (patch)

Stock Nebula does not support NeoForge. This repo ships a patch that adds a
`--neoforge` option (see `docs/nebula/0001-neoforge-support.patch`). Apply it to
your Nebula clone once:

```
git am < /path/to/LastShot/docs/nebula/0001-neoforge-support.patch
# or, if git am is fussy:
git apply /path/to/LastShot/docs/nebula/0001-neoforge-support.patch
npm run build
```

The patch runs the official NeoForge installer headless, so a JDK (Java 21 for
1.21.1) must be on `JAVA_EXECUTABLE`. It was verified against MC 1.21.1 /
NeoForge 21.1.234 (schema-valid distribution, all artifacts downloaded). The
final proof — launching the game — is on you.

Create a `.env` file in the Nebula root:

```properties
JAVA_EXECUTABLE=C:\Program Files\Eclipse Adoptium\jdk-21.0.x-hotspot\bin\java.exe
ROOT=D:\LastShotRoot
BASE_URL=https://your-host.example/            # where the files will be served
HELIOS_DATA_FOLDER=C:\Users\<you>\AppData\Roaming\lastshot
```

- `ROOT` — a working folder where Nebula builds the file tree.
- `BASE_URL` — the public base URL your files will live under. Every download URL
  in `distribution.json` is `BASE_URL` + the file's path, so this MUST match your
  host (see §6). For local testing use `http://localhost:8080/`.
- `HELIOS_DATA_FOLDER` — LastShot's userData dir (`%APPDATA%\lastshot`).

Requirements: Node 22 and a JDK (Java is used to read mod metadata).

---

## 3. Nebula folder structure

After `npm run start -- init root`, `ROOT` gets a `servers/` folder. Create one
folder per pack, named `<ServerId>-<mcversion>`:

```
ROOT/
  meta/distrometa.json
  servers/
    LastShotMain-1.21.1/
      servermeta.json
      LastShotMain-1.21.1.png        # server icon
      files/                         # arbitrary files copied into the instance
      libraries/                     # extra libraries (Type.Library)
      forgemods/                     # Forge/NeoForge mods (Type.ForgeMod)
        required/
        optionalon/                  # optional, enabled by default
        optionaloff/                 # optional, disabled by default
      fabricmods/                    # Fabric mods (Type.FabricMod)
        required/
        optionalon/
        optionaloff/
```

- Drop each mod jar into the matching `required` / `optionalon` / `optionaloff`
  folder. Nebula reads the jar metadata to name/version it and picks the type from
  the parent folder (`forgemods` -> ForgeMod, `fabricmods` -> FabricMod).
- `required` = always on (not toggleable). `optionalon`/`optionaloff` = shown as
  toggles in the launcher's Mods screen.

---

## 4. Generate

```
# one-time
npm run start -- init root

# create a server definition (Forge example)
npm run start -- generate server LastShotMain 1.21.1 --forge 52.0.63

# build the distribution.json from the current file tree
npm run start -- generate distro distribution
```

`generate distro` writes `distribution.json` into `ROOT` and lays the files out
under `ROOT` matching `BASE_URL`. Upload that tree to your host (§6).

Helpers: `npm run start -- latest-forge 1.21.1` / `recommended-forge 1.21.1`.

---

## 5. NeoForge + Sinytra Connector (important for this pack)

### 5a. Getting NeoForge itself — solved by the patch
With the patch applied (§2), just pass `--neoforge`:

```
npm run start -- generate server LastShotMain 1.21.1 --neoforge 21.1.234
npm run start -- generate distro distribution
```

The resolver runs the NeoForge installer, and the launcher launches NeoForge via
the generic "Forge 1.13+" path (it reads NeoForge's version manifest for
mainClass/args). Latest NeoForge for 1.21.1: check
<https://maven.neoforged.net/releases/net/neoforged/neoforge/> (21.1.x line).

NeoForge mods (regular, non-Fabric) go in `forgemods/` — they load through
`--fml.modLists`, which **NeoForge retained** (Forge 1.20.3+ removed it), so the
launcher's normal managed-mod mechanism works for them.

### 5b. Getting the Fabric mods to load (the "Files" problem, now fixed)
On a Forge/NeoForge pack the mods you actually run through **Sinytra Connector**
are Fabric mods. Pick ONE of:

- **A — `FabricMod` + this launcher's fix.** As `Type.FabricMod` modules,
  LastShot's `reconcileConnectorMods` copies them into the instance `mods/` folder
  where Connector finds them, and they show up as toggleable mods in the UI.
  Caveat: a `--neoforge` server (this repo's patch) scans `forgemods/` only, not
  `fabricmods/`, so to get `FabricMod` entries you must hand-add them to the
  generated `distribution.json`. If you don't want to edit JSON, use approach B.
- **B — `Type.File` (works on any launcher, no fix needed).** Declare each Fabric
  mod as a `File` module with path `mods/<name>.jar`. The launcher downloads it
  straight into the instance `mods/` folder → Connector loads it. Downside: not
  shown/toggleable in the Mods UI (it's just a forced file). Simplest if you don't
  want to touch Nebula.

In BOTH cases: **Connector itself and Forgified Fabric API are NeoForge mods** —
put them in `forgemods/` (they load normally). Only the *actual Fabric mods* need
the special handling above.

---

## 6. Hosting the files

`distribution.json` + the whole generated file tree must be served over HTTP(S)
at `BASE_URL`.

- **Testing / small pack → GitHub Releases.** Upload jars as release assets
  (`gh release upload <tag> <files>`), put `distribution.json` as an asset or in the
  repo. Free, reliable, no bandwidth limits.
- **Real server with players → Cloudflare R2** (recommended). S3-compatible, 10 GB
  free, and **zero egress fees** — important when many clients download the pack.
  Upload the Nebula output, enable public access / a custom domain, set
  `BASE_URL`/`REMOTE_DISTRO_URL` to it.
- **Backblaze B2 + Cloudflare** — cheap, free egress via the Bandwidth Alliance.
- Do **not** put large jars in a git repo (100 MB/file limit, repo bloat).

Then set, in `app/assets/js/distromanager.js`:

```js
exports.REMOTE_DISTRO_URL = 'https://your-host.example/distribution.json'
```

---

## 6b. Why some mods get "silently ignored" (and how to avoid it)

Nebula can drop or mis-handle mods without an obvious error. The real causes,
from reading the source + issue tracker:

1. **Mod in the wrong folder (most common).** Only `required/`, `optionalon/`
   and `optionaloff/` are scanned — a jar dropped directly in `forgemods/` (or
   `fabricmods/`) is never seen. The patched Nebula now prints a
   `Ignoring "<file>" …` warning for these; move them into a subfolder.
2. **Duplicate resolved id → overwrite.** Two mods that resolve to the same
   `group:id:version` map to the same modstore path, so one overwrites the other.
   This hits small/library-ish/Fabric-converted mods whose metadata can't be
   read, so they fall back to `generated.forgemod:<filename>`. The patched Nebula
   now warns `Duplicate module id …`. Fix: give them real metadata (below) or
   rename so ids differ.
3. **Metadata not resolvable.** A mod with no `mods.toml`/`neoforge.mods.toml`
   (pure library, coremod, or a Fabric mod dropped into `forgemods/`) can't be
   identified; Nebula falls back to a filename guess. Combined with (2) this is
   where "small library" mods vanish. Fixes: put real NeoForge mods (with
   `neoforge.mods.toml`) in `forgemods/`; put Fabric mods in `fabricmods/` (or,
   for Connector, ship them as `Type.File` → `mods/`, see §5b); ship plain
   libraries as `Type.Library` (the `libraries/` folder), not as mods.
4. **Claritas crash aborts generation (loud, but easy to miss).** Certain jars
   make the metadata tool (Claritas) throw (issues #41, #48), which fails the
   whole `generate distro`. If you didn't notice, you keep shipping an older
   distribution and it looks like "some mods went missing." Watch the log for
   `Claritas finished with non-zero exit code` / `Failed to generate distribution`.
   Workaround: remove/replace the offending jar, or update Claritas.

Rule of thumb: **read the `generate distro` log.** With the patched Nebula, the
new warnings surface exactly these cases instead of failing silently.

## 7. Quick checklist

1. Install Nebula, fill `.env` (`BASE_URL` = your host).
2. `init root`, create `servers/<id>-1.21.1/`, drop mods into
   `forgemods|fabricmods/{required,optionalon,optionaloff}`.
3. Handle NeoForge (§5a) + Connector-Fabric mods (§5b, approach A or B).
4. `generate distro`.
5. Upload the `ROOT` tree to your host at `BASE_URL`.
6. Set `REMOTE_DISTRO_URL` to your `distribution.json`, run the launcher, verify
   the pack downloads and launches.
