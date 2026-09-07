## Environment & Terminal Constraints

- **OS:** Windows
- **Terminal:** WezTerm
- **Shell:** PowerShell
- **Installed Search Tools:** `rg` (ripgrep) and `fd` are installed and available in PATH.
- **Rules for Terminal Tool Calls:**
  - Execute commands using **PowerShell** syntax (e.g., use `$env:VAR = "value"` instead of `export`, `Test-Path` / `Get-ChildItem` instead of `find`, `Select-String` or `rg` instead of Linux `grep`).
  - Terminal is **WezTerm** on Windows: respect Windows file path conventions (`\`, drive letters like `C:\`, `G:\`).
  - Do not use interactive shell commands that hang without a pseudo-terminal unless specifically requested.

## Agent skills

### Issue tracker

Issues are tracked as GitHub issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage roles mapped to GitHub labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context domain docs (`CONTEXT.md` + `docs/adr/`). See `docs/agents/domain.md`.
