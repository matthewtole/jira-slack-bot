'use strict';

const _ = require('lodash');

function FakeSlack(opts) {
  this.opts = opts;
  this.outgoingMessages = [];
  this.self = {
    id: opts.user_id
  };
}

module.exports = FakeSlack;

FakeSlack.prototype.sentMessages = function() {
  return this.outgoingMessages;
};

FakeSlack.prototype.reset = function() {
  this.outgoingMessages = [];
};

FakeSlack.prototype.getUserByID = function(id) {
  return {
    is_bot: _.contains(this.opts.bots, id)
  };
};

FakeSlack.prototype.getChannelGroupOrDMByID = function(id) {
  return {
    postMessage: message => {
      this.outgoingMessages.push(message);
    }
  };
};
