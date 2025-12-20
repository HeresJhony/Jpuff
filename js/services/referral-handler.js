/**
 * Referral URL Handler
 * Processes referral links when user opens the app
 */

import { getUserId } from './user-id.js';
import { setReferrer, trackReferralClick } from './bonus-system.js';

/**
 * Check and process referral parameter from URL
 * Call this on app initialization
 */
export function processReferralLink() {
    // Check if opened via Telegram with start parameter
    const tg = window.Telegram?.WebApp;
    const startParam = tg?.initDataUnsafe?.start_param;

    if (startParam) {
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
function handleReferralCode(referrerId) {
    const currentUserId = getUserId();

    // Track click
    trackReferralClick(referrerId);

    // Set referrer (only works if user doesn't have one yet)
    const success = setReferrer(currentUserId, referrerId);

    if (success) {
        console.log('Referrer set:', referrerId);
        // Could show a welcome message here
    }
}

/**
 * Initialize referral system on app load
 */
export function initReferralSystem() {
    processReferralLink();
}
