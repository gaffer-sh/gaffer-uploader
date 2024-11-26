# Gaffer Uploader GitHub Action

[![GitHub Super-Linter](https://github.com/actions/typescript-action/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/actions/typescript-action/actions/workflows/ci.yml/badge.svg)
[![Check dist/](https://github.com/actions/typescript-action/actions/workflows/check-dist.yml/badge.svg)](https://github.com/actions/typescript-action/actions/workflows/check-dist.yml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

Use this action to upload your HTML test reports to Gaffer.

For more examples, visit the
[Gaffer GitHub Action documentation](https://docs.gaffer.sh/guides/github-action).

## Usage

### Basic Usage

```yaml
- name: Gaffer Upload
  uses: gaffer-sh/gaffer-uploader@v0.1.0
  if: always()
  with:
    # The API key for your Gaffer account
    gaffer_api_key: ${{ secrets.GAFFER_API_KEY }}
    # The path to the file or directory containing your HTML test results file
    report_path: ./test-results.html
    commit_sha: ${{ github.sha }}
    branch: ${{ github.ref_name }}
    test_framework: jest
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
  uses: gaffer-sh/gaffer-uploader@v0.1.0
  if: always()
  with:
    # The API key for your Gaffer account
    gaffer_api_key: ${{ secrets.GAFFER_API_KEY }}
    # The path to the file or directory containing your HTML test results file
    report_path: ./all-reports
    commit_sha: ${{ github.sha }}
    branch: ${{ github.ref_name }}
    test_framework: jest
```

## Usage with Environment Variables

Depending on your Github Action trigger, you may need to use different methods
to set the `branch` parameter.

I've found this to be the most reliable way to set the `branch` parameter:

```yaml
env:
  branch_name: ${{ github.head_ref || github.ref_name }}
```
