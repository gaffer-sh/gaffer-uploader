export type TestRunTags = {
  commitSha?: string
  branch?: string
  framework?: string
  testSuite?: string
}

export type GafferUploadResponse = {
  runId?: string
  reportUrl?: string
  status?: string
}
