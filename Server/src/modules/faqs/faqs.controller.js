import { getFaqs as getPublishedFaqs } from "./faqs.service.js"
import { ok } from "../../utils/response.js"

export async function getFaqs(req, res, next) {
    try {
        ok(res, await getPublishedFaqs())
    } catch (error) {
        next(error)
    }
}
