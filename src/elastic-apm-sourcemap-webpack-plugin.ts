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
  retryCount?: number;
  retryAfterMs?: number;
}
export default class ElasticAPMSourceMapPlugin implements webpack.Plugin {
  config: Config;
  constructor(config: Config) {
    this.config = Object.assign(
      {
        logLevel: 'warn',
        ignoreErrors: false,
        retryCount: 0
      },
      config
    );
  }

  emit(
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
          // It is impossible for Webpack to run into here.
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

        const send = (retryCount = this.config.retryCount): Promise<void> => {
          const displayRetry = (this.config.retryCount || 0) - (retryCount || 0) > 0;

          logger.debug(
            `${
              displayRetry ? 'retry ' : ''
            }uploading ${sourceMap} to Elastic APM with bundle_filepath: ${bundleFilePath}.`
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
            })
            .catch((e: Error) => {
              if (retryCount && retryCount > 0) {
                logger.debug(`retry upload ${sourceMap} after ${this.config.retryAfterMs || 0}ms.`);
                return (new Promise(resolve => {
                  if (this.config.retryCount) {
                    setTimeout(() => resolve(retryCount), this.config.retryAfterMs);
                  } else {
                    resolve(retryCount);
                  }
                }) as Promise<number>).then(retryCount => send(retryCount--));
              }
              throw e;
            });
        };

        return send(this.config.retryCount);
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
      compiler.hooks.emit.tapAsync('ElasticAPMSourceMapPlugin', (compilation, callback) =>
        this.emit(compilation, callback)
      );
    } else {
      compiler.plugin('emit', (compilation, callback) => this.emit(compilation, callback));
    }
  }
}
