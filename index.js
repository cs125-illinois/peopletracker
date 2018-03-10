const _ = require('lodash')
const moment = require('moment')
const expect = require('chai').expect
const deepDiff = require('deep-diff')

module.exports = class PeopleTracker {
  async load(db) {
    let changesCollection = db.collection('peopleChanges')
    let allCounters = await changesCollection.find({
      type: 'counter'
    }).sort({
      counter: 1
    }).toArray()
    this.startCounter = 1
    this.endCounter
    for (let i = 0; i < allCounters.length; i++) {
      if (allCounters[i + 1]) {
        allCounters[i].endTime = moment(allCounters[i + 1].state.updated)
      } else {
        this.endCounter = allCounters[i].state.counter
      }
    }
    this.counters = _.keyBy(allCounters, c => {
      return c.state.counter
    })

    let peopleCollection = db.collection('people')
    let people = _(await peopleCollection.find({ state: { $exists: true } })
      .project({
        photo: 0, thumbnail: 0
      })
      .toArray())
      .map(c => {
        c.last = true
        if (c.state.counter !== this.endCounter) {
          c.end = moment(c.state.updated)
          c.endCounter = c.state.counter
        } else {
          c.endCounter = this.endCounter
        }
        return [ c ]
      })
      .keyBy(c => {
        expect(c[0]).to.have.property('email')
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
              cond: { $and: [
                { $not: { $in: [ 'photo', "$$d.path" ] } },
                { $not: { $in: [ 'thumbnail', "$$d.path" ] } }
              ] }
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
        currentPerson.startCounter = change.state.counter
        return
      }
      if (change.type === 'change') {
        expect(change.diff).to.have.lengthOf.at.least(1)
        let previousPerson = _.cloneDeep(currentPerson)
        currentPerson.start = moment(change.state.updated)
        currentPerson.startCounter = change.state.counter
        previousPerson.end = moment(change.state.updated)
        previousPerson.endCounter = change.state.counter - 1
        previousPerson.state = change.state
        _.each(change.diff, c => {
          deepDiff.revertChange(previousPerson, currentPerson, c)
        })
        people[change.email].unshift(previousPerson)
      }
    })
    let peopleByCounter = {}
    for (let counter = 1; counter <= this.endCounter; counter++) {
      peopleByCounter[counter] = {}
    }
    _.each(people, persons => {
      expect(persons).to.have.lengthOf.at.least(1)
      expect(persons[0].first, JSON.stringify(persons)).to.be.true
      expect(persons[persons.length - 1].last).to.be.true
      _.each(persons, person => {
        expect(person).to.have.property('start')
        expect(person).to.have.property('startCounter')
        if (person.endCounter) {
          expect(person.endCounter).to.be.at.least(person.startCounter)
        }
        for (let counter = person.startCounter; counter <= person.endCounter; counter++) {
          peopleByCounter[counter][person.email] = person
        }
      })
    })
    this.peopleByCounter = peopleByCounter

    let enrollmentCollection = db.collection('enrollment')
    this.enrollmentByCounter = _(await enrollmentCollection.find().sort({
        'state.counter': 1
      }).toArray()).keyBy(e => {
        return e.state.counter
      })
      .value()

    this.start = moment(this.enrollmentByCounter[this.startCounter].state.updated)
    this.end = moment(this.enrollmentByCounter[this.endCounter].state.updated)

    return this
  }

  getCounterAtTime(timestamp) {
    timestamp = moment.isMoment(timestamp) ? timestamp : moment(timestamp)
    return _(this.counters).sortBy(counter => {
      return counter.state.counter
    }).find(counter => {
      return timestamp.isAfter(moment(counter.state.updated)) &&
        (!(counter.endTime) || (timestamp.isBefore(counter.endTime)))
    }).state.counter
  }

  getPeopleAtCounter(counter) {
    return this.peopleByCounter[counter]
  }
  getPeopleAtTime(timestamp) {
    return this.getPeopleAtCounter(this.getCounterAtTime(timestamp))
  }

  getPersonAtCounter(email, counter) {
    return this.peopleByCounter[counter][email]
  }
  getPersonAtTime(email, timestamp) {
    return this.getPersonAtCounter(email, this.getCounterAtTime(timestamp))
  }

  getEnrollmentAtCounter(counter) {
    return this.enrollmentByCounter[counter]
  }
  getEnrollmentAtTime(timestamp) {
    return this.getEnrollmentAtCounter(this.getCounterAtTime(timestamp))
  }
}
