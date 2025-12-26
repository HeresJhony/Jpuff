// Sidebar Control Logic

// Global flag to distinguish drag action from click
window.fabIsDragging = false;

document.addEventListener('DOMContentLoaded', () => {
    // Inject sidebar HTML if it doesn't exist but we have the triggers
    if (!document.getElementById('sidebar')) {
        const sidebarHTML = `
        <div class="sidebar-overlay" id="sidebar-overlay" onclick="closeSidebar()"></div>
        <div class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <span class="sidebar-title">MENU</span>
                <!-- Close button removed as requested -->
            </div>
            <nav class="sidebar-nav">
                <a href="index.html" class="sidebar-link ${window.location.pathname.endsWith('index.html') ? 'active' : ''}">
                    <span class="sidebar-icon">🏠</span> Главная
                </a>
                <a href="catalogue.html" class="sidebar-link ${window.location.pathname.endsWith('catalogue.html') ? 'active' : ''}">
                    <span class="sidebar-icon">💨</span> Каталог
                </a>
                <a href="cart.html" class="sidebar-link ${window.location.pathname.endsWith('cart.html') ? 'active' : ''}">
                    <span class="sidebar-icon">🛒</span> Корзина
                    <span id="sidebar-cart-count" style="margin-left: auto; font-size: 0.8em; background: var(--neon-pink); padding: 2px 6px; border-radius: 10px;"></span>
                </a>
                <a href="profile.html" class="sidebar-link ${window.location.pathname.endsWith('profile.html') ? 'active' : ''}">
                    <span class="sidebar-icon">👤</span> Профиль
                </a>
                <a href="promo.html" class="sidebar-link ${window.location.pathname.endsWith('promo.html') ? 'active' : ''}">
                    <span class="sidebar-icon">🎁</span> Акции
                </a>
                <a href="info.html" class="sidebar-link ${window.location.pathname.endsWith('info.html') ? 'active' : ''}">
                    <span class="sidebar-icon">ℹ️</span> Информация
                </a>
            </nav>
            
            <div style="flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; margin-bottom: 10px;">
                <!-- Tree Container -->
                <div style="position: relative; width: 480px; max-width: 100%; transform: scale(1.95);">
                    <!-- Tree Image -->
                    <img src="img/el2.png" alt="Christmas Tree" style="width: 100%; height: auto; display: block;">
                    
                    <!-- Sparkle GIF Overlay with Mask -->
                    <img src="img/sverkat.gif" alt="Sparkles" style="
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        mix-blend-mode: screen;
                        pointer-events: none;
                        opacity: 0.9;
                        -webkit-mask-image: url(img/el2.png);
                        -webkit-mask-size: 100% 100%;
                        -webkit-mask-repeat: no-repeat;
                        -webkit-mask-position: center;
                        mask-image: url(img/el2.png);
                        mask-size: 100% 100%;
                        mask-repeat: no-repeat;
                        mask-position: center;
                        filter: brightness(2) contrast(1.2); /* Boost sparkle brightness */
                    ">
                    
                    <!-- Star Glow Effect -->
                    <div class="tree-star-glow"></div>
                </div>
            </div>

            <div class="sidebar-footer">
                JuicyPoint MVP v0.4
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', sidebarHTML);

        updateSidebarCartCount();
    }

    // Initialize Draggable/Floating Button
    initDraggableFab();
});

window.openSidebar = function () {
    // If user was dragging, do not open menu
    if (window.fabIsDragging) {
        window.fabIsDragging = false;
        return;
    }
    document.getElementById('sidebar').classList.add('active');
    document.getElementById('sidebar-overlay').classList.add('active');
    updateSidebarCartCount();
}

window.closeSidebar = function () {
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebar-overlay').classList.remove('active');
}

function updateSidebarCartCount() {
    try {
        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        const count = cart.reduce((sum, item) => sum + item.quantity, 0);
        const badge = document.getElementById('sidebar-cart-count');
        if (badge) {
            badge.textContent = count > 0 ? count : '';
            badge.style.display = count > 0 ? 'inline-block' : 'none';
        }
    } catch (e) { }
}

// Logic to make the button draggable and persistent
function initDraggableFab() {
    const fab = document.querySelector('.hamburger-btn');
    if (!fab) return;

    // 1. Restore saved position
    // 1. Restore saved position (CLAMPED)
    const savedPos = localStorage.getItem('juicy_fab_pos');
    if (savedPos) {
        try {
            const pos = JSON.parse(savedPos);
            // Re-calc boundaries on load
            const maxW = window.innerWidth - (fab.offsetWidth || 60);
            const maxH = window.innerHeight - (fab.offsetHeight || 60);

            const safeLeft = Math.max(0, Math.min(pos.left, maxW));
            const safeTop = Math.max(0, Math.min(pos.top, maxH));

            fab.style.left = safeLeft + 'px';
            fab.style.top = safeTop + 'px';
            fab.style.bottom = 'auto';
            fab.style.right = 'auto';
            fab.style.transform = 'none';
        } catch (e) {
            console.error('Error loading fab position', e);
        }
    }

    // 2. Drag Logic
    let offsetX, offsetY;
    let startPageX, startPageY;
    let isDraggingReal = false;

    const startDrag = (e) => {
        const touch = e.touches ? e.touches[0] : e;
        const rect = fab.getBoundingClientRect();

        offsetX = touch.clientX - rect.left;
        offsetY = touch.clientY - rect.top;

        startPageX = touch.clientX;
        startPageY = touch.clientY;

        isDraggingReal = false;

        // KILL TRANSITION for instant follow (fixes "lag")
        fab.style.transition = 'none';
    };

    const onDrag = (e) => {
        const touch = e.touches ? e.touches[0] : e;

        // Calculate Distance Moved
        const dist = Math.hypot(touch.clientX - startPageX, touch.clientY - startPageY);

        // Threshold: 5px (fixes "click blocked by micro-move")
        if (dist < 5) return;

        // If we crossed threshold, consume event
        if (e.cancelable) e.preventDefault();

        isDraggingReal = true;
        window.fabIsDragging = true; // Signal to click handler to block

        // New XY
        let x = touch.clientX - offsetX;
        let y = touch.clientY - offsetY;

        // Clamp
        const w = window.innerWidth;
        const h = window.innerHeight;
        const btnW = fab.offsetWidth;
        const btnH = fab.offsetHeight;

        x = Math.max(0, Math.min(x, w - btnW));
        y = Math.max(0, Math.min(y, h - btnH));

        fab.style.left = x + 'px';
        fab.style.top = y + 'px';
        fab.style.bottom = 'auto';
        fab.style.transform = 'none';
    };

    const endDrag = (e) => {
        // Restore Transition for hover effects
        fab.style.transition = '';

        if (isDraggingReal) {
            // Save final position
            const rect = fab.getBoundingClientRect();
            localStorage.setItem('juicy_fab_pos', JSON.stringify({
                left: rect.left,
                top: rect.top
            }));

            // Reset flag with delay
            setTimeout(() => {
                window.fabIsDragging = false;
            }, 100);
        } else {
            // It was a click (or tiny move)
            window.fabIsDragging = false;
        }
        isDraggingReal = false;
    };

    // Attach Events
    fab.addEventListener('touchstart', startDrag, { passive: false });
    fab.addEventListener('touchmove', onDrag, { passive: false });
    fab.addEventListener('touchend', endDrag);

    fab.addEventListener('mousedown', (e) => {
        startDrag(e);
        const mouseMove = (e) => {
            if (e.buttons !== 1) {
                mouseUp();
                return;
            }
            onDrag(e);
        };
        const mouseUp = () => {
            endDrag();
            document.removeEventListener('mousemove', mouseMove);
            document.removeEventListener('mouseup', mouseUp);
        };
        document.addEventListener('mousemove', mouseMove);
        document.addEventListener('mouseup', mouseUp);
    });
}
