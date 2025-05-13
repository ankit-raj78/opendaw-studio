#!/bin/bash
clear
set -e
sh ./clean.sh || exit 1
(cd lib && sh rebuild.sh) || exit 1
echo "install boxes"
(cd boxes && npm install) || exit 1
echo "install app"
(cd app && npm install) || exit 1
echo "gen boxes"
(cd boxes && npm run gen) || exit 1
echo "build app"
(cd app && npm run build) || exit 1
echo "done"