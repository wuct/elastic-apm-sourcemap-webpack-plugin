import webpack from 'webpack';
import path from 'path';
import mockFetch from 'jest-fetch-mock';
import ElasticAPMSourceMapPlugin, { Config } from '../src/elastic-apm-sourcemap-webpack-plugin';

jest.mock('node-fetch', () => mockFetch);
jest.mock('webpack-log', () => {
  const debugMock = jest.fn();
  const errorMock = jest.fn();

  return () => ({
    debug: debugMock,
    error: errorMock
  });
});

const getWebpackConfig = (pluginConfig: Config): webpack.Configuration => ({
  entry: path.resolve(__dirname, './entry.js'),
  devtool: 'source-map',
  plugins: [new ElasticAPMSourceMapPlugin(pluginConfig)],
  // TODO: remove this after Webpack 5
  output: {
    futureEmitAssets: true
  }
});

beforeEach(() => {
  require('node-fetch').resetMocks();

  require('webpack-log')().debug.mockReset();
  require('webpack-log')().error.mockReset();
});

test('send to the server successfully', cb => {
  require('node-fetch').mockResponse(JSON.stringify('ok'));

  webpack(
    getWebpackConfig({
      serviceName: 'mock-service',
      serviceVersion: 'mock-version',
      publicPath: '/mock-folder',
      serverURL: 'mock-url'
    }),
    (err, stats) => {
      if (err) {
        return cb(err);
      }

      if (stats.hasErrors()) {
        return cb(stats.toJson().errors);
      }

      const fetchMock = require('node-fetch').mock;

      expect(fetchMock.calls.length).toEqual(1);
      expect(fetchMock.calls[0][0]).toEqual('mock-url');
      expect(fetchMock.calls[0][1].method).toEqual('POST');

      expect(require('webpack-log')().debug.mock.calls).toMatchSnapshot();

      const body = fetchMock.calls[0][1].body;
      const boundary = body.getBoundary();

      expect(
        body
          .getBuffer()
          .toString()
          // The form boundary is changed when re-created, so we need to fix it.
          .replace(new RegExp(boundary, 'g'), 'FIXED-BOUNDARY')
      ).toMatchSnapshot();

      cb();
    }
  );
});

test('fail to reach the server', cb => {
  require('node-fetch').mockReject('failed');

  webpack(
    getWebpackConfig({
      serviceName: 'mock-service',
      serviceVersion: 'mock-version',
      publicPath: '/mock-folder',
      serverURL: 'mock-url'
    }),
    err => {
      expect(require('node-fetch').mock.calls.length).toEqual(1);
      expect(err).toEqual('failed');

      expect(require('webpack-log')().debug.mock.calls).toMatchSnapshot();
      expect(require('webpack-log')().error.mock.calls).toMatchSnapshot();

      setTimeout(() => {
        cb();
      }, 100);
    }
  );
});

test('the server responses 400', cb => {
  require('node-fetch').mockResponses(['failed', { status: 400 }]);

  webpack(
    getWebpackConfig({
      serviceName: 'mock-service',
      serviceVersion: 'mock-version',
      publicPath: '/mock-folder',
      serverURL: 'mock-url'
    }),
    err => {
      expect(require('node-fetch').mock.calls.length).toEqual(1);
      expect(err).toBeInstanceOf(Error);
      setTimeout(() => {
        cb();
      }, 100);
    }
  );
});

test('the server responses 400 but ignoreErrors is true', cb => {
  require('node-fetch').mockResponses(['failed', { status: 400 }]);

  webpack(
    getWebpackConfig({
      serviceName: 'mock-service',
      serviceVersion: 'mock-version',
      publicPath: '/mock-folder',
      serverURL: 'mock-url',
      ignoreErrors: true
    }),
    err => {
      expect(require('node-fetch').mock.calls.length).toEqual(1);
      expect(err).toBe(null);

      cb();
    }
  );
});

test('append the secret as a bearer token when provided', cb => {
  require('node-fetch').mockResponse(JSON.stringify('ok'));

  webpack(
    getWebpackConfig({
      serviceName: 'mock-service',
      serviceVersion: 'mock-version',
      publicPath: '/mock-folder',
      serverURL: 'mock-url',
      secret: 'mock-secret'
    }),
    () => {
      expect(require('node-fetch').mock.calls[0][1].headers).toEqual({
        Authorization: 'Bearer mock-secret'
      });
      cb();
    }
  );
});
