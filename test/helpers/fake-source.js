import fs from 'node:fs';
import path from 'node:path';
import { createTmpProject } from './tmp-project.js';

/**
 * Builds a fake source repo on disk with skills/agents/commands/hooks
 * laid out in the same shape as the real ai-toolkit repo. Used to
 * exercise install/update without depending on the real source tree.
 */
export function createFakeSource(spec = {}) {
  const dir = createTmpProject('ai-toolkit-fake-source-');
  const {
    skills = {},
    agents = {},
    commands = {},
    hooks = {},
    manifest = null,
    tools = null,
    toolsSchema = null,
  } = spec;

  for (const [name, files] of Object.entries(skills)) {
    const skillDir = path.join(dir, 'skills', name);
    fs.mkdirSync(skillDir, { recursive: true });
    for (const [filename, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(skillDir, filename), content);
    }
  }

  for (const [name, files] of Object.entries(agents)) {
    const agentDir = path.join(dir, 'agents', name);
    fs.mkdirSync(agentDir, { recursive: true });
    for (const [filename, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(agentDir, filename), content);
    }
  }

  fs.mkdirSync(path.join(dir, 'commands'), { recursive: true });
  for (const [name, content] of Object.entries(commands)) {
    fs.writeFileSync(path.join(dir, 'commands', `${name}.md`), content);
  }

  fs.mkdirSync(path.join(dir, 'hooks'), { recursive: true });
  for (const [name, content] of Object.entries(hooks)) {
    fs.writeFileSync(path.join(dir, 'hooks', name), content);
  }

  if (manifest) {
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  }

  if (tools || toolsSchema) {
    fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
    if (tools) {
      fs.writeFileSync(path.join(dir, 'config', 'tools.json'), JSON.stringify(tools, null, 2));
    }
    if (toolsSchema) {
      fs.writeFileSync(
        path.join(dir, 'config', 'tools.schema.json'),
        JSON.stringify(toolsSchema, null, 2),
      );
    }
  }

  return dir;
}
