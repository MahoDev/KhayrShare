<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
specs/006-multi-platform-publishing/plan.md
<!-- SPECKIT END -->

## Working with Git

Every meaningful chunk of work should be committed and pushed to the current
branch as soon as it is finished and working — not left piling up until a
later "big" commit.

- Commit **at the end of each relatively big change** (a new feature, a bug fix,
  a config/asset refresh, a refactor, etc.), before moving on to the next task.
- Split unrelated changes into **separate commits** by concern (feature, fix,
  chore, docs, assets). Don't bundle a feature fix with an unrelated config
  tweak into one commit.
- Commit message style: a short `type(scope): summary` subject line, with a
  short body explaining the *why* when it isn't obvious (existing history uses
  `feat:`, `fix:`, `chore:`, `docs:`, `plan:`).
- Keep the author identity as configured (`MahoDev`). Use `git commit` with
  the current user config; don't override the author.
- After committing, **push to the matching remote branch** so the work is
  never only local.
- Check `git status` before starting and after finishing a task so nothing
  uncommitted is silently left behind.
