#!/bin/sh
# Rebuilds public/board3d.js (the 3D board, with the parts of three.js it uses) from tools/board3d.src.js.
# Only needed when you change the 3D board. Run from the checkmate folder: sh tools/build-3d.sh
set -e
npx esbuild tools/board3d.src.js --bundle --minify --format=esm --target=es2020 --legal-comments=eof --outfile=public/board3d.js
echo "Built public/board3d.js. Bump ?v= on board3d.js in public/index.html and CACHE in public/sw.js."
