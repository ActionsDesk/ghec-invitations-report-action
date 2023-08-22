import {jest} from '@jest/globals'

// eslint-disable-next-line import/no-unresolved
import {stringify} from 'csv-stringify/sync'
import Report from '../src/report.js'

jest.mock('@actions/github')
jest.mock('../src/report.js')

const getOctokit = jest.fn().mockReturnValue({
  log: {
    info: jest.fn(),
  },
  graphql: jest.fn().mockImplementation(() => {
    return {
      enterprise: {
        organizations: {
          nodes: [{login: 'foo'}, {login: 'bar'}],
          pageInfo: {hasNextPage: false, endCursor: null},
        },
      },
    }
  }),
  rest: {
    orgs: {
      listPendingInvitations: jest.fn().mockImplementation(() => []),
      listFailedInvitations: jest.fn().mockImplementation(() => []),
    },
    repos: {
      createOrUpdateFileContents: jest.fn().mockImplementation(() => {
        return {
          data: {
            commit: {parents: [{sha: 'base'}], sha: 'head'},
          },
        }
      }),
      getContent: jest.fn(),
    },
  },
})

describe('report.js', () => {
  let octokit
  let options
  let committer
  let content
  let now

  beforeEach(() => {
    octokit = new getOctokit('token')

    options = {
      fp: 'report.csv',
      owner: 'owner',
      repo: 'repo',
    }

    Report.getOrganizations = jest.fn().mockReturnValue(['foo', 'bar'])

    const csv = stringify([Report.header], {})
    committer = {
      name: 'github-actions[bot]',
      email: '41898282+github-actions[bot]@users.noreply.github.com',
    }
    content = Buffer.from(csv).toString('base64')

    now = new Date().toISOString()
  })

  afterEach(() => {})

  test('is a class', async () => {
    expect.assertions(1)

    expect(new Report(octokit, options)).toBeInstanceOf(Report)
  })

  test('has methods', async () => {
    expect.assertions(6)

    const report = new Report(octokit, options)

    expect(report.create).toBeInstanceOf(Function)
    expect(report.getOrganizations).toBeInstanceOf(Function)
    expect(report.getPendingInvitations).toBeInstanceOf(Function)
    expect(report.getFailedInvitations).toBeInstanceOf(Function)
    expect(report.getReportSha).toBeInstanceOf(Function)
    expect(report.pushReport).toBeInstanceOf(Function)
  })

  test('requires parameters', async () => {
    expect.assertions(5)

    let report

    expect(() => {
      report = new Report(octokit, options)
    }).not.toThrow()

    expect(report.octokit).toBeInstanceOf(Object)
    expect(report.path).toBe('report.csv')
    expect(report.owner).toBe('owner')
    expect(report.repo).toBe('repo')
  })

  test('accepts an optional enterprise parameter', async () => {
    expect.assertions(1)

    options.enterprise = 'enterprise'

    const report = new Report(octokit, options)

    expect(report.enterprise).toBe('enterprise')
  })

  test('creates report for an organization', async () => {
    expect.assertions(3)

    const report = new Report(octokit, options)

    const getOrganizationsSpy = jest.spyOn(report, 'getOrganizations')
    const getPendingInvitationsSpy = jest.spyOn(report, 'getPendingInvitations')
    const getFailedInvitationsSpy = jest.spyOn(report, 'getFailedInvitations')

    await report.create()

    expect(getOrganizationsSpy).toHaveBeenCalledTimes(0)
    expect(getPendingInvitationsSpy).toHaveBeenCalledTimes(1)
    expect(getFailedInvitationsSpy).toHaveBeenCalledTimes(1)
  })

  test('creates report for an enterprise', async () => {
    expect.assertions(3)

    options.enterprise = 'enterprise'

    const report = new Report(octokit, options)

    const getOrganizationsSpy = jest.spyOn(report, 'getOrganizations')
    const getPendingInvitationsSpy = jest.spyOn(report, 'getPendingInvitations')
    const getFailedInvitationsSpy = jest.spyOn(report, 'getFailedInvitations')

    await report.create()

    expect(getOrganizationsSpy).toHaveBeenCalledTimes(1)
    expect(getPendingInvitationsSpy).toHaveBeenCalledTimes(2)
    expect(getFailedInvitationsSpy).toHaveBeenCalledTimes(2)
  })

  test('creates a new report', async () => {
    const report = new Report(octokit, options)
    report.reportDate = now

    report.getReportSha = jest.fn().mockReturnValueOnce(null)

    const getReportShaSpy = jest.spyOn(report, 'getReportSha')
    const pushReportSpy = jest.spyOn(report, 'pushReport')

    await report.create()

    expect(getReportShaSpy).toHaveBeenCalledTimes(1)
    expect(pushReportSpy).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      path: 'report.csv',
      message: `${now} invitation report`,
      content,
      committer,
    })
  })

  test('updates an existing report', async () => {
    const report = new Report(octokit, options)
    report.reportDate = now

    report.getReportSha = jest.fn().mockReturnValueOnce('a')

    const getReportShaSpy = jest.spyOn(report, 'getReportSha')
    const pushReportSpy = jest.spyOn(report, 'pushReport')

    await report.create()

    expect(getReportShaSpy).toHaveBeenCalledTimes(1)
    expect(pushReportSpy).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      path: 'report.csv',
      message: `${now} invitation report`,
      content,
      committer,
      sha: 'a',
    })
  })
})
