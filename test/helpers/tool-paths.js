import path from 'node:path';

// The relative subdir each tool installs into within a project root.
// Mirrors the workspace defaultTarget in config/tools.json.
const WORKSPACE_SUBDIR = {
  'claude-code': '.claude',
  'cursor': '.cursor',
  'antigravity': '.agent/skills',
  'gemini-cli': '.gemini',
  'vscode-copilot': '.github',
  'copilot-cli': '.github',
  'kiro': '.kiro',
  'kiro-cli': '.kiro',
};

// Given a project root and tool name, return the directory the toolkit
// actually installs into.
export function toolDir(projectRoot, toolName) {
  const sub = WORKSPACE_SUBDIR[toolName];
  if (!sub) throw new Error(`unknown tool in tool-paths helper: ${toolName}`);
  return path.join(projectRoot, sub);
}
