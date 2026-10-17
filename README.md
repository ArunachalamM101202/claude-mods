# claude-mods

A growing collection of mods for [Claude Code](https://claude.com/claude-code): small plugins that change how Claude looks and behaves in your terminal.

## Install

Add this repo as a marketplace once, then install any mod from it. At the prompt of a Claude Code terminal session:

```
/plugin install clawd-critter --marketplace ArunachalamM101202/claude-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope makes it load in every session). The mod starts right away, no restart needed.

From a shell instead:

```
claude plugin install clawd-critter --marketplace ArunachalamM101202/claude-mods
```

In the desktop app (where `/plugin` doesn't run): click **+** next to the prompt box → **Plugins** → **Add marketplace** with `ArunachalamM101202/claude-mods` → **Add plugin**.

To get new versions later: `claude plugin update <mod>`, then `/reload-plugins`.

## Mods

| Mod | What it does |
| --- | --- |
| [`clawd-critter`](plugins/clawd-critter) | A pixel-art orange Claude critter lives above your prompt and acts out what Claude is doing. It types on a tiny terminal for Bash, pushes a crate for `git push`, plays tug-of-war for `git pull`, stamps a green dot on the ground for every commit, swings a hammer for edits, sweats through test runs, and naps when idle. `/critter pet`, `/critter hide`, `/critter show`, `/critter stats`. |

## Adding a new mod

Each mod lives in its own folder under `plugins/`:

```
plugins/<mod-name>/
  .claude-plugin/plugin.json   # { "name": "<mod-name>", "version": "0.1.0", "description": "..." }
  hooks/hooks.json             # { "modules": ["./register.tsx"] }
  hooks/register.tsx           # export const register: Register = (on) => { ... }
  types/index.d.ts             # only if the mod keeps values in $.state
  tests/*.test.ts              # run with `claude plugin test plugins/<mod-name>`
```

Then:

1. Add an entry to `.claude-plugin/marketplace.json`:
   ```json
   { "name": "<mod-name>", "source": "./plugins/<mod-name>", "description": "...", "version": "0.1.0" }
   ```
2. Add a row to the **Mods** table above.
3. Check it: `claude plugin validate .` (reads the marketplace and every listed mod) and `claude plugin test plugins/<mod-name>`.

While developing, run a mod straight from its folder with hot reload:

```
claude --plugin-dir plugins/<mod-name>
```

When you change a mod, bump `version` in both its `plugin.json` and its marketplace entry so `claude plugin update` picks it up.
