# Changesets

This directory holds pending changesets — one markdown file per user-facing change, created by
`pnpm changeset`. Each file records which package(s) changed and how (patch/minor/major) plus a
changelog summary.

- **Adding a change**: run `pnpm changeset`, answer the prompts, commit the generated file
  alongside your code change in the same PR. See [CONTRIBUTING.md](../CONTRIBUTING.md#releasing).
- **Releasing**: handled automatically by `.github/workflows/release.yml` — merging changesets to
  `main` opens/updates a "Version Packages" PR; merging that PR publishes to npm.

Full docs: <https://github.com/changesets/changesets>
