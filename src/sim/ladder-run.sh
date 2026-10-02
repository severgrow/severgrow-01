#!/usr/bin/env bash
# Runs the bot ladder pairings, each split over 4 processes (half the games each way).
# usage: bash src/sim/ladder-run.sh <dir> <games> a,b [a,b ...]
dir=$1; games=$2; shift 2
for pair in "$@"; do
  for p in 0 1 2 3; do
    npx tsx src/sim/ladder.ts --pair="$pair" --games="$games" --part=$p --parts=4 --dir="$dir" --ruleset="${RULESET:-sprout}" &
  done
  wait
done
echo "ladder done"
