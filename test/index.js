#!/usr/bin/env node

require('dotenv').config()
const _ = require('lodash')
const moment = require('moment')
const mongo = require('mongodb').MongoClient
const expect = require('chai').expect

const PeopleTracker = require('../index.js')

mongo.connect(process.env.MONGO).then(async client => {
  let tracker = await new PeopleTracker().load(client.db('Spring2018'))
  _.each(tracker.people, persons => {
    if (!(persons[0].role === 'student')) {
      return
    }
    let sections = []
    _.each(persons, person => {
      if (!person.active) {
        return
      }
      let currentSection
      if (person.AL1) {
        currentSection = 'AL1'
      } else if (person.AL2) {
        currentSection = 'AL2'
      } else {
        currentSection = '?'
      }
      if (sections.length === 0 || sections[sections.length - 1] != currentSection) {
        sections.push(currentSection)
      }
    })
    // console.log(persons[0].email, sections.join(', '))
  })
  for (timestamp = tracker.start; timestamp.isBefore(tracker.end); timestamp.add(1, 'day')) {
    let currentTime = moment(timestamp).add(15, 'minutes')
    let enrollment = tracker.getEnrollmentAtTime(currentTime)
    expect(enrollment).to.be.ok
  }
  client.close()
}).catch(err => {
  console.log(err)
  throw err
})

// vim: sw=2:ts=2:et
