
import { CONFIG } from './config.js?v=TRACKER';

(function () {
    console.log("🕵️ Visitor Tracker Init");
    const tg = window.Telegram?.WebApp;
    if (tg && tg.initDataUnsafe?.user?.id) {
        const userId = String(tg.initDataUnsafe.user.id);
        const hasTracked = sessionStorage.getItem('visit_tracked');

        // Track once per session to reduce load, OR track always if backend handles idempotency efficiently.
        // Backend 'registerVisit' checks existing user, so it's safe to call multiple times but wasteful.
        // Let's call it once per session reload.
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
})();
