'use strict';

const Slack = require('slack-client');
const JiraApi = require('jira').JiraApi;
const async = require('async');
const config = require('./config');
const BotLogic = require('./bot-logic');
const _ = require('lodash');

const slack = new Slack(config.slack.token, true, true);
const jira = new JiraApi('https', config.jira.host, config.jira.port,
  config.jira.user, config.jira.password, 'latest');

const JIRA_REGEX = /\b([A-Z]{2,8}-[0-9]{1,8})\b/g;

const botLogic = new BotLogic();
let projectKeys;

function boot(callback) {
  jira.listProjects((err, projects) => {
    if (err) {
      return callback(err);
    }
    projectKeys = projects.map(project => {
      return project.key;
    });
    slack.login();
  });
}

function makeJiraLink(id) {
  return `${config.jira.urlRoot}${id}`;
}

function jiraRegex() {
  if (projectKeys && projectKeys.length) {
    const keyString = projectKeys.join('|');
    return new RegExp(`\\b((${keyString})-[0-9]{1,8})\\b`, 'gi');
  }
  return JIRA_REGEX;
}

function handleError(err) {
  if (!err) {
    return;
  }
  console.error(err);
}

function messageFromIssue(id, issue) {
  return {
    text: `<${makeJiraLink(id)}|*${id}*: ${issue.fields.summary}>`,
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
            value: _.get(issue, 'fields.status.name', 'Unknown'),
            short: true
          },
          {
            title: 'Assignee',
            value: _.get(issue, 'fields.assignee.displayName', 'None'),
            short: true
          }
        ]
      }
    ]
  };
}

slack.on('open', () => {
  console.log('Bot connected to Slack');
});

slack.on('message', (message) => {
  // Skip messages posted by the bot!
  if (message.user === slack.self.id) {
    return;
  }
  // Skip messages in rooms that we've been told to ignore
  if (_.contains(config.channelsToIgnore, message.channel)) {
    return;
  }
  if (!message.text) {
    return;
  }
  const ids = message.text.match(jiraRegex());
  const channel = slack.getChannelGroupOrDMByID(message.channel);
  async.eachSeries(ids, (id, next) => {
    if (!botLogic.shouldPostIssue(message.channel, id)) {
      return next();
    }
    jira.findIssue(id, (err, issue) => {
      if (err) {
        return next(err);
      }
      if (!issue) {
        return next();
      }
      channel.postMessage(messageFromIssue(id, issue));
      botLogic.markIssuePosted(message.channel, id);
      next();
    });
  },
  handleError);
});

slack.on('error', handleError);

boot(handleError);
