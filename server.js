const awsServerlessExpress = require('aws-serverless-express');
const app = require('./app');
const binaryMimeTypes = [
  'image/jpg',
  'image/gif',
  'image/png',
  'image/jpeg',
  'image/avif',
  'image/webp',
];

const server = awsServerlessExpress.createServer(app, null, binaryMimeTypes);

module.exports.express = (event, context) =>
  awsServerlessExpress.proxy(server, event, context);
