# Border
Border is CloudFunction libarry that connect Firebase and Stripe.

## Feature
- Create stripe customer.
- Add payment(credit card) to stripe.
- Charge amount using specified card.

## Install
`$ npm install border`

## Usage
- Add your [Stripe API Secret Key](https://dashboard.stripe.com/account/apikeys) to firebase config:  
`firebase functions:config:set stripe.token=<YOUR_STRIPE_API_SECRET_KEY>`

```js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

const Border = require('./border')
const border = new Border("v1"); // set model version.

exports.createStripeCustomer = border.createCustomer();
exports.cleanupStripeCustomer = border.cleanupCustomer();
exports.registerCreditCard = border.addPaymentSource();
exports.createStripeCharge = border.createStripeCharge();
```

## Security Rules
You have to set security rules(.read/.write) so that each models can only access `Authenticated user himself`.

- `/{version}/customer/{customerID}`
- `/{version}/charge/{chargeID}`
- `/{version}/source/{sourceID}`


Please take care.
