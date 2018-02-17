const _ = require('lodash')
const moment = require('moment')
const expect = require('chai').expect

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
        c.last = true
        if (c.state.counter !== lastCounter) {
          c.end = moment(c.state.updated)
        }
        return [ c ]
      })
      .keyBy(c => {
        return c[0].email
      })
      .value()

    let changes = await changesCollection.aggregate([
      {
        $match: {
          type: { $nin: [ 'counter', 'left'] }
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
    _.each(changes, change => {
      expect(people).to.have.property(change.email)
      expect(people[change.email]).to.have.lengthOf.at.least(1)
      let currentPerson = people[change.email][0]
      if (change.type === 'joined') {
        currentPerson.first = true
        currentPerson.start = moment(change.state.updated)
        return
      }
      if (change.type === 'change') {
        let previousPerson = _.cloneDeep(currentPerson)
        currentPerson.start = moment(change.state.updated)
        previousPerson.end = moment(change.state.updated)

        people[change.email].unshift(previousPerson)
      }
    })

    _.each(people, persons => {
      expect(persons).to.have.lengthOf.at.least(1)
      expect(persons[0].first).to.be.true
      expect(persons[persons.length - 1].last).to.be.true
      _.each(persons, person => {
        expect(person).to.have.property('start')
      })
    })
  }
}
