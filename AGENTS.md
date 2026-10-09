<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Constitution

1. Do not overengineer.
2. Use ES6 syntax. E.g. Use `const func = () => {}` instead of `function func() {}`
3. Prefer modularized components.
4. Export functions that are used repeatedly across components. This follows the DRY (Do NOT Repeat Yourself) principle.
5. Use PascalCase to name components, files in `/components`, and types.
