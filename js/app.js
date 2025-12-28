// js/app.js
import { fetchProducts, checkStock } from './services/api.js';
import { setupFilters, applyFilters } from './utils/filters.js?v=FINAL_ORDERS_FIX_017';
import { showToast, showComingSoon, closeComingSoon } from './utils/ui.js';
import { addToCart } from './cart.js';

// Expose modal functions to window for HTML onclick attributes (compatibility)
window.showComingSoon = showComingSoon;
window.closeComingSoon = closeComingSoon;

let allProducts = [];
let currentModalProduct = null;
let currentModalQty = 1;

export async function initApp() {
    const listContainer = document.getElementById('product-list');

    // Create Modal DOM if not exists
    createModalDOM();

    // Initialize Telegram Web App (UI handled by visitor_tracker.js)
    const tg = window.Telegram?.WebApp;
    if (tg) {
        // Just ensuring it's ready, logic is in tracker
    }

    if (!listContainer) return; // Not on catalog page

    // 1. ALWAYS Fetch from API (No Cache)
    // sessionStorage.removeItem('preload_catalog_v2'); // Clean up old cache if exists

    listContainer.innerHTML = '<div class="loading-spinner"></div><p style="text-align:center; color: #888;">Сверка со складом...</p>';

    try {
        const products = await fetchProducts();
        // sessionStorage.setItem('preload_catalog_v2', JSON.stringify(products)); // DISABLED CACHE
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
    })).filter(p => p.stock > 0); // Double check: filter out of stock items on client side

    renderProducts(allProducts);
    setupFilters(allProducts, renderProducts);
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
        // Open Modal instead of navigation
        card.onclick = () => openProductModal(product);

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
                    <span class="price">${product.price} ₽</span>
                </div>
            </div>
        `;
        fragment.appendChild(card);
    });

    listContainer.appendChild(fragment);
}

// --- MODAL LOGIC ---

function createModalDOM() {
    // Force remove old modal if exists to apply new structure
    const existing = document.getElementById('product-modal-overlay');
    if (existing) existing.remove();

    const modalHTML = `
        <div id="product-modal-overlay" class="modal-overlay" onclick="closeProductModal(event)">
            <div class="product-modal" onclick="event.stopPropagation()">
                <div class="modal-shine"></div>
                <div class="modal-scroll-container">
                    <button class="modal-close" onclick="closeProductModal()">×</button>
                    
                    <img id="modal-img" class="modal-img" src="" alt="Product" />
                    
                    <h3 id="modal-title" class="modal-title">Product Name</h3>
                    
                    <div class="modal-info-grid">
                        <div class="modal-details-row">
                            <span>Вкус:</span>
                            <span id="modal-taste" style="color: var(--neon-purple);">Taste</span>
                        </div>
                        <div class="modal-details-row">
                            <span>Затяжек:</span>
                            <span id="modal-puffs">5000</span>
                        </div>
                        <div class="modal-details-row">
                            <span>В наличии:</span>
                            <span id="modal-stock">10 шт.</span>
                        </div>
                    </div>
                    
                    <div id="modal-price" class="modal-price">1000 ₽</div>
                    
                    <div class="modal-actions">
                        <div class="modal-qty">
                            <button onclick="changeModalQty(-1)">–</button>
                            <span id="modal-qty-val">1</span>
                            <button onclick="changeModalQty(1)">+</button>
                        </div>
                        <button id="modal-add-btn" class="modal-add-btn" onclick="addModalToCart()">В КОРЗИНУ</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Expose functions to global scope for HTML onclick
    window.closeProductModal = closeProductModal;
    window.changeModalQty = changeModalQty;
    window.addModalToCart = addModalToCart;
}

async function openProductModal(product) {
    currentModalProduct = product;
    currentModalQty = 1;

    const overlay = document.getElementById('product-modal-overlay');
    const img = document.getElementById('modal-img');
    const title = document.getElementById('modal-title');
    const taste = document.getElementById('modal-taste');
    const puffs = document.getElementById('modal-puffs');
    const stock = document.getElementById('modal-stock');
    const price = document.getElementById('modal-price');
    const qtyVal = document.getElementById('modal-qty-val');
    const addBtn = document.getElementById('modal-add-btn');

    if (!overlay) return;

    img.src = product.image_url || 'img/vape_icon.png';
    title.textContent = `${product.brand} - ${product.model_name}`;
    taste.textContent = product.taste || '';
    puffs.textContent = product.puffs || '—';
    stock.textContent = `${product.stock} шт.`;
    price.textContent = `${product.price} ₽`;
    qtyVal.textContent = '1';

    // Disable if stock is 0 (though filter should prevent this)
    if (product.stock <= 0) {
        addBtn.disabled = true;
        addBtn.textContent = 'Нет в наличии';
        stock.style.color = 'red';
    } else {
        addBtn.disabled = false;
        addBtn.textContent = 'В КОРЗИНУ';
        stock.style.color = 'white';
    }

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevent scrolling

    // LIVE STOCK CHECK (Background Update)
    try {
        const liveStock = await checkStock(product.id);

        // Ensure modal is still open for THIS product
        if (currentModalProduct && currentModalProduct.id === product.id && document.getElementById('product-modal-overlay').classList.contains('active')) {
            const stockEl = document.getElementById('modal-stock');
            const btn = document.getElementById('modal-add-btn');

            if (liveStock !== product.stock) {
                console.log(`Live stock update: ${product.stock} -> ${liveStock}`);
                stockEl.textContent = `${liveStock} шт.`;
                stockEl.style.color = 'var(--neon-yellow)'; // Highlight change
                stockEl.style.textShadow = '0 0 10px var(--neon-yellow)';

                // Update memory
                product.stock = liveStock;
                currentModalProduct.stock = liveStock;
            }

            if (liveStock <= 0) {
                btn.disabled = true;
                btn.textContent = 'Нет в наличии';
                stockEl.style.color = 'red';
            }
        }
    } catch (e) {
        console.warn("Background stock check failed", e);
    }
}

function closeProductModal(event) {
    const overlay = document.getElementById('product-modal-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function changeModalQty(delta) {
    if (!currentModalProduct) return;

    let newQty = currentModalQty + delta;
    if (newQty < 1) newQty = 1;
    if (newQty > currentModalProduct.stock) {
        showToast(`Максимум доступно: ${currentModalProduct.stock} шт.`);
        newQty = currentModalProduct.stock;
    }

    currentModalQty = newQty;
    document.getElementById('modal-qty-val').textContent = currentModalQty;
}

async function addModalToCart() {
    if (!currentModalProduct) return;

    const addBtn = document.getElementById('modal-add-btn');
    const originalText = addBtn.textContent;

    addBtn.disabled = true;
    addBtn.textContent = '...';

    await addToCart(currentModalProduct, currentModalQty);

    addBtn.textContent = 'ДОБАВЛЕНО!';

    setTimeout(() => {
        closeProductModal();
        addBtn.disabled = false;
        addBtn.textContent = originalText;
    }, 700);
}

// --- AUTO-REFRESH BONUSES ON FOCUS ---
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        const userId = getUserId();
        if (userId) {
            console.log('App visible, refreshing bonuses...');
            import('./services/bonus-system.js').then(module => {
                module.syncBonuses(userId).then(bal => {
                   const els = [
                       document.getElementById('bonus-amount'),
                       document.getElementById('available-bonuses'),
                       document.getElementById('earned-bonuses')
                   ];
                   els.forEach(el => { 
                       if(el) {
                           el.textContent = bal;
                           el.style.color = '#00ff88';
                           setTimeout(() => el.style.color = '', 1000);
                       }
                   });
                }).catch(err => console.error('Auto-refresh failed', err));
            });
        }
    }
});
