import { getUserId } from './services/user-id.js';

document.addEventListener('DOMContentLoaded', async () => {
    const tg = window.Telegram?.WebApp;
    if (tg) tg.expand();

    const userId = getUserId();
    console.log("Bonuses Page: User ID:", userId);

    loadReferralStats(userId);
});

/**
 * Load and Display Referral Statistics
 */
function loadReferralStats(userId) {
    // Storage keys for referral data
    const STATS_KEY = `juicy_referral_stats_${userId}`;

    // Get stats from localStorage (or could be fetched from backend in future)
    let stats = localStorage.getItem(STATS_KEY);

    if (!stats) {
        // Default stats
        stats = {
            totalReferrals: 0,
            activeReferrals: 0,
            earnedBonuses: 0,
            linkClicks: 0
        };
        localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } else {
        stats = JSON.parse(stats);
    }

    // Update UI
    document.getElementById('total-referrals').textContent = stats.totalReferrals || 0;
    document.getElementById('active-referrals').textContent = stats.activeReferrals || 0;
    document.getElementById('earned-bonuses').textContent = stats.earnedBonuses || 0;
    document.getElementById('link-clicks').textContent = stats.linkClicks || 0;
}

/**
 * Helper function to update referral stats (for future use)
 */
export function updateReferralStats(userId, updates) {
    const STATS_KEY = `juicy_referral_stats_${userId}`;
    let stats = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');

    stats = { ...stats, ...updates };
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));

    // Also update total bonus
    const BONUS_KEY = 'juicy_bonus_' + userId;
    if (updates.earnedBonuses !== undefined) {
        localStorage.setItem(BONUS_KEY, String(updates.earnedBonuses));
    }
}
