# AGENTS.md — Frontend `/app`

## Scope

These instructions apply to this frontend directory and all children.

Stack assumptions for this area:

- TanStack Start
- TanStack Router
- React
- TypeScript
- shadcn/ui
- Tailwind CSS

Primary goal: keep the frontend maintainable, debuggable, and easy to refactor.
Do not create monolithic components. Do not hide complexity inside huge route files, huge JSX blocks, or anonymous helper functions.

---

## Official docs to prefer

When the implementation depends on framework behavior, prefer official docs over memory or guesses:

- TanStack Start overview: https://tanstack.com/start/latest/docs/framework/react/overview
- TanStack Start guides: https://tanstack.com/start/latest/docs/framework/react
- shadcn/ui docs: https://ui.shadcn.com/docs
- shadcn/ui TanStack Start install: https://ui.shadcn.com/docs/installation/tanstack
- shadcn CLI docs: https://ui.shadcn.com/docs/cli

When using a shadcn component API, inspect the local component first. If docs are needed and network is available, use:

```bash
pnpm dlx shadcn@latest docs <component>
```

Do not invent TanStack Start or shadcn APIs.

---

## Core working rules

Before modifying code:

1. Read the existing files related to the task.
2. Identify the current responsibilities and data flow.
3. Check existing naming, import aliases, UI primitives, and package scripts.
4. If the task touches more than two files or requires a refactor, write a short plan before editing.
5. Preserve behavior unless the user explicitly asks for a behavior change.
6. Prefer small, reviewable changes over broad rewrites.

After modifying code:

1. Run the relevant validation commands from `package.json`.
2. At minimum, try typecheck and lint when available.
3. Report exactly which commands were run and whether they passed.
4. If a command fails because of pre-existing errors, say so and include the relevant error summary.

Never add a production dependency without explicit approval.

---

## Target architecture

Prefer feature-based structure.

```txt
app/
  routes/
    __root.tsx
    index.tsx
    ...route files only

  features/
    <feature-name>/
      components/
        <feature-component>.tsx
      hooks/
        use-<feature-behavior>.ts
      lib/
        pure-helper.ts
      api/
        <feature-server-or-client-api>.ts
      types.ts
      constants.ts
      index.ts

  components/
    ui/
      shadcn primitives only
    layout/
      app-level layout components
    shared/
      reusable app components without business ownership

  lib/
    shared utilities only

  hooks/
    truly shared hooks only
```

Rules:

- Put feature-specific code in `features/<feature-name>`.
- Put generic UI primitives in `components/ui` only.
- Put reusable layout in `components/layout`.
- Put reusable app-level components in `components/shared`.
- Put pure helper functions in `lib/` close to the feature unless truly global.
- Use `index.ts` files only for intentional public exports. Do not create circular imports.

Do not move the whole app at once. Refactor progressively, feature by feature.

---

## TanStack Start rules

### Route files must stay thin

Route files should contain only:

- `createFileRoute` / route declaration
- route params and search params validation
- `loader`, `beforeLoad`, `head`, or route-level metadata
- route-level error/pending components when needed
- composition of a page or feature component

Route files should not contain:

- large JSX screens
- business logic
- complex forms
- canvas logic
- large tables
- modals with state machines
- duplicated UI blocks
- network calls hidden inside presentational components

If a route file grows beyond roughly 100 lines or contains meaningful UI, extract to:

```txt
features/<feature-name>/components/<feature-page>.tsx
```

### Data loading and server boundaries

- Use TanStack Start loaders or server functions for data that should participate in SSR or route-level loading.
- Do not fetch initial route data in `useEffect` when it should be loaded by the route.
- Keep server functions small and delegate business logic to feature services or server helpers.
- Validate every server function input. Use the existing validation library if one already exists.
- Authorize on the server for any private data access. Route guards are UX, not a security boundary.
- Do not import server-only code into client components.
- Do not use browser-only APIs in shared/server code.
- Do not manually edit generated route tree files.

### Search params and route params

- Validate and type route params/search params close to the route.
- Keep parsing/defaulting logic out of JSX.
- Prefer explicit defaults over scattered fallback values.

---

## shadcn/ui rules

shadcn/ui is treated as the project’s owned component source, but `components/ui` must remain generic.

### `components/ui` policy

Allowed in `components/ui`:

- shadcn-generated primitives
- small generic primitive improvements
- accessibility-preserving fixes
- theme-compatible variants that are useful globally

Forbidden in `components/ui`:

- feature-specific logic
- product/business wording
- API calls
- route logic
- feature state
- one-off page styles
- hardcoded domain behavior

For feature-specific usage, create wrappers in the feature folder:

```txt
features/<feature-name>/components/<specific-card>.tsx
features/<feature-name>/components/<specific-dialog>.tsx
```

### Adding shadcn components

Prefer the CLI instead of hand-copying component code:

```bash
pnpm dlx shadcn@latest add <component>
```

Before overwriting an existing primitive, inspect local changes. Do not use `--overwrite` unless explicitly intended.

### Composition and accessibility

- Preserve Radix/shadcn accessibility behavior.
- Do not replace accessible primitives with ad-hoc `div` elements.
- Use `Dialog`, `Popover`, `Tooltip`, `DropdownMenu`, `AlertDialog`, etc. for their intended use.
- Keep keyboard interactions intact.
- Add labels, `aria-label`, `aria-describedby`, and semantic HTML where needed.
- Use `asChild` when a link or custom component should inherit shadcn behavior.

### Styling

- Use Tailwind and existing design tokens.
- Use `cn()` for conditional class names.
- Avoid repeated huge `className` strings. Extract repeated layouts into components or small constants.
- Do not hardcode colors when a token exists.
- Do not introduce page-specific variants into global primitives.

---

## React component rules

### Size limits

These are soft limits, but crossing them requires extraction before adding more code:

- Component: about 150 lines max.
- File: about 250 lines max.
- Route file: about 100 lines max.
- More than 5 `useState`: extract a hook or reducer.
- More than 3 `useEffect`: review the design and extract synchronization logic.
- More than 6 event handlers in one component: extract a hook or child component.

### Component responsibilities

A component should have one primary responsibility.

Prefer this split:

- Page/container component: data composition and orchestration.
- Feature component: business-specific UI.
- Presentational component: markup and callbacks only.
- Hook: stateful behavior and effects.
- `lib` helper: pure computation.

Do not mix all of these in a single file.

### JSX rules

Avoid:

- very large JSX returns
- nested ternaries for business decisions
- render helper functions like `renderToolButton()` when a real component would be clearer
- duplicated button groups, cards, forms, toolbars, modals, or panels
- inline complex transformations inside JSX

Prefer:

- named child components
- explicit props
- small, typed component APIs
- mapping over typed configuration arrays for repeated UI
- pure helpers for formatting and transformations

### State rules

- Keep server state separate from UI state.
- Do not mirror props into state unless necessary.
- Use derived values instead of extra state when possible.
- Use `useReducer` for state machines or complex interactions.
- Use refs for imperative browser APIs only, not as a hidden state store unless justified.
- Keep effects focused on external synchronization.

### Hooks

Custom hooks should:

- have one clear responsibility
- expose a small typed API
- hide implementation details
- avoid returning giant bags of unrelated values
- be testable when they contain non-trivial logic

Good examples:

```txt
use-canvas-history.ts
use-image-loader.ts
use-draggable-toolbar.ts
use-keyboard-shortcuts.ts
use-search-params-state.ts
```

---

## TypeScript rules

- Avoid `any`. Use `unknown` plus narrowing when needed.
- Export public prop types for reusable components.
- Keep domain types in `features/<feature>/types.ts`.
- Keep global/shared types only when genuinely shared.
- Prefer discriminated unions for UI modes and workflows.
- Prefer explicit return types for exported functions and complex hooks.
- Do not suppress TypeScript errors with `as any` or `// @ts-ignore` unless there is a short written justification.

---

## Refactor rules

When refactoring, preserve behavior first.

Use this extraction order:

1. Types
2. Constants
3. Pure helpers
4. Hooks
5. Presentational components
6. Feature containers
7. Route/page orchestration

Do not refactor and redesign at the same time.
Do not refactor and add a feature at the same time unless the refactor is the minimum necessary to safely add the feature.

For a monolithic component, produce this target shape:

```txt
features/<feature-name>/
  components/
    <feature-root>.tsx
    <feature-header>.tsx
    <feature-sidebar>.tsx
    <feature-toolbar>.tsx
    <feature-footer>.tsx
    <small-reusable-piece>.tsx
  hooks/
    use-<state-or-interaction>.ts
  lib/
    <pure-helper>.ts
  types.ts
  constants.ts
  index.ts
```

The root component should orchestrate. It should not contain low-level business, canvas, formatting, or network logic.

---

## Specific anti-patterns to prevent

Do not create or extend components that contain all of this together:

- modal/dialog layout
- data loading
- low-level browser API logic
- keyboard shortcuts
- pointer/mouse interactions
- toolbar state
- form state
- save/export logic
- validation helpers
- large JSX

Instead, split by responsibility.

Example target for an image editor or retouching feature:

```txt
features/image-retouch/
  components/
    image-retouch-dialog.tsx
    retouch-dialog-header.tsx
    retouch-canvas-stage.tsx
    retouch-tool-sidebar.tsx
    floating-retouch-toolbar.tsx
    brush-settings-popover.tsx
    retouch-dialog-footer.tsx
    tool-button.tsx
  hooks/
    use-image-canvas-loader.ts
    use-canvas-history.ts
    use-canvas-pointer-tools.ts
    use-retouch-shortcuts.ts
    use-draggable-toolbar.ts
  lib/
    color.ts
    canvas-drawing.ts
    canvas-transform.ts
    image-export.ts
  types.ts
  constants.ts
```

---

## Feature development workflow

When adding a new feature:

1. Find the closest existing feature folder.
2. If none exists, create `features/<feature-name>`.
3. Keep the route file thin.
4. Build small components first.
5. Extract shared UI only after a second real use case appears.
6. Keep server calls in dedicated API/server files.
7. Add tests for pure helpers and critical behavior.

When modifying an existing messy file:

1. Do not add more complexity directly.
2. Extract the minimum safe pieces first.
3. Then implement the requested change.
4. Keep the diff reviewable.

---

## Testing and validation

Before final response, inspect `package.json` and run available scripts.

Prefer, in this order, using the detected package manager:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

If the project uses npm, yarn, or bun, use the equivalent scripts.

Testing expectations:

- Pure helpers in `lib/` should be unit tested when they contain branching or transformations.
- Hooks with complex state should be tested when the test setup exists.
- Refactors should not reduce existing coverage.
- Do not add brittle snapshot tests for large UI unless the project already uses them intentionally.

---

## Naming conventions

- Components: `PascalCase`.
- Hooks: `useSomething`.
- Files: follow the local convention. If no convention exists, use kebab-case for files.
- Props types: `ComponentNameProps`.
- Event handlers: `handleSomething`.
- Pure helpers: verb-based names like `formatPrice`, `parseSearchParams`, `buildCanvasTransform`.

Names must describe domain intent, not implementation noise.

---

## Import rules

- Use the existing `@/` alias when present.
- Keep imports ordered and remove unused imports.
- Do not create circular dependencies.
- Do not import from deep private files of another feature unless that file is intentionally exported.
- Cross-feature imports should go through the feature `index.ts` when a public API is needed.

---

## Definition of done

A task is done only when:

- the code is smaller or clearer than before
- route files remain thin
- shadcn primitives remain generic
- feature logic lives in feature folders
- duplicated JSX has been extracted or justified
- TypeScript passes, or failures are clearly reported
- lint passes, or failures are clearly reported
- behavior changes are explicitly listed
- no unrelated rewrites were introduced

---

## Final response format for Codex

At the end of a coding task, respond with:

1. Summary of changes.
2. Files modified.
3. Validation commands run and results.
4. Any known risks or follow-up refactors.

Keep the summary factual. Do not claim validation passed unless it actually ran and passed.
