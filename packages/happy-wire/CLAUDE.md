# Happy Wire Notes

## Session Protocol

- `sessionProtocol.ts` includes the additive `agent-configuration-changed` audit envelope with optional `permissionMode`, `model`, `thinkingLevel`, and `sandbox` string fields. In the current drawer slice this is schema-only: app and CLI control changes flow through session metadata echo, and the CLI does not emit the audit envelope.

## Package Exports

- Source tests in this package should import the package root through `./index` or `../index`, not `@slopus/happy-wire`; the build script removes `dist` before `tsc --noEmit`, so package self-references have no generated declarations during build.
- Root export changes should be followed by `pnpm --filter happy-wire build` so the committed `dist` files match the source export surface used by cross-package typechecks.
- Node-only subpath exports need both `package.json#exports` and `typesVersions`; `happy-server` still typechecks with older Node module resolution and will not resolve `./node` from exports alone.
