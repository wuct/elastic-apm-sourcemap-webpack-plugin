import webpack from 'webpack';
import path from 'path';
import mockFetch from 'jest-fetch-mock';
import fetch from 'node-fetch';
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
  mode: 'production',
  devtool: 'source-map',
  plugins: [new ElasticAPMSourceMapPlugin(pluginConfig)]
});

beforeEach(() => {
  fetch.resetMocks();

  require('webpack-log')().debug.mockReset();
  require('webpack-log')().error.mockReset();
});

test('ok', cb => {
  fetch.mockResponse(JSON.stringify('ok'));

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

      expect(fetch.mock.calls.length).toEqual(1);
      expect(fetch.mock.calls[0][0]).toEqual('mock-url');
      expect(fetch.mock.calls[0][1].method).toEqual('POST');

      expect(require('webpack-log')().debug.mock.calls).toMatchSnapshot();

      // TODO: check body

      cb();
    }
  );
});

test('failed', cb => {
  fetch.mockReject('failed');

  webpack(
    getWebpackConfig({
      serviceName: 'mock-service',
      serviceVersion: 'mock-version',
      publicPath: '/mock-folder',
      serverURL: 'mock-url'
    }),
    err => {
      expect(fetch.mock.calls.length).toEqual(1);
      expect(err).toEqual('failed');

      expect(require('webpack-log')().debug.mock.calls).toMatchSnapshot();
      expect(require('webpack-log')().error.mock.calls).toMatchSnapshot();

      setTimeout(() => {
        cb();
      }, 100);
    }
  );
});

test('400', cb => {
  fetch.mockResponses(['failed', { status: 400 }]);

  webpack(
    getWebpackConfig({
      serviceName: 'mock-service',
      serviceVersion: 'mock-version',
      publicPath: '/mock-folder',
      serverURL: 'mock-url'
    }),
    err => {
      expect(fetch.mock.calls.length).toEqual(1);
      expect(err).toBeInstanceOf(Error);
      setTimeout(() => {
        cb();
      }, 100);
    }
  );
});

test('400 but ignoreErrors', cb => {
  fetch.mockResponses(['failed', { status: 400 }]);

  webpack(
    getWebpackConfig({
      serviceName: 'mock-service',
      serviceVersion: 'mock-version',
      publicPath: '/mock-folder',
      serverURL: 'mock-url',
      ignoreErrors: true
    }),
    err => {
      expect(fetch.mock.calls.length).toEqual(1);
      expect(err).toBe(null);

      cb();
    }
  );
});

test('with secret', cb => {
  fetch.mockResponse(JSON.stringify('ok'));

  webpack(
    getWebpackConfig({
      serviceName: 'mock-service',
      serviceVersion: 'mock-version',
      publicPath: '/mock-folder',
      serverURL: 'mock-url',
      secret: 'mock-secret'
    }),
    () => {
      expect(fetch.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer mock-secret' });
      cb();
    }
  );
});
