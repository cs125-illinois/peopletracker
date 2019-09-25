#!/usr/bin/env bash

echo "Enter Password"
read -s password

REMOTE="mongodb://cs125Read:$password@cs125-mongo-01.cs.illinois.edu,cs125-mongo-02.cs.illinois.edu,cs125-mongo-03.cs.illinois.edu/cs125?replicaSet=cs125&ssl=true"
mongoexport --uri="$REMOTE" -c people -o fixtures/loadPeople.json && \
mongoexport --uri="$REMOTE" -c peopleChanges -o fixtures/loadPeopleChanges.json && \
mongoexport --uri="$REMOTE" -c enrollment -o fixtures/loadEnrollment.json

LOCAL="mongodb://127.0.0.1:28018/cs125"
mongoimport --drop --uri="$LOCAL" -c people fixtures/loadPeople.json && \
mongoimport --drop --uri="$LOCAL" -c peopleChanges fixtures/loadPeopleChanges.json && \
mongoimport --drop --uri="$LOCAL" -c enrollment fixtures/loadEnrollment.json
