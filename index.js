import express from 'express';
import nodeWebcam from "node-webcam";
import axios from 'axios';
import fs from 'fs';
import * as faceapi from 'face-api.js';
import {canvas, faceDetectionNet, faceDetectionOptions, saveFile} from './common';
import isEmpty from 'lodash/isEmpty';
import debounce from 'lodash/debounce';
import {v4} from 'uuid';
import upload from "./utils/s3";
import path from 'path';

require('dotenv').config();

const app = express();

const opts = {
  //Picture related
  width: 1280,
  height: 720,
  quality: 100,
  //Delay in seconds to take shot
  //if the platform supports miliseconds
  //use a float (0.1)
  //Currently only on windows
  delay: 1,
  //Save shots in memory
  saveShots: false,
  // [jpeg, png] support varies
  // Webcam.OutputTypes
  output: 'jpeg',
  //Which camera to use
  //Use Webcam.list() for results
  //false for default device
  device: false,
  // [location, buffer, base64]
  // Webcam.CallbackReturnTypes
  callbackReturn: "buffer",
  //Logging
  verbose: false
};

const FPS = 60;

async function hello() {

}

const writeFaces = debounce((img, detections, fileName, callback) => {
  const out = faceapi.createCanvasFromMedia(img);
  faceapi.draw.drawDetections(out, detections);

  saveFile(`${fileName}.jpg`, out.toBuffer('image/jpeg'));
  console.log(`done, saved results to out/${fileName}.jpg`);
  callback();
}, 1500);

setInterval(() => {
  nodeWebcam.capture('test', opts, async function (err, data) {
    try {
      await faceDetectionNet.loadFromDisk('weights');
      const img = await canvas.loadImage('test.jpg');
      const detections = await faceapi.detectAllFaces(img, faceDetectionOptions);
      if (!isEmpty(detections)) {
        console.log("action!!");
        let fileName = v4();
        writeFaces(img, detections, fileName,()=> {
           fs.readFile(path.resolve(__dirname, `./out/${fileName}.jpg`), async function (err, data) {
            console.log(data);
            try {
              await upload(data, `${fileName}.jpg`);
            } catch (err) {
              console.log(err);
            }
          });
        });
      }
    } catch (err) {
      console.log(err);
    }


    // axios.post('http://localhost:8000/api/camera', {snapshot: `${data}`}).then(response => {
    //   console.log('norm')
    // }).catch(error => {
    //   console.log('error? ',error);
    // })
  });
}, 1000);
