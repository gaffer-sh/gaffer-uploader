import * as core from '@actions/core'
import {
  DefaultArtifactClient,
  DownloadArtifactResponse,
  GetArtifactResponse
} from '@actions/artifact'
import FormData from 'form-data'
import { open } from '@actions/io/lib/io-util'
import axios from 'axios'
import { FileHandle } from 'fs/promises'
import { GAFFER_UPLOAD_BASE_URL, RUN_REPORT_NAME_VAR } from './constants'
import { TestRunTag } from './types'

export async function handleArtifactInput(
  artifactName: string,
  apiKey: string,
  testRunTags: TestRunTag[]
): Promise<void> {
  const downloadClient: DefaultArtifactClient = new DefaultArtifactClient()
  const { artifact }: GetArtifactResponse =
    await downloadClient.getArtifact(artifactName)

  core.info(`Downloading artifact ${artifact.name} (${artifact.id}) ...`)
  const { downloadPath }: DownloadArtifactResponse =
    await downloadClient.downloadArtifact(artifact.id)

  const runReportName: string = core.getInput(RUN_REPORT_NAME_VAR)

  if (!runReportName) {
    throw new Error('Run report filename not provided.')
  }

  if (!downloadPath) {
    throw new Error('Artifact download failed.')
  }

  core.info(`Downloaded artifact ${artifact.name} to: ${downloadPath}`)

  core.info(`Uploading artifact ${artifact.name} to Gaffer ...`)

  const artifactFile: FileHandle = await open(
    `${downloadPath}/${runReportName}`
  )

  if (!artifactFile) {
    throw new Error('Artifact download failed.')
  }

  const formData: FormData = new FormData()
  formData.append('run_package', artifactFile.createReadStream(), {
    filepath: runReportName
  })

  for (const tag of testRunTags) {
    formData.append('tags.key', tag.key)
    formData.append('tags.value', tag.value)
  }

  await axios.post(GAFFER_UPLOAD_BASE_URL, formData, {
    headers: { 'X-Gaffer-API-Key': apiKey }
  })
  core.info(`Uploaded artifact ${artifact.id}`)
}
