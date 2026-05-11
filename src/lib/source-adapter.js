import fs from 'node:fs';
import path from 'node:path';
import { copyAsset, pathExists } from './fs-ops.js';

function sourceTypeDir(assetType) {
  return assetType;
}

function sourceLooksLikeDirectory(p) {
  return pathExists(p) && fs.statSync(p).isDirectory();
}

export function resolveSourcePath({ sourceRoot, assetType, name, destFormat, sourceFormatHint }) {
  const dirCandidate = path.join(sourceRoot, sourceTypeDir(assetType), name);
  const sourceFile = destFormat && destFormat.sourceFile;

  if (sourceLooksLikeDirectory(dirCandidate)) {
    if (destFormat && destFormat.type === 'file') {
      if (!sourceFile) {
        throw new Error(
          `Source for ${assetType}/${name} is a directory but destination is a file with no sourceFile declared. Add "sourceFile" to assetFormats.${assetType}.`,
        );
      }
      const filePath = path.join(dirCandidate, sourceFile);
      if (!pathExists(filePath)) {
        throw new Error(`Required source file missing: ${filePath}`);
      }
      return { path: filePath, kind: 'file' };
    }
    return { path: dirCandidate, kind: 'directory' };
  }

  const hint = sourceFormatHint || destFormat;
  if (hint && hint.type === 'file') {
    const filename = (hint.filename || '{name}').replace('{name}', name);
    const filePath = path.join(sourceRoot, sourceTypeDir(assetType), filename);
    if (pathExists(filePath)) return { path: filePath, kind: 'file' };
    throw new Error(`Source asset missing: ${filePath}`);
  }

  throw new Error(`Could not resolve source for ${assetType}/${name}`);
}

export function copyAssetAdaptive({ sourcePath, sourceKind, destPath, destFormat }) {
  if (sourceKind === 'directory' && destFormat.type === 'directory') {
    copyAsset(sourcePath, destPath, { type: 'directory' });
    return;
  }
  if (sourceKind === 'file' && destFormat.type === 'file') {
    copyAsset(sourcePath, destPath, { type: 'file' });
    return;
  }
  if (sourceKind === 'directory' && destFormat.type === 'file') {
    if (!destFormat.sourceFile) {
      throw new Error('copyAssetAdaptive: directory→file copy requires destFormat.sourceFile');
    }
    const innerFile = path.join(sourcePath, destFormat.sourceFile);
    copyAsset(innerFile, destPath, { type: 'file' });
    return;
  }
  throw new Error(
    `copyAssetAdaptive: unsupported combination — sourceKind=${sourceKind}, destType=${destFormat.type}`,
  );
}
