"use strict";

var Q = require('q');
Q.longStackSupport = true;

var crypto = require('crypto');
var fs = require('nor-fs');
var is = require('nor-is');
var assert = require('assert');
var util = require('util');
var PGCONFIG = process.env.PGCONFIG || 'pg://postgres@localhost/test';
var debug = require('nor-debug');
var nopg = require('../src');

/** */
function not_in(a) {
	debug.assert(a).is('array');
	return function not_in_array(x) {
		return a.indexOf(x) === -1;
	};
}

/** Run init() at start */
before(function(done){
	nopg.start(PGCONFIG).init().then(function(db) {
		//var doc = db.fetch();
		//debug.log('initialized database: doc = ', doc);
		return db.commit();
	}).then(function(db) {
		//debug.log('Database init was successful.');
		done();
	}).fail(function(err) {
		debug.log('Database init failed: ' + err);
		done(err);
	}).done();
});

/* */
describe('nopg', function(){

	describe('.start', function(){

		it('is callable', function(){
			debug.assert(nopg).is('function');
			debug.assert(nopg.start).is('function');
		});

	});

	describe('test of', function() {

		it('typeless document creation', function(done){
			nopg.start(PGCONFIG).create()({"hello":"world"}).then(function(db) {
				var doc = db.fetch();

				try {
					debug.assert(doc).is('object');
					debug.assert(doc.hello).is('string').equals('world');
					debug.assert(doc.$events).is('object');
					debug.assert(doc.$id).is('uuid');
					debug.assert(doc.$content).is('object');
					debug.assert(doc.$types_id).is('null');
					debug.assert(doc.$created).is('date string');
					debug.assert(doc.$modified).is('date string');
					debug.assert(doc.$type).is('null');

					debug.assert( Object.keys(doc).filter(not_in(['hello', '$events', '$id', '$content', '$types_id', '$created', '$modified', '$type'])) ).is('array').length(0);
				} catch(e) {
					debug.log('doc = ', doc);
					throw e;
				}

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('typed document creation', function(done){
			nopg.start(PGCONFIG).createType("Test")({"$schema":{"type":"object"}}).create("Test")({"hello":"world"}).then(function(db) {
				var type = db.fetch();

				try {
					debug.assert(type).is('object');
					debug.assert(type.$events).is('object');
					debug.assert(type.$id).is('uuid');
					debug.assert(type.$name).is('string').equals("Test");
					debug.assert(type.$schema).is('object');
					//debug.assert(type.$validator).is('function');
					debug.assert(type.$meta).is('object');
					debug.assert(type.$created).is('date string');
					debug.assert(type.$modified).is('date string');

					debug.assert( Object.keys(type).filter(not_in(['$events', '$id', '$name', '$schema', '$validator', '$meta', '$created', '$modified'])) ).is('array').length(0);
				} catch(e) {
					debug.log('type = ', type);
					throw e;
				}

				var doc = db.fetch();

				try {
					debug.assert(doc).is('object');
					debug.assert(doc.hello).is('string').equals('world');
					debug.assert(doc.$events).is('object');
					debug.assert(doc.$id).is('uuid');
					debug.assert(doc.$content).is('object');
					debug.assert(doc.$types_id).is('uuid').equals(type.$id);
					debug.assert(doc.$created).is('date string');
					debug.assert(doc.$modified).is('date string');
					debug.assert(doc.$type).is('string').equals('Test');

					debug.assert( Object.keys(doc).filter(not_in(['hello', '$events', '$id', '$content', '$types_id', '$created', '$modified', '$type'])) ).is('array').length(0);
				} catch(e) {
					debug.log('doc = ', doc);
					throw e;
				}

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('typeless document partial update by document object', function(done){
			var doc;
			nopg.start(PGCONFIG).create()({"hello":"world"}).then(function(db) {
				doc = db.fetch();

				try {
					debug.assert(doc).is('object');
					debug.assert(doc.hello).is('string').equals('world');
					debug.assert(doc.$events).is('object');
					debug.assert(doc.$id).is('uuid');
					debug.assert(doc.$content).is('object');
					debug.assert(doc.$types_id).is('null');
					debug.assert(doc.$created).is('date string');
					debug.assert(doc.$modified).is('date string');
					debug.assert(doc.$type).is('null');
					debug.assert( Object.keys(doc).filter(not_in(['hello', '$events', '$id', '$content', '$types_id', '$created', '$modified', '$type'])) ).is('array').length(0);
				} catch(e) {
					debug.log('doc = ', doc);
					throw e;
				}

				return db.update(doc, {"hello2": "another"});
			}).then(function(db) {
				var doc2 = db.fetch();

				try {
					debug.assert(doc2).is('object');
					debug.assert(doc2.hello).is('string').equals('world');
					debug.assert(doc2.hello2).is('string').equals('another');
					debug.assert(doc2.$events).is('object');
					debug.assert(doc2.$id).is('uuid').equals(doc.$id);
					debug.assert(doc2.$content).is('object');
					debug.assert(doc2.$types_id).is('null');
					debug.assert(doc2.$created).is('date string');
					debug.assert(doc2.$modified).is('date string');
					debug.assert(doc2.$type).is('null');

					debug.assert( Object.keys(doc).filter(not_in(['hello', 'hello2', '$events', '$id', '$content', '$types_id', '$created', '$modified', '$type'])) ).is('array').length(0);
				} catch(e) {
					debug.log('doc2 = ', doc2);
					throw e;
				}

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('typeless document update by chaining object', function(done){
			var doc;
			nopg.start(PGCONFIG).create()({"foo":123, "hello":"world"}).then(function(db) {
				doc = db.fetch();

				doc.hello = "another";
				doc.hello2 = "world";
				delete doc.foo;

				try {
					debug.assert(doc.$id).is('uuid');
					debug.assert(doc.$content).is('object');
				} catch(e) {
					debug.log('doc = ', doc);
					throw e;
				}

				return db.update(doc);
			}).then(function(db) {
				try {
					assert.strictEqual(typeof doc.hello, 'string');
					assert.strictEqual(doc.hello, 'another');
					assert.strictEqual(doc.hello2, 'world');
				} catch(e) {
					debug.log('doc = ', doc);
					throw e;
				}
				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('typeless document deletion', function(done){
			var doc;
			nopg.start(PGCONFIG).create()({"hello":"world"}).then(function(db) {
				doc = db.fetch();
				return db.del(doc);
			}).then(function(db) {
				// FIXME: Test that the doc was really deleted.
				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('typeless document search by property', function(done){
			nopg.start(PGCONFIG).create()({"hello":"UAJuE5ya6m9UvUM87GUFu7GBIJWghHMT"}).then(function(db) {
				var doc = db.fetch();

				try {
					assert.strictEqual(typeof doc.hello, 'string');
					assert.strictEqual(doc.hello, 'UAJuE5ya6m9UvUM87GUFu7GBIJWghHMT');
				} catch(e) {
					debug.log('doc = ', doc);
					throw e;
				}

				return db.search()({"hello":"UAJuE5ya6m9UvUM87GUFu7GBIJWghHMT"});
			}).then(function(db) {
				var items = db.fetch();

				try {
					assert.strictEqual(items.length, 1);
				} catch(e) {
					debug.log('items = ', items);
					throw e;
				}

				var doc = items.shift();

				try {
					assert.strictEqual(typeof doc.hello, 'string');
					assert.strictEqual(doc.hello, 'UAJuE5ya6m9UvUM87GUFu7GBIJWghHMT');
				} catch(e) {
					debug.log('doc = ', doc);
					throw e;
				}

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('typeless document search by document ID', function(done){
			var id;
			nopg.start(PGCONFIG).create()({"hello":"AF82RqSsXM527S3PGK76r6H3xjWqnYgP"}).then(function(db) {
				//debug.log('db is ', db);
				var doc = db.fetch();

				try {
					assert.strictEqual(typeof doc.hello, 'string');
					assert.strictEqual(doc.hello, 'AF82RqSsXM527S3PGK76r6H3xjWqnYgP');
				} catch(e) {
					debug.log('doc = ', doc);
					throw e;
				}

				id = doc.$id;

				return db.search()({"$id":doc.$id});
			}).then(function(db) {
				var items = db.fetch();

				try {
					assert.strictEqual(items.length, 1);
				} catch(e) {
					debug.log('items = ', items);
					throw e;
				}

				var doc = items.shift();

				try {
					assert.strictEqual(typeof doc.hello, 'string');
					assert.strictEqual(doc.hello, 'AF82RqSsXM527S3PGK76r6H3xjWqnYgP');
				} catch(e) {
					debug.log('doc = ', doc);
					throw e;
				}

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('typed document search', function(done){
			nopg.start(PGCONFIG)
			  .createType("TestYmMGe0M6")()
			  .create("TestYmMGe0M6")({"foo":1})
			  .create("TestYmMGe0M6")({"foo":2})
			  .create("TestYmMGe0M6")({"foo":3})
			  .search("TestYmMGe0M6")()
			  .then(function(db) {
				var type = db.fetch();
				var item0 = db.fetch();
				var item1 = db.fetch();
				var item2 = db.fetch();
				var items = db.fetch();

				try {
					assert.strictEqual(type.$name, "TestYmMGe0M6");
				} catch(e) {
					debug.log('type = ', type);
					throw e;
				}

				try {
					assert.strictEqual(item0.foo, 1);
				} catch(e) { debug.log('item0 = ', item0); throw e; }

				try {
					assert.strictEqual(item1.foo, 2);
				} catch(e) { debug.log('item1 = ', item1); throw e; }

				try {
					assert.strictEqual(item2.foo, 3);
				} catch(e) { debug.log('item2 = ', item2); throw e; }

				try {
					assert.strictEqual(items.length, 3);
					assert.strictEqual(item0.foo, items[0].foo);
					assert.strictEqual(item1.foo, items[1].foo);
					assert.strictEqual(item2.foo, items[2].foo);
				} catch(e) { debug.log('items = ', items); throw e; }

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('typed document search by property', function(done){
			nopg.start(PGCONFIG)
			  .createType("TestMxvLtb3x")()
			  .create("TestMxvLtb3x")({"foo":1,"bar":"foobar"})
			  .create("TestMxvLtb3x")({"foo":2,"bar":"hello"})
			  .create("TestMxvLtb3x")({"foo":3})
			  .search("TestMxvLtb3x")({"bar":"hello"})
			  .then(function(db) {
				var type = db.fetch();
				var item0 = db.fetch();
				var item1 = db.fetch();
				var item2 = db.fetch();
				var items = db.fetch();

				try {
					assert.strictEqual(type.$name, "TestMxvLtb3x");
				} catch(e) { debug.log('type = ', type); throw e; }

				try {
					assert.strictEqual(item0.foo, 1);
					assert.strictEqual(item0.bar, "foobar");
				} catch(e) { debug.log('item0 = ', item0); throw e; }

				try {
					assert.strictEqual(item1.foo, 2);
					assert.strictEqual(item1.bar, "hello");
				} catch(e) { debug.log('item1 = ', item1); throw e; }

				try {
					assert.strictEqual(item2.foo, 3);
				} catch(e) { debug.log('item2 = ', item2); throw e; }

				try {
					assert.strictEqual(items.length, 1);
					assert.strictEqual(item1.foo, items[0].foo);
					assert.strictEqual(item1.bar, items[0].bar);
				} catch(e) { debug.log('items = ', items); throw e; }

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('typed document search by selected property', function(done){
			var type;
			nopg.start(PGCONFIG)
			  .createType("Testg1KrHD2a")()
			  .then(function(db) {
				type = db.fetch();

				try {
					assert.strictEqual(type instanceof nopg.Type, true);
				} catch(e) { debug.log('type = ', type); throw e; }

				return db.create(type)({"foo":1,"bar":"foobar"})
				  .create(type)({"foo":2,"bar":"hello"})
				  .create(type)({"foo":3})
				  .search(type)({"bar":"hello"});
			  }).then(function(db) {
				var item0 = db.fetch();
				var item1 = db.fetch();
				var item2 = db.fetch();
				var items = db.fetch();

				try {
					assert.strictEqual(type.$name, "Testg1KrHD2a");
				} catch(e) { debug.log('type = ', type); throw e; }

				try {
					assert.strictEqual(item0.foo, 1);
					assert.strictEqual(item0.bar, "foobar");
				} catch(e) { debug.log('item0 = ', item0); throw e; }

				try {
					assert.strictEqual(item1.bar, "hello");
					assert.strictEqual(item1.bar, "hello");
				} catch(e) { debug.log('item1 = ', item1); throw e; }

				try {
					assert.strictEqual(item2.foo, 3);
				} catch(e) { debug.log('item2 = ', item2); throw e; }

				try {
					assert.strictEqual(items.length, 1);
					assert.strictEqual(item1.foo, items[0].foo);
					assert.strictEqual(item1.bar, items[0].bar);
				} catch(e) { debug.log('items = ', items); throw e; }

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('Creating unnamed types', function(done){
			var type;
			nopg.start(PGCONFIG)
			  .createType()()
			  .then(function(db) {
				type = db.fetch();

				try {
					assert.strictEqual(type instanceof nopg.Type, true);
				} catch(e) { debug.log('type = ', type); throw e; }

				return db.create(type)({"foo":1,"bar":"foobar"})
				  .create(type)({"foo":2,"bar":"hello"})
				  .create(type)({"foo":3})
				  .search(type)({"bar":"hello"});
			  }).then(function(db) {
				var item0 = db.fetch();
				var item1 = db.fetch();
				var item2 = db.fetch();
				var items = db.fetch();

				try {
					assert.strictEqual(item0.foo, 1);
					assert.strictEqual(item0.bar, "foobar");
				} catch(e) { debug.log('item0 = ', item0); throw e; }

				try {
					assert.strictEqual(item1.foo, 2);
					assert.strictEqual(item1.bar, "hello");
				} catch(e) { debug.log('item1 = ', item1); throw e; }

				try {
					assert.strictEqual(item2.foo, 3);
				} catch(e) { debug.log('item2 = ', item2); throw e; }

				try {
					assert.strictEqual(items.length, 1);
					assert.strictEqual(item1.foo, items[0].foo);
					assert.strictEqual(item1.bar, items[0].bar);
				} catch(e) { debug.log('items = ', items); throw e; }

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('Declare type works over existing type', function(done){
			nopg.start(PGCONFIG).createType("TypeXvsMtxJyWE")({"hello":"world1"}).declareType("TypeXvsMtxJyWE")({"hello":"world2"}).then(function(db) {
				//debug.log('db is ', db);
				var type1 = db.fetch();
				var type2 = db.fetch();

				try {
					assert.strictEqual(typeof type1, 'object');
					assert.strictEqual(typeof type1.hello, 'string');
					assert.strictEqual(type1.hello, 'world1');
				} catch(e) { debug.log('type1 = ', type1); throw e; }

				try {
					assert.strictEqual(typeof type2, 'object');
					assert.strictEqual(typeof type2.hello, 'string');
					assert.strictEqual(type2.hello, 'world2');
				} catch(e) { debug.log('type2 = ', type2); throw e; }

				try {
					assert.strictEqual(type1.$id, type2.$id);
				} catch(e) {
					debug.log('type1 = ', type1);
					debug.log('type2 = ', type2);
					throw e;
				}

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('Declare type works even if type does not exist', function(done){
			nopg.start(PGCONFIG).declareType("Type4UJHIRRiCc")({"hello":"world"}).then(function(db) {
				//debug.log('db is ', db);
				var type1 = db.fetch();

				try {
					assert.strictEqual(typeof type1, 'object');
					assert.strictEqual(typeof type1.hello, 'string');
					assert.strictEqual(type1.hello, 'world');
				} catch(e) { debug.log('type1 = ', type1); throw e; }

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('Types with schema', function(done){
			nopg.start(PGCONFIG).declareType("TypeSession4UJHIRRiCc")({"$schema":{"type":"object"}}).then(function(db) {
				//debug.log('db is ', db);
				var type1 = db.fetch();
				try {
					assert.strictEqual(typeof type1, 'object');
					assert.strictEqual(typeof type1.$schema, 'object');
					assert.strictEqual(type1.$schema.type, 'object');
				} catch(e) { debug.log('type1 = ', type1); throw e; }
				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('Deleting types', function(done){
			var type, exists;
			nopg.start(PGCONFIG).createType("DeleteTypeTestsxWH8QiBYc")({"hello":"world"}).then(function(db) {
				type = db.fetch();
				//debug.log('type = ' + util.inspect(type));
				return db.del(type).commit();
			}).then(function() {
				return nopg.start(PGCONFIG).typeExists("DeleteTypeTestsxWH8QiBYc").commit();
			}).then(function(db) {
				exists = db.fetch();
				try {
					assert.strictEqual(typeof exists, 'boolean');
					assert.strictEqual(exists, false);
				} catch(e) { debug.log('exists = ', exists); throw e; }
				return db;
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('Types with schema do not allow bad data', function(done){
			var type;
			nopg.start(PGCONFIG).createType("SchemaTest_2y78")({
				"$schema": {
					"title": "Point Object",
					"type": "object",
					"properties": {
						"x": {"type": "number"},
						"y": {"type": "number"}
					},
					"required": ["x", "y"]
				}
			}).then(function(db) {
				type = db.fetch();
				//debug.log('type = ' + util.inspect(type));
				return db.create(type)({"x":10, "y":20});
			}).then(function(db) {
				var point = db.fetch();

				try {
					assert.strictEqual(typeof point.x, 'number');
					assert.strictEqual(typeof point.y, 'number');
					assert.strictEqual(point.x, 10);
					assert.strictEqual(point.y, 20);
				} catch(e) { debug.log('point = ', point); throw e; }

				var failed;
				return db.create(type)({"x":10}).fail(function(err) {
					try {
						var err_str = ''+err;
						debug.assert( err_str.substr( err_str.indexOf('ValidationError:') ) ).equals('ValidationError: Missing required property: y');
					} catch(e) {
						debug.log("Expected error, but message was not expected: " + err);
						throw e;
					}
					failed = true;
				}).fin(function() {
					assert.strictEqual(failed, true);
				}).then(function() {
					return db;
				});
			}).then(function(db) {
				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		/* */
		it('Types with validator do not allow wrong data', function(done){
			var type;
			nopg.start(PGCONFIG).createType("ValidatorTest_3esH")({
				"$schema": {
					"title": "Point Object",
					"type": "object",
					"properties": {
						"x": {"type": "number"},
						"y": {"type": "number"}
					},
					"required": ["x", "y"]
				},
				"$validator": function(o) {
					if( o && o.x && o.y && (o.x >= 0) && (o.x < 100) && (o.y >= 0) && (o.y < 100) ) {
						return true;
					}
					return false;
				}
			}).then(function(db) {
				type = db.fetch();
				//debug.log('type = ' + util.inspect(type));
				return db.create(type)({"x":10, "y":20});
			}).then(function(db) {
				var point = db.fetch();

				try {
					assert.strictEqual(typeof point.x, 'number');
					assert.strictEqual(typeof point.y, 'number');
					assert.strictEqual(point.x, 10);
					assert.strictEqual(point.y, 20);
				} catch(e) { debug.log('point = ', point); throw e; }

				var failed = false;
				return db.create(type)({"x":200, "y":200}).fail(function(err) {
					try {
						var err_str = ''+err;
						debug.assert( err_str.substr( err_str.indexOf('failed custom type check'), 24) ).equals('failed custom type check');
					} catch(e) {
						debug.log("Expected error, but message was not expected: " + err);
						throw e;
					}
					failed = true;
				}).fin(function() {
					assert.strictEqual(failed, true);
				}).then(function() {
					return db;
				});
			}).then(function(db) {
				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				if(err.stack) {
					debug.log('stack:\n---\n' + err.stack + '\n---\n');
				}
				done(err);
			}).done();
		});

		it('Editing types by changing object', function(done){
			var type, type2;
			nopg.start(PGCONFIG).createType("EditTypeTest_VGM3")({"hello":"world"}).then(function(db) {
				type = db.fetch();

				try {
					assert.strictEqual(typeof type, 'object');
					assert.strictEqual(type instanceof nopg.Type, true);
					assert.strictEqual(type.hello, 'world');
				} catch(e) { debug.log('type = ', type); throw e; }

				type.hello = 'something else';

				return db.update(type).commit();
			}).then(function() {
				return nopg.start(PGCONFIG).getType("EditTypeTest_VGM3").commit();
			}).then(function(db) {
				type2 = db.fetch();
				try {
					assert.strictEqual(typeof type2, 'object');
					assert.strictEqual(type2 instanceof nopg.Type, true);
					assert.strictEqual(type2.$id, type.$id);
					assert.strictEqual(type2.hello, 'something else');
				} catch(e) { debug.log('type2 = ', type2); throw e; }
			}).then(function() {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('Partial updating of types', function(done){
			var type, type2;
			nopg.start(PGCONFIG).createType("EditTypeTest2_5Vmf")({"hello":"world"}).then(function(db) {
				type = db.fetch();

				try {
					assert.strictEqual(typeof type, 'object');
					assert.strictEqual(type instanceof nopg.Type, true);
					assert.strictEqual(type.hello, 'world');
				} catch(e) { debug.log('type = ', type); throw e; }

				return db.update(type, {'hello2':'something else'}).commit();
			}).then(function() {
				return nopg.start(PGCONFIG).getType("EditTypeTest2_5Vmf").commit();
			}).then(function(db) {
				type2 = db.fetch();

				try {
					assert.strictEqual(typeof type2, 'object');
					assert.strictEqual(type2 instanceof nopg.Type, true);
					assert.strictEqual(type2.hello, 'world');

					assert.strictEqual(typeof type2, 'object');
					assert.strictEqual(type2 instanceof nopg.Type, true);
					assert.strictEqual(type2.$id, type.$id);
					assert.strictEqual(type2.hello2, 'something else');
				} catch(e) { debug.log('type2 = ', type2); throw e; }

			}).then(function() {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('partial update of typed document', function(done){
			var doc;
			nopg.start(PGCONFIG).createType("Test-hSYX")({"$schema":{"type":"object"}}).create("Test-hSYX")({"hello":"world"}).then(function(db) {
				var type = db.fetch();
				doc = db.fetch();
				try {
					assert.strictEqual(typeof doc.hello, 'string');
					assert.strictEqual(doc.hello, 'world');
				} catch(e) { debug.log('doc = ', doc); throw e; }
				return db.update(doc, {"hello2": "world2"});
			}).then(function(db) {
				return db.getDocument({'$id':doc.$id});
			}).then(function(db) {
				var doc2 = db.fetch();

				try {
					assert.strictEqual(typeof doc2.hello, 'string');
					assert.strictEqual(doc2.hello, 'world');

					assert.strictEqual(typeof doc2.hello2, 'string');
					assert.strictEqual(doc2.hello2, 'world2');
				} catch(e) { debug.log('doc2 = ', doc2); throw e; }

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('partial update of typed document without any real changes', function(done){
			var doc;
			nopg.start(PGCONFIG).createType("Test-mtm8")({"$schema":{"type":"object"}}).create("Test-mtm8")({"hello":"world"}).then(function(db) {
				var type = db.fetch();
				doc = db.fetch();
				try {
					assert.strictEqual(typeof doc.hello, 'string');
					assert.strictEqual(doc.hello, 'world');
				} catch(e) { debug.log('doc = ', doc); throw e; }

				return db.update(doc, {"hello": "world"});
			}).then(function(db) {
				return db.getDocument({'$id':doc.$id});
			}).then(function(db) {
				var doc2 = db.fetch();

				try {
					assert.strictEqual(typeof doc2.hello, 'string');
					assert.strictEqual(doc2.hello, 'world');
				} catch(e) { debug.log('doc2 = ', doc2); throw e; }

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('can create document with attachments', function(done){
			var doc;

			nopg.start(PGCONFIG)
			    .createType("Test-6pvY")({"$schema":{"type":"object"}})
			    .create("Test-6pvY")({"hello":"world"})
			    .createAttachment()( __dirname + '/files/test1.jpg')
			    .createAttachment()( __dirname + '/files/test2.jpg', {"foo":"bar"})
				.then(function(db) {

				var type = db.fetch();
				var doc = db.fetch();
				var att1 = db.fetch();
				var att2 = db.fetch();

				try {
					debug.assert(type).typeOf('object').instanceOf(nopg.Type);
				} catch(e) { debug.log('type = ', type); throw e; }

				try {
					debug.assert(doc).typeOf('object').instanceOf(nopg.Document);
				} catch(e) { debug.log('doc = ', doc); throw e; }

				try {
					debug.assert(att1).typeOf('object').instanceOf(nopg.Attachment);
					assert.strictEqual(att1.$documents_id, doc.$id);
				} catch(e) { debug.log('att1 = ', att1); throw e; }

				try {
					debug.assert(att2).typeOf('object').instanceOf(nopg.Attachment);
					assert.strictEqual(att2.$documents_id, doc.$id);
					assert.strictEqual(att2.foo, "bar");
				} catch(e) { debug.log('att2 = ', att2); throw e; }

				var att1_buffer = att1.getBuffer();
				var att2_buffer = att2.getBuffer();

				//debug.log("att1_buffer.length = ", att1_buffer.length);
				//debug.log("att2_buffer.length = ", att2_buffer.length);

				var att1_hash = crypto.createHash('md5').update( att1_buffer ).digest('hex');
				var att2_hash = crypto.createHash('md5').update( att2_buffer ).digest('hex');

				//debug.log("att1_hash = ", att1_hash);
				//debug.log("att2_hash = ", att2_hash);

				try {
					assert.strictEqual(att1_hash, "43e9b43ddebe7cee7fff8e46d258c67f");
				} catch(e) { debug.log('att1_hash = ', att1_hash); throw e; }

				try {
					assert.strictEqual(att2_hash, "7e87855080a7eb8b8dd4a06122fccb44");
				} catch(e) { debug.log('att2_hash = ', att2_hash); throw e; }

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it.skip('can create document with attachments from buffer', function(done){
			var doc;

			var buffer = fs.sync.readFile(  __dirname + '/files/test1.jpg', {'encoding':'hex'} );

			debug.assert(buffer).typeOf('object').instanceOf(Buffer);

			nopg.start(PGCONFIG)
			    .createType("Test-W3tE")({"$schema":{"type":"object"}})
			    .create("Test-W3tE")({"hello":"world"})
			    .createAttachment()(buffer)
				.then(function(db) {

				var type = db.fetch();
				var doc = db.fetch();
				var att1 = db.fetch();

				debug.assert(type).typeOf('object').instanceOf(nopg.Type);
				debug.assert(doc).typeOf('object').instanceOf(nopg.Document);
				debug.assert(att1).typeOf('object').instanceOf(nopg.Attachment);

				assert.strictEqual(att1.$documents_id, doc.$id);

				var att1_buffer = att1.getBuffer();

				debug.assert(att1_buffer).typeOf('object').instanceOf(Buffer);

				//debug.log("att1_buffer.length = ", att1_buffer.length);

				var att1_hash = crypto.createHash('md5').update( att1_buffer ).digest('hex');

				try {
					assert.strictEqual(att1_hash, "43e9b43ddebe7cee7fff8e46d258c67f");
				} catch(e) { debug.log('att1_hash = ', att1_hash); throw e; }

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('can list document with attachments', function(done){
			var doc;

			nopg.start(PGCONFIG)
			    .createType("Test-0qBe")({"$schema":{"type":"object"}})
			    .create("Test-0qBe")({"hello":"world"})
			    .createAttachment()( __dirname + '/files/test1.jpg')
			    .createAttachment()( __dirname + '/files/test2.jpg', {"foo":"bar"})
			    .searchAttachments()()
				.then(function(db) {

				var type = db.fetch();
				var doc = db.fetch();
				var att1 = db.fetch();
				var att2 = db.fetch();
				var atts = db.fetch();

				debug.assert(type).typeOf('object').instanceOf(nopg.Type);
				debug.assert(doc).typeOf('object').instanceOf(nopg.Document);
				debug.assert(att1).typeOf('object').instanceOf(nopg.Attachment);
				debug.assert(att2).typeOf('object').instanceOf(nopg.Attachment);
				debug.assert(atts).typeOf('object').instanceOf(Array);

				assert.strictEqual(att1.$documents_id, doc.$id);
				assert.strictEqual(att2.$documents_id, doc.$id);
				assert.strictEqual(att2.foo, "bar");

				var att1_buffer = att1.getBuffer();
				var att2_buffer = att2.getBuffer();
				var atts_buffers = atts.map(function(a) { return a.getBuffer(); });

				//debug.log("att1_buffer.length = ", att1_buffer.length);
				//debug.log("att2_buffer.length = ", att2_buffer.length);

				var att1_hash = crypto.createHash('md5').update( att1_buffer ).digest('hex');
				var att2_hash = crypto.createHash('md5').update( att2_buffer ).digest('hex');
				var atts_hashes = atts_buffers.map(function(a) { return crypto.createHash('md5').update( a ).digest('hex'); });

				//debug.log("att1_hash = ", att1_hash);
				//debug.log("att2_hash = ", att2_hash);

				assert.strictEqual(att1_hash, "43e9b43ddebe7cee7fff8e46d258c67f");
				assert.strictEqual(att2_hash, "7e87855080a7eb8b8dd4a06122fccb44");

				assert.strictEqual(atts_hashes[0], "43e9b43ddebe7cee7fff8e46d258c67f");
				assert.strictEqual(atts_hashes[1], "7e87855080a7eb8b8dd4a06122fccb44");

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('typed document search by properties with any match', function(done){
			nopg.start(PGCONFIG)
			  .createType("TestdtIWxj5c")()
			  .create("TestdtIWxj5c")({"foo":1,"bar":"foobar"})
			  .create("TestdtIWxj5c")({"foo":2,"bar":"hello"})
			  .create("TestdtIWxj5c")({"foo":3})
			  .search("TestdtIWxj5c")({"bar":"hello", "foo":1}, {"match":"any"})
			  .then(function(db) {
				var type = db.fetch();
				var item0 = db.fetch();
				var item1 = db.fetch();
				var item2 = db.fetch();
				var items = db.fetch();

				assert.strictEqual(type.$name, "TestdtIWxj5c");

				assert.strictEqual(item0.foo, 1);
				assert.strictEqual(item0.bar, "foobar");
				assert.strictEqual(item1.bar, "hello");
				assert.strictEqual(item1.bar, "hello");
				assert.strictEqual(item2.foo, 3);

				assert.strictEqual(items.length, 2);

				assert.strictEqual(item0.foo, items[0].foo);
				assert.strictEqual(item0.bar, items[0].bar);

				assert.strictEqual(item1.foo, items[1].foo);
				assert.strictEqual(item1.bar, items[1].bar);

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('typed document search by properties with order', function(done){
			nopg.start(PGCONFIG)
			  .createType("Testj0LidL")()
			  .create("Testj0LidL")({"foo":"Hello"})
			  .create("Testj0LidL")({"foo":"Bar"})
			  .create("Testj0LidL")({"foo":"World"})
			  .search("Testj0LidL")(undefined, {"order":"foo"})
			  .then(function(db) {
				var type = db.fetch();
				var item0 = db.fetch();
				var item1 = db.fetch();
				var item2 = db.fetch();
				var items = db.fetch();

				assert.strictEqual(type.$name, "Testj0LidL");

				assert.strictEqual(item0.foo, "Hello");
				assert.strictEqual(item1.foo, "Bar");
				assert.strictEqual(item2.foo, "World");

				assert.strictEqual(items.length, 3);

				assert.strictEqual(item1.foo, items[0].foo);
				assert.strictEqual(item0.foo, items[1].foo);
				assert.strictEqual(item2.foo, items[2].foo);

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('typed document search by properties with array logic', function(done){
			nopg.start(PGCONFIG)
			  .createType("TestAATxICz0")()
			  .create("TestAATxICz0")({"index":1,"bar":"foobar"})
			  .create("TestAATxICz0")({"index":2,"bar":"hello"})
			  .create("TestAATxICz0")({"index":3})
			  .create("TestAATxICz0")({"index":4,"bar":"foo"})
			  .create("TestAATxICz0")({"index":5,"bar":"hello"})
			  .search("TestAATxICz0")(["OR", {"index":3}, ["AND", {"bar":"hello"}, {"index":5}]])
			  .then(function(db) {
				var type = db.fetch();
				var item0 = db.fetch();
				var item1 = db.fetch();
				var item2 = db.fetch();
				var item3 = db.fetch();
				var item4 = db.fetch();
				var items = db.fetch();

				assert.strictEqual(type.$name, "TestAATxICz0");


				assert.strictEqual(item0.index, 1);
				assert.strictEqual(item0.bar, "foobar");

				assert.strictEqual(item1.index, 2);
				assert.strictEqual(item1.bar, "hello");

				assert.strictEqual(item2.index, 3);

				assert.strictEqual(item3.index, 4);
				assert.strictEqual(item3.bar, "foo");

				assert.strictEqual(item4.index, 5);
				assert.strictEqual(item4.bar, "hello");


				assert.strictEqual(items.length, 2);

				assert.strictEqual(item2.index, items[0].index);

				assert.strictEqual(item4.index, items[1].index);
				assert.strictEqual(item4.bar, items[1].bar);

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		it('typed document search with selected fields', function(done){
			nopg.start(PGCONFIG)
			  .createType("TestIjvIqtC1")()
			  .create("TestIjvIqtC1")({"foo":1,"bar":"hello"})
			  .create("TestIjvIqtC1")({"foo":2,"bar":"hello"})
			  .create("TestIjvIqtC1")({"foo":3})
			  .search("TestIjvIqtC1")({"bar":"hello"}, {'fields': ['foo'] })
			  .then(function(db) {
				var type = db.fetch();
				var item0 = db.fetch();
				var item1 = db.fetch();
				var item2 = db.fetch();
				var items = db.fetch();

				assert.strictEqual(type.$name, "TestIjvIqtC1");

				assert.strictEqual(item0.foo, 1);
				assert.strictEqual(item0.bar, "hello");

				assert.strictEqual(item1.foo, 2);
				assert.strictEqual(item1.bar, "hello");

				assert.strictEqual(item2.foo, 3);
				assert.strictEqual(item2.bar, undefined);

				assert.strictEqual(items.length, 2);

				assert.strictEqual(items[0].foo, 1);
				assert.strictEqual(items[0].bar, undefined);

				assert.strictEqual(items[1].foo, 2);
				assert.strictEqual(items[1].bar, undefined);

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				if(err.stack) {
					debug.log('stack: ' + err.stack);
				}
				done(err);
			}).done();
		});

		/* */
		it('typed document search using custom function', function(done){
			nopg.start(PGCONFIG)
			  .createType("Test2jiArvj8")()
			  .create("Test2jiArvj8")({"foo":1})
			  .create("Test2jiArvj8")({"foo":2})
			  .create("Test2jiArvj8")({"foo":3})
			  .search("Test2jiArvj8")(["BIND", "foo", function(foo, limit) { return foo >= limit; }, 2])
			  .then(function(db) {
				var type = db.fetch();
				var item0 = db.fetch();
				var item1 = db.fetch();
				var item2 = db.fetch();
				var items = db.fetch();

				assert.strictEqual(type.$name, "Test2jiArvj8");

				assert.strictEqual(item0.foo, 1);
				assert.strictEqual(item1.foo, 2);
				assert.strictEqual(item2.foo, 3);

				assert.strictEqual(items.length, 2);
				assert.strictEqual(item1.foo, items[0].foo);
				assert.strictEqual(item2.foo, items[1].foo);

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		/** */
		it('typed document creation and single fetching by ID', function(done){
			var type;
			nopg.start(PGCONFIG).createType("TestQgBYjQsQ")({"$schema":{"type":"object"}}).create("TestQgBYjQsQ")({"hello":"world"}).then(function(db) {
				type = db.fetch();

				try {
					debug.assert(type).is('object');
					debug.assert(type.$events).is('object');
					debug.assert(type.$id).is('uuid');
					debug.assert(type.$name).is('string').equals("TestQgBYjQsQ");
					debug.assert(type.$schema).is('object');
					//debug.assert(type.$validator).is('function');
					debug.assert(type.$meta).is('object');
					debug.assert(type.$created).is('date string');
					debug.assert(type.$modified).is('date string');

					debug.assert( Object.keys(type).filter(not_in(['$events', '$id', '$name', '$schema', '$validator', '$meta', '$created', '$modified'])) ).is('array').length(0);
				} catch(e) {
					debug.log('type = ', type);
					throw e;
				}

				var doc = db.fetch();

				try {
					debug.assert(doc).is('object');
					debug.assert(doc.hello).is('string').equals('world');
					debug.assert(doc.$events).is('object');
					debug.assert(doc.$id).is('uuid');
					debug.assert(doc.$content).is('object');
					debug.assert(doc.$types_id).is('uuid').equals(type.$id);
					debug.assert(doc.$created).is('date string');
					debug.assert(doc.$modified).is('date string');
					debug.assert(doc.$type).is('string').equals('TestQgBYjQsQ');

					debug.assert( Object.keys(doc).filter(not_in(['hello', '$events', '$id', '$content', '$types_id', '$created', '$modified', '$type'])) ).is('array').length(0);
				} catch(e) {
					debug.log('doc = ', doc);
					throw e;
				}

				return db.searchSingle('TestQgBYjQsQ')({'$id': doc.$id});
			}).then(function(db) {
				var doc = db.fetch();

				try {
					debug.assert(doc).is('object');
					debug.assert(doc.hello).is('string').equals('world');
					debug.assert(doc.$events).is('object');
					debug.assert(doc.$id).is('uuid');
					debug.assert(doc.$content).is('object');
					debug.assert(doc.$types_id).is('uuid').equals(type.$id);
					debug.assert(doc.$created).is('date string');
					debug.assert(doc.$modified).is('date string');
					debug.assert(doc.$type).is('string').equals('TestQgBYjQsQ');

					debug.assert( Object.keys(doc).filter(not_in(['hello', '$events', '$id', '$content', '$types_id', '$created', '$modified', '$type'])) ).is('array').length(0);
				} catch(e) {
					debug.log('doc = ', doc);
					throw e;
				}

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

		/** */
		it('typed document creation and single fetching by ID with field list', function(done){
			var type;
			nopg.start(PGCONFIG).createType("TestgJBvMX")({"$schema":{"type":"object"}}).create("TestgJBvMX")({"hello":"world"}).then(function(db) {
				type = db.fetch();

				try {
					debug.assert(type).is('object');
					debug.assert(type.$events).is('object');
					debug.assert(type.$id).is('uuid');
					debug.assert(type.$name).is('string').equals("TestgJBvMX");
					debug.assert(type.$schema).is('object');
					//debug.assert(type.$validator).is('function');
					debug.assert(type.$meta).is('object');
					debug.assert(type.$created).is('date string');
					debug.assert(type.$modified).is('date string');

					debug.assert( Object.keys(type).filter(not_in(['$events', '$id', '$name', '$schema', '$validator', '$meta', '$created', '$modified'])) ).is('array').length(0);
				} catch(e) {
					debug.log('type = ', type);
					throw e;
				}

				var doc = db.fetch();

				try {
					debug.assert(doc).is('object');
					debug.assert(doc.hello).is('string').equals('world');
					debug.assert(doc.$events).is('object');
					debug.assert(doc.$id).is('uuid');
					debug.assert(doc.$content).is('object');
					debug.assert(doc.$types_id).is('uuid').equals(type.$id);
					debug.assert(doc.$created).is('date string');
					debug.assert(doc.$modified).is('date string');
					debug.assert(doc.$type).is('string').equals('TestgJBvMX');

					debug.assert( Object.keys(doc).filter(not_in(['hello', '$events', '$id', '$content', '$types_id', '$created', '$modified', '$type'])) ).is('array').length(0);
				} catch(e) {
					debug.log('doc = ', doc);
					throw e;
				}

				return db.searchSingle('TestgJBvMX')({'$id': doc.$id}, {'fields': ['$id', '$content', '$types_id', '$created', '$modified', '$type']});
			}).then(function(db) {
				var doc = db.fetch();

				try {
					debug.assert(doc).is('object');
					debug.assert(doc.hello).is('string').equals('world');
					debug.assert(doc.$events).is('object');
					debug.assert(doc.$id).is('uuid');
					debug.assert(doc.$content).is('object');
					debug.assert(doc.$types_id).is('uuid').equals(type.$id);
					debug.assert(doc.$created).is('date string');
					debug.assert(doc.$modified).is('date string');
					debug.assert(doc.$type).is('string').equals('TestgJBvMX');

					debug.assert( Object.keys(doc).filter(not_in(['hello', '$events', '$id', '$content', '$types_id', '$created', '$modified', '$type'])) ).is('array').length(0);
				} catch(e) {
					debug.log('doc = ', doc);
					throw e;
				}

				return db.commit();
			}).then(function(db) {
				done();
			}).fail(function(err) {
				debug.log('Database query failed: ' + err);
				done(err);
			}).done();
		});

// End of tests

	});

});

/* EOF */
