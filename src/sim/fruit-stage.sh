#!/usr/bin/env bash
# Runs named settings one after another, each split over 4 processes (v0.6 Fruit cards).
# usage: bash src/sim/fruit-stage.sh <dir> <games> <first-seed> name=json [name=json ...]
dir=$1; games=$2; first=$3; shift 3
for spec in "$@"; do
  name=${spec%%=*}; cfg=${spec#*=}
  for p in 0 1 2 3; do
    npx tsx src/sim/fruitcards.ts --name="$name" --config="$cfg" --games="$games" --part=$p --parts=4 --first="$first" --dir="$dir" &
  done
  wait
done
echo "stage done"
