import { getUserId } from './services/user-id.js';
import { fetchClientData, fetchBonusHistory, fetchReferralStats } from './services/api.js';
import { loadModal } from './services/modal-loader.js';

// Preload modals
loadModal('bonus_history');
loadModal('qr');

// Expose functions globally for HTML interactions
// JuicyPoint Telegram Bot
const BOT_USERNAME = 'Jpuffbot';
const REFERRAL_BASE_URL = `https://t.me/${BOT_USERNAME}/juicy?startapp=`;

document.addEventListener('DOMContentLoaded', async () => {
    // TG UI handled by visitor_tracker.js

    const userId = getUserId();
    console.log("Referral Page: User ID:", userId);

    // Globally accessible for the button onclick
    window.currentUserId = userId;

    initReferralSection(userId);

    // FETCH STATS (BUT NOT HISTORY YET)
    await loadReferralStats(userId);
});

// --- NEW MODAL LOGIC ---
window.openBonusHistoryModal = async function () {
    const modal = document.getElementById('bonus-history-modal');
    const container = document.getElementById('bonus-history-container');
    const userId = window.currentUserId || getUserId();

    if (modal) modal.style.display = 'flex';

    if (container) {
        container.innerHTML = '<p style="text-align: center; padding: 20px;">Загрузка...</p>';
        const history = await fetchBonusHistory(userId);
        renderBonusHistory(history, container);
    }
}

function renderBonusHistory(history, container) {
    if (!history || history.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px; color: #888;">Истории пока нет</p>';
        return;
    }

    container.innerHTML = ''; // Clear

    history.forEach(tx => {
        const item = document.createElement('div');
        item.style.cssText = `
            display: flex; 
            justify-content: space-between; 
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            font-size: 0.95em;
        `;

        const isPositive = tx.amount > 0;
        const sign = isPositive ? '+' : '';
        const color = isPositive ? '#00ff88' : '#ff4444';

        const date = new Date(tx.created_at).toLocaleDateString('ru-RU', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
        });

        item.innerHTML = `
            <div style="display: flex; flex-direction: column;">
                <span style="color: #fff; font-weight: 500;">${tx.description || 'Транзакция'}</span>
                <span style="color: #888; font-size: 0.8em; margin-top: 4px;">${date}</span>
            </div>
            <div style="font-weight: bold; color: ${color}; font-size: 1.1em;">
                ${sign}${Math.abs(tx.amount)}
            </div>
        `;
        container.appendChild(item);
    });
}
// -----------------------

/**
 * Generate QR code URL from referral link
 */
function getQrCodeUrl(referralLink, size = 300) {
    const encoded = encodeURIComponent(referralLink);
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&color=000000&bgcolor=ffffff`;
}

/**
 * Initialize QR Code and Referral Link
 */
function initReferralSection(userId) {
    const qrImage = document.getElementById('user-qr-code');
    const linkBox = document.getElementById('referral-link-box');

    // Create full referral link
    const refLink = `${REFERRAL_BASE_URL}${userId}`;
    const qrUrl = getQrCodeUrl(refLink, 300);

    if (qrImage) {
        qrImage.src = qrUrl;
        qrImage.onerror = () => { qrImage.alt = "QR недоступен"; };
    }

    const qrWrapper = document.querySelector('.qr-wrapper');
    if (qrWrapper) {
        qrWrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            openQrModal(qrUrl);
        });
    }

    if (linkBox) {
        linkBox.textContent = refLink;
    }

    window.copyReferralLink = async () => {
        try {
            await navigator.clipboard.writeText(refLink);
            showToast('✅ Ссылка скопирована!');
            trackLinkShare(userId);

            linkBox.style.color = '#fff'; linkBox.style.borderColor = '#00ff88';
            setTimeout(() => { linkBox.style.color = ''; linkBox.style.borderColor = ''; }, 500);
        } catch (err) {
            const textArea = document.createElement("textarea");
            textArea.value = refLink;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("Copy");
            textArea.remove();
            showToast('✅ Ссылка скопирована!');
            trackLinkShare(userId);
        }
    };

    window.shareNative = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Juicy Puff',
                    text: 'Присоединяйся к Juicy Puff! Вот моя реферальная ссылка:',
                    url: refLink,
                });
                trackLinkShare(userId);
            } catch (err) { console.log('Share cancelled or failed:', err); }
        } else {
            window.copyReferralLink();
            showToast('⚠️ Шаринг не поддерживается, ссылка скопирована.');
        }
    };
}

function showToast(message) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.style.cssText = `
            position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.9); color: white; padding: 12px 24px;
            border-radius: 20px; z-index: 1000; font-size: 0.95em;
            opacity: 0; transition: opacity 0.3s; pointer-events: none;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

function openQrModal(qrUrl) {
    const modal = document.getElementById('qr-modal');
    const modalImage = document.getElementById('qr-modal-image');
    if (modal && modalImage) {
        modalImage.src = qrUrl;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

window.closeQrModal = function () {
    const modal = document.getElementById('qr-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function trackLinkShare(userId) {
    const STATS_KEY = `juicy_referral_stats_${userId}`;
    let stats = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
    stats.linkClicks = (stats.linkClicks || 0) + 1;
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

async function loadReferralStats(userId) {
    const earnedEl = document.getElementById('earned-bonuses');
    const totalEl = document.getElementById('total-referrals');
    const activeEl = document.getElementById('active-referrals');

    // 1. СРАЗУ показываем из кэша (чтобы не ждать)
    const BONUS_KEY = 'juicy_bonus_' + userId;
    const cachedBonus = localStorage.getItem(BONUS_KEY);
    if (earnedEl && cachedBonus !== null) {
        earnedEl.textContent = cachedBonus;
    }

    try {
        // 2. Запрашиваем свежие данные с сервера (параллельно)
        const [clientData, statsData] = await Promise.all([
            fetchClientData(userId),
            fetchReferralStats(userId)
        ]);

        // 3. Обновляем цифру баланса и кэш
        if (earnedEl) {
            const freshBonus = clientData.bonus_balance || 0;
            earnedEl.textContent = freshBonus;
            localStorage.setItem(BONUS_KEY, freshBonus);
        }

        // 4. Обновляем статистику рефералов И кликов
        if (totalEl) totalEl.textContent = statsData.total || 0;
        if (activeEl) activeEl.textContent = statsData.active || 0;

        // Use server clicks
        const clicksEl = document.getElementById('link-clicks');
        if (clicksEl) {
            clicksEl.textContent = statsData.clicks || 0;
        }

        // We no longer use loadLocalClicks(userId);
    } catch (e) {
        console.error("Stats load failed", e);
    }
}

// Old function kept for safety but unused

