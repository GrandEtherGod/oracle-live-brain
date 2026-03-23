# Contributing to AetherLinkOS / Theia Engine

## Branch Strategy

| Branch pattern | Purpose |
|----------------|---------|
| `main` / `master` | Stable, production-ready code |
| `feature/<name>` | New features |
| `fix/<name>` | Bug fixes |
| `claude/<task>-<id>` | Claude-automated work |

**Never commit directly to `main` or `master`.** Open a pull request from your feature branch.

---

## Workflow

```bash
# 1. Create a branch
git checkout -b feature/my-new-feature

# 2. Make changes and commit
git add <files>
git commit -m "feat: describe what this does"

# 3. Push and open a PR
git push -u origin feature/my-new-feature
```

---

## Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Use for |
|--------|---------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `refactor:` | Code change with no new feature or fix |
| `test:` | Adding or updating tests |
| `chore:` | Build process, tooling, dependency updates |

---

## Code Standards

- **TypeScript only** — all source files in `src/` must be `.ts`
- **Tests co-located** — place tests as `*.test.ts` next to the file they test
- **No committed secrets** — use `.env` (gitignored) for API keys and credentials
- **Update `docs/architecture.md`** when adding or significantly changing a module in `src/`

---

## Claude Code Sessions

If you're using Claude Code on the web:

- The SessionStart hook installs dependencies automatically
- The Stop hook will block your session from ending if you have uncommitted or unpushed changes — commit and push before finishing
- Project-specific skills are in `.claude/skills/` — use `/theia-dev` or `/voice-terminal` for relevant tasks

---

## Pull Request Checklist

- [ ] Branch is up to date with `main`
- [ ] Tests pass (`npm test`)
- [ ] Lint passes (`npm run lint`)
- [ ] `docs/architecture.md` updated if structure changed
- [ ] No `.env` or secrets committed
