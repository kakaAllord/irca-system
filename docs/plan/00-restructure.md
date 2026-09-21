# Phase 0 — Restructure into one repository

**Outcome.** One folder, `~/dev/irca/irca-system`, is one git repository
holding every part of the system as npm workspaces, inside a working folder
`~/dev/irca/` that is not a repository. The registration app lives in it
exactly as it is deployed. The design prototypes and agent working files sit
in the working folder, outside the repository. The live site keeps running throughout, and moves to deploy
from the new repository only after a preview deploy proves the build.

**Status on 21 Sept 2026:** steps 0.1–0.6a are done (commits listed below).
Steps 0.7–0.9 wait on the owner's choice of GitHub repository (0.7).

```
~/dev/irca/                       ← working folder: NOT a repository
├── AGENTS.md  CLAUDE.md  .claude/ ← agent and editor working files, never committed
├── design/admin/                 ← the admin-portal prototype, never committed
└── irca-system/                  ← the repository (git init, branch main)
    ├── apps/
    │   └── registration/         ← @irca/registration, the live visitor form
    │       (api/ and portal/ arrive in Phase 1)
    ├── packages/                 ← @irca/shared arrives in Phase 1
    ├── docs/plan/                ← this plan
    ├── package.json              ← workspaces root: apps/*, packages/*
    ├── package-lock.json         ← the only lockfile
    └── .gitignore  .nvmrc  README.md
```

**Why some files live outside the repository.** Agent and editor working files
and the design prototype are not source. Rather than being listed in
`.gitignore` (which would record that they exist), they sit in the working
folder around the repository, where git never sees them. `.gitignore` holds
only standard build output and environment-file patterns.

| Step | What | Status |
| --- | --- | --- |
| 0.1 | Back up everything that is not on GitHub | Done |
| 0.2 | Lay out the folders | Done |
| 0.3 | `git init` and the root files | Done: `528bb18` |
| 0.4 | Import the registration app exactly as deployed | Done: `ec829a0` |
| 0.5 | Commit the unfinished "who first" screen change | Done: `1bdf8a3` |
| 0.6 | Make the root an npm workspace | Done: `5732b8b` |
| 0.6a | Stop `next dev` writing agent files into the app | Done: `72afac3` |
| 0.7 | Connect a GitHub remote | **Waiting on the owner** |
| 0.8 | Point the Vercel project at the new repository | After 0.7 |
| 0.9 | Retire the old repository | After 0.8 |
| 0.10 | Phase check | |

---

## 0.1 — Back up everything that is not on GitHub

**Why:** the old `irca-registration/.git` folder was removed on 21 Sept, so
local-only work had no history behind it.

**Done:** compared the working tree with a fresh clone of
`kakaAllord/irca-administration` at `2290ffa`. The only differences were four
uncommitted files (the "who first" change) and `docs/plan/`. A tarball of the
whole working tree (without `node_modules` and `.next`) and a copy of the four
files were kept in the session scratchpad until the commits below existed.

**If you ever redo this:** `git clone` the old repository into a temporary
folder, `diff -rq` it against your tree, and save every file that differs
before moving anything.

## 0.2 — Lay out the folders

**Done:**

```bash
mv ~/dev/irca-apps ~/dev/irca-system
cd ~/dev/irca-system
rmdir irca-backend irca-portal                 # both were empty
mkdir -p apps packages
mv irca-registration apps/registration
mv apps/registration/docs docs                 # the plan belongs to the whole system

# then the working folder around it
mkdir ~/dev/irca && mv ~/dev/irca-system ~/dev/irca/
mv ~/dev/irca/irca-system/design ~/dev/irca/design
# agent notes (CLAUDE.md, AGENTS.md) moved to ~/dev/irca/, never committed
```

## 0.3 — `git init` and the root files

**Done** (`528bb18`, "Start the IRCA system repository"):

- `git init -b main`
- `.gitignore`: only `node_modules/`, `.next/`, `dist/`, `coverage/`,
  `*.tsbuildinfo`, `next-env.d.ts`, `.env`, `.env.local`, `.env.*.local`,
  `playwright-report/`, `test-results/`.
- `.nvmrc` (`24`), `README.md` (what lives where).
- The working rules (commit identity, message style, no attribution lines,
  "read the plan first") are in `~/dev/irca/AGENTS.md`, outside the repository.

**The design prototype** is reference material, not source. It lives at
`~/dev/irca/design/admin/`. Anyone who needs to see the screens gets the folder
from the owner and puts it there. The plan refers to it as
`../design/admin/IRCA Admin Portal v2.dc.html`, relative to the repository.

## 0.4 — Import the registration app exactly as deployed

**Done** (`ec829a0`, "Bring in the registration form as it is deployed"). The
four modified files were swapped back to their committed versions first, so
this commit matches `2290ffa` of `irca-administration` file for file (checked),
apart from local-only files, which now live outside the repository instead of
being committed or listed. The old history stays in that repository on GitHub. This one
starts from a state known to build and to be what visitors use.

## 0.5 — Commit the unfinished "who first" screen change

**Done** (`1bdf8a3`, "Open the form by asking who they are"). This puts the
"Tell us about you" screen first, thanks people by name on "How did you hear
about IRCA?", and replaces three hard-coded first-step ids with `FIRST_STEP`.

Checked: `next build` passes. With the built app against the local database,
`/`, `/r/<token>/who` ("Tujuane nawe") and `/r/<token>/heard` ("Asante Neema",
"Uliifahamuje IRCA?") render. The test row was deleted afterwards.

**Not yet checked:** walking the whole form by hand in a phone-sized browser,
including the membership branch and going back from the first question to the
language screen. **Do this before 0.8 sends it to production.** It is the first
time this change reaches visitors.

## 0.6 — Make the root an npm workspace

**Done** (`5732b8b`, "Make the repository an npm workspace"):

- Root `package.json`: `"workspaces": ["apps/*", "packages/*"]`, engines
  Node 24 / npm 11, and `build`, `typecheck`, `lint` and `test` scripts that run
  across workspaces.
- `apps/registration/package.json`: renamed `@irca/registration`, `dev` on
  port **3001** (the portal takes 3000), and a `typecheck` script.
- The app's `package-lock.json` became the root one. Every direct dependency
  resolves to the same version as before. The only change in the tree is
  `baseline-browser-mapping` 2.11.23 → 2.11.25 (browser data read by the build tooling).
- The app's `README.md` now says to install from the root.

Checked: `npm install` at the root, then `npm run typecheck -w
@irca/registration` and `npm run build -w @irca/registration` pass.

## 0.6a — Stop `next dev` writing agent files into the app

**Done** (`72afac3`, "Keep next dev from writing agent files into the app").
Next 16 writes `AGENTS.md` and `CLAUDE.md` into an app folder on every `next
dev` when it detects a coding agent. `apps/registration/next.config.ts` now sets
`agentRules: false`. The advice those files carried (read the bundled Next docs
in `node_modules/next/dist/docs/`) is in `~/dev/irca/AGENTS.md` instead.
**Every new Next app does the same** (01 step 1.16).

## 0.7 — Connect a GitHub remote

**Waiting on the owner.** The new history does not share any commit with
`kakaAllord/irca-administration`, so it cannot simply be pushed there.

| Option | Impact |
| --- | --- |
| **A. A new, empty GitHub repository `kakaAllord/irca-system`** (recommended) | Clean, and matches the folder. The old repository stays untouched as the record of the registration app's first 28 commits. Vercel must be re-linked (0.8), which is a settings change plus one preview deploy. |
| B. Force-push the new history over `irca-administration` | Keeps the repository name and the Vercel link. **Destroys the old history on GitHub** for everyone, and cannot be undone once others have pulled. Not recommended. |
| C. Graft: restore the old history under `apps/registration` and replay these commits on top | Keeps one continuous history, but costs an afternoon of `git filter-repo` work, for history that the old repository already preserves. |

When the owner picks A:

```bash
# create the empty repository on GitHub first (no README, no .gitignore), then:
cd ~/dev/irca-system
git remote add origin git@github.com:kakaAllord/irca-system.git
git push -u origin main
```

## 0.8 — Point the Vercel project at the new repository

1. Vercel → the registration project → **Settings → Git** → disconnect
   `irca-administration`, connect `irca-system`, production branch `main`.
2. **Settings → General → Root Directory = `apps/registration`**, with
   "Include files outside the root directory in the Build Step" **on** (Vercel
   needs the root lockfile).
3. Leave every environment variable as it is. `vercel.json` (with its
   `db:migrate && next build`) moved with the app and still applies.
4. Push a branch and open a **preview** deployment. Walk the form on it (0.5's
   unchecked items) against a Neon branch, not production data, if possible.
5. Then promote/redeploy production from `main`. Check the production form:
   one test registration, then delete it. Also check that `/admin` is still a 404.

## 0.9 — Retire the old repository

After a week of production deploys from `irca-system`, edit
`irca-administration`'s README to say "Moved to kakaAllord/irca-system", and
**archive** it on GitHub (read-only, still viewable). Do not delete it. It is
the only copy of the registration app's early history.

## 0.10 — Phase check

- [x] `~/dev/irca-system` is a git repository on `main` with the four commits above.
- [x] `git status` is clean apart from `docs/` (committed with this plan update).
- [x] `~/dev/irca/design/admin`, `~/dev/irca/AGENTS.md` and `~/dev/irca/CLAUDE.md` exist outside the repository, and `git ls-files` lists no `CLAUDE.md`, `AGENTS.md`, `.claude` or design file.
- [x] `npm install`, `typecheck` and `build` pass from the root.
- [ ] The "who first" form walked by hand on a phone-sized screen.
- [ ] Pushed to the chosen GitHub repository.
- [ ] Vercel builds production from `apps/registration` in the new repository.
- [ ] The old repository is archived with a pointer.
