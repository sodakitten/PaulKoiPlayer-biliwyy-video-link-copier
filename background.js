const PRIMARY_PREFIX = 'https://danmaku.paulkoishi.com/player/?url=';
const BACKUP_PREFIX = 'https://biliplayer.91vrchat.com/player/?url=';
const ZNNU_BASE_URL = 'https://music.znnu.com';
const ZNNU_SIGNATURE_DOMAIN = 'music.znnu.com';
const ZNNU_REFERER = 'musicParser';
const ZNNU_SIGNATURE_SECRET = 'a09d0f3700a279584e1515354fbe08a7ee1c617f919543142fa625b82f1b5ad0';
const NETEASE_DEFAULT_LEVEL = 'standard';
const NETEASE_PLAYLIST_CACHE_TTL_MS = 30 * 60 * 1000;
const NETEASE_URL_CACHE_TTL_MS = 10 * 60 * 1000;

const DEFAULT_CONFIG = {
  prefix: PRIMARY_PREFIX,
  encodeUrl: true,
  priority: 'prefix',
  doubleClickAction: 'direct',
  prefixMigratedToDanmaku: false
};

let cachedConfig = { ...DEFAULT_CONFIG };
let znnuKeySession = null;
let znnuIp = null;
const neteasePlaylistCache = new Map();
const neteaseUrlCache = new Map();

const DOUBLE_CLICK_MS = 420;
const pendingClicks = new Map();

refreshCachedConfig().catch(() => {
  cachedConfig = normalizeConfig(DEFAULT_CONFIG);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  refreshCachedConfig().catch(() => {});
});

async function refreshCachedConfig() {
  const cfg = await chrome.storage.sync.get(DEFAULT_CONFIG);
  const migrated = migrateLegacyPrefix(cfg);
  cachedConfig = normalizeConfig(migrated);

  if (migrated !== cfg) {
    await chrome.storage.sync.set({
      prefix: migrated.prefix,
      prefixMigratedToDanmaku: true
    });
  }
}

function migrateLegacyPrefix(cfg = {}) {
  if (cfg.prefix === BACKUP_PREFIX && cfg.prefixMigratedToDanmaku !== true) {
    return {
      ...cfg,
      prefix: PRIMARY_PREFIX,
      prefixMigratedToDanmaku: true
    };
  }

  return cfg;
}

function normalizeConfig(cfg = {}) {
  return {
    prefix: typeof cfg.prefix === 'string' && cfg.prefix.trim() ? cfg.prefix.trim() : DEFAULT_CONFIG.prefix,
    encodeUrl: cfg.encodeUrl !== false,
    priority: cfg.priority === 'direct' ? 'direct' : 'prefix',
    doubleClickAction: cfg.doubleClickAction === 'prefix' ? 'prefix' : 'direct'
  };
}

function isBiliPageUrl(url = '') {
  return url.startsWith('https://www.bilibili.com/') || url.startsWith('https://live.bilibili.com/');
}

function isNeteasePageUrl(rawUrl = '') {
  const parsed = tryParseFlexibleUrl(rawUrl);
  if (!parsed) return false;

  const host = normalizeHost(parsed.hostname);
  if (host === '163cn.tv') return Boolean(parsed.pathname && parsed.pathname !== '/');
  if (!isNeteaseHost(host)) return false;

  return Boolean(findNeteaseSongId(parsed) || findNeteasePlaylistId(parsed));
}

function isSupportedPageUrl(url = '') {
  return isBiliPageUrl(url) || isNeteasePageUrl(url);
}

function isLiveBiliRoomUrl(rawUrl = '') {
  try {
    const url = new URL(rawUrl);
    return url.hostname === 'live.bilibili.com' && Boolean(parseLiveRoomId(url));
  } catch {
    return false;
  }
}

function buildPlayerUrl(tabUrl, options = {}) {
  const prefix = cachedConfig.prefix || DEFAULT_CONFIG.prefix;
  const urlPart = cachedConfig.encodeUrl ? encodeURIComponent(tabUrl) : tabUrl;
  const playerUrl = `${prefix}${urlPart}`;
  const page = positiveInt(options.page, 0);
  if (!page) return playerUrl;

  try {
    const parsed = new URL(playerUrl);
    parsed.searchParams.set('p', String(page));
    return parsed.href;
  } catch (_) {
    const separator = playerUrl.includes('?') ? '&' : '?';
    return `${playerUrl}${separator}p=${page}`;
  }
}

async function askNeteasePlaylistPage(tabId, initialPage = 1, maxTracks = 0) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (defaultPage, trackCount) => {
      const rangeText = trackCount > 0 ? `（1-${trackCount}）` : '（从 1 开始）';
      while (true) {
        const value = window.prompt(`请输入要播放歌单的第几首${rangeText}`, String(defaultPage));
        if (value === null) return 0;

        const page = Number.parseInt(String(value).trim(), 10);
        if (Number.isFinite(page) && page > 0 && (!trackCount || page <= trackCount)) {
          return page;
        }

        window.alert(trackCount > 0 ? `请输入 1 到 ${trackCount} 的整数` : '请输入大于 0 的整数');
      }
    },
    args: [positiveInt(initialPage, 1), positiveInt(maxTracks, 0)]
  });

  return positiveInt(result?.result, 0);
}

async function setBadge(tabId, text, color) {
  try {
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    }, 1800);
  } catch (_) {}
}

async function copyByInject(tabId, text) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (value) => {
      async function tryNavigatorClipboard(v) {
        if (!navigator.clipboard || !navigator.clipboard.writeText) return false;
        try {
          await navigator.clipboard.writeText(v);
          return true;
        } catch (_) {
          return false;
        }
      }

      function tryExecCommand(v) {
        try {
          const textarea = document.createElement('textarea');
          textarea.value = v;
          textarea.setAttribute('readonly', 'readonly');
          textarea.style.position = 'fixed';
          textarea.style.left = '-9999px';
          textarea.style.top = '0';
          textarea.style.opacity = '0';
          document.documentElement.appendChild(textarea);
          textarea.focus();
          textarea.select();
          textarea.setSelectionRange(0, textarea.value.length);
          const ok = document.execCommand('copy');
          textarea.remove();
          return ok;
        } catch (_) {
          return false;
        }
      }

      const ok1 = await tryNavigatorClipboard(value);
      if (ok1) return { ok: true, method: 'navigator.clipboard' };

      const ok2 = tryExecCommand(value);
      if (ok2) return { ok: true, method: 'execCommand' };

      return { ok: false, method: 'none' };
    },
    args: [text]
  });

  if (result?.result?.ok) return result.result;
  throw new Error('页面内复制失败');
}

async function hasOffscreenDocument() {
  if (!chrome.runtime.getContexts) return false;
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });
  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['CLIPBOARD'],
    justification: 'Copy generated Bilibili video URL to clipboard when extension icon is clicked.'
  });
}

async function copyByOffscreen(text) {
  await ensureOffscreenDocument();
  const res = await chrome.runtime.sendMessage({ type: 'COPY_TEXT_OFFSCREEN', text });
  if (res?.ok) return { ok: true, method: 'offscreen' };
  throw new Error(res?.error || 'offscreen 复制失败');
}

async function copyText(tabId, text) {
  try {
    return await copyByInject(tabId, text);
  } catch (_) {
    return await copyByOffscreen(text);
  }
}

chrome.action.onClicked.addListener((tab) => {
  const tabId = tab?.id;
  if (!tabId) return;

  const existing = pendingClicks.get(tabId);

  if (existing) {
    clearTimeout(existing.timer);
    pendingClicks.delete(tabId);
    const doubleClickMode = cachedConfig.doubleClickAction === 'prefix' ? 'prefix-once' : 'direct-once';
    handleCopy(tab, doubleClickMode).catch((err) => {
      console.warn('[Bili Link Copier] double click copy failed:', err?.message || err);
      setBadge(tabId, 'ERR', '#dc2626');
    });
    return;
  }

  const timer = setTimeout(() => {
    pendingClicks.delete(tabId);
    handleCopy(tab, 'normal').catch((err) => {
      console.warn('[Bili Link Copier] click copy failed:', err?.message || err);
      setBadge(tabId, 'ERR', '#dc2626');
    });
  }, DOUBLE_CLICK_MS);

  pendingClicks.set(tabId, { timer, createdAt: Date.now() });
});

async function handleCopy(tab, clickMode = 'normal') {
  const tabId = tab?.id;
  const tabUrl = tab?.url || '';

  if (!tabId) return;

  if (!isSupportedPageUrl(tabUrl)) {
    await setBadge(tabId, 'NO', '#888888');
    return;
  }

  const isNetease = isNeteasePageUrl(tabUrl);
  const isLiveRoom = !isNetease && isLiveBiliRoomUrl(tabUrl);
  let neteaseInput = null;
  if (isNetease) {
    try {
      neteaseInput = await parseNeteaseInput(tabUrl);
    } catch (err) {
      console.warn('[Bili Link Copier] NetEase input parsing failed:', err?.message || err);
    }

    if (neteaseInput?.type === 'playlist') {
      let trackCount = 0;
      try {
        const playlist = await getNeteasePlaylist(neteaseInput);
        trackCount = Array.isArray(playlist.tracks) ? playlist.tracks.length : 0;
      } catch (err) {
        console.warn('[Bili Link Copier] NetEase playlist metadata failed:', err?.message || err);
      }

      const selectedPage = await askNeteasePlaylistPage(tabId, neteaseInput.page, trackCount);
      if (!selectedPage) {
        await setBadge(tabId, 'NO', '#888888');
        return;
      }
      neteaseInput = { ...neteaseInput, page: selectedPage };
    }
  }

  const pageContext = isNetease ? { neteaseInput } : isLiveRoom ? {} : await getCurrentVideoPageContext(tabId);
  const effectiveTabUrl = isNetease || isLiveRoom ? tabUrl : applyVideoPageContextToUrl(tabUrl, pageContext);
  const isMultipageVideo = isNetease || isLiveRoom ? false : await isMultipageVideoUrl(effectiveTabUrl, pageContext);
  const shouldForceDirect = isNetease
    ? cachedConfig.prefix !== PRIMARY_PREFIX
    : isLiveRoom || (isMultipageVideo && cachedConfig.prefix !== PRIMARY_PREFIX);

  // URL/解析头模式只做简单拼接，不请求播放器、不检查能不能播放。
  // 成功标准只有一个：把拼接后的文本写入剪贴板。
  const parserUrl = buildPlayerUrl(effectiveTabUrl, {
    page: neteaseInput?.type === 'playlist' ? neteaseInput.page : 0
  });
  const attempts = shouldForceDirect
    ? ['direct']
    : clickMode === 'direct-once'
    ? ['direct', 'prefix']
    : clickMode === 'prefix-once'
    ? ['prefix', 'direct']
    : (cachedConfig.priority === 'direct' ? ['direct', 'prefix'] : ['prefix', 'direct']);

  for (const mode of attempts) {
    try {
      if (mode === 'prefix') {
        await copyText(tabId, parserUrl);
        await setBadge(tabId, 'URL', '#16a34a');
        return;
      }

      const directUrl = await getBestDirectUrl(tabId, effectiveTabUrl, pageContext);
      if (!directUrl) {
        console.warn('[Bili Link Copier] no direct media url found');
        continue;
      }

      await copyText(tabId, directUrl);
      await setBadge(tabId, 'DIR', '#16a34a');
      return;
    } catch (err) {
      console.warn(`[Bili Link Copier] ${mode} copy failed:`, err?.message || err);
    }
  }

  await setBadge(tabId, 'ERR', '#dc2626');
}

async function getBestDirectUrl(tabId, tabUrl, pageContext = null) {
  // 直链提取逻辑严格对齐用户提供的 Bili-VRC-Parser-0.1.0：
  // 1. 解析 BV/av 与分P
  // 2. x/web-interface/view 获取 cid
  // 3. x/player/playurl 获取 mp4 durl
  // 4. 返回 durl[0].url
  // 不再从页面 video/currentSrc/performance 里抓取候选地址。
  const context = pageContext || await getCurrentVideoPageContext(tabId);
  return getDirectUrlFromApi(tabUrl, context).catch((err) => {
    console.warn('[Bili Link Copier] api direct failed:', err?.message || err);
    return '';
  });
}

async function getCurrentVideoPageContext(tabId) {
  if (!tabId) return {};

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        function positiveInt(value, fallback = 0) {
          const number = Number.parseInt(value, 10);
          return Number.isFinite(number) && number > 0 ? number : fallback;
        }

        function normalizeBvid(value) {
          const text = String(value || '').trim();
          const match = text.match(/^(BV[0-9A-Za-z]+)/i);
          return match ? match[1] : '';
        }

        function normalizeAid(value) {
          const text = String(value || '').trim();
          const match = text.match(/^(?:av)?(\d+)$/i);
          return match ? match[1] : '';
        }

        function findActivePageIndex() {
          const activeSelectors = [
            '.video-pod__item.active',
            '.video-pod__item--active',
            '.video-pod__item.on',
            '.multi-page .cur-list .on',
            '.list-box li.on',
            '.cur-list li.on',
            '[class*="video-pod__item"][class*="active"]',
            '[class*="video-pod__item"][class*="current"]'
          ];

          const itemSelectors = [
            '.video-pod__item',
            '.multi-page .cur-list li',
            '.list-box li',
            '.cur-list li',
            '[class*="video-pod__item"]'
          ];

          for (const selector of activeSelectors) {
            const active = document.querySelector(selector);
            if (!active) continue;

            const attrPage = positiveInt(
              active.getAttribute('data-page') ||
              active.getAttribute('data-p') ||
              active.getAttribute('page'),
              0
            );
            if (attrPage) return attrPage;

            const attrIndex = positiveInt(
              active.getAttribute('data-index') ||
              active.getAttribute('data-idx'),
              0
            );
            if (attrIndex) return attrIndex + 1;

            for (const itemSelector of itemSelectors) {
              const item = active.closest(itemSelector);
              if (!item) continue;
              const items = Array.from(document.querySelectorAll(itemSelector));
              const index = items.indexOf(item);
              if (index >= 0) return index + 1;
            }
          }

          return 0;
        }

        let urlPage = 0;
        try {
          urlPage = positiveInt(new URL(location.href).searchParams.get('p'), 0);
        } catch (_) {}

        const state = window.__INITIAL_STATE__ || {};
        const videoData = state.videoData || state.videoInfo || {};
        const pages = Array.isArray(videoData.pages)
          ? videoData.pages
          : Array.isArray(state.pages)
          ? state.pages
          : [];

        const stateCid = positiveInt(state.cid || videoData.cid || state?.player?.cid, 0);
        const statePage = positiveInt(state.p || state.page || videoData.page, 0);
        const pageByCid = stateCid && pages.length
          ? pages.findIndex((item) => String(item.cid) === String(stateCid)) + 1
          : 0;
        const domPage = findActivePageIndex();
        const page = urlPage || domPage || pageByCid || statePage || 0;
        const pageInfo = page && pages[page - 1] ? pages[page - 1] : null;
        const cid = positiveInt(pageInfo?.cid || stateCid, 0);

        return {
          page,
          cid,
          pagesCount: pages.length,
          bvid: normalizeBvid(state.bvid || videoData.bvid),
          aid: normalizeAid(state.aid || videoData.aid),
          source: urlPage ? 'url' : domPage ? 'dom' : pageByCid ? 'state-cid' : statePage ? 'state' : ''
        };
      }
    });

    return result?.result && typeof result.result === 'object' ? result.result : {};
  } catch (err) {
    console.warn('[Bili Link Copier] read page context failed:', err?.message || err);
    return {};
  }
}

function applyVideoPageContextToUrl(rawUrl, pageContext = {}) {
  const page = positiveInt(pageContext.page, 0);
  if (!page || page <= 1) return rawUrl;

  try {
    const url = new URL(rawUrl);
    const hasVideoIdentity =
      /\/video\/(?:BV|av)/i.test(url.pathname) ||
      url.searchParams.has('bvid') ||
      url.searchParams.has('aid') ||
      url.searchParams.has('avid') ||
      url.searchParams.has('oid');

    if (url.hostname !== 'www.bilibili.com' || !hasVideoIdentity) {
      return rawUrl;
    }

    if (positiveInt(url.searchParams.get('p'), 0) === page) {
      return rawUrl;
    }

    url.searchParams.set('p', String(page));
    return url.href;
  } catch {
    return rawUrl;
  }
}

async function isMultipageVideoUrl(rawUrl, pageContext = {}) {
  const contextPagesCount = positiveInt(pageContext.pagesCount, 0);
  if (contextPagesCount > 1) return true;

  const input = parseBilibiliUrl(rawUrl, pageContext);
  if (!input || input.type !== 'video') return false;

  if (positiveInt(input.page, 1) > 1 || positiveInt(pageContext.page, 0) > 1) {
    return true;
  }

  try {
    const view = await getViewInfo(input);
    const pages = Array.isArray(view.pages) ? view.pages : [];
    return positiveInt(view.videos, pages.length) > 1 || pages.length > 1;
  } catch (err) {
    console.warn('[Bili Link Copier] multipage check failed:', err?.message || err);
    return false;
  }
}

function parseBilibiliUrl(rawUrl, pageContext = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const path = url.pathname;
  const host = url.hostname;

  if (host === 'live.bilibili.com') {
    const roomId = parseLiveRoomId(url);
    if (roomId) {
      return {
        type: 'live',
        roomId,
        url: rawUrl
      };
    }
  }

  // 兼容两类来源：
  // 1. 标准视频页：https://www.bilibili.com/video/BV... 或 /video/av...
  // 2. B站列表/稍后再看等页面：URL query 里带 bvid、aid、oid，例如 /list/watchlater?oid=...&bvid=BV...
  // DIR 只要能解析出 BV/av/aid，就继续走与 Bili-VRC-Parser 一致的 view -> playurl 流程。
  const bvFromPath = path.match(/\/video\/(BV[0-9A-Za-z]+)/i);
  const avFromPath = path.match(/\/video\/av(\d+)/i);
  const ep = path.match(/\/bangumi\/play\/ep(\d+)/i);

  const bvidFromQuery = url.searchParams.get('bvid') || '';
  const aidFromQuery = url.searchParams.get('aid') || url.searchParams.get('avid') || url.searchParams.get('oid') || '';

  const bvid = bvFromPath ? bvFromPath[1] : normalizeBvid(bvidFromQuery) || normalizeBvid(pageContext.bvid);
  const aid = avFromPath ? avFromPath[1] : normalizeAid(aidFromQuery) || normalizeAid(pageContext.aid);
  const urlPage = positiveInt(url.searchParams.get('p'), 0);
  const contextPage = positiveInt(pageContext.page, 0);
  const contextCid = positiveInt(pageContext.cid, 0);

  if (bvid || aid) {
    return {
      type: 'video',
      bvid,
      aid,
      page: urlPage || contextPage || 1,
      cid: contextCid || 0,
      url: rawUrl
    };
  }

  if (ep) {
    return {
      type: 'bangumi',
      epid: ep[1],
      page: 1,
      url: rawUrl
    };
  }

  return null;
}

function parseLiveRoomId(url) {
  const fromQuery = normalizeAid(url.searchParams.get('room_id') || url.searchParams.get('roomid') || '');
  if (fromQuery) return fromQuery;

  const segments = url.pathname
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const match = segment.match(/^(\d+)$/);
    if (match) return match[1];
  }

  return '';
}

function normalizeBvid(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(BV[0-9A-Za-z]+)/i);
  return match ? match[1] : '';
}

function normalizeAid(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(?:av)?(\d+)$/i);
  return match ? match[1] : '';
}

async function parseNeteaseInput(rawValue) {
  let normalizedUrl = decodeRepeatedly(rawValue);
  normalizedUrl = await expandNeteaseShortUrl(normalizedUrl);
  normalizedUrl = decodeRepeatedly(normalizedUrl);

  const parsed = tryParseFlexibleUrl(normalizedUrl);
  if (!parsed || !isNeteaseHost(parsed.hostname)) return null;

  const songId = findNeteaseSongId(parsed);
  if (songId) {
    return {
      type: 'song',
      songId,
      normalizedUrl: parsed.href,
      rawInput: rawValue,
      page: 1,
      level: NETEASE_DEFAULT_LEVEL
    };
  }

  const playlistId = findNeteasePlaylistId(parsed);
  if (!playlistId) return null;

  return {
    type: 'playlist',
    playlistId,
    normalizedUrl: parsed.href,
    rawInput: rawValue,
    page: findNeteasePage(parsed),
    level: NETEASE_DEFAULT_LEVEL
  };
}

function findNeteaseSongId(parsed) {
  if (!parsed) return '';

  for (const candidate of getNeteaseUrlCandidates(parsed)) {
    const path = String(candidate.pathname || '');
    const lowerPath = path.toLowerCase();
    const isSongPath = /(^|\/)(?:f\/|m\/)?song(\/|$)/.test(lowerPath) || lowerPath.includes('/song/media/outer/url');
    if (!isSongPath) continue;

    const queryId = normalizeNumericId(candidate.searchParams.get('id') || '');
    if (queryId) return queryId;

    const pathMatch = path.match(/\/(?:f\/|m\/)?song\/(\d+)/i);
    if (pathMatch) return pathMatch[1];
  }

  return '';
}

function findNeteasePlaylistId(parsed) {
  if (!parsed) return '';

  for (const candidate of getNeteaseUrlCandidates(parsed)) {
    const path = String(candidate.pathname || '');
    const lowerPath = path.toLowerCase();
    const isPlaylistPath = /(^|\/)(?:f\/|m\/)?playlist(\/|$)/.test(lowerPath) || lowerPath.includes('toplist');
    if (!isPlaylistPath) continue;

    const queryId = normalizeNumericId(candidate.searchParams.get('id') || '');
    if (queryId) return queryId;

    const pathMatch = path.match(/\/(?:f\/|m\/)?playlist\/(\d+)/i);
    if (pathMatch) return pathMatch[1];
  }

  return '';
}

function findNeteasePage(parsed) {
  for (const candidate of getNeteaseUrlCandidates(parsed)) {
    const page = positiveInt(candidate.searchParams.get('p') || candidate.searchParams.get('page'), 0);
    if (page) return page;
  }
  return 1;
}

function getNeteaseUrlCandidates(parsed) {
  if (!parsed) return [];

  const candidates = [parsed];
  const hash = parsed.hash ? parsed.hash.replace(/^#\/?/, '/') : '';
  if (hash) {
    try {
      candidates.push(new URL(hash, 'https://music.163.com'));
    } catch (_) {}
  }
  return candidates;
}

async function expandNeteaseShortUrl(value) {
  const parsed = tryParseFlexibleUrl(value);
  if (!parsed || normalizeHost(parsed.hostname) !== '163cn.tv') return value;

  const json = await znnuGetJson('/api/redirect', { url: parsed.href });
  if (json && json.code === 200 && typeof json.redirectUrl === 'string' && json.redirectUrl) {
    return json.redirectUrl;
  }

  throw new Error(json?.msg || json?.message || 'NetEase short link redirect failed.');
}

async function resolveNeteaseDirect(input) {
  if (input.type !== 'playlist') {
    return getNeteaseSongDirect(input);
  }

  const playlist = await getNeteasePlaylist(input);
  if (!playlist.tracks.length) {
    throw new Error(`NetEase playlist ${input.playlistId} has no tracks.`);
  }

  const index = Math.min(Math.max(positiveInt(input.page, 1), 1), playlist.tracks.length) - 1;
  const track = playlist.tracks[index];
  if (!track?.id) {
    throw new Error(`NetEase playlist ${input.playlistId} track ${index + 1} has no song id.`);
  }

  return getNeteaseSongDirect({
    type: 'song',
    songId: String(track.id),
    rawInput: String(track.id),
    page: index + 1,
    level: input.level
  });
}

async function getNeteasePlaylist(input) {
  const cacheKey = `netease-playlist:${input.playlistId}`;
  const cached = neteasePlaylistCache.get(cacheKey);
  if (cached && Date.now() - cached.time < NETEASE_PLAYLIST_CACHE_TTL_MS) {
    return cached.value;
  }

  const ip = await getZnnuIp();
  const decoded = await postZnnuForm('/api/playlist', {
    act: 'playlist',
    id: input.playlistId,
    rawInput: input.normalizedUrl || input.rawInput || input.playlistId,
    ip
  });

  if (decoded.code !== 200) {
    throw new Error(decoded.msg || decoded.message || `NetEase playlist ${input.playlistId} resolve failed.`);
  }

  const data = decoded.data || {};
  const playlist = {
    id: data.id || input.playlistId,
    name: data.name || '',
    tracks: Array.isArray(data.tracks) ? data.tracks : []
  };
  neteasePlaylistCache.set(cacheKey, { time: Date.now(), value: playlist });
  return playlist;
}

async function getNeteaseSongDirect(input) {
  const level = normalizeNeteaseLevel(input.level || NETEASE_DEFAULT_LEVEL);
  const cacheKey = `netease-song:${input.songId}:${level}`;
  const cached = neteaseUrlCache.get(cacheKey);
  if (cached && Date.now() - cached.time < NETEASE_URL_CACHE_TTL_MS) {
    return cached.url;
  }

  const ip = await getZnnuIp();
  const decoded = await postZnnuForm('/api/song', {
    act: 'song',
    id: input.songId,
    level,
    rawInput: input.normalizedUrl || input.rawInput || input.songId,
    ip
  });

  if (decoded.code !== 200) {
    throw new Error(decoded.msg || decoded.message || `NetEase song ${input.songId} resolve failed.`);
  }

  const audioUrl = normalizePlayableUrl(decoded.data?.url);
  if (!audioUrl) {
    throw new Error(decoded.msg || decoded.message || `NetEase song ${input.songId} has no playable url.`);
  }

  neteaseUrlCache.set(cacheKey, { time: Date.now(), url: audioUrl });
  return audioUrl;
}

async function postZnnuForm(path, payload) {
  const session = await getZnnuKeySession();
  const signed = await signZnnuPayload(payload);
  const body = new URLSearchParams({
    ...payload,
    signature: signed.signature,
    timestamp: String(signed.timestamp),
    domain: signed.domain
  });

  const json = await znnuFetchJson(path, {
    method: 'POST',
    headers: znnuHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Key-Token': session.keyToken
    }),
    body
  });

  return decodeZnnuResponse(json, session.key);
}

async function getZnnuKeySession() {
  const now = Math.floor(Date.now() / 1000);
  if (znnuKeySession && positiveInt(znnuKeySession.expireAt, 0) - 5 > now) {
    return znnuKeySession;
  }

  const json = await znnuGetJson('/api/key');
  const data = json?.data || null;
  if (json.code !== 200 || !data?.key || !data?.keyToken || !data?.expireAt) {
    throw new Error(json?.msg || json?.message || 'Failed to get ZNNU key.');
  }

  znnuKeySession = {
    key: data.key,
    keyToken: data.keyToken,
    expireAt: positiveInt(data.expireAt, 0)
  };
  return znnuKeySession;
}

async function getZnnuIp() {
  if (znnuIp !== null) return znnuIp;

  try {
    const json = await znnuGetJson('/api/ip');
    znnuIp = typeof json?.ip === 'string' ? json.ip : '';
  } catch (_) {
    znnuIp = '';
  }

  return znnuIp;
}

async function znnuGetJson(path, query = {}) {
  const url = new URL(path, ZNNU_BASE_URL);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return znnuFetchJson(url);
}

async function znnuFetchJson(urlOrPath, options = {}) {
  const url = urlOrPath instanceof URL ? urlOrPath : new URL(urlOrPath, ZNNU_BASE_URL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || znnuHeaders(),
      body: options.body,
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`ZNNU request failed with HTTP ${response.status}.`);

    try {
      return JSON.parse(text);
    } catch (_) {
      throw new Error('ZNNU returned non-JSON response.');
    }
  } finally {
    clearTimeout(timeout);
  }
}

function znnuHeaders(extra = {}) {
  return {
    'Accept': 'application/json, text/plain, */*',
    'X-Referer': ZNNU_REFERER,
    ...extra
  };
}

async function signZnnuPayload(payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const cleanPayload = { ...payload };
  delete cleanPayload.signature;
  delete cleanPayload.timestamp;
  delete cleanPayload.domain;
  delete cleanPayload.ver;

  const signString = Object.keys(cleanPayload)
    .sort()
    .reduce((result, key) => result + key + '=' + cleanPayload[key], String(timestamp) + ZNNU_SIGNATURE_DOMAIN);

  return {
    signature: await hmacSha256Hex(ZNNU_SIGNATURE_SECRET, signString),
    timestamp,
    domain: ZNNU_SIGNATURE_DOMAIN
  };
}

async function hmacSha256Hex(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function decodeZnnuResponse(json, keyBase64) {
  if (!json?.data || json.data.enc !== 1 || json.data.alg !== 'AES-256-GCM') return json;

  const keyBytes = base64ToBytes(keyBase64);
  const iv = base64ToBytes(json.data.iv || '');
  const ciphertext = base64ToBytes(json.data.ciphertext || '');
  const tag = base64ToBytes(json.data.tag || '');
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);

  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    combined
  );
  return { ...json, data: JSON.parse(new TextDecoder().decode(decrypted)) };
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeRepeatedly(value) {
  let current = String(value || '').trim();
  for (let index = 0; index < 3; index++) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch (_) {
      break;
    }
  }
  return current;
}

function tryParseFlexibleUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  try {
    return new URL(text);
  } catch (_) {
    try {
      return new URL('https://' + text);
    } catch (_) {
      return null;
    }
  }
}

function normalizeHost(value) {
  return String(value || '').trim().toLowerCase().replace(/^www\./, '');
}

function isNeteaseHost(value) {
  const host = normalizeHost(value);
  return host === 'music.163.com' || host === 'y.music.163.com' || host === 'm.music.163.com';
}

function normalizeNumericId(value) {
  const match = String(value || '').match(/^\d+$/);
  return match ? match[0] : '';
}

function normalizePlayableUrl(value) {
  const normalized = String(value || '').replace(/`/g, '').trim().replace(/^http:\/\//i, 'https://');
  return /^https?:\/\//i.test(normalized) ? normalized : '';
}

function normalizeNeteaseLevel(value) {
  const text = String(value || '').trim().toLowerCase();
  return ['standard', 'exhigh', 'lossless', 'hires', 'sky', 'jyeffect', 'jymaster'].includes(text)
    ? text
    : NETEASE_DEFAULT_LEVEL;
}

async function getDirectUrlFromApi(tabUrl, pageContext = {}) {
  const neteaseInput = pageContext.neteaseInput || await parseNeteaseInput(tabUrl);
  if (neteaseInput) {
    return resolveNeteaseDirect(neteaseInput);
  }

  const input = parseBilibiliUrl(tabUrl, pageContext);
  if (!input) return '';

  if (input.type === 'live') {
    return parseLiveDirect(input, { quality: 10000 });
  }

  if (input.type === 'video') {
    return parseStandardVideoDirect(input, { quality: 80 });
  }

  throw new Error('番剧/课程页面已识别，但这个原型先支持普通视频 BV/av 页面');
}

async function parseStandardVideoDirect(input, options) {
  const view = await getViewInfo(input);
  const page = selectVideoPage(view, input);

  if (!page || !page.cid) {
    throw new Error('没有找到当前分P的 cid');
  }

  const quality = positiveInt(options.quality, 80);
  const play = await getPlayUrl({
    aid: view.aid || input.aid,
    bvid: view.bvid || input.bvid,
    cid: page.cid,
    quality
  });

  const direct = normalizePlayResult(play);
  return direct.directUrl || '';
}

function selectVideoPage(view, input) {
  const pages = Array.isArray(view.pages) ? view.pages : [];
  if (!pages.length) return null;

  const currentCid = positiveInt(input.cid, 0);
  if (currentCid) {
    const byCid = pages.find((page) => String(page.cid) === String(currentCid));
    if (byCid) return byCid;
  }

  const pageIndex = Math.max(0, Math.min((input.page || 1) - 1, pages.length - 1));
  return pages[pageIndex];
}

async function parseLiveDirect(input, options) {
  const room = await getLiveRoomInfo(input.roomId);
  if (!room || !room.room_id) {
    throw new Error('live room info not found');
  }

  if (room.live_status !== 1) {
    throw new Error('live room is not streaming');
  }

  const playInfo = await getLivePlayInfo(room.room_id, positiveInt(options.quality, 10000));
  const direct = normalizeLivePlayResult(playInfo);
  if (!direct.directUrl) {
    throw new Error('live stream url not found');
  }

  return direct.directUrl;
}

async function getLiveRoomInfo(roomId) {
  const params = new URLSearchParams({ id: String(roomId) });
  const json = await getJson(`https://api.live.bilibili.com/room/v1/Room/room_init?${params}`);
  if (json.code !== 0 || !json.data) {
    throw new Error(json.message || json.msg || 'get live room info failed');
  }
  return json.data;
}

async function getLivePlayInfo(realRoomId, quality) {
  const params = new URLSearchParams({
    room_id: String(realRoomId),
    protocol: '0,1',
    format: '1',
    codec: '0,1',
    qn: String(quality),
    platform: 'h5',
    ptype: '8'
  });

  const json = await getJson(`https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?${params}`);
  if (json.code !== 0 || !json.data) {
    throw new Error(json.message || json.msg || 'get live stream failed');
  }
  return json.data;
}

async function getViewInfo(input) {
  const params = new URLSearchParams();
  if (input.bvid) params.set('bvid', input.bvid);
  if (input.aid) params.set('aid', input.aid);

  const json = await getJson(`https://api.bilibili.com/x/web-interface/view?${params}`);
  if (json.code !== 0 || !json.data) {
    throw new Error(json.message || '获取视频信息失败');
  }

  if (!Array.isArray(json.data.pages) || json.data.pages.length === 0) {
    throw new Error('视频没有可用分P信息');
  }

  return json.data;
}

async function getPlayUrl({ aid, bvid, cid, quality }) {
  const params = new URLSearchParams({
    avid: aid ? String(aid) : '',
    bvid: bvid || '',
    cid: String(cid),
    qn: String(Math.max(quality, 80)),
    type: 'mp4',
    otype: 'json',
    fnver: '0',
    fnval: '1',
    fourk: '1',
    platform: 'html5',
    high_quality: '1'
  });

  const json = await getJson(`https://api.bilibili.com/x/player/playurl?${params}`);
  if (json.code !== 0 || !json.data) {
    throw new Error(json.message || '获取播放地址失败');
  }

  return json.data;
}

async function getJson(url) {
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Accept': 'application/json, text/plain, */*'
    }
  });

  if (!response.ok) {
    throw new Error(`请求失败: HTTP ${response.status}`);
  }

  return response.json();
}

function normalizePlayResult(data) {
  const first = Array.isArray(data.durl) ? data.durl[0] : null;
  return {
    actualQuality: data.quality,
    acceptQuality: data.accept_quality || [],
    directUrl: first ? first.url : '',
    videoUrl: first ? first.url : '',
    audioUrl: '',
    backupUrls: first ? first.backup_url || first.backupUrl || [] : []
  };
}

function normalizeLivePlayResult(data) {
  const streams = data?.playurl_info?.playurl?.stream;
  if (!Array.isArray(streams)) {
    return { directUrl: '', actualQuality: 0, backupUrls: [] };
  }

  const candidates = [];

  for (const stream of streams) {
    const protocolName = stream?.protocol_name || '';
    const formats = Array.isArray(stream?.format) ? stream.format : [];

    for (const format of formats) {
      const formatName = format?.format_name || '';
      const codecs = Array.isArray(format?.codec) ? format.codec : [];

      for (const codec of codecs) {
        const baseUrl = codec?.base_url || codec?.baseUrl || '';
        const urlInfos = Array.isArray(codec?.url_info) ? codec.url_info : [];
        const codecName = codec?.codec_name || '';
        const quality = positiveInt(codec?.current_qn, 0);

        for (const urlInfo of urlInfos) {
          const fullUrl = combineLiveUrl(urlInfo?.host || '', baseUrl, urlInfo?.extra || '');
          if (!fullUrl) continue;

          candidates.push({
            url: fullUrl,
            quality,
            score: liveCandidateScore(protocolName, formatName, codecName, quality)
          });
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates[0];

  return {
    directUrl: selected ? selected.url : '',
    actualQuality: selected ? selected.quality : 0,
    backupUrls: candidates.slice(1, 6).map((item) => item.url)
  };
}

function combineLiveUrl(host, baseUrl, extra) {
  if (!host || !baseUrl) return '';
  const normalizedHost = host.endsWith('/') ? host.slice(0, -1) : host;
  const normalizedBase = baseUrl.startsWith('/') ? baseUrl : '/' + baseUrl;
  return normalizedHost + normalizedBase + (extra || '');
}

function liveCandidateScore(protocolName, formatName, codecName, quality) {
  let score = positiveInt(quality, 0);

  if (protocolName === 'http_hls') score += 100000;
  if (formatName === 'fmp4') score += 20000;
  if (formatName === 'ts') score += 10000;
  if (formatName === 'flv') score += 1000;
  if (codecName === 'avc') score += 500;
  if (codecName === 'hevc') score += 100;

  return score;
}

function positiveInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
