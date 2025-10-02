const functions = require("firebase-functions");

exports.ping = functions.https.onRequest((_req, res) => {
  res.status(200).send("ok");
});
