#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Regenerates every app icon (desktop, Android, iOS, PWA, favicons) from the
# vector logo src/assets/openvolleyscout.svg. Needs ImageMagick 7 (`magick`)
# and the Tauri CLI. Run from the repository root: scripts/generate-icons.sh
#
# - App icons: the full logo, enlarged, on a white rounded tile, so it reads on
#   light and dark taskbars alike.
# - Favicons and icons up to 48 px: the ball alone, which stays readable small.
# - Android: the logo on the brand blue, with the ball in colour (blue parts
#   turn white, white stripes turn blue), inside the 66% safe zone of the
#   adaptive icon; a one-colour version for themed icons.
# - iOS, Apple touch icon and PWA maskable icon: opaque white, logo in the safe area.
set -euo pipefail

SVG=src/assets/openvolleyscout.svg
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
SRC=src-tauri/icons/source
mkdir -p "$SRC"

# Full logo, trimmed, at high resolution.
magick -background none -density 600 "$SVG" -trim +repage "$WORK/mark.png"

# The ball: leftmost shape of the logo, cut out with a circle so nothing else leaks in.
BALL_GEOMETRY=$(magick "$WORK/mark.png" -alpha extract -threshold 50% \
  -define connected-components:verbose=true -define connected-components:area-threshold=2000 \
  -connected-components 8 null: | awk '$5 ~ /255,255,255/ { split($2, g, /[x+]/); print g[3], $2 }' | sort -n | head -1 | cut -d' ' -f2)
magick "$WORK/mark.png" -crop "$BALL_GEOMETRY" +repage "$WORK/ball-raw.png"
read -r BW BH < <(magick identify -format "%w %h\n" "$WORK/ball-raw.png")
BS=$(( BW > BH ? BW : BH ))
magick "$WORK/ball-raw.png" -background none -gravity center -extent "${BS}x${BS}" \
  \( -size "${BS}x${BS}" xc:none -fill white -draw "circle $((BS/2)),$((BS/2)) $((BS/2)),2" \) \
  -compose DstIn -composite "$WORK/ball.png"

# Logo for the blue Android background: blue parts white, white stripes blue.
BLUE='#0b3d91'
magick "$WORK/mark.png" -fuzz 25% -fill '#ff00ff' -opaque white -fill white -opaque "$BLUE" \
  -fill "$BLUE" -opaque '#ff00ff' "$WORK/mark-on-blue.png"

# Logo scaled to a given width, centred on a square transparent canvas.
logo_on() { # size width out
  magick -size "$1x$1" xc:none \( "$WORK/mark.png" -resize "$2x" \) -gravity center -compose over -composite "$3"
}

# 1024 master: white rounded tile with the logo.
magick -size 1024x1024 xc:none -fill white -stroke '#d6e0ef' -strokewidth 4 \
  -draw 'roundrectangle 40,40 983,983 200,200' "$WORK/tile.png"
logo_on 1024 780 "$WORK/tile-logo.png"
magick "$WORK/tile.png" "$WORK/tile-logo.png" -compose over -composite "$SRC/app-icon.png"

# Android adaptive icon parts (108 dp canvas, 66 dp safe circle).
magick -size 1024x1024 xc:none \( "$WORK/mark-on-blue.png" -resize 560x \) -gravity center -compose over -composite "$SRC/android-fg.png"
magick -size 1024x1024 xc:"$BLUE" "$SRC/android-bg.png"
logo_on 1024 560 "$WORK/android-shape.png"
magick "$WORK/android-shape.png" -fill white -colorize 100 "$SRC/android-monochrome.png"

cat > "$SRC/manifest.json" <<JSON
{
  "default": "app-icon.png",
  "bg_color": "#ffffff",
  "android_bg": "android-bg.png",
  "android_fg": "android-fg.png",
  "android_fg_scale": 100,
  "android_monochrome": "android-monochrome.png"
}
JSON

npx tauri icon "$SRC/manifest.json"

# iOS rounds the icon itself and wants it opaque: full white square, logo in the middle.
for f in src-tauri/icons/ios/*.png; do
  size=$(magick identify -format '%w' "$f")
  logo_on "$size" $(( size * 80 / 100 )) "$WORK/ios-logo.png"
  magick -size "${size}x${size}" xc:white "$WORK/ios-logo.png" -compose over -composite -alpha off "$f"
done

# Android launchers without adaptive icons (before Android 8): rounded tile and round icon.
for dir in src-tauri/gen/android/app/src/main/res/mipmap-*dpi; do
  size=$(magick identify -format '%w' "$dir/ic_launcher.png")
  magick -size 1024x1024 xc:none -fill "$BLUE" -draw 'roundrectangle 40,40 983,983 200,200' \
    \( "$WORK/mark-on-blue.png" -resize 780x \) -gravity center -compose over -composite \
    -resize "${size}x${size}" "$dir/ic_launcher.png"
  magick -size 1024x1024 xc:none -fill "$BLUE" -draw 'circle 512,512 512,24' \
    \( "$WORK/mark-on-blue.png" -resize 700x \) -gravity center -compose over -composite \
    -resize "${size}x${size}" "$dir/ic_launcher_round.png"
done

# Small desktop sizes: the ball alone.
ball_at() { # size out
  local pad=$(( $1 / 16 ))
  magick "$WORK/ball.png" -resize "$(( $1 - 2 * pad ))x" -background none -gravity center -extent "$1x$1" "$2"
}
ball_at 32 src-tauri/icons/32x32.png
ball_at 30 src-tauri/icons/Square30x30Logo.png
ball_at 44 src-tauri/icons/Square44x44Logo.png
ball_at 16 "$WORK/ball16.png"; ball_at 24 "$WORK/ball24.png"; ball_at 48 "$WORK/ball48.png"
magick "$SRC/app-icon.png" -resize 64x64 "$WORK/tile64.png"
magick "$SRC/app-icon.png" -resize 256x256 "$WORK/tile256.png"
magick "$WORK/ball16.png" "$WORK/ball24.png" src-tauri/icons/32x32.png "$WORK/ball48.png" "$WORK/tile64.png" "$WORK/tile256.png" src-tauri/icons/icon.ico

# Web: favicons (ball), PWA icons (tile), maskable and Apple touch icon (opaque, safe area).
magick "$WORK/ball16.png" src-tauri/icons/32x32.png "$WORK/ball48.png" public/favicon.ico
cp src-tauri/icons/32x32.png public/favicon-32x32.png
magick "$SRC/app-icon.png" -resize 512x512 public/favicon.png
magick "$SRC/app-icon.png" -resize 512x512 public/pwa-512x512.png
magick "$SRC/app-icon.png" -resize 192x192 public/pwa-192x192.png
logo_on 512 380 "$WORK/maskable-logo.png"
magick -size 512x512 xc:white "$WORK/maskable-logo.png" -compose over -composite -alpha off public/pwa-maskable-512x512.png
logo_on 180 150 "$WORK/apple-logo.png"
magick -size 180x180 xc:white "$WORK/apple-logo.png" -compose over -composite -alpha off public/apple-touch-icon.png

echo "Icons regenerated from $SVG"
