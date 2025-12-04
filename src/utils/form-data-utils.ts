import FormData from 'form-data'
import { TestRunTags } from '../types'
import * as fs from 'fs'
import * as path from 'path'
import axios from 'axios'

/**
 * Creates and populates a FormData object with file(s) and tags for v2 API
 */
export function createUploadFormData(
  filePath: string,
  testRunTags: TestRunTags
): FormData {
  const form = new FormData()

  if (fs.statSync(filePath).isDirectory()) {
    addFilesToFormData(filePath, form)
  } else {
    form.append('files', fs.createReadStream(filePath), {
      filepath: path.basename(filePath)
    })
  }

  // Add tags as JSON string for v2 API
  form.append('tags', JSON.stringify(testRunTags))

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
        form.append('files', fs.createReadStream(filePath), {
          filepath: relativePath
        })
      }
    }
  } catch (e) {
    console.error(e)
  }
}

/**
 * Uploads form data to Gaffer v2 API
 */
export async function uploadToGaffer(
  form: FormData,
  apiKey: string,
  apiEndpoint: string
): Promise<axios.AxiosResponse> {
  const headers = {
    ...form.getHeaders(),
    'X-API-Key': apiKey
  }

  return axios.post(apiEndpoint, form, { headers })
}
