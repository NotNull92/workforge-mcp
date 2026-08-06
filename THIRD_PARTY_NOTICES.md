# Third-party notices

WorkForge is licensed under MIT. The Windows runtime ZIP contains production
npm packages installed from the versions pinned by `package-lock.json`; each package keeps
its own bundled package metadata and license files under `node_modules/`.

Direct project dependencies and build tools:

| Component | Version | License | Distribution role |
|---|---:|---|---|
| `@modelcontextprotocol/sdk` | 1.29.0 | MIT | Runtime ZIP |
| `zod` | 4.4.3 | MIT | Runtime ZIP |
| `typescript` | 7.0.2 | Apache-2.0 | Source build only |
| `vitest` | 4.1.10 | MIT | Source test only |
| `@types/node` | 24.13.3 | MIT | Source build only |
| OpenAI `tunnel-client` | 0.0.10 | Apache-2.0 | Downloaded and SHA-256 verified during installation |

The exact transitive production graph is locked in `package-lock.json` and reconstructed in
an isolated release staging directory with `npm ci --omit=dev --ignore-scripts`. The release
builder rejects development-only packages and runs the production dependency audit gate.

Before public upload, review the complete staged dependency graph and all upstream license
files. Dependency upgrades, portable runtime bundling, and installer tooling require a new
third-party license review rather than relying on this summary alone.
