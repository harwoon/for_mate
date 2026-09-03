// 피그마: U-02 찾고있어요
//
// 구현할 내용:
// - FilterBar + FilterModal 연결
// - getLostPosts로 목록 조회 후 PostGrid + PostCard 렌더
// - Pagination 연결
// - 결과 0건이면 Empty (U-02-N01)

import { useEffect, useState } from "react"
import { getLostPosts } from "../../api/lostPosts.api.js"
import FilterBar from "../../components/post/FilterBar.jsx"
import FilterModal from "../../components/post/FilterModal.jsx"
import PostGrid from "../../components/post/PostGrid.jsx"
import PostCard from "../../components/post/PostCard.jsx"
import Pagination from "../../components/common/Pagination.jsx"
import Loading from "../../components/common/Loading.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Empty from "../../components/common/Empty.jsx"

export default function LostListPage() {
  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">찾고있어요</h1>
      </div>

      {/* TODO: 위 주석의 내용을 구현하세요 */}
    </div>
  )
}
