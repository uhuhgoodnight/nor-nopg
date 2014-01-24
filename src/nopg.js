/* nor-nopg */

var debug = require('nor-debug');
var util = require('util');
var Q = require('q');
var fs = require('nor-fs');
var pg = require('nor-pg');
var extend = require('nor-extend').setup({useFunctionPromises:true});
var orm = require('./orm');
var pghelpers = require('./pghelpers.js');

/* ------------- HELPER FUNCTIONS --------------- */

/** The constructor */
function NoPg(db) {
	var self = this;
	if(!db) { throw new TypeError("db invalid: " + util.inspect(db) ); }
	self._db = db;
	self._values = [];
	self._tr_state = 'open';
}

module.exports = NoPg;

// Object constructors
NoPg.Document = orm.Document;
NoPg.Type = orm.Type;
NoPg.Attachment = orm.Attachment;
NoPg.Lib = orm.Lib;
NoPg.DBVersion = orm.DBVersion;

/** */
function assert(valid, text) {
	if(!valid) {
		throw new TypeError(text);
	}
}

/** Assert that the `obj` is NoPg.Document */
function assert_type(obj, type, text) {
	assert(obj instanceof type, text || "Not correct type: " + type);
}

/** Take first result from the database query and returns new instance of `Type` */
function get_result(Type) {
	return function(rows) {
		if(!rows) { throw new TypeError("failed to parse result"); }
		var doc = rows.shift();
		if(!doc) { return; }
		var obj = {};
		Object.keys(doc).forEach(function(key) {
			obj['$'+key] = doc[key];
		});
		return new Type(obj);
	};
}

/** Take all results from the database query and return an array of new instances of `Type` */
function get_results(Type) {
	return function(rows) {
		return rows.map(function(row, i) {
			if(!row) { throw new TypeError("failed to parse result #" + i + " in an array"); }
			var obj = {};
			Object.keys(row).forEach(function(key) {
				obj['$'+key] = row[key];
			});
			return new Type(obj);
		});
	};
}

/** Takes the result and saves it into `self`. If `self` is one of `NoPg.Document`, 
 * `NoPg.Type`, `NoPg.Attachment` or `NoPg.Lib`, then the content is updated into 
 * that instance. If the `doc` is an instance of `NoPg` then the result can be 
 * fetched using `self.fetch()`.
 */
function save_result_to(self) {
	if( (self instanceof NoPg.Document) ||
	    (self instanceof NoPg.Type) || 
	    (self instanceof NoPg.Attachment) || 
	    (self instanceof NoPg.Lib) || 
	    (self instanceof NoPg.DBVersion)
	  ) {
		return function(doc) { return self.update(doc); };
	}

	if(self._values) {
		return function(doc) {
			self._values.push( doc );
			return self;
		};
	}

	throw new TypeError("Unknown target: " + (typeof self));
}

/** Takes the result and saves it into `self`. If the `self` is an instance of `NoPg` then the result can be fetched using `self.fetch()`. */
function save_result_to_queue(self) {

	if(self._values) {
		return function(objs) {
			self._values.push( objs );
			return self;
		};
	}

	throw new TypeError("Unknown target: " + (typeof self));
}

/** Convert properties like {"$foo":123} -> "foo = 123" and {foo:123} -> "(meta->'foo')::numeric = 123" and {foo:"123"} -> "meta->'foo' = '123'"
 * Usage: `var where = parse_predicates(NoPg.Document)({"$foo":123})`
 */
function parse_predicates(Type) {
	function parse_data(opts) {
		opts = opts || {};
		var datakey = (Type.meta.datakey || '$meta').substr(1);
		var res = {};
		
		// Parse meta properties
		Object.keys(opts).filter(function(k) { return k[0] !== '$'; }).forEach(function(key) {

			/*jslint regexp: false*/
			var keyreg = /^[^']+$/;
			/*jslint regexp: true*/

			// FIXME: Implement escape?
			if(!(keyreg.test(key))) { throw new TypeError("Invalid keyword: " + key); }
			if(typeof opts[key] === 'number') {
				res["("+datakey+"->>'"+key+"')::numeric"] = opts[key];
			} else {
				res[""+datakey+"->>'"+key+"'"] = ''+opts[key];
			}
		});
		
		// Parse top level properties
		Object.keys(opts).filter(function(k) { return k[0] === '$'; }).forEach(function(key) {
			var k = key.substr(1);
			res[k] = opts[key];
		});
	
		return res;
	}
	return parse_data;
}


/* ------------- PRIVATE FUNCTIONS --------------- */


/** Perform generic query */
function do_query(query, values) {
	var self = this;
	if(!self) { throw new TypeError("invalid: self: " + util.inspect(self)); }
	if(!self._db) { throw new TypeError("invalid: self._db: " + util.inspect(self._db)); }
	if(!query) { throw new TypeError("invalid: query: " + util.inspect(query)); }

	//debug.log('query = ', query);
	//debug.log('values = ', values);

	return extend.promise( [NoPg], self._db._query(query, values) );
}

/** Generic SELECT query */
function do_select(ObjType, opts) {
	//debug.log('ObjType=', ObjType, ', opts=', opts);
	var self = this;
	var query, keys, params = [];
	var where = {};

	if(opts === undefined) {
	} else if(opts instanceof NoPg.Type) {
		where.id = opts.$id;
	} else if(typeof opts === 'object') {
		Object.keys(opts).filter(function(key) {
			return key[0] === '$' ? true : false;
		}).forEach(function(key) {
			where[key.substr(1)] = opts[key];
		});
	} else {
		where.name = ''+opts;
	}

	keys = Object.keys(where);
	params = keys.map(function(key) {
		return where[key];
	});

	query = "SELECT * FROM " + (ObjType.meta.table);

	if(keys && (keys.length >= 1) ) {
		query += " WHERE " + keys.map(function(key, i) { return key + ' = $' + (i+1); }).join(' AND ');
	}

	//debug.log('query = ', query);

	//debug.log('params = ', params);

	return do_query.call(self, query, params);
}

/** Internal INSERT query */
function do_insert(ObjType, data) {
	var self = this;
	//debug.log('ObjType=', ObjType, ", data=", data);

	data = (new ObjType(data)).valueOf();
	//debug.log("after parsing, data = ", data);

	var query, params;

	// Filter only $-keys which are not the datakey
	var keys = ObjType.meta.keys.filter(function(key) {
		return (key[0] === '$') ? true : false;
	}).map(function(key) {
		return key.substr(1);
	}).filter(function(key) {
		return data[key] ? true : false;
	});

	if(keys.length === 0) { throw new TypeError("No data to submit: keys array is empty."); }

	query = "INSERT INTO " + (ObjType.meta.table) + " ("+ keys.join(', ') +") VALUES ("+ keys.map(function(k, i) { return '$' + (i+1); }).join(', ') +") RETURNING *";
	//debug.log('query = ', query);

	params = keys.map(function(key) {
		return data[key];
	});
	//debug.log('params = ', params);

	return do_query.call(self, query, params); //.then(get_result(ObjType)).then(save_result_to(self));
}


/** Internal UPDATE query */
function do_update(ObjType, obj, orig_data) {

	function json_cmp(a, b) {
		a = JSON.stringify(a);
		//debug.log("a = ", a);
		b = JSON.stringify(b);
		//debug.log("b = ", b);
		var ret = (a === b) ? true : false;
		//debug.log("returns ", ret);
		return ret;
	}

	//debug.log('ObjType = ', ObjType);
	//debug.log('obj = ', obj);
	//debug.log("orig_data = ", orig_data);

	var self = this;
	var query, params, data, where = {};

	if(obj.$id) {
		where.$id = obj.$id;
	} else if(obj.$name) {
		where.$name = obj.$name;
	} else {
		debug.log('obj = ', obj);
		throw new TypeError("Cannot know what to update!");
	}
	//debug.log('where = ', where);

	if(orig_data === undefined) {
		//debug.log("orig_data was undefined, building it from obj=", obj);
		// FIXME: Check that `obj` is an ORM object
		data = obj.valueOf();
	} else {
		//debug.log("orig_data was not undefined: ", orig_data);
		data = (new ObjType(obj)).update(orig_data).valueOf();
	}
	//debug.log('data = ', data);

	// Select only keys that start with $
	var keys = ObjType.meta.keys.filter(function(key) {
		return (key[0] === '$') ? true : false;

	// Remove leading '$' character from keys
	}).map(function(key) {
		return key.substr(1);

	// Ignore keys that aren't going to be changed
	}).filter(function(key) {
		return data[key] ? true : false;

	// Ignore keys that were not changed
	}).filter(function(key) {
		return json_cmp(data[key], obj['$'+key]) ? false : true;
	});

	//debug.log('keys = ', keys);

	// Return with the current object if there is no keys to update
	if(keys.length === 0) { 
		//debug.log("Warning! No data to update! Fetching current object from database.");
		return do_select.call(self, ObjType, where);
	}

	// FIXME: Implement binary content support

	query = "UPDATE " + (ObjType.meta.table) + " SET "+ keys.map(function(k, i) { return k + ' = $' + (i+1); }).join(', ') +" WHERE ";

	if(where.$id) {
		query += "id = $"+ (keys.length+1);
	} else if(where.$name) {
		query += "name = $"+ (keys.length+1);
	} else {
		throw new TypeError("Cannot know what to update!");
	}

	query += " RETURNING *";
	//debug.log('query = ', query);

	params = keys.map(function(key) {
		return data[key];
	});

	if(where.$id) {
		params.push(where.$id);
	} else if(where.$name){
		params.push(where.$name);
	}

	//debug.log('params = ', params);

	return do_query.call(self, query, params);
}

/** Internal DELETE query */
function do_delete(ObjType, obj) {
	//debug.log('args = (ObjType=', ObjType,'obj=', obj, ')');
	if(!obj.$id) { throw new TypeError("opts.$id invalid: " + util.inspect(obj) ); }
	var self = this;
	var query, params;
	query = "DELETE FROM " + (ObjType.meta.table) + " WHERE id = $1";
	//debug.log('query = ', query);
	params = [obj.$id];
	//debug.log('params = ', params);
	return do_query.call(self, query, params);
}

/**
 * Returns `true` if PostgreSQL database table exists.
 * @todo Implement this in nor-pg and use here.
 */
function pg_table_exists(name) {
	var self = this;
	return do_query.call(self, 'SELECT * FROM information_schema.tables WHERE table_name = $1', [name]).then(function(rows) {
		if(!rows) { throw new TypeError("Unexpected result from query: " + util.inspect(rows)); }
		if(rows.length === 0) {
			return false;
		} else {
			return true;
		}
	});
}

/* ------------- PUBLIC FUNCTIONS --------------- */

/** Returns the NoPg constructor type of `doc`, otherwise returns undefined. */
NoPg._getObjectType = function(doc) {
	if(doc instanceof NoPg.Document  ) { return NoPg.Document;   }
	if(doc instanceof NoPg.Type      ) { return NoPg.Type;       }
	if(doc instanceof NoPg.Attachment) { return NoPg.Attachment; }
	if(doc instanceof NoPg.Lib       ) { return NoPg.Lib;        }
	if(doc instanceof NoPg.DBVersion ) { return NoPg.DBVersion;  }
};

/** Returns the NoPg constructor type of `doc`, otherwise throws an exception of `TypeError`. */
NoPg.getObjectType = function(doc) {
	var ObjType = NoPg._getObjectType(doc);
	if(!ObjType) {
		throw new TypeError("doc is unknown type: " + doc);
	}
	return ObjType;
};

/** Run query `SET $key = $value` on the PostgreSQL server */
function pg_query(query, params) {
	return function(db) {
		return do_query.call(db, query, params).then(function() { return db; });
	};
}

/** Start */
NoPg.start = function(pgconfig) {
	return extend.promise( [NoPg], pg.start(pgconfig).then(function(db) {
		if(!db) { throw new TypeError("invalid db: " + util.inspect(db) ); }
		return new NoPg(db);
	}).then(function(db) {
		return pg_query("SET plv8.start_proc = 'plv8_init'")(db);
	})).then(function(db) {
		return pg_table_exists.call(db, NoPg.DBVersion.meta.table).then(function(exists) {
			if(!exists) {
				debug.log('Warning! Detected uninitialized database.');
			}
			return db;
		});
	});
};

/** Fetch next value from queue */
NoPg.prototype.fetch = function() {
	return this._values.shift();
};

/** Returns the latest value in the queue but does not remove it */
NoPg.prototype._getLastValue = function() {
	//debug.log('values = ', this._values);
	return this._values[this._values.length - 1];
};

/** Commit transaction */
NoPg.prototype.commit = function() {
	var self = this;
	return extend.promise( [NoPg], this._db.commit().then(function() {
		self._tr_state = 'commit';
		return self;
	}) );
};

/** Rollback transaction */
NoPg.prototype.rollback = function() {
	var self = this;
	return extend.promise( [NoPg], this._db.rollback().then(function() {
		self._tr_state = 'rollback';
		return self;
	}) );
};

/** Checks if server has compatible version */
NoPg.prototype.testServerVersion = function() {
	var self = this;
	return do_query.call(self, 'show server_version_num').then(function(rows) {
		//debug.log('PostgreSQL server version (before parse): ', rows);
		var num = rows.shift().server_version_num;
		num = parseInt(num, 10);
		//debug.log('PostgreSQL server version: ', num);
		if(num >= 90300) {
			return self;
		} else {
			throw new TypeError("PostgreSQL server must be v9.3 or newer (detected "+ num +")");
		}
	});
};

/** Checks if server has compatible version */
NoPg.prototype.testExtension = function(name) {
	var self = this;
	return do_query.call(self, 'SELECT COUNT(*) AS count FROM pg_catalog.pg_extension WHERE extname = $1', [name]).then(function(rows) {
		var row = rows.shift();
		var count = parseInt(row.count, 10);
		//debug.log('Count of extensions by ' + name + ': ', count);
		if(count === 1) {
			return self;
		} else {
			throw new TypeError("PostgreSQL server does not have extension: " + name);
		}
	});
};

/** Tests if the server is compatible */
NoPg.prototype.test = function() {
	return this.testServerVersion().testExtension('plv8').testExtension('uuid-ossp').testExtension('moddatetime').testExtension('tcn');
};

/** Initialize the database */
NoPg.prototype.init = function() {

	function pad(num, size) {
		var s = num+"";
		while (s.length < size) {
			s = "0" + s;
		}
		return s;
	}

	var self = this;
	return self.test().latestDBVersion().then(function(db) {
		var code_version = require('./schema/latest.js');
		var db_version = db.fetch();
		if(! ((db_version >= -1) && (db_version<=code_version)) ) { 
			throw new TypeError("Database version " + db_version + " is not between accepted range (-1 .. " + code_version + ")");
		}
		var builders = [];

		var i = db_version, file;
		while(i < code_version) {
			i += 1;
			file = './schema/v' + pad(i, 4) + '.js';
			try {
				//debug.log('Loading database version ', i, " from ", file);
				builders.push.apply(builders, require(file) );
			} catch(err) {
				//debug.log("Exception: ", err);
				throw new TypeError("Failed to load: "+ file + ": " + err);
			}
		}

		// Skip upgrade if we have nothing to do
		if(builders.length === 0) {
			return self;
		}

		// Call upgrade steps
		return builders.reduce(function(so_far, f) {
		    return so_far.then(function(db) {
				db.fetchAll();
				return db;
			}).then(f);
		}, Q(self._db)).then(function() {
			return db._addDBVersion({'$version': code_version});
		}).then(function() {
			//debug.log('Successfully upgraded database from v' + db_version + ' to v' + code_version); 
			return self;
		});
	}).then(function() {
		return self._importLib(__dirname + "/../libs/tv4/tv4.js").then(function() { return self; });
	}).then(pg_query("SET plv8.start_proc = 'plv8_init'"));
};

/** Create document by type: `db.create([TYPE])([OPT(S)])`. */
NoPg.prototype.create = function(type) {
	//debug.log('args = (', type, ')');
	var self = this;

	function create2(data) {
		//debug.log('args = (', data, ')');

		if(type && (type instanceof NoPg.Type)) {
			data.$types_id = type.$id;
		} else if(type) {
			return self._getType(type).then(function(t) {
				if(!(t instanceof NoPg.Type)) {
					throw new TypeError("invalid type received: " + util.inspect(t) );
				}
				type = t;
				return create2(data);
			});
		}

		return do_insert.call(self, NoPg.Document, data).then(get_result(NoPg.Document)).then(save_result_to(self));
	}

	return create2;
};

/** Add new DBVersion record */
NoPg.prototype._addDBVersion = function(data) {
	var self = this;
	//debug.log('data = ', data);
	return do_insert.call(self, NoPg.DBVersion, data).then(get_result(NoPg.DBVersion));
};


/** Search documents */
NoPg.prototype.search = function(type) {
	//debug.log('type = ', type);
	var self = this;
	var ObjType = NoPg.Document;

	function search2(opts) {
		//debug.log('opts=', opts);

		var query, keys, params, dbtype;

		//debug.log('opts = ', opts);
		var parsed_opts = parse_predicates(ObjType)(opts, ObjType.meta.datakey.substr(1) );
		//debug.log('parsed_opts = ', parsed_opts);

		keys = Object.keys(parsed_opts);
		//debug.log('keys = ', keys);

		params = keys.map(function(key) { return parsed_opts[key]; });
		//debug.log('params = ', params);

		var where = keys.map(function(k,n) { return k + ' = $' + (n+1); });
		//debug.log('where = ', where);

		if(type !== undefined) {
			if(typeof type === 'string') {
				where.push("types_id = get_type_id($"+(where.length+1)+")");
				params.push(type);
			} else if(type instanceof NoPg.Type) {
				where.push("types_id = $" + (where.length+1));
				params.push(type.$id);
			} else {
				throw new TypeError("Unknown type: " + type);
			}
			//debug.log('where = ', where, ' after types_id');
			//debug.log('params = ', params, ' after types_id');
		}

		query = "SELECT * FROM "+(ObjType.meta.table);

		if(where.length >= 1) {
			query += " WHERE " + where.join(' AND ');
		}

		//debug.log('query = ' + query);

		return do_query.call(self, query, params).then(get_results(ObjType)).then(save_result_to_queue(self)).then(function() { return self; });
	}

	return search2;
};

/** Update document */
NoPg.prototype.update = function(obj, data) {
	var self = this;
	var ObjType = NoPg.getObjectType(obj);
	return do_update.call(self, ObjType, obj, data).then(get_result(ObjType)).then(save_result_to(self));
};

/** Delete resource */
NoPg.prototype.del = function(obj) {
	if(!obj.$id) { throw new TypeError("opts.$id invalid: " + util.inspect(obj) ); }
	var self = this;
	var ObjType = NoPg.getObjectType(obj);
	return do_delete.call(self, ObjType, obj).then(function() { return self; });
};

NoPg.prototype['delete'] = NoPg.prototype.del;

/** Create a new type. We recommend using `.declareType()` instead unless you want an error if the type exists already. Use like `db.createType([TYPE-NAME])([OPT(S)])`. */
NoPg.prototype.createType = function(name) {
	//debug.log('name = ', name);
	var self = this;
	function createType2(data) {
		data = data || {};
		//debug.log('data = ', data);
		if(name !== undefined) {
			data.$name = ''+name;
		}
		return do_insert.call(self, NoPg.Type, data).then(get_result(NoPg.Type)).then(save_result_to(self));
	}
	return createType2;
};

/** Create a new type or replace existing type with the new values. Use like `db.declareType([TYPE-NAME])([OPT(S)])`. */
NoPg.prototype.declareType = function(name) {
	//debug.log('name = ', name);
	var self = this;
	function createOrReplaceType2(data) {
		data = data || {};
		//debug.log('data = ', data);
		var where = {};
		if(name !== undefined) {
			if(name instanceof NoPg.Type) {
				where.$types_id = name.$id;
			} else {
				where.$name = ''+name;
			}
		}
		return self._getType(where).then(function(type) {
			if(type) {
				return self.update(type, data);
			} else {
				return self.createType(name)(data);
			}
		});
	}
	return createOrReplaceType2;
};

/** This is an alias for `.declareType()`. */
NoPg.prototype.createOrReplaceType = function(name) {
	//debug.log('NoPg.prototype.createOrReplaceType() is obsolete, use .declareType() instead.');
	return this.declareType(name);
};

/** Tests if type exists */
NoPg.prototype._typeExists = function(name) {
	//debug.log('name = ', name);
	var self = this;
	return do_select.call(self, NoPg.Type, name).then(function(types) {
		return (types.length >= 1) ? true : false;
	});
};

/** Tests if lib exists */
NoPg.prototype._libExists = function(name) {
	//debug.log('name = ', name);
	var self = this;
	return do_select.call(self, NoPg.Lib, name).then(function(types) {
		return (types.length >= 1) ? true : false;
	});
};

/** Get type and save it to result queue. */
NoPg.prototype.typeExists = function(name) {
	//debug.log('name = ', name);
	var self = this;
	return self._typeExists(name).then(save_result_to(self));
};

/** Get type directly */
NoPg.prototype._getType = function(name) {
	//debug.log('name = ', name);
	var self = this;
	return do_select.call(self, NoPg.Type, name).then(get_result(NoPg.Type));
};

/** Get type and save it to result queue. */
NoPg.prototype.getType = function(name) {
	//debug.log('name = ', name);
	var self = this;
	return self._getType(name).then(save_result_to(self));
};

/** Alias for `pghelpers.escapeFunction()` */
NoPg._escapeFunction = pghelpers.escapeFunction;

/** Returns the latest database server version */
function _latestDBVersion() {
	var self = this;
	var table = NoPg.DBVersion.meta.table;
	return pg_table_exists.call(self, table).then(function(exists) {
		if(!exists) {
			return -1;
		}
		var query = 'SELECT MAX(version) AS version FROM ' + table;
		return do_query.call(self, query).then(function(rows) {
			if(!(rows instanceof Array)) { throw new TypeError("Unexpected result from rows: " + util.inspect(rows) ); }
			var obj = rows.shift();
			//debug.log('Latest database version: ', obj.version);
			return parseInt(obj.version, 10);
		});
	}).then(function(db_version) {
		if(db_version < -1 ) { 
			throw new TypeError("Database version " + db_version + " is not between accepted range (-1 ..)");
		}
		return db_version;
	});
}

/** Returns the latest database server version as a integer number */
NoPg.prototype.latestDBVersion = function() {
	var self = this;
	return _latestDBVersion.call(self).then(save_result_to(self));
};

/** Import javascript file into database as a library by calling `.importLib(FILE, [OPT(S)])` or `.importLib(OPT(S))` with `$content` property. */
NoPg.prototype._importLib = function(file, opts) {
	var self = this;
	opts = JSON.parse( JSON.stringify( opts || {} ));

	if( (typeof file === 'object') && (opts === undefined) ) {
		opts = file;
		file = undefined;
	}

	return Q.fcall(function() {
		if(file) {
			return fs.readFile(file, {'encoding':'utf8'});
		}
		if(opts.$content) {
			return;
		}
		throw new TypeError("NoPg.prototype.importLib() called without content or file");
	}).then(function importLib2(data) {
		opts.$name = opts.$name || require('path').basename(file, '.js');
		var name = '' + opts.$name;

		opts['content-type'] = '' + (opts['content-type'] || 'application/javascript');
		if(data) {
			opts.$content = ''+data;
		}

		return self._libExists(opts.$name).then(function(exists) {
			if(exists) {
				delete opts.$name;
				return do_update.call(self, NoPg.Lib, {"$name":name}, opts);
			} else {
				return do_insert.call(self, NoPg.Lib, opts);
			}
		});
	});

};

/** Import javascript file into database as a library by calling `.importLib(FILE, [OPT(S)])` or `.importLib(OPT(S))` with `$content` property. */
NoPg.prototype.importLib = function(file, opts) {
	var self = this;
	return self._importLib(file, opts).then(get_result(NoPg.Lib)).then(save_result_to(self));
};

/** Get specified object directly */
NoPg.prototype._getObject = function(ObjType) {
	var self = this;
	//debug.log('ObjType = ', ObjType);
	return function(opts) {
		//debug.log('opts = ', opts);
		return do_select.call(self, ObjType, opts).then(get_result(ObjType));
	};
};

/** Get document directly */
NoPg.prototype._getDocument = function(opts) {
	//debug.log('opts = ', opts);
	var self = this;
	return self._getObject(NoPg.Document)(opts);
};

/** Get document and save it to result queue. */
NoPg.prototype.getDocument = function(opts) {
	//debug.log('opts = ', opts);
	var self = this;
	return self._getDocument(opts).then(save_result_to(self));
};

/** Search types */
NoPg.prototype.searchTypes = function(opts) {
	var self = this;
	//debug.log('ObjType = ', ObjType);
	var ObjType = NoPg.Type;
	//debug.log('opts = ', opts);
	return do_select.call(self, ObjType, opts).then(get_results(ObjType)).then(save_result_to_queue(self)).then(function() { return self; });
};

/** Create an attachment from a file in the filesystem.
 * @param obj {object} The document object where the attachment will be placed.
 *          If it is an attachment object, it's parent will be used. If it is 
 *          undefined, then last object in the queue will be used.
 */
NoPg.prototype.createAttachment = function(doc) {
	var self = this;

	return function createAttachment2(file, opts) {

		opts = opts || {};

		debug.assert(file).typeOf('string');
		debug.assert(opts).typeOf('object');
		
		var doc_id;

		if(doc === undefined) {
			doc = self._getLastValue();
			//debug.log("last doc was = ", doc);
		}

		if(doc && (doc instanceof NoPg.Document)) {
			doc_id = doc.$id;
		} else if(doc && (doc instanceof NoPg.Attachment)) {
			doc_id = doc.$documents_id;
		} else {
			throw new TypeError("Could not detect document ID!");
		}

		debug.log("documents_id = ", doc_id);
		debug.assert(doc_id).typeOf('string');
		
		return fs.readFile(file, {'encoding':'hex'}).then(function(buffer) {
			//debug.log("typeof data = ", typeof data);
			
			var data = {
				$documents_id: doc_id,
				$content: '\\x' + buffer,
				$meta: opts
			};
			
			debug.assert(data.$documents_id).typeOf('string');

			debug.log("data.$documents_id = ", data.$documents_id);
			debug.log("data.$meta = ", data.$meta);

			return do_insert.call(self, NoPg.Attachment, data).then(get_result(NoPg.Attachment)).then(save_result_to(self));
		});
	};
};

/* EOF */
