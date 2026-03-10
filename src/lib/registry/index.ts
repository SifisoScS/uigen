/**
 * Component Registry
 *
 * Read-only catalogue of all Shadcn/Radix primitives and higher-level composed
 * blocks available inside the UIGen virtual file-system.  Claude MUST compose
 * generated UIs exclusively from entries in this registry.
 */

export interface PropDef {
  type: string;
  required?: boolean;
  default?: string;
  description?: string;
}

export interface RegistryEntry {
  /** Short human-readable description of the component */
  description: string;
  /** Source import path (npm package or virtual alias) */
  importPath: string;
  /** Named export used in JSX */
  exportName: string;
  /** Prop shape – key: PropDef */
  props: Record<string, PropDef>;
  /** Minimal working usage snippet */
  exampleUsage: string;
  /** Whether it is a composed block (true) or a primitive (false) */
  isBlock?: boolean;
}

// ---------------------------------------------------------------------------
// Shadcn / Radix primitives
// ---------------------------------------------------------------------------

const primitives: Record<string, RegistryEntry> = {
  Button: {
    description: "Clickable action trigger with multiple variants and sizes.",
    importPath: "@/components/ui/button",
    exportName: "Button",
    props: {
      variant: {
        type: '"default" | "destructive" | "outline" | "secondary" | "ghost" | "link"',
        default: '"default"',
        description: "Visual style variant",
      },
      size: {
        type: '"default" | "sm" | "lg" | "icon"',
        default: '"default"',
        description: "Button size",
      },
      disabled: { type: "boolean", default: "false" },
      onClick: { type: "() => void" },
      children: { type: "React.ReactNode", required: true },
      className: { type: "string" },
      asChild: {
        type: "boolean",
        default: "false",
        description: "Render as child element via Radix Slot",
      },
    },
    exampleUsage: `import { Button } from "@/components/ui/button";
<Button variant="outline" size="sm" onClick={() => alert("clicked")}>
  Click me
</Button>`,
  },

  Input: {
    description: "Styled HTML text input.",
    importPath: "@/components/ui/input",
    exportName: "Input",
    props: {
      type: { type: "string", default: '"text"' },
      placeholder: { type: "string" },
      value: { type: "string" },
      onChange: { type: "(e: React.ChangeEvent<HTMLInputElement>) => void" },
      disabled: { type: "boolean", default: "false" },
      className: { type: "string" },
    },
    exampleUsage: `import { Input } from "@/components/ui/input";
<Input type="email" placeholder="you@example.com" />`,
  },

  Label: {
    description: "Accessible form label linked to an input via htmlFor.",
    importPath: "@/components/ui/label",
    exportName: "Label",
    props: {
      htmlFor: { type: "string" },
      children: { type: "React.ReactNode", required: true },
      className: { type: "string" },
    },
    exampleUsage: `import { Label } from "@/components/ui/label";
<Label htmlFor="email">Email address</Label>`,
  },

  Card: {
    description:
      "Surface container with optional header, content, and footer sub-components.",
    importPath: "@/components/ui/card",
    exportName: "Card",
    props: {
      children: { type: "React.ReactNode", required: true },
      className: { type: "string" },
    },
    exampleUsage: `import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
<Card>
  <CardHeader><CardTitle>Title</CardTitle></CardHeader>
  <CardContent>Body content</CardContent>
</Card>`,
  },

  Dialog: {
    description: "Modal overlay dialog with open/close state.",
    importPath: "@/components/ui/dialog",
    exportName: "Dialog",
    props: {
      open: { type: "boolean" },
      onOpenChange: { type: "(open: boolean) => void" },
      children: { type: "React.ReactNode", required: true },
    },
    exampleUsage: `import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
<Dialog>
  <DialogTrigger asChild><Button>Open</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader><DialogTitle>Hello</DialogTitle></DialogHeader>
    <p>Dialog body</p>
  </DialogContent>
</Dialog>`,
  },

  DropdownMenu: {
    description: "Accessible dropdown menu with keyboard navigation.",
    importPath: "@/components/ui/dropdown-menu",
    exportName: "DropdownMenu",
    props: {
      children: { type: "React.ReactNode", required: true },
    },
    exampleUsage: `import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
<DropdownMenu>
  <DropdownMenuTrigger asChild><Button variant="outline">Options</Button></DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Edit</DropdownMenuItem>
    <DropdownMenuItem>Delete</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`,
  },

  Tabs: {
    description: "Tabbed interface for switching between content panels.",
    importPath: "@/components/ui/tabs",
    exportName: "Tabs",
    props: {
      defaultValue: { type: "string" },
      value: { type: "string" },
      onValueChange: { type: "(value: string) => void" },
      children: { type: "React.ReactNode", required: true },
      className: { type: "string" },
    },
    exampleUsage: `import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="settings">Settings</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">Overview panel</TabsContent>
  <TabsContent value="settings">Settings panel</TabsContent>
</Tabs>`,
  },

  ScrollArea: {
    description: "Scrollable container with styled scrollbars.",
    importPath: "@/components/ui/scroll-area",
    exportName: "ScrollArea",
    props: {
      children: { type: "React.ReactNode", required: true },
      className: { type: "string" },
    },
    exampleUsage: `import { ScrollArea } from "@/components/ui/scroll-area";
<ScrollArea className="h-64">
  {items.map(i => <div key={i}>{i}</div>)}
</ScrollArea>`,
  },

  Separator: {
    description: "Horizontal or vertical visual divider.",
    importPath: "@/components/ui/separator",
    exportName: "Separator",
    props: {
      orientation: {
        type: '"horizontal" | "vertical"',
        default: '"horizontal"',
      },
      className: { type: "string" },
    },
    exampleUsage: `import { Separator } from "@/components/ui/separator";
<Separator className="my-4" />`,
  },

  Popover: {
    description: "Floating panel anchored to a trigger element.",
    importPath: "@/components/ui/popover",
    exportName: "Popover",
    props: {
      open: { type: "boolean" },
      onOpenChange: { type: "(open: boolean) => void" },
      children: { type: "React.ReactNode", required: true },
    },
    exampleUsage: `import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
<Popover>
  <PopoverTrigger asChild><Button>Open popover</Button></PopoverTrigger>
  <PopoverContent>Popover body</PopoverContent>
</Popover>`,
  },
};

// ---------------------------------------------------------------------------
// Higher-level composed blocks
// ---------------------------------------------------------------------------

const blocks: Record<string, RegistryEntry> = {
  PricingCard: {
    description:
      "Pricing tier card displaying plan name, price, feature list, and a CTA button.",
    importPath: "@/components/blocks/PricingCard",
    exportName: "PricingCard",
    isBlock: true,
    props: {
      planName: { type: "string", required: true, description: "Tier label, e.g. 'Pro'" },
      price: { type: "string", required: true, description: "Formatted price string, e.g. '$29/mo'" },
      features: { type: "string[]", required: true, description: "Array of feature strings" },
      ctaLabel: { type: "string", required: true, description: "Call-to-action button label" },
      onCta: { type: "() => void", description: "CTA button click handler" },
      highlighted: { type: "boolean", default: "false", description: "Show accent border and badge" },
      badge: { type: "string", description: "Optional badge text, e.g. 'Most Popular'" },
    },
    exampleUsage: `import { PricingCard } from "@/components/blocks/PricingCard";
<PricingCard
  planName="Pro"
  price="$29/mo"
  features={["Unlimited projects", "Priority support", "Custom domain"]}
  ctaLabel="Get started"
  highlighted
  badge="Most Popular"
/>`,
  },

  FeatureGrid: {
    description:
      "Responsive grid of feature items, each with an icon, title, and description.",
    importPath: "@/components/blocks/FeatureGrid",
    exportName: "FeatureGrid",
    isBlock: true,
    props: {
      features: {
        type: "Array<{ icon: React.ReactNode; title: string; description: string }>",
        required: true,
        description: "Array of feature objects",
      },
      columns: { type: "2 | 3 | 4", default: "3", description: "Grid column count" },
      className: { type: "string" },
    },
    exampleUsage: `import { FeatureGrid } from "@/components/blocks/FeatureGrid";
import { Zap, Shield, Globe } from "lucide-react";
<FeatureGrid
  columns={3}
  features={[
    { icon: <Zap />, title: "Fast", description: "Blazing fast builds" },
    { icon: <Shield />, title: "Secure", description: "Enterprise-grade security" },
    { icon: <Globe />, title: "Global", description: "Edge delivery worldwide" },
  ]}
/>`,
  },

  AuthForm: {
    description:
      "Sign-in / sign-up form with email, password fields and a submit button. Accepts a mode prop to toggle between auth modes.",
    importPath: "@/components/blocks/AuthForm",
    exportName: "AuthForm",
    isBlock: true,
    props: {
      mode: {
        type: '"signin" | "signup"',
        required: true,
        description: "Switches between sign-in and sign-up copy",
      },
      onSubmit: {
        type: "(email: string, password: string) => void",
        required: true,
      },
      onToggleMode: {
        type: "() => void",
        description: "Handler for switching between sign-in and sign-up",
      },
      isLoading: { type: "boolean", default: "false" },
      error: { type: "string", description: "Error message to display" },
    },
    exampleUsage: `import { AuthForm } from "@/components/blocks/AuthForm";
const [mode, setMode] = useState<"signin" | "signup">("signin");
<AuthForm
  mode={mode}
  onSubmit={(email, password) => console.log(email, password)}
  onToggleMode={() => setMode(m => m === "signin" ? "signup" : "signin")}
/>`,
  },

  DashboardHeader: {
    description:
      "Top navigation bar for dashboards: logo/brand, page title, search input, notifications bell, and user avatar menu.",
    importPath: "@/components/blocks/DashboardHeader",
    exportName: "DashboardHeader",
    isBlock: true,
    props: {
      brandName: { type: "string", required: true },
      pageTitle: { type: "string" },
      userEmail: { type: "string" },
      userInitials: { type: "string", description: "2-letter initials for avatar fallback" },
      onSearch: { type: "(query: string) => void" },
      notificationCount: { type: "number", default: "0" },
    },
    exampleUsage: `import { DashboardHeader } from "@/components/blocks/DashboardHeader";
<DashboardHeader
  brandName="Acme"
  pageTitle="Analytics"
  userEmail="alice@acme.com"
  userInitials="AL"
  notificationCount={3}
/>`,
  },

  SidebarNav: {
    description:
      "Collapsible left sidebar navigation with icon + label items grouped into sections.",
    importPath: "@/components/blocks/SidebarNav",
    exportName: "SidebarNav",
    isBlock: true,
    props: {
      items: {
        type: "Array<{ label: string; icon: React.ReactNode; href?: string; active?: boolean; badge?: string | number }>",
        required: true,
      },
      collapsed: { type: "boolean", default: "false" },
      onToggleCollapse: { type: "() => void" },
      brandName: { type: "string" },
      brandLogo: { type: "React.ReactNode" },
    },
    exampleUsage: `import { SidebarNav } from "@/components/blocks/SidebarNav";
import { LayoutDashboard, Users, Settings } from "lucide-react";
<SidebarNav
  brandName="Acme"
  items={[
    { label: "Dashboard", icon: <LayoutDashboard />, active: true },
    { label: "Users", icon: <Users />, badge: 12 },
    { label: "Settings", icon: <Settings /> },
  ]}
/>`,
  },
};

// ---------------------------------------------------------------------------
// Combined export
// ---------------------------------------------------------------------------

export const componentRegistry: Record<string, RegistryEntry> = {
  ...primitives,
  ...blocks,
};

/** Returns only primitive entries */
export const primitiveRegistry: Record<string, RegistryEntry> = primitives;

/** Returns only block entries */
export const blockRegistry: Record<string, RegistryEntry> = blocks;

/**
 * Returns a compact, human-readable list of all registered components
 * suitable for injecting into a system prompt.
 */
export function getRegistryList(): string {
  const lines: string[] = [];

  lines.push("### Primitives (from Shadcn/Radix)");
  for (const [name, entry] of Object.entries(primitives)) {
    lines.push(`- **${name}** — ${entry.description}`);
  }

  lines.push("");
  lines.push("### Composed Blocks");
  for (const [name, entry] of Object.entries(blocks)) {
    lines.push(`- **${name}** — ${entry.description}`);
  }

  return lines.join("\n");
}
