# Bundling the brand font (optional, ~3 steps)

Right now Apple devices render the UI in **SF Pro Rounded**; Android/Windows fall
back to a plain system font and lose the rounded, friendly feel. To give every
device the same look, bundle a rounded webfont.

## Steps

1. Download a rounded variable woff2 with weights up to 900. Good free options:
   - **Baloo 2** — playful, very rounded (recommended for a kids' app)
   - **Nunito** — softer, more neutral
   - **Quicksand** — geometric, lighter
   Save it here as `fonts/rounded.woff2` (subset to Latin to keep it ~30–60 KB).

2. In `index.html`, uncomment the `@font-face` block at the top of `<style>` and
   add the family to the body stack, i.e. change:

       font-family:ui-rounded,"SF Pro Rounded", … ;

   to:

       font-family:"BT Rounded",ui-rounded,"SF Pro Rounded", … ;

3. In `sw.js`, add `"./fonts/rounded.woff2"` to the `ASSETS` array so it is cached
   for offline use, then run `node release.js` to bump the cache version.

`font-display:swap` is already set, so text shows immediately in the fallback and
swaps in the rounded font once it loads — no flash of invisible text.

## Licensing

Baloo 2, Nunito and Quicksand are all under the SIL Open Font License (OFL), which
permits bundling and redistribution. Keep the font's `OFL.txt` alongside the woff2.
