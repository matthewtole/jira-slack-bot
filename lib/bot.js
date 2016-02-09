'use strict';

const Slack = require('slack-client');
const JiraApi = require('jira').JiraApi;
const async = require('async');
const _ = require('lodash');
const moment = require('moment');
const redis = require('redis');
const Entities = require('html-entities').XmlEntities;
const MessageHandlers = require('../message-handlers');

const JIRA_REGEX = /\b([A-Z]{2,8}-[0-9]{1,8})\b/g;
const entities = new Entities();

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
  this.redis = redis.createClient(this.config.redisUrl);
  this.redis.on('error', (err) => {
    console.log('Redis Error :' + err);
  });

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

Bot.prototype.getLastIssue = function(channel, callback) {
  this.redis.hget('last-issue', channel, callback);
};

Bot.prototype.getJiraUserFromSlackUser = function(user, callback) {
  this.redis.hget('jira-slack-mapping', user, callback);
};

Bot.prototype.setJiraUserForSlackUser = function(userId, username, callback) {
  this.redis.hset('jira-slack-mapping', userId, username, callback);
};

Bot.prototype.getSlackUserFromJiraUser = function(username, callback) {
  this.redis.hgetall('jira-slack-mapping', (err, mapping) => {
    if (err) {
      return callback(err);
    }
    for (let id in mapping) {
      if (mapping[id] === username) {
        return callback(null, id);
      }
    }
    callback();
  });
};

Bot.prototype.shouldPostIssue = function(channelId, jiraId, callback) {
  if (!this.issueTimes[channelId]) {
    return true;
  }
  if (!this.issueTimes[channelId][jiraId]) {
    return true;
  }
  const timeSince = new Date() - this.issueTimes[channelId][jiraId];
  return timeSince >= 10;
};

Bot.prototype.markIssuePosted = function(channelId, jiraId) {
  if (!this.issueTimes[channelId]) {
    this.issueTimes[channelId] = {};
  }
  this.issueTimes[channelId][jiraId] = new Date();
  this.redis.hset('last-issue', channelId, jiraId, err => {
    if (err) {
      console.log(err);
    }
  });
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

Bot.prototype.messageFromIssue = function(id, issue, callback) {
  const jiraUser = _.get(issue, 'fields.assignee.key', null);
  this.getSlackUserFromJiraUser(jiraUser, (err, userId) => {
    if (err) {
      return callback(err);
    }

    const slackUser = this.slack.getUserByID(userId);

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
          value: slackUser ?
            `${issue.fields.assignee.displayName} (${slackUser.name})` :
            _.get(issue, 'fields.assignee.displayName', 'None'),
          short: true
        }
      ]
    };
    attachment.fallback = attachment.fields.map(field => {
      return [field.title, field.value].join(': ');
    }).join(', ');

    return callback(null, {
      text: `<${this.makeJiraLink(id)}|*${id}*: ` +
        `${entities.encode(issue.fields.summary)}>`,
      as_user: true,
      attachments: [ attachment ]
    });
  });
};
