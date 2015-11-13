'use strict';

function BotLogic() {
  this.issueTimes = {};
}

module.exports = BotLogic;

BotLogic.prototype.shouldPostIssue = function(channelId, jiraId) {
  if (!this.issueTimes[channelId]) {
    return true;
  }
  if (!this.issueTimes[channelId][jiraId]) {
    return true;
  }
  const timeSince = new Date() - this.issueTimes[channelId][jiraId];
  return timeSince >= 30 * 60 * 1000;
};

BotLogic.prototype.markIssuePosted = function(channelId, jiraId) {
  if (!this.issueTimes[channelId]) {
    this.issueTimes[channelId] = {};
  }
  this.issueTimes[channelId][jiraId] = new Date();
};
