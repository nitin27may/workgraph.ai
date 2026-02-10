# Project Design System & Coding Guidelines

## Overview

This is a productivity dashboard application built for extended use. Design priorities are **low eye strain**, **clarity**, and **performance**. The visual language is inspired by Linear and Notion — clean, minimal, keyboard-first interfaces that reduce cognitive load.

## Technology Stack

- **Framework**: Next.js 14+ (App Router, React Server Components)
- **Components**: shadcn/ui
- **Styling**: Tailwind CSS with CSS variables
- **Icons**: Lucide React (shadcn default)
- **Theming**: next-themes for dark/light mode

---

## Color System

### CSS Variables

Add these to your `globals.css`:

```css
@layer base {
  :root {
    /* Backgrounds */
    --background: oklch(0.985 0 0);
    --foreground: oklch(0.145 0.02 260);
    
    /* Cards & Elevated Surfaces */
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.145 0.02 260);
    
    /* Popovers & Dropdowns */
    --popover: oklch(1 0 0);
    --popover-foreground: oklch(0.145 0.02 260);
    
    /* Primary Action Color - Cool Blue */
    --primary: oklch(0.55 0.15 230);
    --primary-foreground: oklch(0.98 0 0);
    
    /* Secondary/Muted Actions */
    --secondary: oklch(0.94 0.01 260);
    --secondary-foreground: oklch(0.25 0.02 260);
    
    /* Muted Text & Backgrounds */
    --muted: oklch(0.94 0.01 260);
    --muted-foreground: oklch(0.45 0.02 260);
    
    /* Accent Highlights - Teal */
    --accent: oklch(0.94 0.03 200);
    --accent-foreground: oklch(0.25 0.02 260);
    
    /* Semantic: Destructive */
    --destructive: oklch(0.55 0.18 25);
    --destructive-foreground: oklch(0.98 0 0);
    
    /* Borders & Rings */
    --border: oklch(0.88 0.01 260);
    --input: oklch(0.88 0.01 260);
    --ring: oklch(0.55 0.15 230);
    
    /* Border Radius */
    --radius: 0.5rem;
    
    /* Semantic Colors */
    --success: oklch(0.55 0.14 145);
    --success-foreground: oklch(0.98 0 0);
    --warning: oklch(0.65 0.15 70);
    --warning-foreground: oklch(0.2 0.02 70);
    --info: oklch(0.55 0.12 230);
    --info-foreground: oklch(0.98 0 0);
    
    /* Chart Colors */
    --chart-1: oklch(0.55 0.15 230);
    --chart-2: oklch(0.60 0.14 175);
    --chart-3: oklch(0.55 0.14 145);
    --chart-4: oklch(0.65 0.15 70);
    --chart-5: oklch(0.50 0.12 30);
    
    /* Sidebar */
    --sidebar: oklch(0.97 0.01 260);
    --sidebar-foreground: oklch(0.25 0.02 260);
    --sidebar-primary: oklch(0.55 0.15 230);
    --sidebar-primary-foreground: oklch(0.98 0 0);
    --sidebar-accent: oklch(0.94 0.03 200);
    --sidebar-accent-foreground: oklch(0.25 0.02 260);
    --sidebar-border: oklch(0.90 0.01 260);
    --sidebar-ring: oklch(0.55 0.15 230);
  }

  .dark {
    /* Backgrounds - Dark gray, NOT pure black */
    --background: oklch(0.12 0.01 260);
    --foreground: oklch(0.92 0.01 260);
    
    /* Cards - Slightly elevated from background */
    --card: oklch(0.16 0.01 260);
    --card-foreground: oklch(0.92 0.01 260);
    
    /* Popovers - More elevated */
    --popover: oklch(0.18 0.01 260);
    --popover-foreground: oklch(0.92 0.01 260);
    
    /* Primary - Desaturated 20% for dark mode */
    --primary: oklch(0.60 0.12 230);
    --primary-foreground: oklch(0.12 0.01 260);
    
    /* Secondary */
    --secondary: oklch(0.22 0.01 260);
    --secondary-foreground: oklch(0.88 0.01 260);
    
    /* Muted */
    --muted: oklch(0.22 0.01 260);
    --muted-foreground: oklch(0.60 0.01 260);
    
    /* Accent */
    --accent: oklch(0.22 0.02 200);
    --accent-foreground: oklch(0.88 0.01 260);
    
    /* Destructive - Desaturated */
    --destructive: oklch(0.50 0.14 25);
    --destructive-foreground: oklch(0.92 0.01 260);
    
    /* Borders - Subtle */
    --border: oklch(0.26 0.01 260);
    --input: oklch(0.26 0.01 260);
    --ring: oklch(0.60 0.12 230);
    
    /* Semantic - Desaturated */
    --success: oklch(0.50 0.11 145);
    --success-foreground: oklch(0.92 0.01 260);
    --warning: oklch(0.60 0.12 70);
    --warning-foreground: oklch(0.15 0.01 70);
    --info: oklch(0.50 0.10 230);
    --info-foreground: oklch(0.92 0.01 260);
    
    /* Chart Colors - Desaturated */
    --chart-1: oklch(0.60 0.12 230);
    --chart-2: oklch(0.55 0.11 175);
    --chart-3: oklch(0.50 0.11 145);
    --chart-4: oklch(0.60 0.12 70);
    --chart-5: oklch(0.45 0.10 30);
    
    /* Sidebar */
    --sidebar: oklch(0.10 0.01 260);
    --sidebar-foreground: oklch(0.88 0.01 260);
    --sidebar-primary: oklch(0.60 0.12 230);
    --sidebar-primary-foreground: oklch(0.12 0.01 260);
    --sidebar-accent: oklch(0.20 0.02 200);
    --sidebar-accent-foreground: oklch(0.88 0.01 260);
    --sidebar-border: oklch(0.22 0.01 260);
    --sidebar-ring: oklch(0.60 0.12 230);
  }
}
```

### Semantic Color Usage

| Color | Light Mode Use | Dark Mode Use |
|-------|----------------|---------------|
| `primary` | CTAs, active states, links | Same, slightly desaturated |
| `secondary` | Secondary buttons, subtle actions | Same |
| `muted` | Disabled states, placeholder text | Same |
| `accent` | Highlights, hover states | Same |
| `destructive` | Delete, error states | Same, less alarming |
| `success` | Completed, positive indicators | Same |
| `warning` | Caution, pending states | Same |
| `info` | Informational banners | Same |

### Color Anti-Patterns

**NEVER use these:**
- Purple/violet as primary or accent (`#8B5CF6`, `#A855F7`, `#7C3AED`)
- Pink/magenta tones (`#EC4899`, `#DB2777`)
- Neon or highly saturated colors
- Pure black backgrounds (`#000000`, `oklch(0 0 0)`)
- Pure white text on dark (`#FFFFFF`, `oklch(1 0 0)`)
- Gradients as primary UI elements
- Rainbow or multi-color gradients

---

## Typography

### Font Stack

```css
@layer base {
  :root {
    --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 
      "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, 
      "Liberation Mono", monospace;
  }
}
```

Or use Inter for consistency:
```css
--font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
```

### Type Scale

| Element | Size | Weight | Line Height | Letter Spacing |
|---------|------|--------|-------------|----------------|
| h1 | 2.25rem (36px) | 700 | 1.2 | -0.025em |
| h2 | 1.875rem (30px) | 600 | 1.25 | -0.02em |
| h3 | 1.5rem (24px) | 600 | 1.3 | -0.015em |
| h4 | 1.25rem (20px) | 600 | 1.4 | -0.01em |
| h5 | 1.125rem (18px) | 500 | 1.4 | 0 |
| h6 | 1rem (16px) | 500 | 1.5 | 0 |
| body | 0.875rem (14px) | 400 | 1.6 | 0 |
| body-lg | 1rem (16px) | 400 | 1.6 | 0 |
| small | 0.75rem (12px) | 400 | 1.5 | 0.01em |
| mono | 0.8125rem (13px) | 400 | 1.6 | 0 |

### Typography Classes

```tsx
// Headings
<h1 className="text-4xl font-bold tracking-tight">Page Title</h1>
<h2 className="text-3xl font-semibold tracking-tight">Section</h2>
<h3 className="text-2xl font-semibold">Subsection</h3>
<h4 className="text-xl font-semibold">Card Title</h4>

// Body
<p className="text-sm leading-relaxed">Body text</p>
<p className="text-base leading-relaxed">Larger body</p>

// Muted/Secondary
<p className="text-sm text-muted-foreground">Secondary info</p>

// Monospace
<code className="font-mono text-[13px]">code</code>
```

### Dark Mode Typography

In dark mode, use slightly lighter font weights if text appears too thin:
```css
.dark {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

---

## Spacing & Layout

### Spacing Scale

Use Tailwind's default spacing scale consistently:

| Token | Value | Use Case |
|-------|-------|----------|
| 1 | 4px | Icon gaps, tight spacing |
| 2 | 8px | Inline elements, button icon gap |
| 3 | 12px | Component internal padding |
| 4 | 16px | Standard padding, card padding |
| 6 | 24px | Section spacing |
| 8 | 32px | Large section gaps |
| 12 | 48px | Page section spacing |
| 16 | 64px | Major section dividers |

### Standard Patterns

```tsx
// Card padding
<div className="p-4">...</div>

// Section gap
<section className="space-y-6">...</section>

// Page container
<main className="container mx-auto px-4 py-8 max-w-7xl">...</main>

// Sidebar width
<aside className="w-64 shrink-0">...</aside>

// Form field spacing
<div className="space-y-4">
  <div className="space-y-2">
    <Label>...</Label>
    <Input />
  </div>
</div>
```

### Layout Patterns

**Container Widths:**
- `max-w-md` (448px): Narrow forms, dialogs
- `max-w-2xl` (672px): Content pages, articles
- `max-w-4xl` (896px): Dashboard panels
- `max-w-6xl` (1152px): Wide content
- `max-w-7xl` (1280px): Full dashboard

**Responsive Breakpoints:**
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

---

## Component Guidelines

### Cards

```tsx
// Standard card
<Card className="border-border/50">
  <CardHeader className="pb-3">
    <CardTitle className="text-base font-medium">Title</CardTitle>
    <CardDescription>Description text</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>

// Clickable card
<Card className="border-border/50 transition-colors hover:bg-accent/50 cursor-pointer">
  ...
</Card>
```

**Card Rules:**
- Use subtle border (`border-border/50`) OR slight elevation, not both
- Default padding: `p-4` for content
- No heavy shadows in dark mode
- Border radius: use `rounded-lg` (matches --radius)

### Data Tables

```tsx
<Table>
  <TableHeader>
    <TableRow className="hover:bg-transparent border-border/50">
      <TableHead className="h-10 text-xs font-medium text-muted-foreground">
        Column
      </TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow className="border-border/30 hover:bg-muted/50">
      <TableCell className="py-3">Data</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

**Table Rules:**
- Header: sticky for scrollable tables, muted text, smaller font
- Rows: subtle hover state, minimal borders
- Row height: 40-48px for comfortable clicking
- Alternating colors: only if data-heavy, use `even:bg-muted/30`

### Forms & Inputs

```tsx
<div className="space-y-2">
  <Label htmlFor="email" className="text-sm font-medium">
    Email
  </Label>
  <Input 
    id="email"
    type="email"
    className="h-10"
    placeholder="you@example.com"
  />
  <p className="text-xs text-muted-foreground">
    Helper text goes here
  </p>
</div>

// Error state
<Input className="border-destructive focus-visible:ring-destructive" />
<p className="text-xs text-destructive">Error message</p>
```

**Form Rules:**
- Input height: `h-10` (40px) for touch targets
- Labels: always above inputs, `text-sm font-medium`
- Helper text: below input, `text-xs text-muted-foreground`
- Error text: `text-xs text-destructive`
- Field spacing: `space-y-4` between fields, `space-y-2` within field

### Buttons

```tsx
// Primary
<Button>Save Changes</Button>

// Secondary
<Button variant="secondary">Cancel</Button>

// Ghost (for toolbars)
<Button variant="ghost" size="icon">
  <Settings className="h-4 w-4" />
</Button>

// Destructive
<Button variant="destructive">Delete</Button>

// With icon
<Button>
  <Plus className="h-4 w-4 mr-2" />
  Add Item
</Button>
```

**Button Rules:**
- Default size: `h-10 px-4`
- Icon buttons: `size="icon"` with `h-4 w-4` icons
- Icon + text: `mr-2` gap for leading icon
- Loading state: show spinner, disable button
- Never use emojis in buttons

### Navigation

**Sidebar:**
```tsx
<nav className="flex flex-col gap-1 p-2">
  <a className="flex items-center gap-3 rounded-md px-3 py-2 text-sm 
    text-muted-foreground hover:bg-accent hover:text-accent-foreground
    data-[active=true]:bg-accent data-[active=true]:text-accent-foreground">
    <Home className="h-4 w-4" />
    Dashboard
  </a>
</nav>
```

**Tabs:**
```tsx
<Tabs defaultValue="overview" className="space-y-4">
  <TabsList className="bg-muted/50">
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="analytics">Analytics</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">...</TabsContent>
</Tabs>
```

**Breadcrumbs:**
```tsx
<nav className="flex items-center gap-2 text-sm text-muted-foreground">
  <a href="/" className="hover:text-foreground">Home</a>
  <ChevronRight className="h-4 w-4" />
  <a href="/projects" className="hover:text-foreground">Projects</a>
  <ChevronRight className="h-4 w-4" />
  <span className="text-foreground">Current Page</span>
</nav>
```

### Alerts & Notifications

**Toast:**
```tsx
toast({
  title: "Changes saved",
  description: "Your preferences have been updated.",
})

// Destructive
toast({
  variant: "destructive",
  title: "Error",
  description: "Something went wrong.",
})
```

**Alert Banner:**
```tsx
<Alert>
  <Info className="h-4 w-4" />
  <AlertTitle>Heads up</AlertTitle>
  <AlertDescription>
    Important information here.
  </AlertDescription>
</Alert>

// Variants
<Alert variant="destructive">...</Alert>
```

**Status Badges:**
```tsx
<Badge variant="secondary">Draft</Badge>
<Badge className="bg-success/10 text-success border-success/20">
  Active
</Badge>
<Badge className="bg-warning/10 text-warning border-warning/20">
  Pending
</Badge>
```

### Charts & Visualizations

Use the chart color palette consistently:

```tsx
const chartConfig = {
  metric1: { color: "hsl(var(--chart-1))" },
  metric2: { color: "hsl(var(--chart-2))" },
  metric3: { color: "hsl(var(--chart-3))" },
  metric4: { color: "hsl(var(--chart-4))" },
  metric5: { color: "hsl(var(--chart-5))" },
}
```

**Chart Rules:**
- Always include axis labels
- Provide tooltips for precise values
- Use legends for multi-series charts
- Ensure colors are distinguishable (5 max per chart)
- Responsive: use container queries or percentages

---

## Icon Usage

### Lucide Icons

**Size Scale:**
| Size | Pixels | Use Case |
|------|--------|----------|
| `h-3 w-3` | 12px | Inline with small text |
| `h-4 w-4` | 16px | Buttons, inline with body |
| `h-5 w-5` | 20px | Standalone actions |
| `h-6 w-6` | 24px | Feature icons, empty states |
| `h-8 w-8` | 32px | Large feature icons |

**Standard Usage:**
```tsx
// In button
<Button>
  <Plus className="h-4 w-4 mr-2" />
  Add
</Button>

// Icon-only button
<Button variant="ghost" size="icon">
  <Settings className="h-4 w-4" />
  <span className="sr-only">Settings</span>
</Button>

// Standalone
<div className="flex items-center gap-2 text-muted-foreground">
  <Clock className="h-4 w-4" />
  <span>2 hours ago</span>
</div>
```

**Stroke Width:**
- Default (2) for most icons
- Use `strokeWidth={1.5}` for lighter appearance if needed

### Common Icon Mappings

| Action | Icon |
|--------|------|
| Add/Create | `Plus` |
| Edit | `Pencil` |
| Delete | `Trash2` |
| Save | `Save` |
| Cancel | `X` |
| Settings | `Settings` |
| Search | `Search` |
| Filter | `Filter` |
| Sort | `ArrowUpDown` |
| Expand | `ChevronDown` |
| Menu | `Menu` |
| Close | `X` |
| Success | `Check` |
| Error | `AlertCircle` |
| Warning | `AlertTriangle` |
| Info | `Info` |
| Loading | `Loader2` (animate-spin) |

---

## Accessibility Standards

### Contrast Requirements

- Normal text (< 18px): 4.5:1 minimum
- Large text (>= 18px bold or >= 24px): 3:1 minimum
- UI components and graphics: 3:1 minimum
- Focus indicators: 3:1 against adjacent colors

### Focus States

All interactive elements must have visible focus:

```css
.focus-visible:ring-2 .focus-visible:ring-ring .focus-visible:ring-offset-2
```

For custom components:
```tsx
<button className="focus-visible:outline-none focus-visible:ring-2 
  focus-visible:ring-ring focus-visible:ring-offset-2 
  focus-visible:ring-offset-background">
```

### Keyboard Navigation

- All interactive elements reachable via Tab
- Escape closes modals/popovers
- Arrow keys for menu navigation
- Enter/Space activates buttons
- Skip links for main content

### Screen Readers

```tsx
// Icon-only buttons need labels
<Button variant="ghost" size="icon" aria-label="Delete item">
  <Trash2 className="h-4 w-4" />
</Button>

// Or use sr-only
<Button variant="ghost" size="icon">
  <Trash2 className="h-4 w-4" />
  <span className="sr-only">Delete item</span>
</Button>

// Status indicators
<Badge aria-label="Status: Active">Active</Badge>
```

### Motion Preferences

Respect reduced motion:
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Or in Tailwind:
```tsx
<div className="transition-opacity duration-200 motion-reduce:transition-none">
```

---

## File & Component Conventions

### File Naming

- Components: `PascalCase.tsx` (e.g., `DataTable.tsx`)
- Utilities: `camelCase.ts` (e.g., `formatDate.ts`)
- Hooks: `use-kebab-case.ts` (e.g., `use-debounce.ts`)
- Types: `types.ts` or `ComponentName.types.ts`
- Constants: `SCREAMING_SNAKE_CASE` for values

### Component Structure

```tsx
// imports
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// types
interface ComponentProps {
  title: string
  variant?: "default" | "secondary"
  className?: string
  children: React.ReactNode
}

// component
export function Component({ 
  title, 
  variant = "default",
  className,
  children 
}: ComponentProps) {
  return (
    <div className={cn("base-styles", className)}>
      {children}
    </div>
  )
}
```

### Props Patterns

- Use `className` prop for style customization
- Use `cn()` utility for conditional classes
- Spread remaining props for DOM elements
- Prefer composition over configuration

---

## Animation & Transitions

### Standard Durations

- Micro-interactions: 100-150ms
- State changes: 150-200ms
- Page transitions: 200-300ms
- Complex animations: 300-500ms

### Standard Easings

```css
/* Default */
transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);

/* Enter (ease-out) */
transition-timing-function: cubic-bezier(0, 0, 0.2, 1);

/* Exit (ease-in) */
transition-timing-function: cubic-bezier(0.4, 0, 1, 1);
```

### Common Transitions

```tsx
// Hover color change
<div className="transition-colors duration-150">

// Opacity fade
<div className="transition-opacity duration-200">

// Transform (scale, translate)
<div className="transition-transform duration-200">

// Multiple properties
<div className="transition-all duration-200">
```

---

## Anti-Patterns (NEVER DO)

### Visual Anti-Patterns

1. **No Emojis** — Use Lucide icons instead
2. **No AI Purple Aesthetic** — Avoid violet/purple/pink gradients
3. **No Pure Black Backgrounds** — Use `#0a0a0a` to `#1a1a1a`
4. **No Pure White Text in Dark Mode** — Use `#e0e0e0` to `#f0f0f0`
5. **No Heavy Shadows in Dark Mode** — Use elevation via surface color
6. **No Decorative Gradients** — Solid colors only
7. **No Mascots or Illustrations** — Keep it minimal
8. **No Neon Colors** — Desaturate everything
9. **No Rainbow Effects** — Single accent color family
10. **No Excessive Borders** — One subtle border is enough

### Code Anti-Patterns

1. **No Inline Styles** — Use Tailwind classes
2. **No Magic Numbers** — Use spacing scale
3. **No Hardcoded Colors** — Use CSS variables
4. **No `!important`** — Fix specificity properly
5. **No Pixel Values** — Use rem/Tailwind tokens
6. **No Excessive Nesting** — Keep components flat
7. **No Anonymous Functions in Render** — Extract handlers
8. **No Missing Keys in Lists** — Always provide unique keys
9. **No Missing Accessibility** — Labels, roles, focus states
10. **No Suppressed TypeScript Errors** — Fix types properly

### Content Anti-Patterns

1. **No Placeholder Lorem Ipsum in Production** — Use realistic content
2. **No Generic Stock Photography** — Use icons or custom graphics
3. **No Walls of Text** — Break into digestible chunks
4. **No ALL CAPS for Body Text** — Only for very short labels
5. **No Underlines Except Links** — Maintain link affordance

---

## Dark Mode Checklist

When implementing dark mode, verify:

- [ ] Background is dark gray, not pure black
- [ ] Text is light gray, not pure white
- [ ] Primary color is desaturated ~20%
- [ ] Borders are visible but subtle
- [ ] Elevation uses lighter surfaces, not shadows
- [ ] Charts/graphs maintain readability
- [ ] Images have appropriate treatment (brightness/contrast)
- [ ] Focus rings are visible
- [ ] Status colors maintain meaning (green=success, etc.)
- [ ] No excessive contrast causing eye strain