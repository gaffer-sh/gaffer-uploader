import * as core from '@actions/core'

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

    core.setOutput('status', 'success')
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
