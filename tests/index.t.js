jest.mock('@actions/github')
jest.mock('../src/report')

const core = require('@actions/core')
const {context} = require('@actions/github')
const action = require('../src/index')
const Report = require('../src/report')

describe('index.js', () => {
  const createMock = jest.fn().mockReturnValue({before: 'base', after: 'head'})

  beforeEach(() => {
    Report.mockImplementation(() => {
      return {create: createMock}
    })
  })

  afterEach(() => {
    Report.mockClear()
    createMock.mockClear()
  })

  test('runs', async () => {
    expect.assertions(6)

    process.env.INPUT_REPORT_PATH = 'fixtures/report.csv'
    process.env.INPUT_TOKEN = 'token'
    process.env.GITHUB_WORKSPACE = 'workspace'

    context.repo = {
      owner: 'owner',
      repo: 'repo',
    }

    const report = new Report()
    const getInputSpy = jest.spyOn(core, 'getInput')
    const setOutputSpy = jest.spyOn(core, 'setOutput').mockReturnValue('')
    const setFailedSpy = jest.spyOn(core, 'setFailed')
    const createSpy = jest.spyOn(report, 'create')

    await action.run()

    expect(getInputSpy).toHaveBeenCalledTimes(5)

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(createSpy).toHaveReturnedWith({before: 'base', after: 'head'})

    expect(setOutputSpy).toHaveBeenCalledWith('base_sha', 'base')
    expect(setOutputSpy).toHaveBeenCalledWith('head_sha', 'head')

    expect(setFailedSpy).toHaveBeenCalledTimes(0)
  })

  test('throws for invalid report path', async () => {
    expect.assertions(1)

    process.env.INPUT_REPORT_PATH = '../report.csv'
    process.env.INPUT_TOKEN = 'token'
    process.env.GITHUB_WORKSPACE = 'workspace'

    context.repo = {
      owner: 'owner',
      repo: 'repo',
    }

    const setFailedSpy = jest.spyOn(core, 'setFailed').mockReturnValue('')

    await action.run()

    expect(setFailedSpy).toHaveBeenCalledTimes(1)
  })
})
