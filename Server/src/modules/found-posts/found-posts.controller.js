import * as service from "./found-posts.service.js"
import { ok, created } from "../../utils/response.js"
import { removeUploadedFoundFiles } from "./found-posts.upload.js"


// 4.1 발견제보 등록
export async function createPost(req, res, next) {
    try {
        const post = await service.createPost({
			userId: req.userId,
			body: req.body,
			imageUrls: req.imageUrls ?? []
        })

        created(res, post)
    } catch (err) {
        // DB/입력 검증 실패 시 먼저 저장된 로컬 이미지 정리
        await removeUploadedFoundFiles(
            req.files ?? [],
        )
        next(err)
    }
}

// 4.2 발견제보 목록 조회
export async function getPosts( req, res, next) {
    try {
        const result = await service.getPosts(req.query)
        ok(res, result)
    } catch (err) {
        next(err)
    }
}

// 4.3 발견제보 상세 조회
export async function getPost(req, res, next) {
    try {
        const post = await service.getPost({
			postId: req.params.id,
			userId: req.userId
		})

        ok(res, post)
    } catch (err) {
        next(err)
    }
}

// 4.4 발견제보 수정
export async function updatePost(req, res, next) {
    try {
        const post = await service.updatePost({
			postId:req.params.id,
			userId:req.userId,
			body: req.body,
			imageUrls: req.imageUrls ?? []
        })

        ok(res, post)
    } catch (err) {
        // 수정 실패 시 새로 올린 파일만 제거
        if (!err.dbCommitted) {
            await removeUploadedFoundFiles(req.files ?? [])
        }
        next(err)
    }
}

// 4.4 발견제보 삭제
export async function deletePost(req, res, next) {
    try {
        const result = await service.deletePost({
			postId: req.params.id,
			userId: req.userId
		})

        ok(res, result)
    } catch (err) {
        next(err)
    }
}
