const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(functions.config().stripe.token);
const currency = 'JPY';

function userFacingMessage(error) {
  return error.type ? error.message : 'An error occurred, developers have been alerted';
}

class Border {
  constructor(version) {
    this.version = version;
  }

  cleateStripeCustomer(userID) {
    return stripe.customers.create()
      .then(customer => {
        return admin.database().ref(`/${this.version}/customer`).push({
          _createdAt: admin.database.ServerValue.TIMESTAMP,
          _updatedAt: admin.database.ServerValue.TIMESTAMP,
          userID: userID,
          stripeCustomerID: customer.id
        }).key;
      })
      .then(customerID => admin.database().ref(`/${this.version}/user/${userID}/customerID`).set(customerID));
  }

  createCustomer() {
    return functions.https.onRequest((req, res) => {
      if (req.method != 'POST') { res.status(403).end(); }
      const userID = req.body.userID;
      if (!userID) { res.status(400).end(); }
      this.cleateStripeCustomer(userID)
        .then(() => { res.status(200).send({result: true}); });
    });
  }

  createCustomerOnAuthUserCreate() {
    return functions.auth.user().onCreate(event => {
      const authUser = event.data;
      return this.cleateStripeCustomer(authUser.uid);
    });
  }

  cleanupCustomer() {
    return functions.auth.user().onDelete(event => {
      const authUser = event.data;
      return admin.database().ref(`/${this.version}/user/${authUser.uid}`).once('value').then(snapshot => snapshot.val())
        .then(user => admin.database().ref(`/${this.version}/customer/${user.customerID}`).once('value').then(snapshot => snapshot.val()))
        .then(customer => stripe.customers.del(customer.stripeCustomerID));
    });
  }

  addPaymentSource() {
    return functions.database.ref(`/${this.version}/source/{sourceID}/token`).onWrite(event => {
      const token = event.data.val();
      const sourceID = event.params.sourceID;
      if (token === null) { return null; }
      if (!sourceID) { return null; }
      return admin.database().ref(`/${this.version}/source/${sourceID}`).once('value').then(snapshot => snapshot.val())
        .then(source => admin.database().ref(`/${this.version}/user/${source.userID}`).once('value').then(snapshot => snapshot.val()))
        .then(user => admin.database().ref(`/${this.version}/customer/${user.customerID}`).once('value').then(snapshot => snapshot.val()))
        .then(customer => stripe.customers.createSource(customer.stripeCustomerID, {source: token}))
        .then(response => {
          return event.data.adminRef.parent.update({
            cardID: response.id,
            brand: response.brand,
            country: response.country,
            stripeCustomerID: response.customer,
            cvcCheck: response.cvc_check,
            expMonth: response.exp_month,
            expYear: response.exp_year,
            fingerprint: response.fingerprint,
            funding: response.funding,
            last4: response.last4,
            object: response.object,
          });
        }, error => {
          return event.data.adminRef.parent.child('error').set(userFacingMessage(error)).then(() => {
            console.log(error);
          });
        });
    });
  }

  createStripeCharge() {
    return functions.database.ref(`/${this.version}/charge/{chargeID}`).onWrite(event => {
      const charge = event.data.val();
      const customerID = charge.customerID;

      if (charge === null || charge.id || charge.error) { return null; }
      if (!customerID) { return null; }

      return admin.database().ref(`/${this.version}/customer/${customerID}`).once('value').then(snapshot => snapshot.val())
        .then(customer => {
          const amount = charge.amount;
          const customerID = customer.stripeCustomerID;
          let chargeJSON = {amount: amount, currency: currency, customer: customerID};

          const sourceID = charge.sourceID;
          if (!sourceID) { return chargeJSON; }

          return admin.database().ref(`/${this.version}/source/${sourceID}`).once('value').then(snapshot => snapshot.val())
            .then(source => {
              chargeJSON.source = source.cardID;
              return chargeJSON;
            });
        })
        .then(chargeJSON => {
          const idempotencyKey = event.params.chargeID;
          return stripe.charges.create(chargeJSON, {idempotency_key: idempotencyKey});
        }).then(response => {
          console.log(response);
        }, error => {
          return event.data.adminRef.child('error').set(userFacingMessage(error)).then(() => {
            console.log(error);
          });
        });
    });
  }
}

module.exports = Border;
