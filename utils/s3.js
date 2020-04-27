import AWS from 'aws-sdk';

AWS.config.credentials = new AWS.SharedIniFileCredentials({
  profile: 'default',
});

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_KEY,
  secretAccessKey: process.env.AWS_SECRET,
});

export default function upload(file, filename) {
  return new Promise((resolve, reject) => {
    s3.upload(
      {
        ACL: 'public-read',
        Body: file,
        Bucket: process.env.AWS_BUCKET,
        ContentType: 'image/jpeg',
        Key: filename,
      },
      (err, data) => (err ? reject(err) : resolve(data)),
    );
  });
}
