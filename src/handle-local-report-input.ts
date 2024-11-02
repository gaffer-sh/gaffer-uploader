import * as fs from 'fs'
import * as path from 'path'
import FormData from 'form-data'
import axios from 'axios'
import { GAFFER_UPLOAD_BASE_URL } from './constants'
import { TestRunTag } from './types'

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

export async function handleLocalReportInput(
  reportPath: string,
  apiKey: string,
  testRunTags: TestRunTag[]
): Promise<void> {
  const form = new FormData()

  if (fs.statSync(reportPath).isDirectory()) {
    addFilesToFormData(reportPath, form)
  } else {
    form.append('run_package', fs.createReadStream(reportPath), {
      filepath: path.basename(reportPath)
    })
  }

  for (const tag of testRunTags) {
    form.append('tags.key', tag.key)
    form.append('tags.value', tag.value)
  }

  const formHeaders = form.getHeaders()
  const headers = {
    ...formHeaders,
    'X-Gaffer-API-Key': apiKey
  }
  const response = await axios.post(GAFFER_UPLOAD_BASE_URL, form, { headers })

  console.log(response.data)
}
