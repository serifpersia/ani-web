import { lazy, Suspense } from 'react'
import { Navigate, useParams, Route, Routes } from 'react-router-dom'
import TopProgressBar from '../components/common/TopProgressBar'

const AnimeInfo = lazy(() => import('../components/anime/AnimeInfo'))

export default function AnimeInfoPage() {
  return (
    <Suspense fallback={<TopProgressBar />}>
      <AnimeInfo />
    </Suspense>
  )
}
