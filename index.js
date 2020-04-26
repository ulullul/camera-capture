import express from 'express';
import nodeWebcam from "node-webcam";
import axios from 'axios';
import fs from 'fs';
import '@tensorflow/tfjs-node';
import * as faceapi from 'face-api.js';
import {canvas, faceDetectionNet, faceDetectionOptions, saveFile} from './common';
import isEmpty from 'lodash/isEmpty';
import {v4} from 'uuid';
import upload from "./utils/s3";
import path from 'path';
import {differenceInMilliseconds, format} from 'date-fns';

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

const writeFaces = (img, detections, fileName, callback) => {
  const out = faceapi.createCanvasFromMedia(img);
  faceapi.draw.drawDetections(out, detections);
  faceapi.draw.drawDetections(out, detections.map(res => res.detection));

  detections.forEach(result => {
    const { gender, genderProbability } = result;
    new faceapi.draw.DrawTextField(
      [
        `Human face`,
        `${gender} (${faceapi.utils.round(genderProbability)})`
      ],
      result.detection.box.bottomLeft
    ).draw(out)
  });
  saveFile(`${fileName}.jpg`, out.toBuffer('image/jpeg'));
  console.log(`done, saved results to out/${fileName}.jpg`);
  callback();
};

let pastTime = 0;
let currentTime = 0;
let previousDetectionsLength = 0;
let currentDetectionsLength = 0;

setInterval(() => {
  nodeWebcam.capture('last_snapshot', opts, async function (err, data) {
    try {
      await faceDetectionNet.loadFromDisk('weights');
      await faceapi.nets.ageGenderNet.loadFromDisk('weights');
      const image = await canvas.loadImage('last_snapshot.jpg');
      const detections = await faceapi.detectAllFaces(image, faceDetectionOptions).withAgeAndGender();
      if (!isEmpty(detections)) {
        currentTime = Date.now();
        let timeDifference = differenceInMilliseconds(currentTime, pastTime);
        pastTime = currentTime;
        currentDetectionsLength = detections.length;
        let detectionsDifference = currentDetectionsLength - previousDetectionsLength;
        previousDetectionsLength = currentDetectionsLength;
        if(timeDifference > 6000 || detectionsDifference !== 0) {
          let fileName = v4();
          writeFaces(image, detections, fileName, () => {
            fs.readFile(path.resolve(__dirname, `./out/${fileName}.jpg`), async function (err, data) {
              try {
                const uploadResponse = await upload(data, `${fileName}.jpg`);
                axios.post(/*'http://localhost:8000/api/camera/events'*/'https://camera-view.herokuapp.com/api/camera/events', {snapshot: uploadResponse.Location,date:format(Date.now(), "yyyy-MM-dd"), time:format(Date.now(), "HH:mm:ss")}).then(resp => console.log(resp)).catch(err => console.log(err));
              } catch (err) {
                console.log(err);
              }
            });
          });
        } else {
          axios.post('https://camera-view.herokuapp.com/api/camera/events', {nothingChanged: 'nothing changed'}).catch(err => console.log(err));
        }
      } else {
        axios.post('https://camera-view.herokuapp.com/api/camera/events', {nothingChanged: 'nothing changed'}).catch(err => console.log(err));
      }
    } catch (err) {
      console.log(err);
    }


  });
}, 2000);
