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
    await uploadToGaffer(form, apiKey, apiEndpoint)
    core.setOutput('status', 'success')
  } catch (error: unknown) {
    core.setFailed(
      error instanceof Error ? error.message : 'An unexpected error occurred'
    )
  }
}
