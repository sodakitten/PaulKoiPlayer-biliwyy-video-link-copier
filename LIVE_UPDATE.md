# v10.1 live update

- Adds direct-link parsing for `https://live.bilibili.com/<roomId>` and `https://live.bilibili.com/blanc/<roomId>`.
- Live direct mode resolves the short room id first, checks whether the room is currently live, then copies a playable HLS stream URL when available.
- Live room pages always use direct-link mode now, regardless of single click, double click, or the configured priority.
- Existing video parsing and prefix-copy behavior are unchanged.
