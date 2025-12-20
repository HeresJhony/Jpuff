/**
 * Lightweight Product Details Page Script
 * Only loads what's needed for displaying product information
 */

import { fetchProductById, checkStock } from './services/api.js';
import { showToast } from './utils/ui.js';

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

        // Render product details
        container.innerHTML = `
            <img src="${p.image_url || 'img/vape_icon.png'}" class="product-detail-image" style="display:block; margin: 0 auto;">
            <div class="detail-panel">
                <h2>${p.brand} - ${p.model_name}</h2>
                <div class="detail-row">
                    <span class="label">Цена:</span>
                    <span class="value price">${p.price} ₽</span>
                </div>
                <div class="detail-row">
                    <span class="label">Вкус:</span>
                    <span class="value">${p.taste || '-'}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Количество затяжек:</span>
                    <span class="value">${p.puffs}</span>
                </div>
                <div class="detail-row">
                    <span class="label">В наличии:</span>
                    <span class="value stock">${p.stock} шт.</span>
                </div>

                <div style="margin-top: 15px; font-size: 0.9em; color: gray; text-align: left;">
                    <p>ℹ️ 100% Оригинальная продукция</p>
                </div>
            </div>
        `;

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

/**
 * Get cart from localStorage
 */
function getCart() {
    return JSON.parse(localStorage.getItem('cart')) || [];
}

/**
 * Save cart to localStorage
 */
function saveCart(cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initProductDetails);
