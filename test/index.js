#!/usr/bin/env node

require('dotenv').config()
const _ = require('lodash')
const moment = require('moment')
const mongo = require('mongodb').MongoClient
const expect = require('chai').expect

const PeopleTracker = require('../index.js')

mongo.connect(process.env.MONGO, { useNewUrlParser: true, useUnifiedTopology: true }).then(async client => {
  let tracker = await new PeopleTracker(process.env.SEMESTER, client.db('cs125')).load()
  for (timestamp = moment(tracker.start); timestamp.isBefore(moment(tracker.end)); timestamp.add(1, 'day')) {
    let currentTime = moment(timestamp).add(15, 'minutes')
    let enrollment = tracker.getEnrollmentAtTime(currentTime)
    expect(enrollment).to.be.ok
    console.log(timestamp)
  }
  client.close()
}).catch(err => {
  console.log(err)
  throw err
})

// vim: sw=2:ts=2:et
