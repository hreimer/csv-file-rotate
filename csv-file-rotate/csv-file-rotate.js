/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
    "use strict";
    const fs = require("fs-extra");
    const os = require("os");
    const path = require("path");
    const winston = require("winston");
    const dailyrotate = require("winston-daily-rotate-file");    
    const mkdirp = require('mkdirp');
    const env = process.env.NODE_ENV || "development";    

    const tsFormat = () => (new Date()).toLocaleTimeString();
    
    winston.setLevels(winston.config.npm.levels);
    winston.addColors(winston.config.npm.colors);

    function CSVFileRotateNode(n) {
        RED.nodes.createNode(this,n);
        this.filename = n.filename;
        this.filepath = n.filepath;
        var node = this;
        node.data = [];

        //start on file input
        this.on("input",function(msg) {
            //get filename and filepath
            var filename = node.filename || msg.csvfile.filename || "";
            var filepath = node.filepath || msg.csvfile.path || "";
            var fileextension = "csv"; //node.fileextension || "";

            //check if they are set
            if ((!node.filename) && (!node.tout)) {
                node.tout = setTimeout(function() {
                    node.status({fill:"grey",shape:"dot",text:filename});
                    clearTimeout(node.tout);
                    node.tout = null;
                },333);
            }
            //handle empty filenames/path
            if (filename === "") {
                node.warn(RED._("file.errors.nofilename"));
            } else if (filepath === ""){
                node.warn(RED._("file.errors.nopathname"));               
            } else if (msg.hasOwnProperty("payload") && (typeof msg.payload !== "undefined")) {
                var dir = path.dirname(filepath);
                
                //create folder for saving files
                mkdirp(dir, function(err){
                    if (err) {
                        node.error(RED._("file.errors.createfail",{error:err.toString()}),msg);
                    }

                    //construct logfile path
                    var logFilename = "_" + filename + "." + fileextension;
                    var fullpath = path.join(dir,logFilename);

                    //define console transport logging
                    const consoleTransport = new winston.transports.Console(
                        {
                            level: env === 'development' ? 'debug' : 'info',
                            timestamp: tsFormat,
                            colorize: true,
                            handleExceptions: true,
                            humanReadableUnhandledException: true
                        });
                    
                    //define the transport where the files are logged
                    const dailyRotateFileTransport = new winston.transports.DailyRotateFile(
                        {
                            filename: `${fullpath}`,
                            localTime: true,
                            datePattern: 'yyyy-MM-dd',
                            timestamp: false,
                            prepend: true,
                            json: false,
                            colorize: false,
                            showLevel: false,
                            level: env === 'development' ? 'debug' : 'debug',
                            maxsize: 1024 * 1024 * 10 // 10MB
                        });
                                                
                    //create logger with defined transports
                    const csvlogger = new(winston.Logger)({
                        transports: [
                            consoleTransport,
                            dailyRotateFileTransport
                        ],
                        exceptionHandlers: [
                            new winston.transports.File( {
                                filename: `${dir}/exceptions.log`
                            })
                        ],
                        exitOnError: false
                    });
                

                    //finally handle the input data
                    var data = msg.payload;
                    //convert objects to writable strings
                    if ((typeof data === "object") && (!Buffer.isBuffer(data))) {
                        data = JSON.stringify(data);
                    }
                    if (typeof data === "boolean") { data = data.toString(); }
                    if (typeof data === "number") { data = data.toString(); }
                    
                    //write data on the defined transports of the logger
                    csvlogger.debug(data);
                    //send out debug information when a message was successfully logged
                    /*dailyRotateFileTransport.on('logged', function (info) {
                        node.send(info);
                    });*/
                    csvlogger.on('logging', function (transport, level, msg, meta) {
                        node.send("logged:" + msg);
                    });
                    //in case of an error, also send the error to further debug
                    csvlogger.on('error', function (err) {
                        node.error(RED._("file.errors.unhandlederror",{error:err.toString()}),msg);
                        node.send(err);
                        
                    });
                });
            }
        });
        this.on('close', function() {
            if (node.tout) { clearTimeout(node.tout); }
            node.status({});
        });
    }
    RED.nodes.registerType("csv-file-rotate",CSVFileRotateNode);

}
