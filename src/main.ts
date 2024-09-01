import * as core from '@actions/core'
import * as path from 'path'
import * as fs from 'fs'
import axios from 'axios'
import FormData from 'form-data'

function addFilesToFormData(folderPath: string, form: FormData, baseFolderPath: string = folderPath): void {
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
    console.error(e);
  }
}

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const gafferApiKey: string = core.getInput('gaffer-api-key')

    if (!gafferApiKey) {
      core.setFailed('Gaffer API key is required')
      return
    }

    core.debug('Beginning Gaffer Upload...')
    const form = new FormData()
    // addFilesToFormData('./playwright-report', form)
    addFilesToFormData('./reports', form)
    form.append('tags.key', 'commit_sha')
    form.append('tags.value', 'abcd1234')
    form.append('tags.key', 'branch')
    form.append('tags.value', 'main')

    try {
      const formHeaders = form.getHeaders()
      const headers = {
        ...formHeaders,
        'X-Gaffer-Api-Key': 'NTAxMWQxYjUuN2Y0MGI5ZDItOTU5OC00OTRjLWE3YjYtYTFjNmQ5ZmJkZmY1',
      }
      await axios.post('http://localhost/upload', form, { headers });
    } catch (e) {
      console.error(e)
      core.setFailed('Failed to upload to Gaffer');
    }

    core.setOutput('status', 'success')
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
