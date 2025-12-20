/**
 * User Identity and QR Code Service
 * Manages unique user identification and QR code generation.
 */

// Key for local storage persistence for non-Telegram users
const DEVICE_ID_KEY = 'juicy_device_id';

/**
 * Retrieves the unique user ID.
 * Priority:
 * 1. Telegram WebApp User ID (Permanent & Unique per Telegram account)
 * 2. Generated specific ID stored in LocalStorage (Permanent per browser/device)
 * 
 * @returns {string|number} The unique user ID
 */
export function getUserId() {
    // 1. Try Telegram ID
    const tg = window.Telegram?.WebApp;
    if (tg?.initDataUnsafe?.user?.id) {
        return tg.initDataUnsafe.user.id;
    }

    // 2. Try LocalStorage
    let storedId = localStorage.getItem(DEVICE_ID_KEY);
    if (storedId) {
        return storedId;
    }

    // 3. Generate new ID if none exists
    const newId = `web_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    localStorage.setItem(DEVICE_ID_KEY, newId);
    return newId;
}

/**
 * Generates a URL for the User's unique QR code.
 * Uses the API: https://api.qrserver.com/
 * 
 * @param {number} size - Width/Height in pixels (default 200)
 * @returns {string} URL to the QR code image
 */
export function getUserQrUrl(size = 200) {
    const userId = getUserId();
    // Encode the ID to ensure valid URL
    const data = encodeURIComponent(userId);
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${data}&color=000000&bgcolor=ffffff`;
}

/**
 * Generates an SVG string for the QR code (if client-side rendering is needed later)
 * Note: For MVP, the URL method above is preferred.
 */
export async function getUserQrBlob(size = 200) {
    const url = getUserQrUrl(size);
    try {
        const resp = await fetch(url);
        if (resp.ok) {
            return await resp.blob();
        }
    } catch (e) {
        console.error("Failed to fetch QR blob", e);
    }
    return null;
}

/**
 * Checks for start parameters (Deep Linking) from Telegram
 * e.g. t.me/bot?start=DISCOUNT_TRAVELER
 */
export function checkStartParams() {
    const tg = window.Telegram?.WebApp;
    // 1. Check Telegram Start Param
    const startParam = tg?.initDataUnsafe?.start_param;

    if (startParam) {
        console.log("🚀 Start Param Detected:", startParam);

        if (startParam === 'DISCOUNT_TRAVELER') {
            localStorage.setItem('juicy_active_promo', 'TRAVELER');
            // Show toast if possible, or just log
            console.log("✅ Promo Code TRAVELER activated!");
        }
    }
}

export function getActivePromoCode() {
    return localStorage.getItem('juicy_active_promo');
}

// Auto-run check on import
checkStartParams();
