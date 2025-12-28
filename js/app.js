// js/app.js
import { fetchProducts } from './services/api.js';
import { setupFilters, applyFilters } from './utils/filters.js?v=FINAL_ORDERS_FIX_017';
import { showToast, showComingSoon, closeComingSoon } from './utils/ui.js';

// Expose modal functions to window for HTML onclick attributes (compatibility)
window.showComingSoon = showComingSoon;
window.closeComingSoon = closeComingSoon;

let allProducts = [];

export async function initApp() {
    const listContainer = document.getElementById('product-list');

    // Initialize Telegram Web App (UI handled by visitor_tracker.js)
    const tg = window.Telegram?.WebApp;
    if (tg) {
        // Just ensuring it's ready, logic is in tracker
    }

    if (!listContainer) return; // Not on catalog page

    // 1. Check Session Storage
    const preloadedData = sessionStorage.getItem('preload_catalog');
    if (preloadedData) {
        try {
            console.log("⚡ Loaded from cache");
            const products = JSON.parse(preloadedData);
            processAndRender(products);
            return;
        } catch (e) {
            sessionStorage.removeItem('preload_catalog');
        }
    }

    // 2. Fetch from API
    listContainer.innerHTML = '<p style="text-align:center; padding: 20px;">Загрузка товаров...</p>';

    try {
        const products = await fetchProducts();
        sessionStorage.setItem('preload_catalog', JSON.stringify(products));
        processAndRender(products);
    } catch (error) {
        listContainer.innerHTML = `<p style="color:red; text-align:center;">Ошибка загрузки: ${error.message}</p>`;
        showToast("Не удалось загрузить каталог", "error");
    }
}

function processAndRender(products) {
    if (!Array.isArray(products)) return;

    allProducts = products.map(p => ({
        ...p,
        id: Number(p.id), // Use system ID
        // product_id: Number(p.product_id), // REMOVED
        puffs: Number(p.puffs),
        price: Number(p.price),
        stock: Number(p.stock)
    }));

    renderProducts(allProducts);
    setupFilters(allProducts, renderProducts);
    // Note: We need to extract filter logic or pass render function. 
    // For simplicity, we can implement minimal filter logic here or in a separate utils/filters.js
    // Let's create `utils/filters.js` next to keep this clean.
}

export function renderProducts(products) {
    const listContainer = document.getElementById('product-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (products.length === 0) {
        listContainer.innerHTML = '<p class="no-results">Нет товаров.</p>';
        return;
    }

    // Optimization: Use DocumentFragment to batch DOM updates (1 reflow instead of N)
    const fragment = document.createDocumentFragment();

    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        // Use event delegation or simple bind (keep simple for now)
        card.onclick = () => window.location.href = `product_details.html?id=${product.id}`;

        const imgUrl = product.image_url ? product.image_url : 'img/vape_icon.png';

        // Optimization: loading="lazy" for images
        card.innerHTML = `
            <img src="${imgUrl}" class="product-image" loading="lazy" onerror="this.src='img/vape_icon.png'">
            <div class="product-info">
                <h3>${product.model_name}</h3>
                <p class="brand">${product.brand}</p>
                <p class="taste">${product.taste || ''}</p>
                <div class="details">
                    <span>💨 ${product.puffs}</span>
                    <span class="price">${product.price}</span>
                </div>
            </div>
        `;
        fragment.appendChild(card);
    });

    listContainer.appendChild(fragment);
}
