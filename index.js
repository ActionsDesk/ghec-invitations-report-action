/**
 * Invitations Report Action.
 */
const {getInput, setFailed, setOutput} = require('@actions/core')
const github = require('@actions/github')

const dayjs = require('dayjs')
const {Parser} = require('json2csv')

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
    const {email, login, created_at, inviter, team_count} = invite

    invitees.push({org, login, email, created_at, inviter: inviter.login, team_count})
  }
}

;(async () => {
  const token = getInput('token', {required: true})
  const path = getInput('report-path', {required: false})
  const enterprise = getInput('enterprise', {required: false})

  const octokit = new github.getOctokit(token)

  const {context} = github
  const {owner, repo} = context.repo

  const invitees = []

  let fields = [
    {label: 'Username', value: 'login'},
    {label: 'Email', value: 'email'},
    {label: 'Invitation creation date', value: 'created_at'},
    {label: 'Inviter', value: 'inviter'}
  ]

  try {
    if (enterprise !== '') {
      fields = [{label: 'Organization', value: 'org'}, ...fields]

      // get all orgs in the GitHub Enterprise Cloud account
      const orgs = await getOrganizations(octokit, enterprise).next()

      for (const org of orgs.value) {
        await getInvitees(octokit, org, invitees)
      }
    } else {
      await getInvitees(octokit, owner, invitees)
    }

    const date = dayjs().toISOString()

    // If we do not have any invitees, stop here
    if (invitees.length <= 0) {
      setOutput(`no pending invitations for ${date}`)
      process.exit(0)
    }

    const json2csvParser = new Parser({fields})
    const csv = json2csvParser.parse(invitees)

    const opts = {
      owner,
      repo,
      path,
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
        path
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
