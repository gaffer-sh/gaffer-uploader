import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const CLI_REPO = 'gaffer-sh/gaffer'

/**
 * Default CLI version installed when the action input `cli_version` is empty.
 * Bump alongside any v2.x.x release that depends on a newer CLI feature.
 * Pinning by default keeps the Action deterministic; users can opt into a
 * newer CLI without waiting for a v2.x.x release by setting `cli_version`.
 */
const DEFAULT_CLI_VERSION = '0.4.0'

export interface InstallResult {
  binaryPath: string
  version: string
}

export async function installCli(
  requestedVersion?: string
): Promise<InstallResult> {
  const version = (requestedVersion ?? DEFAULT_CLI_VERSION).replace(/^v/, '')
  const target = resolveTarget(os.platform(), os.arch())
  const binaryName = target.startsWith('windows-') ? 'gaffer.exe' : 'gaffer'

  const cachedDir = tc.find('gaffer', version, target)
  if (cachedDir) {
    core.info(`Using cached gaffer ${version} (${target}) from ${cachedDir}`)
    core.addPath(cachedDir)
    return { binaryPath: path.join(cachedDir, binaryName), version }
  }

  const tag = `cli-v${version}`
  const tarballName = `gaffer-${target}.tar.gz`
  const tarballUrl = `https://github.com/${CLI_REPO}/releases/download/${tag}/${tarballName}`
  const checksumsUrl = `https://github.com/${CLI_REPO}/releases/download/${tag}/checksums.txt`
  const auth = process.env.GITHUB_TOKEN
    ? `token ${process.env.GITHUB_TOKEN}`
    : undefined

  core.info(`Downloading ${tarballUrl}`)
  const tarballPath = await tc.downloadTool(tarballUrl, undefined, auth)
  const checksumsPath = await tc.downloadTool(checksumsUrl, undefined, auth)

  const expectedSha = readExpectedSha256(checksumsPath, tarballName)
  const actualSha = await sha256(tarballPath)
  if (expectedSha !== actualSha) {
    throw new Error(
      `SHA256 mismatch for ${tarballName}: expected ${expectedSha}, got ${actualSha}`
    )
  }

  const extracted = await tc.extractTar(tarballPath)
  const binaryDir = locateBinaryDir(extracted, binaryName)
  fs.chmodSync(path.join(binaryDir, binaryName), 0o755)

  const cachedRoot = await tc.cacheDir(binaryDir, 'gaffer', version, target)
  core.addPath(cachedRoot)
  core.info(`Installed gaffer ${version} (${target}) to ${cachedRoot}`)
  return { binaryPath: path.join(cachedRoot, binaryName), version }
}

function resolveTarget(platform: string, arch: string): string {
  const targets: Record<string, Record<string, string>> = {
    linux: { x64: 'linux-amd64', arm64: 'linux-arm64' },
    darwin: { x64: 'darwin-amd64', arm64: 'darwin-arm64' },
    win32: { x64: 'windows-amd64' }
  }
  const target = targets[platform]?.[arch]
  if (!target) {
    throw new Error(
      `Unsupported runner: ${platform}/${arch}. Supported targets: linux-amd64, linux-arm64, darwin-amd64, darwin-arm64, windows-amd64. ` +
        `Pin uses: gaffer-sh/gaffer-uploader@v1 for the TypeScript implementation that runs anywhere with Node.`
    )
  }
  return target
}

function readExpectedSha256(checksumsPath: string, filename: string): string {
  const content = fs.readFileSync(checksumsPath, 'utf-8')
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(/\s+/)
    if (parts.length < 2) continue
    const [sum, file] = parts
    // checksums.txt entries may use a leading "*" for binary mode (sha256sum -b)
    if (file === filename || file === `*${filename}`) return sum
  }
  throw new Error(`No checksum entry for ${filename} in checksums.txt`)
}

function locateBinaryDir(extractRoot: string, binaryName: string): string {
  if (fs.existsSync(path.join(extractRoot, binaryName))) {
    return extractRoot
  }
  const subdirs = fs
    .readdirSync(extractRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(extractRoot, d.name))
  for (const sub of subdirs) {
    if (fs.existsSync(path.join(sub, binaryName))) return sub
  }
  throw new Error(
    `Extracted archive ${extractRoot} does not contain ${binaryName}`
  )
}

async function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(file)
    stream.on('error', reject)
    stream.on('data', chunk => hash.update(chunk as Buffer))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}
