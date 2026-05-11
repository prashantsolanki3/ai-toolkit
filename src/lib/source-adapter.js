import fs from 'node:fs';
import path from 'node:path';
import { copyAsset, pathExists } from './fs-ops.js';
import { writeAdaptedFile } from './frontmatter-transform.js';

// The source repo's own asset layout — this is the canonical shape the
// toolkit ships, independent of any tool's destination format. Tools then
// adapt these into their own destination via copyAssetAdaptive.
const SOURCE_LAYOUT = {
  skills: { kind: 'directory' },
  agents: { kind: 'directory' },
  commands: { kind: 'file', filename: '{name}.md' },
  hooks: { kind: 'file', filename: '{name}.sh' },
  rules: { kind: 'file', filename: '{name}.mdc' },
};

function sourceTypeDir(assetType) {
  return assetType;
}

function sourceLooksLikeDirectory(p) {
  return pathExists(p) && fs.statSync(p).isDirectory();
}

export function resolveSourcePath({ sourceRoot, assetType, name, destFormat }) {
  const layout = SOURCE_LAYOUT[assetType];
  if (!layout) {
    throw new Error(`Unknown asset type "${assetType}" — extend SOURCE_LAYOUT in source-adapter.`);
  }

  const dir = path.join(sourceRoot, sourceTypeDir(assetType));

  if (layout.kind === 'directory') {
    const dirCandidate = path.join(dir, name);
    if (!sourceLooksLikeDirectory(dirCandidate)) {
      throw new Error(`Source asset missing: ${dirCandidate}`);
    }
    if (destFormat && destFormat.type === 'file') {
      const inner = destFormat.sourceFile;
      if (!inner) {
        throw new Error(
          `Source for ${assetType}/${name} is a directory but destination is a file with no sourceFile declared. Add "sourceFile" to assetFormats.${assetType}.`,
        );
      }
      const filePath = path.join(dirCandidate, inner);
      if (!pathExists(filePath)) {
        throw new Error(`Required source file missing: ${filePath}`);
      }
      return { path: filePath, kind: 'file' };
    }
    return { path: dirCandidate, kind: 'directory' };
  }

  // file-layout source
  const filename = (layout.filename || '{name}').replace('{name}', name);
  const filePath = path.join(dir, filename);
  if (!pathExists(filePath)) {
    throw new Error(`Source asset missing: ${filePath}`);
  }
  return { path: filePath, kind: 'file' };
}

export function copyAssetAdaptive({ sourcePath, sourceKind, destPath, destFormat, toolName }) {
  if (sourceKind === 'directory' && destFormat.type === 'directory') {
    copyAsset(sourcePath, destPath, { type: 'directory' });
    return;
  }
  if (sourceKind === 'file' && destFormat.type === 'file') {
    if (destFormat.frontmatter) {
      writeAdaptedFile({
        sourcePath,
        destPath,
        frontmatterTemplate: destFormat.frontmatter,
        toolName,
      });
      return;
    }
    copyAsset(sourcePath, destPath, { type: 'file' });
    return;
  }
  if (sourceKind === 'directory' && destFormat.type === 'file') {
    if (!destFormat.sourceFile) {
      throw new Error('copyAssetAdaptive: directory→file copy requires destFormat.sourceFile');
    }
    const innerFile = path.join(sourcePath, destFormat.sourceFile);
    if (destFormat.frontmatter) {
      writeAdaptedFile({
        sourcePath: innerFile,
        destPath,
        frontmatterTemplate: destFormat.frontmatter,
        toolName,
      });
      return;
    }
    copyAsset(innerFile, destPath, { type: 'file' });
    return;
  }
  throw new Error(
    `copyAssetAdaptive: unsupported combination — sourceKind=${sourceKind}, destType=${destFormat.type}`,
  );
}
