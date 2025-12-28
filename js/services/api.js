import { CONFIG, API_HEADERS } from '../config.js?v=FINAL_ORDERS_FIX_017';
console.log("🚀 API Loaded. Target URL:", CONFIG.ORDER_API_URL);

/**
 * Fetch all available products with stock > 0
 * @returns {Promise<Array>}
 */
export async function fetchProducts() {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/Products?stock=gt.0&select=*`;
    try {
        const response = await fetch(url, {
            headers: API_HEADERS,
            cache: 'no-store'
        });
        if (!response.ok) throw new Error(`Supabase error: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error("Fetch products failed:", e);
        throw e;
    }
}

/**
 * Fetch a single product by ID
 * @param {string|number} id 
 * @returns {Promise<Object|null>}
 */
export async function fetchProductById(id) {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/Products?id=eq.${id}&select=*`;
    try {
        const response = await fetch(url, { headers: API_HEADERS });
        if (!response.ok) throw new Error("Fetch specific product failed");
        const data = await response.json();
        return data[0] || null;
    } catch (e) {
        console.error("Fetch product details failed:", e);
        return null;
    }
}

/**
 * Check accumulated stock for a product
 * @param {string|number} id 
 * @returns {Promise<number>}
 */
export async function checkStock(id) {
    // Correct URL without extra parameters (Supabase rejects unknown params)
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/Products?id=eq.${id}&select=stock`;
    try {
        const response = await fetch(url, {
            headers: API_HEADERS,
            cache: 'no-store' // Critical: Do not use cached response
        });
        if (!response.ok) {
            console.warn(`Stock check failed for product ${id}: ${response.status}`);
            return 0; // Treat as out of stock
        }
        const data = await response.json();
        return data[0] ? Number(data[0].stock) : 0; // If product not found, return 0
    } catch (e) {
        console.error("Stock check error:", e);
        return 0; // Fail-safe: treat as out of stock to trigger modal
    }
}

/**
 * Submit order to Google Apps Script
 * @param {Object} orderData 
 * @returns {Promise<Object>}
 */
export async function submitOrder(orderData) {
    try {
        const response = await fetch(CONFIG.ORDER_API_URL, {
            method: 'POST',
            // Add API_HEADERS to include Authorization, plus Content-Type
            headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Server Error ${response.status}: ${errText}`);
        }
        const result = await response.json();
        console.log("[DEBUG] Google Script Response:", result);
        return result;
    } catch (e) {
        console.error("Order submit error:", e);
        throw e;
    }
}

/**
 * Fetch orders history for a user
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function fetchOrders(userId) {
    const url = `${CONFIG.ORDER_API_URL}?action=getOrders&user_id=${userId}&_t=${Date.now()}`;
    try {
        // FIX: Add Authorization headers
        const response = await fetch(url, { headers: API_HEADERS });
        if (!response.ok) throw new Error("Failed to fetch orders");
        return await response.json();
    } catch (e) {
        console.error("Fetch orders error:", e);
        throw e;
    }
}

// ... (skip lines) ...

export async function fetchClientData(userId) {
    // OPTIMIZATION: Use Direct DB Access (REST)
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/clients?user_id=eq.${userId}&select=*`;
    try {
        const response = await fetch(url, { headers: API_HEADERS });
        if (!response.ok) throw new Error("Failed to fetch client data");
        const data = await response.json();

        // Calculate Virtual Balance (Sync with Backend Logic)
        const client = data[0] || {};
        let balance = Number(client.bonus_balance) || 0;
        const totalOrders = Number(client.total_orders) || 0;

        // If this is a new user (0 orders), they have a virtual +100 Welcome Bonus
        // Backend 'handleNewOrder' also checks this.
        if (totalOrders === 0) {
            balance += 100;
        }

        return {
            ...client,
            bonus_balance: balance,
            total_orders: totalOrders
        };
    } catch (e) {
        console.error("Fetch client data error:", e);
        // Fallback
        return { bonus_balance: 0 };
    }
}

/**
 * Fetch bonus transaction history
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function fetchBonusHistory(userId) {
    const url = `${CONFIG.ORDER_API_URL}?action=getBonusHistory&user_id=${userId}&_t=${Date.now()}`;
    try {
        const response = await fetch(url, { headers: API_HEADERS });
        if (!response.ok) throw new Error("Failed to fetch bonus history");
        return await response.json();
    } catch (e) {
        console.error("Fetch bonus history error:", e);
        return [];
    }
}

/**
 * Fetch discount info by code
 * @param {string} code Promo code to check
 * @returns {Promise<Object>}
 */
export async function fetchDiscountInfo(code) {
    if (!code) return null;
    const url = `${CONFIG.ORDER_API_URL}?action=getDiscount&code=${encodeURIComponent(code)}&_t=${Date.now()}`;
    try {
        const response = await fetch(url, { headers: API_HEADERS });
        if (!response.ok) throw new Error("Failed to fetch discount info");
        const data = await response.json();
        // data looks like { found: true, active: true, value: 10, ... }
        return data;
    } catch (e) {
        console.error("Fetch discount info error:", e);
        return null; // Return null if network fails
    }
}

export async function registerReferralOnServer(userId, referrerId) {
    // ...
    const payload = {
        action: 'registerReferral',
        userId: userId,
        referrerId: referrerId
    };

    try {
        const response = await fetch(CONFIG.ORDER_API_URL, {
            method: 'POST',
            headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        // ... 
    } catch (e) {
        // ...
    }
}

export async function fetchReferralStats(userId) {
    const url = `${CONFIG.ORDER_API_URL}?action=getReferralStats&user_id=${userId}&_t=${Date.now()}`;
    try {
        const response = await fetch(url, { headers: API_HEADERS });
        if (!response.ok) throw new Error("Failed to fetch referral stats");
        return await response.json();
    } catch (e) {
        console.error("Fetch referral stats error:", e);
        return { total: 0, active: 0 };
    }
}


