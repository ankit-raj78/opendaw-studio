#!/bin/bash
echo "clean"
declare -a targets=("dist" "node_modules" "package-lock.json" "gen")
remove_targets() {
  for target in "${targets[@]}"; do
    find . -name "$target" -exec rm -rf {} +
  done
}
rm -rf app/src/data/boxes
remove_targets