const SdtdApi = require('7daystodie-api-wrapper');
const EventEmitter = require('events');
const handleLogLine = require('./handleLogLine');

var sevenDays = require('machinepack-7daystodiewebapi');

class LoggingObject extends EventEmitter {

  constructor(ip, port, authName, authToken, serverId, intervalTime = 2000) {
    super();
    this.server = {
      id: serverId,
      ip: ip,
      port: port,
      adminUser: authName,
      adminToken: authToken,
    };
    this.intervalTime = intervalTime;
    this.requestInterval;
    this.init();
  }

  async init() {

    // Get the latest log line
    let webUIUpdate;
    let lastLogLine;
    try {
      webUIUpdate = await SdtdApi.getWebUIUpdates(this.server);
      lastLogLine = webUIUpdate.newlogs;

    } catch (error) {
      sails.log.debug(`Error when getting logs for server with ip ${this.server.ip} - ${error}`);
    }

    let failed = false;
    // Get new logs in a timed interval
    this.requestInterval = setInterval(async () => {
      let newLogs = {};

      if (failed) {
        try {
          webUIUpdate = await SdtdApi.getWebUIUpdates(this.server);
          lastLogLine = webUIUpdate.newlogs;
          failed = false;
        } catch (error) {
          //sails.log.debug(`Error when getting logs for server with ip ${this.server.ip} - ${error}`);
        }

      }

      try {
        newLogs = await SdtdApi.getLog(this.server, lastLogLine);
      } catch (error) {
        //sails.log.debug(`Error when getting logs for server with ip ${this.server.ip} - ${error}`);
        failed = true;
        newLogs.entries = [];
      }

      _.each(newLogs.entries, async line => {
        let parsedLogLine = handleLogLine(line);


        if (parsedLogLine) {
          if (parsedLogLine.type === "memUpdate") {
            let currentDate = Date.now();
            let lastMemUpdate = await sails.helpers.redis.get(`server:${this.server.id}:lastMemUpdate`);
            lastMemUpdate = new Date(parseInt(lastMemUpdate));
            lastMemUpdate = lastMemUpdate.valueOf();
            await sails.helpers.redis.set(`server:${this.server.id}:lastMemUpdate`, currentDate);
            if (currentDate < lastMemUpdate + 25000) {
              sails.log.warn(`Detected memUpdate happening too soon for server ${this.server.id} - discarding event at ${line.date} ${line.time}`);
              return;
            }

          }
          this.emit(parsedLogLine.type, parsedLogLine.data);
        }

      });

      lastLogLine = newLogs.lastLine;
    }, this.intervalTime)

  }

}

module.exports = LoggingObject;
