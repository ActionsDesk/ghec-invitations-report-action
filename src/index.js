const path = require('path')
const core = require('@actions/core')
const github = require('@actions/github')
const dayjs = require('dayjs')

const Report = require('./report')

const run = async () => {
  try {
    const reportPath = core.getInput('report_path', {required: false}) || 'invitation-report.csv'
    const committerName = core.getInput('committer_name', {required: false}) || 'invitation-reporter[bot]'
    const committerEmail = core.getInput('committer_email', {required: false}) || 'invitation@reporter'

    const filePath = path.join(process.env.GITHUB_WORKSPACE, reportPath)
    const {dir} = path.parse(filePath)

    if (dir.indexOf(process.env.GITHUB_WORKSPACE) < 0) {
      throw new Error(`${reportPath} is not an allowed path`)
    }

    const enterprise = core.getInput('enterprise', {required: false})
    const token = core.getInput('token', {required: true})
    const octokit = await new github.getOctokit(token)

    const {owner, repo} = github.context.repo

    const report = new Report(octokit, {
      fp: reportPath,
      name: committerName,
      email: committerEmail,
      owner,
      repo,
      enterprise
    })
    report.reportDate = dayjs().toISOString()
    const {before, after} = await report.create()

    core.setOutput('base_sha', before)
    core.setOutput('head_sha', after)
  } catch (error) {
    core.setFailed(error.message)
  }
}

module.exports = {run}
