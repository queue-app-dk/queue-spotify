const express = require("express");
const Sentry = require("@sentry/node");
const { request } = require("graphql-request");
const moment = require("moment");
const bodyParser = require("body-parser");

const CronJob = require("cron").CronJob;
const graphqlServer = process.env.graphQLServer || "http://localhost:4000";

const app = express();
Sentry.init({
  dsn:
    process.env.SENTRY_URL ||
    "https://c76903c997a344edae1eb8199e8591de@o388984.ingest.sentry.io/5226573"
});

// The request handler must be the first middleware on the app
app.use(Sentry.Handlers.requestHandler());

app.use(bodyParser.json({ type: "application/json" }));

// All controllers should live below here

//Cron job that creates song timer, and checks Spotify for staying in sync

const PLAY_SONG = `mutation playSong($partyId: ID!) {
    playSong(partyId: $partyId) {
      success
    }
  }`;

const CHECK_PLAYBACK_STATUS = `mutation playbackStatus($partyId: ID!, $songId: ID!, $savedProgress: Int!) {
      playbackStatus(partyId: $partyId, songId: $songId, savedProgress: $savedProgress) {
        stop
      }
    }`;

function createSongTimer(partyId, duration, progress, songId, device) {
  let newProgress = progress;
  if (progress > duration) {
    newProgress = duration;
  }

  const songJob = new CronJob(
    moment().add(duration - newProgress, "seconds"),
    async () => {
      statusJob.stop();
      const { stop } = await checkStatus(partyId, songId, newProgress);
      if (!stop) {
        try {
          const newSong = await playSong(partyId);
          if (newSong) {
            songJob.stop();
          }
        } catch (err) {
          statusJob.start();
          Sentry.captureException(err);
        }
      }

      if (stop) {
        statusJob.stop();
        songJob.stop();
      }
    },
    null,
    true,
    "Europe/Copenhagen"
  );

  const statusJob = new CronJob(
    "0/10 * * * * *",
    async () => {
      const { stop } = await checkStatus(partyId, songId, newProgress);
      if (stop) {
        songJob.stop();
        statusJob.stop();
      }
    },
    null,
    false,
    "Europe/Copenhagen"
  );

  //To avoid race condition, if song is paused + unpaused, right
  //before skip, and this timer will start checkStatus after it has been
  //stopped by songJob
  if (duration - newProgress > 5) {
    setTimeout(() => {
      statusJob.start();
    }, 5000);
  }
}

async function checkStatus(partyId, songId, progress) {
  const variables = { partyId, songId, savedProgress: progress };
  try {
    const result = await request(
      graphqlServer,
      CHECK_PLAYBACK_STATUS,
      variables
    );
    return { stop: result.playbackStatus.stop };
  } catch (err) {
    Sentry.captureException(err);
    return { stop: true };
  }
}

async function playSong(partyId) {
  const variables = { partyId };
  try {
    return request(graphqlServer, PLAY_SONG, variables);
  } catch (err) {
    Sentry.captureException(err);
    throw err;
  }
}

app.post("/startSong", (req, res, next) => {
  const { partyId, duration, progress, songId, device } = req.body;
  createSongTimer(partyId, duration, progress, songId, device);
  res.status(200).end();
});

//Listen for user un-pausing spotify from Spotify instead of Queue

const LISTEN_PAUSED = `mutation listeningPaused($partyId: ID!) {
      listeningPaused(partyId: $partyId) {
        stop
      }
    }`;

function createListenPausedTimer(partyId) {
  const pausedJob = new CronJob(
    "0/10 * * * * *",
    async () => {
      const { stop } = await checkPaused(partyId);
      if (stop) {
        checkTimeout.stop();
        pausedJob.stop();
      }
    },
    null,
    true,
    "Europe/Copenhagen"
  );

  const checkTimeout = new CronJob(
    moment().add(15, "minutes"),
    async () => {
      pausedJob.stop();
      checkTimeout.stop();
    },
    null,
    true,
    "Europe/Copenhagen"
  );
}

async function checkPaused(partyId) {
  const variables = { partyId };
  try {
    const result = await request(graphqlServer, LISTEN_PAUSED, variables);
    return { stop: result.listeningPaused.stop };
  } catch (err) {
    Sentry.captureException(err);
    return { stop: true };
  }
}

app.post("/listenPaused", (req, res, next) => {
  const { partyId } = req.body;
  createListenPausedTimer(partyId);
  res.status(200).end();
});

//Listen for active devices

const LISTEN_ACTIVE_DEVICES = `query searchDevices($partyId: ID!, $stop: Boolean!) {
      searchDevices(partyId: $partyId, stop: $stop) {
        id
        type
      }
    }`;

const INITIAL_PLAY_SONG = `mutation initialPlaySong($partyId: ID!, $device: JSON!, $startedAgain: Boolean) {
        initialPlaySong(partyId: $partyId, device: $device, startedAgain: $startedAgain) {
          success
        }
      }`;

function createListenDevicesTimer(partyId, startedAgain) {
  let stop = false;

  const listenJob = new CronJob(
    "* * * * * *",
    async () => {
      const { device } = await checkDevices(partyId, stop);
      if (device && device.id) {
        try {
          const playedSong = await initialPlaySong(
            partyId,
            device,
            startedAgain
          );
          if (playedSong) {
            checkTimeout.stop();
            listenJob.stop();
          }
        } catch (err) {
          //Make sure that if it timeouts on server (can't play on Spotify),
          //that it restarts searching devices
          stop = true;
          const { device } = await checkDevices(partyId, stop);
          Sentry.captureException(err);

          checkTimeout.stop();
          listenJob.stop();
        }
      }
    },
    null,
    true,
    "Europe/Copenhagen"
  );

  const checkTimeout = new CronJob(
    moment().add(2, "minutes"),
    async () => {
      listenJob.stop();
      stop = true;
      const { device } = await checkDevices(partyId, stop);
      checkTimeout.stop();
    },
    null,
    true,
    "Europe/Copenhagen"
  );
}

async function checkDevices(partyId, stop) {
  const variables = { partyId, stop };
  try {
    const result = await request(
      graphqlServer,
      LISTEN_ACTIVE_DEVICES,
      variables
    );
    return { device: result.searchDevices };
  } catch (err) {
    Sentry.captureException(err);
    return { device: null };
  }
}

async function initialPlaySong(partyId, device, startedAgain) {
  const variables = { partyId, device, startedAgain };
  try {
    return request(graphqlServer, INITIAL_PLAY_SONG, variables);
  } catch (err) {
    Sentry.captureException(err);
    throw err;
  }
}

app.post("/listenDevices", (req, res, next) => {
  const { partyId, startedAgain } = req.body;
  createListenDevicesTimer(partyId, startedAgain);
  res.status(200).end();
});

// The error handler must be before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());

// Optional fallthrough error handler
app.use(function onError(err, req, res, next) {
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  res.statusCode = 500;
  res.end(res.sentry + "\n");
});

app.listen(process.env.PORT || 8080, process.env.ADDR || "0.0.0.0", () => {
  console.log(
    `Server started on ${process.env.ADDR || "0.0.0.0"}:${process.env.PORT ||
      8080}`
  );
});
