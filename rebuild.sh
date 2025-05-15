#!/usr/bin/env bash
clear
set -e
./clean.sh || exit 1
(cd lib && ./rebuild.sh) || exit 1
echo "install boxes"
(cd studio-boxes && npm install) || exit 1
echo "install studio"
(cd studio && npm install) || exit 1
echo "gen boxes"
(cd studio-boxes && npm run gen) || exit 1
echo "build studio"
(cd studio && npm run build) || exit 1
echo "done"