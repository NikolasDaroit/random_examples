import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import { exec } from "child_process";

import cuid from "cuid";
import snoowrap from "snoowrap";
import throat from "throat";
import mmm from "mmmagic";
import axios from "axios";
import termImg from "term-img";
import triangulate from "delaunay-triangulate";
import math from "mathjs";
import Delaunator from "delaunator";
import getBounds from "getboundingbox";

import * as cv from "opencv4nodejs";
import * as _fr from "face-recognition";

const Matrix = require("transformation-matrix-js").Matrix;

const fr = _fr.withCv(cv);

const TARGET_SUBREDDIT = process.argv[2];
const TARGET_EXAMPLES = 50;
const PER_PAGE = 100;
const COMPOSITE_INTERVAL = 50;
const IMAGE_SIZE = 400;

const eyecornerDst = [
  [Math.round(0.3 * IMAGE_SIZE), Math.round(IMAGE_SIZE / 3)],
  [Math.round(0.7 * IMAGE_SIZE), Math.round(IMAGE_SIZE / 3)],
];

const boundaryPts = [
  [0, 0],
  [IMAGE_SIZE / 2, 0],
  [IMAGE_SIZE - 1, 0],
  [IMAGE_SIZE - 1, IMAGE_SIZE / 2],
  [IMAGE_SIZE - 1, IMAGE_SIZE - 1],
  [IMAGE_SIZE / 2, IMAGE_SIZE - 1],
  [0, IMAGE_SIZE - 1],
  [0, IMAGE_SIZE / 2],
];

const r = new snoowrap({
  // redacted hard-coded credentials
});

r.config({
  continueAfterRatelimitError: true,
  debug: false,
});

const magic = new mmm.Magic(mmm.MAGIC_MIME_TYPE);
const MIMETYPES = ["image/jpeg", "image/png"];

class Exception {
  name = "Exception";

  constructor(message) {
    this.message = message;
  }

  toString() {
    return `> ${this.name}: "${this.message}"`;
  }
}

class ImageNotFoundException extends Exception {
  name = "ImageNotFoundException";
}

function wait(time) {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  });
}

async function imgcatMat(mat) {
  const path = `/tmp/${cuid()}.png`;
  await cv.imwriteAsync(path, mat.resizeToMax(200));
  await imgcat(path);
}

async function imgcatDebug(mat, name) {
  const path = `/debug/${name}.png`;
  await cv.imwriteAsync(path, mat.resizeToMax(200));
  await imgcat(path);
}

function imgcat(imgpath) {
  return new Promise((resolve, reject) => {
    exec(`imgcat ${imgpath}`, (err, stdout, stderr) => {
      console.log(stdout);
      resolve();
    });
  });
}

function rmdir(dirPath, removeSelf) {
  if (removeSelf === undefined) removeSelf = true;
  try {
    var files = fs.readdirSync(dirPath);
  } catch (e) {
    return;
  }
  if (files.length > 0)
    for (var i = 0; i < files.length; i++) {
      var filePath = dirPath + "/" + files[i];
      if (fs.statSync(filePath).isFile()) fs.unlinkSync(filePath);
      else rmdir(filePath);
    }
  if (removeSelf) fs.rmdirSync(dirPath);
}

function getFilePath(uri) {
  return `/raw/${path.basename(url.parse(uri).pathname)}`;
}

function toPoint2([x, y]) {
  return new cv.Point2(x, y);
}

function copyTriangleToImage(input, triImg, boundingRect) {
  const [col, row, cols, rows] = boundingRect;
  for (let curCol = col; curCol < col + ~~cols; curCol++) {
    for (let curRow = row; curRow < row + ~~rows; curRow++) {
      const inputVec = input.at(curRow, curCol);
      if (inputVec.x !== 0 || inputVec.y !== 0 || inputVec.z !== 0) continue;
      const triVec = triImg.at(curRow - row, curCol - col);
      input.set(curRow, curCol, inputVec.add(triVec));
    }
  }
  return input;
}

function rectContains(rect, point) {
  return (
    rect.x <= point[0] &&
    point[0] <= rect.x + rect.width &&
    rect.y <= point[1] &&
    point[1] <= rect.y + rect.height
  );
}

function constrainPoint(p, w, h) {
  return [
    Math.min(Math.max(p[0], 0), w - 1),
    Math.min(Math.max(p[1], 0), h - 1),
  ];
}

function boundingRect(points) {
  const { minX, minY, maxX, maxY } = getBounds(points);
  const width = Math.ceil(maxX - minX) === 0 ? 1 : Math.ceil(maxX - minX);
  const height = Math.ceil(maxY - minY) === 0 ? 1 : Math.ceil(maxY - minY);
  return [~~minX, ~~minY, width, height];
}

async function applyAffineTransform(src, srcTri, dstTri, size) {
  // Given a pair of triangles, find the affine transform.
  const srcPts = srcTri.map(toPoint2);
  const dstPts = dstTri.map(toPoint2);
  const warpMat = cv.getAffineTransform(srcPts, dstPts);

  // Apply the Affine Transform just found to the src image
  const dst = src.warpAffine(
    warpMat,
    new cv.Size(...size),
    cv.INTER_LINEAR,
    cv.BORDER_REFLECT_101
  );

  return dst;
}

// Warps and alpha blends triangular regions from img1 and img2 to img
async function warpTriangle(img1, img2, t1, t2) {
  // Find bounding rectangle for each triangle
  const r1 = boundingRect(t1);
  const r2 = boundingRect(t2);

  // Offset points by left top corner of the respective rectangles
  const t1Rect = [];
  const t2Rect = [];
  const t2RectInt = [];

  for (let i = 0; i < 3; i++) {
    t1Rect.push([t1[i][0] - r1[0], t1[i][1] - r1[1]]);
    t2Rect.push([t2[i][0] - r2[0], t2[i][1] - r2[1]]);
    t2RectInt.push([~~(t2[i][0] - r2[0]), ~~(t2[i][1] - r2[1])]);
  }

  // Get mask by filling triangle
  const mask = new cv.Mat(r2[3], r2[2], cv.CV_32FC3, [0, 0, 0]);
  mask.drawFillConvexPoly(t2RectInt.map(toPoint2), new cv.Vec(1, 1, 1), 16, 0);

  // Apply warpImage to small rectangular patches
  const img1Rect = img1.getRegion(new cv.Rect(...r1)).copy();

  const size = [r2[2], r2[3]];

  let img2Rect = await applyAffineTransform(img1Rect, t1Rect, t2Rect, size);
  img2Rect = img2Rect.resize(mask.rows, mask.cols).hMul(mask);

  return copyTriangleToImage(img2, img2Rect, r2);
}

function getLandmarkTriangles(points) {
  // Delaunay triangulation
  const dt = (() => {
    const result = [];
    const { triangles: dt } = new Delaunator(points);
    for (let i = 0; i < dt.length; i += 3) {
      result.push([dt[i], dt[i + 1], dt[i + 2]]);
    }
    return result;
  })();

  const tri = [];
  for (let j = 0; j < dt.length; j++) {
    const tin = [];

    for (let k = 0; k < 3; k++) {
      let pIn = points[dt[j][k]];
      pIn = constrainPoint(pIn, IMAGE_SIZE, IMAGE_SIZE);

      tin.push(pIn);
    }

    tri.push(tin.map(toPoint2));
  }

  return tri;
}

// faces arg: [facePath, landmarkPoints][]
async function averageFaces(faces, subreddit) {
  console.log("> Averaging faces...");
  const numFaces = faces.length;

  // initialize location of average points to 0,0
  const pointsAverage = Array.apply(
    null,
    Array(faces[0][1].length + boundaryPts.length)
  ).map(() => [0, 0]);

  const pointsNorm = [];
  const imagesNorm = [];
  const warpedFaces = [];

  for (let [facePath, landmarkPoints] of faces) {
    const points = landmarkPoints.concat(boundaryPts);
    for (let i = 0; i < points.length; i++) {
      for (let j = 0; j < 2; j++) {
        pointsAverage[i][j] = pointsAverage[i][j] + points[i][j] / numFaces;
      }
    }

    pointsNorm.push(points);
    imagesNorm.push((await cv.imreadAsync(facePath)).convertTo(cv.CV_32FC3));
  }

  // Delaunay triangulation
  const dt = (() => {
    const result = [];
    const { triangles: dt } = new Delaunator(pointsAverage);
    for (let i = 0; i < dt.length; i += 3) {
      result.push([dt[i], dt[i + 1], dt[i + 2]]);
    }
    return result;
  })();

  // output image
  let output = new cv.Mat(IMAGE_SIZE, IMAGE_SIZE, cv.CV_32FC3, [0, 0, 0]);

  // Warp input images to average image landmarks
  for (let i = 0; i < imagesNorm.length; i++) {
    // output original
    // await imgcatDebug(imagesNorm[i], `${subreddit}_original_${i}`);

    // if (i === 0) {
    //   await wait(1000);
    //   // output with original feature triangles
    //   const wOrigTri = imagesNorm[i].copy();
    //   const origTri = getLandmarkTriangles(pointsNorm[i]);
    //   wOrigTri.drawPolylines(origTri, true, new cv.Vec(0, 255, 0), 2);
    //   await imgcatDebug(wOrigTri, `${subreddit}_original_tri_${i}`);

    //   await wait(1000);
    //   const wAveragedTri = imagesNorm[i].copy();
    //   const averagedTri = getLandmarkTriangles(pointsAverage);
    //   wAveragedTri.drawPolylines(averagedTri, true, new cv.Vec(0, 255, 0), 2);
    //   await imgcatDebug(wAveragedTri, `${subreddit}_averaged_tri_${i}`);
    // }

    let img = new cv.Mat(IMAGE_SIZE, IMAGE_SIZE, cv.CV_32FC3, [0, 0, 0]);
    // Transform triangles one by one
    for (let j = 0; j < dt.length; j++) {
      const tin = [];
      const tout = [];

      for (let k = 0; k < 3; k++) {
        let pIn = pointsNorm[i][dt[j][k]];
        pIn = constrainPoint(pIn, IMAGE_SIZE, IMAGE_SIZE);

        let pOut = pointsAverage[dt[j][k]];
        pOut = constrainPoint(pOut, IMAGE_SIZE, IMAGE_SIZE);

        tin.push(pIn);
        tout.push(pOut);
      }

      img = await warpTriangle(imagesNorm[i], img, tin, tout);
    }

    // Add image intensities for averaging
    output = output.add(img);
    warpedFaces.push(img);

    console.log(`> Averaging Progress: [${i} / ${imagesNorm.length}]`);

    // if (i === 0) {
    //   await wait(1000);
    //   const wAveragedTri = img.copy();
    //   const averagedTri = getLandmarkTriangles(pointsAverage);
    //   wAveragedTri.drawPolylines(averagedTri, true, new cv.Vec(0, 255, 0), 2);
    //   await imgcatDebug(wAveragedTri, `${subreddit}_averaged_tri_warped_${i}`);
    // }

    // await wait(1000);
    // await imgcatDebug(img, `${subreddit}_warped_${i}`);

    // let debugOutput = new cv.Mat(IMAGE_SIZE, IMAGE_SIZE, cv.CV_32FC3, [
    //   0,
    //   0,
    //   0,
    // ]);
    // warpedFaces.forEach(f => {
    //   debugOutput = debugOutput.add(f);
    // });
    // debugOutput = debugOutput.div(warpedFaces.length);
    // await wait(1000);
    // await imgcatDebug(debugOutput, `${subreddit}_progress_${i}`);
  }

  // Divide by numImages to get average
  output = output.div(numFaces);

  const imagePath = `/composite/${subreddit}_${numFaces}.png`;
  await cv.imwriteAsync(imagePath, output);
  // await wait(1000);
  await imgcatMat(output.resize(200, 200));
}

function similarityTransform(inPts, outPts) {
  outPts = [...outPts];

  const s60 = Math.sin(60 * Math.PI / 180);
  const c60 = Math.cos(60 * Math.PI / 180);

  const xin =
    c60 * (inPts[0][0] - inPts[1][0]) -
    s60 * (inPts[0][1] - inPts[1][1]) +
    inPts[1][0];
  const yin =
    s60 * (inPts[0][0] - inPts[1][0]) +
    c60 * (inPts[0][1] - inPts[1][1]) +
    inPts[1][1];

  inPts.push([~~xin, ~~yin]);

  const xout =
    c60 * (outPts[0][0] - outPts[1][0]) -
    s60 * (outPts[0][1] - outPts[1][1]) +
    outPts[1][0];
  const yout =
    s60 * (outPts[0][0] - outPts[1][0]) +
    c60 * (outPts[0][1] - outPts[1][1]) +
    outPts[1][1];

  outPts.push([~~xout, ~~yout]);

  return cv.estimateAffinePartial2D(inPts.map(toPoint2), outPts.map(toPoint2));
}

async function extractFaces(imagePath, cvImg) {
  const image = fr.loadImage(imagePath);
  const detector = new fr.FrontalFaceDetector();
  const predictor = fr.FaceLandmark68Predictor();

  const faceRects = await detector.detect(image);

  const faceShapes = [];
  for (let rect of faceRects) {
    const shape = await predictor.predictAsync(image, rect);
    faceShapes.push(shape);
  }

  const warpedImages = faceShapes
    .map(shape => {
      const parts = shape.getParts();

      const leye = parts[36];
      const reye = parts[45];

      const angle = (() => {
        const eyeXdis = reye.x - leye.x;
        const eyeYdis = reye.y - leye.y;
        const angle = Math.atan(eyeYdis / eyeXdis);
        return angle * 180 / Math.PI;
      })();

      if (angle > 10 || angle < -10) {
        return null;
      }

      const xDistance = reye.x - leye.x;
      if (xDistance < 60) return null;

      const eyepts = [[leye.x, leye.y], [reye.x, reye.y]];
      const tform = similarityTransform(eyepts, eyecornerDst);

      const warpedImage = cvImg.warpAffine(
        tform.out,
        new cv.Size(IMAGE_SIZE, IMAGE_SIZE)
      );

      const points = parts.map(({ x, y }) => ({
        x,
        y,
      }));

      const transform = (() => {
        const tempTform = tform.out.getDataAsArray();
        const result = [];
        for (let i = 0; i < 3; i++) {
          result.push(tempTform[0][i]);
          result.push(tempTform[1][i]);
        }
        return result;
      })();

      const tformMatrix = Matrix.from(...transform);
      const landmarks = tformMatrix
        .applyToArray(points)
        .map(({ x, y }) => [x, y]);

      return [warpedImage, landmarks];
    })
    .filter(t => !!t);

  return warpedImages;
}

async function readImage(imagePath) {
  const im = await cv.imreadAsync(imagePath);

  const rows = im.rows;
  const cols = im.cols;

  const newDim = 1000;
  if (rows > 750 || cols > 750) {
    const largerDim = rows > cols ? "rows" : "cols";
    if (rows > cols) {
      // resize based on rows
      const ratio = newDim / rows;
      const newCols = cols * ratio;
      im.resize(newDim, ~~newCols);
    } else {
      // resize based on cols
      const ratio = newDim / cols;
      const newRows = rows * ratio;
      im.resize(~~newRows, newDim);
    }
  }

  return im;
}

async function downloadAndValidateImage(url, filename) {
  let response;
  try {
    response = await axios({ method: "get", url, responseType: "stream" });
  } catch (err) {
    throw new Exception(`Failed to fetch ${url}`);
  }

  return new Promise((resolve, reject) => {
    response.data
      .pipe(fs.createWriteStream(filename))
      .on("error", err => reject(new Exception("Failed to save image")))
      .on("close", err => {
        if (err) return reject(new Exception("Failed to save image"));

        magic.detectFile(filename, (err, result) => {
          if (err) return reject(new Exception("Failed to detect mimetype"));

          if (MIMETYPES.includes(result)) {
            setTimeout(() => resolve(filename), 100);
          } else {
            return reject(new Exception(`Invalid mimetype: ${result}`));
          }
        });
      });
  });
}

async function getImageFromPost(post) {
  let imageURL = post.url;

  if (imageURL.includes("imgur")) imageURL += ".png";

  if (imageURL == null && post.preview != null) {
    imageURL = post.preview.images[0].source.url;
  }

  if (imageURL == null) {
    throw new ImageNotFoundException(`No image found in post: ${post.title}`);
  }

  return imageURL;
}

async function scrapeSubreddit(subreddit) {
  const subredditDisplay = `/r/${subreddit}`;
  const compositeDir = `/composite/${subreddit}`;

  let faces = [];
  let listing = { isFinished: false };

  while (faces.length < TARGET_EXAMPLES && !listing.isFinished) {
    if (listing.length == null) {
      console.log(
        `\n\n=============== ${subredditDisplay} ===============\n\n`
      );
      listing = await r
        .getSubreddit(subreddit)
        .getTop({ limit: PER_PAGE, time: "all" });
    } else {
      console.log(`> Fetching more posts for ${subredditDisplay}`);
      listing = await listing.fetchMore({ amount: PER_PAGE, append: false });
    }

    faces = await listing.reduce(async (acc, post) => {
      const accFaces = await acc;

      const faceCount = accFaces.length;
      if (faceCount >= TARGET_EXAMPLES) return accFaces;

      const iterationResult = [];
      try {
        const imageURL = await getImageFromPost(post);
        const rawImageTargetPath = getFilePath(imageURL);

        await downloadAndValidateImage(imageURL, rawImageTargetPath);

        const rawImage = await readImage(rawImageTargetPath);
        const croppedFaces = await extractFaces(rawImageTargetPath, rawImage);

        for (let [face, landmarks] of croppedFaces) {
          const imagePath = `/tmp/${cuid()}.png`;
          await cv.imwriteAsync(imagePath, face);
          iterationResult.push([imagePath, landmarks]);
          await imgcatMat(face.resize(200, 200));
        }
      } catch (err) {
        console.error(`${err}`);
      }

      const newResult = accFaces.concat(iterationResult);
      if (newResult.length !== faceCount) {
        console.log(`> Progress: [${newResult.length} / ${TARGET_EXAMPLES}]`);
        if (
          Math.floor(faceCount / COMPOSITE_INTERVAL) !==
          Math.floor(newResult.length / COMPOSITE_INTERVAL)
        ) {
          await averageFaces(newResult, subreddit);
        }
      }

      return newResult;
    }, Promise.resolve(faces));
  }

  // await averageFaces(faces);
}

(async () => {
  try {
    const compositeDir = `/composite`;
    // rmdir(compositeDir, false);
    rmdir("/processed", false);
    rmdir("/raw", false);
    await scrapeSubreddit(TARGET_SUBREDDIT);
    console.log(`> Finished creating average face for /r/${TARGET_SUBREDDIT}`);
    process.exit(0);
  } catch (err) {
    console.error(`> Uncaught Exception: ${err.message}`, err);
    process.exit(1);
  }
})();