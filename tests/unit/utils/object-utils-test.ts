import Helpers from '../../test-helpers'
import { entries } from '../../../src/js/utils/object-utils'

const { module, test } = Helpers

module('Unit: Utils: Object Utils')

test('#entries works', assert => {
  assert.deepEqual(entries({ hello: 'world', goodbye: 'moon' }), [
    ['hello', 'world'],
    ['goodbye', 'moon'],
  ])
})
