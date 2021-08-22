// handler.js

'use strict';
const sharp = require('sharp');

const AWS = require('aws-sdk');
const S3 = new AWS.S3({
  accessKeyId: process.env.CDN_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.CDN_SECRET_ACCESS_KEY || '',
  region: 'eu-west-1',
  signatureVersion: 'v4',
});

const resizeFunction = (
  path,
  format,
  width,
  height,
  fit,
  position,
  quality
) => {
  try {
    console.log(
      'Resizing Image: ',
      path,
      format,
      width,
      height,
      fit,
      position,
      quality
    );

    return S3.getObject({
      Bucket: 'cdn.nicholasgriffin.dev',
      Key: path,
    })
      .promise()
      .then((data) => {
        if (data && data.Body) {
          return sharp(data.Body)
            .resize(width, height, {
              fit: fit ? fit : 'cover',
              position: position ? position : 'centre',
            })
            .withMetadata()
            .toFormat(format, { quality: quality })
            .toBuffer();
        } else {
          return {
            statusCode: 500,
            body: 'No image data was returned.',
          };
        }
      })
      .catch((err) => {
        console.error(err);
        if (err.code === 'NoSuchKey') err.message = 'Image not found.';
        return {
          statusCode: err.statusCode,
          body: err.message,
        };
      });
  } catch (err) {
    console.error(err);
  }
};

module.exports.resize = function (event, context, callback) {
  try {
    console.log(event); // Contains incoming request data (e.g., query params, headers and more)

    if (event && event.queryStringParameters) {
      async function triggerResize() {
        // Extract the query-parameter
        if (!event.queryStringParameters.image) {
          const response = {
            statusCode: 500,
            body: JSON.stringify({
              status: 'error',
              message: 'No Image Was Provided.',
            }),
          };

          callback(null, response);
        }

        const widthString =
          event.queryStringParameters.width || event.queryStringParameters.w;
        const heightString =
          event.queryStringParameters.height || event.queryStringParameters.h;
        const format =
          event.queryStringParameters.format ||
          event.queryStringParameters.fm ||
          'png';
        const image = event.queryStringParameters.image
          ? event.queryStringParameters.image
          : 'icon.png';
        const fit = event.queryStringParameters.fit || 'cover';
        const position = event.queryStringParameters.position || 'centre';
        const quality = event.queryStringParameters.quality
          ? Number(event.queryStringParameters.quality)
          : event.queryStringParameters.q
          ? Number(event.queryStringParameters.q)
          : 80;

        // Parse to integer if possible
        let width, height;
        if (widthString) {
          width = parseInt(widthString);
        }
        if (heightString) {
          height = parseInt(heightString);
        }

        // Get the resized image
        const imageResized = await resizeFunction(
          decodeURIComponent(image),
          format,
          width,
          height,
          fit,
          position,
          quality
        );

        if (imageResized && !imageResized.statusCode) {
          const imageResizedBase = Buffer.from(imageResized, 'base64');

          const response = {
            statusCode: 200,
            headers: {
              'Content-Type': `image/${format || 'png'}`,
            },
            body: imageResizedBase.toString('base64'),
            isBase64Encoded: true,
          };

          callback(null, response);
        } else {
          const response = {
            statusCode: 500,
            body: JSON.stringify({
              status: 'error',
              message: 'No image found.',
            }),
          };

          callback(null, response);
        }
      }

      return triggerResize();
    } else {
      const response = {
        statusCode: 500,
        body: JSON.stringify({
          status: 'error',
          message: 'No query provided.',
        }),
      };

      callback(null, response);
    }
  } catch (err) {
    console.error(err);

    const response = {
      statusCode: 500,
      body: JSON.stringify({
        status: 'error',
        message: 'Internal Server Error',
      }),
    };

    callback(null, response);
  }
};
