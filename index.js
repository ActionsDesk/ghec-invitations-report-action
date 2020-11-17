/**
 * Invitations Report Action.
 */
const path = require('path')

const {getInput, setFailed} = require('@actions/core')
const github = require('@actions/github')
const dayjs = require('dayjs')
const stringify = require('csv-stringify/lib/sync')

async function* getOrganizations(octokit, enterprise = '', cursor = null, records = []) {
  const {
    enterprise: {
      organizations: {nodes, pageInfo}
    }
  } = await octokit.graphql(
    `query ($enterprise: String!, $cursor: String) {
  enterprise(slug: $enterprise) {
    organizations(first: 100, after: $cursor) {
      nodes {
        login
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}`,
    {enterprise, cursor}
  )

  for (const node of nodes) {
    records.push(node.login)
  }

  if (pageInfo.hasNextPage) {
    await getOrganizations(octokit, enterprise, pageInfo.endCursor, records).next()
  }

  yield records
}

async function getInvitees(octokit, org, invitees) {
  const invitations = await octokit.paginate('GET /orgs/:org/invitations', {
    org
  })

  for (const invite of invitations) {
    const {email, login, created_at, inviter} = invite

    invitees.push({org, login, email, created_at, inviter: inviter.login})
  }
}

;(async () => {
  try {
    const reportPath = getInput('report-path', {required: false}) || 'invitation-report.csv'

    const filePath = path.join(process.env.GITHUB_WORKSPACE, reportPath)
    const {dir} = path.parse(filePath)

    if (dir.indexOf(process.env.GITHUB_WORKSPACE) < 0) {
      throw new Error(`${reportPath} is not an allowed path`)
    }

    const enterprise = getInput('enterprise', {required: false})

    const token = getInput('token', {required: true})
    const octokit = new github.getOctokit(token)

    const {context} = github
    const {owner, repo} = context.repo

    const invitees = [
      {
        org: 'Organization',
        login: 'Username',
        email: 'Email',
        created_at: 'Invitation creation date',
        inviter: 'Inviter'
      }
    ]

    if (enterprise !== '') {
      // get all orgs in the GitHub Enterprise Cloud account
      const orgs = await getOrganizations(octokit, enterprise).next()

      for (const org of orgs.value) {
        await getInvitees(octokit, org, invitees)
      }
    } else {
      await getInvitees(octokit, owner, invitees)
    }

    const csv = stringify(invitees, {})

    const date = dayjs().toISOString()

    const opts = {
      owner,
      repo,
      path: reportPath,
      message: `${date} invitation report`,
      content: Buffer.from(csv).toString('base64'),
      committer: {
        name: 'invitation-reporter[bot]',
        email: 'invitation@reporter'
      }
    }

    // try to get the sha, if the file already exists
    try {
      const {data} = await octokit.repos.getContent({
        owner,
        repo,
        path: reportPath
      })

      if (data && data.sha) opts.sha = data.sha
    } catch (err) {
      // do nothing
    }

    await octokit.repos.createOrUpdateFileContents(opts)
  } catch (err) {
    setFailed(err.message)
  }
})()
