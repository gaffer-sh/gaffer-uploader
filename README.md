# gaffer-uploader

GitHub Action that uploads test reports to [Gaffer](https://gaffer.sh).

`v2` is a thin wrapper around the `gaffer` CLI. The Action installs a prebuilt
binary on the runner, then invokes `gaffer upload` with your inputs. Files
larger than 90 MB automatically route through Gaffer's R2 multipart upload
endpoints, so individual reports up to 5 GB upload end-to-end without any extra
configuration. Plan storage caps are the only practical ceiling.

## Usage

```yaml
- name: Upload test reports to Gaffer
  uses: gaffer-sh/gaffer-uploader@v2
  if: always()
  with:
    gaffer_upload_token: ${{ secrets.GAFFER_UPLOAD_TOKEN }}
    report_path: ./test-results
    commit_sha: ${{ github.sha }}
    branch: ${{ github.ref_name }}
    test_framework: playwright
    test_suite: e2e
```

## Inputs

| Input                 | Required | Description                                                                                                                                                                                                      |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gaffer_upload_token` | Yes      | Project upload token (`gfr_...`). Create one in **Project Settings > Upload Tokens**.                                                                                                                            |
| `report_path`         | Yes      | File or directory containing reports to upload. Directories are walked recursively.                                                                                                                              |
| `commit_sha`          | No       | Commit recorded as a tag on the upload session. Default: from `${{ github.sha }}` if you pass it.                                                                                                                |
| `branch`              | No       | Branch recorded as a tag on the upload session.                                                                                                                                                                  |
| `test_framework`      | No       | Test framework label, e.g. `playwright`, `jest`, `pytest`.                                                                                                                                                       |
| `test_suite`          | No       | Test suite label, e.g. `unit`, `integration`, `e2e`.                                                                                                                                                             |
| `api_endpoint`        | No       | Override the dashboard URL. Use `https://preview.gaffer.sh` for preview deploys. Both bare URLs and the legacy `/api/upload` form are accepted.                                                                  |
| `upload_timeout`      | No       | Per-request HTTP timeout in seconds (default: `30`). Bump to `300` or higher for multi-gigabyte uploads — each multipart `PUT` runs against this timeout.                                                        |
| `max_file_size_mb`    | No       | Per-file size limit in MB (default: `100`, platform max: `5000`). Files above this are rejected up front. Multipart elevation above 90 MB is automatic — there is no separate flag for it.                       |
| `cli_version`         | No       | Pin the `gaffer` CLI version installed by this Action. Defaults to the version this Action was released with. Set this only if you need a newer CLI feature without waiting for a new `gaffer-uploader` release. |
| `debug`               | No       | Print per-part throughput and the CLI's structured response (default: `false`).                                                                                                                                  |
| `gaffer_api_key`      | No       | **Deprecated.** Use `gaffer_upload_token`. Still accepted for v1 compatibility, with a warning at runtime.                                                                                                       |

## Outputs

| Output        | Description                                                                     |
| ------------- | ------------------------------------------------------------------------------- |
| `status`      | `success` when the upload completed cleanly. `set-failed` is invoked otherwise. |
| `test_run_id` | The upload session ID (`upl_...`) when the CLI emits one.                       |
| `project_id`  | The project ID (`prj_...`) the upload landed in.                                |

## Large file support

Above 90 MB, the CLI transparently routes each file through Gaffer's
[R2 multipart upload endpoints](https://gaffer.sh/docs/upload-api/) instead of
the single-POST `/api/upload` path. Parts are PUT 8-way concurrent with
exponential-backoff retries on transient 5xx and network errors. Per-file
ceiling: 5 GB. Total upload size is gated only by your plan's storage cap.

For very large uploads, raise `upload_timeout` so each part PUT has room to
complete:

```yaml
- uses: gaffer-sh/gaffer-uploader@v2
  with:
    gaffer_upload_token: ${{ secrets.GAFFER_UPLOAD_TOKEN }}
    report_path: ./playwright-trace.zip
    upload_timeout: '600'
    max_file_size_mb: '5000'
```

## Upgrading from v1

The workflow YAML diff is one line: `@v0.5.1 → @v2`. All v1 inputs and outputs
are preserved. The deprecated `gaffer_api_key` alias still works (with a
warning).

What changes operationally:

- **Cold runners download a 5–15 MB binary** from
  `github.com/gaffer-sh/gaffer/releases` on the first job run, then cache it via
  `actions/tool-cache`. The Action passes the runner's `GITHUB_TOKEN` to the
  download to lift the anonymous rate limit (60/hr → ~1000/hr).
- **Debug log format changed.** v1 dumped axios response objects; v2 forwards
  the CLI's structured success line plus, on failure, a human-readable block
  with problem/cause/fix and the upload session ID + Cloudflare Ray ID.
  Workflows that grep for specific v1 strings will need updates.
- **Supported runner targets** are `linux-amd64`, `linux-arm64`, `darwin-amd64`,
  `darwin-arm64`, and `windows-amd64`. v1 ran anywhere `node24` ran; if you have
  self-hosted runners on other architectures, see the escape hatch below.

If any of those are dealbreakers in your environment, **pin `@v1`** to stay on
the proven TypeScript path. `gaffer-sh/gaffer-uploader@v1` is preserved
indefinitely:

```yaml
- uses: gaffer-sh/gaffer-uploader@v1
  with:
    gaffer_api_key: ${{ secrets.GAFFER_UPLOAD_TOKEN }}
    report_path: ./test-results.html
```

The v1 path keeps the original axios/form-data implementation, which works in
any Node 24 environment but tops out at ~100 MB per request (Cloudflare edge
cap).

## When uploads fail

The `gaffer` CLI exits non-zero and writes structured failure metadata. The
Action surfaces the CLI's stderr block directly, and the run ends with
`core.setFailed`. Look for two things in the failed step's logs:

- The single JSON line summarizing the error
  (`{"status":"error","kind":"...","sessionId":"upl_...","rayId":"..."}`).
- The human-readable block below it: a one-line problem statement, probable
  cause, suggested fix, the upload session ID, and the Cloudflare Ray ID.

When filing an issue, paste the JSON line and the Ray ID — those are enough to
look the upload up in Gaffer's logs and trace it through Cloudflare.

Exit codes:

| Code | Meaning                                                                              |
| ---- | ------------------------------------------------------------------------------------ |
| `0`  | Success.                                                                             |
| `1`  | User error (missing token, file too large, path not found).                          |
| `2`  | Server error (4xx after retries, repeated 5xx, network failure).                     |
| `3`  | Unexpected (panic in a part task, JSON parse failure, runtime initialization error). |

## Development

```sh
pnpm install
pnpm test          # unit tests (jest)
pnpm run bundle    # rebuild dist/ via @vercel/ncc; required after any src/ change
pnpm run all       # full pre-PR pass: format + lint + test + coverage + bundle
```

The committed `dist/index.js` is the runtime artifact GitHub Actions executes.
CI (`check-dist.yml`) fails any PR whose `dist/` is out of sync with `src/`.

## Releasing

1. Land your `src/` changes; rebuild `dist/` and commit.
1. Run `pnpm run release`, pick the new version (e.g. `2.0.0`). `bumpp` bumps
   `package.json`, commits, and tags `vX.Y.Z`.
1. The release workflow auto-creates a GitHub Release with generated notes.
1. Update the major-version alias so `@v2` resolves to the new release:
   `git tag -f v2 vX.Y.Z && git push -f origin v2`.
1. For the first release in a new major, manually publish to GitHub Marketplace
   from the Release UI ("Publish this Action to the GitHub Marketplace").
   Subsequent same-major releases auto-republish.

## License

[MIT](LICENSE)
