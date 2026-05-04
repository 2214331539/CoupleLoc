---
name: Heartline
colors:
  surface: '#fef8fa'
  surface-dim: '#ded9db'
  surface-bright: '#fef8fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f8f2f4'
  surface-container: '#f2ecee'
  surface-container-high: '#ece7e9'
  surface-container-highest: '#e7e1e3'
  on-surface: '#1d1b1d'
  on-surface-variant: '#514346'
  inverse-surface: '#323031'
  inverse-on-surface: '#f5eff1'
  outline: '#847376'
  outline-variant: '#d6c2c4'
  surface-tint: '#874d5b'
  primary: '#874d5b'
  on-primary: '#ffffff'
  primary-container: '#ffb5c5'
  on-primary-container: '#7b4351'
  inverse-primary: '#fcb2c2'
  secondary: '#42617d'
  on-secondary: '#ffffff'
  secondary-container: '#bddefe'
  on-secondary-container: '#43627e'
  tertiary: '#49654c'
  on-tertiary: '#ffffff'
  tertiary-container: '#b2d1b2'
  on-tertiary-container: '#3f5b42'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffd9e0'
  primary-fixed-dim: '#fcb2c2'
  on-primary-fixed: '#370c19'
  on-primary-fixed-variant: '#6c3644'
  secondary-fixed: '#cde5ff'
  secondary-fixed-dim: '#aacaea'
  on-secondary-fixed: '#001d32'
  on-secondary-fixed-variant: '#294964'
  tertiary-fixed: '#cbebca'
  tertiary-fixed-dim: '#afcfaf'
  on-tertiary-fixed: '#06210d'
  on-tertiary-fixed-variant: '#324d35'
  background: '#fef8fa'
  on-background: '#1d1b1d'
  surface-variant: '#e7e1e3'
typography:
  h1:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  h2:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.05em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 40px
  xl: 64px
  container-margin: 20px
  gutter: 16px
---

## Brand & Style

This design system focuses on bridging the physical gap between long-distance partners through a digital environment that feels like a shared home. The aesthetic is rooted in **Soft Minimalism** with a **Tactile** twist, using pillowy shapes and a gentle color palette to create an atmosphere of safety and intimacy. 

The visual language avoids sharp edges or aggressive contrasts, opting instead for organic forms and "squishy" interactions that evoke the feeling of a physical embrace. It targets couples who value emotional connection, providing a calm, clutter-free space where affection is the primary focus.

## Colors

The palette is derived from the warmth of a sunrise and the softness of spring. 
- **Primary Pink (#FFB5C5):** Used for main actions and representing "Partner A" or shared love.
- **Secondary Blue (#A7C7E7):** Used for secondary features and representing "Partner B" or the distance/sky.
- **Mint Green (#C1E1C1):** Used for growth, milestones, and success states.
- **Warm White (#FFF9FB):** The base background color, providing a creamier, softer look than pure white to reduce eye strain.
- **Text Main (#4A4E69):** A desaturated, warm navy used for text to maintain high legibility without the harshness of pure black.

## Typography

This design system utilizes **Plus Jakarta Sans** for headlines to provide a modern, rounded, and friendly presence. **Be Vietnam Pro** is used for body text and labels to ensure maximum readability while maintaining a contemporary and warm tone. 

Text should generally be center-aligned in intimate moments (like quotes or "thinking of you" prompts) and left-aligned for functional tracking data. Avoid all-caps except for very small labels to keep the tone conversational rather than shouting.

## Layout & Spacing

The layout philosophy follows a **fluid grid** with generous safe margins to ensure the interface never feels "cramped." A vertical rhythm based on 8px increments is strictly enforced to maintain harmony.

Significant whitespace (Level LG and XL) is intentionally used between different functional groups (e.g., separating the "Location" card from the "Message" card) to allow the UI to "breathe," reflecting a sense of calm and patience essential for long-distance relationships.

## Elevation & Depth

This design system avoids traditional high-contrast drop shadows. Instead, it uses **Ambient Shadows**:
- Shadows are tinted with the primary or secondary color (e.g., a soft pink shadow under a pink button).
- Shadows have a very large blur radius (20px+) and low opacity (10-15%) to create a "floating" effect rather than a "stuck on" effect.
- **Tonal Layers** are used for depth; a slightly darker version of the warm white background is used for inset containers to create a "pouch" or "nesting" feel.

## Shapes

The shape language is defined by **Pill-shaped** elements and hyper-rounded corners. There are no sharp 90-degree angles in the design system. 
- Standard containers use `rounded-xl` (3rem/48px) to feel like smooth river stones.
- Icons are encased in circular or pill-shaped enclosures.
- Progress bars and input fields always use fully rounded caps.

## Components

- **Buttons:** Large, pill-shaped, and bouncy. Primary buttons use a subtle gradient from `#FFB5C5` to a slightly warmer pink. Hover/Active states should feel "pressable" through a slight scale-down (0.98x).
- **Cards:** Use `rounded-xl` with a 1px solid border in a slightly darker neutral shade or a soft ambient shadow. Cards are the primary vessel for location data, countdowns, and photos.
- **Mood Chips:** Small, rounded indicators with emoji and pastel backgrounds used to quickly communicate current feelings (e.g., "Sleepy," "Miss you," "Happy").
- **The "Pulse" Indicator:** A special component for real-time tracking, featuring a glowing, breathing animation using the secondary blue color to show the partner is online.
- **Input Fields:** Soft, recessed backgrounds with `rounded-lg` corners. The focus state uses a 2px soft pink glow.
- **Playful Icons:** Use "Line-and-Fill" style with rounded terminals and thick strokes (2px minimum) to match the friendly typography.