# v12.0.0 multipage behavior

- Standard multipage videos still use Bilibili's `x/web-interface/view` pages list as the source of truth.
- URLs with a `p` query select the matching `pages[p - 1].cid`.
- When the page URL does not include `p`, the extension tries to read the current page/cid from the active Bilibili page before copying.
- Prefix-copy mode appends the detected current page number only when needed, so external players receive the selected part instead of defaulting to P1.
- Direct-link mode prefers the detected current `cid` first, then falls back to the `p` index.
- Multipage videos use the default parser address on single click when the prefix is `https://danmaku.paulkoishi.com/player/?url=`.
- Multipage videos are still forced to direct-link mode when using a non-default parser prefix.
