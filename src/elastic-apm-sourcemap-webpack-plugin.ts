import * as R from 'ramda';
import fetch from 'node-fetch';
import FormData from 'form-data';
import webpack from 'webpack';

export interface Config {
  serviceName: string;
  serviceVersion: string;
  publicPath: string;
  serverURL: string;
  secret?: string;
}

export default class ElasticAPMSourceMapPlugin implements webpack.Plugin {
  config: Config;
  constructor(config: Config) {
    this.config = config;
  }

  apply(compiler: webpack.Compiler): void {
    compiler.hooks.afterEmit.tapPromise('ElasticAPMSourceMapPlugin', compilation => {
      const { chunks } = compilation.getStats().toJson();

      return R.compose(
        (promises: Array<Promise<void>>) => Promise.all(promises),
        R.map(({ sourceFile, sourceMap }) => {
          const formData = new FormData();
          formData.append('sourcemap', compilation.assets[sourceMap].source());
          formData.append('service_version', this.config.serviceVersion);
          formData.append('bundle_filepath', `${this.config.publicPath}/${sourceFile}`);
          formData.append('service_name', this.config.serviceName);

          const headers = this.config.secret
            ? { Authorization: `Bearer ${this.config.secret}` }
            : undefined;

          return fetch(this.config.serverURL, {
            method: 'POST',
            body: formData,
            headers: headers
          })
            .then(response => {
              if (response.ok) return response.json();
              else {
                throw new Error(`Error while uploading ${sourceMap} to Elastic APM`);
              }
            })
            .then(() => {
              console.info(`Uploaded ${sourceMap} to Elastic APM`); // eslint-disable-line no-console
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
