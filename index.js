const _ = require('lodash')
const moment = require('moment')

module.exports = class PeopleTracker {
  async load(db) {
    let peopleCollection = db.collection('people')
    let changesCollection = db.collection('peopleChanges')

    let counters = _(await changesCollection.find({
      type: 'counter'
    }).toArray())
      .keyBy(c => {
        return c.state.counter
      })
      .value()
    let lastCounter = Math.max(..._.keys(counters))

    let people = _(await peopleCollection.find({ state: { $exists: true } })
      .project({
        photo: 0
      })
      .toArray())
      .map(c => {
        if (c.state.counter === lastCounter) {
          c.end = false
        } else {
          c.end = moment(c.state.updated)
        }
        return c
      })
      .keyBy(c => {
        return c.email
      })
      .value()

    let changes = await changesCollection.aggregate([
      {
        $match: {
          type: { $ne: 'counter' }
        },
      },
      {
        $addFields: {
          diff: {
            $filter: {
              input: "$diff",
              as: "d",
              cond: { $not: { $in: [ 'photo', "$$d.path" ] } }
            }
          }
        }
      },
      {
        $match: {
          $or: [
            { type: { $ne: 'change' } },
            { type: 'change',
              'diff.0': { $exists: true }
            }
          ]
        }
      },
      {
        $sort: {
          'state.counter': -1
        }
      }
    ]).toArray()
    console.log(changes.length)
    console.log(changes[0].state.counter)
  }
}
