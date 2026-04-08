import * as core from '@actions/core'

import { createUploadFormData, uploadToGaffer } from './utils/form-data-utils'
import {
  parseActionInputs,
  parseTestRunTagsFromInputs
} from './utils/action-utils'

export async function run(): Promise<void> {
  try {
    const { apiKey, reportPath, apiEndpoint } = parseActionInputs()
    const form = createUploadFormData(reportPath, parseTestRunTagsFromInputs())
    const response = await uploadToGaffer(form, apiKey, apiEndpoint)
    const data = response.data ?? {}

    core.setOutput('status', 'success')
    if (data.runId) core.setOutput('run_id', data.runId)
    if (data.reportUrl) core.setOutput('report_url', data.reportUrl)
  } catch (error: unknown) {
    core.setFailed(
      error instanceof Error ? error.message : 'An unexpected error occurred'
    )
  }
}
