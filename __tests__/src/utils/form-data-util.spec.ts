import FormData from 'form-data'
import * as fs from 'fs'
import axios from 'axios'

import { TestRunTag } from '../../../src/types'
import {
  createUploadFormData,
  uploadToGaffer
} from '../../../src/utils/form-data-utils'

// Mock external dependencies
jest.mock('form-data')
jest.mock('fs')
jest.mock('axios')

describe('form-data-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createUploadFormData', () => {
    const mockTags: TestRunTag[] = [
      { key: 'environment', value: 'staging' },
      { key: 'version', value: '1.0.0' }
    ]

    it('should create form data with a single file', () => {
      // Mock fs.statSync to return file stats
      const mockStats = { isDirectory: () => false }
      const statSync = fs.statSync as jest.Mock
      statSync.mockReturnValue(mockStats)

      // Mock fs.createReadStream
      const mockReadStream = { pipe: jest.fn() }
      const createReadStream = fs.createReadStream as jest.Mock
      createReadStream.mockReturnValue(mockReadStream)

      const filePath = '/path/to/file.zip'
      const form = createUploadFormData(filePath, mockTags)

      expect(FormData).toHaveBeenCalled()
      expect(form.append).toHaveBeenNthCalledWith(
        1,
        'run_package',
        mockReadStream,
        {
          filepath: 'file.zip'
        }
      )
      expect(form.append).toHaveBeenNthCalledWith(2, 'tags.key', 'environment')
      expect(form.append).toHaveBeenNthCalledWith(3, 'tags.value', 'staging')
      expect(form.append).toHaveBeenNthCalledWith(4, 'tags.key', 'version')
      expect(form.append).toHaveBeenNthCalledWith(5, 'tags.value', '1.0.0')
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
      const form = createUploadFormData(dirPath, mockTags)

      expect(FormData).toHaveBeenCalled()
      expect(fs.readdirSync).toHaveBeenCalledWith(dirPath)
      expect(form.append).toHaveBeenCalledTimes(6) // 2 files + 4 tag entries
    })
  })

  describe('uploadToGaffer', () => {
    it('should upload form data with correct headers', async () => {
      const mockForm = new FormData()
      const apiKey = 'test-api-key'
      const mockHeaders = { 'Content-Type': 'multipart/form-data' }

      // Mock getHeaders as a jest function instead of a method reference
      mockForm.getHeaders = jest.fn(() => mockHeaders)

      // Mock axios.post successful response
      const mockResponse = { data: { success: true } }
      const post = axios.post as jest.Mock
      post.mockResolvedValue(mockResponse)

      const result = await uploadToGaffer(mockForm, apiKey)

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String), // GAFFER_UPLOAD_BASE_URL
        mockForm,
        {
          headers: {
            ...mockHeaders,
            'X-Gaffer-API-Key': apiKey
          }
        }
      )
      expect(result).toEqual(mockResponse)
    })

    it('should handle upload errors', async () => {
      const mockForm = new FormData()
      const apiKey = 'test-api-key'
      const mockError = new Error('Upload failed')

      // Mock getHeaders as a jest function instead of a method reference
      mockForm.getHeaders = jest.fn(() => ({}))

      const post = axios.post as jest.Mock
      post.mockRejectedValue(mockError)

      await expect(uploadToGaffer(mockForm, apiKey)).rejects.toThrow(
        'Upload failed'
      )
    })
  })
})
