import multer from "multer"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// 디스크에 안 쓰고 메모리에만 잠깐 담아둔다
const storage = multer.memoryStorage()
const uploadLost = multer({ storage }).array("images", 8)
const uploadFound = multer({ storage }).array("images", 3)

// multer 처리 후, 실제로 Supabase Storage에 업로드하는 함수
async function uploadToSupabase(files) {
  const urls = []
  for (const file of files) {
    const filename = `${Date.now()}-${Math.round(Math.random() * 1000)}-${file.originalname}`
    const { error } = await supabase.storage
      .from("post-images")           // 버킷 이름 (Supabase 대시보드에서 미리 생성)
      .upload(filename, file.buffer, { contentType: file.mimetype })

    if (error) throw error

    const { data } = supabase.storage.from("post-images").getPublicUrl(filename)
    urls.push(data.publicUrl)
  }
  return urls
}

// 실종 공고용: multer로 받고 → Supabase 업로드까지 한 번에
export function uploadLostImages(req, res, next) {
  uploadLost(req, res, async (err) => {
    if (err) return next(err)
    try {
      req.imageUrls = await uploadToSupabase(req.files)
      next()
    } catch (e) {
      next(e)
    }
  })
}

// 발견제보용
export function uploadFoundImages(req, res, next) {
  uploadFound(req, res, async (err) => {
    if (err) return next(err)
    try {
      req.imageUrls = await uploadToSupabase(req.files)
      next()
    } catch (e) {
      next(e)
    }
  })
}