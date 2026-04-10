import FormData from 'form-data'
import * as fs from 'fs'
import axios from 'axios'
import axiosRetry, {
  exponentialDelay,
  isNetworkOrIdempotentRequestError
} from 'axios-retry'

import { TestRunTags } from '../../../src/types'
import {
  createUploadFormData,
  uploadToGaffer
} from '../../../src/utils/form-data-utils'

// Mock external dependencies
jest.mock('form-data')
jest.mock('fs')
jest.mock('axios')
jest.mock('axios-retry')

describe('form-data-utils', () => {
  let mockAppend: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    // Setup mock append function that will be used by all FormData instances
    mockAppend = jest.fn()
    ;(FormData as jest.MockedClass<typeof FormData>).mockImplementation(
      () =>
        ({
          append: mockAppend,
          getHeaders: jest.fn(() => ({}))
        }) as unknown as FormData
    )
  })

  describe('createUploadFormData', () => {
    const mockTags: TestRunTags = {
      commitSha: 'abc123',
      branch: 'main'
    }

    it('should create form data with a single file and JSON tags', () => {
      // Mock fs.statSync to return file stats
      const mockStats = { isDirectory: () => false }
      const statSync = fs.statSync as jest.Mock
      statSync.mockReturnValue(mockStats)

      // Mock fs.createReadStream
      const mockReadStream = { pipe: jest.fn() }
      const createReadStream = fs.createReadStream as jest.Mock
      createReadStream.mockReturnValue(mockReadStream)

      const filePath = '/path/to/file.zip'
      createUploadFormData(filePath, mockTags)

      expect(FormData).toHaveBeenCalled()
      expect(mockAppend).toHaveBeenNthCalledWith(1, 'files', mockReadStream, {
        filepath: 'file.zip'
      })
      expect(mockAppend).toHaveBeenNthCalledWith(
        2,
        'tags',
        JSON.stringify(mockTags)
      )
    })

    it('should create form data with multiple files from directory', () => {
      // Mock fs.statSync to return directory stats for the main path
      const mockDirStats = { isDirectory: () => true }
      const mockFileStats = { isDirectory: () => false }
      const statSync = fs.statSync as jest.Mock
      statSync.mockReturnValueOnce(mockDirStats).mockReturnValue(mockFileStats)

      // Mock fs.readdirSync
      const mockFiles = ['file1.txt', 'file2.txt']
      const readdirSync = fs.readdirSync as jest.Mock
      readdirSync.mockReturnValue(mockFiles)

      // Mock fs.createReadStream
      const mockReadStream = { pipe: jest.fn() }
      const createReadStream = fs.createReadStream as jest.Mock
      createReadStream.mockReturnValue(mockReadStream)

      const dirPath = '/path/to/dir'
      createUploadFormData(dirPath, mockTags)

      expect(FormData).toHaveBeenCalled()
      expect(fs.readdirSync).toHaveBeenCalledWith(dirPath)
      expect(mockAppend).toHaveBeenCalledTimes(3) // 2 files + 1 JSON tags entry
    })
  })

  describe('uploadToGaffer', () => {
    let mockPost: jest.Mock

    beforeEach(() => {
      mockPost = jest.fn()
      ;(axios.create as jest.Mock).mockReturnValue({ post: mockPost })
      ;(axiosRetry as unknown as jest.Mock).mockImplementation(() => {})
    })

    it('should upload form data with correct headers to specified endpoint', async () => {
      const mockForm = new FormData()
      const apiKey = 'test-api-key'
      const apiEndpoint = 'https://app.gaffer.sh/api/upload'
      const mockHeaders = { 'Content-Type': 'multipart/form-data' }

      mockForm.getHeaders = jest.fn(() => mockHeaders)

      const mockResponse = { data: { success: true } }
      mockPost.mockResolvedValue(mockResponse)

      const result = await uploadToGaffer(mockForm, apiKey, apiEndpoint)

      expect(mockPost).toHaveBeenCalledWith(apiEndpoint, mockForm, {
        headers: {
          ...mockHeaders,
          'X-API-Key': apiKey
        },
        timeout: 30000
      })
      expect(result).toEqual(mockResponse)
    })

    it('should upload to custom endpoint when provided', async () => {
      const mockForm = new FormData()
      const apiKey = 'test-api-key'
      const customEndpoint = 'https://preview.gaffer.sh/api/upload'
      const mockHeaders = { 'Content-Type': 'multipart/form-data' }

      mockForm.getHeaders = jest.fn(() => mockHeaders)

      const mockResponse = { data: { success: true } }
      mockPost.mockResolvedValue(mockResponse)

      await uploadToGaffer(mockForm, apiKey, customEndpoint)

      expect(mockPost).toHaveBeenCalledWith(customEndpoint, mockForm, {
        headers: {
          ...mockHeaders,
          'X-API-Key': apiKey
        },
        timeout: 30000
      })
    })

    it('should handle upload errors', async () => {
      const mockForm = new FormData()
      const apiKey = 'test-api-key'
      const apiEndpoint = 'https://app.gaffer.sh/api/upload'
      const mockError = new Error('Upload failed')

      mockForm.getHeaders = jest.fn(() => ({}))

      mockPost.mockRejectedValue(mockError)

      await expect(
        uploadToGaffer(mockForm, apiKey, apiEndpoint)
      ).rejects.toThrow('Upload failed')
    })

    it('should configure axios-retry with correct options', async () => {
      const mockForm = new FormData()
      mockForm.getHeaders = jest.fn(() => ({}))
      mockPost.mockResolvedValue({ data: {} })

      await uploadToGaffer(mockForm, 'key', 'https://api.test.com')

      expect(axios.create).toHaveBeenCalled()
      expect(axiosRetry).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          retries: 3,
          retryDelay: exponentialDelay
        })
      )
    })

    it('should retry on 429 rate limit errors', async () => {
      const mockForm = new FormData()
      mockForm.getHeaders = jest.fn(() => ({}))
      mockPost.mockResolvedValue({ data: {} })

      await uploadToGaffer(mockForm, 'key', 'https://api.test.com')

      // Extract the retryCondition function from the axiosRetry call
      const retryConfig = (axiosRetry as unknown as jest.Mock).mock.calls[0][1]
      const retryCondition = retryConfig.retryCondition

      const error429 = { response: { status: 429 }, isAxiosError: true }
      expect(retryCondition(error429)).toBe(true)
    })

    it('should not retry on 401 auth errors', async () => {
      const mockForm = new FormData()
      mockForm.getHeaders = jest.fn(() => ({}))
      mockPost.mockResolvedValue({ data: {} })

      // Mock isNetworkOrIdempotentRequestError to return false for client errors
      ;(
        isNetworkOrIdempotentRequestError as unknown as jest.Mock
      ).mockReturnValue(false)

      await uploadToGaffer(mockForm, 'key', 'https://api.test.com')

      const retryConfig = (axiosRetry as unknown as jest.Mock).mock.calls[0][1]
      const retryCondition = retryConfig.retryCondition

      const error401 = { response: { status: 401 }, isAxiosError: true }
      expect(retryCondition(error401)).toBe(false)
    })
  })
})
