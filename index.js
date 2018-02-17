const _ = require('lodash')

module.exports = class PeopleTracker {
  async load(db) {
    let peopleCollection = db.collection('people')
    let changesCollection = db.collection('peopleChanges')

    let counters = _(await changesCollection.find({
      type: 'counter'
    }).toArray())
      .keyBy((c) => {
        return c.state.counter
      })
      .value()
    console.log(_.keys(counters).length)
  }
}
