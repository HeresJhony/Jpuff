/**
 * Referral URL Handler
 * Processes referral links when user opens the app
 */

import { getUserId } from './user-id.js';
import { setReferrer, trackReferralClick } from './bonus-system.js';
import { registerReferralOnServer } from './api.js';

/**
 * Check and process referral parameter from URL
 * Call this on app initialization
 */
export function processReferralLink() {
    // Check if opened via Telegram with start parameter
    const tg = window.Telegram?.WebApp;

    // NEW: Mini Apps use 'initDataUnsafe.start_param' for deep links with ?start=
    // But we updated our link to use /app?startapp= which goes to different field
    // However, for backwards compatibility, check both
    const startParam = tg?.initDataUnsafe?.start_param;

    // Only process if it's NOT a promo code (those start with DISCOUNT_)
    if (startParam && !startParam.startsWith('DISCOUNT_')) {
        handleReferralCode(startParam);
        return;
    }

    // Check URL parameters for web version
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref') || urlParams.get('referral');

    if (refCode) {
        handleReferralCode(refCode);
    }
}

/**
 * Handle referral code
 */
async function handleReferralCode(referrerId) {
    const currentUserId = getUserId();

    console.log(`Processing referral: User ${currentUserId} -> Referrer ${referrerId}`);

    // Track click locally
    trackReferralClick(referrerId);

    // 1. Try to register on Server immediately (Source of Truth)
    // This handles the "Ghost Referrer" creation and linking in DB
    const serverResult = await registerReferralOnServer(currentUserId, referrerId);

    // 2. Update LocalStorage based on attempt
    // If we are just testing or user is new, we FORCE the update in local storage
    // to prevent "stuck" old referrer IDs from previous tests.
    // In prod, serverResult logic will prevent changing referrer if already set in DB.

    // Always update local if it's different, assuming server handles the "first-time-only" logic
    // This fixes the issue where browser remembers old test ID.
    localStorage.setItem('juicy_referrer_' + currentUserId, referrerId);
    console.log('Referrer locally updated to:', referrerId);

    if (serverResult && serverResult.success) {
        console.log('✅ Server confirmed referral link!');
        // Could show a toast here "You were invited by..."
    }
}

/**
 * Initialize referral system on app load
 */
export function initReferralSystem() {
    processReferralLink();
}
