/**
 * Bonus System Service (Client Side)
 * Manages local cache of bonuses and syncs with server.
 */

import { fetchClientData } from './api.js';

// Storage keys
const BONUS_KEY_PREFIX = 'juicy_bonus_';
const REFERRER_KEY = 'juicy_referrer_';
const STATS_KEY_PREFIX = 'juicy_referral_stats_';

/**
 * Get user's current bonus balance from Local Cache
 * (Call syncBonuses to ensure it's up to date)
 */
export function getUserBonuses(userId) {
    const bonuses = localStorage.getItem(BONUS_KEY_PREFIX + userId);
    return parseInt(bonuses) || 0;
}

/**
 * Sync bonuses with Server
 * Fetches real balance from DB and updates local cache.
 */
export async function syncBonuses(userId) {
    if (!userId || userId === 'UNKNOWN') return 0;

    try {
        const clientData = await fetchClientData(userId);

        // Update Bonus Balance
        const freshBalance = clientData.bonus_balance || 0;
        localStorage.setItem(BONUS_KEY_PREFIX + userId, String(freshBalance));

        // Update Stats (Optional, if we display them somewhere)
        // localStorage.setItem(STATS_KEY_PREFIX + userId, JSON.stringify(clientData));

        return freshBalance;
    } catch (e) {
        console.error("Bonus Sync Failed", e);
        // Return cached if fail
        return getUserBonuses(userId);
    }
}

/**
 * Set referrer for a user (called when user signs up via referral link)
 */
export function setReferrer(userId, referrerId) {
    // Don't set if already has referrer or if referring themselves
    if (userId === referrerId) return false;

    const existingReferrer = localStorage.getItem(REFERRER_KEY + userId);
    if (existingReferrer) return false;

    localStorage.setItem(REFERRER_KEY + userId, referrerId);
    return true;
}

/**
 * Get user's referrer
 */
export function getReferrer(userId) {
    return localStorage.getItem(REFERRER_KEY + userId);
}

/**
 * Track referral link click
 */
export function trackReferralClick(referrerId) {
    // Just log for now
    console.log("Referral link clicked:", referrerId);
}
