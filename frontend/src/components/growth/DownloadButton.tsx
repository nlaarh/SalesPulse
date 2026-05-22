import { Download } from 'lucide-react'
import { GROWTH_COLORS } from './tokens'
import { downloadCSV } from '@/lib/csvDownload'

interface DownloadButtonProps {
  filename: string
  rows: Record<string, unknown>[]
  label?: string
}

// Small "Download data" button shown next to each chart/section title.
// Click → CSV of the underlying data the chart was built from.
export default function DownloadButton({ filename, rows, label = 'Download data' }: DownloadButtonProps) {
  const disabled = !rows || rows.length === 0
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => downloadCSV(rows, filename)}
      className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md border transition-colors hover:bg-white disabled:opacity-50"
      style={{
        color: GROWTH_COLORS.navy,
        borderColor: GROWTH_COLORS.rule,
        backgroundColor: '#FFFFFF',
      }}
      title={disabled ? 'No data to download' : `Download ${filename}.csv`}
    >
      <Download className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}
