import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  installCli,
  normalizeVersion,
  readExpectedSha256,
  resolveTarget
} from '../../../src/utils/cli-install'

jest.mock('@actions/core')
jest.mock('@actions/tool-cache')
// Only platform()/arch() are faked (installCli's target-resolution inputs);
// everything else — including tmpdir(), used by this file's own fixtures —
// stays real. Node's built-in module exports aren't configurable, so
// jest.spyOn(os, 'platform') fails; mocking the module is the only way in.
jest.mock('os', () => ({
  ...jest.requireActual('os'),
  platform: jest.fn(),
  arch: jest.fn()
}))

const mockedCore = jest.mocked(core)
const mockedTc = jest.mocked(tc)
const mockedOs = jest.mocked(os)

describe('resolveTarget', () => {
  // Must match the asset names published by gaffer-sh/gaffer's release-cli.yml.
  // If that pipeline ever switches naming conventions, this table is the
  // canary that flags the resulting release-asset 404s in unit tests instead
  // of in production CI runs.
  const supported: [string, string, string][] = [
    ['linux', 'x64', 'x86_64-unknown-linux-gnu'],
    ['linux', 'arm64', 'aarch64-unknown-linux-gnu'],
    ['darwin', 'x64', 'x86_64-apple-darwin'],
    ['darwin', 'arm64', 'aarch64-apple-darwin'],
    ['win32', 'x64', 'x86_64-pc-windows-gnu']
  ]

  test.each(supported)('maps %s/%s to %s', (platform, arch, expected) => {
    expect(resolveTarget(platform, arch)).toBe(expected)
  })

  it('rejects unsupported platform/arch combos with a clear escape-hatch message', () => {
    expect(() => resolveTarget('linux', 'arm32')).toThrow(
      /Unsupported runner: linux\/arm32/
    )
    expect(() => resolveTarget('linux', 'arm32')).toThrow(
      /gaffer-sh\/gaffer-uploader@v1/
    )
    expect(() => resolveTarget('freebsd', 'x64')).toThrow(
      /Unsupported runner: freebsd\/x64/
    )
    expect(() => resolveTarget('win32', 'arm64')).toThrow(
      /Unsupported runner: win32\/arm64/
    )
  })
})

describe('normalizeVersion', () => {
  it('returns the default version when given undefined', () => {
    expect(normalizeVersion(undefined)).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('strips a leading "v"', () => {
    expect(normalizeVersion('v1.2.3')).toBe('1.2.3')
  })

  it('accepts simple semver', () => {
    expect(normalizeVersion('0.4.0')).toBe('0.4.0')
    expect(normalizeVersion('10.20.30')).toBe('10.20.30')
  })

  it('accepts pre-release identifiers', () => {
    expect(normalizeVersion('1.0.0-rc.1')).toBe('1.0.0-rc.1')
    expect(normalizeVersion('1.0.0-alpha.0')).toBe('1.0.0-alpha.0')
  })

  it('rejects shell metacharacters and path traversal', () => {
    expect(() => normalizeVersion('1.0.0; rm -rf /')).toThrow(
      /Invalid cli_version/
    )
    expect(() => normalizeVersion('../../../etc/passwd')).toThrow(
      /Invalid cli_version/
    )
    expect(() => normalizeVersion('1.0.0/../../escape')).toThrow(
      /Invalid cli_version/
    )
  })

  it('rejects empty and obviously malformed strings', () => {
    expect(() => normalizeVersion('not-a-version')).toThrow(
      /Invalid cli_version/
    )
    expect(() => normalizeVersion('1.0')).toThrow(/Invalid cli_version/)
    expect(() => normalizeVersion('1.0.0.0')).toThrow(/Invalid cli_version/)
  })
})

describe('readExpectedSha256', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-install-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function writeChecksums(content: string): string {
    const filePath = path.join(tmpDir, 'checksums.txt')
    fs.writeFileSync(filePath, content)
    return filePath
  }

  it('extracts the sha for a matching filename', () => {
    const filePath = writeChecksums(
      'aaaa  gaffer-aarch64-unknown-linux-gnu.tar.gz\nbbbb  gaffer-x86_64-unknown-linux-gnu.tar.gz\n'
    )
    expect(
      readExpectedSha256(filePath, 'gaffer-x86_64-unknown-linux-gnu.tar.gz')
    ).toBe('bbbb')
  })

  it('accepts the binary-mode "*filename" form sha256sum can emit', () => {
    const filePath = writeChecksums(
      'cccc *gaffer-aarch64-apple-darwin.tar.gz\n'
    )
    expect(
      readExpectedSha256(filePath, 'gaffer-aarch64-apple-darwin.tar.gz')
    ).toBe('cccc')
  })

  it('throws when the requested filename is absent', () => {
    const filePath = writeChecksums(
      'aaaa  gaffer-x86_64-unknown-linux-gnu.tar.gz\n'
    )
    expect(() =>
      readExpectedSha256(filePath, 'gaffer-x86_64-pc-windows-gnu.tar.gz')
    ).toThrow(/No checksum entry for gaffer-x86_64-pc-windows-gnu\.tar\.gz/)
  })

  it('skips blank lines and tolerates extra whitespace', () => {
    const filePath = writeChecksums(
      '\n\n   abcd    gaffer-x86_64-unknown-linux-gnu.tar.gz   \n\n'
    )
    expect(
      readExpectedSha256(filePath, 'gaffer-x86_64-unknown-linux-gnu.tar.gz')
    ).toBe('abcd')
  })
})

describe('installCli', () => {
  // Only @actions/tool-cache and @actions/core are mocked — the download,
  // checksum, and extraction steps run against real temp-dir fixtures so the
  // test exercises the actual sha256/fs logic, not a mock of it.
  let tmpDir: string

  beforeEach(() => {
    jest.clearAllMocks()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-install-installCli-'))
    mockedOs.platform.mockReturnValue('linux')
    mockedOs.arch.mockReturnValue('x64')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function sha256Of(filePath: string): string {
    return crypto
      .createHash('sha256')
      .update(fs.readFileSync(filePath))
      .digest('hex')
  }

  function mockDownloads(tarballPath: string, checksumsPath: string): void {
    mockedTc.downloadTool.mockImplementation(async (url: unknown) =>
      String(url).endsWith('checksums.txt') ? checksumsPath : tarballPath
    )
  }

  it('uses a cached install and skips downloading entirely', async () => {
    mockedTc.find.mockReturnValue(tmpDir)

    const result = await installCli('1.2.3')

    expect(result).toEqual({
      binaryPath: path.join(tmpDir, 'gaffer'),
      version: '1.2.3'
    })
    expect(mockedCore.addPath).toHaveBeenCalledWith(tmpDir)
    expect(mockedTc.downloadTool).not.toHaveBeenCalled()
  })

  it('uses the .exe binary name and skips chmod on Windows', async () => {
    mockedOs.platform.mockReturnValue('win32')
    mockedTc.find.mockReturnValue('')

    const tarballPath = path.join(tmpDir, 'tarball')
    fs.writeFileSync(tarballPath, 'fake windows tarball bytes')
    const checksumsPath = path.join(tmpDir, 'checksums.txt')
    fs.writeFileSync(
      checksumsPath,
      `${sha256Of(tarballPath)}  gaffer-x86_64-pc-windows-gnu.tar.gz\n`
    )
    mockDownloads(tarballPath, checksumsPath)

    const extractDir = path.join(tmpDir, 'extracted-win')
    fs.mkdirSync(extractDir)
    const binaryPath = path.join(extractDir, 'gaffer.exe')
    fs.writeFileSync(binaryPath, 'MZ...', { mode: 0o644 })
    mockedTc.extractTar.mockResolvedValue(extractDir)
    mockedTc.cacheDir.mockImplementation(async sourceDir => sourceDir)

    const result = await installCli('1.2.3')

    expect(result.binaryPath).toBe(binaryPath)
    // chmod is POSIX-only; on win32 the mode must be left untouched.
    expect(fs.statSync(binaryPath).mode & 0o777).toBe(0o644)
  })

  it('downloads, verifies checksum, extracts, chmods, and caches on a cold install', async () => {
    mockedTc.find.mockReturnValue('')

    const tarballPath = path.join(tmpDir, 'tarball')
    fs.writeFileSync(tarballPath, 'fake tarball bytes')
    const checksumsPath = path.join(tmpDir, 'checksums.txt')
    fs.writeFileSync(
      checksumsPath,
      `${sha256Of(tarballPath)}  gaffer-x86_64-unknown-linux-gnu.tar.gz\n`
    )
    mockDownloads(tarballPath, checksumsPath)

    const extractDir = path.join(tmpDir, 'extracted')
    fs.mkdirSync(extractDir)
    fs.writeFileSync(path.join(extractDir, 'gaffer'), '#!/bin/sh\n', {
      mode: 0o644
    })
    mockedTc.extractTar.mockResolvedValue(extractDir)

    const cacheDir = path.join(tmpDir, 'cached')
    fs.mkdirSync(cacheDir)
    fs.writeFileSync(path.join(cacheDir, 'gaffer'), '#!/bin/sh\n')
    mockedTc.cacheDir.mockResolvedValue(cacheDir)

    const result = await installCli('1.2.3')

    expect(result).toEqual({
      binaryPath: path.join(cacheDir, 'gaffer'),
      version: '1.2.3'
    })
    expect(mockedTc.downloadTool).toHaveBeenCalledTimes(2)
    expect(mockedTc.cacheDir).toHaveBeenCalledWith(
      extractDir,
      'gaffer',
      '1.2.3',
      'x86_64-unknown-linux-gnu'
    )
    expect(mockedCore.addPath).toHaveBeenCalledWith(cacheDir)
    const mode = fs.statSync(path.join(extractDir, 'gaffer')).mode & 0o777
    expect(mode).toBe(0o755)
  })

  it('locates the binary inside an extracted subdirectory', async () => {
    mockedTc.find.mockReturnValue('')

    const tarballPath = path.join(tmpDir, 'tarball')
    fs.writeFileSync(tarballPath, 'fake tarball bytes, nested layout')
    const checksumsPath = path.join(tmpDir, 'checksums.txt')
    fs.writeFileSync(
      checksumsPath,
      `${sha256Of(tarballPath)}  gaffer-x86_64-unknown-linux-gnu.tar.gz\n`
    )
    mockDownloads(tarballPath, checksumsPath)

    const extractDir = path.join(tmpDir, 'extracted-nested')
    const subDir = path.join(extractDir, 'gaffer-x86_64-unknown-linux-gnu')
    fs.mkdirSync(subDir, { recursive: true })
    fs.writeFileSync(path.join(subDir, 'gaffer'), '#!/bin/sh\n')
    mockedTc.extractTar.mockResolvedValue(extractDir)
    mockedTc.cacheDir.mockImplementation(async sourceDir => sourceDir)

    const result = await installCli('1.2.3')

    expect(result.binaryPath).toBe(path.join(subDir, 'gaffer'))
  })

  it('throws when the extracted archive does not contain the binary', async () => {
    mockedTc.find.mockReturnValue('')

    const tarballPath = path.join(tmpDir, 'tarball')
    fs.writeFileSync(tarballPath, 'fake tarball bytes, empty layout')
    const checksumsPath = path.join(tmpDir, 'checksums.txt')
    fs.writeFileSync(
      checksumsPath,
      `${sha256Of(tarballPath)}  gaffer-x86_64-unknown-linux-gnu.tar.gz\n`
    )
    mockDownloads(tarballPath, checksumsPath)

    const emptyExtractDir = path.join(tmpDir, 'empty-extract')
    fs.mkdirSync(emptyExtractDir)
    mockedTc.extractTar.mockResolvedValue(emptyExtractDir)

    await expect(installCli('1.2.3')).rejects.toThrow(/does not contain gaffer/)
  })

  it('refuses to install a tarball that fails checksum verification', async () => {
    mockedTc.find.mockReturnValue('')

    const tarballPath = path.join(tmpDir, 'tarball')
    fs.writeFileSync(tarballPath, 'tampered bytes')
    const checksumsPath = path.join(tmpDir, 'checksums.txt')
    fs.writeFileSync(
      checksumsPath,
      `${'0'.repeat(64)}  gaffer-x86_64-unknown-linux-gnu.tar.gz\n`
    )
    mockDownloads(tarballPath, checksumsPath)

    await expect(installCli('1.2.3')).rejects.toThrow(/SHA256 mismatch/)
    expect(mockedTc.extractTar).not.toHaveBeenCalled()
  })

  it('wraps a failed download with the asset label and repo for troubleshooting', async () => {
    mockedTc.find.mockReturnValue('')
    mockedTc.downloadTool.mockRejectedValue(new Error('ETIMEDOUT'))

    await expect(installCli('1.2.3')).rejects.toThrow(
      /Failed to download gaffer 1\.2\.3 \(x86_64-unknown-linux-gnu\) tarball.*ETIMEDOUT.*gaffer-sh\/gaffer/s
    )
  })
})
