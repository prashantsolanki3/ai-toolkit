# Guide: adding a new tool

Adding support for a new AI coding tool means **adding one block to [`config/tools.json`](../../config/tools.json)** and nothing else. The multi-tool integration matrix, the install/update/remove commands, the lockfile, and the autodiscovery logic all key off this config — they don't need to be touched.

## Anatomy of a tool block

```jsonc
{
  "tools": {
    "my-tool": {
      "displayName": "My Tool",
      "defaultTarget": {
        "global":    "~/.my-tool",   // absolute path, or null if not supported
        "workspace": ".my-tool"      // relative path, joined with the project root
      },
      "assetPaths": {
        "skills":   "skills",        // <subdir under defaultTarget>
        "rules":    "rules",         // some types only — declare each one the tool reads
        "commands": ""               // empty string => the destination IS defaultTarget
      },
      "assetFormats": {
        "skills": {
          "filename":    "SKILL.md",                // for directory format, the filename inside the folder
          "type":        "directory"                // "directory" or "file"
        },
        "rules": {
          "filename":    "{name}.mdc",              // "{name}" substitutes the asset name
          "type":        "file",
          "sourceFile":  "SKILL.md",                // if source is a directory but dest is a single file, which inner file to use
          "frontmatter": {                          // optional: write tool-specific frontmatter to the dest
            "description": "{description}",         // {key} substitutes from source frontmatter
            "globs":       "",                      // literal default
            "alwaysApply": false
          }
        },
        "commands": {
          "filename": "{name}.prompt.md",
          "type":     "file",
          "frontmatter": { "description": "{description}", "mode": "agent" }
        }
      },
      "supportedAssets": ["skills", "rules", "commands"],
      "notes": "Human-readable context. Especially useful for tools whose contract is uncertain or evolving."
    }
  }
}
```

## Field reference

| Field | Required | Meaning |
| --- | --- | --- |
| `displayName` | yes | Used in CLI output (logs, errors). |
| `defaultTarget.workspace` | one of the two | Relative subdir under the project root. |
| `defaultTarget.global` | one of the two | Absolute path (often `~/.tool`). Set to `null` if the tool has no global scope. |
| `assetPaths.<type>` | per supported asset type | Subdir under the resolved install dir. `""` means "land at the install dir root". |
| `assetFormats.<type>.filename` | yes | Filename pattern. `{name}` substitutes the asset's name. For directory-type, this is the filename *inside* the folder (e.g. `SKILL.md`). |
| `assetFormats.<type>.type` | yes | `"directory"` or `"file"`. |
| `assetFormats.<type>.sourceFile` | when dir source → file dest | Relative path within the source directory that becomes the destination file (e.g. `agent.md`). Required for dir→file conversions; the install will error if missing. |
| `assetFormats.<type>.frontmatter` | optional | YAML template object. Keys are literal; values can be `{sourceKey}` template strings substituted from source frontmatter, or literals. |
| `assetFormats.<type>.sidecar` | optional | Sibling file generated alongside the asset. Currently supports `format: "json"` with a `content` template. |
| `supportedAssets` | yes | List of asset types this tool understands. Unlisted types are dropped with a warning at install. |
| `notes` | optional | Free-form caveats. Surfaced in `ai-toolkit list --type tools`. |

## Step by step

### 1. Decide which asset types your tool supports

Read your tool's docs. For each of `skills`, `agents`, `commands`, `hooks`, `rules`, decide:

- Does the tool consume this category?
- If yes: where on disk does it look? What filename pattern? What frontmatter, if any?

Some tools only support one asset type (Antigravity = skills only). Others map our types to their own primitives (Cursor "rules" cover what we'd call skills + rules, and Cursor subagents at `.cursor/agents/` map to agents; VS Code Copilot uses `.github/instructions/` for skills, `.github/prompts/` for commands, and `.github/agents/` for [custom agents](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-custom-agents)).

### 2. Append the block to `config/tools.json`

Copy an existing block that's close in shape and modify it. Examples to crib from:

- **Single asset type, file format**: see `kiro-cli` (steering only).
- **Single asset type, directory format**: see `antigravity` (skills only, `assetPaths.skills` is empty so they land at the root).
- **Multiple types with frontmatter transform**: see `cursor` (description + globs + alwaysApply) and `vscode-copilot` (description + applyTo for instructions, mode for prompts).
- **Hook with sidecar**: see `kiro` (generates a `.kiro.hook` JSON next to the script).

### 3. Validate the schema

```bash
make verify-tools
```

The JSON schema in [`config/tools.schema.json`](../../config/tools.schema.json) enforces the shape. Errors are mechanical and call out the offending field.

### 4. Run the test suite

```bash
make test
```

The multi-tool integration matrix automatically expands to cover the new tool. You should see 4 additional test cases under `matrix: <your-tool>`.

### 5. Pin the per-tool paths

Add a test in [`test/integration/per-tool-paths.test.js`](../../test/integration/per-tool-paths.test.js) that pins the exact destination layout you expect. Following the existing pattern:

```js
test('my-tool: skills land as <subdir>/<filename>', async () => {
  const target = createTmpProject();
  try {
    await install({ tool: 'my-tool', skills: ['skill-evaluator'], target, sourceRoot: REPO_ROOT, logger: silentLogger() });
    assert.ok(fs.existsSync(path.join(toolDir(target, 'my-tool'), 'skills', '<expected file>')));
  } finally {
    cleanupTmpProject(target);
  }
});
```

Then add `'my-tool': '<workspace-subdir>'` to [`test/helpers/tool-paths.js`](../../test/helpers/tool-paths.js).

### 6. Update [`docs/verification-matrix.md`](../verification-matrix.md)

Add a section for your tool describing the manual ingestion check: open the workspace in the tool, navigate to where the assets should appear, confirm they're surfaced. Note any caveats (settings that need to be enabled, paths that vary by version).

### 7. Bootstrap with the new tool

`make bootstrap` will pick up the new tool automatically (it runs `install` with no `--tool` flag, which loops every block in `config/tools.json`). Run it and confirm the new subdir appears.

## Sharing a destination with another tool

If your tool reads the same files as an existing one (Copilot CLI shares `.github/` with VS Code Copilot, Kiro CLI shares `.kiro/` with Kiro), the toolkit detects this at install time. The first tool to resolve the dir wins; subsequent tools targeting the same dir are skipped with a "destination already populated by a previous tool in this run" message.

If your tool has overlapping but not identical needs (e.g. a richer frontmatter), put the richer one first in `config/tools.json` so it wins when both are installed in one call.

## Things to watch

- **Frontmatter templates aren't validated against the tool's actual contract.** If Cursor adds a required field to `.mdc` frontmatter, the toolkit will happily emit `.mdc` files missing that field. The verification matrix catches this; the schema doesn't.
- **`sourceFile` is mandatory for dir → file conversions.** Forgetting it produces a clear error at install time, not silent corruption.
- **`notes` is for the human reading `ai-toolkit list --type tools`.** Use it to flag uncertainty, version sensitivity, or required setup ("VS Code Copilot needs `chat.promptFiles: true` for instructions to load").
