import * as core from '@actions/core'
import { run } from '../../src/main'
import * as actionUtils from '../../src/utils/action-utils'
import * as formDataUtils from '../../src/utils/form-data-utils'
import { TestRunTags } from '../../src/types'
import FormData from 'form-data'
import axios from 'axios'

// Mock all dependencies
jest.mock('@actions/core')
jest.mock('../../src/utils/action-utils')
jest.mock('../../src/utils/form-data-utils')

const mockedCore = jest.mocked(core)
const mockedActionUtils = jest.mocked(actionUtils)
const mockedFormDataUtils = jest.mocked(formDataUtils)

describe('main', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should successfully upload report when all operations succeed', async () => {
    // Mock return values
    const mockTags: TestRunTags = { commitSha: 'abc123' }
    const mockForm = new FormData()

    mockedActionUtils.parseActionInputs.mockReturnValue({
      apiKey: 'test-key',
      reportPath: 'test-path',
      apiEndpoint: 'https://app.gaffer.sh/api/upload'
    })
    mockedActionUtils.parseTestRunTagsFromInputs.mockReturnValue(mockTags)
    mockedFormDataUtils.createUploadFormData.mockReturnValue(
      mockForm as unknown as FormData
    )
    mockedFormDataUtils.uploadToGaffer.mockResolvedValue(
      {} as axios.AxiosResponse
    )

    await run()

    // Verify all functions were called with correct parameters
    expect(mockedActionUtils.parseActionInputs).toHaveBeenCalled()
    expect(mockedActionUtils.parseTestRunTagsFromInputs).toHaveBeenCalled()
    expect(mockedFormDataUtils.createUploadFormData).toHaveBeenCalledWith(
      'test-path',
      mockTags
    )
    expect(mockedFormDataUtils.uploadToGaffer).toHaveBeenCalledWith(
      mockForm,
      'test-key',
      'https://app.gaffer.sh/api/upload'
    )
    expect(mockedCore.setOutput).toHaveBeenCalledWith('status', 'success')
    expect(mockedCore.setFailed).not.toHaveBeenCalled()
  })

  it('should handle errors from parseActionInputs', async () => {
    const error = new Error('API key missing')
    mockedActionUtils.parseActionInputs.mockImplementation(() => {
      throw error
    })

    await run()

    expect(mockedCore.setFailed).toHaveBeenCalledWith(error.message)
    expect(mockedCore.setOutput).not.toHaveBeenCalled()
    expect(mockedFormDataUtils.uploadToGaffer).not.toHaveBeenCalled()
  })

  it('should handle errors from createUploadFormData', async () => {
    const error = new Error('Failed to create form data')
    mockedActionUtils.parseActionInputs.mockReturnValue({
      apiKey: 'test-key',
      reportPath: 'test-path',
      apiEndpoint: 'https://app.gaffer.sh/api/upload'
    })
    mockedActionUtils.parseTestRunTagsFromInputs.mockReturnValue({})
    mockedFormDataUtils.createUploadFormData.mockImplementation(() => {
      throw error
    })

    await run()

    expect(mockedCore.setFailed).toHaveBeenCalledWith(error.message)
    expect(mockedCore.setOutput).not.toHaveBeenCalled()
    expect(mockedFormDataUtils.uploadToGaffer).not.toHaveBeenCalled()
  })

  it('should handle errors from uploadToGaffer', async () => {
    const error = new Error('Upload failed')
    mockedActionUtils.parseActionInputs.mockReturnValue({
      apiKey: 'test-key',
      reportPath: 'test-path',
      apiEndpoint: 'https://app.gaffer.sh/api/upload'
    })
    mockedActionUtils.parseTestRunTagsFromInputs.mockReturnValue({})
    mockedFormDataUtils.createUploadFormData.mockReturnValue(new FormData())
    mockedFormDataUtils.uploadToGaffer.mockRejectedValue(error)

    await run()

    expect(mockedCore.setFailed).toHaveBeenCalledWith(error.message)
    expect(mockedCore.setOutput).not.toHaveBeenCalled()
  })
})
