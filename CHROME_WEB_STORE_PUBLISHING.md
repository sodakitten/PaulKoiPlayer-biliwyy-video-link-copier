# Chrome Web Store 发布资料草稿

## 基本信息

- 扩展名称：PaulKoiPlayer B站网易云链接复制器
- 简短描述：一键复制 B 站视频/直播/分 P 和网易云音乐/歌单的播放器解析地址或媒体直链，适配 PaulKoiPlayer / YamaPlayer。
- 建议类别：生产力 / 工具
- 建议语言：简体中文
- 官网 / 支持链接：https://github.com/sodakitten/PaulKoiPlayer-biliwyy-video-link-copier
- 隐私政策：https://github.com/sodakitten/PaulKoiPlayer-biliwyy-video-link-copier/blob/main/PRIVACY.md

## 详细描述

PaulKoiPlayer B站网易云链接复制器是一个给 VRChat 世界播放器、YamaPlayer 和 PaulKoiPlayer 使用的链接复制工具。

点击扩展图标后，它会根据当前页面自动复制播放器解析地址或媒体直链。

支持：

- B 站普通视频页
- B 站分 P 视频
- B 站直播间
- 网易云音乐歌曲页
- 网易云音乐歌单页
- 网易云音乐短链接

默认行为：

- 单击复制解析地址。
- 双击复制直链。
- 默认解析地址为 `https://danmaku.paulkoishi.com/player/?url=`。
- 可在选项页切换备用解析地址 `https://biliplayer.91vrchat.com/player/?url=`。

说明：

- B 站直播检测到后会直接复制直播直链。
- B 站分 P 会按当前实际分 P 处理。
- B 站视频直链优先使用 MP4，不使用 DASH。
- 网易云歌单会先询问要播放第几首。
- 扩展不会打开弹窗广告，也不会收集用户浏览历史。

## 单一用途

在用户点击扩展图标时，把当前支持页面的 B 站或网易云音乐链接转换为播放器解析地址或媒体直链，并复制到剪贴板。

## 权限用途说明

- `activeTab`：只在用户点击扩展图标后读取当前标签页 URL，并在当前页执行复制或歌单选集操作。
- `scripting`：在当前页注入少量脚本，用于写入剪贴板、读取 B 站当前分 P 信息，以及在网易云歌单页询问要播放第几首。
- `storage`：保存用户设置，例如解析地址前缀、复制优先级、URL 编码开关和双击行为。
- `clipboardWrite`：把生成的播放器解析地址或媒体直链写入剪贴板。
- `offscreen`：Manifest V3 下的剪贴板写入备用方案，用于页面内复制失败时继续完成复制。

## 主机权限用途说明

- `https://www.bilibili.com/*`：识别 B 站视频页面和读取当前视频 / 分 P 信息。
- `https://live.bilibili.com/*`：识别 B 站直播间。
- `https://api.bilibili.com/*`：请求 B 站视频信息和 MP4 播放地址。
- `https://api.live.bilibili.com/*`：请求 B 站直播间信息和直播流地址。
- `https://*.bilivideo.com/*`、`https://*.hdslb.com/*`：允许复制和处理 B 站返回的媒体直链。
- `*://music.163.com/*`、`*://y.music.163.com/*`、`*://m.music.163.com/*`：识别网易云音乐歌曲和歌单页面。
- `*://163cn.tv/*`：识别网易云音乐短链接。
- `https://music.znnu.com/*`：解析网易云音乐歌曲、短链接和歌单直链。

## 隐私页填写建议

- 是否收集用户数据：不收集用于广告、画像、出售或跨站跟踪的用户数据。
- 是否处理网页内容：是。扩展会在用户点击图标时读取当前支持页面的网址和必要播放信息，用于生成解析地址或直链。
- 是否传输到第三方服务：直链模式会向 B 站官方接口和 `https://music.znnu.com/` 请求解析所需信息。
- 是否保存数据：只通过 `storage.sync` 保存用户设置；不保存播放历史。

## 测试账号 / 审核说明

本扩展不需要账号登录。

审核人员可按以下方式测试：

1. 打开任意 B 站普通视频页，点击扩展图标，检查剪贴板是否得到解析地址。
2. 快速双击扩展图标，检查剪贴板是否得到媒体直链。
3. 打开 B 站直播间，点击扩展图标，检查是否复制直播直链。
4. 打开网易云音乐歌曲页，点击扩展图标，检查是否复制解析地址。
5. 打开网易云音乐歌单页，点击扩展图标，输入第几首后检查剪贴板结果。
