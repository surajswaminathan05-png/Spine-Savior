---
name: frontend-engineering
description: Standards for Next.js 15, Tailwind, and React components at Encephlo.
---

# Encephlo Frontend Engineering

## Overview
Technical standards for building the "Flow State" Tutor.
**Keywords**: nextjs, tailwind, framer-motion, typescript, components

## Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS + `tailwindcss-animate`
- **Icons**: `lucide-react`
- **Animation**: `framer-motion` (Mandatory for complex interaction)
- **Tours**: `intro.js` (Custom styled in `globals.css`)

## Component Rules
1.  **Strict Types**: No `any`. Define interfaces for all props.
2.  **Mobile First**: Always write `class="w-full md:w-1/2"` patterns.
3.  **Client vs Server**:
    - Default to Server Components.
    - Add `'use client'` ONLY when using hooks (`useState`, `useEffect`) or event listeners.

## Animation Guidelines
- **Page Transitions**: Use `framer-motion` layout groups.
- **Micro-interactions**: Buttons should scale `0.95` on press.
- **Performance**: Animate `transform` and `opacity` only. Avoid animating `height` unless necessary (use `radix-ui` accordion pattern if needed).

## Code Style
- **Naming**: `snake_case` for folders (e.g., `components/ui/`), `kebab-case` for files (e.g., `primary-button.tsx`).
- **Imports**: Use `@/` alias (e.g., `import { Button } from "@/components/ui/button"`).
