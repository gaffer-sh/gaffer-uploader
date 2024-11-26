import FormData from 'form-data'
import { TestRunTag } from '../types'
import * as fs from 'fs'
import * as path from 'path'
import axios from 'axios'
import { GAFFER_UPLOAD_BASE_URL } from '../constants'

/**
 * Creates and populates a FormData object with file(s) and tags
 */
export function createUploadFormData(
  filePath: string,
  testRunTags: TestRunTag[]
): FormData {
  const form = new FormData()

  if (fs.statSync(filePath).isDirectory()) {
    addFilesToFormData(filePath, form)
  } else {
    form.append('run_package', fs.createReadStream(filePath), {
      filepath: path.basename(filePath)
    })
  }

  // Add tags to form data
  for (const tag of testRunTags) {
    form.append('tags.key', tag.key)
    form.append('tags.value', tag.value)
  }

  return form
}

/**
 * Recursively adds files from a directory to FormData
 */
function addFilesToFormData(
  folderPath: string,
  form: FormData,
  baseFolderPath: string = folderPath
): void {
  try {
    const files = fs.readdirSync(folderPath)

    for (const file of files) {
      const filePath = path.join(folderPath, file)
      const fileStat = fs.statSync(filePath)

      if (fileStat.isDirectory()) {
        addFilesToFormData(filePath, form, baseFolderPath)
      } else {
        const relativePath = path.relative(baseFolderPath, filePath)
        form.append('run_package', fs.createReadStream(filePath), {
          filepath: relativePath
        })
      }
    }
  } catch (e) {
    console.error(e)
  }
}

/**
 * Uploads form data to Gaffer API
 */
export async function uploadToGaffer(
  form: FormData,
  apiKey: string
): Promise<axios.AxiosResponse> {
  const headers = {
    ...form.getHeaders(),
    'X-Gaffer-API-Key': apiKey
  }

  return axios.post(GAFFER_UPLOAD_BASE_URL, form, { headers })
}
