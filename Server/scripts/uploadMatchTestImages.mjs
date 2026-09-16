// 매칭 테스트 데이터 넣는용
import { readFile } from "node:fs/promises"
import sharp from "sharp"
import { uploadToR2 } from "../src/utils/r2.js"

const paths = process.argv.slice(2)

if (paths.length === 0) {
    console.error("업로드할 이미지 경로를 입력해주세요.")
    process.exit(1)
}

for (const path of paths) {
    try {
        const buffer = await readFile(path)

        const compressed = await sharp(buffer)
            .resize(1600, 1600, {
                fit: "inside",
                withoutEnlargement: true
            })
            .jpeg({
                quality: 80
            })
            .toBuffer()

        const result = await uploadToR2(
            compressed,
            "match-test"
        )

        console.log("")
        console.log("원본:", path)
        console.log("URL:", result.url)
        console.log("KEY:", result.key)
    } catch (error) {
        console.error(
            `업로드 실패: ${path}`,
            error
        )
    }
}