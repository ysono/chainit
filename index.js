module.exports = chainit;

function chainit(Constructor) {

  function Chain() {
    Constructor.apply(this, arguments);
  }

  var Queue = require('queue');
  var queues = [];
  var currentDepth = 0;

  function pushTo(depth, task) {
    var queue = queues[depth] || (queues[depth] = getNewQueue(depth));
    queue.push(task);
  }

  function getNewQueue(newDepth) {
    var queue = new Queue({
      timeout: 0,
      concurrency: 1
    });

    queue.on('drain', function() {
      if (newDepth > 0) {
        wakeupChain(newDepth);
      }

      if (!queues.slice(newDepth).some(hasPending)) {
        currentDepth = newDepth;
      }
    });

    function wakeupChain(depth) {
      if (!queues[depth + 1] ||
        !queues.slice(depth).some(hasPending)) {
        queues[depth - 1].concurrency = 1;
        queues[depth - 1].process();
      }

      if (depth > 1) {
        wakeupChain(depth - 1);
      } else {
        if (!queues.some(hasPending)) {
          depth = 0;
        }
      }
    }

    return queue;
  }

  function makeChain(fn) {

    return function chained() {
      var ctx = this;
      var args = Array.prototype.slice.call(arguments);
      var customCallback;
      if (typeof args[args.length - 1] === 'function') {
        customCallback = args.pop();
      }

      var ldepth = currentDepth;

      if (currentDepth > 0 && queues[currentDepth - 1].concurrency > 0) {
        queues[currentDepth - 1].concurrency = 0;
      }

      var task = function(callback) {
        setTimeout(function() {
          currentDepth = ldepth + 1;

          args.push(function() {
            var callbackArgs = arguments;
            var customCallbackResult;

            if (customCallback) {
              customCallbackResult = customCallback.apply(ctx, callbackArgs);
            }

            if(customCallbackResult !== false) {
              callback();
            }
          });

          fn.apply(ctx, args);
        }, 0);
      }

      pushTo(currentDepth, task);

      return this;
    };
  }

  Chain.prototype = Object.create(Constructor.prototype);

  // static methods, not chained
  Object.keys(Constructor)
    .forEach(function(name) {
      Chain[name] = new Function(Constructor[name]);
    });

  // prototype methods, chained
  Object.keys(Constructor.prototype)
    .forEach(function(fnName) {
      if(typeof Constructor.prototype[fnName] === 'function') {
        Chain.prototype[fnName] = makeChain(Constructor.prototype[fnName]);
      }
    });

  Chain.prototype.__addToChain = function(fnName, fn) {
    this[fnName] = makeChain(fn);
  }

  return Chain;
}

chainit.add = function add(to, fnName, fn) {
  if (to.prototype && to.prototype.__addToChain) {
    to.prototype.__addToChain(fnName, fn);
  } else {
    to.__addToChain(fnName, fn);
  }
}

function hasPending(queue) {
  return queue.length >= 1;
}