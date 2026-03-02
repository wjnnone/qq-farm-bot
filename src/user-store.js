const fs = require('fs');
const { getDataFile, ensureDataDir } = require('./runtime-paths');
const crypto = require('crypto');

const USERS_FILE = getDataFile('users.json');
const CARDS_FILE = getDataFile('cards.json');

const hashPassword = (password) => {
    return crypto.createHash('sha256').update(password).digest('hex');
};

const generateCardCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 16; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

let users = [];
let cards = [];

function loadUsers() {
    ensureDataDir();
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            users = Array.isArray(data.users) ? data.users : [];
        } else {
            users = [];
            saveUsers();
        }
    } catch (e) {
        console.error('加载用户数据失败:', e.message);
        users = [];
    }
}

function saveUsers() {
    ensureDataDir();
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2), 'utf8');
    } catch (e) {
        console.error('保存用户数据失败:', e.message);
    }
}

function loadCards() {
    ensureDataDir();
    try {
        if (fs.existsSync(CARDS_FILE)) {
            const data = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
            cards = Array.isArray(data.cards) ? data.cards : [];
        } else {
            cards = [];
            saveCards();
        }
    } catch (e) {
        console.error('加载卡密数据失败:', e.message);
        cards = [];
    }
}

function saveCards() {
    ensureDataDir();
    try {
        fs.writeFileSync(CARDS_FILE, JSON.stringify({ cards }, null, 2), 'utf8');
    } catch (e) {
        console.error('保存卡密数据失败:', e.message);
    }
}

function initDefaultAdmin() {
    loadUsers();
    const adminExists = users.find(u => u.username === 'admin');
    if (!adminExists) {
        const defaultPassword = 'admin';
        users.push({
            username: 'admin',
            password: hashPassword(defaultPassword),
            plainPassword: defaultPassword,
            role: 'admin',
            createdAt: Date.now()
        });
        saveUsers();
        console.log('[用户系统] 已创建默认管理员账号: admin / admin');
    }
}

function validateUser(username, password) {
    loadUsers();
    const user = users.find(u => u.username === username);
    if (!user) return null;
    if (user.password !== hashPassword(password)) return null;
    
    console.log('[验证用户]', username, '- Card状态:', user.card ? JSON.stringify(user.card) : '无卡密');
    
    return {
        username: user.username,
        role: user.role,
        cardCode: user.cardCode || null,
        card: user.card || null
    };
}

function registerUser(username, password, cardCode) {
    loadUsers();
    loadCards();
    
    if (users.find(u => u.username === username)) {
        return { ok: false, error: '用户名已存在' };
    }
    
    const card = cards.find(c => c.code === cardCode);
    if (!card) {
        return { ok: false, error: '卡密不存在' };
    }
    
    if (!card.enabled) {
        return { ok: false, error: '卡密已被禁用' };
    }
    
    if (card.usedBy) {
        return { ok: false, error: '卡密已被使用' };
    }
    
    const now = Date.now();
    const expiresAt = card.type === 'F' ? null : (now + card.days * 24 * 60 * 60 * 1000);
    
    const newUser = {
        username,
        password: hashPassword(password),
        plainPassword: password,
        role: 'user',
        cardCode,
        card: {
            code: card.code,
            description: card.description,
            type: card.type,
            typeChar: card.typeChar,
            days: card.days,
            expiresAt,
            enabled: true
        },
        createdAt: now
    };
    
    users.push(newUser);
    card.usedBy = username;
    card.usedAt = now;
    
    saveUsers();
    saveCards();
    
    return { ok: true, user: { username: newUser.username, role: newUser.role, card: newUser.card } };
}

function renewUser(username, cardCode) {
    loadUsers();
    loadCards();

    const user = users.find(u => u.username === username);
    if (!user) {
        return { ok: false, error: '用户不存在' };
    }

    const card = cards.find(c => c.code === cardCode);
    if (!card) {
        return { ok: false, error: '卡密不存在' };
    }

    if (!card.enabled) {
        return { ok: false, error: '卡密已被禁用' };
    }

    // ✅ 新增：检查卡密是否已被使用
    if (card.usedBy) {
        return { ok: false, error: '卡密已被使用' };
    }

    const now = Date.now();
    const currentExpires = user.card?.expiresAt || 0;
    const newExpires = card.type === 'F' ? null : (now + card.days * 24 * 60 * 60 * 1000);

    if (currentExpires && currentExpires > now && newExpires) {
        user.card.expiresAt = currentExpires + (newExpires - now);
    } else {
        user.card.expiresAt = newExpires;
    }

    user.card.code = card.code;
    user.card.description = card.description;
    user.card.type = card.type;
    user.card.typeChar = card.typeChar;
    user.card.days = card.days;

    // ✅ 新增：标记卡密为已使用
    card.usedBy = username;
    card.usedAt = Date.now();

    saveUsers();
    saveCards(); // ✅ 确保保存修改

    return { ok: true, card: user.card };
}

function getAllUsers() {
    loadUsers();
    return users.map(u => ({
        username: u.username,
        role: u.role,
        card: u.card
    }));
}

function getAllUsersWithPassword() {
    loadUsers();
    return users.map(u => ({
        username: u.username,
        password: u.plainPassword || '',
        role: u.role,
        card: u.card
    }));
}

function updateUser(username, updates) {
    loadUsers();
    const user = users.find(u => u.username === username);
    if (!user) return null;
    
    console.log('[更新用户] 用户名:', username, '更新内容:', updates);
    console.log('[更新前] 用户状态:', JSON.stringify(user.card));
    
    if (updates.expiresAt !== undefined) {
        if (!user.card) user.card = {};
        user.card.expiresAt = updates.expiresAt;
    }
    
    if (updates.enabled !== undefined) {
        if (!user.card) user.card = {};
        user.card.enabled = updates.enabled;
    }
    
    console.log('[更新后] 用户状态:', JSON.stringify(user.card));
    
    saveUsers();
    console.log('[保存完成] 用户状态已保存到文件');
    
    return { username: user.username, role: user.role, card: user.card };
}

function getAllCards() {
    loadCards();
    return cards;
}

function createCard(description, type, days) {
    loadCards();
    
    const typeCharMap = { D: 'D', W: 'W', M: 'M', F: 'F' };
    const typeChar = typeCharMap[type] || type;
    
    const newCard = {
        code: generateCardCode(),
        description,
        type,
        typeChar,
        days: parseInt(days, 10) || 30,
        enabled: true,
        usedBy: null,
        usedAt: null,
        createdAt: Date.now()
    };
    
    cards.push(newCard);
    saveCards();
    
    return newCard;
}

function updateCard(code, updates) {
    loadCards();
    const card = cards.find(c => c.code === code);
    if (!card) return null;
    
    if (updates.description !== undefined) {
        card.description = updates.description;
    }
    
    if (updates.enabled !== undefined) {
        card.enabled = updates.enabled;
    }
    
    saveCards();
    return card;
}

function deleteCard(code) {
    loadCards();
    const idx = cards.findIndex(c => c.code === code);
    if (idx === -1) return false;
    
    cards.splice(idx, 1);
    saveCards();
    return true;
}

function deleteUser(username) {
    loadUsers();
    const idx = users.findIndex(u => u.username === username);
    if (idx === -1) return { ok: false, error: '用户不存在' };
    
    // 不允许删除管理员账号
    if (users[idx].role === 'admin') {
        return { ok: false, error: '不能删除管理员账号' };
    }
    
    users.splice(idx, 1);
    saveUsers();
    return { ok: true };
}

function changePassword(username, oldPassword, newPassword) {
    loadUsers();
    const user = users.find(u => u.username === username);
    if (!user) {
        return { ok: false, error: '用户不存在' };
    }
    
    // 验证旧密码
    if (user.password !== hashPassword(oldPassword)) {
        return { ok: false, error: '旧密码错误' };
    }
    
    // 更新密码
    user.password = hashPassword(newPassword);
    user.plainPassword = newPassword;
    saveUsers();
    
    return { ok: true };
}

initDefaultAdmin();

module.exports = {
    validateUser,
    registerUser,
    renewUser,
    getAllUsers,
    getAllUsersWithPassword,
    updateUser,
    getAllCards,
    createCard,
    updateCard,
    deleteCard,
    deleteUser,
    changePassword
};
