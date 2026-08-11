#!/bin/sh
# Regenerate build/icon.png (the macOS app icon) from build/icon.svg.
#
# macOS app icons follow Apple's icon grid: a 1024x1024 transparent canvas
# with the artwork inside a rounded rectangle of 824x824 (corner radius ~185).
# Painting the full canvas makes the icon look oversized in the Dock.
#
# Requires ImageMagick (brew install imagemagick). Its built-in SVG renderer
# only handles the flat folder glyph in icon.svg, so the squircle background
# and drop shadow are composited here rather than drawn in the SVG.
set -eu
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Folder glyph, rendered at the SVG's natural 1024px then scaled to the grid.
magick -background none build/icon.svg -resize 688x688 "$tmp/glyph.png"

# Blue squircle: 824px rounded rect on a transparent 1024 canvas.
magick -size 824x824 xc:black -fill white \
  -draw "roundrectangle 0,0,823,823,185,185" "$tmp/mask.png"
magick -size 824x824 gradient:'#3b82f6'-'#1e40af' "$tmp/mask.png" \
  -alpha off -compose CopyOpacity -composite "$tmp/bg.png"
magick "$tmp/bg.png" -background none -gravity center -extent 1024x1024 "$tmp/canvas.png"

# Soft drop shadow under the glyph. The folder sits 21px below the centre of
# its own canvas (glyph centre is at 17/32 of the viewBox), hence the -21.
magick "$tmp/glyph.png" -background black -shadow 22x12+0+0 "$tmp/shadow.png"
magick "$tmp/canvas.png" \
  "$tmp/shadow.png" -gravity center -geometry +0-9 -composite \
  "$tmp/glyph.png" -gravity center -geometry +0-21 -composite \
  build/icon.png

echo "wrote build/icon.png"
