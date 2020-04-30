import nodeWebcam from 'node-webcam';
import axios from 'axios';
import fs from 'fs';
import '@tensorflow/tfjs-node';
import * as faceapi from 'face-api.js';
import {
  canvas,
  faceDetectionNet,
  faceDetectionOptions,
  saveFile,
} from './common';
import isEmpty from 'lodash/isEmpty';
import forEach from 'lodash/forEach';
import { v4 } from 'uuid';
import upload from './utils/s3';
import path from 'path';
import { differenceInMilliseconds, format } from 'date-fns';
import { promisify } from 'util';

require('dotenv').config();

const opts = {
  width: 1280,
  height: 720,
  quality: 100,
  delay: 1,
  saveShots: false,
  output: 'jpeg',
  device: false,
  callbackReturn: 'buffer',
  verbose: false,
};

const readFileAsync = promisify(fs.readFile);

function loadLabeledImages() {
  const labels = [
    'Andrii Prytula',
    'Alex Fox',
    'Maxim Lohviniuk',
    'Vitalii Perehonchuk',
  ];
  return Promise.all(
    labels.map(async (label) => {
      const descriptions = [];
      for (let i = 1; i < 2; i++) {
        const image = await canvas.loadImage(
          `./labeled_images/${label}/${i}.jpg`,
        );
        const detection = await faceapi
          .detectSingleFace(image)
          .withFaceLandmarks()
          .withFaceDescriptor();
        descriptions.push(detection.descriptor);
      }
      return new faceapi.LabeledFaceDescriptors(label, descriptions);
    }),
  );
}

const writeFaces = (img, detections, fileName, faceMatchResult) => {
  return new Promise((resolve, reject) => {
    const out = faceapi.createCanvasFromMedia(img);
    faceapi.draw.drawDetections(out, detections);
    faceapi.draw.drawDetections(
      out,
      detections.map((res) => res.detection),
    );
    forEach(detections, (result, i) => {
      const { gender, genderProbability } = result;
      new faceapi.draw.DrawTextField(
        [
          faceMatchResult[i].label === 'unknown'
            ? `Unknown human face`
            : faceMatchResult[i].label,
          `${gender} (${faceapi.utils.round(genderProbability)})`,
        ],
        result.detection.box.bottomLeft,
      ).draw(out);
    });
    saveFile(`${fileName}.jpg`, out.toBuffer('image/jpeg'));
    console.log(`done, saved results to out/${fileName}.jpg`);
    resolve();
  });
};

let pastTime = 0;
let currentTime = 0;
let previousDetectionsLength = 0;
let currentDetectionsLength = 0;

(async function run() {
  await faceDetectionNet.loadFromDisk('weights');
  await faceapi.nets.ageGenderNet.loadFromDisk('weights');
  await faceapi.nets.faceLandmark68Net.loadFromDisk('weights');
  await faceapi.nets.faceRecognitionNet.loadFromDisk('weights');
  const labeledFaceDescriptors = await loadLabeledImages();
  const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.5);

  setInterval(() => {
    nodeWebcam.capture('last_snapshot', opts, async () => {
      try {
        const image = await canvas.loadImage('last_snapshot.jpg');
        const detections = await faceapi
          .detectAllFaces(image, faceDetectionOptions)
          .withFaceLandmarks()
          .withFaceDescriptors()
          .withAgeAndGender();

        if (!isEmpty(detections)) {
          currentTime = Date.now();
          let timeDifference = differenceInMilliseconds(currentTime, pastTime);
          pastTime = currentTime;
          currentDetectionsLength = detections.length;
          let detectionsDifference =
            currentDetectionsLength - previousDetectionsLength;
          previousDetectionsLength = currentDetectionsLength;
          if (timeDifference > 6000 || detectionsDifference !== 0) {
            try {
              const faceMatchResult = detections.map((d) =>
                faceMatcher.findBestMatch(d.descriptor),
              );
              let fileName = v4();
              await writeFaces(image, detections, fileName, faceMatchResult);
              const finalImage = await readFileAsync(
                path.resolve(__dirname, `./out/${fileName}.jpg`),
              );
              const uploadResponse = await upload(
                finalImage,
                `${fileName}.jpg`,
              );
              await axios.post(
                'https://camera-view.herokuapp.com/api/camera/events',
                {
                  snapshot: uploadResponse.Location,
                  date: format(Date.now(), 'yyyy-MM-dd'),
                  time: format(Date.now(), 'HH:mm:ss'),
                  faces: faceMatchResult
                    .map((faceMatch) => faceMatch.label)
                    .join(', '),
                },
              );
            } catch (error) {
              console.log(error);
            }
          } else {
            try {
              await axios.post(
                'https://camera-view.herokuapp.com/api/camera/events',
                { nothingChanged: 'nothing changed' },
              );
            } catch (error) {
              console.log(error);
            }
          }
        } else {
          try {
            await axios.post(
              'https://camera-view.herokuapp.com/api/camera/events',
              { nothingChanged: 'nothing changed' },
            );
          } catch (error) {
            console.log(error);
          }
        }
      } catch (err) {
        console.log(err);
      }
    });
  }, 2000);
})();
