// js/services/api.js
import { CONFIG, API_HEADERS } from '../config.js?v=FINAL_ORDERS_FIX_017';
console.log("🚀 API Loaded. Target URL:", CONFIG.ORDER_API_URL);

/**
 * Fetch all available products with stock > 0
 * @returns {Promise<Array>}
 */
export async function fetchProducts() {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/Products?stock=gt.0&select=*`;
    try {
        const response = await fetch(url, { headers: API_HEADERS });
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
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/Products?id=eq.${id}&select=stock`;
    try {
        const response = await fetch(url, { headers: API_HEADERS });
        if (!response.ok) throw new Error("Stock check failed");
        const data = await response.json();
        return data[0] ? Number(data[0].stock) : 0;
    } catch (e) {
        console.error("Stock check error:", e);
        throw e;
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
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(orderData)
        });
        if (!response.ok) throw new Error("Order submission network error");
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
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch orders");
        return await response.json();
    } catch (e) {
        console.error("Fetch orders error:", e);
        throw e;
    }
}

/**
 * Update stock directly from client (Plan B)
 * @param {string|number} productId - The system ID
 * @param {number} quantityToDeduct
 * @returns {Promise<boolean>}
 */
export async function updateProductStock(productId, quantityToDeduct) {
    try {
        // 1. Get current stock by ID
        // GET /rest/v1/Products?id=eq.{id}&select=stock
        const getUrl = `${CONFIG.SUPABASE_URL}/rest/v1/Products?id=eq.${productId}&select=stock`;
        const getResp = await fetch(getUrl, { headers: API_HEADERS });

        if (!getResp.ok) throw new Error("Find product failed");

        const data = await getResp.json();
        if (!data.length) return false;

        const currentStock = Number(data[0].stock);
        const newStock = Math.max(0, currentStock - quantityToDeduct);

        // 2. Update by ID
        // PATCH /rest/v1/Products?id=eq.{productId}
        const patchUrl = `${CONFIG.SUPABASE_URL}/rest/v1/Products?id=eq.${productId}`;
        const patchResp = await fetch(patchUrl, {
            method: 'PATCH',
            headers: API_HEADERS,
            body: JSON.stringify({ stock: String(newStock) })
        });

        if (!patchResp.ok) {
            console.error("Stock update failed", await patchResp.text());
            return false;
        }
        return true;

    } catch (e) {
        console.error("Client update error:", e);
        return false;
    }
}

/**
 * Fetch client data (profile, bonus balance, etc.)
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export async function fetchClientData(userId) {
    const url = `${CONFIG.ORDER_API_URL}?action=getClientData&user_id=${userId}&_t=${Date.now()}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch client data");
        return await response.json();
    } catch (e) {
        console.error("Fetch client data error:", e);
        // Fallback to avoid breaking UI
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
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch bonus history");
        return await response.json();
    } catch (e) {
        console.error("Fetch bonus history error:", e);
        return [];
    }
}
