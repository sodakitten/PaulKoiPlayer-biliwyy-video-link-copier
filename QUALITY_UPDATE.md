# v10.2.3 stable quality update

- Standard video direct links already request `qn=80`, which is Bilibili's normal 1080P quality code.
- MP4 requests now explicitly use `fnval=1`, matching the current MP4 stream flag.
- MP4 requests do not use `try_look` or other probing parameters.
- Bilibili can still downgrade the actual stream. If `data.quality` comes back as `64`, the copied direct URL is 720P even though the extension requested 1080P.
- The extension does not use DASH for video direct links.
