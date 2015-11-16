'use strict';

const async = require('async');
const _ = require('lodash');

module.exports.iAmJiraUser = function(ctx, message, callback) {
  if (!ctx.isMessageForMe(message)) {
    return callback(null, false);
  }
  const channel = ctx.slack.getChannelGroupOrDMByID(message.channel);

  const data = /i am ([0-9a-z\.]+)/i.exec(message.text);
  if (!data) {
    return callback(null, false);
  }

  const username = data[1];
  ctx.setJiraUserForSlackUser(message.user, username, err => {
    if (err) {
      channel.send(`Failed to set the JIRA username of ${ctx.slack.getUserByID(message.user).name} to ${username}`);
    } else {
      channel.send(`Successfully set the JIRA username of ${ctx.slack.getUserByID(message.user).name} to ${username}`);
    }
    return callback(err, true);
  });
};

module.exports.assignIssue = function(ctx, message, callback) {
  if (!ctx.isMessageForMe(message)) {
    return callback(null, false);
  }
  const channel = ctx.slack.getChannelGroupOrDMByID(message.channel);

  const data = /assign (that|([A-Z]{2,8}-[0-9]{1,8})) to (me|(<@[0-9A-Z]*>))$/i.exec(message.text); // eslint-disable-line
  const assignData = {};

  if (data[3] === 'me') {
    assignData.assignee = message.user;
  } else {
    assignData.assignee = data[3].substr(2, data[3].length - 3);
  }

  if (data[1] === 'that') {
    ctx.getLastIssue(message.channel, (err, issue) => {
      if (err) {
        return callback(err);
      }
      assignData.issue = issue;
      doAssignment(callback);
    });
  } else {
    assignData.issue = data[1];
    doAssignment(callback);
  }

  function doAssignment(done) {
    ctx.getJiraUserFromSlackUser(assignData.assignee, (err, user) => {
      if (err) {
        return done(err);
      }
      if (!user) {
        channel.send(`Sorry, I do not know the JIRA username for ${ctx.slack.getUserByID(assignData.assignee).name}.`);
        return done(null, false);
      } else {
        ctx.jira.updateIssue(assignData.issue, {
          fields: {
            assignee: { name: user }
          }
        }, err => {
          if (err) {
            channel.send(`Oh no! I could not assign ${assignData.issue} to ${ctx.slack.getUserByID(assignData.assignee).name}`);
            return done(err);
          }
          channel.send(`Okay! I have assigned ${assignData.issue} to ${ctx.slack.getUserByID(assignData.assignee).name}`);
          return done(null, false);
        });
      }
    });
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
