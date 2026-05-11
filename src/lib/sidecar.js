import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.js';
import { pathExists } from './fs-ops.js';

const TEMPLATE_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

function renderTemplate(value, context) {
  if (typeof value === 'string') {
    return value.replace(TEMPLATE_RE, (_, key) => (context[key] != null ? String(context[key]) : ''));
  }
  if (Array.isArray(value)) {
    return value.map((v) => renderTemplate(v, context));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = renderTemplate(v, context);
    }
    return out;
  }
  return value;
}

export function sidecarPath({ destPath, sidecarSpec, assetName }) {
  const fileName = renderTemplate(sidecarSpec.filename, { name: assetName });
  return path.join(path.dirname(destPath), fileName);
}

export function writeSidecar({ sourcePath, destPath, sidecarSpec, assetName, frontmatterKind }) {
  const raw = fs.readFileSync(sourcePath, 'utf8');
  const { data } = parseFrontmatter(raw, frontmatterKind ? { kind: frontmatterKind } : undefined);

  const context = {
    ...data,
    name: data.name || assetName,
    filename: path.basename(destPath),
  };
  const content = renderTemplate(sidecarSpec.content, context);
  const out = sidecarPath({ destPath, sidecarSpec, assetName });

  if (sidecarSpec.format === 'json') {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(content, null, 2) + '\n');
    return out;
  }
  throw new Error(`Unsupported sidecar format: ${sidecarSpec.format}`);
}

export function removeSidecar({ destPath, sidecarSpec, assetName }) {
  const p = sidecarPath({ destPath, sidecarSpec, assetName });
  if (pathExists(p)) fs.rmSync(p, { force: true });
}

export function frontmatterKindForFile(filename) {
  return filename.endsWith('.sh') ? 'shell' : undefined;
}
