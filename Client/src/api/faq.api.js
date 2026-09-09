import { get } from "./client.js"

// Unwrap the items for the existing SupportPage array contract.
export const getFaqs = async () => (await get("/faqs")).items
