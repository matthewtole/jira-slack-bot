'use strict';

const assert = require('assert');
const BotLogic = require('../bot-logic');

describe('BotLogic', function() {
  describe('#shouldPostIssue', function() {
    it('should return true if new issue', function(done) {
      let botLogic = new BotLogic();
      assert(botLogic.shouldPostIssue('12345', 'PBL-12345'));
      done();
    });

    it('should return false after posting issue', function(done) {
      let botLogic = new BotLogic();
      assert(botLogic.shouldPostIssue('12345', 'PBL-12345'));
      botLogic.markIssuePosted('12345', 'PBL-12345');
      assert(!botLogic.shouldPostIssue('12345', 'PBL-12345'));
      assert(botLogic.shouldPostIssue('12345', 'PBL-00000'));
      botLogic.markIssuePosted('12345', 'PBL-00000');
      assert(!botLogic.shouldPostIssue('12345', 'PBL-00000'));
      done();
    });

  });
});
