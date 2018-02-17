#!/usr/bin/env node

require('dotenv').config()
const mongo = require('mongodb').MongoClient
const PeopleTracker = require('../index.js')

mongo.connect(process.env.MONGO).then(async client => {
  let tracker = await new PeopleTracker().load(client.db('Spring2018'))
  client.close()
})

// vim: sw=2:ts=2:et
