import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AnalysisResult } from '../types/analysis'
import { uploadBuildFiles, type FileUploadPayload } from '../api/upload'
import { pollUntilReady } from '../api/analysis'

type Tab = 'overview' | 'memory' | 'symbols' | 'kconfig'
type MemoryView = 'treemap' | 'sunburst'

interface AnalysisStore {
  sessionId: string | null
  analysis: AnalysisResult | null
  isLoading: boolean
  uploadError: string | null
  activeTab: Tab
  symbolFilter: string
  kconfigFilter: string
  memoryViewMode: MemoryView

  uploadFiles: (files: FileUploadPayload) => Promise<string>
  loadSession: (sessionId: string) => Promise<void>
  setActiveTab: (tab: Tab) => void
  setSymbolFilter: (q: string) => void
  setKconfigFilter: (q: string) => void
  setMemoryViewMode: (mode: MemoryView) => void
  clearError: () => void
}

export const useAnalysisStore = create<AnalysisStore>()(
  persist(
    (set, get) => ({
      sessionId: null,
      analysis: null,
      isLoading: false,
      uploadError: null,
      activeTab: 'overview',
      symbolFilter: '',
      kconfigFilter: '',
      memoryViewMode: 'treemap',

      uploadFiles: async (files) => {
        set({ isLoading: true, uploadError: null })
        try {
          const response = await uploadBuildFiles(files)
          const analysis = await pollUntilReady(response.session_id)
          set({ sessionId: response.session_id, analysis, isLoading: false })
          return response.session_id
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Upload failed'
          set({ isLoading: false, uploadError: msg })
          throw err
        }
      },

      loadSession: async (sessionId) => {
        set({ isLoading: true, uploadError: null })
        try {
          const analysis = await pollUntilReady(sessionId)
          set({ sessionId, analysis, isLoading: false })
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to load session'
          set({ isLoading: false, uploadError: msg })
        }
      },

      setActiveTab: (tab) => set({ activeTab: tab }),
      setSymbolFilter: (q) => set({ symbolFilter: q }),
      setKconfigFilter: (q) => set({ kconfigFilter: q }),
      setMemoryViewMode: (mode) => set({ memoryViewMode: mode }),
      clearError: () => set({ uploadError: null }),
    }),
    {
      name: 'zba-session',
      partialize: (state) => ({ sessionId: state.sessionId }),
    }
  )
)
