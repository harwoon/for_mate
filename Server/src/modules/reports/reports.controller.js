import * as service from "./reports.service.js"
import { created } from "../../utils/response.js"

// 10.1 게시글 신고
export async function createReport(req, res, next) {
    try {
        const report = await service.createReport(req.userId, req.body)

        created(res, report)
    } catch (err) {
        next(err)
    }
}