/*!
 * TerrificJS modularizes your frontend code by solely relying on naming conventions.
 * http://terrifically.org
 *
 * @copyright   Copyright (c) <%= year %> Remo Brunschwiler
 * @license     Licensed under MIT license
 * @version     <%= version %>
 */

/**
 * @module T
 */

/**
 * Responsible for application-wide issues such as the creation of modules.
 *
 * @author Remo Brunschwiler
 * @namespace T
 * @class Application
 *
 * @constructor
 * @param {Node} ctx
 *      The context node
 * @param {Object} config
 *      The configuration
 */
/* global Sandbox, Utils, Module */
function Application(ctx, config) {
	// validate params
	if (!ctx && !config) {
		// both empty
		ctx = document;
		config = {};
	}
	else if (Utils.isNode(config)) {
		// reverse order of arguments
		var tmpConfig = config;
		config = ctx;
		ctx = tmpConfig;
	}
	else if (!Utils.isNode(ctx) && !config) {
		// only config is given
		config = ctx;
		ctx = document;
	}
	else if (Utils.isNode(ctx) && !config) {
		// only ctx is given
		config = {};
	}

	var defaults = {
		namespace: Module
	};

	config = Utils.extend(defaults, config);

	/**
	 * The context node.
	 *
	 * @property _ctx
	 * @type Node
	 */
	this._ctx = Utils.getElement(ctx);

	/**
	 * The configuration.
	 *
	 * @property config
	 * @type Object
	 */
	this._config = config;

	/**
	 * The sandbox to get the resources from.
	 * The singleton is shared between all modules.
	 *
	 * @property _sandbox
	 * @type Sandbox
	 */
	this._sandbox = new Sandbox(this);

	/**
	 * Contains references to all modules on the page.
	 *
	 * @property _modules
	 * @type Object
	 */
	this._modules = {};

	/**
	 * The next unique module id to use.
	 *
	 * @property id
	 * @type Number
	 */
	this._id = 1;
}

/**
 * Register modules within the context
 * Automatically registers all modules within the context,
 * as long as the modules use the naming conventions.
 *
 * @method registerModules
 * @param {Node} ctx
 *      The context node
 * @return {Object}
 *      A collection containing the registered modules
 */
Application.prototype.registerModules = function (ctx) {
	var modules = {};

	ctx = Utils.getElement(ctx) || this._ctx;

	this._sandbox.dispatch('t.register.start');

	// get module nodes
	var nodes = Utils.getModuleNodes(ctx);
	nodes.forEach(function (ctx) {

		/*
		 * A module can have different data attributes.
		 * See below for possible values.
		 */

		/*
		 * @config data-t-name="{mod-name}"
		 *
		 * Example: data-t-name="foo"
		 * Indicates that the module Foo should be bound.
		 */

		/*
		 * @config data-t-namespace="{namespace}"
		 *
		 * Example: data-t-namespace="App.Components"
		 * The namespace of the module. Optional.
		 */

		/*
		 * @config data-t-decorator="{decorator-name}"
		 *
		 * Example: data-t-decorator="bar"
		 * Indicates that the module Foo should be decorated with the Bar decorator.
		 * Multiple decorators should be comma-separated. Optional.
		 */
		var module = this.registerModule(ctx, ctx.getAttribute('data-t-name'), ctx.getAttribute('data-t-decorator'), ctx.getAttribute('data-t-namespace'));

		if (module) {
			modules[module._ctx.getAttribute('data-t-id')] = module;
		}
	}.bind(this));

	this._sandbox.dispatch('t.register.end');

	return modules;
};

/**
 * Unregisters the modules given by the module instances.
 *
 * @method unregisterModules
 * @param {Object} modules
 *      A collection containing the modules to unregister
 */
Application.prototype.unregisterModules = function (modules) {
	modules = modules || this._modules;

	this._sandbox.dispatch('t.unregister.start');

	// unregister the given modules
	for (var id in modules) {
		if (this._modules.hasOwnProperty(id)) {
			if(Utils.isNode(this._modules[id]._ctx)) {
				this._modules[id]._ctx.removeAttribute('data-t-id');
			}
			delete this._modules[id];
		}
	}

	this._sandbox.dispatch('t.unregister.end');
};

/**
 * Starts (intializes) the registered modules.
 *
 * @method start
 * @param {Object} modules
 *      A collection of modules to start
 * @return {Promise}
 *      The synchronize Promise
 */
Application.prototype.start = function (modules) {
	modules = modules || this._modules;

	var promises = [];

	this._sandbox.dispatch('t.start');

	// start the modules
	for (var id in modules) {
		if (modules.hasOwnProperty(id)) {
			var promise = (function (id) {
				return new Promise(function (resolve, reject) {
                    modules[id].start(resolve, reject);
				});
			}(id));

			promises.push(promise);
		}
	}

	// synchronize modules
	var all = Promise.all(promises);
	all.then(function () {
		this._sandbox.dispatch('t.sync');
	}.bind(this)).catch(function (err) {
		throw err;
	});

	return all;
};

/**
 * Stops the registered modules.
 *
 * @method stop
 * @param {Object} modules
 *      A collection of modules to stop
 */
Application.prototype.stop = function (modules) {
	modules = modules || this._modules;

	this._sandbox.dispatch('t.stop');

	// stop the modules
	for (var id in modules) {
		if (modules.hasOwnProperty(id)) {
			modules[id].stop();
		}
	}
};

/**
 * Registers a module.
 *
 * @method registerModule
 * @param {Node} ctx
 *      The context node
 * @param {String} mod
 *      The module name. It must match the class name of the module
 * @param {Array} decorators
 *      A list of decorator names. Each entry must match a class name of a decorator
 * @param {String} namespace
 *      The module namespace
 * @return {Module}
 *      The reference to the registered module
 */
Application.prototype.registerModule = function (ctx, mod, decorators, namespace) {
	var modules = this._modules;

	// validate params
	if(ctx.hasAttribute('data-t-id')) {
		return null; // prevent from registering twice
	}

	mod = Utils.capitalize(Utils.camelize(mod));

	if (Utils.isString(decorators)) {
		if (window[decorators]) {
			// decorators param is the namespace
			namespace = window[decorators];
			decorators = null;
		}
		else {
			// convert string to array
			decorators = decorators.split(',');
		}
	}
	else if (!Array.isArray(decorators) && Utils.isObject(decorators)) {
		// decorators is the namespace object
		namespace = decorators;
		decorators = null;
	}

	decorators = decorators || [];
	decorators = decorators.map(function (decorator) {
		return Utils.capitalize(Utils.camelize(decorator.trim()));
	});

	namespace = namespace || this._config.namespace;

	if (namespace[mod]) {
		// assign the module a unique id
		var id = this._id++;
		ctx.setAttribute('data-t-id', id);

		// instantiate module
		modules[id] = new namespace[mod](ctx, this._sandbox);

		// decorate it
		for (var i = 0, len = decorators.length; i < len; i++) {
			var decorator = decorators[i];

			if (namespace[mod][decorator]) {
				namespace[mod][decorator](modules[id]);
			}
		}

		return modules[id];
	}

	this._sandbox.dispatch('t.missing', ctx, mod, decorators, namespace);

	return null;
};

/**
 * Gets the appropriate module for the given ID.
 *
 * @method getModuleById
 * @param {int} id
 *      The module ID
 * @return {Module}
 *      The appropriate module
 */
Application.prototype.getModuleById = function (id) {
	if (this._modules[id]) {
		return this._modules[id];
	}
	else {
		throw Error('The module with the id ' + id +
		' does not exist');
	}
};
