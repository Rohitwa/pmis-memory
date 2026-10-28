#!/bin/bash
# Builds a local preview: same wrapper claude.ai adds, plus the fake runtime.
set -e
APP=$(cd "$(dirname "$0")/../../app" && pwd)
OUT=${1:-$(dirname "$0")/preview}
mkdir -p $OUT
cp $APP/style.css $APP/screens.js $APP/diary.js $APP/helper.js $OUT/
cp "$(dirname "$0")/fake-claude.js" $OUT/
{
  printf '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%%}[hidden]:not([hidden=until-found i]){display:none!important}</style><script src="fake-claude.js"></script></head><body>\n'
  cat $APP/index.html
  printf '\n</body></html>\n'
} > $OUT/index.html
