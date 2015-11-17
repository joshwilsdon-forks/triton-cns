/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) 2015, Joyent, Inc.
 */

module.exports = FlagFilter;

var stream = require('stream');
var util = require('util');
var assert = require('assert-plus');
var utils = require('./utils');
var bunyan = require('bunyan');

var consts = require('./consts');
var SERVICES_TAG = consts.SERVICES_TAG;
var USER_EN_FLAG = consts.USER_EN_FLAG;
var INST_EN_FLAG = consts.INST_EN_FLAG;
var INST_EN_TAG = consts.INST_EN_TAG;

/*
 * The FlagFilter transform stream takes in a VM object that has been annotated
 * with "owner" and "server" objects (by UfdsFilter, CnFilter and NetFilter),
 * and determines whether the object will result in the addition or removal of
 * DNS records.
 *
 * It also processes the SERVICES_TAG metadata to decide which services the
 * given VM record will be listed in. This is not so easy to decouple, as
 * some flags will result in the services list being emptied without the whole
 * VM being removed from DNS.
 */
function FlagFilter(opts) {
	assert.object(opts, 'options');

	assert.optionalObject(opts.log, 'options.log');
	var log = opts.log || bunyan.createLogger({name: 'cns'});
	this.log = log.child({stage: 'FlagFilter'});

	var xformOpts = {
		readableObjectMode: true,
		writableObjectMode: true
	};
	stream.Transform.call(this, xformOpts);
}
util.inherits(FlagFilter, stream.Transform);

FlagFilter.prototype._transform = function (vm, enc, cb) {
	assert.object(vm, 'vm');
	assert.object(vm.owner, 'vm.owner');
	assert.object(vm.server, 'vm.server');
	assert.string(vm.uuid, 'vm.uuid');
	assert.object(vm.tags, 'vm.tags');
	assert.object(vm.customer_metadata, 'vm.customer_metadata');

	vm.services = [];
	if (vm.tags && vm.tags[SERVICES_TAG] !== undefined) {
		var svcs = vm.tags[SERVICES_TAG].split(',');
		svcs.forEach(function (svcTag) {
			/*
			 * For future-proofing purposes, we grab just the part
			 * before the first colon of the tag. If we need to add
			 * options in future they will be after this colon.
			 */
			svcTag = svcTag.trim().split(':');
			vm.services.push(svcTag[0]);
		});
	}

	if (vm.customer_metadata[INST_EN_FLAG] !== undefined &&
	    vm.customer_metadata[INST_EN_FLAG] !== 'up')
		vm.services = [];

	if (vm.server.status !== 'running')
		vm.services = [];

	if (vm.state !== 'running')
		vm.services = [];

	vm.operation = 'add';

	if (vm.tags && vm.tags[INST_EN_TAG] !== undefined) {
		vm.operation = 'remove';

	} else if (vm.destroyed || vm.state === 'destroyed') {
		this.log.trace({vm: vm.uuid},
		    'vm disabled, marked as destroyed');
		vm.operation = 'remove';

	} else if (!vm.owner[USER_EN_FLAG] ||
	    vm.owner[USER_EN_FLAG] === 'false') {
		this.log.trace({vm: vm.uuid},
		    'vm disabled, user flag unset');
		vm.operation = 'remove';

	} else if (!vm.owner.approved_for_provisioning ||
	    vm.owner.approved_for_provisioning === 'false') {
		this.log.trace({vm: vm.uuid},
		    'vm disabled, user not approved');
		vm.operation = 'remove';
	}

	this.push(vm);
	cb();
};