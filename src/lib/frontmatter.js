import yaml from 'js-yaml';

const MD_DELIMITER = /^---\r?\n/;
const SHELL_OPEN = /^\s*#\s*===\s*ai-toolkit metadata\s*===\s*$/;
const SHELL_CLOSE = /^\s*#\s*===\s*end metadata\s*===\s*$/;

function detectKind(content, opts) {
  if (opts && opts.kind) return opts.kind;
  if (MD_DELIMITER.test(content)) return 'markdown';
  return 'plain';
}

export function parseFrontmatter(content, opts = {}) {
  const kind = detectKind(content, opts);

  if (kind === 'markdown') return parseMarkdownFrontmatter(content);
  if (kind === 'shell') return parseShellFrontmatter(content);

  return { data: {}, body: content };
}

function parseMarkdownFrontmatter(content) {
  if (!MD_DELIMITER.test(content)) return { data: {}, body: content };

  const lines = content.split(/\r?\n/);
  // first non-empty line is "---"; find the closing "---"
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) {
    throw new Error('Malformed frontmatter: missing closing `---` delimiter');
  }
  const block = lines.slice(1, closeIdx).join('\n');
  let data;
  try {
    data = block.trim() === '' ? {} : yaml.load(block);
  } catch (err) {
    throw new Error(`Malformed YAML frontmatter: ${err.message}`);
  }
  if (data == null || typeof data !== 'object') data = {};
  const body = lines.slice(closeIdx + 1).join('\n');
  return { data, body };
}

function parseShellFrontmatter(content) {
  const lines = content.split(/\r?\n/);
  let openIdx = -1;
  let closeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (SHELL_OPEN.test(lines[i])) {
      openIdx = i;
      break;
    }
  }
  if (openIdx === -1) return { data: {}, body: content };
  for (let i = openIdx + 1; i < lines.length; i++) {
    if (SHELL_CLOSE.test(lines[i])) {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) {
    throw new Error('Malformed shell metadata: missing `# === end metadata ===` delimiter');
  }
  const yamlLines = [];
  for (let i = openIdx + 1; i < closeIdx; i++) {
    const stripped = lines[i].replace(/^\s*#\s?/, '');
    yamlLines.push(stripped);
  }
  const block = yamlLines.join('\n');
  let data;
  try {
    data = block.trim() === '' ? {} : yaml.load(block);
  } catch (err) {
    throw new Error(`Malformed YAML in shell metadata: ${err.message}`);
  }
  if (data == null || typeof data !== 'object') data = {};
  const before = lines.slice(0, openIdx);
  const after = lines.slice(closeIdx + 1);
  // Strip a single blank line between metadata and body if present.
  if (after[0] === '') after.shift();
  const body = [...before, ...after].join('\n');
  return { data, body };
}

export function stripFrontmatter(content, opts = {}) {
  return parseFrontmatter(content, opts).body;
}
