'use strict';

const assert = require('assert');
const Bot = require('../lib/bot');
const FakeSlack = require('./mocks/slack');
const FakeJira = require('./mocks/jira');

describe('Bot', function() {
  describe('#_shouldPostIssue', function() {
    it('should return true if new issue', function(done) {
      let bot = new Bot();
      assert(bot._shouldPostIssue('12345', 'PBL-12345'));
      done();
    });

    it('should return false after posting issue', function(done) {
      let bot = new Bot();
      assert(bot._shouldPostIssue('12345', 'PBL-12345'));
      bot._markIssuePosted('12345', 'PBL-12345');
      assert(!bot._shouldPostIssue('12345', 'PBL-12345'));
      assert(bot._shouldPostIssue('12345', 'PBL-00000'));
      bot._markIssuePosted('12345', 'PBL-00000');
      assert(!bot._shouldPostIssue('12345', 'PBL-00000'));
      done();
    });
  });

  describe('#_makeJiraLink', function() {
    it('should return a URL to the JIRA issue', function(done) {
      let bot = new Bot({
        jira: {
          urlRoot: 'URL_ROOT'
        }
      });
      assert.equal(bot._makeJiraLink('12345'), 'URL_ROOT12345');
      done();
    });
  });

  describe('#_messageFromIssue', function() {
    it('should set the text of the message', function(done) {
      let bot = new Bot({
        jira: {
          urlRoot: 'URL_ROOT'
        }
      });
      let id = '12345';
      let issue = {
        fields: {
          summary: 'This is the summary'
        }
      };
      let message = bot._messageFromIssue(id, issue);
      assert.equal(message.text, '<URL_ROOT12345|*12345*: This is the summary>');
      done();
    });
  });

  describe('#_handleMessage', function() {
    let fakeSlack;
    let fakeJira;
    let bot;

    before(function(done) {
      fakeSlack = new FakeSlack({
        user_id: 'MY_ID',
        bots: ['BOT_ID']
      });
      fakeJira = new FakeJira({
        validKeys: 'ABC-12345'
      });
      done();
    });

    beforeEach(function(done) {
      bot = new Bot({
        jira: {
          urlRoot: 'URL_ROOT'
        },
        channelsToIgnore: ['BADCHANNEL']
      });
      bot.slack = fakeSlack;
      bot.jira = fakeJira;
      fakeSlack.reset();
      done();
    });

    it('should ignore messages from itself', function(done) {
      let message = {
        text: 'ABC-12345',
        user: 'MY_ID'
      };
      bot._handleMessage(message, err => {
        assert.equal(fakeSlack.sentMessages().length, 0);
        done(err);
      });
    });

    it('should ignore messages sent by bots', function(done) {
      let message = {
        text: 'ABC-12345',
        user: 'BOT_ID'
      };
      bot._handleMessage(message, err => {
        assert.equal(fakeSlack.sentMessages().length, 0);
        done(err);
      });
    });

    it('ignores messages without any text', function(done) {
      let message = {
        user: '12345'
      };
      bot._handleMessage(message, err => {
        assert.equal(fakeSlack.sentMessages().length, 0);
        done(err);
      });
    });

    it('ignores messages in channels configured to be ignored', function(done) {
      let message = {
        text: 'ABC-12345',
        user: '12345',
        channel: 'BADCHANNEL'
      };
      bot._handleMessage(message, err => {
        assert.equal(fakeSlack.sentMessages().length, 0);
        done(err);
      });
    });

    it('sends messages for each JIRA issue', function(done) {
      let message = {
        text: 'ABC-12345',
        user: '12345'
      };
      bot._handleMessage(message, err => {
        assert.equal(fakeSlack.sentMessages().length, 1);
        done(err);
      });
    });

    it('skips JIRA issues it cannot find', function(done) {
      let message = {
        text: 'ABC-12345 ABC-00000',
        user: '12345'
      };
      bot._handleMessage(message, err => {
        assert.equal(fakeSlack.sentMessages().length, 1);
        done(err);
      });
    });

    it('does not respond to the same issue twice in period of time', function(done) {
      let message = {
        text: 'ABC-12345',
        user: '12345'
      };
      bot._handleMessage(message, err => {
        if (err) {
          return done(err);
        }
        bot._handleMessage(message, err => {
          assert.equal(fakeSlack.sentMessages().length, 1);
          done(err);
        });
      });
    });
  });

  describe('#_makeJiraLink', function() {
    it('should use the default regex when no project keys', function(done) {
      let bot = new Bot();
      let regex = bot._jiraRegex();
      assert(regex.exec('ZZZZ-99999'));
      done();
    });
  });

  it('should use the project keys if they have been set', function(done) {
    let bot = new Bot();
    bot.projectKeys = ['PBL'];
    let regex = bot._jiraRegex();
    assert(!regex.exec('ZZZZ-99999'));
    assert(regex.exec('PBL-99999'));
    done();
  });
});
