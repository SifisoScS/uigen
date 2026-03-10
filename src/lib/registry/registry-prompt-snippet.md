## Component Registry — Strict Composition Rules

You MUST compose all UI **exclusively** using components from the registry below.

**Rules:**
1. Do NOT invent new component names that are not in the registry.
2. Do NOT add props that are not listed per component — pass only documented props.
3. For primitives, import from the listed `importPath` (e.g. `@/components/ui/button`).
4. For composed blocks, generate the block file if it does not exist yet, then import from `@/components/blocks/<ComponentName>`.
5. When a block does not perfectly fit the requirement, extend it via Tailwind `className` overrides — do not rewrite its interface.
6. If you truly need a component not in the registry, build it as a new local component **inside** the virtual FS and note it in a code comment — do not name it the same as a registry entry.
7. **Use the `insert_registry_component` tool** when adding a registry component to an existing file. It validates your props against the registry schema and returns the exact import line + JSX snippet to insert via `str_replace_editor`. This is the preferred path for incremental additions.

### Primitives (from Shadcn/Radix)
- **Button** — Clickable action trigger with multiple variants and sizes.
- **Input** — Styled HTML text input.
- **Label** — Accessible form label linked to an input via htmlFor.
- **Card** — Surface container with optional header, content, and footer sub-components.
- **Dialog** — Modal overlay dialog with open/close state.
- **DropdownMenu** — Accessible dropdown menu with keyboard navigation.
- **Tabs** — Tabbed interface for switching between content panels.
- **ScrollArea** — Scrollable container with styled scrollbars.
- **Separator** — Horizontal or vertical visual divider.
- **Popover** — Floating panel anchored to a trigger element.
- **Badge** — Small status label / tag with variant-based color coding.
- **Avatar** — Circular user avatar with image and initials fallback.
- **Tooltip** — Hover tooltip anchored to a trigger element.
- **Alert** — Inline alert banner with icon, title, and description.
- **Sheet** — Slide-over panel (drawer) from any screen edge.
- **Accordion** — Vertically stacked collapsible sections.
- **Command** — Command palette / combobox with search and keyboard shortcuts.
- **Calendar** — Interactive date-picker built on react-day-picker.
- **Toast** — Non-blocking notification via Sonner (`toast.success()`, `toast.error()`, etc.)

### Composed Blocks
- **PricingCard** — Pricing tier card with plan name, price, feature list, and CTA.
- **FeatureGrid** — Responsive grid of icon + title + description feature items.
- **AuthForm** — Sign-in / sign-up form with email, password, and mode toggle.
- **DashboardHeader** — Top nav bar with brand, search, notifications, and avatar.
- **SidebarNav** — Collapsible left sidebar with icon + label nav items.
- **DataTable** — Sortable, filterable table with pagination via @tanstack/react-table.

### `insert_registry_component` tool
Call this tool whenever you want to add a registry component to an existing file:
```
insert_registry_component({
  name: "Button",                         // must exist in registry
  props: { variant: "outline", children: "Click me" },
  targetFile: "/components/MyForm.tsx",   // optional, defaults to /App.tsx
  alias: "PrimaryButton"                  // optional local alias
})
```
The tool validates props, generates the import line + JSX snippet, and returns both for you to insert via `str_replace_editor`.

When generating or editing code, always check whether a registry component covers the need before writing custom JSX. Prefer **composition** over re-invention.
