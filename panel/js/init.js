function updateUptimeDisplay() {
    if (lastSyncTimestamp > 0) {
        const elapsed = (Date.now() - lastSyncTimestamp) / 1000;
        const currentUptime = lastServerUptime + elapsed;
        const el = $('stat-uptime');
        if (el) el.textContent = fmtTime(currentUptime);
    }
}

function updateTime() {
    const now = new Date();
    const el = document.getElementById('sys-time');
    if (el) el.textContent = now.toLocaleTimeString();
}
setInterval(() => {
    updateTime();
    updateUptimeDisplay();
}, 1000);
updateTime();
lockHorizontalSwipeOnMobile();
applyFontScale();
window.addEventListener('resize', applyFontScale);
window.addEventListener('resize', syncOpsRowsMode);
updateTopbarAccount(null);
initTheme();
initPasswordToggles();

// 初始化
$('btn-refresh').addEventListener('click', () => { window.location.reload(); });

$('btn-theme').addEventListener('click', () => {
    const isLight = !document.body.classList.contains('light-theme');
    const mode = isLight ? 'light' : 'dark';
    applyTheme(mode);
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    if (isLoggedIn) {
        api('/api/settings/theme', 'POST', { theme: mode });
    }
});

const loginBtn = $('btn-login');
if (loginBtn) loginBtn.addEventListener('click', doLogin);
const loginInput = $('login-password');
const usernameInput = $('login-username');
if (loginInput) {
    loginInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doLogin();
    });
}
if (usernameInput) {
    usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doLogin();
    });
    // 恢复保存的用户名
    const savedUsername = localStorage.getItem('savedUsername');
    if (savedUsername) {
        usernameInput.value = savedUsername;
        const rememberCheckbox = $('remember-username');
        if (rememberCheckbox) rememberCheckbox.checked = true;
    }
}

const logsFilterSel = $('logs-account-filter');
if (logsFilterSel) {
    logsFilterSel.value = logFilterAccountId;
    const onAccountFilterChange = () => {
        logFilterAccountId = logsFilterSel.value || 'all';
        localStorage.setItem('logFilterAccountId', logFilterAccountId);
        pollLogs();
    };
    logsFilterSel.addEventListener('change', onAccountFilterChange);
    logsFilterSel.addEventListener('input', onAccountFilterChange);
    logsFilterSel.addEventListener('blur', onAccountFilterChange);
}

const logsModuleSel = $('logs-module-filter');
if (logsModuleSel) {
    logsModuleSel.value = logFilters.module;
    const onModuleFilterChange = () => {
        logFilters.module = logsModuleSel.value || '';
        localStorage.setItem('logFilterModule', logFilters.module);
        pollLogs();
    };
    logsModuleSel.addEventListener('change', onModuleFilterChange);
    logsModuleSel.addEventListener('input', onModuleFilterChange);
    logsModuleSel.addEventListener('blur', onModuleFilterChange);
}

const logsWarnSel = $('logs-warn-filter');
if (logsWarnSel) {
    logsWarnSel.value = logFilters.isWarn;
    const onWarnFilterChange = () => {
        logFilters.isWarn = logsWarnSel.value || '';
        localStorage.setItem('logFilterIsWarn', logFilters.isWarn);
        pollLogs();
    };
    logsWarnSel.addEventListener('change', onWarnFilterChange);
    logsWarnSel.addEventListener('input', onWarnFilterChange);
    logsWarnSel.addEventListener('blur', onWarnFilterChange);
}

const logsEventFilter = $('logs-event-filter');
if (logsEventFilter) {
    logsEventFilter.value = logFilters.event;
    const onEventFilterChange = () => {
        logFilters.event = String(logsEventFilter.value || '').trim();
        localStorage.setItem('logFilterEvent', logFilters.event);
        pollLogs();
    };
    logsEventFilter.addEventListener('change', onEventFilterChange);
    logsEventFilter.addEventListener('input', onEventFilterChange);
    logsEventFilter.addEventListener('blur', onEventFilterChange);
}

const logsKeywordInput = $('logs-keyword-filter');
if (logsKeywordInput) {
    logsKeywordInput.value = logFilters.keyword;
    let keywordTimer = null;
    const onKeywordChange = () => {
        const next = logsKeywordInput.value.trim();
        if (!next) {
            if (keywordTimer) clearTimeout(keywordTimer);
            logFilters.keyword = '';
            localStorage.setItem('logFilterKeyword', logFilters.keyword);
            pollLogs();
            return;
        }
        if (keywordTimer) clearTimeout(keywordTimer);
        keywordTimer = setTimeout(() => {
            logFilters.keyword = next;
            localStorage.setItem('logFilterKeyword', logFilters.keyword);
            pollLogs();
        }, 250);
    };
    logsKeywordInput.addEventListener('input', onKeywordChange);
    logsKeywordInput.addEventListener('search', onKeywordChange);
    logsKeywordInput.addEventListener('change', onKeywordChange);
}

const logsTimeFromInput = $('logs-time-from-filter');
if (logsTimeFromInput) {
    logsTimeFromInput.value = logFilters.timeFrom;
    const onTimeFromChange = () => {
        logFilters.timeFrom = logsTimeFromInput.value || '';
        localStorage.setItem('logFilterTimeFrom', logFilters.timeFrom);
        pollLogs();
    };
    logsTimeFromInput.addEventListener('change', onTimeFromChange);
    logsTimeFromInput.addEventListener('input', onTimeFromChange);
}

const logsTimeToInput = $('logs-time-to-filter');
if (logsTimeToInput) {
    logsTimeToInput.value = logFilters.timeTo;
    const onTimeToChange = () => {
        logFilters.timeTo = logsTimeToInput.value || '';
        localStorage.setItem('logFilterTimeTo', logFilters.timeTo);
        pollLogs();
    };
    logsTimeToInput.addEventListener('change', onTimeToChange);
    logsTimeToInput.addEventListener('input', onTimeToChange);
}

initLogFiltersUI();

// 登录标签切换
const loginTabBtns = document.querySelectorAll('[data-login-tab]');
loginTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.loginTab;
        loginTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        if (tab === 'login') {
            $('login-form').style.display = 'block';
            $('register-form').style.display = 'none';
        } else if (tab === 'register') {
            $('login-form').style.display = 'none';
            $('register-form').style.display = 'block';
        }
    });
});

// 注册功能
const registerBtn = $('btn-register');
if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
        const username = $('reg-username').value;
        const password = $('reg-password').value;
        const cardCode = $('reg-card').value;
        const errorEl = $('register-error');
        
        if (!username || !password || !cardCode) {
            if (errorEl) errorEl.textContent = '请填写完整信息';
            return;
        }
        
        try {
            const r = await fetch(API_ROOT + '/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, cardCode })
            });
            const j = await r.json();
            
            if (j && j.ok) {
                // 注册成功后自动登录
                $('login-username').value = username;
                $('login-password').value = password;
                await doLogin();
            } else {
                if (errorEl) errorEl.textContent = j.error || '注册失败';
            }
        } catch (e) {
            console.error('Register Error:', e);
            if (errorEl) errorEl.textContent = '注册失败，请检查网络连接';
        }
    });
}

// 退出登录按钮
const logoutBtn = $('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', doLogout);
}

// 续费按钮
const renewBtn = $('renew-btn');
if (renewBtn) {
    renewBtn.addEventListener('click', doRenew);
}

// 修改密码按钮
const changePasswordBtn = $('change-password-btn');
if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', () => {
        $('modal-change-password').classList.add('show');
        $('change-password-old').value = '';
        $('change-password-new').value = '';
        $('change-password-confirm').value = '';
        $('change-password-error').textContent = '';
    });
}

// 修改密码模态框
const btnSubmitChangePassword = $('btn-submit-change-password');
if (btnSubmitChangePassword) {
    btnSubmitChangePassword.addEventListener('click', async () => {
        const oldPassword = $('change-password-old').value;
        const newPassword = $('change-password-new').value;
        const confirmPassword = $('change-password-confirm').value;
        const errorEl = $('change-password-error');
        
        if (!oldPassword || !newPassword || !confirmPassword) {
            if (errorEl) errorEl.textContent = '请填写完整信息';
            return;
        }
        
        if (newPassword !== confirmPassword) {
            if (errorEl) errorEl.textContent = '两次输入的新密码不一致';
            return;
        }
        
        if (newPassword.length < 6) {
            if (errorEl) errorEl.textContent = '新密码长度不能少于6位';
            return;
        }
        
        try {
            const r = await fetch(API_ROOT + '/api/user/change-password', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ oldPassword, newPassword })
            });
            const j = await r.json();
            
            if (j && j.ok) {
                showAlert('成功', '密码修改成功！请使用新密码重新登录。');
                $('modal-change-password').classList.remove('show');
                // 修改密码成功后退出登录
                setTimeout(() => {
                    doLogout();
                }, 1500);
            } else {
                if (errorEl) errorEl.textContent = j.error || '修改密码失败';
            }
        } catch (e) {
            console.error('Change Password Error:', e);
            if (errorEl) errorEl.textContent = '修改密码失败，请检查网络连接';
        }
    });
}

const btnCancelChangePassword = $('btn-cancel-change-password');
if (btnCancelChangePassword) {
    btnCancelChangePassword.addEventListener('click', () => {
        $('modal-change-password').classList.remove('show');
    });
}

// 续费模态框
const btnSubmitRenew = $('btn-submit-renew');
if (btnSubmitRenew) {
    btnSubmitRenew.addEventListener('click', async () => {
        const cardCode = $('renew-card-code').value;
        const errorEl = $('renew-error');
        
        if (!cardCode) {
            if (errorEl) errorEl.textContent = '请输入卡密';
            return;
        }
        
        try {
            const r = await fetch(API_ROOT + '/api/user/renew', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken
                },
                body: JSON.stringify({ cardCode })
            });
            const j = await r.json();
            console.log(j);
            if (j && j.ok) {
                showAlert('成功', '续费成功！');
                $('modal-renew').classList.remove('show');
                if (currentUser && j.data) {
                    currentUser.card = j.data;
                }
                loadUserInfo();
            } else {
                if (errorEl) errorEl.textContent = j.error || '续费失败';
            }
        } catch (e) {
            console.error('Renew Error:', e);
            if (errorEl) errorEl.textContent = '续费失败，请检查网络连接';
        }
    });
}

const btnCancelRenew = $('btn-cancel-renew');
if (btnCancelRenew) {
    btnCancelRenew.addEventListener('click', () => {
        $('modal-renew').classList.remove('show');
    });
}

// 账号日志过滤器
const accountLogsFilter = $('account-logs-filter');
if (accountLogsFilter) {
    accountLogsFilter.value = accountLogFilterId;
    const onAccountLogsFilterChange = () => {
        accountLogFilterId = accountLogsFilter.value || 'all';
        localStorage.setItem('accountLogFilterId', accountLogFilterId);
        pollAccountLogs();
    };
    accountLogsFilter.addEventListener('change', onAccountLogsFilterChange);
    accountLogsFilter.addEventListener('input', onAccountLogsFilterChange);
}

checkLogin();
