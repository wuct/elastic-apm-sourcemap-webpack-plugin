import * as R from 'ramda';
import fetch from 'node-fetch';
import FormData from 'form-data';
import webpack from 'webpack';
import webpackLog, { Level } from 'webpack-log';

export interface Config {
  serviceName: string;
  serviceVersion: string;
  publicPath: string;
  serverURL: string;
  secret?: string;
  logLevel?: Level;
}

export default class ElasticAPMSourceMapPlugin implements webpack.Plugin {
  config: Config;
  constructor(config: Config) {
    this.config = config;
  }

  apply(compiler: webpack.Compiler): void {
    const logger = webpackLog({
      name: 'ElasticAPMSourceMapPlugin',
      level: this.config.logLevel || 'warn'
    });

    compiler.hooks.afterEmit.tapPromise('ElasticAPMSourceMapPlugin', compilation => {
      logger.debug(`starting uploading sourcemaps with configs: ${JSON.stringify(this.config)}.`);

      const { chunks } = compilation.getStats().toJson();

      return R.compose(
        (promises: Array<Promise<void>>) =>
          Promise.all(promises)
            .then(() => logger.debug('finished uploading sourcemaps.'))
            .catch(err => {
              logger.error(err);
              throw err;
            }),
        R.map(({ sourceFile, sourceMap }) => {
          const formData = new FormData();
          const bundleFilePath = `${this.config.publicPath}/${sourceFile}`;

          formData.append('sourcemap', compilation.assets[sourceMap].source());
          formData.append('service_version', this.config.serviceVersion);
          formData.append('bundle_filepath', bundleFilePath);
          formData.append('service_name', this.config.serviceName);

          const headers = this.config.secret
            ? { Authorization: `Bearer ${this.config.secret}` }
            : undefined;

          return fetch(this.config.serverURL, {
            method: 'POST',
            body: formData,
            headers: headers
          })
            .then(response => Promise.all([response.ok, response.text()]))
            .then(([ok, responseText]) => {
              if (ok) {
                logger.debug(`APM server response: ${responseText}`);
                logger.debug(
                  `uploaded ${sourceMap} to Elastic APM with bundle_filepath: ${bundleFilePath}.`
                );
              } else {
                logger.error(`APM server response: ${responseText}`);
                throw new Error(`error while uploading ${sourceMap} to Elastic APM`);
              }
            })
            .catch(err => {
              logger.error(err);
              throw err;
            });
        }),
        R.map(({ files }) => {
          const sourceFile = R.find(R.test(/\.js$/), files);
          const sourceMap = R.find(R.test(/\.js\.map$/), files);

          return { sourceFile, sourceMap };
        })
      )(chunks);
    });
  }
}
