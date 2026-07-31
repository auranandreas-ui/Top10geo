'use strict';
const Stripe = require('stripe');

function getStripe(){
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
}

module.exports = { getStripe };
