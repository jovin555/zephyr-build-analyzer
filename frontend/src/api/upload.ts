import client from './client'
import type { UploadResponse } from '../types/analysis'

export interface FileUploadPayload {
  elfFile?: File
  mapFile?: File
  configFile?: File
  dtsFile?: File
}

export async function uploadBuildFiles(payload: FileUploadPayload): Promise<UploadResponse> {
  const form = new FormData()
  if (payload.elfFile) form.append('elf_file', payload.elfFile)
  if (payload.mapFile) form.append('map_file', payload.mapFile)
  if (payload.configFile) form.append('config_file', payload.configFile)
  if (payload.dtsFile) form.append('dts_file', payload.dtsFile)

  const { data } = await client.post<UploadResponse>('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}
