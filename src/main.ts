import * as core from '@actions/core'
import { spawnSync } from 'child_process'

import {
  parseActionInputs,
  parseTestRunTagsFromInputs
} from './utils/action-utils'
import { installCli } from './utils/cli-install'

interface CliSuccess {
  status: 'success'
  uploadSessionId?: string
  projectId?: string
  filesUploaded?: number
  bytesUploaded?: number
  elapsedMs?: number
}

export async function run(): Promise<void> {
  try {
    const inputs = parseActionInputs()
    const tags = parseTestRunTagsFromInputs()
    const cliVersion = core.getInput('cli_version') || undefined

    const { binaryPath, version } = await installCli(cliVersion)
    if (inputs.debug) {
      core.info(`[debug] gaffer ${version} installed at ${binaryPath}`)
    }

    const args = buildCliArgs(inputs, tags)
    if (inputs.debug) {
      core.info(
        `[debug] invoking: gaffer upload ${redactToken(args).join(' ')}`
      )
    }

    const result = spawnSync(binaryPath, ['upload', ...args], {
      stdio: ['ignore', 'pipe', 'inherit'],
      encoding: 'utf-8'
    })

    if (result.error) {
      core.setFailed(`Failed to invoke gaffer CLI: ${result.error.message}`)
      return
    }
    if (result.status !== 0) {
      core.setFailed(
        `gaffer upload exited with code ${result.status ?? 'unknown'}`
      )
      return
    }

    const stdout = result.stdout ?? ''
    if (inputs.debug) {
      core.info(`[debug] CLI stdout:\n${stdout}`)
    }

    const success = parseSuccessLine(stdout)
    if (success?.uploadSessionId) {
      core.setOutput('test_run_id', success.uploadSessionId)
    }
    if (success?.projectId) {
      core.setOutput('project_id', success.projectId)
    }
    core.setOutput('status', 'success')
  } catch (error: unknown) {
    core.setFailed(
      error instanceof Error ? error.message : 'An unexpected error occurred'
    )
  }
}

function buildCliArgs(
  inputs: ReturnType<typeof parseActionInputs>,
  tags: ReturnType<typeof parseTestRunTagsFromInputs>
): string[] {
  // Strip the legacy "/api/upload" suffix from api_endpoint so the CLI's
  // --api-url receives the bare dashboard URL it expects (e.g.
  // https://app.gaffer.sh, not https://app.gaffer.sh/api/upload).
  const apiUrl =
    inputs.apiEndpoint.replace(/\/api\/upload\/?$/, '') ||
    'https://app.gaffer.sh'

  const args: string[] = [
    inputs.reportPath,
    '--token',
    inputs.apiKey,
    '--api-url',
    apiUrl
  ]

  if (tags.commitSha) args.push('--commit-sha', tags.commitSha)
  if (tags.branch) args.push('--branch', tags.branch)
  if (tags.framework) args.push('--test-framework', tags.framework)
  if (tags.testSuite) args.push('--test-suite', tags.testSuite)

  args.push(
    '--timeout',
    String(Math.max(1, Math.floor(inputs.timeoutMs / 1000))),
    '--max-file-size-mb',
    String(Math.max(1, Math.floor(inputs.maxFileSizeBytes / (1024 * 1024))))
  )
  if (inputs.debug) args.push('--debug')

  return args
}

function redactToken(args: string[]): string[] {
  const redacted = [...args]
  const idx = redacted.indexOf('--token')
  if (idx >= 0 && idx + 1 < redacted.length) {
    redacted[idx + 1] = '<redacted>'
  }
  return redacted
}

function parseSuccessLine(stdout: string): CliSuccess | null {
  // The CLI emits a single JSON line on success. Scan from the end so any
  // human-readable noise emitted before the JSON line does not confuse us.
  const lines = stdout
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i])
      if (parsed && typeof parsed === 'object' && parsed.status === 'success') {
        return parsed as CliSuccess
      }
    } catch {
      continue
    }
  }
  return null
}
