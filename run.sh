#!/usr/bin/env sh

yarn tsc -p .
yarn node lib/main.js -c apps.yaml
