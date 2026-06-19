<p align="center">
  <img src="assets/paulkoiplayer-logo.png" width="180" alt="PaulKoiPlayer logo">
</p>

# PaulKoiPlayer B站 / 网易云链接复制器 v13.1.1

Chrome Manifest V3 扩展。点击扩展图标后，把当前页面转换成 YamaPlayer / PaulKoiPlayer 可用的播放链接，或直接复制媒体直链。

## 支持范围

- B 站普通视频页
- B 站分 P 视频
- B 站直播间
- 网易云音乐歌曲页
- 网易云音乐 `f/song`、移动端歌曲页
- `163cn.tv` 网易云短链接
- 网易云歌单页

## 默认行为

- 单击：复制解析地址。
- 双击：复制直链。
- 默认解析地址：

```text
https://danmaku.paulkoishi.com/player/?url=
```

- 备用解析地址：

```text
https://biliplayer.91vrchat.com/player/?url=
```

在扩展选项里可以切换备用解析地址，也可以切换双击行为。

## 鸣谢 & 相关链接

- 默认解析服务：[PaulKoiPlayer Danmaku](https://danmaku.paulkoishi.com/)
- 备用解析地址 `https://biliplayer.91vrchat.com/player/?url=` 是第三方服务，来自：[91VRChat](https://91vrchat.com/)
- 网易云音乐直链解析使用：[music.znnu.com](https://music.znnu.com/)
- 相关仓库：[sodakitten/PaulKoiPlayer-vrc-bilibili-danmaku](https://github.com/sodakitten/PaulKoiPlayer-vrc-bilibili-danmaku)。如果想自己部署解析服务，可以参考这个仓库。

## 直链规则

- B 站直播：检测到直播间后，不管单击还是双击都直接提取直播直链。
- B 站分 P：使用默认解析地址时，单击仍复制解析地址，并按当前页面实际分 P 自动带上对应 `p`；不是默认解析地址或使用直链模式时，直接取直链。
- B 站视频直链优先取 MP4，不使用 DASH。
- 网易云音乐：默认解析地址下单击直接拼接当前页面地址；不是默认解析地址或使用直链模式时，通过 `https://music.znnu.com/` 接口解析直链。
- 网易云歌单：不管解析还是直链，都会先询问要第几首；其他页面不会弹窗。

## 图标角标

- `URL`：已复制解析地址。
- `DIR`：已复制直链。
- `NO`：当前页面不支持或用户取消歌单选择。
- `ERR`：解析失败。

## 安装

1. 下载或克隆本仓库。
2. 打开 `chrome://extensions/`。
3. 开启“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择本仓库目录。

## 设置

右键扩展图标，进入“选项”。

可设置：

- 复制优先级
- 播放器地址前缀
- 是否 URL 编码当前页面网址
- 切换备用解析地址
- 切换双击功能

## v13.1 更新

- 扩展图标、选项页和介绍页统一替换为 PaulKoiPlayer logo。

## v13.1.1 更新

- 扩展包加入 `zh_CN` 默认语言，让 Edge Add-ons 自动识别为中文商店语言。
- manifest 短描述去掉 YamaPlayer，仅保留 PaulKoiPlayer 和 VRChat 世界播放器说明。
