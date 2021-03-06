/*
 * grunt-sentry-files
 * https://github.com/sundarasan/grunt-sentry-release
 *
 * Copyright (c) 2016 Sundarasan
 */

'use strict';
var grunt,
  request = require('request-promise'),
  fs = require('fs'),
  Promise = require('bluebird'),
  path = require('path');

/**
 * ---------------
 * Sentry API URLs
 * ---------------
 */
function SentryUrl (params) {
  params || (params = {});
  params.organisation && this.setOrganisationName(params.organisation);
  params.project && this.setProjectName(params.project);
  params.authorisationToken && this.setAuthorisationToken(params.authorisationToken);

  this._domain = params.domain || 'sentry.io';
  return this;
}

SentryUrl.prototype = {

  API_VERSION: 0,

  setOrganisationName: function (organistaionName) {
    return (this._organisationName = organistaionName);
  },

  getOrganisationName: function () {
    return this._organisationName;
  },

  setProjectName: function (projectName) {
    return (this._projectName = projectName);
  },

  getProjectName: function () {
    return this._projectName;
  },

  setAuthorisationToken: function (authorisationToken) {
    return (this._authorisationToken = authorisationToken);
  },

  getAuthorisationToken: function () {
    return this._authorisationToken;
  },

  getAPIBaseUrl: function () {
    return 'https://' + this._domain + '/api/' + this.API_VERSION;
  },

  getProjectUrl: function () {
    return this.getAPIBaseUrl() + '/projects';
  },

  getReleaseUrl: function () {
    return this.getProjectUrl() + '/' + this.getOrganisationName() + '/' + this.getProjectName() + '/releases/';
  },

  getReleaseFilesUrl: function (releaseId) {
    return this.getReleaseUrl() + releaseId + '/files/';
  },

  getAuthorisationHeaders: function () {
    return {
      'Authorization': 'Bearer ' + this.getAuthorisationToken(),
    };
  },

};

/**
 * ------------------
 * Sentry API Helpers
 * ------------------
 */
function SentryUploader (params) {
  params || (params = {});
  Helpers.bindAll(this, 'uploadFile');
  this.releaseId = params.releaseId;
  this.files = params.files || [];
  this.sentryUrl = new SentryUrl(params);
  
  // Optional parameters
  if(params.refs) {
    this.refs = params.refs;
  }
  if(params.projects) {
    this.projects = params.projects
  }
  return this;
};

SentryUploader.prototype = {

  createReleaseAndUploadFiles: function () {
    var self = this;
    // Default body parameters
    var params = {
      version: this.releaseId
    };
    // We check if we have any of the optional parameters
    if(this.refs) {
      params['refs'] = this.refs;
    }
    if(this.projects) {
      params['projects'] = this.projects;
    }
    return this.createRelease(params).then(function (releaseResponse) {
      self.releaseId = releaseResponse.version;
      grunt.log.writeln('ReleaseID: '.bold + '"' + self.releaseId + '"');
      return self.uploadFiles();
    });
  },

  createRelease: function (body) {
    var self = this,
      headers = this.sentryUrl.getAuthorisationHeaders();
    headers['Content-Type'] = 'application/json';
    
    return request.post({
      uri: this.sentryUrl.getReleaseUrl(),
      headers: headers,
      body: body,
      json: true,
    });
  },

  uploadFiles: function () {
    return Promise.each(this.files, this.uploadFile);
  },

  uploadFile: function (artifactObject) {
    var self = this;
    grunt.log.writeln('UPLOADING: File: '.bold + '"' + artifactObject.file + '"');
    return request.post({
      url: this.sentryUrl.getReleaseFilesUrl(this.releaseId),
      headers: this.sentryUrl.getAuthorisationHeaders(),
      formData: {
        name: artifactObject.name,
        file: fs.createReadStream(path.resolve(process.cwd(), artifactObject.file)),
      },
      json: true,
    });
  },

};

/**
 * -------
 * Helpers
 * -------
 */
var Helpers = {

  /**
   * Binds the method with given context
   */
  bindAll: function () {
    var index,
      argumentsArray = Array.prototype.slice.apply(arguments),
      context = argumentsArray[0],
      functionName,
      functionNames = argumentsArray.slice(1);

    for (index in functionNames) {
      functionName = functionNames[index];
      if (typeof(context[functionName]) === 'function') {
        (function (context, functionName) {
          var actualFunction = context[functionName];
          if (actualFunction.bindContext !== context) {
            context[functionName] = function () {
              return actualFunction.apply(context, arguments);
            };
            context[functionName].bindContext = context;
          }
        })(context, functionName);
      } else {
        grunt.log.error('"' + functionName + '" is not a function');
      }
    }
  },

};


module.exports = function(gruntArg) {

  // Please see the Grunt documentation for more information regarding task
  // creation: http://gruntjs.com/creating-tasks
  grunt = gruntArg;
  
  grunt.registerMultiTask('sentry_files', 'Creates release and uploads artifacts to Sentry', function() {
    var done = this.async(),
      sentryUploader;

    var params = {
      domain: this.data.domain,
      organisation: this.data.organisation,
      authorisationToken: this.data.authorisationToken,
      project: this.data.project,
      releaseId: this.data.releaseId,
      files: this.data.files,
    };
   
    // Check for any of the optional parameters
    if(this.data.refs) {
      params['refs'] = this.data.refs;
    }
    if(this.data.projects) {
      params['projects'] = this.data.projects; 
    }
    sentryUploader = new SentryUploader(params);

    return sentryUploader.createReleaseAndUploadFiles().then(function () {
      done();
    }).catch(function (err) {
      done(err || new Error('Error while trying to create release and upload files.'));
    });

  });

};
