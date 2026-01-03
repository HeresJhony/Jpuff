import { CONFIG } from './config.js';
import { getUserId } from './services/user-id.js';

const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

// DOM Elements
const searchTrigger = document.getElementById('review-search-trigger');
const searchInput = document.getElementById('review-search-input');
const reviewsList = document.getElementById('reviews-list');
const openModalBtn = document.getElementById('open-review-modal-btn');
const myReviewsBtn = document.getElementById('my-reviews-btn'); // NEW
const modal = document.getElementById('write-review-modal');
const closeModalBtn = document.getElementById('close-review-modal');
const productSelect = document.getElementById('review-product-select');
const reviewForm = document.getElementById('review-form');
const stars = document.querySelectorAll('.star-rating-input');
const ratingValueInput = document.getElementById('review-rating-value');
const modalTitle = modal.querySelector('h2');
const submitBtn = document.getElementById('submit-review-btn');

// State
let selectedRating = 0;
let allReviewsCache = [];
let editingReviewId = null; // If ID is set, we are editing
let showingMyReviews = false;

// --- 1. INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    loadReviews();
    setupEventListeners();
});

function setupEventListeners() {
    // Search toggle
    searchTrigger.addEventListener('click', () => {
        searchInput.classList.toggle('active');
        if (searchInput.classList.contains('active')) searchInput.focus();
    });
    searchInput.addEventListener('input', (e) => filterAndRenderReviews(e.target.value.toLowerCase().trim()));

    // "My Reviews" Toggle
    myReviewsBtn.addEventListener('click', () => {
        showingMyReviews = !showingMyReviews;
        myReviewsBtn.classList.toggle('active'); // Add CSS class for active state styling if needed
        myReviewsBtn.style.background = showingMyReviews ? 'var(--neon-pink)' : '';
        myReviewsBtn.style.color = showingMyReviews ? 'white' : 'var(--neon-pink)';

        filterAndRenderReviews(searchInput.value.toLowerCase().trim());
    });

    // Opening Modal to WRITE NEW
    openModalBtn.addEventListener('click', async () => {
        editingReviewId = null;
        modalTitle.textContent = "Ваш отзыв";
        submitBtn.textContent = "Оставить отзыв";
        modal.style.display = 'block';
        resetFormUI();
        await loadPurchasableProducts(); // Only unreviewed items
    });

    // Closing Modal
    closeModalBtn.addEventListener('click', () => { modal.style.display = 'none'; resetFormUI(); });

    // Stars
    stars.forEach(star => {
        star.addEventListener('click', () => {
            const val = parseInt(star.getAttribute('data-value'));
            selectedRating = val;
            ratingValueInput.value = val;
            updateStarsVisual(val);
        });
    });

    // --- Success Modal Logic ---
    const successModal = document.getElementById('review-success-modal');
    const closeSuccessBtn = document.getElementById('close-success-modal');
    const okSuccessBtn = document.getElementById('success-ok-btn');

    const closeSuccess = () => successModal.style.display = 'none';
    if (closeSuccessBtn) closeSuccessBtn.addEventListener('click', closeSuccess);
    if (okSuccessBtn) okSuccessBtn.addEventListener('click', closeSuccess);

    // Update window click for both modals
    window.addEventListener('click', (e) => {
        if (e.target === modal) { modal.style.display = 'none'; resetFormUI(); }
        if (e.target === successModal) { closeSuccess(); }
    });

    reviewForm.addEventListener('submit', handleReviewSubmit);
}

function updateStarsVisual(rating) {
    stars.forEach(star => {
        const val = parseInt(star.getAttribute('data-value'));
        star.classList.toggle('active', val <= rating);
        star.textContent = val <= rating ? '★' : '☆';
    });
}

function resetFormUI() {
    reviewForm.reset();
    selectedRating = 0;
    ratingValueInput.value = '';
    updateStarsVisual(0);
    productSelect.disabled = false; // Enable select by default
}

// --- 2. DATA LOADING ---

async function loadReviews() {
    try {
        const { data: reviews, error } = await supabase
            .from('reviews')
            .select(`id, rating, comment, created_at, product_id, user_id, Products(id, brand, model_name, image_url)`)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        // Fetch names for users
        const userIds = [...new Set(reviews.map(r => r.user_id))];
        let userMap = {};
        if (userIds.length > 0) {
            const { data: clients } = await supabase.from('clients').select('user_id, name').in('user_id', userIds);
            if (clients) clients.forEach(c => userMap[c.user_id] = c.name);
        }

        allReviewsCache = reviews.map(r => ({
            ...r,
            productName: r.Products ? `${r.Products.brand} ${r.Products.model_name}` : 'Товар удален',
            productImage: r.Products?.image_url || 'img/vape-icon.svg',
            userName: userMap[r.user_id] || 'Аноним'
        }));

        filterAndRenderReviews(searchInput.value.toLowerCase().trim());

    } catch (err) {
        console.error('Error:', err);
        reviewsList.innerHTML = '<div style="text-align:center; padding:20px;">Ошибка списка.</div>';
    }
}

function filterAndRenderReviews(query) {
    const currentUserId = getUserId();
    let filtered = allReviewsCache;

    if (showingMyReviews) {
        filtered = filtered.filter(r => r.user_id === currentUserId);
    }

    if (query) {
        filtered = filtered.filter(r => r.productName.toLowerCase().includes(query));
    }

    renderReviewsList(filtered, currentUserId);
}

function renderReviewsList(reviews, currentUserId) {
    reviewsList.innerHTML = '';
    if (reviews.length === 0) {
        reviewsList.innerHTML = '<div style="text-align:center; color:gray; padding-top:20px;">Ничего не найдено.</div>';
        return;
    }

    reviews.forEach(review => {
        const isMine = review.user_id === currentUserId;
        const div = document.createElement('div');
        div.className = 'review-card';
        if (isMine) div.style.borderColor = 'var(--neon-pink)';

        const starsStr = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);

        let editBtnHtml = '';
        if (isMine) {
            editBtnHtml = `<button class="edit-review-btn" data-id="${review.id}" style="float:right; background:transparent; border:none; cursor:pointer;">✏️</button>`;
        }

        div.innerHTML = `
            <div class="review-header">
                <div class="review-product-info">
                    <img src="${review.productImage}" alt="icon" class="review-product-icon">
                    <span>${review.productName}</span>
                </div>
                <div class="review-rating">${starsStr}</div>
            </div>
            <div class="review-user">
                ${editBtnHtml}
                <span>👤</span> ${isMine ? 'Вы' : review.userName}
            </div>
            <div class="review-comment">${escapeHtml(review.comment)}</div>
            <div class="review-date">${new Date(review.created_at).toLocaleDateString()}</div>
        `;

        reviewsList.appendChild(div);

        // Attach Edit Handler
        if (isMine) {
            div.querySelector('.edit-review-btn').addEventListener('click', () => openEditModal(review));
        }
    });
}

function openEditModal(review) {
    editingReviewId = review.id;
    modalTitle.textContent = "Редактировать отзыв";
    submitBtn.textContent = "Сохранить изменения";
    modal.style.display = 'block';

    // Pre-fill form
    resetFormUI();
    productSelect.innerHTML = `<option value="${review.product_id}" selected>${review.productName}</option>`;
    productSelect.disabled = true; // Cannot change product

    selectedRating = review.rating;
    ratingValueInput.value = review.rating;
    updateStarsVisual(review.rating);
    document.getElementById('review-comment').value = review.comment;
}


// --- 3. PRODUCTS LOADING (Last Order Only, with Disable Logic) ---

async function loadPurchasableProducts() {
    productSelect.innerHTML = '<option>Загрузка товаров...</option>';
    const userId = getUserId();

    try {
        // 1. Get ONLY the LAST COMPLETED order (by date)
        const { data: lastOrder } = await supabase
            .from('orders')
            .select('items, created_at')
            .eq('user_id', userId)
            .eq('status', 'completed') // STRICTLY COMPLETED ONLY
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!lastOrder) {
            productSelect.innerHTML = '<option disabled>Вы еще ничего не покупали</option>';
            return;
        }

        // Extract items from this specific order
        const items = lastOrder.items || [];
        if (!Array.isArray(items) || items.length === 0) {
            productSelect.innerHTML = '<option disabled>В последнем заказе нет товаров</option>';
            return;
        }

        // 2. Get existing reviews for these products by this user
        const productIdsInOrder = items.map(i => parseInt(i.id)).filter(id => id);

        let reviewedProductIds = new Set();
        if (productIdsInOrder.length > 0) {
            const { data: myReviews } = await supabase
                .from('reviews')
                .select('product_id')
                .eq('user_id', userId)
                .in('product_id', productIdsInOrder); // Check only relevant products

            if (myReviews) {
                myReviews.forEach(r => reviewedProductIds.add(r.product_id));
            }
        }

        // 3. Render Options
        productSelect.innerHTML = '<option value="" disabled selected>Выберите товар из последнего заказа</option>';

        items.forEach(item => {
            const pid = parseInt(item.id);
            if (!pid) return;

            const opt = document.createElement('option');
            const hasReview = reviewedProductIds.has(pid);

            opt.value = pid;

            if (hasReview) {
                opt.textContent = `❌ ${item.name} (Отзыв уже есть)`;
                opt.disabled = true; // Make unselectable
                opt.style.color = '#777'; // Gray out
            } else {
                opt.textContent = `🟢 ${item.name}`; // Active
                opt.style.color = 'white';
                opt.style.fontWeight = 'bold';
            }

            productSelect.appendChild(opt);
        });

        // If all items are reviewed, maybe show a hint
        const allReviewed = items.every(i => reviewedProductIds.has(parseInt(i.id)));
        if (allReviewed) {
            const hint = document.createElement('option');
            hint.disabled = true;
            hint.textContent = "--- Всё оценено! Спасибо! ---";
            productSelect.appendChild(hint);
        }

    } catch (err) {
        console.error(err);
        productSelect.innerHTML = '<option disabled>Ошибка загрузки</option>';
    }
}


// --- 4. SUBMIT ---

async function handleReviewSubmit(e) {
    e.preventDefault();
    const productId = productSelect.value;
    const comment = document.getElementById('review-comment').value;
    const userId = getUserId();

    if (!selectedRating) { alert("Поставьте оценку! (звездочки)"); return; }

    if (comment.trim().length < 50) {
        alert("Комментарий слишком короткий. Напишите, пожалуйста, минимум 50 символов.");
        return;
    }

    submitBtn.textContent = 'Обработка...';
    submitBtn.disabled = true;

    try {
        let result;

        if (editingReviewId) {
            // EDIT MODE (RPC)
            const { data, error } = await supabase.rpc('update_review', {
                review_id_param: editingReviewId,
                rating_param: selectedRating,
                comment_param: comment
            });
            if (error) throw error;
            result = data;
        } else {
            // NEW MODE (RPC + Bonus)
            const { data, error } = await supabase.rpc('submit_review_v2', {
                user_id_param: userId,
                product_id_param: parseInt(productId),
                rating_param: selectedRating,
                comment_param: comment
            });
            if (error) throw error;
            result = data;
        }

        if (result && result.success) {
            // Success Logic
            const successModal = document.getElementById('review-success-modal');
            const successText = document.getElementById('review-success-text');

            modal.style.display = 'none';

            if (result.bonus_added) {
                successText.textContent = `Отзыв принят! Начислено +${result.bonus_added} бонусов.`;
            } else {
                successText.textContent = "Ваш отзыв успешно обновлен.";
            }

            if (successModal) successModal.style.display = 'block';

            loadReviews(); // Reload list
        } else {
            alert(result?.message || "Ошибка сервера.");
        }

    } catch (err) {
        console.error(err);
        alert("Ошибка сети. Попробуйте еще раз.");
    } finally {
        submitBtn.disabled = false;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
