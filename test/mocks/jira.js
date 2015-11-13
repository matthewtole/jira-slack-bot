'use strict';

const _ = require('lodash');

function FakeJira(opts) {
  this.opts = opts;
}

module.exports = FakeJira;

FakeJira.prototype.findIssue = function(key, callback) {
  if (!_.contains(this.opts.validKeys, key)) {
    return callback(new Error('Cannot find issue'));
  }
  callback(null, {
    fields: {
      summary: 'This is a JIRA summary',
      issuetype: {
        name: 'TYPE'
      },
      priority: {
        name: 'PRIORITY'
      },
      status: {
        name: 'STATUS'
      },
      assignee: {
        displayName: 'PERSON'
      },
      created: new Date(),
      updated: new Date()
    }
  });
};
