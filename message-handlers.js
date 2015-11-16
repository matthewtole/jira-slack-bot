'use strict';

const async = require('async');
const _ = require('lodash');

module.exports.iAmJiraUser = function(ctx, message, callback) {
  if (!ctx.isMessageForMe(message)) {
    return callback(null, false);
  }

  const data = /i am ([0-9a-z\.]+)/i.exec(message.text);
  if (!data) {
    return callback(null, false);
  }

  const username = data[1];
  ctx.jiraUsers[message.user] = username;
  return callback(null, true);
};

module.exports.assignIssue = function(ctx, message, callback) {
  if (!ctx.isMessageForMe(message)) {
    return callback(null, false);
  }
  const channel = ctx.slack.getChannelGroupOrDMByID(message.channel);

  const data = /assign (that|([A-Z]{2,8}-[0-9]{1,8})) to (me|(<@[0-9A-Z]*>))$/i.exec(message.text); // eslint-disable-line
  const assignData = {};
  if (data[1] === 'that') {
    assignData.issue = ctx.getLastIssue(message.channel);
  } else {
    assignData.issue = data[1];
  }

  if (data[3] === 'me') {
    assignData.assignee = message.user;
  } else {
    assignData.assignee = data[3].substr(2, data[3].length - 3);
  }

  if (!ctx.jiraUsers[assignData.assignee]) {
    channel.send(`Sorry, I do not know the JIRA username for ${ctx.slack.getUserByID(assignData.assignee).name}.`);
  } else {
    ctx.jira.updateIssue(assignData.issue, {
      assignee: ctx.jiraUsers[assignData.assignee]
    }, err => {
      if (err) {
        console.log(err);
      }
      channel.send(`Okay! I have assigned ${assignData.issue} to ${ctx.slack.getUserByID(assignData.assignee).name}`);
    });
  }
};

module.exports.markIssue = function(ctx, message, callback) {
  const channel = ctx.slack.getChannelGroupOrDMByID(message.channel);

  if (!ctx.isMessageForMe(message)) {
    return callback(null, false);
  }

};

module.exports.jiraInfo = function(ctx, message, callback) {
  const channel = ctx.slack.getChannelGroupOrDMByID(message.channel);

  const ids = _.uniq(message.text.match(ctx.jiraRegex()));
  async.eachSeries(ids, (id, next) => {
    if (!ctx.shouldPostIssue(message.channel, id)) {
      return next();
    }
    ctx.jira.findIssue(id, (err, issue) => {
      if (err) {
        return next();
      }
      // istanbul ignore next
      if (!issue) {
        return next();
      }
      channel.postMessage(ctx.messageFromIssue(id, issue));
      ctx.markIssuePosted(message.channel, id);
      next();
    });
  },
  callback);
};
