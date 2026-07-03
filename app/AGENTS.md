# Clean code rules for this repository

## UI implementation
- Use existing shadcn components before writing custom markup. Prefer `Button`, `Popover`, `Field`, `Input`, `Badge`, `Alert`, `Separator`, `Tooltip`, `Card`, and other local primitives when they exist.
- Use Tailwind utilities for component styling. Do not add feature-specific CSS selectors unless the user explicitly approves it.
- Use Tailwind classes for layout and spacing; use shadcn variants for component styling and states.
- Keep layout, interaction state, and rendering responsibilities readable. Extract constants or small local helpers when JSX becomes noisy.
- Reuse existing UI primitives from `app/components/ui` and existing icons before adding dependencies.
- Prefer semantic regions (`header`, `main`, `aside`, `footer`, `section`, `nav`) for large UI zones.

## Change boundaries
- Keep changes scoped to the requested feature. Do not edit unrelated dirty files.
- Preserve backend contracts, Convex APIs, save modes, and existing callback behavior unless the request explicitly changes them.
- Avoid broad refactors while fixing a focused UI issue.

## Validation
- Run `npm run typecheck` after TypeScript changes.
- Run `npm run build` when typecheck passes and the change affects shipped UI.
- For visible UI changes, verify desktop and mobile layout before considering the work complete.
