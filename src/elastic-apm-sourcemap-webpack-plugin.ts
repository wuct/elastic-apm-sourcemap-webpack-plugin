import * as R from 'ramda';
import fetch from 'node-fetch';
import FormData from 'form-data';
import webpack, { StatsChunk, WebpackPluginInstance } from 'webpack';
import webpackLog, { Level, Logger } from 'webpack-log';
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
export default class ElasticAPMSourceMapPlugin implements WebpackPluginInstance {
  config: Config;
  logger: Logger;
  constructor(config: Config) {
    this.config = Object.assign(
      {
        logLevel: 'warn',
        ignoreErrors: false
      },
      config
    );
    this.logger = webpackLog({
      name: 'ElasticAPMSourceMapPlugin',
      level: this.config.logLevel
    });
  }

  emit(
    compilation: webpack.Compilation,
    callback: (error?: Error) => void
  ): Promise<void> {
    const logger = this.logger;

    logger.debug(`starting uploading sourcemaps with configs: ${JSON.stringify(this.config)}.`);

    const { chunks = [] } = compilation.getStats().toJson();

    return R.compose<StatsChunk[], Source[], UploadTask[], Promise<void>>(
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
      R.map((chunk) => {
        const { files, auxiliaryFiles } = chunk

        const sourceFile = R.find(R.test(/\.js$/), files || []);
        // Webpack 4 uses `files` and does not have `auxiliaryFiles`. The following line
        // is allowed to work in both Webpack 4 and 5.
        const sourceMap = R.find(R.test(/\.js\.map$/), auxiliaryFiles || files || []);

        return { sourceFile, sourceMap };
      })
    )(chunks);
  }

  apply(compiler: webpack.Compiler): void {

    /* istanbul ignore else */
    if (compiler.hooks) {
      // webpack 5
      compiler.hooks.emit.tapAsync('ElasticAPMSourceMapPlugin', (compilation, callback) =>
        this.emit(compilation, callback)
      );
    // We only run tests against Webpack 5 currently.
    /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
    // @ts-expect-error
    } else if (compiler.plugin) {
      // Webpack 4
      /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
      // @ts-expect-error
      compiler.plugin('emit', (compilation, callback) =>
        this.emit(compilation, callback)
      );
    } else {
      this.logger.error(`does not compatible with the current Webpack version`);
    }
  }
}
