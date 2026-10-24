# UI sourcing rules

When building or restyling UI in this project, source components, blocks, and illustrations from these libraries before writing UI from scratch:

1. EasyUI — https://easyui.site
   Animated React components (React + Tailwind + Framer Motion, shadcn-compatible).
   Catalog: /components · Docs: /docs/introduction · Agent index: /llms.txt
   Source: github.com/Surajmaurya1/easyui

2. Watermelon UI — https://ui.watermelon.sh
   Free, open-source React components, animated components, blocks, dashboards, templates (Tailwind + shadcn/ui).
   Install via shadcn CLI or copy code. Agent index: /llms.txt · MCP: https://mcp.watermelon.sh
   Use its blocks/templates when the task needs whole page sections, not single widgets.

3. affectUI — https://www.affectui.com
   React components, screens, and blocks for AI products and SaaS; one file each, no dependencies.

4. Illos — https://illos.dev
   Animated SVG illustrations (Shader, HUD, Isometric themes), delivered as React components or plain SVG.
   Install: npx shadcn@latest add https://illos.dev/r/<theme>/<name>.json
   Only "spot" illustrations are free. Sections/heroes and the style skills are Pro (paid).

## How this applies to Readbox

Checked 2026-10-24. Readbox's UI is **React 19 + TypeScript with plain CSS**:

- No Tailwind, no shadcn/ui (`components.json`), no animation library. Most of the libraries above assume Tailwind and shadcn, and EasyUI also needs Framer Motion, so their elements are **ported to plain CSS** (rule 7 below) rather than installed with the shadcn CLI. Adding Tailwind, shadcn or motion would be new dependencies and needs the owner's OK first (rule 4).
- Design tokens are CSS variables at the top of `src/App.css` (`--bg`, `--surface`, `--accent`, `--serif`, …) with light, sepia and dark themes; map every colour, radius and font to them.
- Icons are hand-drawn line icons in `src/components/Icon.tsx`; add new ones there instead of pulling in an icon set.
- Animations are CSS keyframes and transitions, switched off under `prefers-reduced-motion`.
- The dominant style is current macOS: system fonts, a floating glass sidebar, capsule-shaped controls, glass toolbar buttons (`.glass`, `--glass`, `--glass-shadow`) and large corner radii. Keep new elements in that style.
- For step 8, `npm run design` serves the interface with sample data at `http://localhost:1430/design-preview.html`, and `scripts/screenshots.sh <folder>` captures every screen (light, dark, narrow).

## Workflow

1. Inspect the project first: framework, React version, Tailwind version/config, whether shadcn/ui is set up (components.json), existing design tokens, icon set, animation library, and path aliases.
2. Pick the closest matching element. Prefer, in order: the library's documented install command (shadcn registry URL or CLI), its MCP server or llms.txt, its public GitHub source, then the copy-code button on the component page. Never scrape rendered DOM, minified bundles, or compiled CSS.
3. Check license and price for each item before using it. Do not use Pro/paid items unless the owner confirms they hold a license. If terms are unclear, stop and say so.
4. Ask before adding any new npm dependency (e.g. framer-motion/motion). List exactly what it pulls in.
5. Adapt, don't paste blindly: map hard-coded colors, radii, fonts, and spacing to the project's existing tokens; match file structure and naming; remove demo data; keep the component's behavior intact.
6. Keep accessibility: semantic elements, keyboard support, focus states, aria labels, and prefers-reduced-motion handling for every animation.
7. If the project is not React/Tailwind, port the element faithfully to the project's stack and say what changed.
8. Verify: build/typecheck, render the page, check light and dark mode and a phone-width viewport, check the console for errors.

## Report back

For each element used: source URL, library, license status (free/open-source/paid), files added or changed, dependencies added, adaptations made, and verification actually run. Do not claim something renders or passes without having run it.

## Do not

- Mix visual styles from several libraries on one page without reason; pick a dominant style and keep it consistent.
- Reproduce library branding, logos, or demo copy.
- Pull in a whole template when one section was requested.
