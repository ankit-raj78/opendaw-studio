#!/usr/bin/env bash
set -euo pipefail
echo "clean"
rm -rf dist build-info.json gen
rm -rf app/src/data/boxes