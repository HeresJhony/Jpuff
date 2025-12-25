/**
 * Cart Storage Utility
 * Centralized and safe cart management with error handling
 */

/**
 * Safely parse JSON from localStorage
 * @param {string} key - localStorage key
 * @param {any} defaultValue - default value if parsing fails
 * @returns {any} parsed value or default
 */
export function safeGetItem(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        if (item === null) return defaultValue;
        return JSON.parse(item);
    } catch (error) {
        console.error(`Failed to parse localStorage item '${key}':`, error);
        // Clear corrupted data
        localStorage.removeItem(key);
        return defaultValue;
    }
}

/**
 * Safely set item to localStorage
 * @param {string} key - localStorage key
 * @param {any} value - value to store
 * @returns {boolean} success status
 */
export function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error(`Failed to set localStorage item '${key}':`, error);
        return false;
    }
}

/**
 * Get cart from localStorage safely
 * @returns {Array} cart items
 */
export function getCart() {
    return safeGetItem('cart', []);
}

/**
 * Save cart to localStorage safely
 * @param {Array} cart - cart items
 * @returns {boolean} success status
 */
export function saveCart(cart) {
    return safeSetItem('cart', cart);
}

/**
 * Clear cart
 */
export function clearCart() {
    localStorage.removeItem('cart');
}
