// 全局变量，用于存储用户选择的好友ID
// 全局变量，用于存储用户选择的植物ID
let selectedPlantIds = new Set();

// 全局变量，用于存储用户选择的好友ID
let selectedFriendIds = new Set();
function renderLandCropImage(land) {
    if (!land || !land.seedImage || !land.plantName) return '';
    const alt = String(land.plantName).replace(/"/g, '&quot;');
    return `<img class="land-crop-image" src="${land.seedImage}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
}

let matureCountdownTimer = null;
function ensureMatureCountdownTimer() {
    if (matureCountdownTimer) return;
    matureCountdownTimer = setInterval(() => {
        document.querySelectorAll('.mature-countdown').forEach((el) => {
            const cur = Number(el.dataset.remain || 0);
            if (!Number.isFinite(cur) || cur <= 0) return;
            const next = Math.max(0, cur - 1);
            el.dataset.remain = String(next);
            el.textContent = next > 0 ? `${fmtRemainSec(next)}后成熟` : '即将成熟';
        });
    }, 1000);
}

function renderLandPhaseText(landLevel, land) {
    if (landLevel <= 0) return '未解锁';
    const remain = Number((land && land.matureInSec) || 0);
    if (remain > 0) {
        return `<span class="mature-countdown" data-remain="${remain}">${fmtRemainSec(remain)}后成熟</span>`;
    }
    return '';
}

// 农场加载
async function loadFarm() {
    if (!currentAccountId) {
        clearFarmView('暂无账号，请先添加或选择账号');
        return;
    }
    const data = await api('/api/lands');
    const grid = $('farm-grid');
    const sum = $('farm-summary');

    if (!data || !data.lands) {
        grid.innerHTML = '<div style="padding:20px;text-align:center;color:#666">无法获取数据，请确保账号已登录</div>';
        sum.textContent = '';
        return;
    }

    const statusClass = { locked: 'locked', empty: 'empty', harvestable: 'harvestable', growing: 'growing', dead: 'dead', stealable: 'stealable', harvested: 'empty' };
    grid.innerHTML = data.lands.map(l => {
        let cls = statusClass[l.status] || 'empty';
        if (l.status === 'stealable') cls = 'harvestable'; // 复用样式
        const landLevel = Number(l.level || 0);
        const landLevelClass = `land-level-${Math.max(0, Math.min(4, landLevel))}`;
        const phaseText = renderLandPhaseText(landLevel, l);

        let needs = [];
        if (l.needWater) needs.push('水');
        if (l.needWeed) needs.push('草');
        if (l.needBug) needs.push('虫');
        return `
            <div class="land-cell ${cls} ${landLevelClass}">
                <span class="id">#${l.id}</span>
                ${renderLandCropImage(l)}
                <span class="plant-name">${l.plantName || '-'}</span>
                <span class="phase-name">${phaseText}</span>
                ${needs.length ? `<span class="needs">${needs.join(' ')}</span>` : ''}
            </div>`;
    }).join('');
    ensureMatureCountdownTimer();

    const s = data.summary || {};
    sum.textContent = `可收:${s.harvestable || 0} 长:${s.growing || 0} 空:${s.empty || 0} 枯:${s.dead || 0}`;
}

// 好友列表加载
async function loadFriends() {
    if (!currentAccountId) {
        clearFriendsView('暂无账号，请先添加或选择账号');
        return;
    }
    const list = await api('/api/friends');
    const wrap = $('friends-list');
    const summary = $('friend-summary');

    if (!list || !list.length) {
        if (summary) summary.textContent = '共 0 名好友';
        wrap.innerHTML = '<div style="padding:20px;text-align:center;color:#666">暂无好友或数据加载失败</div>';
        return;
    }

    if (summary) summary.textContent = `共 ${list.length} 名好友`;

    wrap.innerHTML = list.map(f => {
        const p = f.plant || {};
        const info = [];
        if (p.stealNum) info.push(`偷${p.stealNum}`);
        if (p.dryNum) info.push(`水${p.dryNum}`);
        if (p.weedNum) info.push(`草${p.weedNum}`);
        if (p.insectNum) info.push(`虫${p.insectNum}`);
        const preview = info.length ? info.join(' ') : '无操作';

        return `
            <div class="friend-item">
                <div class="friend-header" onclick="toggleFriend('${f.gid}')">
                    <span class="name">${f.name}</span>
                    <span class="preview ${info.length ? 'has-work' : ''}">${preview}</span>
                </div>
                <div class="friend-actions">
                    <button class="btn btn-sm" onclick="friendQuickOp(event, '${f.gid}', 'steal')">一键偷取</button>
                    <button class="btn btn-sm" onclick="friendQuickOp(event, '${f.gid}', 'water')">一键浇水</button>
                    <button class="btn btn-sm" onclick="friendQuickOp(event, '${f.gid}', 'weed')">一键除草</button>
                    <button class="btn btn-sm" onclick="friendQuickOp(event, '${f.gid}', 'bug')">一键除虫</button>
                    <button class="btn btn-sm" onclick="friendQuickOp(event, '${f.gid}', 'bad')">一键捣乱</button>
                </div>
                <div id="friend-lands-${f.gid}" class="friend-lands" style="display:none">
                    <div style="padding:10px;text-align:center;color:#888"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>
                </div>
            </div>
        `;
    }).join('');
}

window.toggleFriend = async (gid) => {
    const el = document.getElementById(`friend-lands-${gid}`);
    if (el.style.display === 'block') {
        el.style.display = 'none';
        return;
    }

    // 收起其他
    document.querySelectorAll('.friend-lands').forEach(e => e.style.display = 'none');

    el.style.display = 'block';

    const data = await api(`/api/friend/${gid}/lands`);
    if (!data || !data.lands) {
        el.innerHTML = '<div style="padding:10px;text-align:center;color:#F44336">加载失败</div>';
        return;
    }

    const statusClass = { empty: 'empty', locked: 'empty', stealable: 'harvestable', harvested: 'empty', dead: 'dead', growing: 'growing' };
    el.innerHTML = `
        <div class="farm-grid mini">
            ${data.lands.map(l => {
        let cls = statusClass[l.status] || 'empty';
        const landLevel = Number(l.level || 0);
        const landLevelClass = `land-level-${Math.max(0, Math.min(4, landLevel))}`;
        const phaseText = renderLandPhaseText(landLevel, l);
        let needs = [];
        if (l.needWater) needs.push('水');
        if (l.needWeed) needs.push('草');
        if (l.needBug) needs.push('虫');
        return `
                    <div class="land-cell ${cls} ${landLevelClass}">
                        <span class="id">#${l.id}</span>
                        ${renderLandCropImage(l)}
                        <span class="plant-name">${l.plantName || '-'}</span>
                        <span class="phase-name">${phaseText}</span>
                         ${needs.length ? `<span class="needs">${needs.join(' ')}</span>` : ''}
                    </div>`;
    }).join('')}
        </div>
    `;
    ensureMatureCountdownTimer();
};

window.friendQuickOp = async (event, gid, opType) => {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!currentAccountId) return;
    const opMap = { steal: '偷取', water: '浇水', weed: '除草', bug: '除虫', bad: '捣乱' };
    const btn = event && event.currentTarget ? event.currentTarget : null;
    if (btn) btn.disabled = true;
    try {
        const ret = await api(`/api/friend/${gid}/op`, 'POST', { opType });
        if (!ret) {
            alert(`一键${opMap[opType] || '操作'}失败`);
            return;
        }
        if (ret.message) alert(ret.message);
        const landsEl = document.getElementById(`friend-lands-${gid}`);
        if (landsEl && landsEl.style.display === 'block') {
            landsEl.innerHTML = '<div style="padding:10px;text-align:center;color:#888"><i class="fas fa-spinner fa-spin"></i> 刷新中...</div>';
            const data = await api(`/api/friend/${gid}/lands`);
            if (data && data.lands) {
                const statusClass = { empty: 'empty', locked: 'empty', stealable: 'harvestable', harvested: 'empty', dead: 'dead', growing: 'growing' };
                landsEl.innerHTML = `
                    <div class="farm-grid mini">
                        ${data.lands.map(l => {
                    const cls = statusClass[l.status] || 'empty';
                    const landLevel = Number(l.level || 0);
                    const landLevelClass = `land-level-${Math.max(0, Math.min(4, landLevel))}`;
                    const phaseText = renderLandPhaseText(landLevel, l);
                    const needs = [];
                    if (l.needWater) needs.push('水');
                    if (l.needWeed) needs.push('草');
                    if (l.needBug) needs.push('虫');
                    return `
                                <div class="land-cell ${cls} ${landLevelClass}">
                                    <span class="id">#${l.id}</span>
                                    ${renderLandCropImage(l)}
                                    <span class="plant-name">${l.plantName || '-'}</span>
                                    <span class="phase-name">${phaseText}</span>
                                    ${needs.length ? `<span class="needs">${needs.join(' ')}</span>` : ''}
                                </div>`;
                }).join('')}
                    </div>
                `;
                ensureMatureCountdownTimer();
            }
        }
        loadFriends();
    } finally {
        if (btn) btn.disabled = false;
    }
};

// 种子加载
async function loadSeeds(preferredSeed) {
    if (seedLoadPromise) return seedLoadPromise;
    seedLoadPromise = (async () => {
        const list = await api('/api/seeds');
        const sel = $('seed-select');
        sel.innerHTML = '<option value="0">自动选择 (按策略)</option>';
        if (list && list.length) {
            list.forEach(s => {
                const o = document.createElement('option');
                o.value = s.seedId;
                const levelText = (s.requiredLevel === null || s.requiredLevel === undefined) ? 'Lv?' : `Lv${s.requiredLevel}`;
                const priceText = (s.price === null || s.price === undefined) ? '价格未知' : `${s.price}金`;
                let text = `${levelText} ${s.name} (${priceText})`;
                if (s.locked) {
                    text += ' [未解锁]';
                    o.disabled = true;
                    o.style.color = '#666';
                } else if (s.soldOut) {
                    text += ' [售罄]';
                    o.disabled = true;
                    o.style.color = '#666';
                }
                o.textContent = text;
                sel.appendChild(o);
            });
        }
        sel.dataset.loaded = '1';
        if (preferredSeed !== undefined && preferredSeed !== null) {
            const preferredVal = String(preferredSeed || 0);
            if (preferredVal !== '0' && !Array.from(sel.options).some(opt => opt.value === preferredVal)) {
                const fallbackOption = document.createElement('option');
                fallbackOption.value = preferredVal;
                fallbackOption.textContent = `种子${preferredVal} (当前不可购买/详情未知)`;
                sel.appendChild(fallbackOption);
            }
            sel.value = preferredVal;
        }
    })().finally(() => {
        seedLoadPromise = null;
    });
    return seedLoadPromise;
}

function getCurrentLevelFromUi() {
    const raw = String(($('level') && $('level').textContent) || '');
    const m = raw.match(/Lv\s*(\d+)/i);
    return m ? (parseInt(m[1], 10) || 0) : 0;
}

function getStrategySortKey(strategy) {
    const map = {
        max_exp: 'exp',
        max_fert_exp: 'fert',
        max_profit: 'profit',
        max_fert_profit: 'fert_profit',
    };
    return map[String(strategy || '')] || '';
}

function buildSeedOptionText(seed, seedId) {
    if (!seed) return `种子${seedId}`;
    const lv = (seed.requiredLevel === null || seed.requiredLevel === undefined) ? 'Lv?' : `Lv${seed.requiredLevel}`;
    const price = (seed.price === null || seed.price === undefined) ? '价格未知' : `${seed.price}金`;
    return `${lv} ${seed.name} (${price})`;
}

async function resolveStrategySeed(strategy) {
    const list = await api('/api/seeds');
    const seeds = Array.isArray(list) ? list : [];
    const available = seeds.filter(s => !s.locked && !s.soldOut);
    if (!available.length) return null;

    const availableById = new Map(available.map(s => [Number(s.seedId || 0), s]));

    if (strategy === 'level') {
        const sorted = [...available].sort((a, b) => {
            const av = Number(a.requiredLevel || 0);
            const bv = Number(b.requiredLevel || 0);
            if (bv !== av) return bv - av;
            return Number(a.seedId || 0) - Number(b.seedId || 0);
        });
        return sorted[0] || null;
    }

    const sortKey = getStrategySortKey(strategy);
    if (sortKey) {
        const level = getCurrentLevelFromUi();
        const analytics = await api(`/api/analytics?sort=${sortKey}`);
        const ranked = Array.isArray(analytics) ? analytics : [];
        for (const row of ranked) {
            const sid = Number(row && row.seedId) || 0;
            if (sid <= 0) continue;
            const reqLv = Number(row && row.level);
            if (Number.isFinite(reqLv) && reqLv > 0 && level > 0 && reqLv > level) continue;
            const found = availableById.get(sid);
            if (found) return found;
        }
    }

    const fallback = [...available].sort((a, b) => (Number(b.requiredLevel || 0) - Number(a.requiredLevel || 0)));
    return fallback[0] || null;
}

async function refreshSeedSelectByStrategy() {
    const strategy = String(($('strategy-select') && $('strategy-select').value) || 'preferred');
    const sel = $('seed-select');
    if (!sel) return;

    if (strategy === 'preferred') {
        sel.disabled = false;
        if (sel.dataset.loaded !== '1') {
            await loadSeeds(parseInt(sel.value, 10) || 0);
        }
        return;
    }

    sel.disabled = true;
    const matched = await resolveStrategySeed(strategy);
    if (!matched) {
        sel.innerHTML = '<option value="0">当前策略无可用种子</option>';
        sel.value = '0';
        sel.dataset.loaded = 'strategy';
        return;
    }
    const sid = Number(matched.seedId || 0);
    sel.innerHTML = `<option value="${sid}">${buildSeedOptionText(matched, sid)}</option>`;
    sel.value = String(sid);
    sel.dataset.loaded = 'strategy';
}

function markAutomationPending(key) {
    if (!key) return;
    pendingAutomationKeys.add(String(key));
}

// 绑定自动化开关（改为本地待保存，不即时提交）
$('fertilizer-select').addEventListener('change', async () => {
    if (!currentAccountId) return;
    markAutomationPending('fertilizer');
});

['auto-farm', 'auto-farm-push', 'auto-land-upgrade', 'auto-friend', 'auto-task', 'auto-daily-routine', 'auto-fertilizer-gift', 'auto-fertilizer-buy', 'auto-sell', 'auto-friend-steal', 'auto-friend-help', 'auto-friend-bad'].forEach((id, i) => {
    // 这里原来的 id 是数组里的元素，key 需要处理
    // id: auto-farm -> key: farm
    // id: auto-friend-steal -> key: friend_steal
    const key = (id === 'auto-friend')
        ? 'friend_help_exp_limit'
        : id.replace('auto-', '').replace(/-/g, '_');
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('change', async () => {
            if (id === 'auto-friend') {
                updateFriendSubControlsState();
            }
            if (!currentAccountId) return;
            markAutomationPending(key);
        });
    }
});

// 偷菜过滤相关事件绑定
['steal-filter-enabled', 'steal-filter-mode'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('change', () => {
            if (!currentAccountId) return;
            markAutomationPending('stealFilter');
        });
    }
});

// 偷菜好友过滤相关事件绑定
['steal-friend-filter-enabled', 'steal-friend-filter-mode'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('change', () => {
            if (!currentAccountId) return;
            markAutomationPending('stealFriendFilter');
        });
    }
});
updateFriendSubControlsState();

$('strategy-select').addEventListener('change', async () => {
    await refreshSeedSelectByStrategy();
});

// 保存设置按钮点击事件（假设绑定在某个按钮，如 'btn-save-settings'）
const saveSettingsBtn = document.getElementById('btn-save-settings');
if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
        const strategy = document.getElementById('strategy-select').value;
        let farmMin = parseInt(document.getElementById('interval-farm-min').value, 10);
        let farmMax = parseInt(document.getElementById('interval-farm-max').value, 10);
        let friendMin = parseInt(document.getElementById('interval-friend-min').value, 10);
        let friendMax = parseInt(document.getElementById('interval-friend-max').value, 10);
        const seedId = parseInt(document.getElementById('seed-select').value) || 0;
        const friendQuietEnabled = document.getElementById('friend-quiet-enabled').checked;
        const friendQuietStart = document.getElementById('friend-quiet-start').value || '23:00';
        const friendQuietEnd = document.getElementById('friend-quiet-end').value || '07:00';

        // 确保 farmMin 和 farmMax 的合理性
        farmMin = Math.max(1, Number.isFinite(farmMin) ? farmMin : 2);
        farmMax = Math.max(1, Number.isFinite(farmMax) ? farmMax : farmMin);
        if (farmMin > farmMax) {
            alert('农场巡查间隔：最大值不能小于最小值');
            document.getElementById('interval-farm-max').focus();
            return;
        }

        // 确保 friendMin 和 friendMax 的合理性
        friendMin = Math.max(1, Number.isFinite(friendMin) ? friendMin : 10);
        friendMax = Math.max(1, Number.isFinite(friendMax) ? friendMax : friendMin);
        if (friendMin > friendMax) {
            alert('好友巡查间隔：最大值不能小于最小值');
            document.getElementById('interval-friend-max').focus();
            return;
        }

        // 更新输入框的值
        document.getElementById('interval-farm-min').value = String(farmMin);
        document.getElementById('interval-farm-max').value = String(farmMax);
        document.getElementById('interval-friend-min').value = String(friendMin);
        document.getElementById('interval-friend-max').value = String(friendMax);

        // 获取偷菜过滤选中的植物ID
        const selectedPlantIdsArray = Array.from(selectedPlantIds);

        // 获取偷菜好友过滤选中的好友ID
        const selectedFriendIdsArray = Array.from(selectedFriendIds);

        const saveBtn = document.getElementById('btn-save-settings');
        if (saveBtn) saveBtn.disabled = true;
        try {
            const settingsResp = await api('/api/settings/save', 'POST', {
                strategy,
                seedId,
                intervals: {
                    farm: farmMin,
                    friend: friendMin,
                    farmMin,
                    farmMax,
                    friendMin,
                    friendMax,
                },
                friendQuietHours: {
                    enabled: friendQuietEnabled,
                    start: friendQuietStart,
                    end: friendQuietEnd,
                },
                stealFilter: {
                    enabled: document.getElementById('steal-filter-enabled').checked,
                    mode: document.getElementById('steal-filter-mode').value || 'blacklist',
                    plantIds: selectedPlantIdsArray, // 传递当前选择的植物ID
                },
                stealFriendFilter: {
                    enabled: document.getElementById('steal-friend-filter-enabled').checked,
                    mode: document.getElementById('steal-friend-filter-mode').value || 'blacklist',
                    friendIds: selectedFriendIdsArray, // 传递当前选择的好友ID
                }
            });
            updateRevisionState(settingsResp);

            const automationResp = await api('/api/automation', 'POST', {
                farm: document.getElementById('auto-farm').checked,
                farm_push: document.getElementById('auto-farm-push').checked,
                land_upgrade: document.getElementById('auto-land-upgrade').checked,
                friend_help_exp_limit: document.getElementById('auto-friend').checked,
                task: document.getElementById('auto-task').checked,
                email: document.getElementById('auto-daily-routine').checked,
                fertilizer_gift: document.getElementById('auto-fertilizer-gift').checked,
                fertilizer_buy: document.getElementById('auto-fertilizer-buy').checked,
                free_gifts: document.getElementById('auto-daily-routine').checked,
                share_reward: document.getElementById('auto-daily-routine').checked,
                vip_gift: document.getElementById('auto-daily-routine').checked,
                month_card: document.getElementById('auto-daily-routine').checked,
                sell: document.getElementById('auto-sell').checked,
                fertilizer: document.getElementById('fertilizer-select').value,
                friend_steal: document.getElementById('auto-friend-steal').checked,
                friend_help: document.getElementById('auto-friend-help').checked,
                friend_bad: document.getElementById('auto-friend-bad').checked,
            });
            updateRevisionState(automationResp);
            pendingAutomationKeys.clear();

            await loadSettings(); // 重新加载设置以反映保存后的状态
            alert('设置已保存');
        } catch (error) {
            console.error('保存设置时出错:', error);
            alert('保存设置时出错，请重试。');
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    });
}

const saveOfflineReminderBtn = document.getElementById('btn-save-offline-reminder');
const PUSHOO_CHANNELS = new Set([
    'webhook', 'qmsg', 'serverchan', 'pushplus', 'pushplushxtrip',
    'dingtalk', 'wecom', 'bark', 'gocqhttp', 'onebot', 'atri',
    'pushdeer', 'igot', 'telegram', 'feishu', 'ifttt', 'wecombot',
    'discord', 'wxpusher',
]);
function syncOfflineReminderChannelUI() {
    const channelEl = $('offline-reminder-channel');
    const endpointEl = $('offline-reminder-endpoint');
    if (!channelEl || !endpointEl) return;
    const channel = String(channelEl.value || 'webhook').trim() || 'webhook';
    const editable = channel === 'webhook';
    endpointEl.disabled = !editable;
}

const offlineReminderChannelEl = document.getElementById('offline-reminder-channel');
if (offlineReminderChannelEl) {
    offlineReminderChannelEl.addEventListener('change', syncOfflineReminderChannelUI);
    syncOfflineReminderChannelUI();
}
if (saveOfflineReminderBtn) {
    saveOfflineReminderBtn.addEventListener('click', async () => {
        const channel = String((($('offline-reminder-channel') || {}).value || 'webhook')).trim() || 'webhook';
        const reloginUrlMode = String((($('offline-reminder-relogin-url-mode') || {}).value || 'none')).trim() || 'none';
        const endpoint = String((($('offline-reminder-endpoint') || {}).value || '')).trim();
        const token = String((($('offline-reminder-token') || {}).value || '')).trim();
        const title = String((($('offline-reminder-title') || {}).value || '')).trim();
        const msg = String((($('offline-reminder-msg') || {}).value || '')).trim();
        let offlineDeleteSec = parseInt((($('offline-delete-seconds') || {}).value || ''), 10);
        if (!Number.isFinite(offlineDeleteSec) || offlineDeleteSec < 1) offlineDeleteSec = 120;
        const savePayload = { channel, reloginUrlMode, token, title, msg, offlineDeleteSec };
        if (channel === 'webhook') {
            if (endpoint) savePayload.endpoint = endpoint;
        }

        saveOfflineReminderBtn.disabled = true;
        try {
            const ret = await api('/api/settings/offline-reminder', 'POST', savePayload);
            if (!ret) {
                alert('保存下线提醒设置失败');
                return;
            }
            if ($('offline-delete-seconds')) $('offline-delete-seconds').value = String(offlineDeleteSec);
            alert('下线提醒设置已保存');
        } finally {
            saveOfflineReminderBtn.disabled = false;
        }
    });
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 加载植物列表用于偷菜过滤
async function loadStealFilterPlants(stealFilter) {
    const container = $('steal-filter-plants');
    if (!container) return;

    const plants = await api('/api/plants');
    if (!plants || !plants.length) {
        container.innerHTML = '<div class="plant-select-loading">暂无植物数据</div>';
        return;
    }

    const selectedIds = new Set((stealFilter && stealFilter.plantIds) || []);

    container.innerHTML = plants.map(p => {
        const checked = selectedIds.has(p.id) ? 'checked' : '';
        const imageHtml = p.image
            ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
            : `<span class="plant-fallback">${escapeHtml(p.name.slice(0, 1))}</span>`;
        const levelText = p.level > 0 ? `Lv${p.level}` : 'Lv?';
        const priceText = p.price > 0 ? `${p.price}金` : '?';
        return `
            <label class="plant-checkbox-item" title="${escapeHtml(p.name)} - ${levelText} ${priceText}">
                <input type="checkbox" class="plant-checkbox" data-plant-id="${p.id}" ${checked}>
                <div class="plant-image">${imageHtml}</div>
                <span class="plant-name">${escapeHtml(p.name)}</span>
                <span class="plant-meta">${levelText} · ${priceText}</span>
            </label>
        `;
    }).join('');

    // 绑定复选框变化事件
    container.querySelectorAll('.plant-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            if (!currentAccountId) return;
            markAutomationPending('stealFilter');
        });
    });
}

// 加载好友列表用于偷菜好友过滤
// 加载好友列表用于偷菜好友过滤
async function loadStealFriendFilterList(stealFriendFilter, searchQuery = '') {
    const container = document.getElementById('steal-friend-filter-list');
    if (!container) return;

    if (!currentAccountId) {
        container.innerHTML = '<div class="friend-select-loading">请先选择账号</div>';
        return;
    }

    // 获取好友列表
    const friends = await api('/api/friends');
    if (!friends || !friends.length) {
        container.innerHTML = '<div class="friend-select-loading">暂无好友数据</div>';
        return;
    }

    // 根据搜索查询过滤好友
    let filteredFriends = friends;
    if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        filteredFriends = friends.filter(f => f.name.toLowerCase().includes(query));
    }

    // 使用传入的 stealFriendFilter 中的 friendIds，或者默认为空数组
    const selectedIds = new Set((stealFriendFilter && stealFriendFilter.friendIds) || []);

    container.innerHTML = filteredFriends.map(f => {
        const checked = selectedIds.has(f.gid) ? 'checked' : '';
        const avatarHtml = f.avatar
            ? ``
            : `<span class="friend-fallback">${escapeHtml(f.name.slice(0, 1))}</span>`;
        return `
            <label class="friend-checkbox-item" title="${escapeHtml(f.name)} (GID: ${f.gid})">
                <input type="checkbox" class="friend-checkbox" data-friend-id="${f.gid}" ${checked}>
                <div class="friend-avatar">${avatarHtml}</div>
                <span class="friend-name">${escapeHtml(f.name)}</span>
            </label>
        `;
    }).join('');

    // 使用事件委托绑定复选框变化事件，更新 selectedFriendIds
    container.addEventListener('change', (event) => {
        if (event.target.classList.contains('friend-checkbox')) {
            const friendId = parseInt(event.target.getAttribute('data-friend-id'), 10);
            if (event.target.checked) {
                selectedFriendIds.add(friendId);
            } else {
                selectedFriendIds.delete(friendId);
            }
            if (!currentAccountId) return;
            markAutomationPending('stealFriendFilter');
        }
    });
}

// 加载额外设置
async function loadSettings() {
    try {
        const data = await api('/api/settings');
        if (!data) {
            console.warn('未获取到设置数据');
            return;
        }

        // ========== 其他设置加载代码（根据您的实际需求保持不变） ==========

        // ========== 加载种植策略相关设置 ==========
        if (data.strategy) {
            document.getElementById('strategy-select').value = data.strategy;
        }
        if (data.intervals) {
            const farmBase = Number(data.intervals.farm || 2);
            const friendBase = Number(data.intervals.friend || 10);
            const farmMin = Number(data.intervals.farmMin || farmBase || 2);
            const farmMax = Number(data.intervals.farmMax || farmMin || 2);
            const friendMin = Number(data.intervals.friendMin || friendBase || 10);
            const friendMax = Number(data.intervals.friendMax || friendMin || 10);
            document.getElementById('interval-farm-min').value = String(farmMin);
            document.getElementById('interval-farm-max').value = String(farmMax);
            document.getElementById('interval-friend-min').value = String(friendMin);
            document.getElementById('interval-friend-max').value = String(friendMax);
        }
        if (data.preferredSeed !== undefined) {
            const sel = document.getElementById('seed-select');
            if (currentAccountId && sel.dataset.loaded !== '1') {
                await loadSeeds(data.preferredSeed);
            } else {
                sel.value = String(data.preferredSeed || 0);
            }
        }
        if (data.automation && typeof data.automation === 'object') {
            document.getElementById('auto-farm').checked = !!data.automation.farm;
            document.getElementById('auto-farm-push').checked = !!data.automation.farm_push;
            document.getElementById('auto-land-upgrade').checked = !!data.automation.land_upgrade;
            document.getElementById('auto-friend').checked = !!data.automation.friend_help_exp_limit;
            document.getElementById('auto-task').checked = !!data.automation.task;
            document.getElementById('auto-daily-routine').checked = !!(data.automation.email && data.automation.free_gifts && data.automation.share_reward && data.automation.vip_gift && data.automation.month_card);
            document.getElementById('auto-fertilizer-gift').checked = !!data.automation.fertilizer_gift;
            document.getElementById('auto-fertilizer-buy').checked = !!data.automation.fertilizer_buy;
            document.getElementById('auto-sell').checked = !!data.automation.sell;
            document.getElementById('auto-friend-steal').checked = !!data.automation.friend_steal;
            document.getElementById('auto-friend-help').checked = !!data.automation.friend_help;
            document.getElementById('auto-friend-bad').checked = !!data.automation.friend_bad;
            if (data.automation.fertilizer) {
                document.getElementById('fertilizer-select').value = data.automation.fertilizer;
            }
            updateFriendSubControlsState();
        }

        // ========== 加载偷菜过滤配置 ==========
        if (data.stealFilter && typeof data.stealFilter === 'object') {
            document.getElementById('steal-filter-enabled').checked = !!data.stealFilter.enabled;
            document.getElementById('steal-filter-mode').value = data.stealFilter.mode || 'blacklist';
            selectedPlantIds = new Set((data.stealFilter.plantIds || []).map(id => parseInt(id, 10)));
            await loadStealFilterPlants(data.stealFilter);
        } else {
            document.getElementById('steal-filter-enabled').checked = false;
            document.getElementById('steal-filter-mode').value = 'blacklist';
            selectedPlantIds = new Set();
            await loadStealFilterPlants({ plantIds: [] });
        }

        // ========== 加载偷菜好友过滤配置 ==========
        if (data.stealFriendFilter && typeof data.stealFriendFilter === 'object') {
            document.getElementById('steal-friend-filter-enabled').checked = !!data.stealFriendFilter.enabled;
            document.getElementById('steal-friend-filter-mode').value = data.stealFriendFilter.mode || 'blacklist';
            selectedFriendIds = new Set((data.stealFriendFilter.friendIds || []).map(id => parseInt(id, 10)));
            await loadStealFriendFilterList(data.stealFriendFilter);
        } else {
            document.getElementById('steal-friend-filter-enabled').checked = false;
            document.getElementById('steal-friend-filter-mode').value = 'blacklist';
            selectedFriendIds = new Set();
            await loadStealFriendFilterList({ friendIds: [] });
        }

        // ========== 加载施肥策略 ==========
        if (data.fertilizer) {
            document.getElementById('fertilizer-select').value = data.fertilizer;
        }

        // ========== 加载其他设置（如静默时段、下线提醒等） ==========
        const reminder = (data.offlineReminder && typeof data.offlineReminder === 'object') ? data.offlineReminder : {};
        const savedChannel = String(reminder.channel || '').trim().toLowerCase();
        if (document.getElementById('offline-reminder-channel')) {
            document.getElementById('offline-reminder-channel').value = PUSHOO_CHANNELS.has(savedChannel) ? savedChannel : 'webhook';
        }
        const reloginUrlMode = String(reminder.reloginUrlMode || 'none').trim();
        if (document.getElementById('offline-reminder-relogin-url-mode')) {
            const reloginUrlModeEl = document.getElementById('offline-reminder-relogin-url-mode');
            const allow = new Set(['none', 'qq_link', 'qr_link']);
            reloginUrlModeEl.value = allow.has(reloginUrlMode) ? reloginUrlMode : 'none';
        }
        if (document.getElementById('offline-reminder-endpoint')) {
            document.getElementById('offline-reminder-endpoint').value = String(reminder.endpoint || '').trim();
        }
        if (document.getElementById('offline-reminder-token')) {
            document.getElementById('offline-reminder-token').value = String(reminder.token || '');
        }
        if (document.getElementById('offline-reminder-title')) {
            document.getElementById('offline-reminder-title').value = String(reminder.title || '账号下线提醒');
        }
        if (document.getElementById('offline-reminder-msg')) {
            document.getElementById('offline-reminder-msg').value = String(reminder.msg || '账号下线');
        }
        if (document.getElementById('offline-delete-seconds')) {
            document.getElementById('offline-delete-seconds').value = String(Number(reminder.offlineDeleteSec || 120));
        }
        const enabled = !!document.getElementById('friend-quiet-enabled').checked;
        document.getElementById('friend-quiet-start').disabled = !enabled;
        document.getElementById('friend-quiet-end').disabled = !enabled;
        if (data.friendQuietHours) {
            document.getElementById('friend-quiet-enabled').checked = !!data.friendQuietHours.enabled;
            document.getElementById('friend-quiet-start').value = data.friendQuietHours.start || '23:00';
            document.getElementById('friend-quiet-end').value = data.friendQuietHours.end || '07:00';
        }

        // 同步下线提醒渠道UI
        syncOfflineReminderChannelUI();

        // ========== 绑定搜索好友名字的输入框事件 ==========
        const stealFriendSearchInput = document.getElementById('steal-friend-search');
        if (stealFriendSearchInput) {
            stealFriendSearchInput.addEventListener('input', async () => {
                if (!currentAccountId) return;
                const searchQuery = stealFriendSearchInput.value;
                await loadStealFriendFilterList(
                    {
                        enabled: document.getElementById('steal-friend-filter-enabled').checked,
                        mode: document.getElementById('steal-friend-filter-mode').value || 'blacklist',
                        friendIds: Array.from(selectedFriendIds)
                    },
                    searchQuery
                );
            });
        }

        // ========== 其他设置加载代码（根据您的实际需求保持不变） ==========

    } catch (error) {
        console.error('加载设置时出错:', error);
        // 可以根据需要显示错误提示给用户
    }
}

const friendQuietEnabledEl = document.getElementById('friend-quiet-enabled');
if (friendQuietEnabledEl) {
    friendQuietEnabledEl.addEventListener('change', () => {
        const enabled = !!friendQuietEnabledEl.checked;
        $('friend-quiet-start').disabled = !enabled;
        $('friend-quiet-end').disabled = !enabled;
    });
}

async function loadBag() {
    const listEl = $('bag-list');
    const sumEl = $('bag-summary');
    if (!listEl || !sumEl) return;
    if (!currentAccountId) {
        sumEl.textContent = '请选择账号';
        listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#666">请选择账号后查看背包</div>';
        return;
    }
    sumEl.textContent = '加载中...';
    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#888"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
    const data = await api('/api/bag');
    const items = data && Array.isArray(data.items) ? data.items : [];
    // 概览已展示的数据型物品：金币/点券/经验/化肥容器/收藏点
    const hiddenIds = new Set([1, 1001, 1002, 1101, 1011, 1012, 3001, 3002]);
    const displayItems = items.filter(it => !hiddenIds.has(Number(it.id || 0)));

    sumEl.textContent = `共 ${displayItems.length} 种物品`;
    if (!displayItems.length) {
        listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#666">无可展示物品</div>';
        return;
    }
    listEl.innerHTML = displayItems.map(it => `
      <div class="bag-item">
        <div class="bag-top">
          <div class="thumb-wrap ${it.image ? '' : 'fallback'}">
            ${it.image
              ? `<img class="bag-thumb" src="${escapeHtml(String(it.image))}" alt="${escapeHtml(String(it.name || '物品'))}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'; this.closest('.thumb-wrap').classList.add('fallback')">`
              : ''}
            <span class="bag-thumb-fallback">${escapeHtml(String((it.name || '物').slice(0, 1)))}</span>
          </div>
          ${it.hoursText
              ? `<div class="count bag-count-right" style="color:var(--primary)">${escapeHtml(String(it.hoursText))}</div>`
              : `<div class="count bag-count-right">x${Number(it.count || 0)}</div>`}
        </div>
        <div class="name">${escapeHtml(String(it.name || ('物品' + (it.id || ''))))}</div>
        <div class="meta">ID: ${Number(it.id || 0)}${it.uid ? ` · UID: ${Number(it.uid)}` : ''}</div>
        <div class="meta">类型: ${Number(it.itemType || 0)}${Number(it.level || 0) > 0 ? ` · 等级: ${Number(it.level)}` : ''}${Number(it.price || 0) > 0 ? ` · 价格: ${Number(it.price)}` : ''}</div>
      </div>
    `).join('');
}

async function loadDailyGifts() {
    const listEl = $('daily-gifts-list');
    const sumEl = $('daily-gifts-summary');
    const growthListEl = $('growth-task-list');
    const growthFillEl = $('growth-task-fill');
    if (!listEl || !sumEl || !growthListEl || !growthFillEl) return;
    if (!currentAccountId) {
        sumEl.textContent = '请选择账号';
        listEl.innerHTML = '<div class="op-stat"><span class="label"><i class="fas fa-info-circle"></i> 暂无账号</span><span class="count">--</span></div>';
        growthFillEl.style.width = '0%';
        growthListEl.innerHTML = '<div class="growth-task-row"><span class="growth-task-name"><i class="fas fa-info-circle"></i> 暂无账号</span><span class="growth-task-status">--</span></div>';
        return;
    }
    growthFillEl.style.width = '0%';
    sumEl.textContent = '加载中...';
    const data = await api('/api/daily-gifts');
    const growth = (data && data.growth && typeof data.growth === 'object') ? data.growth : null;
    const growthTasks = growth && Array.isArray(growth.tasks) ? growth.tasks : [];
    const growthCompleted = Number(growth && growth.completedCount || 0);
    const growthTotal = Number(growth && growth.totalCount || 0);
    let growthPct = 0;
    if (growthTasks.length > 0) {
        let sumProgress = 0;
        let sumTotal = 0;
        for (const t of growthTasks) {
            const progress = Math.max(0, Number(t && t.progress || 0));
            const total = Math.max(0, Number(t && t.totalProgress || 0));
            if (total > 0) {
                sumProgress += Math.min(progress, total);
                sumTotal += total;
            }
        }
        if (sumTotal > 0) growthPct = Math.max(0, Math.min(100, (sumProgress / sumTotal) * 100));
    }
    if (growthPct <= 0 && growthTotal > 0) {
        // 兜底：无明细 total 时沿用完成数量口径
        growthPct = Math.max(0, Math.min(100, (growthCompleted / growthTotal) * 100));
    }
    growthFillEl.style.width = `${growthPct}%`;
    if (!growthTasks.length) {
        growthListEl.innerHTML = '<div class="growth-task-row"><span class="growth-task-name"><i class="fas fa-info-circle"></i> 暂无数据</span><span class="growth-task-status">--</span></div>';
    } else {
        growthListEl.innerHTML = growthTasks.map((t) => {
            const progress = Math.max(0, Number(t && t.progress || 0));
            const total = Math.max(0, Number(t && t.totalProgress || 0));
            const isUnlocked = !!(t && t.isUnlocked);
            const isCompleted = !!(t && t.isCompleted);
            const status = isUnlocked ? (total > 0 ? `${progress}/${total}` : (isCompleted ? '✓' : '✕')) : '-';
            const cls = isUnlocked ? (isCompleted ? 'color:var(--ok)' : '') : 'opacity:.65';
            return `<div class="growth-task-row"><span class="growth-task-name"><i class="fas fa-seedling"></i>${escapeHtml(String((t && t.desc) || '成长任务'))}</span><span class="growth-task-status" style="${cls}">${status}</span></div>`;
        }).join('');
    }

    const gifts = (data && Array.isArray(data.gifts)) ? data.gifts : [];
    const doneCount = gifts.filter(g => !!g.doneToday).length;
    sumEl.textContent = `今日完成 ${doneCount}/${gifts.length || 0}`;
    if (!gifts.length) {
        listEl.innerHTML = '<div class="op-stat"><span class="label"><i class="fas fa-info-circle"></i> 暂无数据</span><span class="count">--</span></div>';
        return;
    }
    const rows = gifts.map((g) => {
        let status = g.doneToday ? '✓' : (g.enabled ? '✕' : '-');
        if (g.key === 'task_claim') {
            const done = Math.max(0, Number(g.completedCount || 0));
            const total = Math.max(1, Number(g.totalCount || 3));
            status = `${done}/${total}`;
        }
        if (g.key === 'fertilizer_buy' && !g.doneToday && g.pausedNoGoldToday) status = '点券不足暂停';
        const cls = g.key === 'task_claim'
            ? ((Number(g.completedCount || 0) >= Number(g.totalCount || 3)) ? 'color:var(--ok)' : '')
            : (g.doneToday ? 'color:var(--ok)' : (g.enabled ? '' : 'opacity:.65'));
        return `<div class="op-stat"><span class="label"><i class="fas fa-gift"></i>${g.label || g.key}</span><span class="count" style="${cls}">${status}</span></div>`;
    });
    listEl.innerHTML = rows.join('');
}

// ============ UI 交互 ============
function activatePage(pageName) {
    const target = String(pageName || '').trim();
    if (!target) return;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    const nav = document.querySelector(`.nav-item[data-page="${target}"]`);
    if (nav) nav.classList.add('active');
    const page = document.getElementById('page-' + target);
    if (page) page.classList.add('active');

    const titleEl = $('page-title');
    if (titleEl) {
        if (nav) titleEl.textContent = nav.textContent.trim();
        else {
            const fallbackMap = {
                dashboard: '概览',
                personal: '个人',
                friends: '好友',
                accounts: '账号',
                analytics: '分析',
                settings: '设置',
            };
            titleEl.textContent = fallbackMap[target] || '概览';
        }
    }

    if (target === 'dashboard') renderOpsList(lastOperationsData);
    if (target === 'personal') {
        loadDailyGifts();
        loadBag();
        loadFarm();
    }
    if (target === 'friends') loadFriends();
    if (target === 'analytics') loadAnalytics();
    if (target === 'settings') loadSettings();
    if (target === 'accounts') {
        renderAccountManager();
        pollAccountLogs();
    }
}

// 导航切换
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
        e.preventDefault();
        activatePage(item.dataset.page);
    });
});

const goAnalyticsBtn = $('btn-go-analytics');
if (goAnalyticsBtn) {
    goAnalyticsBtn.addEventListener('click', () => activatePage('analytics'));
}

// 数据分析
async function loadAnalytics() {
    const container = $('analytics-list');
    if (!container) return;
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#888"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';

    const sort = $('analytics-sort').value;
    const list = await api(`/api/analytics?sort=${sort}`);

    if (!list || !list.length) {
        container.innerHTML = '<div style="padding:24px;text-align:center;color:#666;font-size:16px">暂无数据</div>';
        return;
    }

    // 前端兜底：始终按当前指标倒序显示
    const metricMap = {
        exp: 'expPerHour',
        fert: 'normalFertilizerExpPerHour',
        profit: 'profitPerHour',
        fert_profit: 'normalFertilizerProfitPerHour',
        level: 'level',
    };
    const metric = metricMap[sort];
    if (metric) {
        list.sort((a, b) => {
            const av = Number(a && a[metric]);
            const bv = Number(b && b[metric]);
            if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
            if (!Number.isFinite(av)) return 1;
            if (!Number.isFinite(bv)) return -1;
            return bv - av;
        });
    }

    // 表格头
    let html = `
    <table style="width:100%;border-collapse:collapse;color:var(--text-main)">
        <thead>
            <tr style="border-bottom:1px solid var(--border);text-align:left;color:var(--text-sub)">
                <th>作物 (Lv)</th>
                <th>时间</th>
                <th>经验/时</th>
                <th>普通肥经验/时</th>
                <th>净利润/时</th>
                <th>普通肥净利润/时</th>
            </tr>
        </thead>
        <tbody>
    `;

    list.forEach((item, index) => {
        const lvText = (item.level === null || item.level === undefined || item.level === '' || Number(item.level) < 0)
            ? '未知'
            : String(item.level);
        html += `
            <tr style="border-bottom:1px solid var(--border);">
                <td>
                    <div>${item.name}</div>
                    <div style="font-size:13px;color:var(--text-sub)">Lv${lvText}</div>
                </td>
                <td>${item.growTimeStr}</td>
                <td style="font-weight:bold;color:var(--accent)">${item.expPerHour}</td>
                <td style="font-weight:bold;color:var(--primary)">${item.normalFertilizerExpPerHour ?? '-'}</td>
                <td style="font-weight:bold;color:#f0b84f">${item.profitPerHour ?? '-'}</td>
                <td style="font-weight:bold;color:#74d39a">${item.normalFertilizerProfitPerHour ?? '-'}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

$('analytics-sort').addEventListener('change', loadAnalytics);

// 农场操作
window.doFarmOp = async (type) => {
    if (!currentAccountId) return;
    if (confirm('确定执行此操作吗?')) {
        await api('/api/farm/operate', 'POST', { opType: type });
        loadFarm(); // 刷新
    }
};

// 任务列表相关代码已删除

// 账号管理页面
function renderAccountManager() {
    console.log('[renderAccountManager] 渲染账号列表:', accounts.length, '个账号');
    const wrap = $('accounts-list');
    const summary = $('account-summary');
    if (!wrap) {
        console.log('[renderAccountManager] 找不到 accounts-list 元素');
        return;
    }
    if (summary) summary.textContent = `共 ${accounts.length} 个账号`;
    wrap.innerHTML = accounts.map(a => `
        <div class="acc-item">
            <div class="name">${a.name}</div>
            <div class="acc-actions">
                ${a.running 
                    ? `<button class="btn acc-btn acc-btn-stop" onclick="stopAccount('${a.id}')">停止</button>`
                    : `<button class="btn btn-primary acc-btn" onclick="startAccount('${a.id}')">启动</button>`
                }
                <button class="btn btn-primary acc-btn" onclick="editAccount('${a.id}')">编辑</button>
                <button class="btn acc-btn acc-btn-danger" onclick="deleteAccount('${a.id}')">删除</button>
            </div>
        </div>
    `).join('');
    
    // 更新账号日志过滤器选项
    const accountLogsFilter = $('account-logs-filter');
    if (accountLogsFilter) {
        const currentValue = accountLogsFilter.value;
        accountLogsFilter.innerHTML = '<option value="all">全部账号</option>' + 
            accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
        // 恢复之前的选择（如果该账号仍然存在）
        if (currentValue && (currentValue === 'all' || accounts.some(a => a.id === currentValue))) {
            accountLogsFilter.value = currentValue;
        }
    }
}

// 账号日志操作类型配置
const ACCOUNT_LOG_CONFIG = {
    add: { label: '添加', icon: 'fa-plus', color: '#22c55e', class: 'log-success' },
    update: { label: '更新', icon: 'fa-edit', color: '#3b82f6', class: 'log-info' },
    delete: { label: '删除', icon: 'fa-trash', color: '#ef4444', class: 'log-error' },
    kickout_delete: { label: '踢下线', icon: 'fa-user-slash', color: '#f97316', class: 'log-warn' },
    ws_400: { label: '登录失效', icon: 'fa-unlink', color: '#dc2626', class: 'log-error' },
    delete_user: { label: '删除用户', icon: 'fa-user-times', color: '#dc2626', class: 'log-error' },
    start: { label: '启动', icon: 'fa-play', color: '#22c55e', class: 'log-success' },
    stop: { label: '停止', icon: 'fa-stop', color: '#f59e0b', class: 'log-warn' },
};

function buildAccountLogRowHtml(l) {
    const config = ACCOUNT_LOG_CONFIG[l.action] || { 
        label: l.action || '操作', 
        icon: 'fa-circle', 
        color: '#6b7280',
        class: ''
    };
    const timeStr = ((l.time || '').split(' ')[1] || (l.time || ''));
    const reason = l.reason ? `<span class="log-reason">原因: ${escapeHtml(String(l.reason))}</span>` : '';
    const accountName = l.accountName ? `<span class="log-account">${escapeHtml(l.accountName)}</span>` : '';
    
    return `<div class="log-row ${config.class}">
        <span class="log-time">${escapeHtml(timeStr)}</span>
        <span class="log-action" style="--action-color: ${config.color}">
            <i class="fas ${config.icon}"></i>${config.label}
        </span>
        ${accountName}
        <span class="log-msg">${escapeHtml(l.msg || '')}</span>
        ${reason}
    </div>`;
}

async function pollAccountLogs() {
    return runDedupedRequest('pollAccountLogs', async () => {
        const wrap = $('account-logs-list');
        if (!wrap) return;
        
        // 构建查询参数
        const params = new URLSearchParams();
        params.set('limit', '100');
        if (accountLogFilterId && accountLogFilterId !== 'all') {
            params.set('accountId', accountLogFilterId);
        }
        
        const list = await api(`/api/account-logs?${params.toString()}`);
        const normalized = Array.isArray(list) ? list : [];
        if (!normalized.length) {
            lastAccountLogsRenderKey = '';
            wrap.innerHTML = '<div class="log-empty">暂无账号日志</div>';
            return;
        }
        const renderKey = JSON.stringify(normalized.map(l => [l.time, l.action, l.msg, l.reason || '']));
        if (renderKey === lastAccountLogsRenderKey) return;
        lastAccountLogsRenderKey = renderKey;
        wrap.innerHTML = normalized.slice().reverse().map(buildAccountLogRowHtml).join('');
    });
}

window.startAccount = async (id) => {
    await api(`/api/accounts/${id}/start`, 'POST');
    loadAccounts();
    pollAccountLogs();
    setTimeout(loadAccounts, 1000);
};

window.stopAccount = async (id) => {
    await api(`/api/accounts/${id}/stop`, 'POST');
    loadAccounts();
    pollAccountLogs();
    setTimeout(loadAccounts, 1000);
};

// 模态框逻辑
const modal = $('modal-add-acc');
