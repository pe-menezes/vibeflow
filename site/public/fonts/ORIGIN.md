# Fonts: origin and license

The three families are under the SIL Open Font License 1.1. Each license sits next to the files, in `OFL-Newsreader.txt`, `OFL-Geist.txt` and `OFL-JetBrainsMono.txt`, downloaded from `https://raw.githubusercontent.com/google/fonts/main/ofl/<family>/OFL.txt` (folders `newsreader`, `geist` and `jetbrainsmono`).

The `woff2` files were downloaded on 2026-10-28 from Google Fonts, through the CSS at
`https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..600&family=Geist:wght@300..700&family=JetBrains+Mono:wght@400..500&display=swap`
requested with the User-Agent of a current Chrome, which returns the variable versions. Only the `latin` and `latin-ext` subsets are kept, with the same `unicode-range` Google declares (copied into the `@font-face` rules of `site/src/styles/global.css`). The site serves these files itself and makes no request to Google.

Declared ranges: Newsreader normal and italic, weights 300 to 600, with the `opsz` axis from 6 to 72; Geist, weights 300 to 700; JetBrains Mono, weights 400 and 500. Axes read from the `fvar` table of each file: Newsreader `wght 200..800, opsz 6..72`, Geist `wght 100..900`, JetBrains Mono `wght 400..800`.

| File | Family | Style | Weights | Subset | Bytes | sha256 | Source URL |
|---|---|---|---|---|---|---|---|
| `geist-latin-ext.woff2` | Geist | normal | 300 700 | latin-ext | 16540 | `58a6b173d5ca1dec92166ea3c6cb1a84a4144556d10928ac14e8e6b40e4787bd` | https://fonts.gstatic.com/s/geist/v5/gyByhwUxId8gMEwSGFWNOITddY4.woff2 |
| `geist-latin.woff2` | Geist | normal | 300 700 | latin | 29288 | `9b6f5ff45b278c744b5f379a2c4ecbaf858a842b8eaf82ac8d21b699ca16c608` | https://fonts.gstatic.com/s/geist/v5/gyByhwUxId8gMEwcGFWNOITd.woff2 |
| `jetbrains-mono-latin-ext.woff2` | JetBrains Mono | normal | 400 500 | latin-ext | 11596 | `9c38cb2d0d2d93c1ee6e21fa78db76f13ea7e15e15cc64214c7ca89b6aaa35c4` | https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPx7cwgknk-6nFg.woff2 |
| `jetbrains-mono-latin.woff2` | JetBrains Mono | normal | 400 500 | latin | 31340 | `2c32b9b3ee358c119e210f6f5195f9bd34894d78a785ff2e95d60e718e400af4` | https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxDcwgknk-4.woff2 |
| `newsreader-italic-latin-ext.woff2` | Newsreader | italic | 300 600 | latin-ext | 95412 | `750e9629f56ae71980f1dde315f5bdb6c81b49b13a8fec3246a4392853aa7ccd` | https://fonts.gstatic.com/s/newsreader/v26/cY9CfjOCX1hbuyalUrK439vCgIhCBJWxZCPp.woff2 |
| `newsreader-italic-latin.woff2` | Newsreader | italic | 300 600 | latin | 147060 | `a99fb127682b9af538780d21420037452197b0d37dfd273eb108f8a3665d5501` | https://fonts.gstatic.com/s/newsreader/v26/cY9CfjOCX1hbuyalUrK439vCjohCBJWxZA.woff2 |
| `newsreader-latin-ext.woff2` | Newsreader | normal | 300 600 | latin-ext | 86628 | `cbca001188852d514d8654be7ddc97868f039bdf986b926ec5c985c117853cfd` | https://fonts.gstatic.com/s/newsreader/v26/cY9AfjOCX1hbuyalUrK439DyjIJFJpeBZQ.woff2 |
| `newsreader-latin.woff2` | Newsreader | normal | 300 600 | latin | 131848 | `01817351be3edfc1714fe6d60ddea6a22a169a5ebd033b50c7f9495e5d9c386a` | https://fonts.gstatic.com/s/newsreader/v26/cY9AfjOCX1hbuyalUrK4397yjIJFJpc.woff2 |
