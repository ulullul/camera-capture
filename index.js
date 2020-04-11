import express from'express';
import nodeWebcam from"node-webcam";
import axios from 'axios';
import * as faceapi from 'face-api.js';
import { canvas, faceDetectionNet, faceDetectionOptions, saveFile } from './common';
import isEmpty from 'lodash/isEmpty';
import debounce from 'lodash/debounce';
import { v4 } from 'uuid';

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

const writeFaces = debounce(async (img, detections)=> {
  console.log(detections);
  const out = faceapi.createCanvasFromMedia(img);
  faceapi.draw.drawDetections(out, detections);

  saveFile(`${v4()}.jpg`, out.toBuffer('image/jpeg'));
  console.log('done, saved results to out/faceDetection.jpg');
}, 2000);

setInterval(()=> {
nodeWebcam.capture('test', opts, async function (err, data) {
  if(!err) console.log('gut');
  await faceDetectionNet.loadFromDisk('weights');
  const img = await canvas.loadImage('test.jpg');
  const detections = await faceapi.detectAllFaces(img, faceDetectionOptions);
  if(!isEmpty(detections)) {
    // console.log(detections);
    writeFaces(img, detections);
  }


  // axios.post('http://localhost:8000/api/camera', {snapshot: `${data}`}).then(response => {
  //   console.log('norm')
  // }).catch(error => {
  //   console.log('error? ',error);
  // })
});
}, 1000);
