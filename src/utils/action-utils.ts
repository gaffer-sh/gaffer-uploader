import * as core from '@actions/core'

import {
  ACTIONS_ID_TOKEN_REQUEST_TOKEN_VAR,
  ACTIONS_ID_TOKEN_REQUEST_URL_VAR,
  API_ENDPOINT_VAR,
  BRANCH_VAR,
  COMMIT_SHA_VAR,
  DEBUG_VAR,
  DEFAULT_MAX_FILE_SIZE_MB,
  DEFAULT_TIMEOUT_SECONDS,
  GAFFER_API_KEY_VAR,
  GAFFER_UPLOAD_BASE_URL,
  GAFFER_UPLOAD_TOKEN_VAR,
  MAX_FILE_SIZE_VAR,
  REPORT_PATH_VAR,
  TEST_FRAMEWORK_VAR,
  TEST_SUITE_VAR,
  UPLOAD_TIMEOUT_VAR
} from '../constants'
import { TestRunTags } from '../types'

/**
 * True when this job has `permissions: id-token: write` — GitHub Actions
 * only populates both of these env vars in that case. When true and no
 * token input was given, `parseActionInputs` returns `apiKey: undefined`
 * instead of throwing, so `buildCliArgs` (main.ts) omits `--token` and the
 * `gaffer` CLI exchanges the runner's own OIDC identity for a project token
 * (see packages/cli/src/oidc.rs in gaffer-sh/gaffer). Not an Action input,
 * so this reads env vars directly rather than `core.getInput()`.
 */
export function hasGitHubActionsOidc(): boolean {
  return Boolean(
    process.env[ACTIONS_ID_TOKEN_REQUEST_URL_VAR] &&
    process.env[ACTIONS_ID_TOKEN_REQUEST_TOKEN_VAR]
  )
}

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
  apiKey: string | undefined
  reportPath: string
  apiEndpoint: string
  timeoutMs: number
  maxFileSizeBytes: number
  debug: boolean
} {
  const uploadToken: string = core.getInput(GAFFER_UPLOAD_TOKEN_VAR)
  const legacyApiKey: string = core.getInput(GAFFER_API_KEY_VAR)
  const reportPath: string = core.getInput(REPORT_PATH_VAR)
  const apiEndpoint: string =
    core.getInput(API_ENDPOINT_VAR) || GAFFER_UPLOAD_BASE_URL

  const timeoutSeconds: number =
    parseInt(core.getInput(UPLOAD_TIMEOUT_VAR), 10) || DEFAULT_TIMEOUT_SECONDS
  const maxFileSizeMb: number =
    parseInt(core.getInput(MAX_FILE_SIZE_VAR), 10) || DEFAULT_MAX_FILE_SIZE_MB
  const debug: boolean = core.getInput(DEBUG_VAR) === 'true'

  // Support both gaffer_upload_token (preferred) and gaffer_api_key
  // (deprecated). Neither is required: with no token input, a job that
  // grants `permissions: id-token: write` can still authenticate, because
  // the CLI itself exchanges the runner's OIDC identity (see
  // hasGitHubActionsOidc above). A stored token still takes precedence when
  // both are available.
  let apiKey: string | undefined
  if (uploadToken) {
    apiKey = uploadToken
  } else if (legacyApiKey) {
    core.warning(
      'gaffer_api_key is deprecated. Please use gaffer_upload_token instead.'
    )
    apiKey = legacyApiKey
  } else if (hasGitHubActionsOidc()) {
    apiKey = undefined
  } else {
    throw new Error(
      'Upload token not provided. Set the gaffer_upload_token input ' +
        '(e.g. a GAFFER_UPLOAD_TOKEN repository secret), or grant this job ' +
        '`permissions: id-token: write` so the gaffer CLI can authenticate ' +
        'via GitHub Actions OIDC instead.'
    )
  }

  if (!reportPath) {
    throw new Error('Report path not provided.')
  }

  return {
    apiKey,
    reportPath,
    apiEndpoint,
    timeoutMs: timeoutSeconds * 1000,
    maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
    debug
  }
}
