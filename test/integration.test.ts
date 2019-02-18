import webpack from 'webpack'
import path from 'path'
import mockFetch from 'jest-fetch-mock'
import fetch from 'node-fetch'
import ElasticAPMSourceMapPlugin from '../src/elastic-apm-sourcemap-webpack-plugin'

jest.mock('node-fetch', () => mockFetch)

beforeEach(() => {
  fetch.resetMocks()
})

test('ok', cb => {
  fetch.mockResponse(JSON.stringify('ok'))

  const config = {
    entry: path.resolve(__dirname, './entry.js'),
    mode: 'production',
    devtool: 'source-map',
    plugins: [
      new ElasticAPMSourceMapPlugin({
        serviceName: 'mock-service',
        serviceVersion: 'mock-version',
        publicPath: '/mock-folder',
        serverURL: 'mock-url'
      })
    ]
  }

  webpack(config, (err, stats) => {
    if (err) {
      return cb(err)
    }

    if (stats.hasErrors()) {
      return cb(stats.toJson().errors)
    }

    expect(fetch.mock.calls.length).toEqual(1)
    console.log('calls', fetch.mock.calls)
    expect(fetch.mock.calls[0][0]).toEqual('mock-url')
    expect(fetch.mock.calls[0][1].method).toEqual('POST')

    // TODO: check body

    cb()
  })
})

// TODO: test error handling
