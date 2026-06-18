# v12.0.0 update

- Package and extension version are now v12.
- Default parser prefix is `https://danmaku.paulkoishi.com/player/?url=`.
- Backup parser prefix button switches to `https://biliplayer.91vrchat.com/player/?url=`.
- Default behavior is single-click parser URL and double-click direct URL.
- Multipage parser URLs use the current page number dynamically, not a fixed page number.
- NetEase song pages and `163cn.tv` short links are supported.
- With the default parser prefix, single click copies the parser URL containing the current NetEase page URL.
- With a non-default prefix or direct-link action, the extension resolves a direct audio URL through `music.znnu.com`.
- NetEase hash playlist URLs are supported for both parser-prefix and direct-link modes.
