import type { DetailedShowMeta } from '../../types/player'
import { getAnimeMetaDetails } from '../../lib/animeMeta'

interface AnimeMetaDetailsProps {
  showMeta: Partial<DetailedShowMeta> | undefined
  styles: {
    detailsGridContainer: string
    detailItem: string
  }
}

export default function AnimeMetaDetails({ showMeta, styles }: AnimeMetaDetailsProps) {
  const metaDetails = getAnimeMetaDetails(showMeta)

  return (
    <div className={styles.detailsGridContainer}>
      {metaDetails.map((detail) => (
        <div className={styles.detailItem} key={detail.label}>
          <strong>{detail.label}</strong>
          <span>{detail.value}</span>
        </div>
      ))}
    </div>
  )
}
