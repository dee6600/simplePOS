#!/usr/bin/env bash
# Publishes an online (over-the-air) update to every family phone that has a v1.3+ build installed.
#
#   npm run publish-update -- "Fixed the summary total"
#
# Only JavaScript/screen changes can go out this way. A new native library (anything installed with
# `npx expo install` that has native code) or an app.json change to native settings needs a new APK /
# iPhone build: bump "runtimeVersion" in app.json for that build, so old phones don't get an update
# they can't run.
#
# The bundle is built here, where .env.local (the family's Firebase settings) is loaded, and is checked
# for those settings before anything is uploaded. Without them, sync would be switched off on every phone.
set -euo pipefail
cd "$(dirname "$0")/.."

MESSAGE="${1:-}"
if [ -z "$MESSAGE" ]; then
  echo 'Say what changed: npm run publish-update -- "Fixed the summary total"' >&2
  exit 1
fi
if [ ! -f .env.local ]; then
  echo '.env.local is missing (Firebase settings). See FIREBASE_SETUP.md.' >&2
  exit 1
fi

PROJECT_ID="$(sed -n 's/^EXPO_PUBLIC_FIREBASE_PROJECT_ID=//p' .env.local | tr -d '"'"'"' \r')"
if [ -z "$PROJECT_ID" ]; then
  echo 'EXPO_PUBLIC_FIREBASE_PROJECT_ID is not set in .env.local.' >&2
  exit 1
fi

npm test --silent
npx tsc --noEmit

rm -rf dist
npx expo export --platform android --platform ios --output-dir dist

for platform in android ios; do
  if ! grep -rqsa --include='*.hbc' --include='*.js' "$PROJECT_ID" "dist/_expo/static/js/$platform"; then
    echo "The $platform bundle has no Firebase settings in it. Not publishing." >&2
    exit 1
  fi
done
echo "Firebase settings found in both bundles."

npx eas-cli update --skip-bundler --input-dir dist --channel preview --environment preview \
  --message "$MESSAGE" --non-interactive
