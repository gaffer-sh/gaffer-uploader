import * as core from '@actions/core'

import { createUploadFormData, uploadToGaffer } from './utils/form-data-utils'
import {
  parseActionInputs,
  parseTestRunTagsFromInputs
} from './utils/action-utils'

export async function run(): Promise<void> {
  try {
    const {
      apiKey,
      reportPath,
      apiEndpoint,
      timeoutMs,
      maxFileSizeBytes,
      debug
    } = parseActionInputs()
    const form = createUploadFormData(
      reportPath,
      parseTestRunTagsFromInputs(),
      maxFileSizeBytes
    )
    const response = await uploadToGaffer(form, apiKey, apiEndpoint, timeoutMs)
    if (debug) {
      core.info(`[debug] API response: ${JSON.stringify(response.data)}`)
    }

    const session = response.data?.uploadSession ?? response.data?.testRun
    if (session?.id) core.setOutput('test_run_id', session.id)
    if (session?.projectId) core.setOutput('project_id', session.projectId)
    core.setOutput('status', 'success')
  } catch (error: unknown) {
    core.setFailed(
      error instanceof Error ? error.message : 'An unexpected error occurred'
    )
  }
}
