#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Renders both social previews (1280 x 640) into public/:
#   social-preview.html       -> public/social-preview.png (site, repository, tutorials)
#   social-preview-stats.html -> public/social-preview-stats.png (shared statistics links)
# Needs ImageMagick 7 and Playwright's Chromium (npx playwright install chromium).
# Run from the repository root: tools/social-preview/build.sh
set -euo pipefail

HERE=tools/social-preview
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

cp "$HERE"/social-preview.html "$HERE"/social-preview-stats.html "$WORK/"
cp src/assets/fonts/ubuntu/Ubuntu-Regular.ttf src/assets/fonts/ubuntu/Ubuntu-Bold.ttf "$WORK/"
cp src/assets/openvolleyscout-logo.png "$WORK/og-cover.png"
cp src-tauri/icons/source/app-icon.png "$WORK/og-icon.png"
# Live scouting (Court input), from the English tutorial screenshots.
cp public/tutorials/en/court-05.png "$WORK/og-app.png"
# Player performance card of the demo match (kept in the repository: no live source).
cp "$HERE/og-stats.png" "$WORK/og-stats.png"

node "$HERE/render.mjs" "$WORK/social-preview.html" public/social-preview.png
node "$HERE/render.mjs" "$WORK/social-preview-stats.html" public/social-preview-stats.png
echo "Social previews rendered into public/"
