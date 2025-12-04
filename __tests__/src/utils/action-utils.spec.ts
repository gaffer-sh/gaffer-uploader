import * as core from '@actions/core'
import {
  parseTestRunTagsFromInputs,
  parseActionInputs
} from '../../../src/utils/action-utils'
import {
  API_ENDPOINT_VAR,
  BRANCH_VAR,
  COMMIT_SHA_VAR,
  GAFFER_API_KEY_VAR,
  GAFFER_UPLOAD_BASE_URL,
  REPORT_PATH_VAR,
  TEST_FRAMEWORK_VAR,
  TEST_SUITE_VAR
} from '../../../src/constants'

// Mock @actions/core
jest.mock('@actions/core')
const mockedCore = jest.mocked(core)

describe('action-utils', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()
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
    it('should return api key, report path, and default endpoint when provided', () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        const values: Record<string, string> = {
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
        apiEndpoint: GAFFER_UPLOAD_BASE_URL
      })
    })

    it('should use custom api endpoint when provided', () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        const values: Record<string, string> = {
          [GAFFER_API_KEY_VAR]: 'test-api-key',
          [REPORT_PATH_VAR]: './reports/test.xml',
          [API_ENDPOINT_VAR]: 'https://preview.gaffer.sh/api/upload'
        }
        return values[name] || ''
      })

      const result = parseActionInputs()

      expect(result).toEqual({
        apiKey: 'test-api-key',
        reportPath: './reports/test.xml',
        apiEndpoint: 'https://preview.gaffer.sh/api/upload'
      })
    })

    it('should throw error when api key is not provided', () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        const values: Record<string, string> = {
          [GAFFER_API_KEY_VAR]: '',
          [REPORT_PATH_VAR]: './reports/test.xml'
        }
        return values[name] || ''
      })

      expect(() => parseActionInputs()).toThrow('Gaffer API key not provided.')
    })

    it('should throw error when report path is not provided', () => {
      mockedCore.getInput.mockImplementation((name: string) => {
        const values: Record<string, string> = {
          [GAFFER_API_KEY_VAR]: 'test-api-key',
          [REPORT_PATH_VAR]: ''
        }
        return values[name] || ''
      })

      expect(() => parseActionInputs()).toThrow('Report path not provided.')
    })
  })
})
