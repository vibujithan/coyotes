'use client'

import dynamic from 'next/dynamic'

const ReportMap = dynamic(() => import('../components/ReportMap'), { ssr: false })

export default function ReportPage() {
  return <ReportMap />
}
