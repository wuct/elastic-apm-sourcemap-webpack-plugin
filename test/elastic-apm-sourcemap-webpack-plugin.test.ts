import ElasticAPMSourceMapPlugin from '../src/elastic-apm-sourcemap-webpack-plugin'

test('works if true is truthy', () => {
  expect(true).toBeTruthy()
})

test('DummyClass is instantiable', () => {
  expect(new ElasticAPMSourceMapPlugin()).toBeInstanceOf(ElasticAPMSourceMapPlugin)
})
