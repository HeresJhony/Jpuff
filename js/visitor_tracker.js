import { CONFIG } from './config.js?v=TRACKER';
import { getUserId } from './services/user-id.js';

(function () {
    console.log("🕵️ Visitor Tracker & TG Init");
    const tg = window.Telegram?.WebApp;

    // 1. Initialize Telegram Web App UI
    if (tg) {
        try {
            tg.expand();
            tg.setHeaderColor('#050510');
            tg.setBackgroundColor('#050510');
            if (tg.requestFullscreen) {
                tg.requestFullscreen();
            }
            tg.ready();
            console.log("✅ TG UI Initialized");
        } catch (e) {
            console.warn("TG UI Init Error:", e);
        }
    }

    // 2. Track Visit
    const userId = getUserId();
    if (userId && userId !== 'UNKNOWN') {
        const hasTracked = sessionStorage.getItem('visit_tracked');

        // Track once per session
        if (!hasTracked) {
            console.log("🕵️ Tracking visit for:", userId);

            fetch(CONFIG.ORDER_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'registerVisit',
                    userId: userId
                })
            })
                .then(r => r.json())
                .then(res => {
                    console.log("✅ Visit Registered:", res);
                    sessionStorage.setItem('visit_tracked', 'true');
                })
                .catch(e => console.error("❌ Visit Tracking Error:", e));
        }
    }
    // 3. AUTO-HEAL: Check for delayed Telegram ID injection
    // If we are currently "Guest" (web_), but TG data appears later, we RELOAD to fix it.
    const currentId = getUserId();
    if (String(currentId).startsWith('web_')) {
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

            if (tgUser && tgUser.id) {
                console.log("✨ Telegram ID detected late! Reloading to sync...");
                // Remove the fake guest ID so next load picks up the real one
                localStorage.removeItem('juicy_device_id');
                clearInterval(interval);
                window.location.reload();
            }

            if (attempts > 50) clearInterval(interval); // Check for 5 seconds
        }, 100);
    }

})();
