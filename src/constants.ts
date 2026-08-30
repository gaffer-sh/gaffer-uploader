// Gaffer Constants
export const GAFFER_UPLOAD_BASE_URL = 'https://app.gaffer.sh/api/upload'
export const AXIOS_TIMEOUT_MS = 30000
export const MAX_UPLOAD_RETRIES = 3
export const GAFFER_UPLOAD_TOKEN_VAR = 'gaffer_upload_token'
export const GAFFER_API_KEY_VAR = 'gaffer_api_key' // Deprecated - kept for backward compatibility
export const REPORT_PATH_VAR = 'report_path'
export const API_ENDPOINT_VAR = 'api_endpoint'
export const UPLOAD_TIMEOUT_VAR = 'upload_timeout'
export const MAX_FILE_SIZE_VAR = 'max_file_size_mb'
export const DEBUG_VAR = 'debug'

// GitHub Actions injects both of these into the job environment only when
// the workflow grants `permissions: id-token: write`. Their presence is
// what lets the `gaffer` CLI exchange the runner's OIDC identity for a
// project token on its own — see packages/cli/src/oidc.rs in
// gaffer-sh/gaffer. Not Action inputs, so these are env var names, not
// `core.getInput()` keys.
export const ACTIONS_ID_TOKEN_REQUEST_URL_VAR = 'ACTIONS_ID_TOKEN_REQUEST_URL'
export const ACTIONS_ID_TOKEN_REQUEST_TOKEN_VAR =
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN'

// Defaults
export const DEFAULT_TIMEOUT_SECONDS = 30
export const DEFAULT_MAX_FILE_SIZE_MB = 100

// Available Test Report Tags
export const COMMIT_SHA_VAR = 'commit_sha'
export const BRANCH_VAR = 'branch'
export const TEST_FRAMEWORK_VAR = 'test_framework'
export const TEST_SUITE_VAR = 'test_suite'
