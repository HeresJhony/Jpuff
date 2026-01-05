// js/cart.js
import { checkStock, submitOrder, fetchOrders, fetchDiscountInfo, fetchClientData } from './services/api.js?v=STOCK_FIX_003';
import { getUserId, getActivePromoCode } from './services/user-id.js'; // IMPORTED
import { showToast, showComingSoon, closeComingSoon } from './utils/ui.js';
import { getCart, saveCart, clearCart } from './utils/cart-storage.js';

// ... (existing code) ...

function initCheckoutPage() {
    const totalEl = document.getElementById('checkout-sum');
    if (!totalEl) return;

    const cart = getCart();
    if (cart.length === 0) {
        window.location.href = 'index.html'; // Redirect if empty
        return;
    }

    const originalCartTotal = Math.round(cart.reduce((sum, item) => sum + (item.price * item.quantity), 0));

    // Always show original total (discount applied internally only)
    totalEl.textContent = `${originalCartTotal} ₽`;

    // Load available bonuses and discounts immediately when page loads
    const userId = getUserId();
    if (userId) {
        loadAvailableBonuses();
        loadAvailableDiscounts();
        initializeDiscountAvailability(); // Block "Yes" if no discount

        // AUTOFILL USER DATA
        fillUserData(userId);
    }
}

async function fillUserData(userId) {
    // 1. Try Local Storage (Fastest & Most reliable for recent input)
    const localName = localStorage.getItem('juicy_user_name');
    const localPhone = localStorage.getItem('juicy_user_phone');
    const localAddress = localStorage.getItem('juicy_user_address');

    if (localName) {
        const nameInput = document.getElementById('name');
        if (nameInput) nameInput.value = localName;
    }
    if (localPhone) {
        const phoneInput = document.getElementById('phone');
        if (phoneInput) phoneInput.value = localPhone;
    }
    if (localAddress) {
        const addressInput = document.getElementById('address');
        if (addressInput) addressInput.value = localAddress;
    }

    // 2. Try Server Data (Background update if local is missing)
    if (!localName || !localPhone) {
        try {
            const data = await fetchClientData(userId);
            if (data) {
                const nameInput = document.getElementById('name');
                const phoneInput = document.getElementById('phone');

                if (nameInput && !nameInput.value && data.name && data.name !== "Гость") {
                    nameInput.value = data.name;
                    localStorage.setItem('juicy_user_name', data.name);
                }
                if (phoneInput && !phoneInput.value && data.phone) {
                    phoneInput.value = data.phone;
                    localStorage.setItem('juicy_user_phone', data.phone);
                }
            }
        } catch (e) {
            console.error("Autofill failed", e);
        }
    }
}

// Expose necessary functions for HTML event handlers
// getTelegramUserId REMOVED. Use getUserId() imported from services.

// getTelegramUserId REMOVED. Use getUserId() imported from services.

// Cache/State for Discount
let cachedUserDiscountEligibility = null; // Memory cache
let loadedPromoInfo = null; // Динамическая инфа о промокоде с сервера

// Helper to reliably check eligibility with LocalStorage caching
// Helper to reliably check eligibility with LocalStorage caching (DISABLED CACHE)
async function checkUserEligibility(userId, bypassCache = true) {
    if (userId === 'UNKNOWN' || !userId) return false;

    // CACHE DISABLED BY USER REQUEST
    // if (!bypassCache && cachedUserDiscountEligibility !== null) return cachedUserDiscountEligibility;

    // if (!bypassCache) {
    //    const storedStatus = sessionStorage.getItem('is_new_user_cached');
    // ...
    // }

    // 3. Fetch from Network & Analyze History
    try {
        console.log(`[CHECK] Fetching history for ${userId}...`);
        const history = await fetchOrders(userId);

        let discountUsedBefore = false;

        if (Array.isArray(history) && history.length > 0) {
            console.log(`[CHECK] Analyzing ${history.length} orders...`);

            for (const order of history) {
                // Ignore cancelled or failed orders clearly
                const status = (order.status || '').toLowerCase();
                if (status.includes('cancel') || status.includes('отмен') || status.includes('fail') || status.includes('ошиб')) {
                    continue;
                }

                // Check for discount usage
                // Be loose with types (Number/String)
                const discountVal = Number(order.new_user_discount || 0);
                const itemsStr = JSON.stringify(order.items || order.Items || '');

                const hasNewUserDiscount = (discountVal > 0) ||
                    (order.promo_code === 'new_client_10') ||
                    (itemsStr.includes('Скидка Нового Клиента'));

                if (hasNewUserDiscount) {
                    console.warn(`[CHECK] ❌ Discount ALREADY USED in Order #${order.id}`, order);
                    discountUsedBefore = true;
                    // We don't break immediately in case we want to debug all, 
                    // but logic-wise finding one valid usage is enough.
                    break;
                }
            }
        } else {
            console.log("[CHECK] History is empty. User is eligible.");
        }

        // ELIGIBLE if NOT used before
        const isEligible = !discountUsedBefore;

        cachedUserDiscountEligibility = isEligible;
        sessionStorage.setItem('is_new_user_cached', String(isEligible));

        console.log(`[CHECK] Final Verdict: ${isEligible ? '✅ ELIGIBLE' : '⛔ NOT ELIGIBLE'}`);

        return isEligible;

    } catch (e) {
        console.error("[CHECK] Failed to verify eligibility, defaulting to ELIGIBLE (User friendly fallback)", e);
        // Fallback: If network fails, allow usage. Server will double-check or we forgive.
        return true;
    }
}

/**
 * Add product to cart with stock check
 */
export async function addToCart(productOrId, qty = null) {
    let product = productOrId;

    // If passed ID (from some contexts), fetch full object
    if (typeof productOrId !== 'object') {
        console.warn("addToCart called with ID not object, might fail if logic expects object");
    }

    let quantity = 1;

    if (qty !== null) {
        quantity = Number(qty);
    } else {
        // Fallback to DOM element if no quantity passed (legacy behavior for product page)
        const qtyInput = document.getElementById('qty-input');
        quantity = qtyInput ? parseInt(qtyInput.value) : 1;
    }

    const productId = Number(product.id);
    const cart = getCart();
    // Ensure we match types safely
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
                id: productId, // Changed from product_id
                name: `${product.brand} ${product.model_name} ${product.taste ? ' - ' + product.taste : ''} `,
                price: Number(product.price),
                quantity: quantity,
                image_url: product.image_url,
                puffs: product.puffs // Save puffs info
            });
        }

        saveCart(cart);
        const newTotal = currentQuantity + quantity;
        showToast(`Добавлено! В корзине: ${newTotal} шт.`, 'success');

        // Optional: Redirect or just stay
        // window.location.href = 'catalogue.html'; 
    } catch (e) {
        showToast('Ошибка проверки склада', 'error');
    }
}

/**
 * Change quantity in Cart
 */
export async function changeQuantity(productId, delta) {
    let cart = getCart();
    const itemIndex = cart.findIndex(item => item.id === productId);
    if (itemIndex === -1) return;

    const item = cart[itemIndex];
    const newQuantity = item.quantity + delta;

    if (newQuantity <= 0) {
        // Remove
        cart.splice(itemIndex, 1);
        saveCart(cart);
        renderCart();
        return;
    }

    // Check stock if increasing
    if (delta > 0) {
        try {
            const stock = await checkStock(productId);
            if (newQuantity > stock) {
                showToast(`Больше нет в наличии(Макс: ${stock})`, 'error');
                return;
            }
        } catch (e) {
            showToast('Не удалось проверить склад', 'error');
            return; // Fail safe
        }
    }

    item.quantity = newQuantity;
    saveCart(cart);
    renderCart();
}

/**
 * Render Cart
 */
// Render Cart
export async function renderCart() {
    console.log("Rendering cart...");
    const cart = getCart();
    console.log("Cart contents:", cart);

    const cartContainer = document.getElementById('cart-items');
    // const emptyCartMsg = document.getElementById('empty-cart-msg'); // Not used in HTML
    const cartFooter = document.querySelector('.fixed-footer');
    const totalSumEl = document.getElementById('total-sum');



    // Update header counter
    const cartCountEl = document.querySelector('.cart-count');
    if (cartCountEl) {
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCountEl.textContent = totalItems > 0 ? totalItems : '';
    }

    if (!cartContainer) return;

    if (cart.length === 0) {
        cartContainer.innerHTML = `
            <div style="text-align: center; padding: 40px 20px;">
                <p style="color: #888; font-size: 1.2em; margin-bottom: 20px;">Корзина пуста 😔</p>
                <button onclick="window.location.href='catalogue.html'" style="
                    background: linear-gradient(90deg, #00f3ff, #0066ff);
                    border: none;
                    padding: 12px 24px;
                    border-radius: 12px;
                    color: white;
                    font-weight: bold;
                    font-size: 1em;
                    cursor: pointer;
                    box-shadow: 0 4px 15px rgba(0, 243, 255, 0.3);
                ">Перейти в каталог</button>
            </div>
    `;
        if (cartFooter) cartFooter.style.display = 'none';
        return;
    }

    if (cartFooter) cartFooter.style.display = 'flex';

    cartContainer.innerHTML = '';
    let subtotal = 0;

    const fragment = document.createDocumentFragment();

    cart.forEach((item, index) => {
        const price = Number(item.price) || 0;
        const qty = Number(item.quantity) || 1;
        subtotal += price * qty;

        // Update item in case it was bad in storage
        item.price = price;
        item.quantity = qty;

        const cartItem = document.createElement('div');
        cartItem.className = 'cart-card';

        // Optimized image with lazy loading (not strictly critical for small cart, but good practice)
        cartItem.innerHTML = `
            <img src="${item.image_url || 'img/vape_icon.png'}" loading="lazy" class="cart-item-img" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px; border: 1px solid var(--neon-blue);">
            
            <div class="cart-item-info" style="flex: 1; margin-left: 15px;">
                <h4 style="margin: 0 0 5px 0;">${item.name}</h4>
                ${item.puffs ? `<div style="font-size: 0.85em; color: #aaa; margin-bottom: 5px;">♨️ ${item.puffs} затяжек</div>` : ''}
                <div class="cart-item-price">${item.price} ₽</div>
            </div>

            <div class="cart-item-actions" style="display: flex; flex-direction: row; align-items: center; gap: 15px;">
                <div onclick="removeItem(${index})" style="color: #FF0000; cursor: pointer; font-size: 48px; padding: 5px; display: flex; align-items: center; justify-content: center; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">🗑</div>
                <div class="cart-quantity">
                    <button onclick="updateQuantity(${index}, -1)">–</button>
                    <span>${item.quantity}</span>
                    <button onclick="updateQuantity(${index}, 1)">+</button>
                </div>
            </div>
        `;
        // Styling matches previous iteration
        cartItem.style.display = 'flex';
        cartItem.style.alignItems = 'center';
        cartItem.style.background = 'rgba(0, 20, 40, 0.8)';
        cartItem.style.padding = '10px';
        cartItem.style.marginBottom = '10px';
        cartItem.style.borderRadius = '10px';
        cartItem.style.border = '1px solid var(--neon-blue)';

        fragment.appendChild(cartItem);
    });

    cartContainer.appendChild(fragment);

    // --- Price Display Logic (Simple Total) ---
    const summaryP = document.querySelector('.cart-summary p');
    const totalEl = document.getElementById('total-sum');

    if (summaryP) {
        summaryP.innerHTML = `Итого: <span id="total-sum">${subtotal} ₽</span>`;
    } else if (totalEl) {
        totalEl.textContent = `${subtotal} ₽`;
    }

    // Clear any old discount cache
    sessionStorage.removeItem('cart_total_discounted');
    sessionStorage.removeItem('cart_discount_amount');

    window.updateQuantity = (index, delta) => {
        const product = cart[index];
        if (product) changeQuantity(product.id, delta);
    };

    window.removeItem = (index) => {
        const product = cart[index];
        if (product) changeQuantity(product.id, -product.quantity);
    };
}

/**
 * Submit Order
 */
export async function submitOrderForm() {
    const name = document.getElementById('name').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const address = document.getElementById('address')?.value.trim() || '';
    const comment = document.getElementById('comment').value.trim();
    const payment = document.getElementById('payment').value;
    const isAgeConfirmed = document.getElementById('age-confirm').checked;

    // Get Delivery Method
    const deliveryType = document.querySelector('input[name="delivery_type"]:checked')?.value || 'pickup';

    // Validate Address REMOVED by user request


    if (!name || !phone || !isAgeConfirmed) {
        showToast("Заполните обязательные поля и подтвердите возраст", 'error');
        return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 11) {
        showToast("Введите верный номер телефона", 'error');
        return;
    }

    const cart = getCart();
    if (cart.length === 0) {
        showToast("Корзина пуста", 'error');
        return;
    }

    const btn = document.getElementById('place-order-btn');
    btn.disabled = true;
    btn.innerText = "Проверка наличия...";

    // --- FINAL STOCK CHECK (Race Condition Protection) ---
    try {
        const outOfStockItems = [];

        // Check ALL items first
        for (const item of cart) {
            const liveStock = await checkStock(item.id);
            if (liveStock < item.quantity) {
                outOfStockItems.push(`${item.name} (Доступно: ${liveStock} шт.)`);
            }
        }

        if (outOfStockItems.length > 0) {
            // Populate Modal
            const modal = document.getElementById('stock-error-modal');
            const listContainer = document.getElementById('stock-error-list');

            if (modal && listContainer) {
                // Format the list of items nicely
                const errorListHtml = outOfStockItems.map(i => `<div style="margin-bottom: 5px;">• ${i}</div>`).join('');
                listContainer.innerHTML = errorListHtml;
                modal.style.display = 'flex'; // Uses flex centering from CSS
            } else {
                // Fallback (should not happen if HTML is updated)
                const msg = `К сожалению, кто - то успел купить раньше вас: \n\n${outOfStockItems.join('\n')} \n\nПожалуйста, скорректируйте корзину.`;
                alert(msg);
            }

            // Re-enable button
            btn.disabled = false;
            btn.innerText = "Подтвердить Заказ";
            return; // STOP THE ORDER
        }

    } catch (e) {
        console.error("Stock check failed:", e);
        showToast("Не удалось проверить наличие товара. Попробуйте еще раз.", 'error');
        btn.disabled = false;
        btn.innerText = "Подтвердить Заказ";
        return;
    }

    btn.innerText = "Отправка...";

    function getTelegramUsername() {
        try {
            // eslint-disable-next-line no-undef
            const user = Telegram.WebApp.initDataUnsafe.user;
            return user && user.username ? user.username : '';
        } catch (e) {
            return '';
        }
    }


    // --- FINAL PRICE CALCULATION ---
    const originalCartTotal = Math.round(cart.reduce((sum, item) => sum + (item.price * item.quantity), 0));
    let finalTotal = originalCartTotal;
    let discountApplied = 0;

    // Check UI for selected discount
    const useDiscount = document.querySelector('input[name="use_discount"]:checked')?.value;
    const discountSelect = document.getElementById('discount-select');

    // Only apply if user said "Yes" AND selected the specific discount
    if (useDiscount === 'yes' && discountSelect) {
        if (discountSelect.value === 'new_client_10') {
            // STRICT CHECK: Verify eligibility one last time before submitting
            const userId = getUserId();
            // Force a fresh check using logic defined in this file
            const isEligible = await checkUserEligibility(userId, true); // ensure fresh check

            if (!isEligible) {
                showToast("К сожалению, для вас данная скидка больше не доступна. Поставьте галочку 'нет' либо выберите другую доступную скидку.", 'error');
                // Re-enable button
                btn.disabled = false;
                btn.innerText = "Подтвердить Заказ";
                return; // STOP THE ORDER
            }

            discountApplied = Math.round(originalCartTotal * 0.10);
            finalTotal = originalCartTotal - discountApplied;
        } else if (loadedPromoInfo && discountSelect.value === loadedPromoInfo.code) {
            // Apply dynamic promo
            if (loadedPromoInfo.type === 'percent') {
                discountApplied = Math.round(originalCartTotal * (loadedPromoInfo.value / 100));
            } else {
                discountApplied = Number(loadedPromoInfo.value);
            }
            finalTotal = originalCartTotal - discountApplied;
        }
    }


    // --- BONUS PAYMENT PROCESSING ---
    // User ID is already imported at top level
    const currentUserId = getUserId();

    let bonusesUsed = 0;
    let bonusDiscount = 0;

    const useBonuses = document.querySelector('input[name="use_bonuses"]:checked')?.value;
    if (useBonuses === 'yes') {
        const bonusInput = document.getElementById('bonus-amount');
        const requestedBonuses = parseInt(bonusInput?.value) || 0;

        if (requestedBonuses > 0) {
            const { getUserBonuses } = await import('./services/bonus-system.js');
            const availableBonuses = getUserBonuses(currentUserId);

            if (requestedBonuses > availableBonuses) {
                showToast(`У вас недостаточно бонусов.Доступно: ${availableBonuses} `, 'error');
                btn.disabled = false;
                btn.innerText = "Подтвердить Заказ";
                return;
            }

            bonusDiscount = Math.min(requestedBonuses, finalTotal);
            bonusesUsed = bonusDiscount;
            finalTotal = finalTotal - bonusDiscount;
        }
    }

    const orderPayload = {
        customer: {
            name,
            phone,
            address: '', // Removed by user request
            delivery_type: deliveryType,
            comment,
            payment,
            user_id: currentUserId,
            username: getTelegramUsername(),
            referrer_id: (await import('./services/bonus-system.js')).getReferrer(currentUserId)
        },
        items: cart,
        total: finalTotal,
        original_total: originalCartTotal,
        timestamp: new Date().toISOString()
    };

    if (discountApplied > 0) {
        // CORRECT LOGIC: Only set new_user_discount if THAT SPECIFIC discount was used
        if (discountSelect && discountSelect.value === 'new_client_10') {
            orderPayload.new_user_discount = discountApplied;
        } else {
            // It's a promo code discount
            orderPayload.promo_discount = discountApplied; // Use a different field
            orderPayload.new_user_discount = 0; // Explicitly 0

            if (discountSelect) {
                orderPayload.promo_code = discountSelect.value;
            }
        }
    }


    if (bonusesUsed > 0) {
        orderPayload.bonuses_used = bonusesUsed;
        orderPayload.bonus_discount = bonusDiscount;
    }

    console.log("[DEBUG] Sending Order Payload:", orderPayload);

    try {
        const result = await submitOrder(orderPayload);
        if (result.status === 'success') {
            // PLAN B: Update stock from client side - REMOVED (GAS handles it now)
            // console.log("Order success, updating stocks...");
            /*
            for (const item of cart) {
                await updateProductStock(item.product_id, item.quantity);
            }
            */

            clearCart();
            sessionStorage.removeItem('preload_catalog');

            // Clear cached eligibility because they are no longer a new user!
            sessionStorage.removeItem('is_new_user_cached');
            cachedUserDiscountEligibility = false;

            // FIX: Remove Promo if used
            if (discountSelect && discountSelect.value !== 'new_client_10') {
                // Если использован любой промокод (не автоматическая скидка), удаляем его
                localStorage.removeItem('juicy_active_promo');
                console.log(`[CART] Promo '${discountSelect.value}' removed from storage.`);
                loadedPromoInfo = null;
            }

            // Deduct bonuses handled by server
            if (bonusesUsed > 0) {
                console.log(`Server requested to deduct ${bonusesUsed} bonuses`);
            }

            // AUTO-SAVE USER DATA FOR FUTURE
            localStorage.setItem('juicy_user_name', name);
            localStorage.setItem('juicy_user_phone', phone);
            if (address) {
                localStorage.setItem('juicy_user_address', address);
            }

            // document.getElementById('checkout-form').style.display = 'none';
            document.getElementById('success-modal').style.display = 'flex';

            showToast("Заказ успешно оформлен!", 'success');

            // Expose close function globally
            window.closeSuccessModal = function () {
                window.location.href = 'index.html';
            };
        } else {
            showToast(`Ошибка: ${result.message} `, 'error');
            btn.disabled = false;
            btn.innerText = "Подтвердить Заказ";
        }
    } catch (e) {
        showToast(`Ошибка сети: ${e.message} `, 'error');
        btn.disabled = false;
        btn.innerText = "Подтвердить Заказ";
    }
}

// Initialize based on page

// --- Helper Functions (Moved to top level for scope visibility) ---

async function initializeDiscountAvailability() {
    const userId = getUserId();
    if (!userId) return;

    // Load Promo Info if exists
    const localPromo = getActivePromoCode();
    if (localPromo) {
        console.log("Loading info for promo:", localPromo);
        const info = await fetchDiscountInfo(localPromo);
        if (info && info.found && info.active) {
            loadedPromoInfo = info;
            console.log("Promo info loaded:", info);
        }
    }

    // Check eligibility (bypass cache for accuracy)
    const isNewUser = await checkUserEligibility(userId, true);

    // If we add more discounts later, add checking logic here
    const hasAnyDiscount = isNewUser || (loadedPromoInfo !== null);

    console.log(`[DISCOUNT INIT] isNewUser: ${isNewUser}, Promo: ${!!loadedPromoInfo}, HasAny: ${hasAnyDiscount}`);

    const yesRadio = document.querySelector('input[name="use_discount"][value="yes"]');
    const noRadio = document.querySelector('input[name="use_discount"][value="no"]');

    if (!hasAnyDiscount && yesRadio) {
        yesRadio.disabled = true;
        // Make it look disabled
        const label = yesRadio.parentElement;
        if (label) {
            label.style.opacity = '0.5';
            label.style.cursor = 'not-allowed';
            label.title = 'Нет доступных скидок';
        }

        // Ensure "No" is checked
        if (yesRadio.checked) {
            yesRadio.checked = false;
            if (noRadio) {
                noRadio.checked = true;
                toggleDiscountInput();
            }
        }
    } else if (yesRadio) {
        // Enable if available
        yesRadio.disabled = false;
        const label = yesRadio.parentElement;
        if (label) {
            label.style.opacity = '1';
            label.style.cursor = 'pointer';
            label.title = '';
        }
    }
}



function toggleBonusInput() {
    const useBonuses = document.querySelector('input[name="use_bonuses"]:checked')?.value;
    const bonusBlock = document.getElementById('bonus-input-block');

    if (useBonuses === 'yes' && bonusBlock) {
        bonusBlock.style.display = 'block';
        loadAvailableBonuses();
    } else if (bonusBlock) {
        bonusBlock.style.display = 'none';
        const bonusInput = document.getElementById('bonus-amount');
        if (bonusInput) bonusInput.value = 0;
        updateOverallTotal();
    }
}

function toggleDiscountInput() {
    const useDiscount = document.querySelector('input[name="use_discount"]:checked')?.value;
    const discountBlock = document.getElementById('discount-input-block');
    const discountMsg = document.getElementById('discount-applied-msg');

    if (useDiscount === 'yes' && discountBlock) {
        discountBlock.style.display = 'block';
        loadAvailableDiscounts();
    } else if (discountBlock) {
        discountBlock.style.display = 'none';
        if (discountMsg) discountMsg.style.display = 'none';

        // Reset select to 'none'
        const select = document.getElementById('discount-select');
        if (select) select.value = 'none';

        updateOverallTotal();
    }
}

async function loadAvailableDiscounts() {
    const userId = getUserId();
    if (!userId) return;

    const select = document.getElementById('discount-select');
    if (!select) return;

    // Preserve existing options if we want (e.g. 'None')
    // But usually we can rebuild.
    select.innerHTML = '<option value="none">Проверка...</option>';

    // Force fresh check to ensure consistency with profile status
    const isNewUser = await checkUserEligibility(userId, true);

    select.innerHTML = '<option value="none">-- Выберите скидку --</option>';

    if (isNewUser) {
        const opt = document.createElement('option');
        opt.value = 'new_client_10';
        opt.textContent = '🔥 Скидка Нового Клиента (-10%)';
        select.appendChild(opt);
    } else {
        // Show as disabled if used
        const opt = document.createElement('option');
        opt.value = 'new_client_10_used';
        opt.disabled = true;
        opt.textContent = '❌ Скидка Нового Клиента (Использована)';
        // Optional: style it if browser allows (some mobile browsers ignore option styles)
        opt.style.color = '#ff4444';
        select.appendChild(opt);
    }
    // 2. Dynamic Promo (from DB)
    if (loadedPromoInfo) {
        const option = document.createElement('option');
        option.value = loadedPromoInfo.code;
        // e.g. "🎒 Скидка Путник (10%)" or "❄️ АКЦИЯ (15%)"
        const labelSafe = loadedPromoInfo.label || loadedPromoInfo.code;
        let valSuffix = "";
        if (loadedPromoInfo.type === 'percent') valSuffix = `- ${loadedPromoInfo.value}% `;
        else valSuffix = `- ${loadedPromoInfo.value}₽`;

        option.textContent = `${labelSafe} (${valSuffix})`;
        select.appendChild(option);
    }

    if (select.options.length === 1) { // Only "Choose discount" option
        const opt = document.createElement('option');
        opt.value = 'none';
        opt.disabled = true;
        opt.textContent = 'Нет активных скидок';
        select.appendChild(opt);
    }
}

async function loadAvailableBonuses() {
    const userId = getUserId();
    const availableEl = document.getElementById('available-bonuses');
    const bonusInput = document.getElementById('bonus-amount');

    const { getUserBonuses, syncBonuses } = await import('./services/bonus-system.js');

    // Helper to update UI state
    const updateUI = (val) => {
        if (availableEl) availableEl.textContent = val;
        if (bonusInput) bonusInput.max = val;

        const yesRadio = document.querySelector('input[name="use_bonuses"][value="yes"]');
        const noRadio = document.querySelector('input[name="use_bonuses"][value="no"]');

        if (yesRadio && val === 0) {
            yesRadio.disabled = true;
            yesRadio.parentElement.style.opacity = "0.5";
            yesRadio.parentElement.style.cursor = "not-allowed";

            if (yesRadio.checked) {
                yesRadio.checked = false;
                if (noRadio) {
                    noRadio.checked = true;
                    toggleBonusInput();
                }
            }
        } else if (yesRadio) {
            yesRadio.disabled = false;
            yesRadio.parentElement.style.opacity = "1";
            yesRadio.parentElement.style.cursor = "pointer";
        }
    };

    // 1. Show Cache Immediately (Optimistic)
    const cached = getUserBonuses(userId);
    updateUI(cached);

    // 2. Sync in Background
    syncBonuses(userId).then(fresh => {
        if (fresh !== cached) {
            updateUI(fresh);
        }
    });
}

function updateOverallTotal() {
    const cart = getCart();
    const originalTotal = Math.round(cart.reduce((sum, item) => sum + (item.price * item.quantity), 0));

    let currentTotal = originalTotal;

    // 1. Apply Discount
    const select = document.getElementById('discount-select');
    let discountAmount = 0;

    if (select && select.offsetParent !== null) { // if visible
        if (select.value === 'new_client_10') {
            discountAmount = Math.round(originalTotal * 0.10);
            currentTotal -= discountAmount;

            const msg = document.getElementById('discount-applied-msg');
            if (msg) {
                msg.style.display = 'block';
                msg.textContent = `Применена скидка 10 % (-${discountAmount} ₽)`;
            }
        }
        // Dynamic Promo Calculation
        else if (loadedPromoInfo && select.value === loadedPromoInfo.code) {
            if (loadedPromoInfo.type === 'percent') {
                discountAmount = Math.round(originalTotal * (loadedPromoInfo.value / 100));
            } else {
                discountAmount = Number(loadedPromoInfo.value);
            }
            currentTotal -= discountAmount;

            const msg = document.getElementById('discount-applied-msg');
            if (msg) {
                msg.style.display = 'block';
                const label = loadedPromoInfo.label || "Скидка";
                msg.textContent = `Применена "${label}"(-${discountAmount} ₽)`;
            }
        }
        else {
            // Fallback or Unknown
            const msg = document.getElementById('discount-applied-msg');
            if (msg) msg.style.display = 'none';
        }
    }

    // 2. Apply Bonuses
    const bonusInput = document.getElementById('bonus-amount');
    const bonusDiscountInfo = document.getElementById('bonus-discount-info');
    const bonusDiscountAmount = document.getElementById('bonus-discount-amount');

    let bonusesToUse = 0;
    if (bonusInput && bonusInput.offsetParent !== null) { // if visible
        bonusesToUse = parseInt(bonusInput.value) || 0;
        const maxBonuses = parseInt(bonusInput.max) || 0;

        // Limit
        if (bonusesToUse > maxBonuses) {
            bonusesToUse = maxBonuses;
            bonusInput.value = maxBonuses;
        }

        // Cannot use more bonuses than price
        if (bonusesToUse > currentTotal) {
            bonusesToUse = currentTotal;
            // We don't change input value here to not annoy user, but we limit math
        }
    }

    const finalTotal = Math.max(0, currentTotal - bonusesToUse);

    // Update UI
    const checkoutSum = document.getElementById('checkout-sum');
    if (checkoutSum) {
        if (discountAmount > 0 || bonusesToUse > 0) {
            checkoutSum.innerHTML = `${finalTotal} ₽ <span style="font-size: 0.7em; color: #aaa; text-decoration: line-through;">${originalTotal} ₽</span>`;
            checkoutSum.style.color = "#00ff88"; // Green for discounted
        } else {
            checkoutSum.textContent = `${finalTotal} ₽`;
            checkoutSum.style.color = "white";
        }
    }

    // Update Bonus UI info
    if (bonusDiscountInfo && bonusDiscountAmount) {
        if (bonusesToUse > 0) {
            bonusDiscountInfo.style.display = 'block';
            bonusDiscountAmount.textContent = bonusesToUse;
        } else {
            bonusDiscountInfo.style.display = 'none';
        }
    }
}

// --- Initialization Logic ---

function initCartModule() {
    console.log("Initializing Cart Module...");

    // Telegram Web App Styling
    const tg = window.Telegram?.WebApp;
    if (tg) {
        tg.expand();
        try {
            tg.setHeaderColor('#050510');
            tg.setBackgroundColor('#050510');
            if (tg.requestFullscreen) {
                tg.requestFullscreen();
            }
        } catch (e) {
            console.log("TG Styling Error:", e);
        }
    }

    const path = window.location.pathname;
    const cartContainer = document.getElementById('cart-items');
    const checkoutForm = document.getElementById('checkout-form') || document.getElementById('name');

    if (path.includes('cart.html') || cartContainer) {
        console.log("Detected Cart Page (by path or element). Rendering...");
        renderCart();
    }

    if (path.includes('checkout.html') || checkoutForm) {
        console.log("Detected Checkout Page (by path or element). Initializing...");
        initCheckoutPage();
    }

    if (path.includes('cart.html') || path.includes('checkout.html')) {
        // Phone Auto-Format Logic
        const phoneInput = document.getElementById('phone');
        if (phoneInput) {
            phoneInput.addEventListener('focus', function () {
                if (!this.value.startsWith('+7 ')) {
                    this.value = '+7 ';
                }
            });

            phoneInput.addEventListener('input', function (e) {
                let val = e.target.value;
                if (!val.startsWith('+7 ')) {
                    const raw = val.replace(/^\+7\s?|^\+7|^\+/, '');
                    e.target.value = '+7 ' + raw;
                }
            });
        }
    }

    // Delivery Method Toggle Logic
    const radios = document.querySelectorAll('input[name="delivery_type"]');
    const addressBlock = document.getElementById('address-block');

    if (radios.length > 0 && addressBlock) {
        radios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.value === 'delivery') {
                    addressBlock.style.display = 'block';
                } else {
                    addressBlock.style.display = 'none';
                }
            });
        });
    }
}

// Run immediately if DOM is ready (which is true for modules usually), otherwise wait
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCartModule);
} else {
    initCartModule();
}
// Expose functions to window (moved to end to ensure definition)
window.changeQuantity = changeQuantity;
window.submitOrderForm = submitOrderForm;
window.addToCart = addToCart;
window.toggleBonusInput = toggleBonusInput;
window.toggleDiscountInput = toggleDiscountInput;
window.updateBonusPayment = updateOverallTotal;
window.updateOverallTotal = updateOverallTotal;
window.renderCart = renderCart;
window.showComingSoon = showComingSoon;
window.closeComingSoon = closeComingSoon;
