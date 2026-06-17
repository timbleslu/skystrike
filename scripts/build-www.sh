#!/bin/sh
# Assemble the static web build Capacitor wraps. No bundler: the game is plain scripts.
set -e
cd "$(dirname "$0")/.."
rm -rf www
mkdir -p www
cp index.html styles.css www/
cp -R js vendor www/
# Runtime asset dirs (e.g. assets/maps/*.svg used by the geographic ops map as a CSS background).
[ -d assets ] && cp -R assets www/
echo "www/ ready"
