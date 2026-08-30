import * as core from '@actions/core'
import {
  hasGitHubActionsOidc,
  parseTestRunTagsFromInputs,
  parseActionInputs
} from '../../../src/utils/action-utils'
import {
  ACTIONS_ID_TOKEN_REQUEST_TOKEN_VAR,
  ACTIONS_ID_TOKEN_REQUEST_URL_VAR,
  API_ENDPOINT_VAR,
  BRANCH_VAR,
  COMMIT_SHA_VAR,
  DEBUG_VAR,
  GAFFER_API_KEY_VAR,
  GAFFER_UPLOAD_BASE_URL,
  GAFFER_UPLOAD_TOKEN_VAR,
  MAX_FILE_SIZE_VAR,
  REPORT_PATH_VAR,
  TEST_FRAMEWORK_VAR,
  TEST_SUITE_VAR,
  UPLOAD_TIMEOUT_VAR
} from '../../../src/constants'

// Mock @actions/core
jest.mock('@actions/core')
const mockedCore = jest.mocked(core)

/** Snapshot/restore so OIDC env state never leaks between tests or files. */
const originalOidcEnv = {
  url: process.env[ACTIONS_ID_TOKEN_REQUEST_URL_VAR],
  token: process.env[ACTIONS_ID_TOKEN_REQUEST_TOKEN_VAR]
}

function clearOidcEnv(): void {
  delete process.env[ACTIONS_ID_TOKEN_REQUEST_URL_VAR]
  delete process.env[ACTIONS_ID_TOKEN_REQUEST_TOKEN_VAR]
}

function setOidcEnv(): void {
  process.env[ACTIONS_ID_TOKEN_REQUEST_URL_VAR] =
    'https://token.actions.githubusercontent.com/oidc/token'
  process.env[ACTIONS_ID_TOKEN_REQUEST_TOKEN_VAR] = 'runner-request-token'
}

describe('action-utils', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()
    // Default to "no OIDC available" so existing tests aren't affected by
    // whatever CI job happens to run them.
    clearOidcEnv()
  })

  afterAll(() => {
    if (originalOidcEnv.url === undefined) {
      delete process.env[ACTIONS_ID_TOKEN_REQUEST_URL_VAR]
    } else {
      process.env[ACTIONS_ID_TOKEN_REQUEST_URL_VAR] = originalOidcEnv.url
    }
    if (originalOidcEnv.token === undefined) {
      delete process.env[ACTIONS_ID_TOKEN_REQUEST_TOKEN_VAR]
    } else {
      process.env[ACTIONS_ID_TOKEN_REQUEST_TOKEN_VAR] = originalOidcEnv.token
    }
  })

  describe('parseTestRunTagsFromInputs', () => {
    it('should return empty object when no inputs are provided', () => {
      mockedCore.getInput.mockReturnValue('')

      const result = parseTestRunTagsFromInputs()

      expect(result).toEqual({})
      expect(mockedCore.getInput).toHaveBeenCalledTimes(4)
    })

    it('should return tags for all provided inputs with camelCase keys', () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        const values: Record<string, string> = {
          [COMMIT_SHA_VAR]: 'abc123',
          [BRANCH_VAR]: 'main',
          [TEST_FRAMEWORK_VAR]: 'jest',
          [TEST_SUITE_VAR]: 'unit'
        }
        return values[name] || ''
      })

      const result = parseTestRunTagsFromInputs()

      expect(result).toEqual({
        commitSha: 'abc123',
        branch: 'main',
        framework: 'jest',
        testSuite: 'unit'
      })
    })

    it('should only return tags for non-empty inputs', () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        const values: Record<string, string> = {
          [COMMIT_SHA_VAR]: 'abc123',
          [BRANCH_VAR]: '',
          [TEST_FRAMEWORK_VAR]: 'jest'
        }
        return values[name] || ''
      })

      const result = parseTestRunTagsFromInputs()

      expect(result).toEqual({
        commitSha: 'abc123',
        framework: 'jest'
      })
    })
  })

  describe('parseActionInputs', () => {
    it('should return api key, report path, and default endpoint when gaffer_upload_token provided', () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        const values: Record<string, string> = {
          [GAFFER_UPLOAD_TOKEN_VAR]: 'gfr_test-upload-token',
          [GAFFER_API_KEY_VAR]: '',
          [REPORT_PATH_VAR]: './reports/test.xml',
          [API_ENDPOINT_VAR]: ''
        }
        return values[name] || ''
      })

      const result = parseActionInputs()

      expect(result).toEqual({
        apiKey: 'gfr_test-upload-token',
        reportPath: './reports/test.xml',
        apiEndpoint: GAFFER_UPLOAD_BASE_URL,
        timeoutMs: 30000,
        maxFileSizeBytes: 104857600,
        debug: false
      })
      expect(mockedCore.warning).not.toHaveBeenCalled()
    })

    it('should support legacy gaffer_api_key with deprecation warning', () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        const values: Record<string, string> = {
          [GAFFER_UPLOAD_TOKEN_VAR]: '',
          [GAFFER_API_KEY_VAR]: 'test-api-key',
          [REPORT_PATH_VAR]: './reports/test.xml',
          [API_ENDPOINT_VAR]: ''
        }
        return values[name] || ''
      })

      const result = parseActionInputs()

      expect(result).toEqual({
        apiKey: 'test-api-key',
        reportPath: './reports/test.xml',
        apiEndpoint: GAFFER_UPLOAD_BASE_URL,
        timeoutMs: 30000,
        maxFileSizeBytes: 104857600,
        debug: false
      })
      expect(mockedCore.warning).toHaveBeenCalledWith(
        'gaffer_api_key is deprecated. Please use gaffer_upload_token instead.'
      )
    })

    it('should prefer gaffer_upload_token over gaffer_api_key when both provided', () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        const values: Record<string, string> = {
          [GAFFER_UPLOAD_TOKEN_VAR]: 'gfr_preferred-token',
          [GAFFER_API_KEY_VAR]: 'legacy-api-key',
          [REPORT_PATH_VAR]: './reports/test.xml',
          [API_ENDPOINT_VAR]: ''
        }
        return values[name] || ''
      })

      const result = parseActionInputs()

      expect(result).toEqual({
        apiKey: 'gfr_preferred-token',
        reportPath: './reports/test.xml',
        apiEndpoint: GAFFER_UPLOAD_BASE_URL,
        timeoutMs: 30000,
        maxFileSizeBytes: 104857600,
        debug: false
      })
      expect(mockedCore.warning).not.toHaveBeenCalled()
    })

    it('should use custom api endpoint when provided', () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        const values: Record<string, string> = {
          [GAFFER_UPLOAD_TOKEN_VAR]: 'gfr_test-token',
          [GAFFER_API_KEY_VAR]: '',
          [REPORT_PATH_VAR]: './reports/test.xml',
          [API_ENDPOINT_VAR]: 'https://preview.gaffer.sh/api/upload'
        }
        return values[name] || ''
      })

      const result = parseActionInputs()

      expect(result).toEqual({
        apiKey: 'gfr_test-token',
        reportPath: './reports/test.xml',
        apiEndpoint: 'https://preview.gaffer.sh/api/upload',
        timeoutMs: 30000,
        maxFileSizeBytes: 104857600,
        debug: false
      })
    })

    it('should use custom upload timeout and file size when provided', () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        const values: Record<string, string> = {
          [GAFFER_UPLOAD_TOKEN_VAR]: 'gfr_test-token',
          [GAFFER_API_KEY_VAR]: '',
          [REPORT_PATH_VAR]: './reports/test.xml',
          [API_ENDPOINT_VAR]: '',
          [UPLOAD_TIMEOUT_VAR]: '60',
          [MAX_FILE_SIZE_VAR]: '50'
        }
        return values[name] || ''
      })

      const result = parseActionInputs()

      expect(result).toEqual({
        apiKey: 'gfr_test-token',
        reportPath: './reports/test.xml',
        apiEndpoint: GAFFER_UPLOAD_BASE_URL,
        timeoutMs: 60000,
        maxFileSizeBytes: 52428800,
        debug: false
      })
    })

    it('should enable debug when debug input is true', () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        const values: Record<string, string> = {
          [GAFFER_UPLOAD_TOKEN_VAR]: 'gfr_test-token',
          [REPORT_PATH_VAR]: './reports/test.xml',
          [DEBUG_VAR]: 'true'
        }
        return values[name] || ''
      })

      const result = parseActionInputs()

      expect(result.debug).toBe(true)
    })

    it('should throw error naming both the token and OIDC options when neither is available', () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        const values: Record<string, string> = {
          [GAFFER_UPLOAD_TOKEN_VAR]: '',
          [GAFFER_API_KEY_VAR]: '',
          [REPORT_PATH_VAR]: './reports/test.xml'
        }
        return values[name] || ''
      })

      expect(() => parseActionInputs()).toThrow(/gaffer_upload_token/)
      expect(() => parseActionInputs()).toThrow(/permissions: id-token: write/)
    })

    it('should throw error when report path is not provided', () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        const values: Record<string, string> = {
          [GAFFER_UPLOAD_TOKEN_VAR]: 'gfr_test-token',
          [GAFFER_API_KEY_VAR]: '',
          [REPORT_PATH_VAR]: ''
        }
        return values[name] || ''
      })

      expect(() => parseActionInputs()).toThrow('Report path not provided.')
    })

    describe('OIDC fallback (GAF-241)', () => {
      it('returns apiKey: undefined when no token is set but OIDC env vars are present', () => {
        setOidcEnv()
        mockedCore.getInput.mockImplementation((name: string) => {
          const values: Record<string, string> = {
            [GAFFER_UPLOAD_TOKEN_VAR]: '',
            [GAFFER_API_KEY_VAR]: '',
            [REPORT_PATH_VAR]: './reports/test.xml'
          }
          return values[name] || ''
        })

        const result = parseActionInputs()

        expect(result.apiKey).toBeUndefined()
        expect(mockedCore.warning).not.toHaveBeenCalled()
      })

      it('still throws when OIDC env is only half-present', () => {
        process.env[ACTIONS_ID_TOKEN_REQUEST_URL_VAR] =
          'https://token.actions.githubusercontent.com/oidc/token'
        // ACTIONS_ID_TOKEN_REQUEST_TOKEN deliberately left unset.
        mockedCore.getInput.mockImplementation((name: string) => {
          const values: Record<string, string> = {
            [GAFFER_UPLOAD_TOKEN_VAR]: '',
            [GAFFER_API_KEY_VAR]: '',
            [REPORT_PATH_VAR]: './reports/test.xml'
          }
          return values[name] || ''
        })

        expect(() => parseActionInputs()).toThrow(/gaffer_upload_token/)
      })

      it('prefers a stored token over OIDC when both are available', () => {
        setOidcEnv()
        mockedCore.getInput.mockImplementation((name: string) => {
          const values: Record<string, string> = {
            [GAFFER_UPLOAD_TOKEN_VAR]: 'gfr_stored-token',
            [GAFFER_API_KEY_VAR]: '',
            [REPORT_PATH_VAR]: './reports/test.xml'
          }
          return values[name] || ''
        })

        const result = parseActionInputs()

        expect(result.apiKey).toBe('gfr_stored-token')
      })
    })
  })

  describe('hasGitHubActionsOidc', () => {
    it('is false when neither OIDC env var is set', () => {
      expect(hasGitHubActionsOidc()).toBe(false)
    })

    it('is false when only one OIDC env var is set', () => {
      process.env[ACTIONS_ID_TOKEN_REQUEST_URL_VAR] = 'https://example.test'
      expect(hasGitHubActionsOidc()).toBe(false)
    })

    it('is true when both OIDC env vars are set', () => {
      setOidcEnv()
      expect(hasGitHubActionsOidc()).toBe(true)
    })
  })
})
