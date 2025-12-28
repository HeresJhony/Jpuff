import { getUserId, getActivePromoCode } from './services/user-id.js';
import { fetchClientData, fetchOrders, fetchDiscountInfo } from './services/api.js';
import { loadModal } from './services/modal-loader.js';

// Storage keys
const CUSTOM_NAME_KEY = 'juicy_custom_name';
const CUSTOM_AVATAR_KEY = 'juicy_custom_avatar';

// State
let loadedPromoInfo = null;

loadModal('promo');

document.addEventListener('DOMContentLoaded', async () => {
    // TG UI handled by visitor_tracker.js

    const userId = getUserId();
    console.log("Profile: User ID:", userId);

    initUserProfile();

    // Dynamic Promo Load
    const activeCode = getActivePromoCode();
    if (activeCode) {
        console.log("Profile: Loading promo info for", activeCode);
        const info = await fetchDiscountInfo(activeCode);
        if (info && info.found && info.active) {
            loadedPromoInfo = info;
        }
    }

    // Optimization: Fire and forget to not block UI
    loadBonusPoints(userId);

});

// ... (initUserProfile remains same) ...

/**
 * Load and Display Bonus Points (Server)
 */
async function loadBonusPoints(userId) {
    const bonusElement = document.getElementById('bonus-amount');
    if (!bonusElement) return;

    // 1. UX OPTIMIZATION: Show Cache Immediately
    const BONUS_KEY = 'juicy_bonus_' + userId;
    const cached = localStorage.getItem(BONUS_KEY);
    if (cached) {
        bonusElement.textContent = cached;
        // Visual hint that it might update (optional, skipping to keep clean)
    } else {
        // Only show loader if no cache
        if (bonusElement.textContent === '0' || bonusElement.textContent === '') {
            bonusElement.textContent = '...';
        }
    }

    try {
        const data = await fetchClientData(userId);

        let displayBonus = 0;
        if (data && typeof data.bonus_balance !== 'undefined') {
            displayBonus = data.bonus_balance;
        }

        // ОБЯЗАТЕЛЬНО: Сначала обновляем localStorage, потом UI
        localStorage.setItem(BONUS_KEY, String(displayBonus));
        bonusElement.textContent = displayBonus;

        console.log("Баланс синхронизирован с БД:", displayBonus);

    } catch (e) {
        console.error("Failed to load profile bonuses", e);
        // If query failed and we didn't have cache shown (unlikely), show 0
        if (!cached) bonusElement.textContent = '0';
    }
}

/**
 * Refresh bonus balance (manual trigger)
 */
window.refreshBonuses = async function () {
    const btn = document.querySelector('.bonus-refresh-btn');
    if (btn) btn.style.transform = 'rotate(360deg)';

    const userId = getUserId();
    await loadBonusPoints(userId);

    // Show visual feedback
    const bonusElement = document.getElementById('bonus-amount');
    if (bonusElement) {
        bonusElement.style.color = '#00ff88';
        setTimeout(() => {
            bonusElement.style.color = '';
            if (btn) btn.style.transform = '';
        }, 500);
    }
}

/**
 * Initialize User Profile (Avatar & Name)
 */
function initUserProfile() {
    const avatarImg = document.getElementById('profile-avatar');
    const nameDisplay = document.getElementById('profile-name');

    // Get Telegram User Data Safely
    const tg = window.Telegram?.WebApp;
    const tgUser = tg?.initDataUnsafe?.user;

    // Avatar
    let avatarUrl = localStorage.getItem(CUSTOM_AVATAR_KEY);
    if (!avatarUrl && tgUser?.photo_url) {
        avatarUrl = tgUser.photo_url;
    }
    if (avatarUrl) {
        avatarImg.src = avatarUrl;
    } else {
        avatarImg.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + getUserId();
    }

    // Name
    let userName = localStorage.getItem(CUSTOM_NAME_KEY);
    if (!userName && tgUser) {
        userName = tgUser.first_name || '';
        if (tgUser.last_name) {
            userName += ' ' + tgUser.last_name;
        }
        userName = userName.trim() || 'Гость';
    }
    if (!userName) userName = 'Гость';

    nameDisplay.textContent = userName;

    // DEBUG: Show User ID
    let idDisplay = document.getElementById('profile-user-id-debug');
    if (!idDisplay) {
        idDisplay = document.createElement('div');
        idDisplay.id = 'profile-user-id-debug';
        idDisplay.style.cssText = 'color: #555; font-size: 0.7em; margin-top: 5px; cursor: pointer; text-align: center;';
        idDisplay.title = 'Нажмите чтобы скопировать и обновить';
        idDisplay.onclick = async () => {
            const uid = getUserId();
            try {
                await navigator.clipboard.writeText(uid);
                showToast('ID скопирован');
            } catch (e) {
                // fallback
                const t = document.createElement("textarea");
                t.value = uid;
                document.body.appendChild(t);
                t.select();
                document.execCommand("copy");
                t.remove();
                showToast('ID скопирован');
            }
            if (window.refreshBonuses) window.refreshBonuses();
        };
        nameDisplay.parentElement.appendChild(idDisplay);
    }
    idDisplay.textContent = `ID: ${getUserId()}`;

    // Expose edit functions
    window.editName = () => {
        const nameInput = document.getElementById('profile-name-input');
        const nameField = document.getElementById('name-edit-field');
        nameDisplay.style.display = 'none';
        nameInput.style.display = 'flex';
        nameField.value = nameDisplay.textContent;
        nameField.focus();
    };

    window.saveName = () => {
        const nameField = document.getElementById('name-edit-field');
        const newName = nameField.value.trim();
        if (newName) {
            localStorage.setItem(CUSTOM_NAME_KEY, newName);
            nameDisplay.textContent = newName;
            showToast('✅ Имя обновлено!');
        }
        document.getElementById('profile-name-input').style.display = 'none';
        nameDisplay.style.display = 'inline-block';
    };

    window.editAvatar = () => {
        document.getElementById('avatar-upload-input').click();
    };

    window.handleAvatarUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showToast('⚠️ Выберите изображение');
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            showToast('⚠️ Файл слишком большой (макс. 2МБ)');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            localStorage.setItem(CUSTOM_AVATAR_KEY, dataUrl);
            avatarImg.src = dataUrl;
            showToast('✅ Аватар обновлен!');
        };
        reader.readAsDataURL(file);
    };
}



/**
 * Close Promo Modal
 */
window.closePromoModal = function (event) {
    const modal = document.getElementById('promo-modal');
    if (modal) modal.classList.remove('active');
};

/**
 * Show Promo Modal
 */
window.showPromoModal = async function () {
    const modal = document.getElementById('promo-modal');
    const list = document.getElementById('promo-list');
    if (!modal || !list) return;

    modal.classList.add('active'); // Use CSS class for animation
    list.innerHTML = '<p style="color: #aaa; text-align: center;">Загрузка акций...</p>';

    const userId = getUserId();
    const promos = [];

    // 1. Check New Client Discount
    let isNewUser = true; // Default to TRUE (innocent until proven guilty is better for UX, or check cache)

    // Check cache first for immediate feedback
    const cached = sessionStorage.getItem('is_new_user_cached');
    if (cached !== null) isNewUser = (cached === 'true');

    try {
        // Fetch fresh status
        const history = await fetchOrders(userId);

        if (Array.isArray(history)) {
            let discountUsedBefore = false;

            if (history.length > 0) {
                for (const order of history) {
                    // Ignore cancelled orders
                    const status = (order.status || '').toLowerCase();
                    if (status.includes('cancel') || status.includes('отмен')) continue;

                    const discountVal = Number(order.new_user_discount || 0);
                    const itemsStr = JSON.stringify(order.items || order.Items || []);

                    if ((discountVal > 0) || (order.promo_code === 'new_client_10') || (itemsStr.includes('Скидка Нового Клиента'))) {
                        discountUsedBefore = true;
                        break;
                    }
                }
            }
            isNewUser = !discountUsedBefore;
            sessionStorage.setItem('is_new_user_cached', String(isNewUser));
        }
    } catch (e) {
        console.error("Promo check error, using cache/default", e);
    }

    // ALWAYS PUSH THE PROMO CARD
    promos.push({
        icon: '🔥',
        title: 'Скидка Нового Клиента',
        desc: 'Скидка 10% на первый заказ.',
        status: isNewUser ? 'Активна' : 'Использован',
        statusColor: isNewUser ? '#00ff88' : '#ff4444'
    });

    // 2. Bonus Program
    promos.push({
        icon: '💎',
        title: 'Бонусная Программа',
        desc: 'Кэшбэк 2% со всех покупок.',
        status: 'Активна',
        statusColor: '#00ff88'
    });

    // 3. Dynamic Discount (from DB or LocalStorage)
    const activeCode = getActivePromoCode();
    if (activeCode) {
        // If we have loaded dynamic info from server
        if (loadedPromoInfo && loadedPromoInfo.code === activeCode) {
            const label = loadedPromoInfo.label || activeCode;
            const desc = loadedPromoInfo.description || "Секретная скидка";
            let valStr = "";
            if (loadedPromoInfo.type === 'percent') valStr = ` (-${loadedPromoInfo.value}%)`;
            else valStr = ` (-${loadedPromoInfo.value}₽)`;

            promos.push({
                icon: loadedPromoInfo.icon || '🎟️',
                title: label + valStr,
                desc: desc,
                status: 'АКТИВНА',
                statusColor: '#ff00ff'
            });
        }
        // Fallback or Unknown (Hardcoded TRAVELER just in case)
        else if (activeCode === 'TRAVELER') {
            promos.push({
                icon: '🎒',
                title: 'Путник - скидка 10%',
                desc: 'Секретная скидка 10% на один заказ.',
                status: 'АКТИВНА',
                statusColor: '#ff00ff'
            });
        }
        // Fallback for custom code not yet loaded
        else {
            promos.push({
                icon: '🎟️',
                title: `Промокод: ${activeCode}`,
                desc: 'Скидка активирована.',
                status: 'АКТИВНА',
                statusColor: '#ff00ff'
            });
        }
    }

    // Render
    list.innerHTML = promos.map(p => `
        <div style="background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 15px; margin-bottom: 10px; display: flex; align-items: flex-start; text-align: left; position: relative; overflow: hidden;">
            <div style="font-size: 1.5em; margin-right: 15px;">${p.icon}</div>
            <div style="flex: 1;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px;">
                    <div style="color: #fff; font-weight: bold;">${p.title}</div>
                    <div style="
                        font-size: 0.75em; 
                        padding: 4px 8px; 
                        border-radius: 6px; 
                        background: rgba(0,0,0,0.3); 
                        border: 1px solid ${p.statusColor}; 
                        color: ${p.statusColor};
                        font-weight: bold;
                        text-transform: uppercase;">
                        ${p.status}
                    </div>
                </div>
                <div style="color: #aaa; font-size: 0.9em; line-height: 1.3;">${p.desc}</div>
            </div>
        </div>
    `).join('');
}

function showToast(message) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.style.cssText = `
    position: fixed; bottom: 80px; left: 50 %; transform: translateX(-50 %);
    background: rgba(0, 0, 0, 0.9); color: white; padding: 12px 24px;
    border - radius: 20px; z - index: 1000; font - size: 0.95em;
    opacity: 0; transition: opacity 0.3s; pointer - events: none;
    box - shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    `;
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 2500);
}
