import webpack from 'webpack';
import path from 'path';
import mockFetch from 'jest-fetch-mock';
import fetch from 'node-fetch';
import ElasticAPMSourceMapPlugin, { Config } from '../src/elastic-apm-sourcemap-webpack-plugin';

jest.mock('node-fetch', () => mockFetch);

const getWebpackConfig = (pluginConfig: Config): webpack.Configuration => ({
  entry: path.resolve(__dirname, './entry.js'),
  mode: 'production',
  devtool: 'source-map',
  plugins: [new ElasticAPMSourceMapPlugin(pluginConfig)]
});

beforeEach(() => {
  fetch.resetMocks();
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
