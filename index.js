const _ = require('lodash')
const mongo = require('mongodb').MongoClient

export default class PeopleTracker {
  async load(db) {
    let peopleCollection = db.collection('people')
    let changesCollection = db.collection('peopleChanges')

    let counters = _(await changesCollection.find({
      type: 'counter'
    }).toArray())
      .keyBy((c) => {
        return c.state.counter
      })
    console.log(counters)
  }
}
