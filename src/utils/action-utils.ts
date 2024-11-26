import * as core from '@actions/core'

import {
  BRANCH_VAR,
  COMMIT_SHA_VAR,
  GAFFER_API_KEY_VAR,
  REPORT_PATH_VAR,
  TEST_FRAMEWORK_VAR
} from '../constants'
import { TestRunTag } from '../types'

/**
 * Parses test run tags from GitHub Actions inputs.
 *
 * Reads commit SHA, branch name, and test framework inputs using the GitHub Actions core API.
 * For each non-empty input, creates a corresponding TestRunTag with the input value.
 *
 * @returns An array of TestRunTag objects containing the parsed input values
 */
export function parseTestRunTagsFromInputs(): TestRunTag[] {
  const testRunTags: TestRunTag[] = []
  const commitSha: string = core.getInput(COMMIT_SHA_VAR)
  const branch: string = core.getInput(BRANCH_VAR)
  const testFramework: string = core.getInput(TEST_FRAMEWORK_VAR)

  if (commitSha) {
    testRunTags.push({ key: 'commit_sha', value: commitSha })
  }

  if (branch) {
    testRunTags.push({ key: 'branch', value: branch })
  }

  if (testFramework) {
    testRunTags.push({ key: 'test_framework', value: testFramework })
  }

  return testRunTags
}

export function parseActionInputs(): { apiKey: string; reportPath: string } {
  const apiKey: string = core.getInput(GAFFER_API_KEY_VAR)
  const reportPath: string = core.getInput(REPORT_PATH_VAR)

  if (!apiKey) {
    throw new Error('Gaffer API key not provided.')
  }

  if (!reportPath) {
    throw new Error('Report path not provided.')
  }

  return { apiKey, reportPath }
}
