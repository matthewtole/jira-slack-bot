'use strict';

const Slack = require('slack-client');
const JiraApi = require('jira').JiraApi;
const async = require('async');
const _ = require('lodash');
const moment = require('moment');

const JIRA_REGEX = /\b([A-Z]{2,8}-[0-9]{1,8})\b/g;

function Bot(config) {
  this.config = config;
  this.issueTimes = {};
  this.projectKeys = [];
}

module.exports = Bot;

// istanbul ignore next
Bot.prototype.init = function(callback) {
  this.jira = new JiraApi(
    'https',
    this.config.jira.host,
    this.config.jira.port,
    this.config.jira.user,
    this.config.jira.password,
    'latest'
  );
  this.slack = new Slack(this.config.slack.token, true, true);
  this._setupSlackHandlers();
  this.jira.listProjects((err, projects) => {
    if (err) {
      return callback(err);
    }
    this.projectKeys = projects.map(project => {
      return project.key;
    });
    this.slack.login();
    return callback();
  });
};

// istanbul ignore next
Bot.prototype._setupSlackHandlers = function() {
  this.slack.on('open', () => {
    console.log('Bot connected to Slack');
  });

  this.slack.on('message', message => {
    this._handleMessage(message, this._handleError);
  });

  this.slack.on('error', this._handleError);
};

Bot.prototype._handleMessage = function(message, callback) {
  // Skip messages posted by the bot!
  if (message.user === this.slack.self.id) {
    return callback();
  }
  // Skip messages in rooms that we've been told to ignore
  if (_.contains(this.config.channelsToIgnore, message.channel)) {
    return callback();
  }
  // Skip messages sent by other bots
  const user = this.slack.getUserByID(message.user);
  if (!user || user.is_bot) {
    return callback();
  }
  if (!message.text) {
    return callback();
  }
  const ids = _.uniq(message.text.match(this._jiraRegex()));
  const channel = this.slack.getChannelGroupOrDMByID(message.channel);
  async.eachSeries(ids, (id, next) => {
    if (!this._shouldPostIssue(message.channel, id)) {
      return next();
    }
    this.jira.findIssue(id, (err, issue) => {
      if (err) {
        return next();
      }
      // istanbul ignore next
      if (!issue) {
        return next();
      }
      channel.postMessage(this._messageFromIssue(id, issue));
      this._markIssuePosted(message.channel, id);
      next();
    });
  },
  callback);
};

Bot.prototype._shouldPostIssue = function(channelId, jiraId) {
  if (!this.issueTimes[channelId]) {
    return true;
  }
  if (!this.issueTimes[channelId][jiraId]) {
    return true;
  }
  const timeSince = new Date() - this.issueTimes[channelId][jiraId];
  return timeSince >= 30 * 60 * 1000;
};

Bot.prototype._markIssuePosted = function(channelId, jiraId) {
  if (!this.issueTimes[channelId]) {
    this.issueTimes[channelId] = {};
  }
  this.issueTimes[channelId][jiraId] = new Date();
};

Bot.prototype._makeJiraLink = function(id) {
  return `${this.config.jira.urlRoot}${id}`;
};

Bot.prototype._jiraRegex = function() {
  if (this.projectKeys && this.projectKeys.length) {
    const keyString = this.projectKeys.join('|');
    return new RegExp(`\\b((${keyString})-[0-9]{1,8})\\b`, 'gi');
  }
  return JIRA_REGEX;
};

// istanbul ignore next
Bot.prototype._handleError = function(err) {
  if (!err) {
    return;
  }
  console.error(err);
};

Bot.prototype._formatDate = function(date) {
  if (!date) {
    return null;
  }
  return moment(date).format('YYYY-MM-DD HH:mm');
};

Bot.prototype._messageFromIssue = function(id, issue) {
  return {
    text: `<${this._makeJiraLink(id)}|*${id}*: ${issue.fields.summary}>`,
    as_user: true,
    attachments: [
      {
        fallback: '',
        fields: [
          {
            title: 'Type',
            value: _.get(issue, 'fields.issuetype.name', 'Unknown'),
            short: true
          },
          {
            title: 'Priority',
            value: _.get(issue, 'fields.priority.name', 'Unknown'),
            short: true
          },
          {
            title: 'Status',
            value: _.get(issue, 'fields.status.name', 'Unknotwn'),
            short: true
          },
          {
            title: 'Assignee',
            value: _.get(issue, 'fields.assignee.displayName', 'None'),
            short: true
          },
          {
            title: 'Created',
            value: this._formatDate(_.get(issue, 'fields.created', null)),
            short: true
          },
          {
            title: 'Updated',
            value: this._formatDate(_.get(issue, 'fields.updated', null)),
            short: true
          }
        ]
      }
    ]
  };
};
