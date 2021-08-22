const express = require('express');
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware');

const app = new express();

app.use(awsServerlessExpressMiddleware.eventContext());

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
      .then(async (data) => {
        if (data && data.Body) {
          const modifiedImage = sharp(data.Body)
            .resize(width, height, {
              fit: fit ? fit : 'cover',
              position: position ? position : 'centre',
            })
            .toFormat(format, { quality: quality })
            .toBuffer();

          // If the converted image is larger than Lambda's payload hard limit, throw an error.
          const lambdaPayloadLimit = 6 * 1024 * 1024;
          if (modifiedImage.length > lambdaPayloadLimit) {
            throw {
              status: '413',
              code: 'TooLargeImageException',
              message: 'The converted image is too large to return.',
            };
          }

          return modifiedImage;
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

app.get('/resize', (req, res) => {
  try {
    if (req && req.query) {
      async function triggerResize() {
        // Extract the query-parameter
        if (!req.query.image) {
          return res.status(500).send({
            statusCode: 500,
            body: JSON.stringify({
              status: 'error',
              message: 'No Image Was Provided.',
            }),
          });
        }

        const widthString = req.query.width || req.query.w;
        const heightString = req.query.height || req.query.h;
        const format = req.query.format || req.query.fm || 'png';
        const image = req.query.image ? req.query.image : 'icon.png';
        const fit = req.query.fit || 'cover';
        const position = req.query.position || 'centre';
        const quality = req.query.quality
          ? Number(req.query.quality)
          : req.query.q
          ? Number(req.query.q)
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
          res.status(200);

          // Set the content-type of the response
          res.setHeader('Content-Type', `image/${format || 'png'}`);

          var imageResizedBase = Buffer.from(imageResized, 'base64');

          return res.end(imageResizedBase);
        } else {
          return res.status(500).send({
            statusCode: 500,
            body: JSON.stringify({
              status: 'error',
              message: 'No image found.',
            }),
          });
        }
      }

      return triggerResize();
    } else {
      return res.status(500).send({
        statusCode: 500,
        body: JSON.stringify({
          status: 'error',
          message: 'No query provided.',
        }),
      });
    }
  } catch (err) {
    console.error(err);

    return res.status(500).send({
      statusCode: 500,
      body: JSON.stringify({
        status: 'error',
        message: 'Internal Server Error',
      }),
    });
  }
});

module.exports = app;
