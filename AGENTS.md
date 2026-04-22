# AGENTS.md

## Project

Snapfu is a Node.js CLI (ES Modules, plain JS — no TypeScript, no bundler) published to npm. It scaffolds and manages Athos Commerce Snap SDK projects. Entry point: `bin/snapfu.js` → `src/cli.js`.

## Commands

```bash
npm test              # Jest (with Babel transform, coverage on)
npm run format        # Prettier (uses @searchspring/prettier shared config)
npm run format-check  # Prettier check (CI-friendly)
npm run snapfu        # Run local CLI: npm run snapfu <command> --dev
```

There is no lint or typecheck step — only format and test.

## Development

- Run the CLI locally with `npm run snapfu <command> --dev` (the `--dev` flag enables debug output).
- Most commands need to be run inside a Snap project directory (one with an `athos` or `searchspring` key in its `package.json`).
- User auth state is stored in `~/.athoscommerce/`.

## Testing

- Jest config: `jest.config.json`. Tests live alongside source files as `*.test.js`.
- Tests use `temp-dir` + `fs-extra` to create throwaway project directories, and `memorystream` / `find-free-port` for I/O mocking.
- Coverage is collected automatically (`--collectCoverage`).
- Run a single test file: `npx jest src/context.test.js`.

## Pre-commit & CI

- Husky pre-commit hook runs `npx lint-staged` → Prettier on `src/**/*.js` and `package.json`.
- CI (GitHub Actions) runs `npm test` on PRs. Pushes to `main` trigger version bump (`standard-version`), npm publish, and metrics upload.
- Commit messages follow Conventional Commits (commitizen configured with `cz-conventional-changelog`).

## Architecture notes

- `src/cli.js` — argument parsing (via `arg`) and command dispatch (single `switch` block).
- `src/context.js` — reads the nearest `package.json` upward from cwd to detect Snap project config (`athos` or legacy `searchspring` key), git remote, and branch.
- `src/library.js` — clones/pulls `snapfu-library` repo into `~/.athoscommerce/snapfu-library/` for component templates.
- `src/login.js` — GitHub OAuth flow; credentials saved to `~/.athoscommerce/`.
- `src/patch/` — patch operations: `edit-json.js`, `edit-yaml.js`, `find-replace.js`.
- `src/services/ConfigApi.js` — HTTP client for the configuration API.

## Conventions

- ES Modules throughout (`"type": "module"` in package.json). Use `import`/`export`, not `require`.
- `__dirname`/`__filename` are manually derived via `fileURLToPath(import.meta.url)` where needed.
- Prettier is the only code style enforcer — no ESLint.
