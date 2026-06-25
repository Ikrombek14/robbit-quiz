---
name: Nihol Learning
colors:
  surface: '#fefae4'
  surface-dim: '#dedac6'
  surface-bright: '#fefae4'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f8f4df'
  surface-container: '#f2eed9'
  surface-container-high: '#ece9d4'
  surface-container-highest: '#e7e3ce'
  on-surface: '#1d1c0f'
  on-surface-variant: '#40484f'
  inverse-surface: '#323123'
  inverse-on-surface: '#f5f1dc'
  outline: '#707880'
  outline-variant: '#bfc7d0'
  surface-tint: '#006493'
  primary: '#006493'
  on-primary: '#ffffff'
  primary-container: '#73c2fb'
  on-primary-container: '#004f75'
  inverse-primary: '#8dcdff'
  secondary: '#006e21'
  on-secondary: '#ffffff'
  secondary-container: '#96f996'
  on-secondary-container: '#037524'
  tertiary: '#705d00'
  on-tertiary: '#ffffff'
  tertiary-container: '#dab800'
  on-tertiary-container: '#584900'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cae6ff'
  primary-fixed-dim: '#8dcdff'
  on-primary-fixed: '#001e30'
  on-primary-fixed-variant: '#004b70'
  secondary-fixed: '#96f996'
  secondary-fixed-dim: '#7adc7d'
  on-secondary-fixed: '#002105'
  on-secondary-fixed-variant: '#005316'
  tertiary-fixed: '#ffe16d'
  tertiary-fixed-dim: '#e9c400'
  on-tertiary-fixed: '#221b00'
  on-tertiary-fixed-variant: '#544600'
  background: '#fefae4'
  on-background: '#1d1c0f'
  surface-variant: '#e7e3ce'
  playful-pink: '#FF319F'
  deep-plum: '#3B142A'
  soft-peach: '#FFC48A'
  sunny-lemon: '#ECEB75'
typography:
  headline-lg:
    fontFamily: Quicksand
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Quicksand
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
  headline-md:
    fontFamily: Quicksand
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
  body-lg:
    fontFamily: Nunito Sans
    fontSize: 20px
    fontWeight: '400'
    lineHeight: 30px
  body-md:
    fontFamily: Nunito Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 26px
  label-lg:
    fontFamily: Quicksand
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0.05em
  label-md:
    fontFamily: Quicksand
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  touch-target: 48px
---

## Brand & Style

The design system is crafted for a child-friendly educational platform, specifically tailored for the Uzbek-speaking youth market. The brand personality is encouraging, curious, and safe—functioning as a digital companion rather than just a tool. It aims to evoke feelings of wonder and accomplishment, making learning feel like a shared adventure rather than a chore.

The visual style is a blend of **Modern Softness** and **Tactile Playfulness**. It utilizes large, approachable touch targets, high-legibility typography, and a "bouncy" interactive feel. Drawing inspiration from modern gaming interfaces, the system uses layered surfaces and soft shadows to create a world that feels physically interactive and responsive to a child's touch or click.

## Colors

The color palette is built on a foundation of "Eye-Friendly Pastels" to ensure long-term engagement without visual fatigue. 

- **Primary (Pastel Blue):** Used for main actions, navigation, and trustworthy elements.
- **Secondary (Mint Green):** Represents progress, success, and "Go" actions.
- **Tertiary (Warm Yellow):** Used for highlights, achievements, and attention-grabbing tips.
- **Neutral (Creamy Off-White):** Replaces harsh pure whites as the main background color to reduce blue-light strain.
- **Named Colors:** We utilize "Deep Plum" for text to maintain high contrast without the starkness of pure black, and "Playful Pink" for delightful accents and celebratory moments.

## Typography

The typography system prioritizes legibility for developing readers. **Quicksand** is used for headings and labels; its rounded terminals match the soft UI shapes and feel non-threatening. **Nunito Sans** is used for body text because its balanced proportions make it easy to read long paragraphs or instructions in Uzbek.

Text size is intentionally larger than standard web applications (starting at 18px for body text) to accommodate children's varying visual development and the use of tablets. Headlines should always use sentence case to feel more conversational.

## Layout & Spacing

This design system uses a **Fluid Grid** with generous white space to prevent cognitive overload. Content is organized in simplified blocks that grow and shrink based on the device.

- **Mobile:** A single-column layout with 16px side margins. Interactive elements must maintain a minimum height of 48px to ensure ease of use for smaller hands.
- **Desktop:** A centered 12-column grid with a max-width of 1200px. Gutters are kept wide (24px) to give elements "breathing room."
- **Spacing Rhythm:** Use increments of 8px. Use larger gaps (32px+) between distinct learning modules to clearly separate tasks.

## Elevation & Depth

Depth is conveyed through **Tonal Layering** and **Soft Shadows**. Instead of traditional shadows that use black opacities, this system uses "Tinted Ambient Shadows"—shadows that take on a slightly darker, more saturated version of the background color (e.g., a soft blue shadow on a light blue button).

Interactive elements should appear slightly "raised" (4px - 8px offset). When pressed, they should visually move "down" toward the surface, providing tactile feedback that the action was registered. Backdrop blurs (glassmorphism) are used sparingly for overlays or modals to keep the focus on the primary task.

## Shapes

The shape language is consistently **Rounded**. There are no sharp corners in this design system. Standard containers use a 0.5rem (8px) radius, while larger cards and instructional panels use 1rem (16px). 

Interactive elements like buttons and chips often lean toward 1.5rem (24px) or full pill-shapes to invite clicking. The "Friendly Corner" rule applies to every border, ensuring the UI feels soft and safe.

## Components

### Buttons
Primary buttons use the "Bounce" style: a solid fill with a 4px bottom border in a darker shade of the same color, creating a 3D effect. On hover or press, the button "sinks" into that border.

### Cards
Cards are the primary container for lessons. They should have a subtle 1px border in a darker tint of the neutral color and a soft, low-blur shadow. The card header should often be a different pastel color than the body to categorize content.

### Inputs & Selection
- **Inputs:** Use thick 2px borders and large text. Focus states should be highly visible, utilizing a bright yellow glow.
- **Chips/Selection:** Multiple-choice options (e.g., in a quiz) should be large, card-like buttons that change color entirely when selected (e.g., turning from White to Mint Green).

### Progress Indicators
Progress bars should be thick (12px-16px height) and use a bright "Sunny Lemon" or "Mint Green" fill. Include a small mascot or icon at the head of the bar to track progress playfully.

### Feedback Toasts
Success messages should use the secondary green and include a celebratory icon (star or thumbs up). Errors are signaled with a soft orange rather than an aggressive red to keep the environment encouraging.