import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { parseFrontmatter } from './frontmatter.js';

const TEMPLATE_RE = /^\{([a-zA-Z_][a-zA-Z0-9_]*)\}$/;

export function buildDestFrontmatter(template, sourceData, toolName) {
  if (!template) return null;

  const out = {};
  for (const [key, value] of Object.entries(template)) {
    if (typeof value === 'string') {
      const match = value.match(TEMPLATE_RE);
      if (match) {
        const sourceKey = match[1];
        if (sourceData && sourceData[sourceKey] != null) {
          out[key] = sourceData[sourceKey];
        }
        continue;
      }
    }
    out[key] = value;
  }

  const overrides = sourceData?.overrides?.[toolName];
  if (overrides && typeof overrides === 'object') {
    for (const [k, v] of Object.entries(overrides)) {
      out[k] = v;
    }
  }

  return out;
}

export function serializeMarkdownWithFrontmatter(frontmatter, body) {
  const dumped = yaml.dump(frontmatter, { lineWidth: -1, quotingType: '"', forceQuotes: false });
  const trimmedBody = body.startsWith('\n') ? body : `\n${body}`;
  return `---\n${dumped}---\n${trimmedBody}`;
}

export function writeAdaptedFile({ sourcePath, destPath, frontmatterTemplate, toolName }) {
  const raw = fs.readFileSync(sourcePath, 'utf8');
  const { data, body } = parseFrontmatter(raw);
  const newFm = buildDestFrontmatter(frontmatterTemplate, data, toolName);

  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  if (!newFm) {
    fs.writeFileSync(destPath, raw);
    return;
  }

  const cleanedBody = body.startsWith('\n') ? body.slice(1) : body;
  fs.writeFileSync(destPath, serializeMarkdownWithFrontmatter(newFm, cleanedBody));
}
