/**
 * 管理面板 HTTP 服务
 * 改写为接收 DataProvider 模式
 */

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { CONFIG } = require('./config');
const { addOrUpdateAccount, deleteAccount } = require('./store');
const store = require('./store'); // 引入 store 模块
const { QRLoginSession, MiniProgramLoginSession } = require('./qrlogin');
const { CookieUtils } = require('./qrutils');
const { getResourcePath } = require('./runtime-paths');
const userStore = require('./user-store');

const hashPassword = (pwd) => crypto.createHash('sha256').update(String(pwd || '')).digest('hex');

let app = null;
let server = null;
let provider = null; // DataProvider

function startAdminServer(dataProvider) {
    if (app) return;
    provider = dataProvider;

    app = express();
    app.use(express.json());

    const tokens = new Set();
    const tokenUserMap = new Map();

    const issueToken = () => crypto.randomBytes(24).toString('hex');
    const authRequired = (req, res, next) => {
        const token = req.headers['x-admin-token'];
        if (!token || !tokens.has(token)) {
            console.log('[authRequired] Token无效或不存在:', token ? 'Token不存在于服务器' : 'Token为空');
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        req.adminToken = token;
        req.currentUser = tokenUserMap.get(token);
        if (!req.currentUser) {
            console.log('[authRequired] Token有效但用户信息不存在');
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        
        // 管理员不检查封禁和过期
        if (req.currentUser && req.currentUser.role !== 'admin') {
            // 检查用户状态（每次请求都检查）
            if (req.currentUser.card) {
                // 检查是否被封禁
                if (req.currentUser.card.enabled === false) {
                    console.log('[请求拒绝] 用户已被封禁:', req.currentUser.username);
                    tokens.delete(token);
                    tokenUserMap.delete(token);
                    return res.status(403).json({ ok: false, error: '账号已被封禁' });
                }
                
                // 检查是否过期
                if (req.currentUser.card.expiresAt) {
                    const now = Date.now();
                    if (req.currentUser.card.expiresAt < now) {
                        console.log('[请求拒绝] 用户已过期:', req.currentUser.username);
                        tokens.delete(token);
                        tokenUserMap.delete(token);
                        return res.status(403).json({ ok: false, error: '账号已过期' });
                    }
                }
            }
        }
        
        next();
    };
    const adminRequired = (req, res, next) => {
        if (!req.currentUser || req.currentUser.role !== 'admin') {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        next();
    };

    // 账号所有权验证中间件 - 确保用户只能访问自己的账号
    const accountOwnershipRequired = (req, res, next) => {
        const accountId = req.headers['x-account-id'] || req.params.id;
        if (!accountId) {
            return res.status(400).json({ ok: false, error: 'Missing account ID' });
        }
        
        // 获取账号信息
        const allAccounts = store.getAccounts();
        const account = allAccounts.accounts.find(a => String(a.id) === String(accountId));
        
        if (!account) {
            return res.status(404).json({ ok: false, error: '账号不存在' });
        }
        
        // 验证所有权
        if (account.username !== req.currentUser.username) {
            console.log(`[权限拒绝] 用户 ${req.currentUser.username} 尝试访问账号 ${accountId} (所有者: ${account.username})`);
            return res.status(403).json({ ok: false, error: '无权操作此账号' });
        }
        
        // 将账号信息附加到请求对象，方便后续使用
        req.account = account;
        next();
    };

    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, x-account-id, x-admin-token');
        if (req.method === 'OPTIONS') return res.sendStatus(200);
        next();
    });

    const panelDir = getResourcePath('panel');
    app.use(express.static(panelDir));
    app.use('/game-config', express.static(getResourcePath('gameConfig')));

    // 登录与鉴权
    app.post('/api/login', (req, res) => {
        const { username, password } = req.body || {};
        
        if (!username || !password) {
            return res.status(400).json({ ok: false, error: '请提供用户名和密码' });
        }
        
        const user = userStore.validateUser(username, password);
        if (!user) {
            return res.status(401).json({ ok: false, error: '用户名或密码错误' });
        }
        
        console.log('[登录检查] 用户:', username, '角色:', user.role, '卡密信息:', user.card);
        
        // 管理员不检查封禁和过期
        if (user.role !== 'admin') {
            // 检查用户是否被封禁
            if (user.card && user.card.enabled === false) {
                console.log('[登录拒绝] 用户已被封禁:', username);
                return res.status(403).json({ ok: false, error: '账号已被封禁，请联系管理员' });
            }
            
            // 检查是否过期（仅对非永久卡）
            if (user.card && user.card.expiresAt) {
                const now = Date.now();
                if (user.card.expiresAt < now) {
                    console.log('[登录拒绝] 用户已过期:', username);
                    return res.status(403).json({ ok: false, error: '账号已过期，请续费后重新登录' });
                }
            }
        }
        
        const token = issueToken();
        tokens.add(token);
        tokenUserMap.set(token, user);
        console.log('[登录成功]', username);
        res.json({ ok: true, data: { token, role: user.role, card: user.card, user: { username: user.username } } });
    });

    app.post('/api/register', (req, res) => {
        const { username, password, cardCode } = req.body || {};
        if (!username || !password || !cardCode) {
            return res.status(400).json({ ok: false, error: '请填写完整信息' });
        }
        const result = userStore.registerUser(username, password, cardCode);
        if (!result.ok) {
            return res.status(400).json(result);
        }
        res.json(result);
    });

    app.post('/api/user/renew', authRequired, (req, res) => {
        const { cardCode } = req.body || {};
        if (!cardCode) {
            return res.status(400).json({ ok: false, error: '请提供卡密' });
        }
        const result = userStore.renewUser(req.currentUser.username, cardCode);
        if (!result.ok) {
            return res.status(400).json(result);
        }
        // 更新 tokenUserMap 中的用户信息
        const token = req.adminToken;
        if (token && tokenUserMap.has(token)) {
            const user = tokenUserMap.get(token);
            user.card = result.card;
            tokenUserMap.set(token, user);
        }
        res.json(result);
    });

    app.post('/api/user/change-password', authRequired, (req, res) => {
        const { oldPassword, newPassword } = req.body || {};
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ ok: false, error: '请提供旧密码和新密码' });
        }
        const result = userStore.changePassword(req.currentUser.username, oldPassword, newPassword);
        if (!result.ok) {
            return res.status(400).json(result);
        }
        res.json(result);
    });

    app.use('/api', (req, res, next) => {
        const publicPaths = ['/login', '/register', '/user/login', '/user/renew', '/qr/create', '/qr/check'];
        if (publicPaths.some(p => req.path.startsWith(p))) return next();
        return authRequired(req, res, next);
    });

    app.get('/api/ping', (req, res) => {
        res.json({ ok: true, data: { ok: true } });
    });

    app.post('/api/logout', (req, res) => {
        const token = req.adminToken;
        if (token) {
            tokens.delete(token);
            tokenUserMap.delete(token);
        }
        res.json({ ok: true });
    });

    // API: 获取当前用户信息
    app.get('/api/user/info', authRequired, (req, res) => {
        try {
            const user = req.currentUser;
            if (!user) {
                return res.status(401).json({ ok: false, error: 'Unauthorized' });
            }
            res.json({ ok: true, data: { 
                username: user.username, 
                role: user.role, 
                card: user.card 
            }});
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // Helper to get account ID from header
    const getAccId = (req) => req.headers['x-account-id'];

    // API: 完整状态
    app.get('/api/status', accountOwnershipRequired, async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.json({ ok: false, error: 'Missing x-account-id' });

        try {
            const data = provider.getStatus(id);
            res.json({ ok: true, data });
        } catch (e) {
            res.json({ ok: false, error: e.message });
        }
    });

    app.post('/api/automation', accountOwnershipRequired, async (req, res) => {
        const id = getAccId(req);
        try {
            let lastData = null;
            for (const [k, v] of Object.entries(req.body)) {
                lastData = await provider.setAutomation(id, k, v);
            }
            res.json({ ok: true, data: lastData || {} });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 农田详情
    app.get('/api/lands', accountOwnershipRequired, async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getLands(id);
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 好友列表
    app.get('/api/friends', accountOwnershipRequired, async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getFriends(id);
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 好友农田详情
    app.get('/api/friend/:gid/lands', accountOwnershipRequired, async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getFriendLands(id, req.params.gid);
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 对指定好友执行单次操作（偷菜/浇水/除草/捣乱）
    app.post('/api/friend/:gid/op', accountOwnershipRequired, async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        try {
            const opType = String((req.body || {}).opType || '');
            const data = await provider.doFriendOp(id, req.params.gid, opType);
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 种子列表
    app.get('/api/seeds', accountOwnershipRequired, async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getSeeds(id);
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 植物列表（用于偷菜过滤）
    app.get('/api/plants', authRequired, async (req, res) => {
        try {
            const { getAllPlants, getSeedImageBySeedId, getSeedPrice } = require('./gameConfig');
            const plants = getAllPlants();
            const data = plants.map(p => ({
                id: p.id,
                name: p.name,
                image: getSeedImageBySeedId(p.seed_id),
                seedId: p.seed_id,
                level: Number(p.land_level_need) || 0,
                price: getSeedPrice(p.seed_id),
            })).sort((a, b) => {
                const aLevel = Number(a.level) || 0;
                const bLevel = Number(b.level) || 0;

                // 未知等级（0）放到最后，其他按等级升序
                if (aLevel <= 0 && bLevel > 0) return 1;
                if (bLevel <= 0 && aLevel > 0) return -1;
                if (aLevel !== bLevel) return aLevel - bLevel;

                // 同等级时按价格、名称、ID稳定排序
                const aPrice = Number(a.price) || 0;
                const bPrice = Number(b.price) || 0;
                if (aPrice !== bPrice) return aPrice - bPrice;

                const nameCompare = String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN');
                if (nameCompare !== 0) return nameCompare;

                return Number(a.id) - Number(b.id);
            });
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 背包物品
    app.get('/api/bag', accountOwnershipRequired, async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getBag(id);
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 每日礼包状态总览
    app.get('/api/daily-gifts', accountOwnershipRequired, async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await provider.getDailyGifts(id);
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 启动账号
    app.post('/api/accounts/:id/start', (req, res) => {
        try {
            const accountId = req.params.id;
            // 检查账号所有权（管理员和普通用户一样，只能操作自己的账号）
            const allAccounts = store.getAccounts();
            const account = allAccounts.accounts.find(a => a.id === accountId);
            if (!account || account.username !== req.currentUser.username) {
                return res.status(403).json({ ok: false, error: '无权操作此账号' });
            }

            provider.startAccount(accountId);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 停止账号
    app.post('/api/accounts/:id/stop', (req, res) => {
        try {
            const accountId = req.params.id;
            // 检查账号所有权（管理员和普通用户一样，只能操作自己的账号）
            const allAccounts = store.getAccounts();
            const account = allAccounts.accounts.find(a => a.id === accountId);
            if (!account || account.username !== req.currentUser.username) {
                return res.status(403).json({ ok: false, error: '无权操作此账号' });
            }

            provider.stopAccount(accountId);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 农场一键操作
    app.post('/api/farm/operate', accountOwnershipRequired, async (req, res) => {
        const id = getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const { opType } = req.body; // 'harvest', 'clear', 'plant', 'all'
            await provider.doFarmOp(id, opType);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 数据分析（需要登录，但不需要账号所有权验证，因为这是全局游戏配置数据）
    app.get('/api/analytics', authRequired, async (req, res) => {
        try {
            const sortBy = req.query.sort || 'exp';
            const { getPlantRankings } = require('./analytics');
            const data = getPlantRankings(sortBy);
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 设置页统一保存（单次写入+单次广播）
    app.post('/api/settings/save', accountOwnershipRequired, async (req, res) => {
        const id = getAccId(req);
        const username = req.currentUser ? req.currentUser.username : null;
        try {
            const body = req.body || {};
            
            // 如果有偷菜过滤配置，先保存
            if (body.stealFilter && store.setStealFilterConfig) {
                store.setStealFilterConfig(body.stealFilter, id);
            }
            
            // 如果有偷菜好友过滤配置，先保存
            if (body.stealFriendFilter && store.setStealFriendFilterConfig) {
                store.setStealFriendFilterConfig(body.stealFriendFilter, id);
            }
            
            // 删除 stealFilter 和 stealFriendFilter 字段，避免传递给 provider.saveSettings
            const settingsBody = { ...body };
            delete settingsBody.stealFilter;
            delete settingsBody.stealFriendFilter;
            
            const data = await provider.saveSettings(id, settingsBody, username);
            res.json({ ok: true, data: data || {} });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 设置面板主题
    app.post('/api/settings/theme', async (req, res) => {
        try {
            const theme = String((req.body || {}).theme || '');
            const data = await provider.setUITheme(theme);
            res.json({ ok: true, data: data || {} });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 保存下线提醒配置（用户级别，必须）
    app.post('/api/settings/offline-reminder', authRequired, async (req, res) => {
        try {
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            // 获取当前用户名，保存为用户级别配置（必须）
            const username = req.currentUser ? req.currentUser.username : '';
            if (!username) {
                return res.status(400).json({ ok: false, error: '无法获取当前用户信息' });
            }
            const data = store.setOfflineReminder ? store.setOfflineReminder(body, username) : {};
            res.json({ ok: true, data: data || {} });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 获取配置
    app.get('/api/settings', authRequired, async (req, res) => {
        try {
            const id = getAccId(req);
            const username = req.currentUser ? req.currentUser.username : null;
            if (!username) {
                return res.status(400).json({ ok: false, error: '无法获取当前用户信息' });
            }
            
            // 直接从主进程的 store 读取，确保即使账号未运行也能获取配置
            // 传递 username 参数，确保获取用户级别的配置
            const intervals = store.getIntervals(id);
            const strategy = store.getPlantingStrategy(id);
            const preferredSeed = store.getPreferredSeed(id);
            const friendQuietHours = store.getFriendQuietHours(id);
            const automation = store.getAutomation(id);
            const ui = store.getUI();
            // 获取当前用户级别的下线提醒配置（必须用户隔离）
            const offlineReminder = store.getOfflineReminder
                ? store.getOfflineReminder(username)
                : { channel: 'webhook', reloginUrlMode: 'none', endpoint: '', token: '', title: '账号下线提醒', msg: '账号下线', offlineDeleteSec: 120 };
            // 获取偷菜过滤配置
            const stealFilter = store.getStealFilterConfig ? store.getStealFilterConfig(id) : { enabled: false, mode: 'blacklist', plantIds: [] };
            // 获取偷菜好友过滤配置
            const stealFriendFilter = store.getStealFriendFilterConfig ? store.getStealFriendFilterConfig(id) : { enabled: false, mode: 'blacklist', friendIds: [] };
            
            // 构建完整的配置数据，确保所有字段都有值
            const configData = {
                intervals,
                strategy,
                preferredSeed,
                friendQuietHours,
                automation,
                ui,
                offlineReminder,
                stealFilter,
                stealFriendFilter,
                username
            };
            
            res.json({ ok: true, data: configData });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 账号管理
    app.get('/api/accounts', (req, res) => {
        try {
            // 1. 获取所有账号的完整列表（包含 running 状态，由 provider 注入）
            // 注意：provider.getAccounts() 返回所有账号，不仅是当前用户的
            const allAccountsData = provider.getAccounts();
            
            // 2. 筛选出属于当前用户的账号
            const userAccounts = allAccountsData.accounts.filter(a => a.username === req.currentUser.username);
            
            // 3. 构造返回数据
            res.json({ 
                ok: true, 
                data: {
                    accounts: userAccounts,
                    nextId: allAccountsData.nextId
                }
            });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/accounts', (req, res) => {
        try {
            // 检查当前用户是否已认证
            if (!req.currentUser) {
                return res.status(401).json({ ok: false, error: '未登录' });
            }
            
            const accountData = { ...req.body };
            // 强制将账号关联到当前用户名（管理员也一样）
            accountData.username = req.currentUser.username;
            
            // 如果是更新操作，检查目标账号所有权
            if (req.body.id) {
                const existing = store.getAccountsByUser(req.currentUser.username).accounts.find(a => String(a.id) === String(req.body.id));
                if (!existing) {
                    return res.status(403).json({ ok: false, error: '无权操作此账号' });
                }
            }
            
            const isUpdate = !!req.body.id;
            let wasRunning = false;
            if (isUpdate && provider.isAccountRunning) {
                wasRunning = provider.isAccountRunning(req.body.id);
            }

            const data = addOrUpdateAccount(accountData);
            if (provider.addAccountLog) {
                const accountId = isUpdate ? String(req.body.id) : String((data.accounts[data.accounts.length - 1] || {}).id || '');
                const accountName = req.body.name || '';
                provider.addAccountLog(
                    isUpdate ? 'update' : 'add',
                    isUpdate ? `更新账号: ${accountName || accountId}` : `添加账号: ${accountName || accountId}`,
                    accountId,
                    accountName,
                    { username: req.currentUser.username } // 记录操作用户
                );
            }
            // 如果是新增，自动启动
            if (!isUpdate) {
                const newAcc = data.accounts[data.accounts.length - 1];
                if (newAcc) provider.startAccount(newAcc.id);
            } else if (wasRunning) {
                // 如果是更新，且之前在运行，则重启
                provider.restartAccount(req.body.id);
            }
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.delete('/api/accounts/:id', (req, res) => {
        try {
            const accountId = req.params.id;
            const before = provider.getAccounts();
            const target = (before.accounts || []).find(a => String(a.id) === String(accountId));
            
            // 检查账号所有权（管理员和普通用户一样，只能删除自己的账号）
            if (!target || target.username !== req.currentUser.username) {
                return res.status(403).json({ ok: false, error: '无权删除此账号' });
            }
            
            provider.stopAccount(accountId);
            const data = deleteAccount(accountId);
            if (provider.addAccountLog) {
                provider.addAccountLog('delete', `删除账号: ${(target && target.name) || accountId}`, accountId, target ? target.name : '', { username: req.currentUser.username });
            }
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 账号日志
    app.get('/api/account-logs', (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 100;
            const accountId = req.query.accountId || '';
            
            // 为了保证日志完全一致，改为从 GLOBAL_LOGS 读取
            // 注意：前端可能依赖 action 字段，但 GLOBAL_LOGS 里的条目通常没有 action（只有 meta.action）
            // 我们直接返回 GLOBAL_LOGS 的内容，让用户看到全量日志
            // 但为了兼容部分可能的逻辑，如果原先的 ACCOUNT_LOGS 有特定用途，这里可能需要权衡
            // 用户要求"完全一样，取并集"，所以这里我们改用 getLogs
            let list = provider.getLogs(accountId === 'all' ? '' : accountId, { limit });

            // 获取当前用户的账号ID列表，用于辅助判断
            const userAccounts = store.getAccountsByUser(req.currentUser.username);
            const userAccountIds = (userAccounts.accounts || []).map(a => String(a.id));

            // 按操作用户过滤
            list = list.filter(log => {
                // 1. 如果日志有username字段，必须匹配当前用户
                if (log.username || (log.meta && log.meta.username)) {
                    return (log.username || log.meta.username) === req.currentUser.username;
                }
                
                // 2. 如果日志没有username字段（如系统自动生成），但accountId属于当前用户，则允许查看
                if (log.accountId && userAccountIds.includes(String(log.accountId))) {
                    return true;
                }

                return false;
            });
            
            res.json({ ok: true, data: list });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // API: 日志
    app.get('/api/logs', (req, res) => {
        const queryAccountIdRaw = (req.query.accountId || '').toString().trim();
        const id = queryAccountIdRaw ? (queryAccountIdRaw === 'all' ? '' : queryAccountIdRaw) : getAccId(req);
        const options = {
            limit: parseInt(req.query.limit) || 100,
            tag: req.query.tag || '',
            module: req.query.module || '',
            event: req.query.event || '',
            keyword: req.query.keyword || '',
            isWarn: req.query.isWarn,
            timeFrom: req.query.timeFrom || '',
            timeTo: req.query.timeTo || '',
        };
        
        let list = provider.getLogs(id, options);
        
        // 统一按用户隔离：所有用户（包括管理员）只显示自己账号的日志
        if (req.currentUser) {
            // 只看自己的账号
            const userAccounts = store.getAccountsByUser(req.currentUser.username);
            
            // 获取当前用户的账号ID列表
            const userAccountIds = (userAccounts.accounts || []).map(a => String(a.id));
            
            // 过滤日志：严格只保留用户账号的日志
            list = list.filter(log => {
                const logAccountId = String(log.accountId || '');
                // 只有明确属于用户的账号日志才显示。系统日志（无accountId）不显示给任何用户。
                return logAccountId && userAccountIds.includes(logAccountId);
            });
        }
        
        res.json({ ok: true, data: list });
    });

    // ============ QR Code Login APIs (无需账号选择) ============
    // 这些接口不需要 authRequired 也能调用（用于登录流程）
    app.post('/api/qr/create', async (req, res) => {
        try {
            const result = await MiniProgramLoginSession.requestLoginCode();
            res.json({ ok: true, data: result });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/qr/check', async (req, res) => {
        const { code } = req.body || {};
        if (!code) {
            return res.status(400).json({ ok: false, error: 'Missing code' });
        }

        try {
            const result = await MiniProgramLoginSession.queryStatus(code);

            if (result.status === 'OK') {
                const ticket = result.ticket;
                const uin = result.uin || '';
                const appid = '1112386029'; // Farm appid

                const authCode = await MiniProgramLoginSession.getAuthCode(ticket, appid);

                let avatar = '';
                if (uin) {
                    avatar = `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=640`;
                }

                res.json({ ok: true, data: { status: 'OK', code: authCode, uin, avatar } });
            } else if (result.status === 'Used') {
                res.json({ ok: true, data: { status: 'Used' } });
            } else if (result.status === 'Wait') {
                res.json({ ok: true, data: { status: 'Wait' } });
            } else {
                res.json({ ok: true, data: { status: 'Error', error: result.msg } });
            }
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // ============ 用户管理 API (仅管理员) ============
    app.get('/api/admin/users', adminRequired, (req, res) => {
        try {
            const users = userStore.getAllUsersWithPassword();
            res.json({ ok: true, data: users });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/admin/users/batch-delete', adminRequired, (req, res) => {
        try {
            const { usernames } = req.body || {};
            if (!Array.isArray(usernames) || usernames.length === 0) {
                return res.status(400).json({ ok: false, error: '请选择要删除的用户' });
            }
            let deleted = 0;
            let failed = 0;
            let deletedAccounts = 0;
            usernames.forEach(username => {
                const result = userStore.deleteUser(username);
                if (result.ok) {
                    deleted++;
                    const accountResult = store.deleteAccountsByUser(username);
                    deletedAccounts += accountResult.deletedCount || 0;
                    store.deleteUserConfig(username);
                } else {
                    failed++;
                }
            });
            res.json({ ok: true, data: { deleted, failed, deletedAccounts } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.put('/api/admin/users/:username', adminRequired, (req, res) => {
        try {
            const { username } = req.params;
            const updates = req.body || {};
            const user = userStore.updateUser(username, updates);
            if (!user) {
                return res.status(404).json({ ok: false, error: '用户不存在' });
            }
            res.json({ ok: true, data: user });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.delete('/api/admin/users/:username', adminRequired, (req, res) => {
        let userDeleted = false;
        const { username } = req.params;
        try {
            // 删除用户记录
            const result = userStore.deleteUser(username);
            if (!result.ok) {
                return res.status(400).json(result);
            }
            userDeleted = true;
            
            // 删除该用户的所有账号
            const accountResult = store.deleteAccountsByUser(username);
            
            // 停止该用户所有账号的运行进程
            if (accountResult.deletedIds && accountResult.deletedIds.length > 0) {
                accountResult.deletedIds.forEach(accountId => {
                    try {
                        provider.stopAccount(accountId);
                    } catch (e) {
                        console.error(`停止账号 ${accountId} 失败:`, e.message);
                    }
                });
            }
            
            // 删除该用户的配置
            store.deleteUserConfig(username);
            
            // 添加日志
            if (provider.addAccountLog) {
                provider.addAccountLog(
                    'delete_user',
                    `删除用户: ${username} (同时删除了 ${accountResult.deletedCount} 个账号)`,
                    '',
                    '',
                    { username: req.currentUser.username }
                );
            }
            
            res.json({ 
                ok: true, 
                data: { 
                    username, 
                    deletedAccounts: accountResult.deletedCount 
                } 
            });
        } catch (e) {
            console.error(`删除用户 ${username} 异常:`, e);
            if (userDeleted) {
                // 如果用户已删除，即使后续清理出错，也应返回成功，避免前端提示失败但实际已删除的困惑
                return res.json({ 
                    ok: true, 
                    data: { 
                        username, 
                        warning: '用户已删除，但关联数据清理可能不完整' 
                    } 
                });
            }
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // ============ 卡密管理 API (仅管理员) ============
    app.get('/api/admin/cards', adminRequired, (req, res) => {
        try {
            const cards = userStore.getAllCards();
            res.json({ ok: true, data: cards });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/admin/cards', adminRequired, (req, res) => {
        try {
            const { description, type, days, count } = req.body || {};
            if (!description || !type || !days) {
                return res.status(400).json({ ok: false, error: '请填写完整信息' });
            }
            const batchCount = Math.min(parseInt(count, 10) || 1, 100);
            const cards = [];
            for (let i = 0; i < batchCount; i++) {
                const card = userStore.createCard(description, type, days);
                cards.push(card);
            }
            res.json({ ok: true, data: batchCount === 1 ? cards[0] : cards });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/admin/cards/batch-delete', adminRequired, (req, res) => {
        try {
            const { codes } = req.body || {};
            if (!Array.isArray(codes) || codes.length === 0) {
                return res.status(400).json({ ok: false, error: '请选择要删除的卡密' });
            }
            let deleted = 0;
            let failed = 0;
            codes.forEach(code => {
                const success = userStore.deleteCard(code);
                if (success) deleted++;
                else failed++;
            });
            res.json({ ok: true, data: { deleted, failed } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.put('/api/admin/cards/:code', adminRequired, (req, res) => {
        try {
            const { code } = req.params;
            const updates = req.body || {};
            const card = userStore.updateCard(code, updates);
            if (!card) {
                return res.status(404).json({ ok: false, error: '卡密不存在' });
            }
            res.json({ ok: true, data: card });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.delete('/api/admin/cards/:code', adminRequired, (req, res) => {
        try {
            const { code } = req.params;
            const success = userStore.deleteCard(code);
            if (!success) {
                return res.status(404).json({ ok: false, error: '卡密不存在' });
            }
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.get('/', (req, res) => {
        res.sendFile(path.join(panelDir, 'index.html'));
    });

    const port = CONFIG.adminPort || 3000;
    server = app.listen(port, '0.0.0.0', () => {
        console.log(`[管理面板] http://localhost:${port}`);
    });
}

function stopAdminServer() {
    if (server) {
        server.close();
        server = null;
        app = null;
    }
}

module.exports = {
    startAdminServer,
    stopAdminServer,
};
