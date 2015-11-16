'use strict';

require('dotenv').load();
const sanity = require('sanity');

sanity.check([
  'SLACK_TOKEN',
  'JIRA_HOST',
  'JIRA_PORT',
  'JIRA_USERNAME',
  'JIRA_PASSWORD',
  'JIRA_URL_ROOT'
]);

module.exports.slack = {
  token: process.env.SLACK_TOKEN
};

module.exports.jira = {
  host: process.env.JIRA_HOST,
  port: process.env.JIRA_PORT,
  user: process.env.JIRA_USERNAME,
  password: process.env.JIRA_PASSWORD,
  urlRoot: process.env.JIRA_URL_ROOT
};

module.exports.channelsToIgnore = (process.env.IGNORE_CHANNELS || '').split(',');

module.exports.redisUrl = process.env.REDIS_URL;
