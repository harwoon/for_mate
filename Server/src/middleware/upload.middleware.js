import multer from "multer"

// 업로드한 이미지를 uploads 폴더에 저장한다
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/")
  },
  filename: (req, file, cb) => {
    const ext = file.originalname.split(".").pop()
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1000)}.${ext}`)
  }
})

// 실종 공고: 최대 8장
export const uploadLostImages = multer({ storage }).array("images", 8)

// 발견제보: 최대 3장
export const uploadFoundImages = multer({ storage }).array("images", 3)
