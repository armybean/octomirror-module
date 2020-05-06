/* global Module */
/* jshint esversion: 6 */

/* Magic Mirror
 * Module: OctoMirror-Module
 *
 * By Kieran Ramnarine
 * MIT Licensed.
 */

Module.register("octomirror-module", {
    defaults: {
        updateInterval: 60 * 1000,
        retryDelay: 2500,
        printerName: "",
        showStream: true,
        showTemps: true,
        showDetailsWhenOffline: true,
        interactive: true, // Set to false to hide the file drop down and only show the stream.
        debugMode: false, // Set to true to log all messages from OctoPrint Socket
    },

    //Override dom generator.
    getDom: function () {
        let self = this;
        let wrapper = document.createElement("div");

        if (this.config.showStream) {
            let stream = document.createElement("img");
            stream.src = this.config.streamUrl ? this.config.streamUrl : this.config.url + ":8080/?action=stream";
            wrapper.appendChild(stream);
        }

        if (this.config.interactive) {
            let fileMenu = document.createElement("div");
            let fileList = document.createElement("select");
            for (let f in this.files) {
                let option = document.createElement("option");
                option.setAttribute("value", this.files[f]);
                option.appendChild(document.createTextNode(this.files[f]));
                fileList.appendChild(option);
            }
            let printButton = document.createElement("button");
            printButton.appendChild(document.createTextNode("Send to Printer"));
            printButton.addEventListener("click", function () {
                self.sendPrint(fileList.value);
            });
            let fileUpload = document.createElement("div");
            let uploadFileInput = document.createElement("input");
            uploadFileInput.setAttribute("type", "file");
            let uploadButton = document.createElement("button");
            uploadButton.appendChild(document.createTextNode("Upload Files"));
            uploadButton.addEventListener("click", function () {
                self.uploadFile(uploadFileInput.value);
            });
            fileUpload.appendChild(uploadFileInput);
            fileUpload.appendChild(uploadButton);
            fileMenu.appendChild(fileList);
            fileMenu.appendChild(printButton);
            fileMenu.appendChild(fileUpload);
            wrapper.appendChild(fileMenu);
        }

        let infoWrapper = document.createElement("div");
        infoWrapper.className = "small";
        if (this.config.printerName === "") {
            infoWrapper.innerHTML = "";
        } else {
            infoWrapper.innerHTML = `<span id="opPrinterName" class="title bright">${this.config.printerName}</span><br>`;
        }
        infoWrapper.innerHTML += `<span>${this.translate("STATE")}: </span><span id="opStateIcon"></span> <span id="opState" class="title bright"> </span>
                <br>
                <div id="opMoreInfo">
                <span>${this.translate("FILE")}: </span><span id="opFile" class="title bright">N/A</span>
                <br>
                <span>${this.translate("ELAPSED")}: </span><span id="opPrintTime" class="title bright">N/A</span>
                <span> | ${this.translate("REMAINING")}: </span><span id="opPrintTimeRemaining" class="title bright">N/A</span>
                <span> | ${this.translate("PERCENT")}: </span><span id="opPercent" class="title bright">N/A</span>
                <br>
                <span>${this.translate("TEMPS")}:</span>
                <span>${this.translate("NOZZLE")}:</span> <span id="opNozzleTemp" class="title bright">N/A</span> <span class="xsmall">(<span id="opNozzleTempTgt">N/A</span>)</span> | 
                <span>${this.translate("BED")}:</span> <span id="opBedTemp" class="title bright">N/A</span> <span class="xsmall">(<span id="opBedTempTgt">N/A</span>)</span>
                </div>
                `;

        wrapper.appendChild(infoWrapper);
        return wrapper;
    },

    start: function () {
        Log.info("Starting module: " + this.name);
        this.files = [];
        this.loaded = false;
        if (this.config.interactive) {
            this.scheduleUpdate(this.config.initialLoadDelay);
        }
        this.updateTimer = null;

        this.opClient = new OctoPrintClient();
        this.opClient.options.baseurl = this.config.url;
        this.opClient.options.apikey = this.config.api_key;
    },

    initializeSocket: function () {
        let self = this;
        let user = "_api", session = "";

        fetch(self.config.url + "/api/login", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': self.config.api_key
            },
            body: JSON.stringify({passive: true})
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                if (self.config.debugMode) {
                    console.log("Octoprint login response:", data);
                }
                session = data.session;
                // Subscribe to live push updates from the server
                self.opClient.socket.connect();
            });

        self.opClient.socket.onMessage("connected", message => {
            self.opClient.socket.socket.send(JSON.stringify({auth: `${user}:${session}`}));
        });

        if (self.config.debugMode) {
            self.opClient.socket.onMessage("*", message => {
                // Reference: http://docs.octoprint.org/en/master/api/push.html#sec-api-push-datamodel-currentandhistory
                console.log("Octoprint", message);
            });
        }

        self.opClient.socket.onMessage("history", message => {
            self.updateData(message.data);
        });

        self.opClient.socket.onMessage("current", message => {
            self.updateData(message.data);
        });
    },

    getScripts: function () {
        return [
            this.file('jquery.min.js'),
            this.file('lodash.min.js'),
            this.file('sockjs.min.js'),
            this.file('packed_client.js'),
        ];
    },

    getTranslations: function () {
        return {
            en: "translations/en.json",
            de: "translations/de.json",
            fr: "translations/fr.json",
        };
    },

    processFiles: function (data) {
        this.files = [];
        for (let x in data.files) {
            this.files.push(data.files[x].name);
        }
        this.show(this.config.animationSpeed, {lockString: this.identifier});
        this.loaded = true;
        this.updateDom(this.config.animationSpeed);
    },

    scheduleUpdate: function (delay) {
        let nextLoad = this.config.updateInterval;
        if (typeof delay !== "undefined" && delay >= 0) {
            nextLoad = delay;
        }

        let self = this;
        clearTimeout(self.updateTimer);
        self.updateTimer = setTimeout(function () {
            self.updateFiles();
        }, nextLoad);
    },

    updateFiles: function () {
        let self = this;
        self.opClient.files.list()
            .done(function (response) {
                self.processFiles(response);
            });
    },

    sendPrint: function (filename) {
        this.opClient.files.select("local", filename, true);
    },

    uploadFile: function (file) {
        let self = this;
        self.opClient.files.upload("local", file)
            .done(function (response) {
                self.updateFiles();
            });
    },

    showElement: function (elem) {
        elem.style.display = 'block';
    },

    hideElement: function (elem) {
        elem.style.display = 'none';
    },

    updateData: function (data) {
        if (this.config.debugMode) {
            console.log("Updating OctoPrint Data");
        }
        document.getElementById('opState').textContent = (data.state.text.startsWith("Offline (Error: ")) ? this.translate("OFFLINE") : data.state.text;
        let icon = document.getElementById('opStateIcon');
        if (data.state.flags.printing) {
            icon.innerHTML = `<i class="fa fa-print" aria-hidden="true" style="color:green;"></i>`;
            if (!this.config.showDetailsWhenOffline) {
                this.showElement(document.getElementById('opMoreInfo'));
            }
        } else if (data.state.flags.closedOrError) {
            icon.innerHTML = `<i class="fa fa-exclamation-triangle" aria-hidden="true" style="color:red;"></i>`;
            if (!this.config.showDetailsWhenOffline) {
                this.hideElement(document.getElementById('opMoreInfo'));
            }
        } else if (data.state.flags.paused) {
            icon.innerHTML = `<i class="fa fa-pause" aria-hidden="true" style="color:yellow;"></i>`;
            if (!this.config.showDetailsWhenOffline) {
                this.showElement(document.getElementById('opMoreInfo'));
            }
        } else if (data.state.flags.error) {
            icon.innerHTML = `<i class="fa fa-exclamation-triangle" aria-hidden="true" style="color:red;"></i>`;
            if (!this.config.showDetailsWhenOffline) {
                this.hideElement(document.getElementById('opMoreInfo'));
            }
        } else if (data.state.flags.ready) {
            icon.innerHTML = `<i class="fa fa-check-circle" aria-hidden="true" style="color:green;"></i>`;
            if (!this.config.showDetailsWhenOffline) {
                this.showElement(document.getElementById('opMoreInfo'));
            }
        } else if (data.state.flags.operational) {
            icon.innerHTML = `<i class="fa fa-check-circle" aria-hidden="true" style="color:green;"></i>`;
            if (!this.config.showDetailsWhenOffline) {
                this.showElement(document.getElementById('opMoreInfo'));
            }
        }

        document.getElementById('opFile').textContent = data.job.file.name ? data.job.file.name : "N/A";
        document.getElementById('opPrintTime').textContent = data.progress.printTime ? data.progress.printTime.toHHMMSS() : "N/A";
        document.getElementById('opPrintTimeRemaining').textContent = data.progress.printTimeLeft ? data.progress.printTimeLeft.toHHMMSS() : "N/A";
        document.getElementById('opPercent').textContent = data.progress.completion ? Math.round(data.progress.completion) + " %" : "N/A";

        if (this.config.showTemps) {
            if (data.temps.length) {
                let temps = data.temps[data.temps.length - 1];
                if (typeof temps.bed === "undefined") { // Sometimes the last data point is time only, so back up 1.
                    temps = data.temps[data.temps.length - 2];
                }

                document.getElementById('opNozzleTemp').innerHTML = temps.tool0.actual ? temps.tool0.actual.toFixed(1) + " &deg;C" : "N/A";
                document.getElementById('opNozzleTempTgt').innerHTML = temps.tool0.target ? Math.round(temps.tool0.target) + " &deg;C" : "N/A";
                document.getElementById('opBedTemp').innerHTML = temps.bed.actual ? temps.bed.actual.toFixed(1) + " &deg;C" : "N/A";
                document.getElementById('opBedTempTgt').innerHTML = temps.bed.target ? Math.round(temps.bed.target) + " &deg;C" : "N/A";
            }
        }
    },

    notificationReceived: function (notification, payload, sender) {
        if (notification === 'DOM_OBJECTS_CREATED') {
            this.initializeSocket();
            this.scheduleUpdate(1);
        }
    }
});

Number.prototype.toHHMMSS = function () {
    let seconds = Math.floor(this),
        hours = Math.floor(seconds / 3600);
    seconds -= hours * 3600;
    let minutes = Math.floor(seconds / 60);
    seconds -= minutes * 60;

    let time = "";

    if (hours !== 0) {
        time = hours + ":";
    }
    if (minutes !== 0 || time !== "") {
        minutes = (minutes < 10 && time !== "") ? "0" + minutes : String(minutes);
        time += minutes + ":";
    }
    if (time === "") {
        time = seconds + "s";
    } else {
        time += (seconds < 10) ? "0" + seconds : String(seconds);
    }
    return time;
};
