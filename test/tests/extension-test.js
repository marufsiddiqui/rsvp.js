/*global describe, specify, it, assert */

if (typeof Object.getPrototypeOf !== "function") {
  Object.getPrototypeOf = "".__proto__ === String.prototype
    ? function (object) {
      return object.__proto__;
    }
    : function (object) {
      // May break if the constructor has been tampered with
      return object.constructor.prototype;
    };
}

function keysOf(object) {
  var results = [];

  for (var key in object) {
    if (object.hasOwnProperty(key)) {
      results.push(key);
    }
  }

  return results;
}

var g = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this;
var RSVP = g.adapter.RSVP;
var assert = require('assert');

var o_create = Object.create || function(o, props) {
  function F() {}
  F.prototype = o;

  if (typeof(props) === "object") {
    for (var prop in props) {
      if (props.hasOwnProperty((prop))) {
        F[prop] = props[prop];
      }
    }
  }
  return new F();
};

function objectEquals(obj1, obj2) {
  for (var i in obj1) {
    if (obj1.hasOwnProperty(i)) {
      if (!obj2.hasOwnProperty(i)) return false;
      if (obj1[i] != obj2[i]) return false;
    }
  }
  for (var i in obj2) {
    if (obj2.hasOwnProperty(i)) {
      if (!obj1.hasOwnProperty(i)) return false;
      if (obj1[i] != obj2[i]) return false;
    }
  }
  return true;
}

describe("RSVP extensions", function() {
  describe("self fulfillment", function(){
    it("treats self fulfillment as the recursive base case", function(done){
      var aDefer = new RSVP.defer(),
      bDefer = new RSVP.defer(),
      promiseA = aDefer.promise,
      promiseB = bDefer.promise;

      promiseA.then(function(a){
        setTimeout(function(){
          bDefer.resolve(promiseB);
        }, 1);

        return promiseB;
      });

      promiseB.then(function(c){
        done();
      })

      aDefer.resolve(promiseA);
    });
  });

  describe("Promise constructor", function() {
    it('should exist and have length 2', function() {
      assert(RSVP.Promise);
      assert.equal(RSVP.Promise.length, 2);
    });

    it('should fulfill if `resolve` is called with a value', function(done) {
      var promise = new RSVP.Promise(function(resolve) { resolve('value'); });

      promise.then(function(value) {
        assert.equal(value, 'value');
        done();
      });
    });

    it('should reject if `reject` is called with a reason', function(done) {
      var promise = new RSVP.Promise(function(resolve, reject) { reject('reason'); });

      promise.then(function() {
        assert(false);
        done();
      }, function(reason) {
        assert.equal(reason, 'reason');
        done();
      });
    });

    it('should be a constructor', function() {
      var promise = new RSVP.Promise(function() {});

      assert.equal(Object.getPrototypeOf(promise), RSVP.Promise.prototype, '[[Prototype]] equals Promise.prototype');
      assert.equal(promise.constructor, RSVP.Promise, 'constructor property of instances is set correctly');
      assert.equal(RSVP.Promise.prototype.constructor, RSVP.Promise, 'constructor property of prototype is set correctly');
    });

    it('should NOT work without `new`', function() {
      assert.throws(function(){
        RSVP.Promise(function(resolve) { resolve('value'); });
      }, TypeError)
    });

    it('should throw a `TypeError` if not given a function', function() {
      assert.throws(function () {
        new RSVP.Promise();
      }, TypeError);

      assert.throws(function () {
        new RSVP.Promise({});
      }, TypeError);

      assert.throws(function () {
        new RSVP.Promise('boo!');
      }, TypeError);
    });

    it('should reject on resolver exception', function(done) {
     new RSVP.Promise(function() {
        throw 'error';
      }).then(null, function(e) {
        assert.equal(e, 'error');
        done();
      });
    });

    it('should not resolve multiple times', function(done) {
      var resolver, rejector, fulfilled = 0, rejected = 0;
      var thenable = {
        then: function(resolve, reject) {
          resolver = resolve;
          rejector = reject;
        }
      };

      var promise = new RSVP.Promise(function(resolve) {
        resolve(1);
      });

      promise.then(function(value){
        return thenable;
      }).then(function(value){
        fulfilled++;
      }, function(reason) {
        rejected++;
      });

      setTimeout(function() {
        resolver(1);
        resolver(1);
        rejector(1);
        rejector(1);

        setTimeout(function() {
          assert.equal(fulfilled, 1);
          assert.equal(rejected, 0);
          done();
        }, 20);
      }, 20);

    });

    it('should not resolve multiple times even if not settled', function() {
      var promise = new RSVP.Promise(function(resolve) {
        resolve(new RSVP.Promise(function(resolve) {
          setTimeout(function(){
            resolve(1);
          }, 10);
        }));

        resolve(RSVP.Promise.resolve(2));
      });

      return promise.then(function(val) {
        assert.equal(val, 1);
      });
    });

    it('should not reject if already resolved (and not settled)', function() {
      var promise = new RSVP.Promise(function(resolve, reject) {
        resolve(new RSVP.Promise(function(resolve) {
          setTimeout(function(){
            resolve(1);
          }, 10);
        }));

        reject(new Error());
      });

      return promise.then(function(val) {
        assert.equal(val, 1);
      }, function(){
        assert(false, 'should not have rejected');
      });
    });

    describe('assimilation', function() {
      it('should assimilate if `resolve` is called with a fulfilled promise', function(done) {
        var originalPromise = new RSVP.Promise(function(resolve) { resolve('original value'); });
        var promise = new RSVP.Promise(function(resolve) { resolve(originalPromise); });

        promise.then(function(value) {
          assert.equal(value, 'original value');
          done();
        });
      });

      it('should assimilate if `resolve` is called with a rejected promise', function(done) {
        var originalPromise = new RSVP.Promise(function(resolve, reject) { reject('original reason'); });
        var promise = new RSVP.Promise(function(resolve) { resolve(originalPromise); });

        promise.then(function() {
          assert(false);
          done();
        }, function(reason) {
          assert.equal(reason, 'original reason');
          done();
        });
      });

      it('should assimilate if `resolve` is called with a fulfilled thenable', function(done) {
        var originalThenable = {
          then: function (onFulfilled) {
            setTimeout(function() { onFulfilled('original value'); }, 0);
          }
        };
        var promise = new RSVP.Promise(function(resolve) { resolve(originalThenable); });

        promise.then(function(value) {
          assert.equal(value, 'original value');
          done();
        });
      });

      it('should assimilate if `resolve` is called with a rejected thenable', function(done) {
        var originalThenable = {
          then: function (onFulfilled, onRejected) {
            setTimeout(function() { onRejected('original reason'); }, 0);
          }
        };
        var promise = new RSVP.Promise(function(resolve) { resolve(originalThenable); });

        promise.then(function() {
          assert(false);
          done();
        }, function(reason) {
          assert.equal(reason, 'original reason');
          done();
        });
      });


      it('should assimilate two levels deep, for fulfillment of self fulfilling promises', function(done) {
        var originalPromise, promise;
        originalPromise = new RSVP.Promise(function(resolve) {
          setTimeout(function() {
            resolve(originalPromise);
          }, 0)
        });

        promise = new RSVP.Promise(function(resolve) {
          setTimeout(function() {
            resolve(originalPromise);
          }, 0);
        });

        promise.then(function(value) {
          assert.equal(value, originalPromise);
          done();
        });
      });

      it('should assimilate two levels deep, for fulfillment', function(done) {
        var originalPromise = new RSVP.Promise(function(resolve) { resolve('original value'); });
        var nextPromise = new RSVP.Promise(function(resolve) { resolve(originalPromise); });
        var promise = new RSVP.Promise(function(resolve) { resolve(nextPromise); });

        promise.then(function(value) {
          assert.equal(value, 'original value');
          done();
        });
      });

      it('should assimilate two levels deep, for rejection', function(done) {
        var originalPromise = new RSVP.Promise(function(resolve, reject) { reject('original reason'); });
        var nextPromise = new RSVP.Promise(function(resolve) { resolve(originalPromise); });
        var promise = new RSVP.Promise(function(resolve) { resolve(nextPromise); });

        promise.then(function() {
          assert(false);
          done();
        }, function(reason) {
          assert.equal(reason, 'original reason');
          done();
        });
      });

      it('should assimilate three levels deep, mixing thenables and promises (fulfilled case)', function(done) {
        var originalPromise = new RSVP.Promise(function(resolve) { resolve('original value'); });
        var intermediateThenable = {
          then: function (onFulfilled) {
            setTimeout(function() { onFulfilled(originalPromise); }, 0);
          }
        };
        var promise = new RSVP.Promise(function(resolve) { resolve(intermediateThenable); });

        promise.then(function(value) {
          assert.equal(value, 'original value');
          done();
        });
      });

      it('should assimilate three levels deep, mixing thenables and promises (rejected case)', function(done) {
        var originalPromise = new RSVP.Promise(function(resolve, reject) { reject('original reason'); });
        var intermediateThenable = {
          then: function (onFulfilled) {
            setTimeout(function() { onFulfilled(originalPromise); }, 0);
          }
        };
        var promise = new RSVP.Promise(function(resolve) { resolve(intermediateThenable); });

        promise.then(function() {
          assert(false);
          done();
        }, function(reason) {
          assert.equal(reason, 'original reason');
          done();
        });
      });
    });
  });

  describe("RSVP.defer", function() {
    specify("It should return a resolver and promise together", function(done) {
      var deferred = RSVP.defer(), value = {};

      // resolve first to confirm that the semantics are async
      deferred.resolve(value);

      deferred.promise.then(function(passedValue) {
        assert(passedValue === value);
        done();
      });
    });

    specify("The provided resolver should support rejection", function(done) {
      var deferred = RSVP.defer(), reason = {};

      // resolve first to confirm that the semantics are async
      deferred.reject(reason);

      deferred.promise.then(null, function(passedReason) {
        assert(passedReason === reason);
        done();
      });
    });
  });

  describe("RSVP.denodeify", function() {
    specify('it should exist', function() {
      assert(RSVP.denodeify);
    });

    specify('calls node function with any arguments passed', function(done) {
      var args = null;

      function nodeFunc(arg1, arg2, arg3, cb) {
        args = [arg1, arg2, arg3];
        cb();
      }

      var denodeifiedFunc = RSVP.denodeify(nodeFunc);

      denodeifiedFunc(1, 2, 3).then(function() {
        assert(objectEquals(args, [1, 2, 3]));
        done();
      });
    });

    specify('waits for promise/thenable arguments to settle before passing them to the node function', function(done) {
      var args = null;

      function nodeFunc(arg1, arg2, arg3, cb) {
        args = [arg1, arg2, arg3];
        cb();
      }

      var denodeifiedFunc = RSVP.denodeify(nodeFunc);

      var promise = new RSVP.Promise(function(resolve) { resolve(1); });
      var thenable = { then: function (onFulfilled) { onFulfilled(2); } };
      var nonPromise = 3;
      denodeifiedFunc(promise, thenable, nonPromise).then(function() {
        assert(objectEquals(args, [1, 2, 3]));
        done();
      });
    });

    specify('fulfilled with value if node function calls back with a single argument', function(done) {
      function nodeFunc(cb) {
        cb(null, 'nodeFuncResult');
      }

      var denodeifiedFunc = RSVP.denodeify(nodeFunc);

      denodeifiedFunc().then(function(value) {
        assert.equal(value, 'nodeFuncResult');
        done();
      });
    });

    specify('fulfilled with array if if user called RSVP.denodeify(nodeFunc, true)', function(done) {
      function nodeFunc(cb) {
        cb(null, 1, 2, 3);
      }

      var denodeifiedFunc = RSVP.denodeify(nodeFunc, true);

      denodeifiedFunc().then(function(value) {
        assert(objectEquals(value, [1, 2, 3]));
        done();
      });
    });

    specify('fulfilled with hash if if user called RSVP.denodeify with an array as second argument', function(done) {
      function nodeFunc(cb) {
        cb(null, 1, 2, 3);
      }

      var denodeifiedFunc = RSVP.denodeify(nodeFunc, ['a', 'b', 'c']);

      denodeifiedFunc().then(function(value) {
        assert.equal(value.a, '1');
        assert.equal(value.b, '2');
        assert.equal(value.c, '3');
        done();
      });
    });

    specify('fulfilled with just the first value if node function returns an array', function(done) {
      function nodeFunc(cb) {
        cb(null, 42, 2, 3);
      }

      var denodeifiedFunc = RSVP.denodeify(nodeFunc);

      denodeifiedFunc().then(function(value) {
        assert.equal(value, 42);
        done();
      });
    });

    specify('rejected if node function calls back with error', function(done) {
      function nodeFunc(cb) {
        cb('bad!');
      }

      var denodeifiedFunc = RSVP.denodeify(nodeFunc);

      denodeifiedFunc().then(function() {
        assert(false);
        done();
      }, function(reason) {
        assert.equal(reason, 'bad!');
        done();
      });
    });

    specify('rejected if node function throws an exception synchronously', function(done) {
      function nodeFunc(cb) {
        throw 'bad!';
      }

      var denodeifiedFunc = RSVP.denodeify(nodeFunc);

      denodeifiedFunc().then(function() {
        assert(false);
        done();
      }, function(reason) {
        assert.equal(reason, 'bad!');
        done();
      });
    });

    if (Object.prototype.hasOwnProperty('__proto__')) {
      specify('should inherit from node function', function() {
        function nodeFunc(cb) {
          cb(undefined, 'hello');
        }
        nodeFunc.something = 'test123';

        var denodeifiedFunc = RSVP.denodeify(nodeFunc);

        assert.equal(denodeifiedFunc.something, 'test123');

        denodeifiedFunc().then(function(result) {
          assert.equal(result, 'hello');
          assert.equal(denodeifiedFunc.something, 'test123');
        }, function() {
          assert.equal(false);
        });
      });
    }

    specify('integration test showing how awesome this can be', function(done) {
      function readFile(fileName, cb) {
        setTimeout(function() {
          cb(null, 'contents of ' + fileName);
        }, 0);
      }

      var writtenTo = null;
      function writeFile(fileName, text, cb) {
        setTimeout(function () {
          writtenTo = [fileName, text];
          cb();
        }, 0);
      }

      var denodeifiedReadFile = RSVP.denodeify(readFile);
      var denodeifiedWriteFile = RSVP.denodeify(writeFile);

      denodeifiedWriteFile('dest.txt', denodeifiedReadFile('src.txt')).then(function () {
        assert(objectEquals(writtenTo, ['dest.txt', 'contents of src.txt']));
        done();
      });
    });


    specify('integration test showing how awesome this can be (with promise subclass)', function(done) {
      function readFile(fileName, cb) {
        setTimeout(function() {
          cb(null, 'contents of ' + fileName);
        }, 0);
      }

      var writtenTo = null;
      function writeFile(fileName, text, cb) {
        setTimeout(function () {
          writtenTo = [fileName, text];
          cb();
        }, 0);
      }

      function SuchSubclass(resolve) {
        this._super$constructor(resolve);
      }

      SuchSubclass.prototype = o_create(RSVP.Promise.prototype);
      SuchSubclass.prototype.constructor = SuchSubclass;
      SuchSubclass.prototype._super$constructor = RSVP.Promise;

      var denodeifiedWriteFile = RSVP.denodeify(writeFile);

      var file = new SuchSubclass(function(resolve) {
        readFile('src.txt', function(error, content) {
          if (error) {
            reject(error);
          } else {
            resolve(content);
          }
        });
      });

      denodeifiedWriteFile('dest.txt', file).then(function () {
        assert(objectEquals(writtenTo, ['dest.txt', 'contents of src.txt']));
        done();
      });
    });
  });

  describe("RSVP.hash", function() {
    it('should exist', function() {
      assert(RSVP.hash);
    });

    specify('fulfilled only after all of the promise values are fulfilled', function(done) {
      var firstResolved, secondResolved, firstResolver, secondResolver;

      var first = new RSVP.Promise(function(resolve) {
        firstResolver = resolve;
      });
      first.then(function() {
        firstResolved = true;
      });

      var second = new RSVP.Promise(function(resolve) {
        secondResolver = resolve;
      });
      second.then(function() {
        secondResolved = true;
      });

      setTimeout(function() {
        firstResolver(true);
      }, 0);

      setTimeout(function() {
        secondResolver(true);
      }, 0);

      RSVP.hash({
        first: first,
        second: second
      }).then(function(values) {
        assert(values.first);
        assert(values.second);
        done();
      });
    });

    specify('rejected as soon as a promise is rejected', function(done) {
      var firstResolver, secondResolver;

      var first = new RSVP.Promise(function(resolve, reject) {
        firstResolver = { resolve: resolve, reject: reject };
      });

      var second = new RSVP.Promise(function(resolve, reject) {
        secondResolver = { resolve: resolve, reject: reject };
      });

      setTimeout(function() {
        firstResolver.reject({});
      }, 0);

      var firstWasRejected, secondCompleted;

      first['catch'](function(){
        firstWasRejected = true;
      });

      second['finally'](function(){
        secondCompleted = true;
      });

      RSVP.hash({
        first: first,
        second: second
      }).then(function() {
        assert(false);
        done();
      }, function() {
        assert(firstWasRejected);
        assert(!secondCompleted);
        done();
      });
    });

    specify('resolves an empty hash passed to RSVP.hash()', function(done) {
      RSVP.hash({}).then(function(results) {
        assert(objectEquals(results, {}), 'expected fulfillment');
        done();
      });
    });

    specify('works with null', function(done) {
      RSVP.hash({foo: null}).then(function(results) {
        assert(objectEquals(results.foo, null));
        done();
      });
    });

    specify('works with a truthy value', function(done) {
      RSVP.hash({foo: 1}).then(function(results) {
        assert(objectEquals(results.foo, true));
        done();
      });
    });

    specify('works with a mix of promises and thenables and non-promises', function(done) {
      var promise = new RSVP.Promise(function(resolve) {
        resolve(1);
      });

      var syncThenable = {
        then: function (onFulfilled) {
          onFulfilled(2);
        }
      };

      var asyncThenable = {
        then: function (onFulfilled) {
          setTimeout(function() {
            onFulfilled(3);
          }, 0);
        }
      };

      var nonPromise = 4;

      RSVP.hash({
        promise: promise,
        syncThenable: syncThenable,
        asyncThenable: asyncThenable,
        nonPromise: nonPromise
      }).then(function(results) {
        assert(objectEquals(results, {
          promise: 1,
          syncThenable: 2,
          asyncThenable: 3,
          nonPromise: 4
        }));
        done();
      });
    });

  });

  describe("RSVP.hashSettled", function() {
    it('should exist', function() {
      assert(RSVP.hashSettled);
    });

    specify('fulfilled only after all of the promise values are fulfilled', function(done) {
      var firstResolved, secondResolved, firstResolver, secondResolver;

      var first = new RSVP.Promise(function(resolve) {
        firstResolver = resolve;
      });
      first.then(function() {
        firstResolved = true;
      });

      var second = new RSVP.Promise(function(resolve) {
        secondResolver = resolve;
      });
      second.then(function() {
        secondResolved = true;
      });

      setTimeout(function() {
        firstResolver(true);
      }, 0);

      setTimeout(function() {
        secondResolver(true);
      }, 0);

      RSVP.hashSettled({ first: first, second: second }).then(function(values) {
        assert(values.first);
        assert(values.second);
        done();
      });
    });

    specify('fulfills correctly when constituent promises reject', function(done) {
      var rejectedPromise = new RSVP.Promise(function(resolve, reject) {
        reject(new Error('WHOOPS'));
      });
      var entries = { rejectedPromise: rejectedPromise };
      RSVP.hashSettled(entries).then(function(results) {
        assert(results.rejectedPromise.state, 'rejected' );
        assert(results.rejectedPromise.reason.message, 'WHOOPS' );
        done();
      }, function(reason) {
        assert(false);
        done();
      });
    });

    specify('resolves an empty hash passed to RSVP.hashSettled()', function(done) {
      RSVP.hashSettled({}).then(function(results) {
        assert(objectEquals(results, {}), 'expected fulfillment');
        done();
      });
    });

    specify('works with null', function(done) {
      RSVP.hashSettled({foo: null}).then(function(results) {
        assert(objectEquals(results.foo, {state: 'fulfilled', value: null} ));
        done();
      });
    });

    specify('works with a truthy value', function(done) {
      RSVP.hashSettled({foo: 1}).then(function(results) {
        assert(objectEquals(results.foo, {state: 'fulfilled', value: true} ));
        done();
      });
    });

    specify('works with promises, thenables, non-promises and rejected promises', function(done) {
      var promise = new RSVP.Promise(function(resolve) { resolve(1); });
      var syncThenable = { then: function (onFulfilled) { onFulfilled(2); } };
      var asyncThenable = { then: function (onFulfilled) { setTimeout(function() { onFulfilled(3); }, 0); } };
      var nonPromise = 4;
      var rejectedPromise = new RSVP.Promise(function(resolve, reject) {
        reject(new Error('WHOOPS'));
      });

      var entries = {
        promise: promise,
        syncThenable: syncThenable,
        asyncThenable: asyncThenable,
        nonPromise: nonPromise,
        rejectedPromise: rejectedPromise
      };

      RSVP.hashSettled(entries).then(function(results) {
        assert(objectEquals(results.promise,       {state: 'fulfilled', value: 1} ));
        assert(objectEquals(results.syncThenable,  {state: 'fulfilled', value: 2} ));
        assert(objectEquals(results.asyncThenable, {state: 'fulfilled', value: 3} ));
        assert(objectEquals(results.nonPromise,    {state: 'fulfilled', value: 4} ));
        assert(results.rejectedPromise.state, 'rejected' );
        assert(results.rejectedPromise.reason.message, 'WHOOPS' );
        done();
      });
    });
  });


  describe("RSVP.all", function() {
    testAll(RSVP.all);
  });

  describe("RSVP.Promise.all", function() {
    testAll(function(){
      return RSVP.Promise.all.apply(RSVP.Promise, arguments);
    });
  });

  function testAll(all) {
    it('should exist', function() {
      assert(all);
    });

    it('throws when not passed an array', function(done) {
      var nothing = assertRejection(all());
      var string  = assertRejection(all(''));
      var object  = assertRejection(all({}));

      RSVP.Promise.all([
        nothing,
        string,
        object
      ]).then(function(){ done(); });
    });

    specify('fulfilled only after all of the other promises are fulfilled', function(done) {
      var firstResolved, secondResolved, firstResolver, secondResolver;

      var first = new RSVP.Promise(function(resolve) {
        firstResolver = resolve;
      });
      first.then(function() {
        firstResolved = true;
      });

      var second = new RSVP.Promise(function(resolve) {
        secondResolver = resolve;
      });
      second.then(function() {
        secondResolved = true;
      });

      setTimeout(function() {
        firstResolver(true);
      }, 0);

      setTimeout(function() {
        secondResolver(true);
      }, 0);

      all([first, second]).then(function() {
        assert(firstResolved);
        assert(secondResolved);
        done();
      });
    });

    specify('rejected as soon as a promise is rejected', function(done) {
      var firstResolver, secondResolver;

      var first = new RSVP.Promise(function(resolve, reject) {
        firstResolver = { resolve: resolve, reject: reject };
      });

      var second = new RSVP.Promise(function(resolve, reject) {
        secondResolver = { resolve: resolve, reject: reject };
      });

      setTimeout(function() {
        firstResolver.reject({});
      }, 0);

      var firstWasRejected, secondCompleted;

      first['catch'](function(){
        firstWasRejected = true;
      });

      second['finally'](function(){
        secondCompleted = true;
      });

      all([first, second]).then(function() {
        assert(false);
      }, function() {
        assert(firstWasRejected);
        assert(!secondCompleted);
        done();
      });
    });

    specify('passes the resolved values of each promise to the callback in the correct order', function(done) {
      var firstResolver, secondResolver, thirdResolver;

      var first = new RSVP.Promise(function(resolve, reject) {
        firstResolver = { resolve: resolve, reject: reject };
      });

      var second = new RSVP.Promise(function(resolve, reject) {
        secondResolver = { resolve: resolve, reject: reject };
      });

      var third = new RSVP.Promise(function(resolve, reject) {
        thirdResolver = { resolve: resolve, reject: reject };
      });

      thirdResolver.resolve(3);
      firstResolver.resolve(1);
      secondResolver.resolve(2);

      all([first, second, third]).then(function(results) {
        assert(results.length === 3);
        assert(results[0] === 1);
        assert(results[1] === 2);
        assert(results[2] === 3);
        done();
      });
    });

    specify('resolves an empty array passed to all()', function(done) {
      all([]).then(function(results) {
        assert(results.length === 0);
        done();
      });
    });

    specify('works with null', function(done) {
      all([null]).then(function(results) {
        assert.equal(results[0], null);
        done();
      });
    });

    specify('works with a mix of promises and thenables and non-promises', function(done) {
      var promise = new RSVP.Promise(function(resolve) { resolve(1); });
      var syncThenable = { then: function (onFulfilled) { onFulfilled(2); } };
      var asyncThenable = { then: function (onFulfilled) { setTimeout(function() { onFulfilled(3); }, 0); } };
      var nonPromise = 4;

      all([promise, syncThenable, asyncThenable, nonPromise]).then(function(results) {
        assert(objectEquals(results, [1, 2, 3, 4]));
        done();
      })['catch'](done);
    });
  }

  describe("RSVP.allSettled", function() {
    it('should exist', function() {
      assert(RSVP.allSettled);
    });

    it('throws when not passed an array', function(done) {
      var nothing = assertRejection(RSVP.allSettled());
      var string  = assertRejection(RSVP.allSettled(''));
      var object  = assertRejection(RSVP.allSettled({}));

      RSVP.Promise.all([
        nothing,
        string,
        object
      ]).then(function(){ done(); });
    });

    specify('resolves an empty array passed to allSettled()', function(done) {
      RSVP.allSettled([]).then(function(results) {
        assert(results.length === 0);
        done();
      });
    });

    specify('works with promises, thenables, non-promises and rejected promises',
      function(done) {
        var promise = new RSVP.Promise(function(resolve) { resolve(1); });
        var syncThenable = { then: function (onFulfilled) { onFulfilled(2); } };
        var asyncThenable = {
          then: function (onFulfilled) {
            setTimeout(function() { onFulfilled(3); }, 0);
          }
        };
        var nonPromise = 4;
        var rejectedPromise = new RSVP.Promise(function(resolve, reject) {
          reject(new Error('WHOOPS'));
        });

        var entries = new Array(
          promise, syncThenable, asyncThenable, nonPromise, rejectedPromise
        );

        RSVP.allSettled(entries).then(function(results) {
          assert(objectEquals(results[0], {state: "fulfilled", value: 1} ));
          assert(objectEquals(results[1], {state: "fulfilled", value: 2} ));
          assert(objectEquals(results[2], {state: "fulfilled", value: 3} ));
          assert(objectEquals(results[3], {state: "fulfilled", value: 4} ));
          assert(results[4].state, "rejected");
          assert(results[4].reason.message, "WHOOPS");
          done();
        });
      }
    );

    specify('fulfilled only after all of the other promises are fulfilled', function(done) {
      var firstResolved, secondResolved, firstResolver, secondResolver;

      var first = new RSVP.Promise(function(resolve) {
        firstResolver = resolve;
      });
      first.then(function() {
        firstResolved = true;
      });

      var second = new RSVP.Promise(function(resolve) {
        secondResolver = resolve;
      });
      second.then(function() {
        secondResolved = true;
      });

      setTimeout(function() {
        firstResolver(true);
      }, 0);

      setTimeout(function() {
        secondResolver(true);
      }, 0);

      RSVP.allSettled([first, second]).then(function() {
        assert(firstResolved);
        assert(secondResolved);
        done();
      });
    });

  });

  describe("RSVP.reject", function(){
    specify("it should exist", function(){
      assert(RSVP.reject);
    });

    describe('it rejects', function(){
      var reason = 'the reason',
      promise = RSVP.reject(reason);

      promise.then(function(){
        assert(false, 'should not fulfill');
      }, function(actualReason){
        assert.equal(reason, actualReason);
      });
    });
  });

  describe("RSVP.on", function(){
    afterEach(function() {
      RSVP.off('error');
    });

    it("can be off'd", function(){
      var broCount = 0;
      var obj = {};
      RSVP.EventTarget.mixin(obj);

      function brohandler(){
        broCount++;
      }

      obj.on('bro', brohandler);

      assert.equal(broCount, 0, 'bro was only trigged once');

      obj.trigger('bro');

      assert.equal(broCount, 1, 'bro was only trigged once');

      obj.off('bro', brohandler);
      obj.trigger('bro');

      assert.equal(broCount, 1, 'bro was only trigged once');
    });

    it("When provided, any unhandled exceptions are sent to it", function(done) {
      var thrownError = new Error();

      RSVP.on('error', function(reason) {
        assert.equal(reason, thrownError, "The thrown error is passed in");
        done();
      });

      new RSVP.Promise(function(resolve, reject) {
        reject(thrownError);
      });
    });

    it("When provided, handled exceptions are not sent to it", function(done) {
      var thrownError = new Error();

      RSVP.on('error', function(event) {
        assert(false, "Should not get here");
      });

      var promise = new RSVP.Promise(function(resolve, reject) {
        reject(thrownError);
      });

      promise.then(null, function(error) {
        assert.equal(error, thrownError, "The handler should handle the error");
        done();
      });
    });

    it("finally should not 'handle' errors (1)", function(done) {
      var thrownError = new Error();

      RSVP.on('error', function(event) {
        assert(true, 'Should get here');
        done();
      });

      var promise = new RSVP.Promise(function(resolve, reject) {
        reject(thrownError);
      });

      promise.finally(function(error) {

      });
    });

    it("finally should not 'handle' errors (2)", function(done) {
      var thrownError = new Error();

      RSVP.on('error', function(event) {
        assert(true, 'Should get here');
        done();
      });

      var promise = new RSVP.Promise(function(resolve, reject) {
        reject(thrownError);
      });

      promise.then().finally(function(error) {

      });
    });

    it("finally should not 'handle' errors (3)", function(done) {
      var thrownError = new Error();

      RSVP.on('error', function(event) {
        assert(false, 'Should not get here');
        done();
      });

      var promise = new RSVP.Promise(function(resolve, reject) {
        reject(thrownError);
      });

      promise.then().finally(function(error) {

      }).then(null, function() {
        assert(true);
        done();
      });
    });

    it("finally should trigger onError when its callback throws", function(done) {
      var thrownError = new Error();
      var finallyError = new Error("OMG");

      RSVP.on('error', function(event) {
        assert(true, 'Should get here');
        assert.equal(finallyError, event, "correct error is triggered");
        done();
      });

      var promise = new RSVP.Promise(function(resolve, reject) {
        reject(thrownError);
      });

      promise.then().finally(function(error) {
        throw finallyError;
      });
    });

    it("finally should trigger onError when its callback rejects", function(done) {
      var thrownError = new Error();
      var finallyError = new Error("OMG");

      RSVP.on('error', function(event) {
        assert(true, 'Should get here');
        assert.equal(finallyError, event, "correct error is triggered");
        done();
      });

      var promise = new RSVP.Promise(function(resolve, reject) {
        reject(thrownError);
      });

      promise.then().finally(function(error) {
        return RSVP.reject(finallyError);
      });
    });

  });

  function assertRejection(promise) {
    return promise.then(function(){
      assert(false, 'expected rejection, but got fulfillment');
    }, function(reason){
      assert(reason instanceof Error);
    });
  }

  function testRace(race) {
    it("should exist", function() {
      assert(race);
    });

    it("throws when not passed an array", function(done) {
      var nothing = assertRejection(race());
      var string  = assertRejection(race(''));
      var object  = assertRejection(race({}));

      RSVP.Promise.all([
        nothing,
        string,
        object
      ]).then(function(){ done(); });
    });

    specify('fulfilled after one of the other promises are fulfilled', function(done) {
      var firstResolved, secondResolved, firstResolver, secondResolver;

      var first = new RSVP.Promise(function(resolve) {
        firstResolver = resolve;
      });
      first.then(function() {
        firstResolved = true;
      });

      var second = new RSVP.Promise(function(resolve) {
        secondResolver = resolve;
      });
      second.then(function() {
        secondResolved = true;
      });

      setTimeout(function() {
        firstResolver(true);
      }, 100);

      setTimeout(function() {
        secondResolver(true);
      }, 0);

      race([first, second]).then(function() {
        assert(secondResolved);
        assert.equal(firstResolved, undefined);
        done();
      });
    });

    specify('the race begins on nextTurn and prioritized by array entry', function(done) {
      var firstResolver, secondResolver, nonPromise = 5;

      var first = new RSVP.Promise(function(resolve, reject) {
        resolve(true);
      });

      var second = new RSVP.Promise(function(resolve, reject) {
        resolve(false);
      });

      race([first, second, nonPromise]).then(function(value) {
        assert.equal(value, true);
        done();
      });
    });

    specify('rejected as soon as a promise is rejected', function(done) {
      var firstResolver, secondResolver;

      var first = new RSVP.Promise(function(resolve, reject) {
        firstResolver = { resolve: resolve, reject: reject };
      });

      var second = new RSVP.Promise(function(resolve, reject) {
        secondResolver = { resolve: resolve, reject: reject };
      });

      setTimeout(function() {
        firstResolver.reject({});
      }, 0);

      var firstWasRejected, secondCompleted;

      first['catch'](function(){
        firstWasRejected = true;
      });

      second['finally'](function(){
        secondCompleted = true;
      });

      race([first, second]).then(function() {
        assert(false);
      }, function() {
        assert(firstWasRejected);
        assert(!secondCompleted);
        done();
      });
    });

    specify('resolves an empty array to forever pending Promise', function(done) {
      var foreverPendingPromise = RSVP.race([]),
          wasSettled            = false;

      foreverPendingPromise.then(function() {
        wasSettled = true;
      }, function() {
        wasSettled = true;
      });

      setTimeout(function() {
        assert(!wasSettled);
        done();
      }, 100);
    });

    specify('works with a mix of promises and thenables', function(done) {
      var promise = new RSVP.Promise(function(resolve) { setTimeout(function() { resolve(1); }, 10); }),
          syncThenable = { then: function (onFulfilled) { onFulfilled(2); } };

      race([promise, syncThenable]).then(function(result) {
        assert(result, 2);
        done();
      });
    });

    specify('works with a mix of thenables and non-promises', function (done) {
      var asyncThenable = { then: function (onFulfilled) { setTimeout(function() { onFulfilled(3); }, 0); } },
          nonPromise = 4;
      race([asyncThenable, nonPromise]).then(function(result) {
        assert(result, 4);
        done();
      });
    });
  }

  describe("RSVP.race", function() {
    testRace(RSVP.race);
  });

  describe("RSVP.Promise.race", function() {
    testRace(function(){
      return RSVP.Promise.race.apply(RSVP.Promise, arguments);
    });
  });

  describe("RSVP.onerror", function(){
    var onerror;

    afterEach(function() {
      RSVP.off('error');
    });

    it("When provided, any unhandled exceptions are sent to it (false positive case)", function(done) {
      var thrownError = new Error();

      RSVP.configure('onerror', function(error) {
        assert.equal(error, thrownError, "The thrown error is passed in");
        done();
      });

      new RSVP.Promise(function(resolve, reject) {
        reject(thrownError);
      }).then(function() {
        // doesn't get here
        assert(false);
      });
    });

    it("When provided, handled exceptions are not sent to it", function(done) {
      var thrownError = new Error();

      RSVP.configure('onerror', function(error) {
        assert(false, "Should not get here");
      });

      new RSVP.Promise(function(resolve, reject) {
        reject(thrownError);
      }).then(null, function(error) {
        assert.equal(error, thrownError, "The handler should handle the error");
        done();
      });
    });

    it("Enumerator: When provided, any unhandled exceptions are sent to it", function(done) {
      var thrownError = new Error();

      RSVP.configure('onerror', function(error) {
        assert.equal(error, thrownError, "The thrown error is passed in");
        done();
      });

      var promise = new RSVP.Promise(function(resolve, reject) {
        reject(thrownError);
      });

      RSVP.Promise.all([promise]).then(function() {
        // doesn't get here
        assert(false);
      });
    });

    it("all When provided, handled exceptions are not sent to it", function(done) {
      var thrownError = new Error();

      RSVP.configure('onerror', function(error) {
        assert(false, "Should not get here");
      });

      var promise = new RSVP.Promise(function(resolve, reject) {
        reject(thrownError);
      });

      RSVP.Promise.all([promise]).then(undefined, function(reason) {
        assert.equal(reason, thrownError, "The handler should handle the error");
        done();
      });
    });

    it("assimilation: When provided, handled exceptions are not sent to it", function(done) {
      var thrownError = new Error();

      RSVP.configure('onerror', function(error) {
        assert(false, "Should not get here");
      });

      RSVP.Promise.resolve().then(function(){
        return RSVP.Promise.reject(thrownError);
      }).then(undefined, function(reason) {
        assert.equal(reason, thrownError, "The handler should handle the error");
        done();
      });
    });

    it("zalgo: When provided, unhandled exceptions are sent to it", function(done) {
      var thrownError = new Error();

      RSVP.configure('onerror', function(error) {
        assert(true, "should also have emitted onerror");
        assert.equal(error, thrownError, "The handler should handle the error");
        done();
      });

      var rejected = RSVP.Promise.reject(thrownError);

      RSVP.Promise.resolve().then(function(){
        return rejected;
      });
    });


    it("assimilation: When provided, unhandled exceptions are sent to it", function(done) {
      var thrownError = new Error();

      RSVP.configure('onerror', function(error) {
        assert(true, "Should get here once");
        done();
      });

      var promise = new RSVP.Promise(function(resolve, reject) {
        reject(thrownError);
      });

      RSVP.Promise.resolve().then(function(){
        return promise;
      });
    });

    it("When provided, any unhandled exceptions are sent to it, even from inside error handlers", function(done) {
      var firstError = new Error();
      var secondError = new Error();

      RSVP.on('error', function(reason) {
        assert.equal(reason, secondError, "The thrown error is passed in");
        done();
      });

      new RSVP.Promise(function(resolve, reject) {
        reject(firstError);
      }).catch(function(err) {
        assert.equal(err, firstError, "The first error is handled");
        return new RSVP.Promise(function(resolve, reject) {
          reject(secondError);
        });
      });
    });

    it('does not emit if handled by the end of the current turn', function(done){
      var rejectionCount = 0;
      var reason = new Error('Rejection Reason');

      RSVP.on('error', function(event){
        assert(false, 'should not have errored');
        done();
      });

      var promise = RSVP.Promise.reject(reason);
      RSVP.Promise.resolve().then(function() {
        promise.catch(function() {
          done();
        });
      });
    });

  });

  describe("RSVP.resolve", function(){
    specify("it should exist", function(){
      assert(RSVP.resolve);
    });

    describe("1. If x is a promise, adopt its state ", function(){
      specify("1.1 If x is pending, promise must remain pending until x is fulfilled or rejected.", function(done){
        var expectedValue, resolver, thenable, wrapped;

        expectedValue = 'the value';
        thenable = {
          then: function(resolve, reject){
            resolver = resolve;
          }
        };

        wrapped = RSVP.resolve(thenable);

        wrapped.then(function(value){
          assert(value === expectedValue);
          done();
        });

        setTimeout(function(){
          resolver(expectedValue);
        }, 10);
      });

      specify("1.2 If/when x is fulfilled, fulfill promise with the same value.", function(done){
        var expectedValue, thenable, wrapped;

        expectedValue = 'the value';
        thenable = {
          then: function(resolve, reject){
            resolve(expectedValue);
          }
        };

        wrapped = RSVP.resolve(thenable);

        wrapped.then(function(value){
          assert(value === expectedValue);
          done();
        })
      });

      specify("1.3 If/when x is rejected, reject promise with the same reason.", function(done){
        var expectedError, thenable, wrapped;

        expectedError =  new Error();
        thenable = {
          then: function(resolve, reject){
            reject(expectedError);
          }
        };

        wrapped = RSVP.resolve(thenable);

        wrapped.then(null, function(error){
          assert(error === expectedError);
          done();
        });
      });
    });

    describe("2. Otherwise, if x is an object or function,", function(){
      specify("2.1 Let then x.then", function(done){
        var accessCount, resolver, wrapped, thenable;

        accessCount = 0;
        thenable = { };

        // we likely don't need to test this, if the browser doesn't support it
        if (typeof Object.defineProperty !== "function") { done(); return; }

        Object.defineProperty(thenable, 'then', {
          get: function(){
            accessCount++;

            if (accessCount > 1) {
              throw new Error();
            }

            return function(){ };
          }
        });

        assert(accessCount === 0);

        wrapped = RSVP.resolve(thenable);

        assert(accessCount === 1);

        done();
      });

      specify("2.2 If retrieving the property x.then results in a thrown exception e, reject promise with e as the reason.", function(done){
        var wrapped, thenable, expectedError;

        expectedError = new Error();
        thenable = { };

        // we likely don't need to test this, if the browser doesn't support it
        if (typeof Object.defineProperty !== "function") { done(); return; }

        Object.defineProperty(thenable, 'then', {
          get: function(){
            throw expectedError;
          }
        });

        wrapped = RSVP.resolve(thenable);

        wrapped.then(null, function(error){
          assert(error === expectedError, 'incorrect exception was thrown');
          done();
        });
      });

      describe('2.3. If then is a function, call it with x as this, first argument resolvePromise, and second argument rejectPromise, where', function(){
        specify('2.3.1 If/when resolvePromise is called with a value y, run Resolve(promise, y)', function(done){
          var expectedSuccess, resolver, rejector, thenable, wrapped, calledThis;

          thenable = {
            then: function(resolve, reject){
              calledThis = this;
              resolver = resolve;
              rejector = reject;
            }
          };

          expectedSuccess = 'success';
          wrapped = RSVP.resolve(thenable);

          wrapped.then(function(success){
            assert(calledThis === thenable, 'this must be the thenable');
            assert(success === expectedSuccess, 'rejected promise with x');
            done();
          });

          setTimeout(function() {
            resolver(expectedSuccess);
          }, 20);
        });

        specify('2.3.2 If/when rejectPromise is called with a reason r, reject promise with r.', function(done){
          var expectedError, resolver, rejector, thenable, wrapped, calledThis;

          thenable = {
            then: function(resolve, reject){
              calledThis = this;
              resolver = resolve;
              rejector = reject;
            }
          };

          expectedError = new Error();

          wrapped = RSVP.resolve(thenable);

          wrapped.then(null, function(error){
            assert(error === expectedError, 'rejected promise with x');
            done();
          });

          setTimeout(function() {
            rejector(expectedError);
          }, 20);
        });

        specify("2.3.3 If both resolvePromise and rejectPromise are called, or multiple calls to the same argument are made, the first call takes precedence, and any further calls are ignored", function(done){
          var expectedError, expectedSuccess, resolver, rejector, thenable, wrapped, calledThis,
          calledRejected, calledResolved;

          calledRejected = 0;
          calledResolved = 0;

          thenable = {
            then: function(resolve, reject){
              calledThis = this;
              resolver = resolve;
              rejector = reject;
            }
          };

          expectedError = new Error();

          wrapped = RSVP.resolve(thenable);

          wrapped.then(function(){
            calledResolved++;
          }, function(error){
            calledRejected++;
            assert(calledResolved === 0, 'never resolved');
            assert(calledRejected === 1, 'rejected only once');
            assert(error === expectedError, 'rejected promise with x');
          });

          setTimeout(function() {
            rejector(expectedError);
            rejector(expectedError);

            rejector('foo');

            resolver('bar');
            resolver('baz');
          }, 20);

          setTimeout(function(){
            assert(calledRejected === 1, 'only rejected once');
            assert(calledResolved === 0, 'never resolved');
            done();
          }, 50);
        });

        describe("2.3.4 If calling then throws an exception e", function(){
          specify("2.3.4.1 If resolvePromise or rejectPromise have been called, ignore it.", function(done){
            var expectedSuccess, resolver, rejector, thenable, wrapped, calledThis,
            calledRejected, calledResolved;

            expectedSuccess = 'success';

            thenable = {
              then: function(resolve, reject){
                resolve(expectedSuccess);
                throw expectedError;
              }
            };

            wrapped = RSVP.resolve(thenable);

            wrapped.then(function(success){
              assert(success === expectedSuccess, 'resolved not errored');
              done();
            });
          });

          specify("2.3.4.2 Otherwise, reject promise with e as the reason.", function(done) {
            var expectedError, resolver, rejector, thenable, wrapped, calledThis, callCount;

            expectedError = new Error();
            callCount = 0;

            thenable = { then: function() { throw expectedError; } };

            wrapped = RSVP.resolve(thenable);

            wrapped.then(null, function(error){
              callCount++;
              assert(expectedError === error, 'expected the correct error to be rejected');
              done();
            });

            assert(callCount === 0, 'expected async, was sync');
          });
        });
      });

      specify("2.4 If then is not a function, fulfill promise with x", function(done){
        var expectedError, resolver, rejector, thenable, wrapped, calledThis, callCount;

        thenable = { then: 3 };
        callCount = 0;
        wrapped = RSVP.resolve(thenable);

        wrapped.then(function(success){
          callCount++;
          assert(thenable === success, 'fulfilled promise with x');
          done();
        });

        assert(callCount === 0, 'expected async, was sync');
      });
    });

    describe("3. If x is not an object or function, ", function(){
      specify("fulfill promise with x.", function(done){
        var thenable, callCount, wrapped;

        thenable = null;
        callCount = 0;
        wrapped = RSVP.resolve(thenable);

        wrapped.then(function(success){
          callCount++;
          assert(success === thenable, 'fulfilled promise with x');
          done();
        }, function(a){
          assert(false, 'should not also reject');
        });

        assert(callCount === 0, 'expected async, was sync');
      });
    });
  });

  describe("inspection", function(){
    beforeEach(function () {
      RSVP.configure('instrument', true);
    });

    afterEach(function(){
      RSVP.configure('instrument', false);
    });

    describe("when `instrument` is falsy", function () {
      beforeEach(function () {
        RSVP.configure('instrument', false);
      });

      afterEach(function(){
        RSVP.off('created');
        RSVP.off('chained');
        RSVP.off('fulfilled');
        RSVP.off('rejected');
      });

      specify("created is not fired", function (done) {
        RSVP.on('created', function () {
          assert(false, 'created erroneously fired');
        });

        RSVP.resolve().then(done);
      });

      specify("chained is not fired", function (done) {
        RSVP.on('chained', function () {
          assert(false, 'chained erroneously fired');
        });

        RSVP.resolve().then(done);
      });

      specify("fulfilled is not fired", function (done) {
        RSVP.on('fulfilled', function () {
          assert(false, 'fulfilled erroneously fired');
        });

        RSVP.resolve().then(done);
      });

      specify("rejected is not fired", function (done) {
        RSVP.on('rejected', function () {
          assert(false, 'rejected erroneously fired');
        });

        RSVP.reject()['catch'](done);
      });
    });

    function parseGuid(guid){
      var matches = guid.match(/rsvp_(\d+)-(\d+)/);

      if (matches) {
        return {
          key: matches[1],
          index: parseInt(matches[2], 10)
        };
      } else {
        throw new Error('unknown guid:' + guid);
      }
    }

    describe("creation", function(){
      afterEach(function(){
        RSVP.off('created');
        RSVP.configure('instrument', false);
      });

      beforeEach(function () {
        RSVP.configure('instrument', true);
      });

      specify("it emits a creation event", function(done){
        var creationCount = 0;
        var promise;
        var deferred;

        RSVP.on('created', function(event){
          assert(true, 'event was called');
          assert.equal(creationCount, 0 ,'creation event was only emitted once');
          creationCount++;

          var parsedGuid = parseGuid(event.guid);

          assert(event.guid, 'has a guid');
          assert(parsedGuid.key, 'has a key');
          assert(parsedGuid.index, 'has a count');

          assert.equal(event.eventName, 'created');
          assert(event.timeStamp, 'has a timeStamp');
          assert.ok(!event.detail, 'a created event has no detail');

          done();
        });

        deferred = RSVP.defer();
        promise = deferred.promise;
      });

      specify("it emits a unique guid", function(done){
        var creationCount = 0;
        var lastIndex = 0;

        RSVP.on('created', function(event){
          assert(true, 'event was called');
          creationCount++;
          var parsedGuid = parseGuid(event.guid);

          if (creationCount > 1) {
            assert.equal(parsedGuid.index, lastIndex + 1, 'incrementing guid');
            done();
          }

          lastIndex= parsedGuid.index;
        });

        RSVP.defer();
        RSVP.defer();
      });
    });

    describe("rejection", function(done){
      afterEach(function(){
        RSVP.off('rejected');
      });

      specify('emits rejection event', function(done){
        var rejectionCount = 0;
        var reason = new Error('Rejection Reason');

        RSVP.on('rejected', function(event){
          rejectionCount++;
          assert.equal(rejectionCount, 1, 'emitted the rejection event only once');

          assert.equal(event.eventName, 'rejected');
          assert(event.guid, 'has a guid');
          assert.equal(event.detail, reason, 'correct rejection reason');
          assert(event.timeStamp, 'has a timeStamp');

          done();
        });

        var promise = RSVP.reject(reason);
      });
    });

    describe("fulfillment", function(){
      afterEach(function(){
        RSVP.off('fulfilled');
      });

      specify('emits fulfillment event', function(done){
        var fulfillmentCount= 0;
        var value = 'fulfillment value';

        RSVP.on('fulfilled', function(event){
          fulfillmentCount++;
          assert.equal(fulfillmentCount, 1, 'emitted the fulfilment event only once');

          assert.equal(event.eventName, 'fulfilled');
          assert(event.guid, 'has a guid');
          assert.equal(event.detail, value, 'correct fulfillment value');
          assert(event.timeStamp, 'has a timeStamp');

          done();
        });

        var promise = RSVP.resolve(value);
      });
    });

    describe("chained", function(){
      afterEach(function(){
        RSVP.off('chained');
      });

      specify('emits chained event', function(done) {
        var value = 'fulfillment value';
        var promise = RSVP.resolve(value);

        RSVP.on('chained', function(event){
          var parent = event.guid;
          var child = event.childGuid;

          assert(parent, 'has parent');
          assert(child, 'has child');

          var parsedParent = parseGuid(parent);
          var parsedChild  = parseGuid(child);

          assert(parsedParent.key);
          assert(parsedParent.index);

          assert.equal(event.guid, promise._guidKey + promise._id, 'has correct parent reference');

          assert(parsedChild.key);
          assert(parsedChild.index);

          assert.equal(event.eventName, 'chained');
          assert(event.timeStamp, 'has a timeStamp');

          done();
        });

        promise.then();
      });
    });
  });

  describe("RSVP.async", function() {

    var values, originalAsync;
    beforeEach(function() {
      originalAsync = RSVP.configure('async');
      values = [];
    });

    afterEach(function() {
      RSVP.configure('async', originalAsync);
    });

    function append(value) {
      values.push(value);
    }

    function runTest(done) {
      RSVP.resolve(1).then(append);

      RSVP.async(function(value) {
        assert.deepEqual(values, [1]);
        values.push(value);
      }, 2);

      RSVP.resolve(3).then(append);

      RSVP.async(function() {
        assert.deepEqual(values, [1,2,3]);
        if (done) {
          done();
        }
      });
    }

    //it("schedules items to RSVP's internal queue", function(done) {
    //  runTest(done);
    //});

    it("can be configured to use a different schedule via configure('async', fn)", function() {
      var actions = [];
      RSVP.configure('async', function(callback, promise) {
        actions.push([callback, promise]);
      });

      runTest();

      // Flush custom deferred action queue
      while(actions.length) {
        var action = actions.shift();
        action[0](action[1]);
      }
    });
  });

  describe("Promise.finally", function() {
    describe("native finally behaviour", function() {
      describe("no value is passed in", function() {
        it("does not provide a value to the finally code", function(done) {
          var fulfillmentValue = 1;
          var promise = RSVP.resolve(fulfillmentValue);

          promise['finally'](function() {
            assert.equal(arguments.length, 0);
            done();
          });
        });

        it("does not provide a reason to the finally code", function(done) {
          var rejectionReason = new Error();
          var promise = RSVP.reject(rejectionReason);

          promise['finally'](function(arg) {
            assert.equal(arguments.length, 0);
            done();
          });
        });
      });

      describe("non-exceptional cases do not affect the result", function(){
        it("preserves the original fulfillment value even if the finally callback returns a value", function(done) {
          var fulfillmentValue = 1;
          var promise = RSVP.resolve(fulfillmentValue);

          promise['finally'](function() {
            return 2;
          }).then(function(value) {
            assert.equal(fulfillmentValue, value);
            done();
          });
        });

        it("preserves the original rejection reason even if the finally callback returns a value", function(done) {
          var rejectionReason = new Error();
          var promise = RSVP.reject(rejectionReason);

          promise['finally'](function() {
            return 2;
          }).then(undefined, function(reason) {
            assert.equal(rejectionReason, reason);
            done();
          });
        });
      });

      describe("exception cases do propogate the failure", function(){
        describe("fulfilled promise", function(){
          it("propagates changes via throw", function(done) {
            var promise = RSVP.resolve(1);
            var expectedReason  = new Error();

            promise['finally'](function() {
              throw expectedReason;
            }).then(undefined, function(reason) {
              assert.deepEqual(expectedReason, reason);
              done();
            });
          });

          it("propagates changes via returned rejected promise", function(done){
            var promise = RSVP.resolve(1);
            var expectedReason  = new Error();

            promise['finally'](function() {
              return RSVP.reject(expectedReason);
            }).then(undefined, function(reason) {
              assert.deepEqual(expectedReason, reason);
              done();
            });
          });
        });

        describe("rejected promise", function(){
          it("propagates changes via throw", function(done) {
            var promise = RSVP.reject(1);
            var expectedReason  = new Error();

            promise['finally'](function() {
              throw expectedReason;
            }).then(undefined, function(reason) {
              assert.deepEqual(expectedReason, reason);
              done();
            });
          });

          it("propagates changes via returned rejected promise", function(done){
            var promise = RSVP.reject(1);
            var expectedReason  = new Error();

            promise['finally'](function() {
              return RSVP.reject(expectedReason);
            }).then(undefined, function(reason) {
              assert.deepEqual(expectedReason, reason);
              done();
            });
          });
        });
      });
    });

    describe("inheritance", function() {
      function Subclass (resolver) {
        this._promise$constructor(resolver);
      }

      Subclass.prototype = o_create(RSVP.Promise.prototype);
      Subclass.prototype.constructor = Subclass;
      Subclass.prototype._promise$constructor = RSVP.Promise;

      Subclass.resolve = RSVP.Promise.resolve;
      Subclass.reject = RSVP.Promise.reject;
      Subclass.all = RSVP.Promise.all;

      it("preserves correct subclass when chained", function() {
        var promise = Subclass.resolve().finally();
        assert.ok(promise instanceof Subclass);
        assert.equal(promise.constructor, Subclass);
      });

      it("preserves correct subclass when rejected", function() {
        var promise = Subclass.resolve().finally(function() {
          throw new Error("OMG");
        });
        assert.ok(promise instanceof Subclass);
        assert.equal(promise.constructor, Subclass);
      });

      it("preserves correct subclass when someone returns a thenable", function() {
        var promise = Subclass.resolve().finally(function() {
          return RSVP.Promise.resolve(1);
        });
        assert.ok(promise instanceof Subclass);
        assert.equal(promise.constructor, Subclass);
      });
    });
  });

  describe("RSVP.filter", function(){

    var filterFn = function(item){
      return item > 1;
    };

    it("exists", function(){
      assert(RSVP.filter);
    });

    it("returns results that filterFn returns truthy values", function(done){
      var promises = [
        RSVP.resolve(1),
        RSVP.resolve(2),
        RSVP.resolve(3)
      ];

      RSVP.filter(promises, filterFn).then(function(results){
        assert.deepEqual([2, 3], results);
        done();
      }, done);
    });

    it("throws an error if an array is not passed", function(){
      assertRejection(RSVP.filter());
    });

    it("throws an error if a filterFn is not passed", function(){
      assertRejection(RSVP.filter([]));
    });

    it("works with non-promise values and promises", function(done){
      var promises = [
        RSVP.resolve(1),
        RSVP.resolve(2),
        3
      ];

      RSVP.filter(promises, filterFn).then(function(results){
        assert.deepEqual([2, 3], results);
        done();
      },function(reason) {
        done(reason);
      });
    });

    it("waits if filterFn returns a promise", function(done){

      var filterFn = function(item){
        if (item === 1 ) {
          return RSVP.resolve(true);
        }
        return true;
      };
      var promises = [
        RSVP.resolve(1),
        RSVP.resolve(2),
        3
      ];

      var results1 = RSVP.filter(promises, filterFn);

      filterFn = function(item){
        if (item === 1) {
          return RSVP.resolve(false);
        }
        return true;
      }

      var results2 = RSVP.filter(promises, filterFn);

      RSVP.all([results1, results2]).then(function(results){
        var results1 = results[0];
        var results2 = results[1];
        assert.deepEqual(results1, [1, 2, 3]);
        assert.deepEqual(results2, [ 2, 3 ]);
        done();
      }, done);

    });
  });

  describe("RSVP.map", function(){
    var mapFn = function(item){
      return item + 1;
    };

    it("exists", function(){
      assert(RSVP.map);
    });

    it("calls mapFn on all the promises that are resolved", function(done){
      var promise1 = RSVP.resolve(1);
      var promise2 = RSVP.resolve(2);
      var promise3 = RSVP.resolve(3);
      var promises = [ promise1, promise2, promise3 ];

      RSVP.map(promises, mapFn).then(function(results){
        assert.deepEqual([ 2, 3, 4], results);
        done();
      });
    });

    it("throws an error if an array is not passed", function(){
      assertRejection(RSVP.map());
    });

    it("throws an error if a mapFn is not passed", function(){
      assertRejection(RSVP.map([]));
    });

    it("works with non-promise values and promises", function(done){

      var values = [ 1, RSVP.resolve(2) ];

      RSVP.map(values, mapFn).then(function(results){
        assert.deepEqual([2, 3], results);
        done();
      });
    });

    it("becomes rejected with the first promise that becomes rejected", function(done){

      var promises = [
        RSVP.reject(new Error("prefix:1")),
        RSVP.reject(new Error("prefix:2")),
        1
      ];

      RSVP.map(promises, mapFn).then(function(){
        done(new Error("Promise was resolved when it shouldn't have been!"));
      }, function(reason){
        assert(reason.message === "prefix:1");
        done();
      });
    });

    it("waits if a promise is returned from mapFn", function(done){
      var values = [ 1, 2, 3 ];
      var mapFn = function(value){
        return RSVP.resolve(value + 1);
      };

      RSVP.map(values, mapFn).then(function(values){
        assert.deepEqual(values, [ 2, 3, 4 ]);
        done();
      }, done);
    });

    it("becomes rejected if a promise returned from mapFn becomes rejected", function(done){

      var expectedErrorMessage = "must-be-prefixed-with-non-number-for-old-ie:1"
      var values = [ 1, 2, 3 ];
      var mapFn = function(value){
        // http://msdn.microsoft.com/en-us/library/ie/dww53sbt(v=vs.94).aspx
        return RSVP.reject(new Error(expectedErrorMessage));
      };

      RSVP.map(values, mapFn).then(function(){
        done(new Error("Promise should not be resolved!"));
      }, function (reason) {
        assert(reason.message === expectedErrorMessage);
        done();
      });
    });
  });

  if (typeof Worker !== 'undefined') {
    describe('web worker', function () {
      it('should work', function (done) {
        var worker = new Worker('tests/worker.js');
        worker.addEventListener('error', function(reason) {
          done(new Error("Test failed:" + reason));
        });
        worker.addEventListener('message', function (e) {
          worker.terminate();
          assert.equal(e.data, 'pong');
          done();
        });
        worker.postMessage('ping');
      });
    });
  }
});

// thanks to @wizardwerdna for the test case -> https://github.com/tildeio/rsvp.js/issues/66
// Only run these tests in node (phantomjs cannot handle them)
if (typeof module !== 'undefined' && module.exports) {

  describe("using reduce to sum integers using promises", function(){
    var resolve = RSVP.resolve;

    it("should build the promise pipeline without error", function(){
      var array, iters, pZero, i;

      array = [];
      iters = 1000;

      for (i=1; i<=iters; i++) {
        array.push(i);
      }

      pZero = resolve(0);

      array.reduce(function(promise, nextVal) {
        return promise.then(function(currentVal) {
          return resolve(currentVal + nextVal);
        });
      }, pZero);
    });

    it("should get correct answer without blowing the nextTick stack", function(done){
      var pZero, array, iters, result, i;

      pZero = resolve(0);

      array = [];
      iters = 1000;

      for (i=1; i<=iters; i++) {
        array.push(i);
      }

      result = array.reduce(function(promise, nextVal) {
        return promise.then(function(currentVal) {
          return resolve(currentVal + nextVal);
        });
      }, pZero);

      result.then(function(value){
        assert.equal(value, (iters*(iters+1)/2));
        done();
      });
    });
  });

}

var Promise = RSVP.Promise;
// Kudos to @Octane at https://github.com/getify/native-promise-only/issues/5 for this, and @getify for pinging me.
describe("Thenables should not be able to run code during assimilation", function () {
    specify("resolving to a thenable", function () {
        var thenCalled = false;
        var thenable = {
            then: function () {
                thenCalled = true;
            }
        };

        Promise.resolve(thenable);
        assert.strictEqual(thenCalled, false);
    });

    specify("resolving to an evil promise", function () {
        var thenCalled = false;
        var evilPromise = Promise.resolve();
        evilPromise.then = function () {
            thenCalled = true;
        };

        Promise.resolve(evilPromise);
        assert.strictEqual(thenCalled, false);
    });
});
