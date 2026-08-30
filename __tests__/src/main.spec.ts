import * as core from '@actions/core'
import * as childProcess from 'child_process'
import { EventEmitter } from 'events'
import { Readable } from 'stream'

import { buildCliArgs, parseEnvelope, redactToken, run } from '../../src/main'
import * as actionUtils from '../../src/utils/action-utils'
import * as cliInstall from '../../src/utils/cli-install'

jest.mock('@actions/core')
jest.mock('child_process')
jest.mock('../../src/utils/action-utils')
jest.mock('../../src/utils/cli-install')

const mockedCore = jest.mocked(core)
const mockedActionUtils = jest.mocked(actionUtils)
const mockedCliInstall = jest.mocked(cliInstall)
const mockedSpawn = jest.mocked(childProcess.spawn)

const baseInputs = {
  apiKey: 'gfr_test',
  reportPath: './reports/test.xml',
  apiEndpoint: 'https://app.gaffer.sh/api/upload',
  timeoutMs: 30000,
  maxFileSizeBytes: 100 * 1024 * 1024,
  debug: false
}

interface FakeChildOptions {
  stdout?: string
  stderr?: string
  exitCode?: number | null
  signal?: 'SIGKILL' | 'SIGTERM' | 'SIGINT' | null
  spawnError?: Error
}

function fakeChild(options: FakeChildOptions = {}): EventEmitter {
  const child = new EventEmitter() as EventEmitter & {
    stdout: Readable
    stderr: Readable
  }
  const stdout = Readable.from(options.stdout ?? '')
  const stderr = Readable.from(options.stderr ?? '')
  child.stdout = stdout
  child.stderr = stderr

  process.nextTick(() => {
    if (options.spawnError) {
      child.emit('error', options.spawnError)
      return
    }
    // Wait for streams to drain into our run() handlers before emitting close.
    setImmediate(() => {
      const code = options.exitCode === undefined ? 0 : options.exitCode
      const signal = options.signal === undefined ? null : options.signal
      child.emit('close', code, signal)
    })
  })

  return child
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedCore.getInput.mockReturnValue('')
  mockedCliInstall.installCli.mockResolvedValue({
    binaryPath: '/runner/_tool/gaffer/0.4.0/linux-amd64/gaffer',
    version: '0.4.0'
  })
  // Suppress live tee in tests so jest output stays clean.
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

describe('run() — happy path', () => {
  it('passes parsed inputs through to the CLI and surfaces session IDs', async () => {
    mockedActionUtils.parseActionInputs.mockReturnValue(baseInputs)
    mockedActionUtils.parseTestRunTagsFromInputs.mockReturnValue({
      commitSha: 'abc123',
      branch: 'main',
      framework: 'playwright',
      testSuite: 'e2e'
    })
    mockedSpawn.mockReturnValue(
      fakeChild({
        stdout: `${JSON.stringify({
          status: 'success',
          uploadSessionId: 'upl_abc',
          projectId: 'prj_xyz'
        })}\n`
      }) as unknown as childProcess.ChildProcess
    )

    await run()

    expect(mockedSpawn).toHaveBeenCalledWith(
      '/runner/_tool/gaffer/0.4.0/linux-amd64/gaffer',
      expect.arrayContaining([
        'upload',
        './reports/test.xml',
        '--token',
        'gfr_test',
        '--api-url',
        'https://app.gaffer.sh',
        '--commit-sha',
        'abc123'
      ]),
      expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] })
    )
    expect(mockedCore.setOutput).toHaveBeenCalledWith('test_run_id', 'upl_abc')
    expect(mockedCore.setOutput).toHaveBeenCalledWith('project_id', 'prj_xyz')
    expect(mockedCore.setOutput).toHaveBeenCalledWith('status', 'success')
    expect(mockedCore.setFailed).not.toHaveBeenCalled()
  })

  it('honors a custom api_endpoint without a /api/upload suffix', async () => {
    mockedActionUtils.parseActionInputs.mockReturnValue({
      ...baseInputs,
      apiEndpoint: 'https://preview.gaffer.sh'
    })
    mockedActionUtils.parseTestRunTagsFromInputs.mockReturnValue({})
    mockedSpawn.mockReturnValue(
      fakeChild({
        stdout: `${JSON.stringify({ status: 'success' })}\n`
      }) as unknown as childProcess.ChildProcess
    )

    await run()

    const callArgs = mockedSpawn.mock.calls[0][1] as string[]
    const apiUrlIdx = callArgs.indexOf('--api-url')
    expect(callArgs[apiUrlIdx + 1]).toBe('https://preview.gaffer.sh')
  })

  it('reads cli_version input and passes it to installCli', async () => {
    mockedCore.getInput.mockImplementation((name: string) =>
      name === 'cli_version' ? '0.5.0' : ''
    )
    mockedActionUtils.parseActionInputs.mockReturnValue(baseInputs)
    mockedActionUtils.parseTestRunTagsFromInputs.mockReturnValue({})
    mockedSpawn.mockReturnValue(
      fakeChild({
        stdout: `${JSON.stringify({ status: 'success' })}\n`
      }) as unknown as childProcess.ChildProcess
    )

    await run()

    expect(mockedCliInstall.installCli).toHaveBeenCalledWith('0.5.0')
  })
})

describe('run() — OIDC fallback (GAF-241)', () => {
  it('omits --token when apiKey is undefined and still succeeds', async () => {
    mockedActionUtils.parseActionInputs.mockReturnValue({
      ...baseInputs,
      apiKey: undefined
    })
    mockedActionUtils.parseTestRunTagsFromInputs.mockReturnValue({})
    mockedSpawn.mockReturnValue(
      fakeChild({
        stdout: `${JSON.stringify({ status: 'success' })}\n`
      }) as unknown as childProcess.ChildProcess
    )

    await run()

    const callArgs = mockedSpawn.mock.calls[0][1] as string[]
    expect(callArgs).not.toContain('--token')
    expect(mockedCore.setOutput).toHaveBeenCalledWith('status', 'success')
    expect(mockedCore.setFailed).not.toHaveBeenCalled()
  })

  it('does not override the child process env, so OIDC env vars are inherited', async () => {
    mockedActionUtils.parseActionInputs.mockReturnValue({
      ...baseInputs,
      apiKey: undefined
    })
    mockedActionUtils.parseTestRunTagsFromInputs.mockReturnValue({})
    mockedSpawn.mockReturnValue(
      fakeChild({
        stdout: `${JSON.stringify({ status: 'success' })}\n`
      }) as unknown as childProcess.ChildProcess
    )

    await run()

    const spawnOptions = mockedSpawn.mock.calls[0][2] as Record<string, unknown>
    // No `env` key at all means Node's default: inherit the full parent
    // process.env, including ACTIONS_ID_TOKEN_REQUEST_URL/_TOKEN when the
    // job has id-token: write. A restrictive `env` override here would
    // silently break the CLI's own OIDC exchange.
    expect(spawnOptions).not.toHaveProperty('env')
  })
})

describe('run() — failure surfaces', () => {
  it('treats exit 0 without a success envelope as a failure', async () => {
    mockedActionUtils.parseActionInputs.mockReturnValue(baseInputs)
    mockedActionUtils.parseTestRunTagsFromInputs.mockReturnValue({})
    mockedSpawn.mockReturnValue(
      fakeChild({
        stdout: 'some unstructured noise\n'
      }) as unknown as childProcess.ChildProcess
    )

    await run()

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('did not emit a success envelope')
    )
    expect(mockedCore.setOutput).not.toHaveBeenCalledWith('status', 'success')
  })

  it('surfaces an error envelope when the CLI exits non-zero', async () => {
    mockedActionUtils.parseActionInputs.mockReturnValue(baseInputs)
    mockedActionUtils.parseTestRunTagsFromInputs.mockReturnValue({})
    mockedSpawn.mockReturnValue(
      fakeChild({
        stderr: `${JSON.stringify({
          status: 'error',
          message: 'file too large',
          sessionId: 'upl_x',
          rayId: 'ray_42'
        })}\nhuman-readable block here\n`,
        exitCode: 2
      }) as unknown as childProcess.ChildProcess
    )

    await run()

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('file too large')
    )
    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('upl_x')
    )
    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('ray_42')
    )
    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('exit code 2')
    )
  })

  it('reports the signal name when the CLI is killed', async () => {
    mockedActionUtils.parseActionInputs.mockReturnValue(baseInputs)
    mockedActionUtils.parseTestRunTagsFromInputs.mockReturnValue({})
    mockedSpawn.mockReturnValue(
      fakeChild({
        exitCode: null,
        signal: 'SIGKILL'
      }) as unknown as childProcess.ChildProcess
    )

    await run()

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('signal SIGKILL')
    )
  })

  it('surfaces spawn errors (e.g. ENOENT) clearly', async () => {
    mockedActionUtils.parseActionInputs.mockReturnValue(baseInputs)
    mockedActionUtils.parseTestRunTagsFromInputs.mockReturnValue({})
    mockedSpawn.mockReturnValue(
      fakeChild({
        spawnError: new Error('spawn ENOENT')
      }) as unknown as childProcess.ChildProcess
    )

    await run()

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('spawn ENOENT')
    )
  })

  it('fails cleanly when parseActionInputs throws', async () => {
    mockedActionUtils.parseActionInputs.mockImplementation(() => {
      throw new Error('Upload token not provided.')
    })

    await run()

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      'Upload token not provided.'
    )
    expect(mockedSpawn).not.toHaveBeenCalled()
  })

  it('fails cleanly when installCli rejects', async () => {
    mockedActionUtils.parseActionInputs.mockReturnValue(baseInputs)
    mockedActionUtils.parseTestRunTagsFromInputs.mockReturnValue({})
    mockedCliInstall.installCli.mockRejectedValue(
      new Error('Unsupported runner: linux/arm32')
    )

    await run()

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      'Unsupported runner: linux/arm32'
    )
    expect(mockedSpawn).not.toHaveBeenCalled()
  })
})

describe('buildCliArgs', () => {
  it('clamps pathological inputs to a 1-second / 1-MB floor', () => {
    const args = buildCliArgs(
      { ...baseInputs, timeoutMs: 0, maxFileSizeBytes: 0 },
      {}
    )
    const timeoutIdx = args.indexOf('--timeout')
    const sizeIdx = args.indexOf('--max-file-size-mb')
    expect(args[timeoutIdx + 1]).toBe('1')
    expect(args[sizeIdx + 1]).toBe('1')
  })

  it('floors timeoutMs/1000 instead of rounding', () => {
    const args = buildCliArgs({ ...baseInputs, timeoutMs: 30999 }, {})
    const timeoutIdx = args.indexOf('--timeout')
    expect(args[timeoutIdx + 1]).toBe('30')
  })

  it('only emits flags for tags that are set', () => {
    const args = buildCliArgs(baseInputs, { commitSha: 'abc' })
    expect(args).toContain('--commit-sha')
    expect(args).not.toContain('--branch')
    expect(args).not.toContain('--test-framework')
    expect(args).not.toContain('--test-suite')
  })

  it('forwards --debug only when inputs.debug is true', () => {
    const off = buildCliArgs(baseInputs, {})
    const on = buildCliArgs({ ...baseInputs, debug: true }, {})
    expect(off).not.toContain('--debug')
    expect(on).toContain('--debug')
  })

  it('includes --token when apiKey is set', () => {
    const args = buildCliArgs(baseInputs, {})
    expect(args).toContain('--token')
    expect(args[args.indexOf('--token') + 1]).toBe('gfr_test')
  })

  it('omits --token entirely when apiKey is undefined (OIDC fallback)', () => {
    const args = buildCliArgs({ ...baseInputs, apiKey: undefined }, {})
    expect(args).not.toContain('--token')
  })
})

describe('redactToken', () => {
  it('replaces the value following --token without mutating the input', () => {
    const original = [
      './report.xml',
      '--token',
      'gfr_secret',
      '--branch',
      'main'
    ]
    const redacted = redactToken(original)
    expect(redacted).not.toBe(original)
    expect(redacted).toEqual([
      './report.xml',
      '--token',
      '<redacted>',
      '--branch',
      'main'
    ])
    expect(original).toContain('gfr_secret')
  })

  it('is a no-op when --token is absent', () => {
    const original = ['./report.xml', '--branch', 'main']
    expect(redactToken(original)).toEqual(original)
  })

  it('handles --token at the end of the array gracefully', () => {
    const original = ['./report.xml', '--token']
    expect(redactToken(original)).toEqual(['./report.xml', '--token'])
  })
})

describe('parseEnvelope', () => {
  it('returns the most recent envelope on stdout', () => {
    const stdout = `${JSON.stringify({ status: 'pending' })}\n${JSON.stringify({ status: 'success', uploadSessionId: 'upl_a' })}\n`
    expect(parseEnvelope(stdout, '')).toMatchObject({
      status: 'success',
      uploadSessionId: 'upl_a'
    })
  })

  it('falls back to stderr when stdout has no envelope', () => {
    expect(
      parseEnvelope('', JSON.stringify({ status: 'error', message: 'x' }))
    ).toMatchObject({
      status: 'error',
      message: 'x'
    })
  })

  it('ignores non-JSON noise around the envelope', () => {
    const stdout = `Uploading...\n${JSON.stringify({ status: 'success' })}\nbye\n`
    expect(parseEnvelope(stdout, '')).toMatchObject({ status: 'success' })
  })

  it('returns null when no JSON line carries a status field', () => {
    expect(parseEnvelope('hello\n{"foo":1}\n', '')).toBeNull()
  })

  it('returns null on unparsable JSON', () => {
    expect(parseEnvelope('{not-json}\n', '')).toBeNull()
  })
})
