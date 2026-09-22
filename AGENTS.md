# Repository Guidelines

## Project Structure & Module Organization

This repository publishes a Vue 3 PDF reader. Keep reusable library code under `src/`:

- `src/VuePdfFlipbook.vue` owns reader state and page-flip integration.
- `src/components/PdfCanvasPage.vue` renders individual PDF.js pages.
- `src/types.ts` defines the public TypeScript API; `src/index.ts` is the package entry point.
- `src/style.css` contains component styles; `src/demo/` and `index.html` provide the showcase.
- `dist/` is generated publish output. Do not edit it manually.

There is no test directory. Add tests beside units as `*.spec.ts` or under `tests/`.

## Build, Test, and Development Commands

- `npm install` installs dependencies. Node.js 20 or newer is required.
- `npm run dev` starts the Vite demo for interactive PDF and animation checks.
- `npm run typecheck` runs strict Vue/TypeScript validation.
- `npm run build` builds the ES module, CSS, and declarations in `dist/`.
- `npm run preview` serves the production build locally.
- `npm run pack:check` previews exactly which files npm will publish.

Run `npm run build && npm run pack:check` before release-related changes.

## Coding Style & Naming Conventions

Use TypeScript, Vue 3 Composition API, two-space indentation, single quotes, and no semicolons. Name components in PascalCase, functions and refs in camelCase, and CSS classes with the `vpf-` prefix. Keep exported props, events, and exposed methods typed. Do not leak demo behavior into the library entry point.

No formatter or linter is configured; preserve the surrounding style and rely on `vue-tsc` for static validation.

## Testing Guidelines

Automated tests are not configured. For UI changes, manually verify single/double modes, button and drag flipping, zoom/pan, thumbnails, fullscreen, and a remote PDF URL. Confirm normal zoom has no overflow and test loading errors. If adding Vitest, use `ComponentName.spec.ts` and cover reported regressions.

## Commit & Pull Request Guidelines

The repository has no commit history yet. Use concise Conventional Commits, for example `fix: prevent active page overflow` or `feat: add thumbnail keyboard navigation`. Pull requests should explain user-visible behavior, list validation commands, link relevant issues, and include screenshots or a short recording for animation/layout changes. Call out any public API, dependency, bundle-size, or npm package-content change.

## Security & Configuration

Do not commit credentials or permanent signed PDF URLs. Remote PDFs must allow browser CORS access. Keep Vue as a peer dependency, and verify `package.json` exports whenever changing entry files, styles, or generated declarations.
