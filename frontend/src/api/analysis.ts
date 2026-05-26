import client from './client'
import type { AnalysisResult, SessionInfo } from '../types/analysis'

export async function fetchAnalysis(sessionId: string): Promise<AnalysisResult> {
  const { data } = await client.get<AnalysisResult>(`/analysis/${sessionId}`)
  return data
}

export async function fetchSessions(): Promise<SessionInfo[]> {
  const { data } = await client.get<SessionInfo[]>('/sessions')
  return data
}

export async function deleteSession(sessionId: string): Promise<void> {
  await client.delete(`/sessions/${sessionId}`)
}

export async function pollUntilReady(
  sessionId: string,
  maxAttempts = 30,
  intervalMs = 1000,
): Promise<AnalysisResult> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await fetchAnalysis(sessionId)
    if (result.status === 'ready') return result
    if (result.status === 'error') throw new Error('Analysis failed on server')
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error('Analysis timed out')
}
