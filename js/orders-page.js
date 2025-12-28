import { fetchOrders, fetchBonusHistory } from './services/api.js?v=FINAL_ORDERS_FIX_017';
import { getUserId } from './services/user-id.js';

document.addEventListener('DOMContentLoaded', async () => {
    // TG UI handled by visitor_tracker.js

    const userId = getUserId();
    console.log("Orders Page: User ID:", userId);

    // Make userId globally available or pass it to handler
    window.currentUserId = userId;

    await loadOrders(userId);
});

// GLOBAL HANDLER FOR HTML BUTTON
window.openBonusHistoryModal = async function () {
    const modal = document.getElementById('bonus-history-modal');
    const container = document.getElementById('bonus-history-container');
    const userId = window.currentUserId;

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

    container.innerHTML = '';

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


/**
 * Load and Render Orders
 */
async function loadOrders(userId) {
    // В my_orders.html ID контейнера 'orders-list', а в коде было 'orders-container'
    // Исправим на 'orders-list'
    const container = document.getElementById('orders-list') || document.getElementById('orders-container');
    if (!container) return;

    try {
        const orders = await fetchOrders(userId);

        if (Array.isArray(orders) && orders.length > 0) {
            renderOrders(orders, container);
        } else {
            container.innerHTML = `
                <div style="text-align: center; padding: 30px 10px;">
                    <p style="font-size: 2em; margin-bottom: 10px;">🕸️</p>
                    <p style="color: #aaa;">История заказов пуста.</p>
                    <a href="catalogue.html" style="display: inline-block; margin-top: 15px; padding: 10px 20px; background: rgba(138, 43, 226, 0.3); border: 1px solid rgba(138, 43, 226, 0.5); border-radius: 12px; color: #fff; text-decoration: none;">В Каталог</a>
                </div>
            `;
        }
    } catch (e) {
        console.error("Error loading orders:", e);
        container.innerHTML = `
            <div style="text-align: center; color: var(--neon-pink); padding: 20px;">
                <p>⚠️ Ошибка загрузки</p>
                <div style="font-size: 0.8em; color: gray; margin: 10px 0;">${e.message}</div>
                <button onclick="window.location.reload()" style="padding: 8px 16px; background: #333; border: 1px solid #666; color: white; border-radius: 8px; cursor: pointer;">Повторить</button>
            </div>
        `;
    }
}

function renderOrders(orders, container) {
    container.innerHTML = '';

    orders.forEach((order, index) => {
        const dateStr = order.Date || order.date;
        const total = order.Total || order.total;
        const status = order.Status || order.status || 'Новый';
        const items = order.Items || order.items;

        let itemsText = Array.isArray(items) ? items.join(', ') : items;
        if (itemsText.length > 60) itemsText = itemsText.substring(0, 57) + '...';

        const statusColor = getStatusColor(status);

        const card = document.createElement('div');
        card.className = 'order-card';
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-weight: bold; color: #fff;">Заказ #${orders.length - index}</span>
                <span style="font-size: 0.85em; color: #888;">${dateStr}</span>
            </div>
            <div style="font-size: 0.9em; color: #ccc; margin-bottom: 8px; line-height: 1.3;">
                ${itemsText}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
                <span style="font-weight: 600; color: #00ff88;">${total} ₽</span>
                <span style="font-size: 0.85em; color: ${statusColor}; border: 1px solid ${statusColor}; padding: 2px 8px; border-radius: 8px;">${status}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

function getStatusColor(status) {
    if (!status) return '#4fc3f7';
    const s = status.toLowerCase();
    if (s.includes('отменен') || s.includes('cancel')) return '#ff4081';
    if (s.includes('выполнен') || s.includes('done') || s.includes('доставлен')) return '#00e676';
    return '#4fc3f7';
}
