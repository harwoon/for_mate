import * as service from "./faqs.service.js"
import { created, ok } from "../../utils/response.js"

export async function getFaqs(req, res, next) {
    try {
        ok(res, await service.getFaqs())
    } catch (error) {
        next(error)
    }
}

export async function getAdminFaqs(req, res, next) {
    try {
        ok(res, await service.getAdminFaqs())
    } catch (error) {
        next(error)
    }
}

export async function createFaq(req, res, next) {
    try {
        created(res, await service.createFaq(req.userId, req.body))
    } catch (error) {
        next(error)
    }
}

export async function updateFaq(req, res, next) {
    try {
        ok(res, await service.updateFaq(req.userId, req.params.faqId, req.body))
    } catch (error) {
        next(error)
    }
}

export async function updateFaqStatus(req, res, next) {
    try {
        ok(
            res,
            await service.updateFaqStatus(req.userId, req.params.faqId, req.body.status)
        )
    } catch (error) {
        next(error)
    }
}

export async function updateFaqOrder(req, res, next) {
    try {
        ok(res, await service.updateFaqOrder(req.userId, req.body.items))
    } catch (error) {
        next(error)
    }
}

export async function deleteFaq(req, res, next) {
    try {
        ok(res, await service.deleteFaq(req.params.faqId))
    } catch (error) {
        next(error)
    }
}
