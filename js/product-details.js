/**
 * Lightweight Product Details Page Script
 * Only loads what's needed for displaying product information
 */

import { fetchProductById, checkStock } from './services/api.js';
import { showToast } from './utils/ui.js';
import { getCart, saveCart } from './utils/cart-storage.js';

/**
 * Helper function to create detail row safely
 */
function createDetailRow(label, value, valueClass = '') {
    const row = document.createElement('div');
    row.className = 'detail-row';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'label';
    labelSpan.textContent = label;

    const valueSpan = document.createElement('span');
    valueSpan.className = `value ${valueClass}`.trim();
    valueSpan.textContent = value;

    row.appendChild(labelSpan);
    row.appendChild(valueSpan);
    return row;
}

/**
 * Initialize Product Details Page
 */
async function initProductDetails() {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');

    if (!productId) {
        window.location.href = 'catalogue.html';
        return;
    }

    const container = document.getElementById('product-details-container');
    container.innerHTML = '<p style="text-align:center;">Загрузка...</p>';

    try {
        const product = await fetchProductById(productId);

        if (!product) {
            container.innerHTML = '<p>Товар не найден.</p>';
            return;
        }

        // Normalize data
        const p = {
            ...product,
            price: Number(product.price),
            stock: Number(product.stock),
            id: Number(product.id)
        };

        // Render product details SAFELY (prevent XSS)
        const img = document.createElement('img');
        img.src = p.image_url || 'img/vape_icon.png';
        img.className = 'product-detail-image';
        img.style.cssText = 'display:block; margin: 0 auto;';

        const panel = document.createElement('div');
        panel.className = 'detail-panel';

        const h2 = document.createElement('h2');
        h2.textContent = `${p.brand} - ${p.model_name}`;

        const priceRow = createDetailRow('Цена:', `${p.price} ₽`, 'price');
        const tasteRow = createDetailRow('Вкус:', p.taste || '-');
        const puffsRow = createDetailRow('Количество затяжек:', p.puffs);
        const stockRow = createDetailRow('В наличии:', `${p.stock} шт.`, 'stock');

        const info = document.createElement('div');
        info.style.cssText = 'margin-top: 15px; font-size: 0.9em; color: gray; text-align: left;';
        const infoPara = document.createElement('p');
        infoPara.textContent = 'ℹ️ 100% Оригинальная продукция';
        info.appendChild(infoPara);

        panel.appendChild(h2);
        panel.appendChild(priceRow);
        panel.appendChild(tasteRow);
        panel.appendChild(puffsRow);
        panel.appendChild(stockRow);
        panel.appendChild(info);

        container.innerHTML = '';
        container.appendChild(img);
        container.appendChild(panel);

        // Update page title
        const pageTitle = document.getElementById('product-title');
        if (pageTitle) {
            pageTitle.textContent = `${p.brand} ${p.model_name}`;
        }

        // Setup Add to Cart button
        const addBtn = document.getElementById('add-to-cart-btn');
        if (addBtn) {
            addBtn.onclick = () => addToCart(p);
        }

    } catch (error) {
        console.error('Failed to load product:', error);
        container.innerHTML = '<p style="color:red;">Ошибка загрузки товара</p>';
    }
}

/**
 * Add product to cart with stock validation
 */
async function addToCart(product) {
    const qtyInput = document.getElementById('qty-input');
    const quantity = qtyInput ? parseInt(qtyInput.value) : 1;

    if (quantity < 1) {
        showToast('Укажите количество', 'error');
        return;
    }

    const productId = Number(product.id);
    const cart = getCart();
    const existingItem = cart.find(item => Number(item.id) === productId);
    const currentQuantity = existingItem ? existingItem.quantity : 0;

    try {
        const availableStock = await checkStock(productId);

        if ((currentQuantity + quantity) > availableStock) {
            showToast(`Ошибка: Доступно всего ${availableStock} шт.`, 'error');
            return;
        }

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            cart.push({
                id: productId,
                name: `${product.brand} ${product.model_name}${product.taste ? ' - ' + product.taste : ''}`,
                price: Number(product.price),
                quantity: quantity,
                image_url: product.image_url
            });
        }

        saveCart(cart);
        const newTotal = currentQuantity + quantity;
        showToast(`Добавлено! В корзине: ${newTotal} шт.`, 'success');

        // Optional: redirect after short delay
        setTimeout(() => {
            window.location.href = 'catalogue.html';
        }, 1000);

    } catch (error) {
        console.error('Stock check failed:', error);
        showToast('Ошибка проверки склада', 'error');
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initProductDetails);
