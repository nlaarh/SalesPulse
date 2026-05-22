import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sparkles, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { GROWTH_COLORS } from './tokens'

interface AINarrativeProps {
  section: string
  /** Optional facts payload posted to the endpoint to ground the narrative */
  context?: Record<string, unknown>
}

interface NarrativeResponse {
  narrative: string
  cached?: boolean
}

export default function AINarrative({ section, context }: AINarrativeProps) {
  const { data, isLoading, refetch, isFetching } = useQuery<NarrativeResponse>({
    queryKey: ['growth-narrative', section, JSON.stringify(context || {})],
    queryFn: async () => {
      const { data } = await api.post('/api/growth/narrative', { section, context: context || {} })
      return data as NarrativeResponse
    },
    staleTime: 60 * 60_000, // 1 hour
    refetchOnWindowFocus: false,
  })

  return (
    <div
      className="relative overflow-hidden rounded-xl border p-5"
      style={{
        backgroundColor: '#F8FAFB',
        borderColor: GROWTH_COLORS.rule,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${GROWTH_COLORS.teal}15` }}
          >
            <Sparkles className="w-3.5 h-3.5" style={{ color: GROWTH_COLORS.teal }} />
          </div>
          <p
            className="text-[10px] font-semibold tracking-[0.22em] uppercase"
            style={{ color: GROWTH_COLORS.teal }}
          >
            AI Analyst Briefing
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-white disabled:opacity-50"
          style={{ color: GROWTH_COLORS.inkSoft }}
          title="Regenerate"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Generating…' : 'Regenerate'}
        </button>
      </div>

      {isLoading ? (
        <p className="text-[13px]" style={{ color: GROWTH_COLORS.inkSoft }}>
          Generating AI analysis…
        </p>
      ) : data?.narrative ? (
        <div
          className="prose prose-sm max-w-none text-[14px] leading-relaxed"
          style={{ color: GROWTH_COLORS.ink }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {data.narrative}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="text-[13px]" style={{ color: GROWTH_COLORS.inkSoft }}>
          AI narrative unavailable. Check OpenAI API key in App Settings.
        </p>
      )}
    </div>
  )
}
