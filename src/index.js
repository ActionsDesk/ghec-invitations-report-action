import {join, parse} from 'path'
import {context, getOctokit} from '@actions/github'
import {getInput, setFailed, setOutput} from '@actions/core'
import dayjs from 'dayjs'
import Report from './report.js'

// run
;(async () => {
  try {
    const reportPath = getInput('report_path', {required: false}) || 'invitation-report.csv'
    const committerName = getInput('committer_name', {required: false}) || 'invitation-reporter[bot]'
    const committerEmail = getInput('committer_email', {required: false}) || 'invitation@reporter'

    const filePath = join(process.env.GITHUB_WORKSPACE, reportPath)
    const {dir} = parse(filePath)

    if (dir.indexOf(process.env.GITHUB_WORKSPACE) < 0) {
      throw new Error(`${reportPath} is not an allowed path`)
    }

    const enterprise = getInput('enterprise', {required: false})
    const token = getInput('token', {required: true})
    const octokit = await new getOctokit(token)

    const {owner, repo} = context.repo

    const report = new Report(octokit, {
      fp: reportPath,
      name: committerName,
      email: committerEmail,
      owner,
      repo,
      enterprise,
    })
    report.reportDate = dayjs().toISOString()
    const {before, after} = await report.create()

    setOutput('base_sha', before)
    setOutput('head_sha', after)
  } catch (error) {
    setFailed(error.message)
  }
})()
