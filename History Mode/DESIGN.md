---
name: Lightning Plus
colors:
  surface: '#fbf9f9'
  surface-dim: '#dbdad9'
  surface-bright: '#fbf9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#efeded'
  surface-container-high: '#e9e8e7'
  surface-container-highest: '#e3e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#414752'
  inverse-surface: '#303031'
  inverse-on-surface: '#f2f0f0'
  outline: '#717784'
  outline-variant: '#c0c7d4'
  surface-tint: '#005fac'
  primary: '#005da9'
  on-primary: '#ffffff'
  primary-container: '#0176d3'
  on-primary-container: '#fefcff'
  inverse-primary: '#a4c9ff'
  secondary: '#2d5fa2'
  on-secondary: '#ffffff'
  secondary-container: '#88b4fe'
  on-secondary-container: '#034587'
  tertiary: '#964500'
  on-tertiary: '#ffffff'
  tertiary-container: '#bc5800'
  on-tertiary-container: '#fffcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d4e3ff'
  primary-fixed-dim: '#a4c9ff'
  on-primary-fixed: '#001c39'
  on-primary-fixed-variant: '#004884'
  secondary-fixed: '#d6e3ff'
  secondary-fixed-dim: '#a8c8ff'
  on-secondary-fixed: '#001b3c'
  on-secondary-fixed-variant: '#064688'
  tertiary-fixed: '#ffdbc8'
  tertiary-fixed-dim: '#ffb68b'
  on-tertiary-fixed: '#321200'
  on-tertiary-fixed-variant: '#753400'
  background: '#fbf9f9'
  on-background: '#1b1c1c'
  surface-variant: '#e3e2e2'
typography:
  display:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  panel-width-fixed: 320px
---

## Brand & Style
The design system is an evolved interpretation of the Salesforce Lightning Design System (SLDS), specifically optimized for the high cognitive demand of form building and survey logic. It targets enterprise administrators and power users who require the reliability of the Salesforce ecosystem but benefit from a more spacious, modernized interface.

The design style is **Corporate Modern with a Soft Edge**. It maintains the professional rigor of a SaaS platform while introducing subtle tactile improvements—softer elevations and increased negative space—to make complex drag-and-drop workflows feel less "cramped" and more intuitive. The emotional goal is to evoke a sense of confidence, clarity, and systematic precision.

## Colors
The palette is rooted in the "Salesforce Blue" identity to ensure seamless integration with the native platform experience. 

- **Primary:** `#0176D3` is used for primary actions, active states, and focus indicators.
- **Surface:** The background uses a soft grey (`#F3F3F3`) to differentiate the builder canvas from the utility panels.
- **Borders:** A refined grey (`#D3D3D3`) is used for UI boundaries, ensuring a clean separation of functional areas without heavy visual noise.
- **Semantic:** Standard Salesforce success (green) and error (red) tones are retained for consistency in validation and status reporting.

## Typography
This design system utilizes **Hanken Grotesk** as a contemporary alternative to Salesforce Sans. It offers excellent legibility at small sizes (crucial for property panels) while maintaining a clean, professional geometric structure.

Headlines use a tighter letter-spacing and heavier weights to provide clear section anchoring. Labels are optimized for high-density forms using uppercase or semi-bold weights to ensure field titles are never lost in the UI. For mobile viewports, the `display` size should scale down to `24px` to maintain visual balance on smaller devices.

## Layout & Spacing
The layout employs a **Hybrid Grid System**. The main builder canvas is fluid, allowing users to see how forms respond to different widths, while the sidebars (Component Palette and Property Inspector) are fixed at `320px` to maintain a consistent workspace.

A strict 4px spacing scale is used to create rhythm. Compared to standard SLDS, this design system increases internal component padding by 25% to reduce cognitive load during complex configuration tasks.
- **Mobile:** 16px side margins, single-column stacked panels.
- **Tablet:** 24px margins, collapsible sidebars.
- **Desktop:** 32px margins on the canvas, persistent dual sidebars.

## Elevation & Depth
Depth is handled through **Tonal Layering** supplemented by **Ambient Shadows**. 

- **Level 0 (Canvas):** Background color `#F3F3F3`, no shadow.
- **Level 1 (Panels):** Pure white background (`#FFFFFF`) with a 1px border (`#D3D3D3`).
- **Level 2 (Cards/Draggable Elements):** Pure white background with a soft, diffused shadow: `0px 4px 12px rgba(0, 0, 0, 0.08)`.
- **Level 3 (Modals/Overlays):** Elevated with a deep shadow: `0px 8px 24px rgba(0, 0, 0, 0.12)`.

When an element is being dragged, it should transition to Level 3 to visually lift off the canvas, utilizing a slight rotation (2 degrees) to mimic a physical object being held.

## Shapes
The design system adopts a **Rounded** aesthetic to soften the industrial feel of traditional enterprise software. 
- Base components (Inputs, Buttons) use a `0.5rem` (8px) radius.
- Larger containers (Cards, Modals) use a `1rem` (16px) radius.
- Selection indicators and focus states mirror the radius of their parent element.
- Drag-and-drop handles use a fully rounded (pill) shape to distinguish them from interactive buttons.

## Components
### Buttons
- **Primary:** High-contrast `#0176D3` background with white text. 8px corner radius. Heavy 16px horizontal padding.
- **Ghost:** No border or background until hover. Used for secondary actions in dense toolbars.

### Form Fields
- **Inputs & Selects:** Use a 1px border (`#D3D3D3`) that thickens to 2px Primary Blue on focus. Labels should always sit above the input field using `label-md` styling.
- **Checkboxes/Radios:** Use a Primary Blue fill when active. The hit area is expanded to 32px to ensure ease of selection on touch devices.

### Builder Specifics
- **Sidebars:** Feature a subtle inner-shadow on the canvas-facing edge to provide depth.
- **Drag-and-Drop Handles:** A "6-dot" icon pattern (`⋮⋮`) in a neutral grey, appearing on the left side of draggable cards.
- **Component Chips:** Small, rounded-pill tags used in the component palette, featuring an icon and a `label-sm` text string.
- **Active Canvas State:** When a field is selected on the canvas, it should be wrapped in a 2px blue outline with a small "edit" badge at the top-right corner.