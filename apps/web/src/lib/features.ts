/**
 * The customer catalogue (landing page, browse, item/reserve, customer sign-up/login, My Orders)
 * stays OFF until it is fully built — the app is for the owner to run the store meanwhile.
 * While off, "/" opens the owner login and Share Kit captions leave out catalogue links.
 * Turn on by building the web app with VITE_CUSTOMER_PORTAL=true (and CUSTOMER_PORTAL_ENABLED=true on the API).
 */
export const CUSTOMER_PORTAL_ENABLED = import.meta.env.VITE_CUSTOMER_PORTAL === 'true';
