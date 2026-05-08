/**
 * Action entrypoint for gaffer-uploader v2.
 *
 * v2 is a thin wrapper. It reads the v1-compatible Action inputs, installs
 * the `gaffer` CLI binary released from the public
 * https://github.com/gaffer-sh/gaffer repo (see `cli-install.ts`), then
 * invokes `gaffer upload` and surfaces the structured success/failure
 * envelope back to GitHub Actions.
 */
import * as core from '@actions/core'
import { spawn } from 'child_process'

import {
  parseActionInputs,
  parseTestRunTagsFromInputs
} from './utils/action-utils'
import { installCli } from './utils/cli-install'

/** Bytes of stderr we keep around to surface back through `core.setFailed`. */
const STDERR_TAIL_BYTES = 8192

/**
 * The CLI emits a single JSON line per outcome — `status: 'success'` on
 * stdout, `status: 'error'` on stderr. Fields beyond `status` are
 * informational and unstable; do not rely on them in tests outside this
 * module.
 */
interface CliEnvelope {
  status: 'success' | 'error' | string
  uploadSessionId?: string
  projectId?: string
  message?: string
  problem?: string
  cause?: string
  fix?: string
  sessionId?: string
  rayId?: string
}

interface CliResult {
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  spawnError?: Error
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

    const result = await runCli(binaryPath, args)

    if (result.spawnError) {
      core.setFailed(
        `Failed to invoke gaffer CLI: ${result.spawnError.message}`
      )
      return
    }

    if (inputs.debug && result.stdout) {
      core.info(`[debug] CLI stdout:\n${result.stdout}`)
    }

    const envelope = parseEnvelope(result.stdout, result.stderr)

    if (result.exitCode === 0) {
      handleSuccessExit(envelope, result)
      return
    }

    handleFailureExit(envelope, result)
  } catch (error: unknown) {
    core.setFailed(
      error instanceof Error ? error.message : 'An unexpected error occurred'
    )
  }
}

function handleSuccessExit(
  envelope: CliEnvelope | null,
  result: CliResult
): void {
  if (!envelope || envelope.status !== 'success') {
    // The CLI returned 0 without emitting a recognizable success envelope.
    // Flag it loudly — silently setting status=success risks downstream
    // steps consuming an empty test_run_id and failing far from the cause.
    const tail = lastLines(result.stderr, 5) || lastLines(result.stdout, 5)
    const advice =
      'gaffer upload exited 0 but did not emit a success envelope. ' +
      'This usually means a CLI version mismatch. Pin `cli_version` to a known-good release.'
    core.setFailed(tail ? `${advice} Recent output:\n${tail}` : advice)
    return
  }
  if (envelope.uploadSessionId) {
    core.setOutput('test_run_id', envelope.uploadSessionId)
  }
  if (envelope.projectId) {
    core.setOutput('project_id', envelope.projectId)
  }
  core.setOutput('status', 'success')
}

function handleFailureExit(
  envelope: CliEnvelope | null,
  result: CliResult
): void {
  const where = result.signal
    ? `signal ${result.signal}`
    : `exit code ${result.exitCode ?? 'unknown'}`

  if (envelope && envelope.status !== 'success' && envelope.message) {
    const session = envelope.sessionId ? ` [session ${envelope.sessionId}]` : ''
    const ray = envelope.rayId ? ` [ray ${envelope.rayId}]` : ''
    core.setFailed(
      `gaffer upload failed (${where}): ${envelope.message}${session}${ray}`
    )
    return
  }

  const tail = lastLines(result.stderr, 5)
  const base = `gaffer upload failed (${where}).`
  core.setFailed(tail ? `${base} Recent stderr:\n${tail}` : base)
}

export function buildCliArgs(
  inputs: ReturnType<typeof parseActionInputs>,
  tags: ReturnType<typeof parseTestRunTagsFromInputs>
): string[] {
  // v1 docs told users to pass `api_endpoint: https://app.gaffer.sh/api/upload`,
  // but the CLI's --api-url expects the bare dashboard URL. Strip the legacy
  // suffix so v1 → v2 migration works without users editing their workflow.
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

export function redactToken(args: string[]): string[] {
  const redacted = [...args]
  const idx = redacted.indexOf('--token')
  if (idx >= 0 && idx + 1 < redacted.length) {
    redacted[idx + 1] = '<redacted>'
  }
  return redacted
}

export function parseEnvelope(
  stdout: string,
  stderr: string
): CliEnvelope | null {
  // Success envelopes go to stdout, error envelopes to stderr. Scan stdout
  // first so a successful run isn't misclassified by stale stderr noise,
  // newest line first within each stream.
  for (const stream of [stdout, stderr]) {
    const lines = stream
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]
      if (!line.startsWith('{')) continue
      try {
        const parsed: unknown = JSON.parse(line)
        if (
          parsed &&
          typeof parsed === 'object' &&
          'status' in parsed &&
          typeof (parsed as { status: unknown }).status === 'string'
        ) {
          return parsed as CliEnvelope
        }
      } catch {
        continue
      }
    }
  }
  return null
}

function lastLines(text: string, count: number): string {
  return text.split('\n').filter(Boolean).slice(-count).join('\n').trim()
}

async function runCli(binary: string, args: string[]): Promise<CliResult> {
  return new Promise(resolve => {
    const child = spawn(binary, ['upload', ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderrTail = ''

    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })

    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (chunk: string) => {
      // Tee live to the parent so users see progress in CI logs as it
      // happens; keep a bounded tail for the final setFailed message.
      process.stderr.write(chunk)
      stderrTail += chunk
      if (stderrTail.length > STDERR_TAIL_BYTES) {
        stderrTail = stderrTail.slice(stderrTail.length - STDERR_TAIL_BYTES)
      }
    })

    child.on('error', (err: Error) => {
      resolve({
        exitCode: null,
        signal: null,
        stdout,
        stderr: stderrTail,
        spawnError: err
      })
    })

    child.on('close', (code, signal) => {
      resolve({ exitCode: code, signal, stdout, stderr: stderrTail })
    })
  })
}
