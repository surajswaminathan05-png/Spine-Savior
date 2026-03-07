---
name: brand-design
description: Applies Encephlo's official premium brand identity (Dark Mode, Space Grotesk/Inter, Purple) to all UI and content.
---

# Encephlo Brand Styling

## Overview
This is the single source of truth for the Encephlo "Flow State" aesthetic.
**Keywords**: premium, dark mode, purple, space grotesk, encephlo, flow state

## Brand Guidelines

### Colors (Dark Mode Default)
- **Background**: `hsl(240 10% 3.9%)` (Deep Void Black - #09090a)
- **Primary Accent**: `hsl(271 76% 53%)` (Encephlo Purple - #8b2cf5)
  - Use for: CTAs, active states, key highlights.
- **Secondary**: `hsl(240 3.7% 15.9%)` (Dark Grey)
- **Text**: `hsl(0 0% 98%)` (White)

### Typography
- **Headings**: `Space Grotesk` (Geometric, modern, tech-forward)
  - Usage: `font-headline` class.
- **Body**: `Inter` (Clean, highly readable)
  - Usage: `font-body` class.
- **Code**: `Source Code Pro`
  - Usage: `font-code` class.

### Design Philosophy
1.  **"Flow State" Visuals**:
    - **Glassmorphism**: **Subtle Future**. Use `bg-background/80 backdrop-blur-md border border-white/5`. Avoid thick borders or heavy frosting.
    - **Animation**: **Cinematic & Fluid** (0.5s - 0.7s). Elements should glide and float, not snap. Use `framer-motion`.
    - **Particles**: Restrict to **Hero Pages Only** (Landing, Login, Signup, Checkout). The actual study application must remain clean to reduce cognitive load.

2.  **Tone Strategy: The Dual Interface**
    *We speak to two different audiences with distinct goals.*

    **A. Marketing & Parent Ops (Landing, Checkout, Billing)**
    - **Voice**: "The Academic Architect".
    - **Core Values**: Trust, ROI, Legitimacy.
    - **Style**: Professional, result-oriented, reassuring.
    - **Goal**: Convince the parent that this is a serious investment in their child's future.

    **B. Student Experience (Tutor, Study Session)**
    - **Voice**: "The Flow State Mentor".
    - **Core Values**: Focus, Momentum, Mastery.
    - **Style**: Tech-forward, encouraging, brief. Like a high-end personal coach or "Jarvis".
    - **Goal**: Keep the student engaged and in the zone.
    - *Golden Rule*: "We are the student's secret weapon, not their second teacher."
