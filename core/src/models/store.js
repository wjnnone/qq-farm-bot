const process = require('node:process');
/**
 * 运行时存储 - 自动化开关、种子偏好、账号管理
 */

const { getDataFile, ensureDataDir } = require('../config/runtime-paths');
const { readTextFile, readJsonFile, writeJsonFileAtomic } = require('../services/json-db');

const STORE_FILE = getDataFile('store.json');
const ACCOUNTS_FILE = getDataFile('accounts.json');
const ALLOWED_PLANTING_STRATEGIES = ['preferred', 'level', 'max_exp', 'max_fert_exp', 'max_profit', 'max_fert_profit'];
const PUSHOO_CHANNELS = new Set([
    'webhook', 'qmsg', 'serverchan', 'pushplus', 'pushplushxtrip',
    'dingtalk', 'wecom', 'bark', 'gocqhttp', 'onebot', 'atri',
    'pushdeer', 'igot', 'telegram', 'feishu', 'ifttt', 'wecombot',
    'discord', 'wxpusher',
]);
const DEFAULT_OFFLINE_REMINDER = {
    channel: 'webhook',
    reloginUrlMode: 'none',
    endpoint: '',
    token: '',
    title: '账号下线提醒',
    msg: '账号下线',
    offlineDeleteSec: 120,
};
// ============ 全局配置 ============
const DEFAULT_ACCOUNT_CONFIG = {
    automation: {
        farm: true,
        farm_push: true,   // 收到 LandsNotify 推送时是否立即触发巡田
        land_upgrade: true, // 是否自动升级土地
        friend: true,       // 好友互动总开关
        friend_help_exp_limit: true, // 帮忙经验达上限后自动停止帮忙
        friend_steal: true, // 偷菜
        friend_help: true,  // 帮忙
        friend_bad: false,  // 捣乱(放虫草)
        task: true,
        // 以下功能默认启用，不再提供开关
        // email: true,
        // free_gifts: true,
        // share_reward: true,
        // vip_gift: true,
        // month_card: true,
        // open_server_gift: true,
        fertilizer_gift: false,
        fertilizer_buy: false,
        sell: true,
        fertilizer: 'none',
        skip_own_weed_bug: false,  // 不除自己草虫
    },
    plantingStrategy: 'preferred',
    preferredSeedId: 0,
    intervals: {
        farm: 2,
        farmMin: 2,
        farmMax: 2,
        // 好友巡查：帮助和偷菜各自独立的间隔
        helpMin: 10,
        helpMax: 10,
        stealMin: 10,
        stealMax: 10,
    },
    friendQuietHours: {
        enabled: false,
        start: '23:00',
        end: '07:00',
    },
    friendBlacklist: [],
    // 偷菜过滤配置
    stealFilter: {
        enabled: false,      // 是否启用偷菜过滤
        mode: 'blacklist',   // 模式: 'blacklist'(不偷列表中的) 或 'whitelist'(只偷列表中的)
        plantIds: [],        // 植物ID列表
    },
    // 偷菜好友黑名单/白名单配置
    stealFriendFilter: {
        enabled: false,      // 是否启用好友过滤
        mode: 'blacklist',   // 模式: 'blacklist'(不偷列表中的好友) 或 'whitelist'(只偷列表中的好友)
        friendIds: [],       // 好友GID列表
    },
    // 蔬菜黑名单（偷菜过滤）- 分账号独立
    plantBlacklist: [],
};
const ALLOWED_AUTOMATION_KEYS = new Set(Object.keys(DEFAULT_ACCOUNT_CONFIG.automation));

let accountFallbackConfig = {
    ...DEFAULT_ACCOUNT_CONFIG,
    automation: { ...DEFAULT_ACCOUNT_CONFIG.automation },
    intervals: { ...DEFAULT_ACCOUNT_CONFIG.intervals },
    friendQuietHours: { ...DEFAULT_ACCOUNT_CONFIG.friendQuietHours },
};

const globalConfig = {
    accountConfigs: {},
    defaultAccountConfig: cloneAccountConfig(DEFAULT_ACCOUNT_CONFIG),
    ui: {
        theme: 'dark',
    },
    offlineReminder: { ...DEFAULT_OFFLINE_REMINDER },
    // 用户隔离的下线提醒配置: { [username]: config }
    userOfflineReminders: {},
    adminPasswordHash: '',
};

function normalizeOfflineReminder(input) {
    const src = (input && typeof input === 'object') ? input : {};
    let offlineDeleteSec = Number.parseInt(src.offlineDeleteSec, 10);
    if (!Number.isFinite(offlineDeleteSec) || offlineDeleteSec < 1) {
        offlineDeleteSec = DEFAULT_OFFLINE_REMINDER.offlineDeleteSec;
    }
    const rawChannel = (src.channel !== undefined && src.channel !== null)
        ? String(src.channel).trim().toLowerCase()
        : '';
    const endpoint = (src.endpoint !== undefined && src.endpoint !== null)
        ? String(src.endpoint).trim()
        : DEFAULT_OFFLINE_REMINDER.endpoint;
    const migratedChannel = rawChannel
        || (PUSHOO_CHANNELS.has(String(endpoint || '').trim().toLowerCase())
            ? String(endpoint || '').trim().toLowerCase()
            : DEFAULT_OFFLINE_REMINDER.channel);
    const channel = PUSHOO_CHANNELS.has(migratedChannel)
        ? migratedChannel
        : DEFAULT_OFFLINE_REMINDER.channel;
    const rawReloginUrlMode = (src.reloginUrlMode !== undefined && src.reloginUrlMode !== null)
        ? String(src.reloginUrlMode).trim().toLowerCase()
        : DEFAULT_OFFLINE_REMINDER.reloginUrlMode;
    const reloginUrlMode = new Set(['none', 'qq_link', 'qr_link']).has(rawReloginUrlMode)
        ? rawReloginUrlMode
        : DEFAULT_OFFLINE_REMINDER.reloginUrlMode;
    const token = (src.token !== undefined && src.token !== null)
        ? String(src.token).trim()
        : DEFAULT_OFFLINE_REMINDER.token;
    const title = (src.title !== undefined && src.title !== null)
        ? String(src.title).trim()
        : DEFAULT_OFFLINE_REMINDER.title;
    const msg = (src.msg !== undefined && src.msg !== null)
        ? String(src.msg).trim()
        : DEFAULT_OFFLINE_REMINDER.msg;
    return {
        channel,
        reloginUrlMode,
        endpoint,
        token,
        title,
        msg,
        offlineDeleteSec,
    };
}

function cloneAccountConfig(base = DEFAULT_ACCOUNT_CONFIG) {
    const srcAutomation = (base && base.automation && typeof base.automation === 'object')
        ? base.automation
        : {};
    const automation = { ...DEFAULT_ACCOUNT_CONFIG.automation };
    for (const key of Object.keys(automation)) {
        if (srcAutomation[key] !== undefined) automation[key] = srcAutomation[key];
    }

    const rawBlacklist = Array.isArray(base.friendBlacklist) ? base.friendBlacklist : [];

    // 偷菜过滤配置
    const srcStealFilter = (base && base.stealFilter && typeof base.stealFilter === 'object')
        ? base.stealFilter
        : {};
    const stealFilter = {
        enabled: srcStealFilter.enabled !== undefined ? !!srcStealFilter.enabled : false,
        mode: (srcStealFilter.mode === 'whitelist' || srcStealFilter.mode === 'blacklist')
            ? srcStealFilter.mode
            : 'blacklist',
        plantIds: Array.isArray(srcStealFilter.plantIds)
            ? srcStealFilter.plantIds.map(id => Number.parseInt(id, 10) || 0).filter(id => id > 0)
            : [],
    };

    // 偷菜好友黑名单/白名单配置
    const srcStealFriendFilter = (base && base.stealFriendFilter && typeof base.stealFriendFilter === 'object')
        ? base.stealFriendFilter
        : {};
    const stealFriendFilter = {
        enabled: srcStealFriendFilter.enabled !== undefined ? !!srcStealFriendFilter.enabled : false,
        mode: (srcStealFriendFilter.mode === 'whitelist' || srcStealFriendFilter.mode === 'blacklist')
            ? srcStealFriendFilter.mode
            : 'blacklist',
        friendIds: Array.isArray(srcStealFriendFilter.friendIds)
            ? srcStealFriendFilter.friendIds.map(id => Number.parseInt(id, 10) || 0).filter(id => id > 0)
            : [],
    };

    // 蔬菜黑名单（分账号独立）
    const rawPlantBlacklist = Array.isArray(base.plantBlacklist) ? base.plantBlacklist : [];

    return {
        ...base,
        automation,
        intervals: { ...(base.intervals || DEFAULT_ACCOUNT_CONFIG.intervals) },
        friendQuietHours: { ...(base.friendQuietHours || DEFAULT_ACCOUNT_CONFIG.friendQuietHours) },
        friendBlacklist: rawBlacklist.map(Number).filter(n => Number.isFinite(n) && n > 0),
        plantingStrategy: ALLOWED_PLANTING_STRATEGIES.includes(String(base.plantingStrategy || ''))
            ? String(base.plantingStrategy)
            : DEFAULT_ACCOUNT_CONFIG.plantingStrategy,
        preferredSeedId: Math.max(0, Number.parseInt(base.preferredSeedId, 10) || 0),
        stealFilter,
        stealFriendFilter,
        plantBlacklist: rawPlantBlacklist.map(Number).filter(n => Number.isFinite(n) && n > 0),
    };
}

function resolveAccountId(accountId) {
    const direct = (accountId !== undefined && accountId !== null) ? String(accountId).trim() : '';
    if (direct) return direct;
    const envId = String(process.env.FARM_ACCOUNT_ID || '').trim();
    return envId;
}

function normalizeAccountConfig(input, fallback = accountFallbackConfig) {
    const src = (input && typeof input === 'object') ? input : {};
    const cfg = cloneAccountConfig(fallback || DEFAULT_ACCOUNT_CONFIG);

    if (src.automation && typeof src.automation === 'object') {
        for (const [k, v] of Object.entries(src.automation)) {
            if (!ALLOWED_AUTOMATION_KEYS.has(k)) continue;
            if (k === 'fertilizer') {
                const allowed = ['both', 'normal', 'organic', 'none'];
                cfg.automation[k] = allowed.includes(v) ? v : cfg.automation[k];
            } else {
                cfg.automation[k] = !!v;
            }
        }
    }

    if (src.plantingStrategy && ALLOWED_PLANTING_STRATEGIES.includes(src.plantingStrategy)) {
        cfg.plantingStrategy = src.plantingStrategy;
    }

    if (src.preferredSeedId !== undefined && src.preferredSeedId !== null) {
        cfg.preferredSeedId = Math.max(0, Number.parseInt(src.preferredSeedId, 10) || 0);
    }

    if (src.intervals && typeof src.intervals === 'object') {
        for (const [type, sec] of Object.entries(src.intervals)) {
            if (cfg.intervals[type] === undefined) continue;
            cfg.intervals[type] = Math.max(1, Number.parseInt(sec, 10) || cfg.intervals[type] || 1);
        }
        cfg.intervals = normalizeIntervals(cfg.intervals);
    } else {
        cfg.intervals = normalizeIntervals(cfg.intervals);
    }

    if (src.friendQuietHours && typeof src.friendQuietHours === 'object') {
        const old = cfg.friendQuietHours || {};
        cfg.friendQuietHours = {
            enabled: src.friendQuietHours.enabled !== undefined ? !!src.friendQuietHours.enabled : !!old.enabled,
            start: normalizeTimeString(src.friendQuietHours.start, old.start || '23:00'),
            end: normalizeTimeString(src.friendQuietHours.end, old.end || '07:00'),
        };
    }

    if (Array.isArray(src.friendBlacklist)) {
        cfg.friendBlacklist = src.friendBlacklist.map(Number).filter(n => Number.isFinite(n) && n > 0);
    }

    // 偷菜过滤配置
    if (src.stealFilter && typeof src.stealFilter === 'object') {
        const old = cfg.stealFilter || {};
        cfg.stealFilter = {
            enabled: src.stealFilter.enabled !== undefined ? !!src.stealFilter.enabled : !!old.enabled,
            mode: (src.stealFilter.mode === 'whitelist' || src.stealFilter.mode === 'blacklist')
                ? src.stealFilter.mode
                : (old.mode || 'blacklist'),
            plantIds: Array.isArray(src.stealFilter.plantIds)
                ? src.stealFilter.plantIds.map(id => Number.parseInt(id, 10) || 0).filter(id => id > 0)
                : (old.plantIds || []),
        };
    }

    // 偷菜好友黑名单/白名单配置
    if (src.stealFriendFilter && typeof src.stealFriendFilter === 'object') {
        const old = cfg.stealFriendFilter || {};
        cfg.stealFriendFilter = {
            enabled: src.stealFriendFilter.enabled !== undefined ? !!src.stealFriendFilter.enabled : !!old.enabled,
            mode: (src.stealFriendFilter.mode === 'whitelist' || src.stealFriendFilter.mode === 'blacklist')
                ? src.stealFriendFilter.mode
                : (old.mode || 'blacklist'),
            friendIds: Array.isArray(src.stealFriendFilter.friendIds)
                ? src.stealFriendFilter.friendIds.map(id => Number.parseInt(id, 10) || 0).filter(id => id > 0)
                : (old.friendIds || []),
        };
    }

    // 蔬菜黑名单（分账号独立）
    if (Array.isArray(src.plantBlacklist)) {
        cfg.plantBlacklist = src.plantBlacklist.map(Number).filter(n => Number.isFinite(n) && n > 0);
    }

    return cfg;
}

function getAccountConfigSnapshot(accountId) {
    const id = resolveAccountId(accountId);
    if (!id) return cloneAccountConfig(accountFallbackConfig);
    return normalizeAccountConfig(globalConfig.accountConfigs[id], accountFallbackConfig);
}

function setAccountConfigSnapshot(accountId, nextConfig, persist = true) {
    const id = resolveAccountId(accountId);
    if (!id) {
        accountFallbackConfig = normalizeAccountConfig(nextConfig, accountFallbackConfig);
        globalConfig.defaultAccountConfig = cloneAccountConfig(accountFallbackConfig);
        if (persist) saveGlobalConfig();
        return cloneAccountConfig(accountFallbackConfig);
    }
    globalConfig.accountConfigs[id] = normalizeAccountConfig(nextConfig, accountFallbackConfig);
    if (persist) saveGlobalConfig();
    return cloneAccountConfig(globalConfig.accountConfigs[id]);
}

function removeAccountConfig(accountId) {
    const id = resolveAccountId(accountId);
    if (!id) return;
    if (globalConfig.accountConfigs[id]) {
        delete globalConfig.accountConfigs[id];
        saveGlobalConfig();
    }
}

function ensureAccountConfig(accountId, options = {}) {
    const id = resolveAccountId(accountId);
    if (!id) return null;
    if (globalConfig.accountConfigs[id]) {
        return cloneAccountConfig(globalConfig.accountConfigs[id]);
    }
    globalConfig.accountConfigs[id] = normalizeAccountConfig(globalConfig.defaultAccountConfig, accountFallbackConfig);
    // 新账号默认不施肥（不受历史 defaultAccountConfig 旧值影响）
    if (globalConfig.accountConfigs[id] && globalConfig.accountConfigs[id].automation) {
        globalConfig.accountConfigs[id].automation.fertilizer = 'none';
    }
    if (options.persist !== false) saveGlobalConfig();
    return cloneAccountConfig(globalConfig.accountConfigs[id]);
}

// 加载全局配置
function loadGlobalConfig() {
    ensureDataDir();
    try {
        const data = readJsonFile(STORE_FILE, () => ({}));
        if (data && typeof data === 'object') {
            if (data.defaultAccountConfig && typeof data.defaultAccountConfig === 'object') {
                accountFallbackConfig = normalizeAccountConfig(data.defaultAccountConfig, DEFAULT_ACCOUNT_CONFIG);
            } else {
                accountFallbackConfig = cloneAccountConfig(DEFAULT_ACCOUNT_CONFIG);
            }
            globalConfig.defaultAccountConfig = cloneAccountConfig(accountFallbackConfig);

            const cfgMap = (data.accountConfigs && typeof data.accountConfigs === 'object')
                ? data.accountConfigs
                : {};
            globalConfig.accountConfigs = {};
            for (const [id, cfg] of Object.entries(cfgMap)) {
                const sid = String(id || '').trim();
                if (!sid) continue;
                globalConfig.accountConfigs[sid] = normalizeAccountConfig(cfg, accountFallbackConfig);
            }
            // 统一规范化，确保内存中不残留旧字段（如 automation.friend）
            globalConfig.defaultAccountConfig = cloneAccountConfig(accountFallbackConfig);
            for (const [id, cfg] of Object.entries(globalConfig.accountConfigs)) {
                globalConfig.accountConfigs[id] = normalizeAccountConfig(cfg, accountFallbackConfig);
            }
            globalConfig.ui = { ...globalConfig.ui, ...(data.ui || {}) };
            const theme = String(globalConfig.ui.theme || '').toLowerCase();
            globalConfig.ui.theme = theme === 'light' ? 'light' : 'dark';
            globalConfig.offlineReminder = normalizeOfflineReminder(data.offlineReminder);

            // 加载用户隔离的下线提醒配置
            if (data.userOfflineReminders && typeof data.userOfflineReminders === 'object') {
                globalConfig.userOfflineReminders = {};
                for (const [username, cfg] of Object.entries(data.userOfflineReminders)) {
                    if (username && cfg) {
                        globalConfig.userOfflineReminders[username] = normalizeOfflineReminder(cfg);
                    }
                }
            }
            // 兼容旧版本：将全局 offlineReminder 迁移到 admin 用户（如果存在）
            if (data.offlineReminder && typeof data.offlineReminder === 'object') {
                const legacyCfg = normalizeOfflineReminder(data.offlineReminder);
                // 只有当 admin 用户没有配置时才迁移
                if (!globalConfig.userOfflineReminders.admin) {
                    globalConfig.userOfflineReminders.admin = legacyCfg;
                }
            }

            if (typeof data.adminPasswordHash === 'string') {
                globalConfig.adminPasswordHash = data.adminPasswordHash;
            }
        }
    } catch (e) {
        console.error('加载配置失败:', e.message);
    }
}

function sanitizeGlobalConfigBeforeSave() {
    // default 配置统一白名单净化
    accountFallbackConfig = normalizeAccountConfig(globalConfig.defaultAccountConfig, DEFAULT_ACCOUNT_CONFIG);
    globalConfig.defaultAccountConfig = cloneAccountConfig(accountFallbackConfig);

    // 每个账号配置也统一净化
    const map = (globalConfig.accountConfigs && typeof globalConfig.accountConfigs === 'object')
        ? globalConfig.accountConfigs
        : {};
    const nextMap = {};
    for (const [id, cfg] of Object.entries(map)) {
        const sid = String(id || '').trim();
        if (!sid) continue;
        nextMap[sid] = normalizeAccountConfig(cfg, accountFallbackConfig);
    }
    globalConfig.accountConfigs = nextMap;

    // 净化用户隔离的下线提醒配置
    const userReminders = (globalConfig.userOfflineReminders && typeof globalConfig.userOfflineReminders === 'object')
        ? globalConfig.userOfflineReminders
        : {};
    const nextReminders = {};
    for (const [username, cfg] of Object.entries(userReminders)) {
        const u = String(username || '').trim();
        if (!u) continue;
        nextReminders[u] = normalizeOfflineReminder(cfg);
    }
    globalConfig.userOfflineReminders = nextReminders;
}

// 保存全局配置
function saveGlobalConfig() {
    ensureDataDir();
    try {
        const oldJson = readTextFile(STORE_FILE, '');

        sanitizeGlobalConfigBeforeSave();
        const newJson = JSON.stringify(globalConfig, null, 2);

        if (oldJson !== newJson) {
            console.warn('[系统] 正在保存配置到:', STORE_FILE);
            writeJsonFileAtomic(STORE_FILE, globalConfig);
        }
    } catch (e) {
        console.error('保存配置失败:', e.message);
    }
}

function getAdminPasswordHash() {
    return String(globalConfig.adminPasswordHash || '');
}

function setAdminPasswordHash(hash) {
    globalConfig.adminPasswordHash = String(hash || '');
    saveGlobalConfig();
    return globalConfig.adminPasswordHash;
}

// 初始化加载
loadGlobalConfig();

function getAutomation(accountId) {
    return { ...getAccountConfigSnapshot(accountId).automation };
}

function getConfigSnapshot(accountId) {
    const cfg = getAccountConfigSnapshot(accountId);
    return {
        automation: { ...cfg.automation },
        plantingStrategy: cfg.plantingStrategy,
        preferredSeedId: cfg.preferredSeedId,
        intervals: { ...cfg.intervals },
        friendQuietHours: { ...cfg.friendQuietHours },
        friendBlacklist: [...(cfg.friendBlacklist || [])],
        stealFilter: { ...(cfg.stealFilter || { enabled: false, mode: 'blacklist', plantIds: [] }) },
        stealFriendFilter: { ...(cfg.stealFriendFilter || { enabled: false, mode: 'blacklist', friendIds: [] }) },
        plantBlacklist: [...(cfg.plantBlacklist || [])],
        ui: { ...globalConfig.ui },
    };
}

function applyConfigSnapshot(snapshot, options = {}) {
    const cfg = snapshot || {};
    const persist = options.persist !== false;
    const accountId = options.accountId;

    const current = getAccountConfigSnapshot(accountId);
    const next = normalizeAccountConfig(current, accountFallbackConfig);

    if (cfg.automation && typeof cfg.automation === 'object') {
        for (const [k, v] of Object.entries(cfg.automation)) {
            if (next.automation[k] === undefined) continue;
            if (k === 'fertilizer') {
                const allowed = ['both', 'normal', 'organic', 'none'];
                next.automation[k] = allowed.includes(v) ? v : next.automation[k];
            } else {
                next.automation[k] = !!v;
            }
        }
    }

    if (cfg.plantingStrategy && ALLOWED_PLANTING_STRATEGIES.includes(cfg.plantingStrategy)) {
        next.plantingStrategy = cfg.plantingStrategy;
    }

    if (cfg.preferredSeedId !== undefined && cfg.preferredSeedId !== null) {
        next.preferredSeedId = Math.max(0, Number.parseInt(cfg.preferredSeedId, 10) || 0);
    }

    if (cfg.intervals && typeof cfg.intervals === 'object') {
        for (const [type, sec] of Object.entries(cfg.intervals)) {
            if (next.intervals[type] === undefined) continue;
            next.intervals[type] = Math.max(1, Number.parseInt(sec, 10) || next.intervals[type] || 1);
        }
        next.intervals = normalizeIntervals(next.intervals);
    }

    if (cfg.friendQuietHours && typeof cfg.friendQuietHours === 'object') {
        const old = next.friendQuietHours || {};
        next.friendQuietHours = {
            enabled: cfg.friendQuietHours.enabled !== undefined ? !!cfg.friendQuietHours.enabled : !!old.enabled,
            start: normalizeTimeString(cfg.friendQuietHours.start, old.start || '23:00'),
            end: normalizeTimeString(cfg.friendQuietHours.end, old.end || '07:00'),
        };
    }

    if (Array.isArray(cfg.friendBlacklist)) {
        next.friendBlacklist = cfg.friendBlacklist.map(Number).filter(n => Number.isFinite(n) && n > 0);
    }

    // 偷菜过滤配置
    if (cfg.stealFilter && typeof cfg.stealFilter === 'object') {
        const old = next.stealFilter || {};
        next.stealFilter = {
            enabled: cfg.stealFilter.enabled !== undefined ? !!cfg.stealFilter.enabled : !!old.enabled,
            mode: (cfg.stealFilter.mode === 'whitelist' || cfg.stealFilter.mode === 'blacklist')
                ? cfg.stealFilter.mode
                : (old.mode || 'blacklist'),
            plantIds: Array.isArray(cfg.stealFilter.plantIds)
                ? cfg.stealFilter.plantIds.map(id => Number.parseInt(id, 10) || 0).filter(id => id > 0)
                : (old.plantIds || []),
        };
    }

    // 偷菜好友过滤配置
    if (cfg.stealFriendFilter && typeof cfg.stealFriendFilter === 'object') {
        const old = next.stealFriendFilter || {};
        next.stealFriendFilter = {
            enabled: cfg.stealFriendFilter.enabled !== undefined ? !!cfg.stealFriendFilter.enabled : !!old.enabled,
            mode: (cfg.stealFriendFilter.mode === 'whitelist' || cfg.stealFriendFilter.mode === 'blacklist')
                ? cfg.stealFriendFilter.mode
                : (old.mode || 'blacklist'),
            friendIds: Array.isArray(cfg.stealFriendFilter.friendIds)
                ? cfg.stealFriendFilter.friendIds.map(id => Number.parseInt(id, 10) || 0).filter(id => id > 0)
                : (old.friendIds || []),
        };
    }

    // 蔬菜黑名单（分账号独立）
    if (Array.isArray(cfg.plantBlacklist)) {
        next.plantBlacklist = cfg.plantBlacklist.map(Number).filter(n => Number.isFinite(n) && n > 0);
    }

    if (cfg.ui && typeof cfg.ui === 'object') {
        const theme = String(cfg.ui.theme || '').toLowerCase();
        if (theme === 'dark' || theme === 'light') {
            globalConfig.ui.theme = theme;
        }
    }

    setAccountConfigSnapshot(accountId, next, false);
    if (persist) saveGlobalConfig();
    return getConfigSnapshot(accountId);
}

function setAutomation(key, value, accountId) {
    return applyConfigSnapshot({ automation: { [key]: value } }, { accountId });
}

function isAutomationOn(key, accountId) {
    return !!getAccountConfigSnapshot(accountId).automation[key];
}

function getPreferredSeed(accountId) {
    return getAccountConfigSnapshot(accountId).preferredSeedId;
}

function getPlantingStrategy(accountId) {
    return getAccountConfigSnapshot(accountId).plantingStrategy;
}

function getIntervals(accountId) {
    return { ...getAccountConfigSnapshot(accountId).intervals };
}

function normalizeIntervals(intervals) {
    const src = (intervals && typeof intervals === 'object') ? intervals : {};
    const toSec = (v, d) => Math.max(1, Number.parseInt(v, 10) || d);
    const farm = toSec(src.farm, 2);

    let farmMin = toSec(src.farmMin, farm);
    let farmMax = toSec(src.farmMax, farm);
    if (farmMin > farmMax) [farmMin, farmMax] = [farmMax, farmMin];

    // 帮助和偷菜的独立间隔，默认使用 10 秒
    let helpMin = toSec(src.helpMin, 10);
    let helpMax = toSec(src.helpMax, 10);
    if (helpMin > helpMax) [helpMin, helpMax] = [helpMax, helpMin];

    let stealMin = toSec(src.stealMin, 10);
    let stealMax = toSec(src.stealMax, 10);
    if (stealMin > stealMax) [stealMin, stealMax] = [stealMax, stealMin];

    return {
        ...src,
        farm,
        farmMin,
        farmMax,
        helpMin,
        helpMax,
        stealMin,
        stealMax,
    };
}

function normalizeTimeString(v, fallback) {
    const s = String(v || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!m) return fallback;
    const hh = Math.max(0, Math.min(23, Number.parseInt(m[1], 10)));
    const mm = Math.max(0, Math.min(59, Number.parseInt(m[2], 10)));
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function getFriendQuietHours(accountId) {
    return { ...getAccountConfigSnapshot(accountId).friendQuietHours };
}

function getFriendBlacklist(accountId) {
    return [...(getAccountConfigSnapshot(accountId).friendBlacklist || [])];
}

function setFriendBlacklist(accountId, list) {
    const current = getAccountConfigSnapshot(accountId);
    const next = normalizeAccountConfig(current, accountFallbackConfig);
    next.friendBlacklist = Array.isArray(list) ? list.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
    setAccountConfigSnapshot(accountId, next);
    return [...next.friendBlacklist];
}

// ============ 蔬菜黑名单（偷菜过滤）- 分账号独立 ============
function getPlantBlacklist(accountId) {
    return [...(getAccountConfigSnapshot(accountId).plantBlacklist || [])];
}

function setPlantBlacklist(accountId, list) {
    const current = getAccountConfigSnapshot(accountId);
    const next = normalizeAccountConfig(current, accountFallbackConfig);
    next.plantBlacklist = Array.isArray(list) ? list.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
    setAccountConfigSnapshot(accountId, next);
    return [...next.plantBlacklist];
}

// ============ 偷菜过滤配置 ============
function getStealFilterConfig(accountId) {
    const cfg = getAccountConfigSnapshot(accountId);
    return cfg.stealFilter || { enabled: false, mode: 'blacklist', plantIds: [] };
}

function setStealFilterConfig(config, accountId) {
    const current = getAccountConfigSnapshot(accountId);
    const next = cloneAccountConfig(current);
    next.stealFilter = {
        enabled: config.enabled !== undefined ? !!config.enabled : (next.stealFilter?.enabled || false),
        mode: (config.mode === 'whitelist' || config.mode === 'blacklist')
            ? config.mode
            : (next.stealFilter?.mode || 'blacklist'),
        plantIds: Array.isArray(config.plantIds)
            ? config.plantIds.map(id => Number.parseInt(id, 10) || 0).filter(id => id > 0)
            : (next.stealFilter?.plantIds || []),
    };
    return setAccountConfigSnapshot(accountId, next, true);
}

// ============ 偷菜好友黑名单/白名单配置 ============
function getStealFriendFilterConfig(accountId) {
    const cfg = getAccountConfigSnapshot(accountId);
    return cfg.stealFriendFilter || { enabled: false, mode: 'blacklist', friendIds: [] };
}

function setStealFriendFilterConfig(config, accountId) {
    const current = getAccountConfigSnapshot(accountId);
    const next = cloneAccountConfig(current);
    next.stealFriendFilter = {
        enabled: config.enabled !== undefined ? !!config.enabled : (next.stealFriendFilter?.enabled || false),
        mode: (config.mode === 'whitelist' || config.mode === 'blacklist')
            ? config.mode
            : (next.stealFriendFilter?.mode || 'blacklist'),
        friendIds: Array.isArray(config.friendIds)
            ? config.friendIds.map(id => Number.parseInt(id, 10) || 0).filter(id => id > 0)
            : (next.stealFriendFilter?.friendIds || []),
    };
    return setAccountConfigSnapshot(accountId, next, true);
}

function getUI() {
    return { ...globalConfig.ui };
}

function setUITheme(theme) {
    const t = String(theme || '').toLowerCase();
    const next = (t === 'light') ? 'light' : 'dark';
    return applyConfigSnapshot({ ui: { theme: next } });
}

// ============ 用户隔离的下线提醒配置 ============
function getOfflineReminder(username) {
    // 必须指定用户名，按用户隔离
    if (!username) {
        return normalizeOfflineReminder(globalConfig.offlineReminder);
    }
    const userCfg = globalConfig.userOfflineReminders && globalConfig.userOfflineReminders[username];
    if (userCfg) {
        return normalizeOfflineReminder(userCfg);
    }
    // 用户未设置时返回默认配置（但不保存到全局）
    return normalizeOfflineReminder({});
}

function setOfflineReminder(cfg, username) {
    // 必须指定用户名，按用户隔离
    if (!username) {
        // 兼容旧版本：如果没有指定用户名，保存到全局配置
        const current = normalizeOfflineReminder(globalConfig.offlineReminder);
        globalConfig.offlineReminder = normalizeOfflineReminder({ ...current, ...(cfg || {}) });
        saveGlobalConfig();
        return getOfflineReminder();
    }
    if (!globalConfig.userOfflineReminders) {
        globalConfig.userOfflineReminders = {};
    }
    const current = normalizeOfflineReminder(globalConfig.userOfflineReminders[username] || {});
    globalConfig.userOfflineReminders[username] = normalizeOfflineReminder({ ...current, ...(cfg || {}) });
    saveGlobalConfig();
    return getOfflineReminder(username);
}

function deleteUserOfflineReminder(username) {
    if (globalConfig.userOfflineReminders && globalConfig.userOfflineReminders[username]) {
        delete globalConfig.userOfflineReminders[username];
        saveGlobalConfig();
    }
}

// ============ 账号管理 ============
function loadAccounts() {
    ensureDataDir();
    const data = readJsonFile(ACCOUNTS_FILE, () => ({ accounts: [], nextId: 1 }));
    return normalizeAccountsData(data);
}

function saveAccounts(data) {
    ensureDataDir();
    writeJsonFileAtomic(ACCOUNTS_FILE, normalizeAccountsData(data));
}

function getAccounts() {
    return loadAccounts();
}

function normalizeAccountsData(raw) {
    const data = raw && typeof raw === 'object' ? raw : {};
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    const maxId = accounts.reduce((m, a) => Math.max(m, Number.parseInt(a && a.id, 10) || 0), 0);
    let nextId = Number.parseInt(data.nextId, 10);
    if (!Number.isFinite(nextId) || nextId <= 0) nextId = maxId + 1;
    if (accounts.length === 0) nextId = 1;
    if (nextId <= maxId) nextId = maxId + 1;
    return { accounts, nextId };
}

function addOrUpdateAccount(acc) {
    const data = normalizeAccountsData(loadAccounts());
    let touchedAccountId = '';
    if (acc.id) {
        const idx = data.accounts.findIndex(a => a.id === acc.id);
        if (idx >= 0) {
            data.accounts[idx] = { ...data.accounts[idx], ...acc, name: acc.name !== undefined ? acc.name : data.accounts[idx].name, updatedAt: Date.now() };
            touchedAccountId = String(data.accounts[idx].id || '');
        }
    } else {
        const id = data.nextId++;
        touchedAccountId = String(id);
        data.accounts.push({
            id: touchedAccountId,
            name: acc.name || `账号${id}`,
            code: acc.code || '',
            platform: acc.platform || 'qq',
            uin: acc.uin ? String(acc.uin) : '',
            qq: acc.qq ? String(acc.qq) : (acc.uin ? String(acc.uin) : ''),
            avatar: acc.avatar || acc.avatarUrl || '',
            username: acc.username || '', // 保存用户名字段
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    }
    saveAccounts(data);
    if (touchedAccountId) {
        ensureAccountConfig(touchedAccountId);
    }
    return data;
}

function deleteAccount(id) {
    const data = normalizeAccountsData(loadAccounts());
    data.accounts = data.accounts.filter(a => a.id !== String(id));
    if (data.accounts.length === 0) {
        data.nextId = 1;
    }
    saveAccounts(data);
    removeAccountConfig(id);
    return data;
}

// ============ 用户隔离支持 ============
function getAccountsByUser(username) {
    const allAccounts = loadAccounts();
    if (!username) return allAccounts;
    return {
        accounts: allAccounts.accounts.filter(a => a.username === username),
        nextId: allAccounts.nextId
    };
}

function deleteAccountsByUser(username) {
    const data = loadAccounts();
    const deletedIds = [];
    data.accounts = data.accounts.filter(a => {
        if (a.username === username) {
            deletedIds.push(a.id);
            return false;
        }
        return true;
    });
    if (data.accounts.length === 0) {
        data.nextId = 1;
    }
    saveAccounts(data);
    // 清理被删除账号的配置
    deletedIds.forEach(id => removeAccountConfig(id));
    return { deletedCount: deletedIds.length, deletedIds };
}

function deleteUserConfig(username) {
    // 删除用户特定的配置
    deleteUserOfflineReminder(username);
}

module.exports = {
    getConfigSnapshot,
    applyConfigSnapshot,
    getAutomation,
    setAutomation,
    isAutomationOn,
    getPreferredSeed,
    getPlantingStrategy,
    getIntervals,
    getFriendQuietHours,
    getFriendBlacklist,
    setFriendBlacklist,
    getUI,
    setUITheme,
    getOfflineReminder,
    setOfflineReminder,
    deleteUserOfflineReminder,
    getAccounts,
    addOrUpdateAccount,
    deleteAccount,
    getAdminPasswordHash,
    setAdminPasswordHash,
    // 偷菜过滤配置
    getStealFilterConfig,
    setStealFilterConfig,
    getStealFriendFilterConfig,
    setStealFriendFilterConfig,
    // 用户隔离支持
    getAccountsByUser,
    deleteAccountsByUser,
    deleteUserConfig,
    // 蔬菜黑名单（偷菜过滤）
    getPlantBlacklist,
    setPlantBlacklist,
};
