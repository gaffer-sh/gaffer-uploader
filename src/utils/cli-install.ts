/**
 * Installs the `gaffer` CLI binary released from gaffer-sh/gaffer.
 *
 * The CLI is fully open source. Source, release pipeline, and
 * sha256 checksums all live in the public repo:
 *   https://github.com/gaffer-sh/gaffer
 *
 * Specifically, the upload code this Action ends up running is in:
 *   - packages/cli/src/commands/upload.rs   (CLI surface + structured errors)
 *   - packages/gaffer-core/src/upload.rs    (routing, MPU client, retries)
 *
 * Release artifacts (tarballs + checksums.txt) are produced by:
 *   .github/workflows/release-cli.yml
 *
 * Trust boundary: the only thing this module guarantees is that the
 * downloaded tarball's bytes match the sha256 line in the release's
 * checksums.txt. Tarball and checksums.txt are both fetched from the same
 * GitHub release asset URL — an attacker who tampers the release can swap
 * both. Cosign / minisign signing is not yet wired up; revisit when we
 * publish the public signing key.
 */
import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const CLI_REPO = 'gaffer-sh/gaffer'

/**
 * Default CLI version installed when `cli_version` input is empty.
 * Last verified against `cli-v0.4.0` (TASK-49). Bump alongside any v2.x.x
 * release that depends on a newer CLI feature; pinning by default keeps
 * the Action deterministic.
 */
// TODO: bump to the first CLI release containing the OIDC exchange before merging (tracked internally as GAF-241).
const DEFAULT_CLI_VERSION = '0.4.0'

/** Conservative semver subset, matches `1.2.3` and `1.2.3-alpha.1`. */
const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/

export interface InstallResult {
  binaryPath: string
  version: string
}

export async function installCli(
  requestedVersion?: string
): Promise<InstallResult> {
  const version = normalizeVersion(requestedVersion)
  const target = resolveTarget(os.platform(), os.arch())
  const binaryName = target.includes('windows') ? 'gaffer.exe' : 'gaffer'

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
  const tarballPath = await downloadWithContext(
    tarballUrl,
    `gaffer ${version} (${target}) tarball`,
    auth
  )
  const checksumsPath = await downloadWithContext(
    checksumsUrl,
    `gaffer ${version} checksums.txt`,
    auth
  )

  const expectedSha = readExpectedSha256(checksumsPath, tarballName)
  const actualSha = await sha256(tarballPath)
  if (expectedSha !== actualSha) {
    throw new Error(
      `SHA256 mismatch for ${tarballName}: expected ${expectedSha}, got ${actualSha}. ` +
        `Refusing to install. Verify the release at https://github.com/${CLI_REPO}/releases/tag/${tag}.`
    )
  }

  const extracted = await tc.extractTar(tarballPath)
  const binaryDir = locateBinaryDir(extracted, binaryName)
  if (os.platform() !== 'win32') {
    fs.chmodSync(path.join(binaryDir, binaryName), 0o755)
  }

  const cachedRoot = await tc.cacheDir(binaryDir, 'gaffer', version, target)
  core.addPath(cachedRoot)
  core.info(`Installed gaffer ${version} (${target}) to ${cachedRoot}`)
  return { binaryPath: path.join(cachedRoot, binaryName), version }
}

export function normalizeVersion(requestedVersion?: string): string {
  const raw = (requestedVersion ?? DEFAULT_CLI_VERSION).replace(/^v/, '').trim()
  if (!VERSION_PATTERN.test(raw)) {
    throw new Error(
      `Invalid cli_version "${requestedVersion}". Expected semver like "0.4.0" or "0.4.0-rc.1".`
    )
  }
  return raw
}

/**
 * Maps Node's platform/arch to the exact Rust target triple the
 * gaffer-sh/gaffer release pipeline names its tarballs after — see
 * .github/workflows/release-cli.yml in that repo. The string returned here
 * is interpolated directly into the release-asset URL and looked up in
 * checksums.txt, so it MUST match the published asset name byte-for-byte
 * (e.g. `gaffer-x86_64-unknown-linux-gnu.tar.gz`).
 */
export function resolveTarget(platform: string, arch: string): string {
  const targets: Record<string, Record<string, string>> = {
    linux: {
      x64: 'x86_64-unknown-linux-gnu',
      arm64: 'aarch64-unknown-linux-gnu'
    },
    darwin: {
      x64: 'x86_64-apple-darwin',
      arm64: 'aarch64-apple-darwin'
    },
    win32: {
      x64: 'x86_64-pc-windows-gnu'
    }
  }
  const target = targets[platform]?.[arch]
  if (!target) {
    throw new Error(
      `Unsupported runner: ${platform}/${arch}. Supported targets: x86_64-unknown-linux-gnu, aarch64-unknown-linux-gnu, x86_64-apple-darwin, aarch64-apple-darwin, x86_64-pc-windows-gnu. ` +
        `Pin uses: gaffer-sh/gaffer-uploader@v1 for the TypeScript implementation that runs anywhere with Node.`
    )
  }
  return target
}

export function readExpectedSha256(
  checksumsPath: string,
  filename: string
): string {
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
  throw new Error(
    `No checksum entry for ${filename} in ${checksumsPath}. ` +
      `The release may be missing this asset or checksums.txt is malformed.`
  )
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

async function downloadWithContext(
  url: string,
  label: string,
  auth?: string
): Promise<string> {
  try {
    return await tc.downloadTool(url, undefined, auth)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Failed to download ${label} from ${url}: ${msg}. ` +
        `Check that the gaffer-sh/gaffer release exists and the asset is present.`
    )
  }
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
