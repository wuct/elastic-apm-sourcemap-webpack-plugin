import * as R from 'ramda';
import fetch from 'node-fetch';
import FormData from 'form-data';
import webpack, { Stats } from 'webpack';
import webpackLog, { Level } from 'webpack-log';

type Chunks = Stats.ToJsonOutput['chunks'];
interface Source {
  sourceFile?: string;
  sourceMap?: string;
}
type UploadTask = Promise<void>;

export interface Config {
  serviceName: string;
  serviceVersion: string;
  publicPath: string;
  serverURL: string;
  secret?: string;
  logLevel?: Level;
  ignoreErrors?: boolean;
}
export default class ElasticAPMSourceMapPlugin implements webpack.Plugin {
  config: Config;
  constructor(config: Config) {
    this.config = Object.assign(
      {
        logLevel: 'warn',
        ignoreErrors: false
      },
      config
    );
  }

  afterEmit(
    compilation: webpack.compilation.Compilation,
    callback: (error?: Error) => void
  ): Promise<void> {
    const logger = webpackLog({
      name: 'ElasticAPMSourceMapPlugin',
      level: this.config.logLevel
    });

    logger.debug(`starting uploading sourcemaps with configs: ${JSON.stringify(this.config)}.`);

    const { chunks = [] } = compilation.getStats().toJson();

    return R.compose<NonNullable<Chunks>, Source[], UploadTask[], Promise<void>>(
      (promises: Array<Promise<void>>) =>
        Promise.all(promises)
          .then(() => {
            logger.debug('finished uploading sourcemaps.');
            callback();
          })
          .catch(err => {
            logger.error(err);

            if (this.config.ignoreErrors) {
              callback();
            } else {
              callback(err);
            }
          }),
      R.map(({ sourceFile, sourceMap }) => {
        /* istanbul ignore next */
        if (!sourceFile || !sourceMap) {
          // It is impossible for Wepback to run into here.
          logger.debug('there is no .js files to be uploaded.');
          return Promise.resolve();
        }

        const formData = new FormData();
        const bundleFilePath = `${this.config.publicPath}/${sourceFile}`;

        formData.append('sourcemap', compilation.assets[sourceMap].source(), {
          filename: sourceMap,
          contentType: 'application/json'
        });
        formData.append('service_version', this.config.serviceVersion);
        formData.append('bundle_filepath', bundleFilePath);
        formData.append('service_name', this.config.serviceName);

        const headers = this.config.secret
          ? { Authorization: `Bearer ${this.config.secret}` }
          : undefined;

        logger.debug(
          `uploading ${sourceMap} to Elastic APM with bundle_filepath: ${bundleFilePath}.`
        );

        return fetch(this.config.serverURL, {
          method: 'POST',
          body: formData,
          headers: headers
        })
          .then(response => Promise.all([response.ok, response.text()]))
          .then(([ok, responseText]) => {
            if (ok) {
              logger.debug(`uploaded ${sourceMap}.`);
            } else {
              logger.error(`APM server response: ${responseText}`);
              throw new Error(`error while uploading ${sourceMap} to Elastic APM`);
            }
          });
      }),
      R.map(({ files }) => {
        const sourceFile = R.find(R.test(/\.js$/), files);
        const sourceMap = R.find(R.test(/\.js\.map$/), files);

        return { sourceFile, sourceMap };
      })
    )(chunks);
  }

  apply(compiler: webpack.Compiler): void {
    // We only run tests against Webpack 4 currently.
    /* istanbul ignore next */
    if (compiler.hooks) {
      compiler.hooks.afterEmit.tapAsync('ElasticAPMSourceMapPlugin', (compilation, callback) =>
        this.afterEmit(compilation, callback)
      );
    } else {
      compiler.plugin('after-emit', (compilation, callback) =>
        this.afterEmit(compilation, callback)
      );
    }
  }
}
