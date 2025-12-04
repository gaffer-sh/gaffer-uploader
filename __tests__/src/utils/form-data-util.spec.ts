import FormData from 'form-data'
import * as fs from 'fs'
import axios from 'axios'

import { TestRunTags } from '../../../src/types'
import {
  createUploadFormData,
  uploadToGaffer
} from '../../../src/utils/form-data-utils'

// Mock external dependencies
jest.mock('form-data')
jest.mock('fs')
jest.mock('axios')

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
    it('should upload form data with correct headers to specified endpoint', async () => {
      const mockForm = new FormData()
      const apiKey = 'test-api-key'
      const apiEndpoint = 'https://app.gaffer.sh/api/upload'
      const mockHeaders = { 'Content-Type': 'multipart/form-data' }

      // Mock getHeaders as a jest function instead of a method reference
      mockForm.getHeaders = jest.fn(() => mockHeaders)

      // Mock axios.post successful response
      const mockResponse = { data: { success: true } }
      const post = axios.post as jest.Mock
      post.mockResolvedValue(mockResponse)

      const result = await uploadToGaffer(mockForm, apiKey, apiEndpoint)

      expect(axios.post).toHaveBeenCalledWith(apiEndpoint, mockForm, {
        headers: {
          ...mockHeaders,
          'X-API-Key': apiKey
        }
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
      const post = axios.post as jest.Mock
      post.mockResolvedValue(mockResponse)

      await uploadToGaffer(mockForm, apiKey, customEndpoint)

      expect(axios.post).toHaveBeenCalledWith(customEndpoint, mockForm, {
        headers: {
          ...mockHeaders,
          'X-API-Key': apiKey
        }
      })
    })

    it('should handle upload errors', async () => {
      const mockForm = new FormData()
      const apiKey = 'test-api-key'
      const apiEndpoint = 'https://app.gaffer.sh/api/upload'
      const mockError = new Error('Upload failed')

      // Mock getHeaders as a jest function instead of a method reference
      mockForm.getHeaders = jest.fn(() => ({}))

      const post = axios.post as jest.Mock
      post.mockRejectedValue(mockError)

      await expect(
        uploadToGaffer(mockForm, apiKey, apiEndpoint)
      ).rejects.toThrow('Upload failed')
    })
  })
})
