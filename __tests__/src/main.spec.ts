import * as core from '@actions/core'
import * as childProcess from 'child_process'
import { run } from '../../src/main'
import * as actionUtils from '../../src/utils/action-utils'
import * as cliInstall from '../../src/utils/cli-install'

jest.mock('@actions/core')
jest.mock('child_process')
jest.mock('../../src/utils/action-utils')
jest.mock('../../src/utils/cli-install')

const mockedCore = jest.mocked(core)
const mockedActionUtils = jest.mocked(actionUtils)
const mockedCliInstall = jest.mocked(cliInstall)
const mockedSpawnSync = jest.mocked(childProcess.spawnSync)

const baseInputs = {
  apiKey: 'gfr_test',
  reportPath: './reports/test.xml',
  apiEndpoint: 'https://app.gaffer.sh/api/upload',
  timeoutMs: 30000,
  maxFileSizeBytes: 100 * 1024 * 1024,
  debug: false
}

function mockSuccessfulCliRun(stdout: string): void {
  mockedSpawnSync.mockReturnValue({
    pid: 0,
    output: [],
    stdout,
    stderr: '',
    status: 0,
    signal: null
  } as ReturnType<typeof childProcess.spawnSync>)
}

describe('main', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedCore.getInput.mockReturnValue('')
    mockedCliInstall.installCli.mockResolvedValue({
      binaryPath: '/runner/_tool/gaffer/0.4.0/linux-amd64/gaffer',
      version: '0.4.0'
    })
  })

  it('passes parsed inputs through to the CLI and surfaces session IDs', async () => {
    mockedActionUtils.parseActionInputs.mockReturnValue(baseInputs)
    mockedActionUtils.parseTestRunTagsFromInputs.mockReturnValue({
      commitSha: 'abc123',
      branch: 'main',
      framework: 'playwright',
      testSuite: 'e2e'
    })
    mockSuccessfulCliRun(
      JSON.stringify({
        status: 'success',
        uploadSessionId: 'upl_abc',
        projectId: 'prj_xyz',
        filesUploaded: 3,
        bytesUploaded: 1024,
        elapsedMs: 850
      })
    )

    await run()

    expect(mockedCliInstall.installCli).toHaveBeenCalled()
    expect(mockedSpawnSync).toHaveBeenCalledWith(
      '/runner/_tool/gaffer/0.4.0/linux-amd64/gaffer',
      [
        'upload',
        './reports/test.xml',
        '--token',
        'gfr_test',
        '--api-url',
        'https://app.gaffer.sh',
        '--commit-sha',
        'abc123',
        '--branch',
        'main',
        '--test-framework',
        'playwright',
        '--test-suite',
        'e2e',
        '--timeout',
        '30',
        '--max-file-size-mb',
        '100'
      ],
      expect.objectContaining({ encoding: 'utf-8' })
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
    mockSuccessfulCliRun(JSON.stringify({ status: 'success' }))

    await run()

    const callArgs = mockedSpawnSync.mock.calls[0][1] as string[]
    const apiUrlIdx = callArgs.indexOf('--api-url')
    expect(callArgs[apiUrlIdx + 1]).toBe('https://preview.gaffer.sh')
  })

  it('forwards --debug when debug input is true', async () => {
    mockedActionUtils.parseActionInputs.mockReturnValue({
      ...baseInputs,
      debug: true
    })
    mockedActionUtils.parseTestRunTagsFromInputs.mockReturnValue({})
    mockSuccessfulCliRun(JSON.stringify({ status: 'success' }))

    await run()

    const callArgs = mockedSpawnSync.mock.calls[0][1] as string[]
    expect(callArgs).toContain('--debug')
  })

  it('still sets status when the CLI emits no JSON line', async () => {
    mockedActionUtils.parseActionInputs.mockReturnValue(baseInputs)
    mockedActionUtils.parseTestRunTagsFromInputs.mockReturnValue({})
    mockSuccessfulCliRun('uploaded\n')

    await run()

    expect(mockedCore.setOutput).toHaveBeenCalledWith('status', 'success')
    expect(mockedCore.setOutput).not.toHaveBeenCalledWith(
      'test_run_id',
      expect.anything()
    )
    expect(mockedCore.setFailed).not.toHaveBeenCalled()
  })

  it('fails when the CLI exits non-zero', async () => {
    mockedActionUtils.parseActionInputs.mockReturnValue(baseInputs)
    mockedActionUtils.parseTestRunTagsFromInputs.mockReturnValue({})
    mockedSpawnSync.mockReturnValue({
      pid: 0,
      output: [],
      stdout: '',
      stderr: '',
      status: 2,
      signal: null
    } as ReturnType<typeof childProcess.spawnSync>)

    await run()

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('exit')
    )
    expect(mockedCore.setOutput).not.toHaveBeenCalledWith('status', 'success')
  })

  it('fails cleanly when parseActionInputs throws', async () => {
    mockedActionUtils.parseActionInputs.mockImplementation(() => {
      throw new Error('Upload token not provided.')
    })

    await run()

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      'Upload token not provided.'
    )
    expect(mockedSpawnSync).not.toHaveBeenCalled()
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
    expect(mockedSpawnSync).not.toHaveBeenCalled()
  })

  it('reads cli_version input and passes it to installCli', async () => {
    mockedCore.getInput.mockImplementation((name: string) =>
      name === 'cli_version' ? '0.5.0' : ''
    )
    mockedActionUtils.parseActionInputs.mockReturnValue(baseInputs)
    mockedActionUtils.parseTestRunTagsFromInputs.mockReturnValue({})
    mockSuccessfulCliRun(JSON.stringify({ status: 'success' }))

    await run()

    expect(mockedCliInstall.installCli).toHaveBeenCalledWith('0.5.0')
  })
})
