# Bruno B. Berry — Portfolio

A one-page portfolio with dedicated pages for the three key projects. Editorial,
refined-minimal layout (inspired by tr.af) reworked into **light mode** with a
**light-green accent**, set in **Hanken Grotesk + Space Mono**.

## Files
```
index.html                 Landing page (dark mode): name · tagline · Explore Now → ripple into home.html
home.html                  One-pager: intro · projects · connect (+ left nav, bento, modals)
project-att-agentic.html   AT&T Agentic Marketing
project-centerpoint.html   CenterPoint Energy Emergency+
project-att-fraud.html     AT&T Fraud Detection (with 6 real screens)
styles.css                 Shared styles — ships with every page
script.js                  Nav, scrollspy, modals, scroll-reveal
landing.js                 Landing-only: the Explore Now ripple-out transition
assets/                    Drop your own images here (see assets/README.txt)
```
Keep all files together in one folder — every page links to `styles.css` and `script.js`.

## What's where
- **Landing** (`index.html`): a minimal dark-mode entry — deep-green field, name,
  tagline, and **Explore Now**. Clicking it ripples the grid out from the centre and
  transitions into the main page (`home.html`). Honours `prefers-reduced-motion`.
- **Left nav**: Intro · Projects (→ the 3 key projects + Misc. Projects) · Connect.
  On desktop it's a fixed sidebar; on mobile it collapses into a top bar + slide-in menu.
- **Intro**: name, title, tagline, Résumé + LinkedIn.
- **Projects**: the 3 key projects each open their own page; the "Misc. Projects"
  bento tiles open **modals** (no page change).
- **Connect**: a "Let's connect" button linking to your email.

## How to host it (pick one — all free, all under 2 minutes)
- **Netlify Drop**: go to app.netlify.com/drop and drag this folder in. Instant URL.
- **Vercel / Cloudflare Pages / GitHub Pages**: drag-and-drop or push the folder; no build step.
- **Any web host / cPanel**: upload the folder contents to your `public_html` (or web root).

To use a custom domain, point it at whichever host you pick (each has a one-page
"add domain" guide in its dashboard).

## Notes
- Images currently load from your existing site's CDN so it works immediately.
  See `assets/README.txt` to host them from your own files.
- The contact action is a `mailto:` link. To use a form instead, add a service
  like Formspree and swap the Connect button for a small form.

© Bruno B. Berry
