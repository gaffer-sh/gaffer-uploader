# Gaffer Uploader GitHub Action

[![GitHub Super-Linter](https://github.com/actions/typescript-action/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/actions/typescript-action/actions/workflows/ci.yml/badge.svg)
[![Check dist/](https://github.com/actions/typescript-action/actions/workflows/check-dist.yml/badge.svg)](https://github.com/actions/typescript-action/actions/workflows/check-dist.yml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

Use this action to upload your test reports to Gaffer.

For more examples, visit the
[Gaffer GitHub Action documentation](https://docs.gaffer.sh/guides/github-action).

## Inputs

| Input            | Required | Description                                                |
| ---------------- | -------- | ---------------------------------------------------------- |
| `gaffer_api_key` | Yes      | Gaffer API key for your project                            |
| `report_path`    | Yes      | Path to the report file or directory to upload             |
| `api_endpoint`   | No       | Custom API endpoint URL (for preview/staging environments) |
| `commit_sha`     | No       | Git commit SHA to associate with the test run              |
| `branch`         | No       | Git branch to associate with the test run                  |
| `test_framework` | No       | Test framework used (e.g., jest, vitest, pytest)           |
| `test_suite`     | No       | Name of the test suite                                     |

## Usage

### Basic Usage

```yaml
- name: Gaffer Upload
  uses: gaffer-sh/gaffer-uploader@v1
  if: always()
  with:
    gaffer_api_key: ${{ secrets.GAFFER_API_KEY }}
    report_path: ./test-results.html
    commit_sha: ${{ github.sha }}
    branch: ${{ github.ref_name }}
    test_framework: jest
    test_suite: unit
```

### Usage with Artifacts

```yaml
- name: Download all reports from artifacts
  uses: actions/download-artifact@v4
  with:
    path: all-reports
    pattern: all-reports-*
    merge-multiple: true

- name: Gaffer Upload
  uses: gaffer-sh/gaffer-uploader@v1
  if: always()
  with:
    gaffer_api_key: ${{ secrets.GAFFER_API_KEY }}
    report_path: ./all-reports
    commit_sha: ${{ github.sha }}
    branch: ${{ github.ref_name }}
    test_framework: jest
    test_suite: unit
```

### Custom API Endpoint

For preview or staging environments, use the `api_endpoint` input:

```yaml
- name: Gaffer Upload
  uses: gaffer-sh/gaffer-uploader@v1
  if: always()
  with:
    gaffer_api_key: ${{ secrets.GAFFER_API_KEY }}
    report_path: ./test-results.html
    api_endpoint: https://preview.gaffer.sh/api/upload
    commit_sha: ${{ github.sha }}
    branch: ${{ github.ref_name }}
```

## Usage with Environment Variables

Depending on your GitHub Action trigger, you may need to use different methods
to set the `branch` parameter.

This is the most reliable way to set the `branch` parameter:

```yaml
env:
  branch_name: ${{ github.head_ref || github.ref_name }}
```
