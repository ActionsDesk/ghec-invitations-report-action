import dayjs from 'dayjs'
import {stringify} from 'csv-stringify/sync'

/**
 * @typedef Invitation
 *
 * @property {String} org
 * @property {(String|null)} login
 * @property {(String|null)} email
 * @property {String} created_at
 * @property {(String|null)} failed_at
 * @property {(String|null)} failed_reason
 * @property {String} inviter
 */

/**
 * @typedef Committer
 *
 * @property {String} name
 * @property {String} email
 */

/**
 * @typedef PushOptions
 *
 * @property {String} owner
 * @property {String} repo
 * @property {String} path
 * @property {String} message
 * @property {String} content
 * @property {Committer} committer
 */

/**
 * @typedef ReportResult
 *
 * @property {String} base_sha
 * @property {String} head_sha
 */

/**
 * @exports
 * @type {Report}
 */
export default class Report {
  /**
   * @param {import('@octokit/core').Octokit} octokit
   * @param {Object} options              Report options
   * @param {String} options.fp           Path to the CSV report
   * @param {String} options.owner        Oganization login
   * @param {String} options.repo         Oganization repository
   * @param {String} [options.enterprise] GitHub Enterprise Cloud slug
   */
  constructor(octokit, {fp, owner, repo, enterprise = ''}) {
    this.octokit = octokit

    this.path = fp
    this.name = 'github-actions[bot]'
    this.email = '41898282+github-actions[bot]@users.noreply.github.com'
    this.owner = owner
    this.repo = repo
    this.enterprise = enterprise

    this.date = dayjs().toISOString()
  }

  /**
   * Get enterprise owned organizations
   * @private
   *
   * @param {String} [cursor=null]  GraphQL cursor for pagination
   * @param {String[]} [records=[]] Array of organization logins
   */
  async getOrganizations(cursor = null, records = []) {
    const {
      enterprise: {
        organizations: {nodes, pageInfo},
      },
    } = await this.octokit.graphql(
      `query ($enterprise: String!, $cursor: String = null) {
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
      {enterprise: this.enterprise, cursor},
    )

    for (const node of nodes) {
      records.push(node.login)
    }

    if (pageInfo.hasNextPage) {
      await this.getOrganizations(pageInfo.endCursor, records)
    }

    return records
  }

  /**
   * Get pending invitations
   * @private
   *
   * @param {String} org            Organization login
   * @param {Invitation[]} invitees Array of pending invitations
   */
  async getPendingInvitations(org, invitees) {
    try {
      const invitations = await this.octokit.paginate(this.octokit.rest.orgs.listPendingInvitations, {
        org,
      })

      for (const invite of invitations) {
        const {email, login, created_at, inviter} = invite

        invitees.push({
          org,
          login,
          email,
          created_at: dayjs(created_at).toISOString(),
          failed_at: null,
          failed_reason: null,
          inviter: inviter.login,
        })
      }
    } catch (error) {
      this.octokit.log.info(`Could not get pending invitations for ${org}: ${error.message}`)
    }
  }

  /**
   * Get failed invitations
   * @private
   *
   * @param {String} org            Organization login
   * @param {Invitation[]} invitees Array of failed invitations
   */
  async getFailedInvitations(org, invitees) {
    try {
      const invitations = await this.octokit.paginate(this.octokit.rest.orgs.listFailedInvitations, {
        org,
      })

      for (const invite of invitations) {
        const {email, login, created_at, failed_at, failed_reason, inviter} = invite

        invitees.push({
          org,
          login,
          email,
          created_at: dayjs(created_at).toISOString(),
          failed_at: dayjs(failed_at).toISOString(),
          failed_reason,
          inviter: inviter.login,
        })
      }
    } catch (error) {
      this.octokit.log.info(`Could not get failed invitations for ${org}: ${error.message}`)
    }
  }

  /**
   * @private
   *
   * @returns {String}
   */
  async getReportSha() {
    const {octokit, owner, repo, path} = this

    // try to get the sha, if the file already exists
    try {
      const {data} = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
      })

      if (data && data.sha) {
        return data.sha
      }
    } catch (error) {
      return
    }

    return
  }

  /**
   * @private
   *
   * @param {PushOptions} opts
   *
   * @returns {ReportResult}
   */
  async pushReport(opts) {
    const {
      data: {
        commit: {parents, sha: head_sha},
      },
    } = await this.octokit.rest.repos.createOrUpdateFileContents(opts)

    const base_sha = parents.length > 0 ? parents[0].sha : ''

    return {base_sha, head_sha}
  }

  /**
   * Create invitations report
   * @public
   *
   * @returns {ReportResult}
   */
  async create() {
    const {path, name, email, owner, repo, enterprise} = this

    // CSV header
    const invitees = [Report.header]

    if (enterprise !== '') {
      // get all orgs in the GitHub Enterprise Cloud account first
      const orgs = await this.getOrganizations()

      for (const org of orgs) {
        await this.getPendingInvitations(org, invitees)
        await this.getFailedInvitations(org, invitees)
      }
    } else {
      await this.getPendingInvitations(owner, invitees)
      await this.getFailedInvitations(owner, invitees)
    }

    // make CSV
    const csv = stringify(invitees, {})

    const opts = {
      owner,
      repo,
      path,
      message: `${this.date} invitation report`,
      content: Buffer.from(csv).toString('base64'),
      committer: {
        name,
        email,
      },
    }

    const sha = await this.getReportSha()

    if (sha) {
      opts.sha = sha
    }

    const {base_sha, head_sha} = await this.pushReport(opts)

    return {
      base_sha,
      head_sha,
    }
  }

  /**
   * @returns {Object[]}
   */
  static get header() {
    return {
      org: 'Organization',
      login: 'Username',
      email: 'Email',
      created_at: 'Invitation creation date',
      failed_at: 'Invitation failed date',
      failed_reason: 'Invitation failed reason',
      inviter: 'Inviter',
    }
  }

  get reportDate() {
    return this.date
  }

  set reportDate(date) {
    this.date = date
  }
}
