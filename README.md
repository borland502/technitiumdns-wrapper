# Technitium DNS CLI

Typed client and CLI for the [Technitium DNS Server](https://technitium.com/dns/) HTTP API. The project ships as a Bun single executable application (SEA) with reusable client utilities and commander-based commands.

> Note: This project is largely written by AI and may have undesirable/untested effects

## Prerequisites

- Bun 1.1+ (`curl -fsSL https://bun.sh/install | bash`)
- Go Task runner (`brew install go-task/tap/go-task` or download from [taskfile.dev](https://taskfile.dev/#/installation))
- Optional: `direnv` for loading environment variables

## Configuration

- On first run the CLI materializes `${XDG_CONFIG_HOME:-~/.config}/technitiumdns-cli/config.toml` using the embedded defaults
- `config/default.toml` remains the canonical template; copy or edit the generated config file for per-machine overrides
- Populate at least:
  - `api.baseUrl` (default `http://localhost:5380/api`)
  - `auth.username` and `auth.password` or `auth.token`
  - `auth.totp` when 2FA is enabled
- `technitiumdns-cli auth login` writes any returned session token to `auth.token` in the config file automatically

You can override any value using `config`-style environment variables, e.g. `export TECHNITIUMDNS_CLI_AUTH__TOKEN=...`.

## Install Dependencies

- `task init` installs node modules and produces `bun.lock`
- Alternatively run `bun install`

## Run From Source

- `bun run src/main.ts -- --help` shows top-level commands
- Examples:
  - `bun run src/main.ts -- auth login --include-info`
  - `bun run src/main.ts -- zones list --per-page 50`
  - `bun run src/main.ts -- zones records list --zone example.com --domain @`
- Use the `call` helper to hit any endpoint: `bun run src/main.ts -- call dashboard.stats.get --auth on`

## Build Artifacts

> NOTE: The generated config file stores credentials in plain text—guard `${XDG_CONFIG_HOME:-~/.config}/technitiumdns-cli/config.toml` accordingly.

- `task build` compiles the SEA for the current platform into `dist/technitiumdns-cli`
- Cross-compile targets:
  - `task build:linux`
  - `task build:windows`
  - `task build:darwin`
- `task dist` copies the current platform binary to `${XDG_BIN_HOME:-~/.local/bin}`
- `task run` executes the built binary (`dist/... --help`)

Launch the installed binary directly: `technitiumdns-cli zones list` (ensure `${XDG_BIN_HOME}` is on your `PATH`).

## Task Shortcuts

- `task lint` runs ESLint across the project
- `task lint:fix` applies auto-fixes
- `task format` formats with Prettier
- `task clean` removes artifacts from `dist/`

## Library Stack

- [Bun](https://bun.sh/docs/bundler/executables) for the runtime and SEA compilation
- [Commander](https://github.com/tj/commander.js/) for CLI ergonomics
- [Winston](https://github.com/winstonjs/winston) for structured logging
- [Task](https://taskfile.dev) for reproducible workflows
- [@iarna/toml](https://github.com/iarna/iarna-toml) plus [`config`](https://www.npmjs.com/package/config) for layered TOML configuration

## Examples

- Authenticate and store a fresh token: `technitiumdns-cli auth login --include-info`
- List cached domains: `technitiumdns-cli cache list --domain example.com`
- Add an A record: `technitiumdns-cli zones records add --zone example.com --domain www --type A --ip-address 203.0.113.10`
- Flush the cache: `technitiumdns-cli cache flush`
- Call arbitrary endpoints: `technitiumdns-cli call dns.resolve -q name=example.com -q type=AAAA`

Refer to `technitiumdns-cli endpoints` to discover every cataloged API identifier.
