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

  Badge: {
    description: "Small status or label indicator with multiple variant styles.",
    importPath: "@/components/ui/badge",
    exportName: "Badge",
    props: {
      variant: {
        type: '"default" | "secondary" | "destructive" | "outline"',
        default: '"default"',
        description: "Visual style variant",
      },
      children: { type: "React.ReactNode", required: true },
      className: { type: "string" },
    },
    exampleUsage: `import { Badge } from "@/components/ui/badge";
<Badge variant="secondary">New</Badge>`,
  },

  Avatar: {
    description: "User avatar with image and initials fallback.",
    importPath: "@/components/ui/avatar",
    exportName: "Avatar",
    props: {
      children: { type: "React.ReactNode", required: true },
      className: { type: "string" },
    },
    exampleUsage: `import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
<Avatar>
  <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
  <AvatarFallback>CN</AvatarFallback>
</Avatar>`,
  },

  Tooltip: {
    description: "Accessible floating label that appears on hover/focus.",
    importPath: "@/components/ui/tooltip",
    exportName: "Tooltip",
    props: {
      children: { type: "React.ReactNode", required: true },
      delayDuration: { type: "number", default: "700" },
    },
    exampleUsage: `import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild><Button variant="outline">Hover me</Button></TooltipTrigger>
    <TooltipContent><p>Helpful hint</p></TooltipContent>
  </Tooltip>
</TooltipProvider>`,
  },

  Alert: {
    description: "Informational alert box with optional title and icon.",
    importPath: "@/components/ui/alert",
    exportName: "Alert",
    props: {
      variant: {
        type: '"default" | "destructive"',
        default: '"default"',
      },
      children: { type: "React.ReactNode", required: true },
      className: { type: "string" },
    },
    exampleUsage: `import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
<Alert variant="destructive">
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>Something went wrong.</AlertDescription>
</Alert>`,
  },

  Sheet: {
    description: "Slide-in panel (drawer) from any screen edge.",
    importPath: "@/components/ui/sheet",
    exportName: "Sheet",
    props: {
      open: { type: "boolean" },
      onOpenChange: { type: "(open: boolean) => void" },
      children: { type: "React.ReactNode", required: true },
    },
    exampleUsage: `import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
<Sheet>
  <SheetTrigger asChild><Button>Open</Button></SheetTrigger>
  <SheetContent side="right">
    <SheetHeader><SheetTitle>Panel title</SheetTitle></SheetHeader>
    <p>Sheet body content</p>
  </SheetContent>
</Sheet>`,
  },

  Accordion: {
    description: "Vertically collapsing/expanding content sections.",
    importPath: "@/components/ui/accordion",
    exportName: "Accordion",
    props: {
      type: {
        type: '"single" | "multiple"',
        required: true,
        description: "Whether one or many items can be open simultaneously",
      },
      collapsible: { type: "boolean", default: "false" },
      defaultValue: { type: "string | string[]" },
      children: { type: "React.ReactNode", required: true },
      className: { type: "string" },
    },
    exampleUsage: `import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
<Accordion type="single" collapsible>
  <AccordionItem value="item-1">
    <AccordionTrigger>Is it accessible?</AccordionTrigger>
    <AccordionContent>Yes, it follows WAI-ARIA patterns.</AccordionContent>
  </AccordionItem>
</Accordion>`,
  },

  Command: {
    description: "Command palette / combobox for search and keyboard-driven navigation.",
    importPath: "@/components/ui/command",
    exportName: "Command",
    props: {
      children: { type: "React.ReactNode", required: true },
      className: { type: "string" },
    },
    exampleUsage: `import { Command, CommandInput, CommandList, CommandItem, CommandGroup } from "@/components/ui/command";
<Command>
  <CommandInput placeholder="Search..." />
  <CommandList>
    <CommandGroup heading="Suggestions">
      <CommandItem>Calendar</CommandItem>
      <CommandItem>Search emoji</CommandItem>
    </CommandGroup>
  </CommandList>
</Command>`,
  },

  Calendar: {
    description: "Date picker calendar with selectable days.",
    importPath: "@/components/ui/calendar",
    exportName: "Calendar",
    props: {
      mode: { type: '"single" | "range" | "multiple"', default: '"single"' },
      selected: { type: "Date | Date[] | DateRange | undefined" },
      onSelect: { type: "(date: Date | undefined) => void" },
      className: { type: "string" },
      disabled: { type: "boolean | ((date: Date) => boolean)", default: "false" },
    },
    exampleUsage: `import { Calendar } from "@/components/ui/calendar";
import { useState } from "react";
const [date, setDate] = useState<Date | undefined>();
<Calendar mode="single" selected={date} onSelect={setDate} />`,
  },

  Toaster: {
    description: "Sonner toast notification system. Place <Toaster /> once in layout; use toast() from 'sonner' anywhere.",
    importPath: "sonner",
    exportName: "Toaster",
    props: {
      position: {
        type: '"top-left" | "top-right" | "bottom-left" | "bottom-right" | "top-center" | "bottom-center"',
        default: '"bottom-right"',
      },
      richColors: { type: "boolean", default: "false" },
      expand: { type: "boolean", default: "false" },
    },
    exampleUsage: `import { Toaster } from "sonner";
import { toast } from "sonner";
// In layout:
<Toaster richColors />
// To fire a toast:
toast.success("Saved successfully!");
toast.error("Something went wrong.");`,
  },

  Select: {
    description: "Accessible native-like select dropdown built on Radix UI.",
    importPath: "@/components/ui/select",
    exportName: "Select",
    props: {
      value: { type: "string" },
      defaultValue: { type: "string" },
      onValueChange: { type: "(value: string) => void" },
      disabled: { type: "boolean", default: "false" },
      children: { type: "React.ReactNode", required: true },
    },
    exampleUsage: `import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
<Select onValueChange={(v) => console.log(v)}>
  <SelectTrigger className="w-40">
    <SelectValue placeholder="Pick one" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="apple">Apple</SelectItem>
    <SelectItem value="banana">Banana</SelectItem>
  </SelectContent>
</Select>`,
  },

  Switch: {
    description: "Toggle switch for boolean on/off state.",
    importPath: "@/components/ui/switch",
    exportName: "Switch",
    props: {
      checked: { type: "boolean" },
      defaultChecked: { type: "boolean", default: "false" },
      onCheckedChange: { type: "(checked: boolean) => void" },
      disabled: { type: "boolean", default: "false" },
      id: { type: "string" },
      className: { type: "string" },
    },
    exampleUsage: `import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
const [enabled, setEnabled] = useState(false);
<div className="flex items-center gap-2">
  <Switch id="notifications" checked={enabled} onCheckedChange={setEnabled} />
  <Label htmlFor="notifications">Notifications</Label>
</div>`,
  },

  Slider: {
    description: "Range slider for numeric input within a min/max range.",
    importPath: "@/components/ui/slider",
    exportName: "Slider",
    props: {
      value: { type: "number[]" },
      defaultValue: { type: "number[]", default: "[0]" },
      onValueChange: { type: "(value: number[]) => void" },
      min: { type: "number", default: "0" },
      max: { type: "number", default: "100" },
      step: { type: "number", default: "1" },
      disabled: { type: "boolean", default: "false" },
      className: { type: "string" },
    },
    exampleUsage: `import { Slider } from "@/components/ui/slider";
const [volume, setVolume] = useState([50]);
<Slider
  value={volume}
  onValueChange={setVolume}
  min={0}
  max={100}
  step={1}
  className="w-64"
/>`,
  },

  ResizablePanelGroup: {
    description: "Drag-to-resize panel layout. Use ResizablePanelGroup, ResizablePanel, and ResizableHandle.",
    importPath: "@/components/ui/resizable",
    exportName: "ResizablePanelGroup",
    props: {
      direction: { type: '"horizontal" | "vertical"', required: true },
      children: { type: "React.ReactNode", required: true },
      className: { type: "string" },
      onLayout: { type: "(sizes: number[]) => void" },
    },
    exampleUsage: `import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
<ResizablePanelGroup direction="horizontal" className="h-full">
  <ResizablePanel defaultSize={25}>
    <div className="p-4">Sidebar</div>
  </ResizablePanel>
  <ResizableHandle />
  <ResizablePanel defaultSize={75}>
    <div className="p-4">Main content</div>
  </ResizablePanel>
</ResizablePanelGroup>`,
  },

  HoverCard: {
    description: "Rich preview card that appears when hovering over a trigger element.",
    importPath: "@/components/ui/hover-card",
    exportName: "HoverCard",
    props: {
      openDelay: { type: "number", default: "700" },
      closeDelay: { type: "number", default: "300" },
      children: { type: "React.ReactNode", required: true },
    },
    exampleUsage: `import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
<HoverCard>
  <HoverCardTrigger asChild>
    <a href="#" className="underline">@username</a>
  </HoverCardTrigger>
  <HoverCardContent className="w-72">
    <div className="flex gap-3">
      <Avatar><AvatarFallback>UN</AvatarFallback></Avatar>
      <div><p className="font-semibold">@username</p><p className="text-sm text-muted-foreground">Joined January 2023</p></div>
    </div>
  </HoverCardContent>
</HoverCard>`,
  },

  Form: {
    description: "react-hook-form wrapper components for accessible, validated forms with Zod schemas.",
    importPath: "@/components/ui/form",
    exportName: "Form",
    props: {
      children: { type: "React.ReactNode", required: true },
    },
    exampleUsage: `import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const schema = z.object({ email: z.string().email() });
function MyForm() {
  const form = useForm({ resolver: zodResolver(schema) });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(console.log)} className="space-y-4">
        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl><Input placeholder="you@example.com" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}`,
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

  DataTable: {
    description:
      "Feature-rich data table with sortable columns, pagination, and row selection. Build inline using Shadcn Table primitives.",
    importPath: "@/components/ui/table",
    exportName: "Table",
    isBlock: true,
    props: {
      data: {
        type: "T[]",
        required: true,
        description: "Array of row data objects",
      },
      columns: {
        type: "Array<{ key: keyof T; header: string; sortable?: boolean; render?: (value: T[keyof T], row: T) => React.ReactNode }>",
        required: true,
        description: "Column definitions",
      },
      pageSize: {
        type: "number",
        default: "10",
        description: "Rows per page for pagination",
      },
      searchable: {
        type: "boolean",
        default: "false",
        description: "Show search/filter input above the table",
      },
      selectable: {
        type: "boolean",
        default: "false",
        description: "Enable row checkbox selection",
      },
    },
    exampleUsage: `import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
// Build your own DataTable using the Shadcn Table primitives:
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Status</TableHead>
      <TableHead className="text-right">Amount</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {rows.map((row) => (
      <TableRow key={row.id}>
        <TableCell>{row.name}</TableCell>
        <TableCell><Badge variant="secondary">{row.status}</Badge></TableCell>
        <TableCell className="text-right">{row.amount}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>`,
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
