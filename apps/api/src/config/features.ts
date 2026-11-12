/**
 * The customer catalogue (public browse, customer sign-up/login, reserve, my-orders) stays OFF
 * until it is fully built — the app is for the owner to run the store meanwhile. While off,
 * WhatsApp replies leave out catalogue links. Owner marketing (campaigns, Share Kit, keyword
 * replies) is unaffected.
 * Turn on with CUSTOMER_PORTAL_ENABLED=true (API) and VITE_CUSTOMER_PORTAL=true (web build).
 */
export const customerPortalEnabled = (): boolean => process.env.CUSTOMER_PORTAL_ENABLED === 'true';
