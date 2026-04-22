import FormData from 'form-data'
import { TestRunTags } from '../types'
import * as fs from 'fs'
import * as path from 'path'
import axios from 'axios'
import axiosRetry, {
  exponentialDelay,
  isNetworkOrIdempotentRequestError
} from 'axios-retry'
import { AXIOS_TIMEOUT_MS, MAX_UPLOAD_RETRIES } from '../constants'

/**
 * Creates and populates a FormData object with file(s) and tags for v2 API.
 * Throws if any individual file exceeds maxFileSizeBytes.
 */
export function createUploadFormData(
  filePath: string,
  testRunTags: TestRunTags,
  maxFileSizeBytes: number
): FormData {
  const form = new FormData()

  if (fs.statSync(filePath).isDirectory()) {
    addFilesToFormData(filePath, form, maxFileSizeBytes)
  } else {
    assertFileSizeWithinLimit(filePath, maxFileSizeBytes)
    form.append('files', fs.createReadStream(filePath), {
      filepath: path.basename(filePath)
    })
  }

  // Add tags as JSON string for v2 API
  form.append('tags', JSON.stringify(testRunTags))

  return form
}

/**
 * Throws if the file at filePath exceeds maxFileSizeBytes.
 */
function assertFileSizeWithinLimit(
  filePath: string,
  maxFileSizeBytes: number
): void {
  const { size } = fs.statSync(filePath)
  if (size > maxFileSizeBytes) {
    const sizeMb = (size / (1024 * 1024)).toFixed(2)
    const limitMb = (maxFileSizeBytes / (1024 * 1024)).toFixed(0)
    throw new Error(
      `File "${path.basename(filePath)}" is ${sizeMb} MB, which exceeds the ${limitMb} MB limit.`
    )
  }
}

/**
 * Recursively adds files from a directory to FormData
 */
function addFilesToFormData(
  folderPath: string,
  form: FormData,
  maxFileSizeBytes: number,
  baseFolderPath: string = folderPath
): void {
  try {
    const files = fs.readdirSync(folderPath)

    for (const file of files) {
      const filePath = path.join(folderPath, file)
      const fileStat = fs.statSync(filePath)

      if (fileStat.isDirectory()) {
        addFilesToFormData(filePath, form, maxFileSizeBytes, baseFolderPath)
      } else {
        assertFileSizeWithinLimit(filePath, maxFileSizeBytes)
        const relativePath = path.relative(baseFolderPath, filePath)
        form.append('files', fs.createReadStream(filePath), {
          filepath: relativePath
        })
      }
    }
  } catch (e) {
    console.error(e)
    throw e
  }
}

/**
 * Uploads form data to Gaffer v2 API
 */
export async function uploadToGaffer(
  form: FormData,
  apiKey: string,
  apiEndpoint: string,
  timeoutMs: number = AXIOS_TIMEOUT_MS
): Promise<axios.AxiosResponse> {
  const headers = {
    ...form.getHeaders(),
    'X-API-Key': apiKey
  }

  const client = axios.create()
  axiosRetry(client, {
    retries: MAX_UPLOAD_RETRIES,
    retryDelay: exponentialDelay,
    retryCondition: error => {
      return (
        isNetworkOrIdempotentRequestError(error) ||
        error.response?.status === 429
      )
    },
    onRetry: (retryCount, error) => {
      console.log(
        `Upload attempt ${retryCount} failed (${error.message}), retrying...`
      )
    }
  })

  return client.post(apiEndpoint, form, { headers, timeout: timeoutMs })
}
