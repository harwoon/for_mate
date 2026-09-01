import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // /auth, /lost-posts 같은 요청을 백엔드(4000)로 넘겨준다.
    // 이렇게 하면 개발 중에 CORS 문제 없이 쿠키까지 그대로 주고받을 수 있다.
    proxy: {
      "/auth": "http://localhost:4000",
      "/lost-posts": "http://localhost:4000",
      "/found-posts": "http://localhost:4000",
      "/rescue-animals": "http://localhost:4000",
      "/matches": "http://localhost:4000",
      "/bookmarks": "http://localhost:4000",
      "/notifications": "http://localhost:4000",
      "/reports": "http://localhost:4000",
      "/inquiries": "http://localhost:4000",
      "/breeds": "http://localhost:4000",
      "/color-tags": "http://localhost:4000",
      "/regions": "http://localhost:4000",
      "/my": "http://localhost:4000",
      "/admin": "http://localhost:4000",
      "/pages": "http://localhost:4000",
      "/uploads": "http://localhost:4000"
    }
  }
})
