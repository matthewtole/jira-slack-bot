'use strict';

const Slack = require('slack-client');
const JiraApi = require('jira').JiraApi;
const async = require('async');
const _ = require('lodash');
const moment = require('moment');
const MessageHandlers = require('../message-handlers');

const JIRA_REGEX = /\b([A-Z]{2,8}-[0-9]{1,8})\b/g;

function Bot(config) {
  this.config = config;
  this.issueTimes = {};
  this.projectKeys = [];
  this.lastIssues = {};
  this.jiraUsers = {};
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
    this._handleMessage(message, this.handleError);
  });

  this.slack.on('error', this.handleError);
};

Bot.prototype._handleMessage = function(message, callback) {
  const user = this.slack.getUserByID(message.user);

  // Skip messages posted by the bot!
  if (message.user === this.slack.self.id) {
    return callback();
  }
  // Skip messages in rooms that we've been told to ignore
  if (_.contains(this.config.channelsToIgnore, message.channel)) {
    return callback();
  }
  // Skip messages sent by other bots
  if (!user || user.is_bot) {
    return callback();
  }
  // Skip empty messages
  if (!message.text) {
    return callback();
  }

  let messageHandled = false;
  const messageHandlers = [
    MessageHandlers.iAmJiraUser,
    MessageHandlers.assignIssue,
    MessageHandlers.markIssue,
    MessageHandlers.jiraInfo
  ];
  async.whilst(
    () => {
      return !messageHandled && messageHandlers.length > 0;
    },
    callback => {
      const handler = messageHandlers.shift();
      handler(this, message, (err, handled) => {
        messageHandled = handled;
        callback(err);
      });
    },
    callback
  );
};

Bot.prototype.isMessageForMe = function(message) {
  return (message.text && message.text.substr(0, 12) === `<@${this.slack.self.id}>`);
};

Bot.prototype.getLastIssue = function(channel) {
  return this.lastIssues[channel] || null;
};

Bot.prototype.getJiraUserFromSlackUser = function(user) {
  return this.jiraUsers[user];
};

Bot.prototype.shouldPostIssue = function(channelId, jiraId) {
  if (!this.issueTimes[channelId]) {
    return true;
  }
  if (!this.issueTimes[channelId][jiraId]) {
    return true;
  }
  const timeSince = new Date() - this.issueTimes[channelId][jiraId];
  return timeSince >= 30 * 60 * 1000;
};

Bot.prototype.markIssuePosted = function(channelId, jiraId) {
  if (!this.issueTimes[channelId]) {
    this.issueTimes[channelId] = {};
  }
  this.issueTimes[channelId][jiraId] = new Date();
  this.lastIssues[channelId] = jiraId;
};

Bot.prototype.makeJiraLink = function(id) {
  return `${this.config.jira.urlRoot}${id}`;
};

Bot.prototype.jiraRegex = function() {
  if (this.projectKeys && this.projectKeys.length) {
    const keyString = this.projectKeys.join('|');
    return new RegExp(`\\b((${keyString})-[0-9]{1,8})\\b`, 'gi');
  }
  return JIRA_REGEX;
};

// istanbul ignore next
Bot.prototype.handleError = function(err) {
  if (!err) {
    return;
  }
  console.error(err);
};

Bot.prototype.formatDate = function(date) {
  if (!date) {
    return null;
  }
  return moment(date).format('YYYY-MM-DD HH:mm');
};

Bot.prototype.messageFromIssue = function(id, issue) {
  const attachment = {
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
        value: this.formatDate(_.get(issue, 'fields.created', null)),
        short: true
      },
      {
        title: 'Updated',
        value: this.formatDate(_.get(issue, 'fields.updated', null)),
        short: true
      }
    ]
  };
  attachment.fallback = attachment.fields.map(field => {
    return [field.title, field.value].join(': ');
  }).join(', ');

  return {
    text: `<${this.makeJiraLink(id)}|*${id}*: ${issue.fields.summary}>`,
    as_user: true,
    attachments: [ attachment ]
  };
};
