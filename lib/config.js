/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2015, Joyent, Inc.
 */

module.exports = {
	parse: parse
};

var fs = require('fs');
var path = require('path');
var jsprim = require('jsprim');

var SCHEMA = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'config-schema.json')));

function parse(filename) {
	if (!fs.existsSync(filename)) {
		console.error('Config file not found: ' + filename);
		process.exit(1);
	}

	var config = JSON.parse(fs.readFileSync(filename));

	var err = jsprim.validateJsonObject(SCHEMA, config);

	if (err !== null) {
		console.error('Failed to parse config.json: ' +
		    err.name + ': ' + err.message);
		process.exit(2);
	}

	return (config);
}