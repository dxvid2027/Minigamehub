# Icons

The app icon (the one you get when adding MegaPlay Hub to a home screen) lives
here as a set of pre-rendered PNGs, all derived from the same 1254×1254 master
artwork:

| File | Size | Used for |
|---|---|---|
| `apple-touch-icon.png` | 180×180 | iOS / iPadOS home screen |
| `apple-touch-icon-167.png` | 167×167 | iPad Pro |
| `apple-touch-icon-152.png` | 152×152 | older iPads |
| `icon-192.png`, `icon-512.png` | 192 / 512 | web app manifest (`purpose: any`) |
| `icon-maskable-192.png`, `icon-maskable-512.png` | 192 / 512 | Android adaptive icons (`purpose: maskable`) |
| `favicon-32.png`, `favicon-16.png` | 32 / 16 | browser tab |

Two variants exist on purpose:

- **Full-bleed** (`apple-touch-icon*`, favicons) — the artwork reaches the edges
  because iOS applies its own squircle mask; keeping the badge's own rounded
  corners would produce a visible double-rounded border.
- **Safe-zone padded** (`icon-maskable-*`) — the badge only occupies the inner
  ~72% so Android can crop it to a circle, squircle or rounded square without
  clipping the logo.

In-app iconography elsewhere is emoji + inline SVG, so nothing else is fetched
at runtime.
