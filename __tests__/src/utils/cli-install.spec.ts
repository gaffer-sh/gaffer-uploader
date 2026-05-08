import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  normalizeVersion,
  readExpectedSha256,
  resolveTarget
} from '../../../src/utils/cli-install'

describe('resolveTarget', () => {
  const supported: [string, string, string][] = [
    ['linux', 'x64', 'linux-amd64'],
    ['linux', 'arm64', 'linux-arm64'],
    ['darwin', 'x64', 'darwin-amd64'],
    ['darwin', 'arm64', 'darwin-arm64'],
    ['win32', 'x64', 'windows-amd64']
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
      'aaaa  gaffer-linux-arm64.tar.gz\nbbbb  gaffer-linux-amd64.tar.gz\n'
    )
    expect(readExpectedSha256(filePath, 'gaffer-linux-amd64.tar.gz')).toBe(
      'bbbb'
    )
  })

  it('accepts the binary-mode "*filename" form sha256sum can emit', () => {
    const filePath = writeChecksums('cccc *gaffer-darwin-arm64.tar.gz\n')
    expect(readExpectedSha256(filePath, 'gaffer-darwin-arm64.tar.gz')).toBe(
      'cccc'
    )
  })

  it('throws when the requested filename is absent', () => {
    const filePath = writeChecksums('aaaa  gaffer-linux-amd64.tar.gz\n')
    expect(() =>
      readExpectedSha256(filePath, 'gaffer-windows-amd64.tar.gz')
    ).toThrow(/No checksum entry for gaffer-windows-amd64\.tar\.gz/)
  })

  it('skips blank lines and tolerates extra whitespace', () => {
    const filePath = writeChecksums(
      '\n\n   abcd    gaffer-linux-amd64.tar.gz   \n\n'
    )
    expect(readExpectedSha256(filePath, 'gaffer-linux-amd64.tar.gz')).toBe(
      'abcd'
    )
  })
})
