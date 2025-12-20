// js/utils/ui.js

/**
 * Show a toast notification
 * @param {string} message 
 * @param {'success'|'error'|'info'} type 
 */
export function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            flex-direction: column;
            gap: 10px;
            z-index: 10000;
        `;
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.textContent = message;

    let bgColor = '#333';
    if (type === 'success') bgColor = '#4CAF50';
    if (type === 'error') bgColor = '#F44336';
    if (type === 'info') bgColor = '#2196F3';

    toast.style.cssText = `
        background-color: ${bgColor};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.3s ease;
        font-family: Arial, sans-serif;
        font-size: 14px;
        min-width: 250px;
        text-align: center;
    `;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    // Remove after 3s
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

/**
 * Show the "Coming Soon" modal
 */
export function showComingSoon() {
    let modal = document.getElementById('coming-soon-modal');
    if (!modal) {
        // Create modal if it doesn't exist (fallback)
        modal = document.createElement('div');
        modal.id = 'coming-soon-modal';
        modal.className = 'modal';
        modal.innerHTML = `
          <div class="modal-content">
            <span class="close-button">&times;</span>
            <h2>В разработке 🛠️</h2>
            <p>Этот раздел скоро появится! Следите за обновлениями.</p>
            <button class="close-modal-btn">Закрыть</button>
          </div>
        `;
        document.body.appendChild(modal);

        const close = () => modal.style.display = 'none';
        modal.querySelector('.close-button').onclick = close;
        modal.querySelector('.close-modal-btn').onclick = close;
    }
    modal.style.display = "flex";
}

/**
 * Close the "Coming Soon" modal
 */
export function closeComingSoon() {
    const modal = document.getElementById('coming-soon-modal');
    if (modal) modal.style.display = "none";
}

/**
 * Format number as currency (RUB)
 * @param {number} value 
 * @returns {string}
 */
export function formatCurrency(value) {
    return `${Number(value).toLocaleString('ru-RU')} ₽`;
}
