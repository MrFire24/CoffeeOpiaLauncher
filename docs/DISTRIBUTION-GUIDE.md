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

Stock Nebula (dscalzi/master) supports **only Forge and Fabric** — there is **no
`--neoforge` option**, and it refuses Forge+Fabric on the same server. Two
consequences for a NeoForge + Connector pack:

### 5a. Getting NeoForge itself
Options, easiest first:
1. Use a **Nebula fork with NeoForge support** (community forks exist — verify one
   before trusting it), or
2. Generate a **Forge** distro and hand-swap the loader **version manifest** module
   for the NeoForge one (the launcher launches NeoForge fine via the generic
   "Forge 1.13+" path — it just needs the correct `mainClass`/args from the
   manifest, which is what NeoForge's version JSON provides), or
3. Hand-author the loader module. (2)/(3) are advanced; a NeoForge-capable Nebula
   fork is the sane path.

### 5b. Getting the Fabric mods to load (the "Files" problem, now fixed)
On a Forge/NeoForge pack the mods you actually run through **Sinytra Connector**
are Fabric mods. Pick ONE of:

- **A — `FabricMod` + this launcher's fix (recommended).** Put the Fabric mods in
  `fabricmods/` so they become `Type.FabricMod`. LastShot's `reconcileConnectorMods`
  copies them into the instance `mods/` folder where Connector finds them, and they
  show up as toggleable mods in the UI. Caveat: stock Nebula won't put `fabricmods`
  into a Forge server, so you'll need a Nebula fork that allows it, or hand-add the
  `FabricMod` entries to `distribution.json` after generating.
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

## 7. Quick checklist

1. Install Nebula, fill `.env` (`BASE_URL` = your host).
2. `init root`, create `servers/<id>-1.21.1/`, drop mods into
   `forgemods|fabricmods/{required,optionalon,optionaloff}`.
3. Handle NeoForge (§5a) + Connector-Fabric mods (§5b, approach A or B).
4. `generate distro`.
5. Upload the `ROOT` tree to your host at `BASE_URL`.
6. Set `REMOTE_DISTRO_URL` to your `distribution.json`, run the launcher, verify
   the pack downloads and launches.
