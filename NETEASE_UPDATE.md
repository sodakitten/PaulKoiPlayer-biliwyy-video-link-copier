# v13.0.0 NetEase update

Supported input pages:

- `music.163.com/song?id=<songId>`
- `y.music.163.com/m/song?id=<songId>`
- `music.163.com/f/song?id=<songId>`
- `163cn.tv/<shortId>`
- `music.163.com/#/playlist?id=<playlistId>`
- Normal `/playlist`, `/f/playlist`, and `/m/playlist` forms

Behavior:

- Default `danmaku.paulkoishi.com` prefix follows the existing parser/direct priority setting.
- A non-default prefix forces direct-link resolution for NetEase pages.
- Direct-link mode follows the Docker backend protocol: short-link expansion, ZNNU key session, HMAC signature, `/api/song`, and AES-256-GCM response decryption.
- Playlist direct-link mode resolves `/api/playlist`, selects the requested track (default first), and then resolves that song through `/api/song`.
- Playlist pages always show a track-number prompt before parser-prefix or direct-link handling.
- Song pages and all non-playlist providers do not show this prompt.
