# AGENTS.md

Instructions for AI coding agents working on this repository.

## License

OpenVolleyScout is licensed under the **GNU Affero General Public License,
version 3 or any later version**. The SPDX identifier is **`AGPL-3.0-or-later`**.

- Always use `AGPL-3.0-or-later`. Never `AGPL-3.0-only`, plain `AGPL-3.0`,
  GPL, LGPL, MIT, Apache or any other license.
- Do not edit `LICENSE`, and do not change the `license` field in
  `package.json` or `src-tauri/Cargo.toml`.
- New files must not declare a different license. If you add an SPDX
  header, it must be `SPDX-License-Identifier: AGPL-3.0-or-later`.
- Do not add dependencies, or copy code, under licenses that are
  incompatible with AGPL-3.0-or-later (for example proprietary, "non-commercial"
  or "no derivatives" licenses). If you are unsure whether a license is
  compatible, ask before adding it.
- Generated text that mentions the license (README, docs, release notes,
  package metadata) must name it as "GNU AGPL v3 or later (AGPL-3.0-or-later)".

## Punctuation

- Never use the em-dash character (`—`, U+2014) anywhere in code, comments,
  UI strings, docs, or tests. Always use a standard hyphen (`-`).

## Changelog

Every release gets an entry in `CHANGELOG.md`, written for the people who use the
app (coaches, scouts, analysts), not for developers. The release pipeline reads
the section of the released version to build the GitHub release notes.

- Add the section at the top, under the `# Changelog` title, as
  `## X.Y.Z - YYYY-MM-DD`. Never leave new entries under an `## Unreleased`
  heading when you release: use the version heading.
- Use only the headings `### Added`, `### Changed` and `### Fixed`, and only
  the ones that apply. Each item is one bullet with one or two short sentences.
- English only, plain words. Say what changed for the user and why it matters.
  Use the names the app shows on screen (Settings, Analysis tab, Video analysis,
  Side-out study, Team review booklet).
- No file names, folder names, function names, library names, test counts or
  other code terms, and no words such as "refactor", "migration", "store" or
  "hook". Leave out purely internal work (refactors, tests, build or CI) unless
  it changes what the user gets.
- If a number or a behaviour changes compared with earlier versions (a formula,
  a default, a filter), say so and tell the user how to get the old behaviour
  back, if there is a way. Say whether existing matches and saved settings keep
  working or are corrected automatically.
- Group related details in one bullet. Every bullet should be readable aloud to
  a coach without explaining anything.
- The version in the heading must match the six version files: `package.json`,
  `package-lock.json` (two places), `src-tauri/tauri.conf.json`,
  `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and `src/lib/constants/app.ts`.
