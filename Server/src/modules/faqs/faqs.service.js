import { findPublished } from "./faqs.repository.js"

export async function getFaqs() {
    return { items: await findPublished() }
}
