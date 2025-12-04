import * as core from '@actions/core'

import {
  API_ENDPOINT_VAR,
  BRANCH_VAR,
  COMMIT_SHA_VAR,
  GAFFER_API_KEY_VAR,
  GAFFER_UPLOAD_BASE_URL,
  REPORT_PATH_VAR,
  TEST_FRAMEWORK_VAR,
  TEST_SUITE_VAR
} from '../constants'
import { TestRunTags } from '../types'

/**
 * Parses test run tags from GitHub Actions inputs.
 *
 * Reads commit SHA, branch name, test framework, and test suite inputs using the GitHub Actions core API.
 * Maps input names to v2 API camelCase format.
 *
 * @returns A TestRunTags object containing the parsed input values
 */
export function parseTestRunTagsFromInputs(): TestRunTags {
  const commitSha: string = core.getInput(COMMIT_SHA_VAR)
  const branch: string = core.getInput(BRANCH_VAR)
  const testFramework: string = core.getInput(TEST_FRAMEWORK_VAR)
  const testSuite: string = core.getInput(TEST_SUITE_VAR)

  const tags: TestRunTags = {}

  if (commitSha) {
    tags.commitSha = commitSha
  }

  if (branch) {
    tags.branch = branch
  }

  if (testFramework) {
    tags.framework = testFramework
  }

  if (testSuite) {
    tags.testSuite = testSuite
  }

  return tags
}

export function parseActionInputs(): {
  apiKey: string
  reportPath: string
  apiEndpoint: string
} {
  const apiKey: string = core.getInput(GAFFER_API_KEY_VAR)
  const reportPath: string = core.getInput(REPORT_PATH_VAR)
  const apiEndpoint: string =
    core.getInput(API_ENDPOINT_VAR) || GAFFER_UPLOAD_BASE_URL

  if (!apiKey) {
    throw new Error('Gaffer API key not provided.')
  }

  if (!reportPath) {
    throw new Error('Report path not provided.')
  }

  return { apiKey, reportPath, apiEndpoint }
}
