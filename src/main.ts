import * as core from '@actions/core'

import {
  GAFFER_API_KEY_VAR,
  ARTIFACT_NAME_VAR,
  TEST_FRAMEWORK_VAR,
  BRANCH_VAR,
  COMMIT_SHA_VAR,
  REPORT_PATH_VAR
} from './constants'
import { handleArtifactInput } from './handle-artifact-input'
import { handleLocalReportInput } from './handle-local-report-input'
import { TestRunTag } from './types'

function parseTestRunTagsFromInputs(): TestRunTag[] {
  const testRunTags: TestRunTag[] = []
  const commitSha: string = core.getInput(COMMIT_SHA_VAR)
  const branch: string = core.getInput(BRANCH_VAR)
  const testFramework: string = core.getInput(TEST_FRAMEWORK_VAR)

  if (commitSha) {
    testRunTags.push({ key: 'commit_sha', value: commitSha })
  }

  if (branch) {
    testRunTags.push({ key: 'branch', value: branch })
  }

  if (testFramework) {
    testRunTags.push({ key: 'test_framework', value: testFramework })
  }

  return testRunTags
}

export async function run(): Promise<void> {
  try {
    const apiKey: string = core.getInput(GAFFER_API_KEY_VAR)

    if (!apiKey) {
      throw new Error('Gaffer API key not provided.')
    }

    const artifactName: string = core.getInput(ARTIFACT_NAME_VAR)
    const reportPath: string = core.getInput(REPORT_PATH_VAR)

    if (!artifactName && !reportPath) {
      throw new Error('Artifact name or report path not provided.')
    }

    if (artifactName && reportPath) {
      throw new Error('Cannot provide both artifact name and report path.')
    }

    if (artifactName) {
      await handleArtifactInput(
        artifactName,
        apiKey,
        parseTestRunTagsFromInputs()
      )
    } else if (reportPath) {
      await handleLocalReportInput(
        reportPath,
        apiKey,
        parseTestRunTagsFromInputs()
      )
    }

    core.setOutput('status', 'success')
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    }
  }
}
