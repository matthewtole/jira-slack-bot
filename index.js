'use strict';

const Bot = require('./lib/bot');
const config = require('./config');

const bot = new Bot(config);
bot.init(err => {
  if (err) {
    console.error(err);
  }
});
