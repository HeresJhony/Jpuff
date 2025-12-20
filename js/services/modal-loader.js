/**
 * Modal Loader Service
 * Dynamically loads modal HTML fragments into the DOM.
 */

// Cache loaded modals to avoid multiple network requests
const loadedModals = new Set();

/**
 * Loads a modal by its filename (without .html extension) from the 'modals/' directory.
 * @param {string} modalName - The name of the modal file (e.g., 'promo').
 */
export async function loadModal(modalName) {
    if (loadedModals.has(modalName)) {
        return; // Already loaded
    }

    try {
        const response = await fetch(`modals/${modalName}.html`);
        if (!response.ok) {
            throw new Error(`Failed to load modal: ${modalName}`);
        }
        const html = await response.text();
        document.body.insertAdjacentHTML('beforeend', html);
        loadedModals.add(modalName);
        console.log(`Modal loaded: ${modalName}`);
    } catch (error) {
        console.error('Error loading modal:', error);
    }
}
