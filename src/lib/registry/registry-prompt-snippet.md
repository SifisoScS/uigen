## Component Registry — Strict Composition Rules

You MUST compose all UI **exclusively** using components from the registry below.

**Rules:**
1. Do NOT invent new component names that are not in the registry.
2. Do NOT add props that are not listed per component — pass only documented props.
3. For primitives, import from the listed `importPath` (e.g. `@/components/ui/button`).
4. For composed blocks, generate the block file if it does not exist yet, then import from `@/components/blocks/<ComponentName>`.
5. When a block does not perfectly fit the requirement, extend it via Tailwind `className` overrides — do not rewrite its interface.
6. If you truly need a component not in the registry, build it as a new local component **inside** the virtual FS and note it in a code comment — do not name it the same as a registry entry.

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

### Composed Blocks
- **PricingCard** — Pricing tier card displaying plan name, price, feature list, and a CTA button.
- **FeatureGrid** — Responsive grid of feature items, each with an icon, title, and description.
- **AuthForm** — Sign-in / sign-up form with email, password fields and a submit button.
- **DashboardHeader** — Top navigation bar for dashboards: logo/brand, page title, search, notifications, and user avatar.
- **SidebarNav** — Collapsible left sidebar navigation with icon + label items grouped into sections.

When generating or editing code, always check whether a registry component covers the need before writing custom JSX. Prefer **composition** over re-invention.
