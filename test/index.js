#!/usr/bin/env node

require('dotenv').config()
const _ = require('lodash')
const moment = require('moment')
const mongo = require('mongodb').MongoClient
const PeopleTracker = require('../index.js')

mongo.connect(process.env.MONGO).then(async client => {
  let tracker = await new PeopleTracker().load(client.db('Spring2018'))
  _.each(tracker.people, persons => {
    if (!(persons[0].role === 'student')) {
      return
    }
    let sections = []
    _.each(persons, person => {
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
    console.log(`${ persons[0].email }: ${ sections.join(',') }`)
  })
  console.log(tracker.getAt('marcofon@illinois.edu', moment()))
  client.close()
})

// vim: sw=2:ts=2:et
