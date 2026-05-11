#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node --input-type=module -e "
import Ajv from 'ajv';
import fs from 'node:fs';
const schema = JSON.parse(fs.readFileSync('config/tools.schema.json'));
const data = JSON.parse(fs.readFileSync('config/tools.json'));
const ajv = new Ajv.default({ allErrors: true });
const valid = ajv.validate(schema, data);
if (!valid) { console.error(ajv.errors); process.exit(1); }
console.log('✓ tools.json valid');
"
