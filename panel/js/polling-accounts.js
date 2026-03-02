const CURRENT_ACCOUNT_STORAGE_KEY = 'currentAccountId';
const wsErrorNotifiedAt = {};

async function loadAccounts() {
    return runDedupedRequest('loadAccounts', async () => {
        const list = await api('/api/accounts');
        console.log('[loadAccounts] API返回:', list);
        if (list && list.accounts) {
            const prevCurrentId = String(currentAccountId || '');
            accounts = list.accounts;
            console.log('[loadAccounts] 更新账号列表:', accounts.length, '个账号');
            renderAccountSelector();
            renderAccountManager();
            renderLogFilterOptions();

            // 当前账号被删除或不存在时，自动回退
            const hasCurrent = currentAccountId && accounts.some(a => a.id === currentAccountId);
            if (!hasCurrent) currentAccountId = null;

            // 如果当前没有选中账号，尝试恢复上次选择；仍无则默认第一个
            if (!currentAccountId && accounts.length > 0) {
                const savedId = String(localStorage.getItem(CURRENT_ACCOUNT_STORAGE_KEY) || '');
                const matched = savedId ? accounts.find(a => String(a.id) === savedId) : null;
                switchAccount((matched && matched.id) || accounts[0].id);
            } else if (accounts.length === 0) {
                $('current-account-name').textContent = '无账号';
                updateTopbarAccount({ name: '无账号' });
                resetDashboardStats();
                clearFarmView('暂无账号，请先添加账号');
                clearFriendsView('暂无账号，请先添加账号');
                localStorage.removeItem(CURRENT_ACCOUNT_STORAGE_KEY);
            } else {
                updateTopbarAccount(accounts.find(a => a.id === currentAccountId) || null);
                if (!hasCurrent && prevCurrentId) {
                    // 当前账号被删除后，农场/好友页数据立即切换到新账号
                    if ($('page-personal').classList.contains('active')) {
                        loadDailyGifts();
                        loadBag();
                        loadFarm();
                    }
                    if ($('page-friends').classList.contains('active')) loadFriends();
                }
            }
        } else {
            console.log('[loadAccounts] 返回数据无效:', list);
            // 如果返回 null，可能是 401 未授权，需要重新登录
            if (list === null) {
                console.log('[loadAccounts] 未授权，需要重新登录');
            }
        }
    });
}

function renderAccountSelector() {
    const dropdown = $('account-dropdown');
    dropdown.innerHTML = accounts.map(acc => `
        <div class="account-option ${acc.id === currentAccountId ? 'active' : ''}" data-id="${acc.id}">
            <i class="fas fa-user-circle"></i>
            <span>${acc.name}</span>
            ${acc.running ? '<span class="dot online"></span>' : '<span class="dot offline"></span>'}
        </div>
    `).join('');

    dropdown.querySelectorAll('.account-option').forEach(el => {
        el.addEventListener('click', () => {
            switchAccount(el.dataset.id);
            dropdown.classList.remove('show');
        });
    });
}

function switchAccount(id) {
    currentAccountId = id;
    localStorage.setItem(CURRENT_ACCOUNT_STORAGE_KEY, String(id || ''));
    expHistory = [];
    lastOperationsData = {};
    renderAccountSelector();
    const acc = accounts.find(a => a.id === id);
    if (acc) {
        $('current-account-name').textContent = acc.name;
        updateTopbarAccount(acc);
    }
    const seedSel = $('seed-select');
    if (seedSel) {
        seedSel.dataset.loaded = '0';
        seedSel.innerHTML = '<option value="0">自动选择 (按策略)</option>';
    }
    renderOpsList({});
    // 刷新所有数据
    pollStatus({ syncNextChecks: true });
    pollFertilizerBuckets(true);
    pollLogs();
    Promise.resolve(loadSettings()).catch(() => null);
    if ($('page-personal').classList.contains('active')) {
        loadDailyGifts();
        loadBag();
        loadFarm();
    }
    if ($('page-friends').classList.contains('active')) loadFriends();
}

$('current-account-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('account-dropdown').classList.toggle('show');
});

document.addEventListener('click', () => $('account-dropdown').classList.remove('show'));

// ============ 核心轮询 ============
// 限制经验效率更新频率 (每10秒)
let lastRateUpdate = 0;
let lastFertilizerPollAt = 0;
let localNextFarmRemainSec = NaN;
let localNextFriendRemainSec = NaN;
let nextCheckSyncRequested = false;
let nextCheckSyncPending = false;
const LOG_VIRTUAL_ROW_HEIGHT = 28;
const LOG_VIRTUAL_OVERSCAN = 10;
let logVirtualItems = [];
let logVirtualScrollRaf = null;
let logVirtualBoundWrap = null;

function resetLocalNextChecks() {
    localNextFarmRemainSec = NaN;
    localNextFriendRemainSec = NaN;
    nextCheckSyncRequested = false;
    const farmEl = $('next-farm-check');
    const friendEl = $('next-friend-check');
    if (farmEl) farmEl.textContent = '--';
    if (friendEl) friendEl.textContent = '--';
}

function renderLocalNextChecks() {
    const farmEl = $('next-farm-check');
    const friendEl = $('next-friend-check');
    if (farmEl) {
        farmEl.textContent = Number.isFinite(localNextFarmRemainSec)
            ? fmtTime(Math.max(0, localNextFarmRemainSec))
            : '--';
    }
    if (friendEl) {
        friendEl.textContent = Number.isFinite(localNextFriendRemainSec)
            ? fmtTime(Math.max(0, localNextFriendRemainSec))
            : '--';
    }
}

setInterval(() => {
    let reachedZero = false;
    if (Number.isFinite(localNextFarmRemainSec) && localNextFarmRemainSec > 0) {
        localNextFarmRemainSec = Math.max(0, localNextFarmRemainSec - 1);
        if (localNextFarmRemainSec === 0) reachedZero = true;
    }
    if (Number.isFinite(localNextFriendRemainSec) && localNextFriendRemainSec > 0) {
        localNextFriendRemainSec = Math.max(0, localNextFriendRemainSec - 1);
        if (localNextFriendRemainSec === 0) reachedZero = true;
    }
    renderLocalNextChecks();

    if (reachedZero && !nextCheckSyncRequested && isLoggedIn && currentAccountId) {
        nextCheckSyncRequested = true;
        pollStatus({ syncNextChecks: true })
            .catch(() => null)
            .finally(() => { nextCheckSyncRequested = false; });
    }
}, 1000);

function ensureVirtualLogBinding(wrap) {
    if (!wrap || logVirtualBoundWrap === wrap) return;
    logVirtualBoundWrap = wrap;
    wrap.addEventListener('scroll', () => {
        if (logVirtualScrollRaf) return;
        logVirtualScrollRaf = requestAnimationFrame(() => {
            logVirtualScrollRaf = null;
            renderVirtualLogsWindow(wrap);
        });
    }, { passive: true });
}

// 模块图标映射
const MODULE_ICONS = {
    farm: 'fa-seedling',
    friend: 'fa-user-friends',
    warehouse: 'fa-box',
    task: 'fa-tasks',
    system: 'fa-cog',
};

// 模块颜色映射
const MODULE_COLORS = {
    farm: '#22c55e',
    friend: '#3b82f6',
    warehouse: '#f59e0b',
    task: '#8b5cf6',
    system: '#6b7280',
};

// 事件类型颜色映射
const EVENT_COLORS = {
    harvest_crop: '#10b981',
    plant_seed: '#22c55e',
    fertilize: '#f59e0b',
    seed_buy: '#3b82f6',
    sell_success: '#eab308',
    friend_cycle: '#3b82f6',
    visit_friend: '#60a5fa',
    steal_crop: '#ef4444',
    task_claim: '#8b5cf6',
    upgrade_land: '#f97316',
    api_error: '#dc2626',
};

// 获取日志级别样式
function getLogLevelClass(entry) {
    if (entry.isWarn) return 'log-warn';
    const event = (entry.meta && entry.meta.event) || '';
    if (event === 'api_error') return 'log-error';
    if (event === 'harvest_crop' || event === 'sell_success') return 'log-success';
    if (event === 'friend_cycle' || event === 'visit_friend') return 'log-info';
    return '';
}

// 获取事件图标
function getEventIcon(eventKey) {
    const iconMap = {
        farm_cycle: 'fa-sync',
        harvest_crop: 'fa-hand-holding-droplet',
        plant_seed: 'fa-seedling',
        fertilize: 'fa-flask',
        seed_buy: 'fa-shopping-cart',
        sell_success: 'fa-coins',
        friend_cycle: 'fa-user-friends',
        visit_friend: 'fa-walking',
        steal_crop: 'fa-hand-sparkles',
        task_claim: 'fa-check-circle',
        upgrade_land: 'fa-arrow-up',
        unlock_land: 'fa-lock-open',
        api_error: 'fa-exclamation-triangle',
    };
    return iconMap[eventKey] || 'fa-circle';
}

function buildLogRowHtml(l) {
    const name = l.accountName ? `<span class="log-account">${escapeHtml(l.accountName)}</span>` : '';
    const timeStr = ((l.time || '').split(' ')[1] || (l.time || ''));
    const moduleMap = {
        farm: '农场',
        friend: '好友',
        warehouse: '仓库',
        task: '任务',
        system: '系统',
    };
    const moduleKey = (l.meta && l.meta.module) ? String(l.meta.module) : '';
    const moduleLabel = moduleMap[moduleKey] || '系统';
    const eventKey = (l.meta && l.meta.event) ? String(l.meta.event) : '';
    const eventLabel = LOG_EVENT_LABELS[eventKey] || '';
    
    // 获取样式类
    const levelClass = getLogLevelClass(l);
    const moduleIcon = MODULE_ICONS[moduleKey] || 'fa-circle';
    const moduleColor = MODULE_COLORS[moduleKey] || '#6b7280';
    const eventIcon = getEventIcon(eventKey);
    const eventColor = EVENT_COLORS[eventKey] || '';
    
    // 构建事件标签
    let eventTag = '';
    if (eventLabel) {
        eventTag = `<span class="log-event-tag" style="${eventColor ? `--event-color: ${eventColor}` : ''}">
            <i class="fas ${eventIcon}"></i>${escapeHtml(eventLabel)}
        </span>`;
    }
    
    return `<div class="log-row ${levelClass}">
        <span class="log-time">${escapeHtml(timeStr)}</span>
        <span class="log-module" style="--module-color: ${moduleColor}">
            <i class="fas ${moduleIcon}"></i>${escapeHtml(moduleLabel)}
        </span>
        ${eventTag}
        ${name}
        <span class="log-msg">${escapeHtml(l.msg || '')}</span>
    </div>`;
}

function renderVirtualLogsWindow(wrap) {
    if (!wrap) return;
    ensureVirtualLogBinding(wrap);
    if (!logVirtualItems.length) {
        wrap.innerHTML = '<div class="log-row">暂无日志</div>';
        return;
    }

    const total = logVirtualItems.length;
    const viewportH = Math.max(1, wrap.clientHeight || 320);
    const visibleCount = Math.max(1, Math.ceil(viewportH / LOG_VIRTUAL_ROW_HEIGHT) + LOG_VIRTUAL_OVERSCAN * 2);
    const start = Math.max(0, Math.floor(wrap.scrollTop / LOG_VIRTUAL_ROW_HEIGHT) - LOG_VIRTUAL_OVERSCAN);
    const end = Math.min(total, start + visibleCount);
    const topPad = start * LOG_VIRTUAL_ROW_HEIGHT;
    const bottomPad = Math.max(0, (total - end) * LOG_VIRTUAL_ROW_HEIGHT);
    const rows = logVirtualItems.slice(start, end).map(buildLogRowHtml).join('');
    wrap.innerHTML = `<div style="height:${topPad}px"></div>${rows}<div style="height:${bottomPad}px"></div>`;
}

function formatBucketHoursText(item) {
    if (!item) return '0.0h';
    const raw = String(item.hoursText || '').trim();
    if (raw) return raw.replace('小时', 'h');
    const count = Number(item.count || 0);
    const hoursFloor1 = Math.floor((count / 3600) * 10) / 10;
    return `${hoursFloor1.toFixed(1)}h`;
}

async function pollFertilizerBuckets(force = false) {
    if (!currentAccountId) return;
    const now = Date.now();
    if (!force && now - lastFertilizerPollAt < 15000) return;
    lastFertilizerPollAt = now;
    const key = `pollFertilizerBuckets:${currentAccountId}`;
    return runDedupedRequest(key, async () => {
        const data = await api('/api/bag');
        const items = (data && Array.isArray(data.items)) ? data.items : [];
        const normal = items.find(it => Number(it.id || 0) === 1011);
        const organic = items.find(it => Number(it.id || 0) === 1012);
        const collectNormal = items.find(it => Number(it.id || 0) === 3001);
        const collectRare = items.find(it => Number(it.id || 0) === 3002);
        updateValueWithAnim('fert-normal-hours', formatBucketHoursText(normal));
        updateValueWithAnim('fert-organic-hours', formatBucketHoursText(organic));
        updateValueWithAnim('collect-normal', String(Number((collectNormal && collectNormal.count) || 0)));
        updateValueWithAnim('collect-rare', String(Number((collectRare && collectRare.count) || 0)));
    });
}

async function pollStatus(options = {}) {
    if (options && options.syncNextChecks) {
        nextCheckSyncPending = true;
    }
    if (!currentAccountId) {
        $('conn-text').textContent = '请添加账号';
        $('conn-dot').className = 'dot offline';
        resetDashboardStats();
        resetLocalNextChecks();
        nextCheckSyncPending = false;
        return;
    }
    const key = `pollStatus:${currentAccountId}`;
    return runDedupedRequest(key, async () => {
        const data = await api('/api/status');

        if (!data) {
            $('conn-text').textContent = '未连接';
            $('conn-dot').className = 'dot offline';
            lastServerUptime = 0;
            lastSyncTimestamp = 0;
            renderOpsList({});
            resetLocalNextChecks();
            nextCheckSyncPending = false;
            if (currentAccountId) {
                loadAccounts();
            }
            return;
        }

        const isConnected = data.connection?.connected;
        const statusRevision = Number(data.configRevision || 0);
        if (statusRevision > latestConfigRevision) latestConfigRevision = statusRevision;
        if (expectedConfigRevision > 0 && statusRevision >= expectedConfigRevision) {
            pendingAutomationKeys.clear();
        }
        $('conn-text').textContent = isConnected ? '运行中' : '未连接';
        $('conn-dot').className = 'dot ' + (isConnected ? 'online' : 'offline');

        const wsError = data.wsError || null;
        if (wsError && Number(wsError.code) === 400 && currentAccountId) {
            const errAt = Number(wsError.at) || 0;
            const lastNotified = Number(wsErrorNotifiedAt[currentAccountId] || 0);
            if (errAt && errAt > lastNotified) {
                wsErrorNotifiedAt[currentAccountId] = errAt;
                if (typeof editAccount === 'function') {
                    editAccount(currentAccountId);
                }
            }
        }

        // Stats
        $('level').textContent = data.status?.level ? 'Lv' + data.status.level : '-';

        updateValueWithAnim('gold', String(data.status?.gold ?? '-'), 'value-changed-gold');
        updateValueWithAnim('coupon', String(data.status?.coupon ?? 0));
        pollFertilizerBuckets();

        if (data.uptime !== undefined) {
            lastServerUptime = data.uptime;
            lastSyncTimestamp = Date.now();
            updateUptimeDisplay();
        }

        if (nextCheckSyncPending) {
            const farmRemain = toSafeNumber(data.nextChecks?.farmRemainSec, NaN);
            const friendRemain = toSafeNumber(data.nextChecks?.friendRemainSec, NaN);
            localNextFarmRemainSec = Number.isFinite(farmRemain) ? Math.max(0, Math.floor(farmRemain)) : NaN;
            localNextFriendRemainSec = Number.isFinite(friendRemain) ? Math.max(0, Math.floor(friendRemain)) : NaN;
            renderLocalNextChecks();
            nextCheckSyncPending = false;
        }

        // Exp
        const ep = data.expProgress;
        if (ep && ep.needed > 0) {
            const pct = Math.min(100, (ep.current / ep.needed) * 100);
            $('exp-fill').style.width = pct + '%';
            $('exp-num').textContent = ep.current + '/' + ep.needed;
        }

        // Session Gains & History
        const expGain = toSafeNumber(data.sessionExpGained, 0);
        const goldGain = toSafeNumber(data.sessionGoldGained, 0);
        const couponGain = toSafeNumber(data.sessionCouponGained, 0);

        // stat-exp 显示会话总增量
        updateValueWithAnim('stat-exp', (expGain >= 0 ? '+' : '') + Math.floor(expGain));
        updateValueWithAnim('stat-gold', (goldGain >= 0 ? '+' : '') + Math.floor(goldGain), 'value-changed-gold');
        const goldGainEl = $('stat-gold');
        if (goldGainEl) {
            goldGainEl.classList.toggle('negative', goldGain < 0);
        }
        updateValueWithAnim('stat-coupon', (couponGain >= 0 ? '+' : '') + Math.floor(couponGain));
        const couponGainEl = $('stat-coupon');
        if (couponGainEl) {
            couponGainEl.classList.toggle('negative', couponGain < 0);
        }

        // 记录历史数据用于图表 (每分钟记录一次)
        const now = new Date();
        const timeLabel = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (expHistory.length === 0 || expHistory[expHistory.length - 1].time !== timeLabel) {
            expHistory.push({ time: timeLabel, exp: expGain, ts: now.getTime() });
            if (expHistory.length > 60) expHistory.shift();
        }

        // 效率计算 (每10秒更新一次)
        if (Date.now() - lastRateUpdate > 10000) {
            lastRateUpdate = Date.now();
            if (data.uptime > 0) { // 只要运行时间大于0就显示
                const hours = data.uptime / 3600;
                const finalRatePerHour = hours > 0 ? (expGain / hours) : 0;
                const rateDisplay = Math.floor(finalRatePerHour) + '/时';
                $('exp-rate').textContent = rateDisplay;

                // 预计升级
                if (data.expProgress && data.expProgress.needed > 0 && finalRatePerHour > 0) {
                    // 计算还需要多少经验
                    const expNeeded = data.expProgress.needed - data.expProgress.current;
                    if (expNeeded > 0) {
                        const minsToLevel = expNeeded / (finalRatePerHour / 60);
                        if (minsToLevel < 60) {
                            $('time-to-level').textContent = `约 ${Math.ceil(minsToLevel)} 分钟升级`;
                        } else {
                            $('time-to-level').textContent = `约 ${(minsToLevel / 60).toFixed(1)} 小时升级`;
                        }
                    } else {
                        $('time-to-level').textContent = '即将升级';
                    }
                } else if (finalRatePerHour <= 0) {
                    $('time-to-level').textContent = '等待收益...';
                }
            } else {
                $('exp-rate').textContent = '等待数据...';
                $('time-to-level').textContent = '';
            }
        }

        // Automation Switches
        const auto = data.automation || {};
        if (!pendingAutomationKeys.has('farm')) $('auto-farm').checked = !!auto.farm;
        if (!pendingAutomationKeys.has('farm_push')) $('auto-farm-push').checked = !!auto.farm_push;
        if (!pendingAutomationKeys.has('land_upgrade')) $('auto-land-upgrade').checked = !!auto.land_upgrade;
        if (!pendingAutomationKeys.has('friend_help_exp_limit')) $('auto-friend').checked = !!auto.friend_help_exp_limit;
        if (!pendingAutomationKeys.has('task')) $('auto-task').checked = !!auto.task;
        if (!pendingAutomationKeys.has('sell')) $('auto-sell').checked = !!auto.sell;

        // 只有当用户没有正在操作时才更新下拉框，避免打断用户
        if (!pendingAutomationKeys.has('fertilizer') && document.activeElement !== $('fertilizer-select') && auto.fertilizer) {
            $('fertilizer-select').value = auto.fertilizer;
        }

        // 好友细分开关
        if (!pendingAutomationKeys.has('friend_steal')) $('auto-friend-steal').checked = !!auto.friend_steal;
        if (!pendingAutomationKeys.has('friend_steal_skip_white_radish')) {
            const el = $('auto-friend-steal-skip-white-radish');
            if (el) {
                el.checked = !!auto.friend_steal_skip_white_radish;
            } else {
                console.warn('⚠️ 找不到元素 #auto-friend-steal-skip-white-radish，跳过设置 checked');
            }
        }
        if (!pendingAutomationKeys.has('friend_help')) $('auto-friend-help').checked = !!auto.friend_help;
        if (!pendingAutomationKeys.has('friend_bad')) $('auto-friend-bad').checked = !!auto.friend_bad;
        updateFriendSubControlsState();

        const opsPayload = (data.operations && typeof data.operations === 'object')
            ? data.operations
            : lastOperationsData;
        renderOpsList(opsPayload || {});
        //renderOpsList(data.operations)
        // Seed Pref
        if (document.activeElement !== $('seed-select') && data.preferredSeed !== undefined) {
            const sel = $('seed-select');
            const strategySel = $('strategy-select');
            const isPreferred = !strategySel || String(strategySel.value || 'preferred') === 'preferred';
            if (isPreferred) {
                if (sel.dataset.loaded !== '1') {
                    await loadSeeds(data.preferredSeed);
                } else {
                    sel.value = String(data.preferredSeed || 0);
                }
            }
        }
    });
}

async function pollLogs() {
    const query = buildLogQuery();
    const key = `pollLogs:${query}`;
    return runDedupedRequest(key, async () => {
        const list = await api(`/api/logs?${query}`);
        const wrap = $('logs-list');
        const serverLogs = (Array.isArray(list) ? list : []).filter((l) => !shouldHideLogEntry(l));
        const uiLogs = localUiLogs.filter(matchLogFilters);
        const normalized = [...serverLogs, ...uiLogs].sort((a, b) => toLogTs(a) - toLogTs(b));
        if (!normalized.length) {
            lastLogsRenderKey = '';
            logVirtualItems = [];
            renderVirtualLogsWindow(wrap);
            return;
        }
        const renderKey = JSON.stringify(normalized.map(l => [toLogTs(l), l.time, l.tag, l.msg, !!l.isWarn, l.accountId, (l.meta && l.meta.event) || '', (l.meta && l.meta.module) || '']));
        if (renderKey === lastLogsRenderKey) {
            renderVirtualLogsWindow(wrap);
            return;
        }
        const isNearBottom = wrap ? (wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 12) : false;
        lastLogsRenderKey = renderKey;
        logVirtualItems = normalized;
        renderVirtualLogsWindow(wrap);
        if (isNearBottom && wrap) {
            wrap.scrollTop = wrap.scrollHeight;
            renderVirtualLogsWindow(wrap);
        }
    });
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ============ 功能模块 ============
