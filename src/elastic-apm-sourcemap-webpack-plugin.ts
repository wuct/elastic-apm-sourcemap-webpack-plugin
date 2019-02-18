import * as R from 'ramda'
import fetch from 'node-fetch'
import FormData from 'form-data'

// TODO: fix type errors

type config = {
  serviceName: string
  serviceVersion: string
  publicPath: string
  serverURL: string
}

export default class ElasticAPMSourceMapPlugin {
  config: config
  constructor(config: config) {
    this.config = config
  }
  apply(compiler) {
    compiler.hooks.afterEmit.tapPromise('ElasticAPMSourceMapPlugin', compilation => {
      const { chunks } = compilation.getStats().toJson()

      return R.compose(
        promises => Promise.all(promises),
        R.map(({ sourceFile, sourceMap }) => {
          const formData = new FormData()
          formData.append('sourcemap', compilation.assets[sourceMap].source())
          formData.append('service_version', this.config.serviceVersion)
          formData.append('bundle_filepath', `${this.config.publicPath}/${sourceFile}`)
          formData.append('service_name', this.config.serviceName)

          return fetch(this.config.serverURL, {
            method: 'POST',
            body: formData
          })
            .then(response => {
              if (response.ok) return response.json()
              else {
                throw new Error(`Error while uploading ${sourceMap} to Elastic APM`)
              }
            })
            .then(() => {
              console.info(`Uploaded ${sourceMap} to Elastic APM`) // eslint-disable-line no-console
            })
        }),
        R.map(({ files }) => {
          const sourceFile = R.find(file => /\.js$/.test(file), files)
          const sourceMap = R.find(file => /\.js\.map$/.test(file), files)

          return { sourceFile, sourceMap }
        })
      )(chunks)
    })
  }
}
