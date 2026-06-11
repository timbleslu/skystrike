#!/bin/sh
# Assemble the static web build Capacitor wraps. No bundler: the game is plain scripts.
set -e
cd "$(dirname "$0")/.."
rm -rf www
mkdir -p www
cp index.html styles.css www/
cp -R js vendor www/
echo "www/ ready"
