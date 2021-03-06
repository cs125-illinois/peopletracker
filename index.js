const _ = require('lodash')
const moment = require('moment')
const expect = require('chai').expect
const deepDiff = require('deep-diff')
const fs = require('fs-extra')

module.exports = class PeopleTracker {
  constructor(semester, db) {
    this.semester = semester
    this.db = db
  }

  async load() {
    let changesCollection = this.db.collection('peopleChanges')
    changesCollection.createIndex({ 'state.counter': 1 })
    changesCollection.createIndex({ type: 1, semester: 1 })
    let allCounters = await changesCollection.find({
      type: 'counter',
      semester: this.semester
    }).sort({
      'state.counter': 1
    }).toArray()
    for (let i = 0; i < allCounters.length; i++) {
      if (!this.startCounter) {
        this.start = allCounters[i].state.updated
        this.startCounter = allCounters[i].state.counter
      }
      if (allCounters[i + 1]) {
        allCounters[i].endTime = moment(allCounters[i + 1].state.updated)
      } else {
        this.end = allCounters[i].state.updated
        this.endCounter = allCounters[i].state.counter
      }
    }
    expect(this.start).to.be.ok
    expect(this.end).to.be.ok
    expect(this.startCounter).to.be.ok
    expect(this.endCounter).to.be.ok

    this.counters = _.keyBy(allCounters, c => {
      return c.state.counter
    })

    let peopleCollection = this.db.collection('people')
    this.people = _(await peopleCollection.find({
        state: { $exists: true }, semester: this.semester
      }).project({
        photo: 0, thumbnail: 0
      })
      .toArray())
      .map(c => {
        c.last = true
        c.endCounter = this.endCounter
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
          type: { $nin: [ 'counter' ] },
          semester: this.semester
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
            { type: 'change', 'diff.0': { $exists: true }
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
      expect(change.state.counter).to.be.at.most(this.endCounter)

      expect(this.people).to.have.property(change.email)
      expect(this.people[change.email]).to.have.lengthOf.at.least(1)
      let currentPerson = this.people[change.email][0]
      if (change.type === 'joined') {
        currentPerson.first = true
        currentPerson.start = moment(change.state.updated)
        currentPerson.startCounter = change.state.counter
        currentPerson.active = true
        currentPerson.left = false
        return
      }
      if (change.type === 'left') {
        let previousPerson = _.cloneDeep(currentPerson)
        currentPerson.start = moment(change.state.updated)
        currentPerson.startCounter = change.state.counter
        currentPerson.active = false
        currentPerson.left = true
        previousPerson.end = moment(change.state.updated)
        previousPerson.endCounter = change.state.counter - 1
        previousPerson.state = change.state
        previousPerson.active = true
        previousPerson.left = false
        this.people[change.email].unshift(previousPerson)
        return
      }
      if (change.type === 'change') {
        expect(change.diff).to.have.lengthOf.at.least(1)
        let previousPerson = _.cloneDeep(currentPerson)
        _.each(change.diff, c => {
          try {
            deepDiff.revertChange(previousPerson, currentPerson, c)
          } catch (err) {
            if (c.kind === 'A' && c.path.length === 1) {
              previousPerson[c.path[0]] = []
            }
            deepDiff.revertChange(previousPerson, currentPerson, c)
          }
          if (_.isEqual(previousPerson, currentPerson)) {
            if (c.path.indexOf('left') !== -1) {
              previousPerson.active = true
              currentPerson.active = false
            }
          }
        })
        currentPerson.start = moment(change.state.updated)
        currentPerson.startCounter = change.state.counter
        previousPerson.end = moment(change.state.updated)
        previousPerson.endCounter = change.state.counter - 1
        previousPerson.state = change.state
        this.people[change.email].unshift(previousPerson)
        return
      }
    })
    await this.loadPeopleByCounter()
    return this.loadEnrollmentByCounter()
  }

  async loadPeopleByCounter() {
    let peopleCollection = this.db.collection('people')

    this.peopleByCounter = {}
    for (let counter = this.startCounter; counter <= this.endCounter; counter++) {
      this.peopleByCounter[counter] = {}
    }
    _.each(this.people, persons => {
      expect(persons).to.have.lengthOf.at.least(1)
      expect(persons[0].first, JSON.stringify(persons)).to.be.true
      expect(persons[persons.length - 1].last).to.be.true
      _.each(persons, person => {
        expect(person).to.have.property('start')
        expect(person).to.have.property('startCounter')
        expect(person).to.have.property('endCounter')
        expect(person.endCounter, person.email).to.be.at.least(person.startCounter)
        for (let counter = person.startCounter; counter <= person.endCounter; counter++) {
          this.peopleByCounter[counter][person.email] = person
        }
      })
    })

    let latestComputedPeople = this.peopleByCounter[this.endCounter]
    let latestPeople = _(await peopleCollection.find({
        state: { $exists: true }, semester: this.semester
    }).toArray()).keyBy('email').value()

    expect(_.difference(_.keys(latestComputedPeople), _.keys(latestPeople)).length).to.equal(0)

    return this
  }

  async loadEnrollmentByCounter() {
    let enrollmentCollection = this.db.collection('enrollment')
    this.enrollmentByCounter = _(await enrollmentCollection.find({
        semester: this.semester
      }).sort({
        'state.counter': 1
      }).toArray()).keyBy(e => {
        return e.state.counter
      })
      .value()

    let lastEnrollments
    for (let counter = this.startCounter; counter <= this.endCounter; counter++) {
      if (this.enrollmentByCounter[counter]) {
        lastEnrollments = this.enrollmentByCounter[counter]
      } else {
        this.enrollmentByCounter[counter] = lastEnrollments
      }
    }

    return this
  }

  getCounterAtTime(timestamp) {
    timestamp = moment.isMoment(timestamp) ? timestamp : moment(timestamp)
    return _(this.counters).sortBy(counter => {
      return counter.state.counter
    }).find(counter => {
      return timestamp.isAfter(moment(counter.state.updated)) &&
        (!(counter.endTime) || (timestamp.isSameOrBefore(counter.endTime)))
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

  async saveToFile(filename) {
    return fs.writeFile(filename, JSON.stringify({
      semester: this.semester,
      start: this.start,
      end: this.end,
      startCounter: this.startCounter,
      endCounter: this.endCounter,
      counters: this.counters,
      people: this.people,
    }, null, 2))
  }

  async loadFromFile(filename) {
    const saved = JSON.parse(await fs.readFile(filename))
    _.each(saved, (value, key) => {
      this[key] = value
    })
    await this.loadPeopleByCounter()
    return this.loadEnrollmentByCounter()
  }
}
