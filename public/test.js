(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
	typeof define === 'function' && define.amd ? define(['exports'], factory) :
	(factory((global.cumulocity = {})));
}(this, (function (exports) { 'use strict';

	var commonjsGlobal = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

	function createCommonjsModule(fn, module) {
		return module = { exports: {} }, fn(module, module.exports), module.exports;
	}

	var cometd = createCommonjsModule(function (module, exports) {
	/*
	 * Copyright (c) 2008-2020 the original author or authors.
	 *
	 * Licensed under the Apache License, Version 2.0 (the "License");
	 * you may not use this file except in compliance with the License.
	 * You may obtain a copy of the License at
	 *
	 *     http://www.apache.org/licenses/LICENSE-2.0
	 *
	 * Unless required by applicable law or agreed to in writing, software
	 * distributed under the License is distributed on an "AS IS" BASIS,
	 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	 * See the License for the specific language governing permissions and
	 * limitations under the License.
	 */

	/* CometD Version 4.0.8 */

	(function(root, factory) {
	    {
	        // CommonJS.
	        module.exports = factory();
	    }
	}(commonjsGlobal, function() {
	    /**
	     * Browsers may throttle the Window scheduler,
	     * so we may replace it with a Worker scheduler.
	     */
	    var Scheduler = function() {
	        var _ids = 0;
	        var _tasks = {};
	        this.register = function(funktion) {
	            var id = ++_ids;
	            _tasks[id] = funktion;
	            return id;
	        };
	        this.unregister = function(id) {
	            var funktion = _tasks[id];
	            delete _tasks[id];
	            return funktion;
	        };
	        this.setTimeout = function(funktion, delay) {
	            return window.setTimeout(funktion, delay);
	        };
	        this.clearTimeout = function(id) {
	            window.clearTimeout(id);
	        };
	    };

	    /**
	     * The scheduler code that will run in the Worker.
	     * Workers have a built-in `self` variable similar to `window`.
	     */
	    function WorkerScheduler() {
	        var _tasks = {};
	        self.onmessage = function(e) {
	            var cmd = e.data;
	            var id = _tasks[cmd.id];
	            switch (cmd.type) {
	                case 'setTimeout':
	                    _tasks[cmd.id] = self.setTimeout(function() {
	                        delete _tasks[cmd.id];
	                        self.postMessage({
	                            id: cmd.id
	                        });
	                    }, cmd.delay);
	                    break;
	                case 'clearTimeout':
	                    delete _tasks[cmd.id];
	                    if (id) {
	                        self.clearTimeout(id);
	                    }
	                    break;
	                default:
	                    throw 'Unknown command ' + cmd.type;
	            }
	        };
	    }


	    /**
	     * Utility functions.
	     */
	    var Utils = {
	        isString: function(value) {
	            if (value === undefined || value === null) {
	                return false;
	            }
	            return typeof value === 'string' || value instanceof String;
	        },
	        isArray: function(value) {
	            if (value === undefined || value === null) {
	                return false;
	            }
	            return value instanceof Array;
	        },
	        /**
	         * Returns whether the given element is contained into the given array.
	         * @param element the element to check presence for
	         * @param array the array to check for the element presence
	         * @return the index of the element, if present, or a negative index if the element is not present
	         */
	        inArray: function(element, array) {
	            for (var i = 0; i < array.length; ++i) {
	                if (element === array[i]) {
	                    return i;
	                }
	            }
	            return -1;
	        }
	    };


	    /**
	     * A registry for transports used by the CometD object.
	     */
	    var TransportRegistry = function() {
	        var _types = [];
	        var _transports = {};

	        this.getTransportTypes = function() {
	            return _types.slice(0);
	        };

	        this.findTransportTypes = function(version, crossDomain, url) {
	            var result = [];
	            for (var i = 0; i < _types.length; ++i) {
	                var type = _types[i];
	                if (_transports[type].accept(version, crossDomain, url) === true) {
	                    result.push(type);
	                }
	            }
	            return result;
	        };

	        this.negotiateTransport = function(types, version, crossDomain, url) {
	            for (var i = 0; i < _types.length; ++i) {
	                var type = _types[i];
	                for (var j = 0; j < types.length; ++j) {
	                    if (type === types[j]) {
	                        var transport = _transports[type];
	                        if (transport.accept(version, crossDomain, url) === true) {
	                            return transport;
	                        }
	                    }
	                }
	            }
	            return null;
	        };

	        this.add = function(type, transport, index) {
	            var existing = false;
	            for (var i = 0; i < _types.length; ++i) {
	                if (_types[i] === type) {
	                    existing = true;
	                    break;
	                }
	            }

	            if (!existing) {
	                if (typeof index !== 'number') {
	                    _types.push(type);
	                } else {
	                    _types.splice(index, 0, type);
	                }
	                _transports[type] = transport;
	            }

	            return !existing;
	        };

	        this.find = function(type) {
	            for (var i = 0; i < _types.length; ++i) {
	                if (_types[i] === type) {
	                    return _transports[type];
	                }
	            }
	            return null;
	        };

	        this.remove = function(type) {
	            for (var i = 0; i < _types.length; ++i) {
	                if (_types[i] === type) {
	                    _types.splice(i, 1);
	                    var transport = _transports[type];
	                    delete _transports[type];
	                    return transport;
	                }
	            }
	            return null;
	        };

	        this.clear = function() {
	            _types = [];
	            _transports = {};
	        };

	        this.reset = function(init) {
	            for (var i = 0; i < _types.length; ++i) {
	                _transports[_types[i]].reset(init);
	            }
	        };
	    };


	    /**
	     * Base object with the common functionality for transports.
	     */
	    var Transport = function() {
	        var _type;
	        var _cometd;
	        var _url;

	        /**
	         * Function invoked just after a transport has been successfully registered.
	         * @param type the type of transport (for example 'long-polling')
	         * @param cometd the cometd object this transport has been registered to
	         * @see #unregistered()
	         */
	        this.registered = function(type, cometd) {
	            _type = type;
	            _cometd = cometd;
	        };

	        /**
	         * Function invoked just after a transport has been successfully unregistered.
	         * @see #registered(type, cometd)
	         */
	        this.unregistered = function() {
	            _type = null;
	            _cometd = null;
	        };

	        this._debug = function() {
	            _cometd._debug.apply(_cometd, arguments);
	        };

	        this._mixin = function() {
	            return _cometd._mixin.apply(_cometd, arguments);
	        };

	        this.getConfiguration = function() {
	            return _cometd.getConfiguration();
	        };

	        this.getAdvice = function() {
	            return _cometd.getAdvice();
	        };

	        this.setTimeout = function(funktion, delay) {
	            return _cometd.setTimeout(funktion, delay);
	        };

	        this.clearTimeout = function(id) {
	            _cometd.clearTimeout(id);
	        };

	        /**
	         * Converts the given response into an array of bayeux messages
	         * @param response the response to convert
	         * @return an array of bayeux messages obtained by converting the response
	         */
	        this.convertToMessages = function(response) {
	            if (Utils.isString(response)) {
	                try {
	                    return JSON.parse(response);
	                } catch (x) {
	                    this._debug('Could not convert to JSON the following string', '"' + response + '"');
	                    throw x;
	                }
	            }
	            if (Utils.isArray(response)) {
	                return response;
	            }
	            if (response === undefined || response === null) {
	                return [];
	            }
	            if (response instanceof Object) {
	                return [response];
	            }
	            throw 'Conversion Error ' + response + ', typeof ' + (typeof response);
	        };

	        /**
	         * Returns whether this transport can work for the given version and cross domain communication case.
	         * @param version a string indicating the transport version
	         * @param crossDomain a boolean indicating whether the communication is cross domain
	         * @param url the URL to connect to
	         * @return true if this transport can work for the given version and cross domain communication case,
	         * false otherwise
	         */
	        this.accept = function(version, crossDomain, url) {
	            throw 'Abstract';
	        };

	        /**
	         * Returns the type of this transport.
	         * @see #registered(type, cometd)
	         */
	        this.getType = function() {
	            return _type;
	        };

	        this.getURL = function() {
	            return _url;
	        };

	        this.setURL = function(url) {
	            _url = url;
	        };

	        this.send = function(envelope, metaConnect) {
	            throw 'Abstract';
	        };

	        this.reset = function(init) {
	            this._debug('Transport', _type, 'reset', init ? 'initial' : 'retry');
	        };

	        this.abort = function() {
	            this._debug('Transport', _type, 'aborted');
	        };

	        this.toString = function() {
	            return this.getType();
	        };
	    };

	    Transport.derive = function(baseObject) {
	        function F() {
	        }

	        F.prototype = baseObject;
	        return new F();
	    };


	    /**
	     * Base object with the common functionality for transports based on requests.
	     * The key responsibility is to allow at most 2 outstanding requests to the server,
	     * to avoid that requests are sent behind a long poll.
	     * To achieve this, we have one reserved request for the long poll, and all other
	     * requests are serialized one after the other.
	     */
	    var RequestTransport = function() {
	        var _super = new Transport();
	        var _self = Transport.derive(_super);
	        var _requestIds = 0;
	        var _metaConnectRequest = null;
	        var _requests = [];
	        var _envelopes = [];

	        function _coalesceEnvelopes(envelope) {
	            while (_envelopes.length > 0) {
	                var envelopeAndRequest = _envelopes[0];
	                var newEnvelope = envelopeAndRequest[0];
	                var newRequest = envelopeAndRequest[1];
	                if (newEnvelope.url === envelope.url &&
	                    newEnvelope.sync === envelope.sync) {
	                    _envelopes.shift();
	                    envelope.messages = envelope.messages.concat(newEnvelope.messages);
	                    this._debug('Coalesced', newEnvelope.messages.length, 'messages from request', newRequest.id);
	                    continue;
	                }
	                break;
	            }
	        }

	        function _transportSend(envelope, request) {
	            this.transportSend(envelope, request);
	            request.expired = false;

	            if (!envelope.sync) {
	                var maxDelay = this.getConfiguration().maxNetworkDelay;
	                var delay = maxDelay;
	                if (request.metaConnect === true) {
	                    delay += this.getAdvice().timeout;
	                }

	                this._debug('Transport', this.getType(), 'waiting at most', delay, 'ms for the response, maxNetworkDelay', maxDelay);

	                var self = this;
	                request.timeout = this.setTimeout(function() {
	                    request.expired = true;
	                    var errorMessage = 'Request ' + request.id + ' of transport ' + self.getType() + ' exceeded ' + delay + ' ms max network delay';
	                    var failure = {
	                        reason: errorMessage
	                    };
	                    var xhr = request.xhr;
	                    failure.httpCode = self.xhrStatus(xhr);
	                    self.abortXHR(xhr);
	                    self._debug(errorMessage);
	                    self.complete(request, false, request.metaConnect);
	                    envelope.onFailure(xhr, envelope.messages, failure);
	                }, delay);
	            }
	        }

	        function _queueSend(envelope) {
	            var requestId = ++_requestIds;
	            var request = {
	                id: requestId,
	                metaConnect: false,
	                envelope: envelope
	            };

	            // Consider the /meta/connect requests which should always be present.
	            if (_requests.length < this.getConfiguration().maxConnections - 1) {
	                _requests.push(request);
	                _transportSend.call(this, envelope, request);
	            } else {
	                this._debug('Transport', this.getType(), 'queueing request', requestId, 'envelope', envelope);
	                _envelopes.push([envelope, request]);
	            }
	        }

	        function _metaConnectComplete(request) {
	            var requestId = request.id;
	            this._debug('Transport', this.getType(), '/meta/connect complete, request', requestId);
	            if (_metaConnectRequest !== null && _metaConnectRequest.id !== requestId) {
	                throw '/meta/connect request mismatch, completing request ' + requestId;
	            }
	            _metaConnectRequest = null;
	        }

	        function _complete(request, success) {
	            var index = Utils.inArray(request, _requests);
	            // The index can be negative if the request has been aborted
	            if (index >= 0) {
	                _requests.splice(index, 1);
	            }

	            if (_envelopes.length > 0) {
	                var envelopeAndRequest = _envelopes.shift();
	                var nextEnvelope = envelopeAndRequest[0];
	                var nextRequest = envelopeAndRequest[1];
	                this._debug('Transport dequeued request', nextRequest.id);
	                if (success) {
	                    if (this.getConfiguration().autoBatch) {
	                        _coalesceEnvelopes.call(this, nextEnvelope);
	                    }
	                    _queueSend.call(this, nextEnvelope);
	                    this._debug('Transport completed request', request.id, nextEnvelope);
	                } else {
	                    // Keep the semantic of calling response callbacks asynchronously after the request
	                    var self = this;
	                    this.setTimeout(function() {
	                        self.complete(nextRequest, false, nextRequest.metaConnect);
	                        var failure = {
	                            reason: 'Previous request failed'
	                        };
	                        var xhr = nextRequest.xhr;
	                        failure.httpCode = self.xhrStatus(xhr);
	                        nextEnvelope.onFailure(xhr, nextEnvelope.messages, failure);
	                    }, 0);
	                }
	            }
	        }

	        _self.complete = function(request, success, metaConnect) {
	            if (metaConnect) {
	                _metaConnectComplete.call(this, request);
	            } else {
	                _complete.call(this, request, success);
	            }
	        };

	        /**
	         * Performs the actual send depending on the transport type details.
	         * @param envelope the envelope to send
	         * @param request the request information
	         */
	        _self.transportSend = function(envelope, request) {
	            throw 'Abstract';
	        };

	        _self.transportSuccess = function(envelope, request, responses) {
	            if (!request.expired) {
	                this.clearTimeout(request.timeout);
	                this.complete(request, true, request.metaConnect);
	                if (responses && responses.length > 0) {
	                    envelope.onSuccess(responses);
	                } else {
	                    envelope.onFailure(request.xhr, envelope.messages, {
	                        httpCode: 204
	                    });
	                }
	            }
	        };

	        _self.transportFailure = function(envelope, request, failure) {
	            if (!request.expired) {
	                this.clearTimeout(request.timeout);
	                this.complete(request, false, request.metaConnect);
	                envelope.onFailure(request.xhr, envelope.messages, failure);
	            }
	        };

	        function _metaConnectSend(envelope) {
	            if (_metaConnectRequest !== null) {
	                throw 'Concurrent /meta/connect requests not allowed, request id=' + _metaConnectRequest.id + ' not yet completed';
	            }

	            var requestId = ++_requestIds;
	            this._debug('Transport', this.getType(), '/meta/connect send, request', requestId, 'envelope', envelope);
	            var request = {
	                id: requestId,
	                metaConnect: true,
	                envelope: envelope
	            };
	            _transportSend.call(this, envelope, request);
	            _metaConnectRequest = request;
	        }

	        _self.send = function(envelope, metaConnect) {
	            if (metaConnect) {
	                _metaConnectSend.call(this, envelope);
	            } else {
	                _queueSend.call(this, envelope);
	            }
	        };

	        _self.abort = function() {
	            _super.abort();
	            for (var i = 0; i < _requests.length; ++i) {
	                var request = _requests[i];
	                if (request) {
	                    this._debug('Aborting request', request);
	                    if (!this.abortXHR(request.xhr)) {
	                        this.transportFailure(request.envelope, request, {reason: 'abort'});
	                    }
	                }
	            }
	            var metaConnectRequest = _metaConnectRequest;
	            if (metaConnectRequest) {
	                this._debug('Aborting /meta/connect request', metaConnectRequest);
	                if (!this.abortXHR(metaConnectRequest.xhr)) {
	                    this.transportFailure(metaConnectRequest.envelope, metaConnectRequest, {reason: 'abort'});
	                }
	            }
	            this.reset(true);
	        };

	        _self.reset = function(init) {
	            _super.reset(init);
	            _metaConnectRequest = null;
	            _requests = [];
	            _envelopes = [];
	        };

	        _self.abortXHR = function(xhr) {
	            if (xhr) {
	                try {
	                    var state = xhr.readyState;
	                    xhr.abort();
	                    return state !== window.XMLHttpRequest.UNSENT;
	                } catch (x) {
	                    this._debug(x);
	                }
	            }
	            return false;
	        };

	        _self.xhrStatus = function(xhr) {
	            if (xhr) {
	                try {
	                    return xhr.status;
	                } catch (x) {
	                    this._debug(x);
	                }
	            }
	            return -1;
	        };

	        return _self;
	    };


	    var LongPollingTransport = function() {
	        var _super = new RequestTransport();
	        var _self = Transport.derive(_super);
	        // By default, support cross domain
	        var _supportsCrossDomain = true;

	        _self.accept = function(version, crossDomain, url) {
	            return _supportsCrossDomain || !crossDomain;
	        };

	        _self.newXMLHttpRequest = function() {
	            return new window.XMLHttpRequest();
	        };

	        function _copyContext(xhr) {
	            try {
	                // Copy external context, to be used in other environments.
	                xhr.context = _self.context;
	            } catch (e) {
	                // May happen if XHR is wrapped by Object.seal(),
	                // Object.freeze(), or Object.preventExtensions().
	                this._debug('Could not copy transport context into XHR', e);
	            }
	        }

	        _self.xhrSend = function(packet) {
	            var xhr = _self.newXMLHttpRequest();
	            _copyContext(xhr);
	            xhr.withCredentials = true;
	            xhr.open('POST', packet.url, packet.sync !== true);
	            var headers = packet.headers;
	            if (headers) {
	                for (var headerName in headers) {
	                    if (headers.hasOwnProperty(headerName)) {
	                        xhr.setRequestHeader(headerName, headers[headerName]);
	                    }
	                }
	            }
	            xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
	            xhr.onload = function() {
	                if (xhr.status === 200) {
	                    packet.onSuccess(xhr.responseText);
	                } else {
	                    packet.onError(xhr.statusText);
	                }
	            };
	            xhr.onabort = xhr.onerror = function() {
	                packet.onError(xhr.statusText);
	            };
	            xhr.send(packet.body);
	            return xhr;
	        };

	        _self.transportSend = function(envelope, request) {
	            this._debug('Transport', this.getType(), 'sending request', request.id, 'envelope', envelope);

	            var self = this;
	            try {
	                var sameStack = true;
	                request.xhr = this.xhrSend({
	                    transport: this,
	                    url: envelope.url,
	                    sync: envelope.sync,
	                    headers: this.getConfiguration().requestHeaders,
	                    body: JSON.stringify(envelope.messages),
	                    onSuccess: function(response) {
	                        self._debug('Transport', self.getType(), 'received response', response);
	                        var success = false;
	                        try {
	                            var received = self.convertToMessages(response);
	                            if (received.length === 0) {
	                                _supportsCrossDomain = false;
	                                self.transportFailure(envelope, request, {
	                                    httpCode: 204
	                                });
	                            } else {
	                                success = true;
	                                self.transportSuccess(envelope, request, received);
	                            }
	                        } catch (x) {
	                            self._debug(x);
	                            if (!success) {
	                                _supportsCrossDomain = false;
	                                var failure = {
	                                    exception: x
	                                };
	                                failure.httpCode = self.xhrStatus(request.xhr);
	                                self.transportFailure(envelope, request, failure);
	                            }
	                        }
	                    },
	                    onError: function(reason, exception) {
	                        self._debug('Transport', self.getType(), 'received error', reason, exception);
	                        _supportsCrossDomain = false;
	                        var failure = {
	                            reason: reason,
	                            exception: exception
	                        };
	                        failure.httpCode = self.xhrStatus(request.xhr);
	                        if (sameStack) {
	                            // Keep the semantic of calling response callbacks asynchronously after the request
	                            self.setTimeout(function() {
	                                self.transportFailure(envelope, request, failure);
	                            }, 0);
	                        } else {
	                            self.transportFailure(envelope, request, failure);
	                        }
	                    }
	                });
	                sameStack = false;
	            } catch (x) {
	                _supportsCrossDomain = false;
	                // Keep the semantic of calling response callbacks asynchronously after the request
	                this.setTimeout(function() {
	                    self.transportFailure(envelope, request, {
	                        exception: x
	                    });
	                }, 0);
	            }
	        };

	        _self.reset = function(init) {
	            _super.reset(init);
	            _supportsCrossDomain = true;
	        };

	        return _self;
	    };


	    var CallbackPollingTransport = function() {
	        var _super = new RequestTransport();
	        var _self = Transport.derive(_super);
	        var jsonp = 0;

	        _self.accept = function(version, crossDomain, url) {
	            return true;
	        };

	        _self.jsonpSend = function(packet) {
	            var head = document.getElementsByTagName('head')[0];
	            var script = document.createElement('script');

	            var callbackName = '_cometd_jsonp_' + jsonp++;
	            window[callbackName] = function(responseText) {
	                head.removeChild(script);
	                delete window[callbackName];
	                packet.onSuccess(responseText);
	            };

	            var url = packet.url;
	            url += url.indexOf('?') < 0 ? '?' : '&';
	            url += 'jsonp=' + callbackName;
	            url += '&message=' + encodeURIComponent(packet.body);
	            script.src = url;
	            script.async = packet.sync !== true;
	            script.type = 'application/javascript';
	            script.onerror = function(e) {
	                packet.onError('jsonp ' + e.type);
	            };
	            head.appendChild(script);
	        };

	        function _failTransportFn(envelope, request, x) {
	            var self = this;
	            return function() {
	                self.transportFailure(envelope, request, 'error', x);
	            };
	        }

	        _self.transportSend = function(envelope, request) {
	            var self = this;

	            // Microsoft Internet Explorer has a 2083 URL max length
	            // We must ensure that we stay within that length
	            var start = 0;
	            var length = envelope.messages.length;
	            var lengths = [];
	            while (length > 0) {
	                // Encode the messages because all brackets, quotes, commas, colons, etc
	                // present in the JSON will be URL encoded, taking many more characters
	                var json = JSON.stringify(envelope.messages.slice(start, start + length));
	                var urlLength = envelope.url.length + encodeURI(json).length;

	                var maxLength = this.getConfiguration().maxURILength;
	                if (urlLength > maxLength) {
	                    if (length === 1) {
	                        var x = 'Bayeux message too big (' + urlLength + ' bytes, max is ' + maxLength + ') ' +
	                            'for transport ' + this.getType();
	                        // Keep the semantic of calling response callbacks asynchronously after the request
	                        this.setTimeout(_failTransportFn.call(this, envelope, request, x), 0);
	                        return;
	                    }

	                    --length;
	                    continue;
	                }

	                lengths.push(length);
	                start += length;
	                length = envelope.messages.length - start;
	            }

	            // Here we are sure that the messages can be sent within the URL limit

	            var envelopeToSend = envelope;
	            if (lengths.length > 1) {
	                var begin = 0;
	                var end = lengths[0];
	                this._debug('Transport', this.getType(), 'split', envelope.messages.length, 'messages into', lengths.join(' + '));
	                envelopeToSend = this._mixin(false, {}, envelope);
	                envelopeToSend.messages = envelope.messages.slice(begin, end);
	                envelopeToSend.onSuccess = envelope.onSuccess;
	                envelopeToSend.onFailure = envelope.onFailure;

	                for (var i = 1; i < lengths.length; ++i) {
	                    var nextEnvelope = this._mixin(false, {}, envelope);
	                    begin = end;
	                    end += lengths[i];
	                    nextEnvelope.messages = envelope.messages.slice(begin, end);
	                    nextEnvelope.onSuccess = envelope.onSuccess;
	                    nextEnvelope.onFailure = envelope.onFailure;
	                    this.send(nextEnvelope, request.metaConnect);
	                }
	            }

	            this._debug('Transport', this.getType(), 'sending request', request.id, 'envelope', envelopeToSend);

	            try {
	                var sameStack = true;
	                this.jsonpSend({
	                    transport: this,
	                    url: envelopeToSend.url,
	                    sync: envelopeToSend.sync,
	                    headers: this.getConfiguration().requestHeaders,
	                    body: JSON.stringify(envelopeToSend.messages),
	                    onSuccess: function(responses) {
	                        var success = false;
	                        try {
	                            var received = self.convertToMessages(responses);
	                            if (received.length === 0) {
	                                self.transportFailure(envelopeToSend, request, {
	                                    httpCode: 204
	                                });
	                            } else {
	                                success = true;
	                                self.transportSuccess(envelopeToSend, request, received);
	                            }
	                        } catch (x) {
	                            self._debug(x);
	                            if (!success) {
	                                self.transportFailure(envelopeToSend, request, {
	                                    exception: x
	                                });
	                            }
	                        }
	                    },
	                    onError: function(reason, exception) {
	                        var failure = {
	                            reason: reason,
	                            exception: exception
	                        };
	                        if (sameStack) {
	                            // Keep the semantic of calling response callbacks asynchronously after the request
	                            self.setTimeout(function() {
	                                self.transportFailure(envelopeToSend, request, failure);
	                            }, 0);
	                        } else {
	                            self.transportFailure(envelopeToSend, request, failure);
	                        }
	                    }
	                });
	                sameStack = false;
	            } catch (xx) {
	                // Keep the semantic of calling response callbacks asynchronously after the request
	                this.setTimeout(function() {
	                    self.transportFailure(envelopeToSend, request, {
	                        exception: xx
	                    });
	                }, 0);
	            }
	        };

	        return _self;
	    };


	    var WebSocketTransport = function() {
	        var _super = new Transport();
	        var _self = Transport.derive(_super);
	        var _cometd;
	        // By default WebSocket is supported
	        var _webSocketSupported = true;
	        // Whether we were able to establish a WebSocket connection
	        var _webSocketConnected = false;
	        var _stickyReconnect = true;
	        // The context contains the envelopes that have been sent
	        // and the timeouts for the messages that have been sent.
	        var _context = null;
	        var _connecting = null;
	        var _connected = false;
	        var _successCallback = null;

	        _self.reset = function(init) {
	            _super.reset(init);
	            _webSocketSupported = true;
	            if (init) {
	                _webSocketConnected = false;
	            }
	            _stickyReconnect = true;
	            _context = null;
	            _connecting = null;
	            _connected = false;
	        };

	        function _forceClose(context, event) {
	            if (context) {
	                this.webSocketClose(context, event.code, event.reason);
	                // Force immediate failure of pending messages to trigger reconnect.
	                // This is needed because the server may not reply to our close()
	                // and therefore the onclose function is never called.
	                this.onClose(context, event);
	            }
	        }

	        function _sameContext(context) {
	            return context === _connecting || context === _context;
	        }

	        function _storeEnvelope(context, envelope, metaConnect) {
	            var messageIds = [];
	            for (var i = 0; i < envelope.messages.length; ++i) {
	                var message = envelope.messages[i];
	                if (message.id) {
	                    messageIds.push(message.id);
	                }
	            }
	            context.envelopes[messageIds.join(',')] = [envelope, metaConnect];
	            this._debug('Transport', this.getType(), 'stored envelope, envelopes', context.envelopes);
	        }

	        function _websocketConnect(context) {
	            // We may have multiple attempts to open a WebSocket
	            // connection, for example a /meta/connect request that
	            // may take time, along with a user-triggered publish.
	            // Early return if we are already connecting.
	            if (_connecting) {
	                return;
	            }

	            // Mangle the URL, changing the scheme from 'http' to 'ws'.
	            var url = _cometd.getURL().replace(/^http/, 'ws');
	            this._debug('Transport', this.getType(), 'connecting to URL', url);

	            try {
	                var protocol = _cometd.getConfiguration().protocol;
	                context.webSocket = protocol ? new window.WebSocket(url, protocol) : new window.WebSocket(url);
	                _connecting = context;
	            } catch (x) {
	                _webSocketSupported = false;
	                this._debug('Exception while creating WebSocket object', x);
	                throw x;
	            }

	            // By default use sticky reconnects.
	            _stickyReconnect = _cometd.getConfiguration().stickyReconnect !== false;

	            var self = this;
	            var connectTimeout = _cometd.getConfiguration().connectTimeout;
	            if (connectTimeout > 0) {
	                context.connectTimer = this.setTimeout(function() {
	                    _cometd._debug('Transport', self.getType(), 'timed out while connecting to URL', url, ':', connectTimeout, 'ms');
	                    // The connection was not opened, close anyway.
	                    _forceClose.call(self, context, {code: 1000, reason: 'Connect Timeout'});
	                }, connectTimeout);
	            }

	            var onopen = function() {
	                _cometd._debug('WebSocket onopen', context);
	                if (context.connectTimer) {
	                    self.clearTimeout(context.connectTimer);
	                }

	                if (_sameContext(context)) {
	                    _connecting = null;
	                    _context = context;
	                    _webSocketConnected = true;
	                    self.onOpen(context);
	                } else {
	                    // We have a valid connection already, close this one.
	                    _cometd._warn('Closing extra WebSocket connection', this, 'active connection', _context);
	                    _forceClose.call(self, context, {code: 1000, reason: 'Extra Connection'});
	                }
	            };

	            // This callback is invoked when the server sends the close frame.
	            // The close frame for a connection may arrive *after* another
	            // connection has been opened, so we must make sure that actions
	            // are performed only if it's the same connection.
	            var onclose = function(event) {
	                event = event || {code: 1000};
	                _cometd._debug('WebSocket onclose', context, event, 'connecting', _connecting, 'current', _context);

	                if (context.connectTimer) {
	                    self.clearTimeout(context.connectTimer);
	                }

	                self.onClose(context, event);
	            };

	            var onmessage = function(wsMessage) {
	                _cometd._debug('WebSocket onmessage', wsMessage, context);
	                self.onMessage(context, wsMessage);
	            };

	            context.webSocket.onopen = onopen;
	            context.webSocket.onclose = onclose;
	            context.webSocket.onerror = function() {
	                // Clients should call onclose(), but if they do not we do it here for safety.
	                onclose({code: 1000, reason: 'Error'});
	            };
	            context.webSocket.onmessage = onmessage;

	            this._debug('Transport', this.getType(), 'configured callbacks on', context);
	        }

	        function _webSocketSend(context, envelope, metaConnect) {
	            var json = JSON.stringify(envelope.messages);
	            context.webSocket.send(json);
	            this._debug('Transport', this.getType(), 'sent', envelope, '/meta/connect =', metaConnect);

	            // Manage the timeout waiting for the response.
	            var maxDelay = this.getConfiguration().maxNetworkDelay;
	            var delay = maxDelay;
	            if (metaConnect) {
	                delay += this.getAdvice().timeout;
	                _connected = true;
	            }

	            var self = this;
	            var messageIds = [];
	            for (var i = 0; i < envelope.messages.length; ++i) {
	                (function() {
	                    var message = envelope.messages[i];
	                    if (message.id) {
	                        messageIds.push(message.id);
	                        context.timeouts[message.id] = self.setTimeout(function() {
	                            _cometd._debug('Transport', self.getType(), 'timing out message', message.id, 'after', delay, 'on', context);
	                            _forceClose.call(self, context, {code: 1000, reason: 'Message Timeout'});
	                        }, delay);
	                    }
	                })();
	            }

	            this._debug('Transport', this.getType(), 'waiting at most', delay, 'ms for messages', messageIds, 'maxNetworkDelay', maxDelay, ', timeouts:', context.timeouts);
	        }

	        _self._notifySuccess = function(fn, messages) {
	            fn.call(this, messages);
	        };

	        _self._notifyFailure = function(fn, context, messages, failure) {
	            fn.call(this, context, messages, failure);
	        };

	        function _send(context, envelope, metaConnect) {
	            try {
	                if (context === null) {
	                    context = _connecting || {
	                        envelopes: {},
	                        timeouts: {}
	                    };
	                    _storeEnvelope.call(this, context, envelope, metaConnect);
	                    _websocketConnect.call(this, context);
	                } else {
	                    _storeEnvelope.call(this, context, envelope, metaConnect);
	                    _webSocketSend.call(this, context, envelope, metaConnect);
	                }
	            } catch (x) {
	                // Keep the semantic of calling response callbacks asynchronously after the request.
	                var self = this;
	                this.setTimeout(function() {
	                    _forceClose.call(self, context, {
	                        code: 1000,
	                        reason: 'Exception',
	                        exception: x
	                    });
	                }, 0);
	            }
	        }

	        _self.onOpen = function(context) {
	            var envelopes = context.envelopes;
	            this._debug('Transport', this.getType(), 'opened', context, 'pending messages', envelopes);
	            for (var key in envelopes) {
	                if (envelopes.hasOwnProperty(key)) {
	                    var element = envelopes[key];
	                    var envelope = element[0];
	                    var metaConnect = element[1];
	                    // Store the success callback, which is independent from the envelope,
	                    // so that it can be used to notify arrival of messages.
	                    _successCallback = envelope.onSuccess;
	                    _webSocketSend.call(this, context, envelope, metaConnect);
	                }
	            }
	        };

	        _self.onMessage = function(context, wsMessage) {
	            this._debug('Transport', this.getType(), 'received websocket message', wsMessage, context);

	            var close = false;
	            var messages = this.convertToMessages(wsMessage.data);
	            var messageIds = [];
	            for (var i = 0; i < messages.length; ++i) {
	                var message = messages[i];

	                // Detect if the message is a response to a request we made.
	                // If it's a meta message, for sure it's a response; otherwise it's
	                // a publish message and publish responses don't have the data field.
	                if (/^\/meta\//.test(message.channel) || message.data === undefined) {
	                    if (message.id) {
	                        messageIds.push(message.id);

	                        var timeout = context.timeouts[message.id];
	                        if (timeout) {
	                            this.clearTimeout(timeout);
	                            delete context.timeouts[message.id];
	                            this._debug('Transport', this.getType(), 'removed timeout for message', message.id, ', timeouts', context.timeouts);
	                        }
	                    }
	                }

	                if ('/meta/connect' === message.channel) {
	                    _connected = false;
	                }
	                if ('/meta/disconnect' === message.channel && !_connected) {
	                    close = true;
	                }
	            }

	            // Remove the envelope corresponding to the messages.
	            var removed = false;
	            var envelopes = context.envelopes;
	            for (var j = 0; j < messageIds.length; ++j) {
	                var id = messageIds[j];
	                for (var key in envelopes) {
	                    if (envelopes.hasOwnProperty(key)) {
	                        var ids = key.split(',');
	                        var index = Utils.inArray(id, ids);
	                        if (index >= 0) {
	                            removed = true;
	                            ids.splice(index, 1);
	                            var envelope = envelopes[key][0];
	                            var metaConnect = envelopes[key][1];
	                            delete envelopes[key];
	                            if (ids.length > 0) {
	                                envelopes[ids.join(',')] = [envelope, metaConnect];
	                            }
	                            break;
	                        }
	                    }
	                }
	            }
	            if (removed) {
	                this._debug('Transport', this.getType(), 'removed envelope, envelopes', envelopes);
	            }

	            this._notifySuccess(_successCallback, messages);

	            if (close) {
	                this.webSocketClose(context, 1000, 'Disconnect');
	            }
	        };

	        _self.onClose = function(context, event) {
	            this._debug('Transport', this.getType(), 'closed', context, event);

	            if (_sameContext(context)) {
	                // Remember if we were able to connect.
	                // This close event could be due to server shutdown,
	                // and if it restarts we want to try websocket again.
	                _webSocketSupported = _stickyReconnect && _webSocketConnected;
	                _connecting = null;
	                _context = null;
	            }

	            var timeouts = context.timeouts;
	            context.timeouts = {};
	            for (var id in timeouts) {
	                if (timeouts.hasOwnProperty(id)) {
	                    this.clearTimeout(timeouts[id]);
	                }
	            }

	            var envelopes = context.envelopes;
	            context.envelopes = {};
	            for (var key in envelopes) {
	                if (envelopes.hasOwnProperty(key)) {
	                    var envelope = envelopes[key][0];
	                    var metaConnect = envelopes[key][1];
	                    if (metaConnect) {
	                        _connected = false;
	                    }
	                    var failure = {
	                        websocketCode: event.code,
	                        reason: event.reason
	                    };
	                    if (event.exception) {
	                        failure.exception = event.exception;
	                    }
	                    this._notifyFailure(envelope.onFailure, context, envelope.messages, failure);
	                }
	            }
	        };

	        _self.registered = function(type, cometd) {
	            _super.registered(type, cometd);
	            _cometd = cometd;
	        };

	        _self.accept = function(version, crossDomain, url) {
	            this._debug('Transport', this.getType(), 'accept, supported:', _webSocketSupported);
	            // Using !! to return a boolean (and not the WebSocket object).
	            return _webSocketSupported && !!window.WebSocket && _cometd.websocketEnabled !== false;
	        };

	        _self.send = function(envelope, metaConnect) {
	            this._debug('Transport', this.getType(), 'sending', envelope, '/meta/connect =', metaConnect);
	            _send.call(this, _context, envelope, metaConnect);
	        };

	        _self.webSocketClose = function(context, code, reason) {
	            try {
	                if (context.webSocket) {
	                    context.webSocket.close(code, reason);
	                }
	            } catch (x) {
	                this._debug(x);
	            }
	        };

	        _self.abort = function() {
	            _super.abort();
	            _forceClose.call(this, _context, {code: 1000, reason: 'Abort'});
	            this.reset(true);
	        };

	        return _self;
	    };


	    /**
	     * The constructor for a CometD object, identified by an optional name.
	     * The default name is the string 'default'.
	     * @param name the optional name of this cometd object
	     */
	    var CometD = function(name) {
	        var _scheduler = new Scheduler();
	        var _cometd = this;
	        var _name = name || 'default';
	        var _crossDomain = false;
	        var _transports = new TransportRegistry();
	        var _transport;
	        var _status = 'disconnected';
	        var _messageId = 0;
	        var _clientId = null;
	        var _batch = 0;
	        var _messageQueue = [];
	        var _internalBatch = false;
	        var _listenerId = 0;
	        var _listeners = {};
	        var _backoff = 0;
	        var _scheduledSend = null;
	        var _extensions = [];
	        var _advice = {};
	        var _handshakeProps;
	        var _handshakeCallback;
	        var _callbacks = {};
	        var _remoteCalls = {};
	        var _reestablish = false;
	        var _connected = false;
	        var _unconnectTime = 0;
	        var _handshakeMessages = 0;
	        var _metaConnect = null;
	        var _config = {
	            useWorkerScheduler: true,
	            protocol: null,
	            stickyReconnect: true,
	            connectTimeout: 0,
	            maxConnections: 2,
	            backoffIncrement: 1000,
	            maxBackoff: 60000,
	            logLevel: 'info',
	            maxNetworkDelay: 10000,
	            requestHeaders: {},
	            appendMessageTypeToURL: true,
	            autoBatch: false,
	            urls: {},
	            maxURILength: 2000,
	            advice: {
	                timeout: 60000,
	                interval: 0,
	                reconnect: undefined,
	                maxInterval: 0
	            }
	        };

	        function _fieldValue(object, name) {
	            try {
	                return object[name];
	            } catch (x) {
	                return undefined;
	            }
	        }

	        /**
	         * Mixes in the given objects into the target object by copying the properties.
	         * @param deep if the copy must be deep
	         * @param target the target object
	         * @param objects the objects whose properties are copied into the target
	         */
	        this._mixin = function(deep, target, objects) {
	            var result = target || {};

	            // Skip first 2 parameters (deep and target), and loop over the others
	            for (var i = 2; i < arguments.length; ++i) {
	                var object = arguments[i];

	                if (object === undefined || object === null) {
	                    continue;
	                }

	                for (var propName in object) {
	                    if (object.hasOwnProperty(propName)) {
	                        var prop = _fieldValue(object, propName);
	                        var targ = _fieldValue(result, propName);

	                        // Avoid infinite loops
	                        if (prop === target) {
	                            continue;
	                        }
	                        // Do not mixin undefined values
	                        if (prop === undefined) {
	                            continue;
	                        }

	                        if (deep && typeof prop === 'object' && prop !== null) {
	                            if (prop instanceof Array) {
	                                result[propName] = this._mixin(deep, targ instanceof Array ? targ : [], prop);
	                            } else {
	                                var source = typeof targ === 'object' && !(targ instanceof Array) ? targ : {};
	                                result[propName] = this._mixin(deep, source, prop);
	                            }
	                        } else {
	                            result[propName] = prop;
	                        }
	                    }
	                }
	            }

	            return result;
	        };

	        function _isString(value) {
	            return Utils.isString(value);
	        }

	        function _isFunction(value) {
	            if (value === undefined || value === null) {
	                return false;
	            }
	            return typeof value === 'function';
	        }

	        function _zeroPad(value, length) {
	            var result = '';
	            while (--length > 0) {
	                if (value >= Math.pow(10, length)) {
	                    break;
	                }
	                result += '0';
	            }
	            result += value;
	            return result;
	        }

	        function _log(level, args) {
	            if (window.console) {
	                var logger = window.console[level];
	                if (_isFunction(logger)) {
	                    var now = new Date();
	                    [].splice.call(args, 0, 0, _zeroPad(now.getHours(), 2) + ':' + _zeroPad(now.getMinutes(), 2) + ':' +
	                        _zeroPad(now.getSeconds(), 2) + '.' + _zeroPad(now.getMilliseconds(), 3));
	                    logger.apply(window.console, args);
	                }
	            }
	        }

	        this._warn = function() {
	            _log('warn', arguments);
	        };

	        this._info = function() {
	            if (_config.logLevel !== 'warn') {
	                _log('info', arguments);
	            }
	        };

	        this._debug = function() {
	            if (_config.logLevel === 'debug') {
	                _log('debug', arguments);
	            }
	        };

	        function _splitURL(url) {
	            // [1] = protocol://,
	            // [2] = host:port,
	            // [3] = host,
	            // [4] = IPv6_host,
	            // [5] = IPv4_host,
	            // [6] = :port,
	            // [7] = port,
	            // [8] = uri,
	            // [9] = rest (query / fragment)
	            return new RegExp('(^https?://)?(((\\[[^\\]]+])|([^:/?#]+))(:(\\d+))?)?([^?#]*)(.*)?').exec(url);
	        }

	        /**
	         * Returns whether the given hostAndPort is cross domain.
	         * The default implementation checks against window.location.host
	         * but this function can be overridden to make it work in non-browser
	         * environments.
	         *
	         * @param hostAndPort the host and port in format host:port
	         * @return whether the given hostAndPort is cross domain
	         */
	        this._isCrossDomain = function(hostAndPort) {
	            if (window.location && window.location.host) {
	                if (hostAndPort) {
	                    return hostAndPort !== window.location.host;
	                }
	            }
	            return false;
	        };

	        function _configure(configuration) {
	            _cometd._debug('Configuring cometd object with', configuration);
	            // Support old style param, where only the Bayeux server URL was passed.
	            if (_isString(configuration)) {
	                configuration = {
	                    url: configuration
	                };
	            }
	            if (!configuration) {
	                configuration = {};
	            }

	            _config = _cometd._mixin(false, _config, configuration);

	            var url = _cometd.getURL();
	            if (!url) {
	                throw 'Missing required configuration parameter \'url\' specifying the Bayeux server URL';
	            }

	            // Check if we're cross domain.
	            var urlParts = _splitURL(url);
	            var hostAndPort = urlParts[2];
	            var uri = urlParts[8];
	            var afterURI = urlParts[9];
	            _crossDomain = _cometd._isCrossDomain(hostAndPort);

	            // Check if appending extra path is supported.
	            if (_config.appendMessageTypeToURL) {
	                if (afterURI !== undefined && afterURI.length > 0) {
	                    _cometd._info('Appending message type to URI ' + uri + afterURI + ' is not supported, disabling \'appendMessageTypeToURL\' configuration');
	                    _config.appendMessageTypeToURL = false;
	                } else {
	                    var uriSegments = uri.split('/');
	                    var lastSegmentIndex = uriSegments.length - 1;
	                    if (uri.match(/\/$/)) {
	                        lastSegmentIndex -= 1;
	                    }
	                    if (uriSegments[lastSegmentIndex].indexOf('.') >= 0) {
	                        // Very likely the CometD servlet's URL pattern is mapped to an extension, such as *.cometd
	                        // It will be difficult to add the extra path in this case
	                        _cometd._info('Appending message type to URI ' + uri + ' is not supported, disabling \'appendMessageTypeToURL\' configuration');
	                        _config.appendMessageTypeToURL = false;
	                    }
	                }
	            }

	            if (window.Worker && window.Blob && window.URL && _config.useWorkerScheduler) {
	                var code = WorkerScheduler.toString();
	                // Remove the function declaration, the opening brace and the closing brace.
	                code = code.substring(code.indexOf('{') + 1, code.lastIndexOf('}'));
	                var blob = new window.Blob([code], {
	                    type: 'application/json'
	                });
	                var blobURL = window.URL.createObjectURL(blob);
	                var worker = new window.Worker(blobURL);
	                _scheduler.setTimeout = function(funktion, delay) {
	                    var id = _scheduler.register(funktion);
	                    worker.postMessage({
	                        id: id,
	                        type: 'setTimeout',
	                        delay: delay
	                    });
	                    return id;
	                };
	                _scheduler.clearTimeout = function(id) {
	                    _scheduler.unregister(id);
	                    worker.postMessage({
	                        id: id,
	                        type: 'clearTimeout'
	                    });
	                };
	                worker.onmessage = function(e) {
	                    var id = e.data.id;
	                    var funktion = _scheduler.unregister(id);
	                    if (funktion) {
	                        funktion();
	                    }
	                };
	            }
	        }

	        function _removeListener(subscription) {
	            if (subscription) {
	                var subscriptions = _listeners[subscription.channel];
	                if (subscriptions && subscriptions[subscription.id]) {
	                    delete subscriptions[subscription.id];
	                    _cometd._debug('Removed', subscription.listener ? 'listener' : 'subscription', subscription);
	                }
	            }
	        }

	        function _removeSubscription(subscription) {
	            if (subscription && !subscription.listener) {
	                _removeListener(subscription);
	            }
	        }

	        function _clearSubscriptions() {
	            for (var channel in _listeners) {
	                if (_listeners.hasOwnProperty(channel)) {
	                    var subscriptions = _listeners[channel];
	                    if (subscriptions) {
	                        for (var id in subscriptions) {
	                            if (subscriptions.hasOwnProperty(id)) {
	                                _removeSubscription(subscriptions[id]);
	                            }
	                        }
	                    }
	                }
	            }
	        }

	        function _setStatus(newStatus) {
	            if (_status !== newStatus) {
	                _cometd._debug('Status', _status, '->', newStatus);
	                _status = newStatus;
	            }
	        }

	        function _isDisconnected() {
	            return _status === 'disconnecting' || _status === 'disconnected';
	        }

	        function _nextMessageId() {
	            var result = ++_messageId;
	            return '' + result;
	        }

	        function _applyExtension(scope, callback, name, message, outgoing) {
	            try {
	                return callback.call(scope, message);
	            } catch (x) {
	                var handler = _cometd.onExtensionException;
	                if (_isFunction(handler)) {
	                    _cometd._debug('Invoking extension exception handler', name, x);
	                    try {
	                        handler.call(_cometd, x, name, outgoing, message);
	                    } catch (xx) {
	                        _cometd._info('Exception during execution of extension exception handler', name, xx);
	                    }
	                } else {
	                    _cometd._info('Exception during execution of extension', name, x);
	                }
	                return message;
	            }
	        }

	        function _applyIncomingExtensions(message) {
	            for (var i = 0; i < _extensions.length; ++i) {
	                if (message === undefined || message === null) {
	                    break;
	                }

	                var extension = _extensions[i];
	                var callback = extension.extension.incoming;
	                if (_isFunction(callback)) {
	                    var result = _applyExtension(extension.extension, callback, extension.name, message, false);
	                    message = result === undefined ? message : result;
	                }
	            }
	            return message;
	        }

	        function _applyOutgoingExtensions(message) {
	            for (var i = _extensions.length - 1; i >= 0; --i) {
	                if (message === undefined || message === null) {
	                    break;
	                }

	                var extension = _extensions[i];
	                var callback = extension.extension.outgoing;
	                if (_isFunction(callback)) {
	                    var result = _applyExtension(extension.extension, callback, extension.name, message, true);
	                    message = result === undefined ? message : result;
	                }
	            }
	            return message;
	        }

	        function _notify(channel, message) {
	            var subscriptions = _listeners[channel];
	            if (subscriptions) {
	                for (var id in subscriptions) {
	                    if (subscriptions.hasOwnProperty(id)) {
	                        var subscription = subscriptions[id];
	                        // Subscriptions may come and go, so the array may have 'holes'
	                        if (subscription) {
	                            try {
	                                subscription.callback.call(subscription.scope, message);
	                            } catch (x) {
	                                var handler = _cometd.onListenerException;
	                                if (_isFunction(handler)) {
	                                    _cometd._debug('Invoking listener exception handler', subscription, x);
	                                    try {
	                                        handler.call(_cometd, x, subscription, subscription.listener, message);
	                                    } catch (xx) {
	                                        _cometd._info('Exception during execution of listener exception handler', subscription, xx);
	                                    }
	                                } else {
	                                    _cometd._info('Exception during execution of listener', subscription, message, x);
	                                }
	                            }
	                        }
	                    }
	                }
	            }
	        }

	        function _notifyListeners(channel, message) {
	            // Notify direct listeners
	            _notify(channel, message);

	            // Notify the globbing listeners
	            var channelParts = channel.split('/');
	            var last = channelParts.length - 1;
	            for (var i = last; i > 0; --i) {
	                var channelPart = channelParts.slice(0, i).join('/') + '/*';
	                // We don't want to notify /foo/* if the channel is /foo/bar/baz,
	                // so we stop at the first non recursive globbing
	                if (i === last) {
	                    _notify(channelPart, message);
	                }
	                // Add the recursive globber and notify
	                channelPart += '*';
	                _notify(channelPart, message);
	            }
	        }

	        function _cancelDelayedSend() {
	            if (_scheduledSend !== null) {
	                _cometd.clearTimeout(_scheduledSend);
	            }
	            _scheduledSend = null;
	        }

	        function _delayedSend(operation, delay) {
	            _cancelDelayedSend();
	            var time = _advice.interval + delay;
	            _cometd._debug('Function scheduled in', time, 'ms, interval =', _advice.interval, 'backoff =', _backoff, operation);
	            _scheduledSend = _cometd.setTimeout(operation, time);
	        }

	        // Needed to break cyclic dependencies between function definitions
	        var _handleMessages;
	        var _handleFailure;

	        /**
	         * Delivers the messages to the CometD server
	         * @param messages the array of messages to send
	         * @param metaConnect true if this send is on /meta/connect
	         * @param extraPath an extra path to append to the Bayeux server URL
	         */
	        function _send(messages, metaConnect, extraPath) {
	            // We must be sure that the messages have a clientId.
	            // This is not guaranteed since the handshake may take time to return
	            // (and hence the clientId is not known yet) and the application
	            // may create other messages.
	            for (var i = 0; i < messages.length; ++i) {
	                var message = messages[i];
	                var messageId = message.id;

	                if (_clientId) {
	                    message.clientId = _clientId;
	                }

	                message = _applyOutgoingExtensions(message);
	                if (message !== undefined && message !== null) {
	                    // Extensions may have modified the message id, but we need to own it.
	                    message.id = messageId;
	                    messages[i] = message;
	                } else {
	                    delete _callbacks[messageId];
	                    messages.splice(i--, 1);
	                }
	            }

	            if (messages.length === 0) {
	                return;
	            }

	            if (metaConnect) {
	                _metaConnect = messages[0];
	            }

	            var url = _cometd.getURL();
	            if (_config.appendMessageTypeToURL) {
	                // If url does not end with '/', then append it
	                if (!url.match(/\/$/)) {
	                    url = url + '/';
	                }
	                if (extraPath) {
	                    url = url + extraPath;
	                }
	            }

	            var envelope = {
	                url: url,
	                sync: false,
	                messages: messages,
	                onSuccess: function(rcvdMessages) {
	                    try {
	                        _handleMessages.call(_cometd, rcvdMessages);
	                    } catch (x) {
	                        _cometd._info('Exception during handling of messages', x);
	                    }
	                },
	                onFailure: function(conduit, messages, failure) {
	                    try {
	                        var transport = _cometd.getTransport();
	                        failure.connectionType = transport ? transport.getType() : "unknown";
	                        _handleFailure.call(_cometd, conduit, messages, failure);
	                    } catch (x) {
	                        _cometd._info('Exception during handling of failure', x);
	                    }
	                }
	            };
	            _cometd._debug('Send', envelope);
	            _transport.send(envelope, metaConnect);
	        }

	        function _queueSend(message) {
	            if (_batch > 0 || _internalBatch === true) {
	                _messageQueue.push(message);
	            } else {
	                _send([message], false);
	            }
	        }

	        /**
	         * Sends a complete bayeux message.
	         * This method is exposed as a public so that extensions may use it
	         * to send bayeux message directly, for example in case of re-sending
	         * messages that have already been sent but that for some reason must
	         * be resent.
	         */
	        this.send = _queueSend;

	        function _resetBackoff() {
	            _backoff = 0;
	        }

	        function _increaseBackoff() {
	            if (_backoff < _config.maxBackoff) {
	                _backoff += _config.backoffIncrement;
	            }
	            return _backoff;
	        }

	        /**
	         * Starts a the batch of messages to be sent in a single request.
	         * @see #_endBatch(sendMessages)
	         */
	        function _startBatch() {
	            ++_batch;
	            _cometd._debug('Starting batch, depth', _batch);
	        }

	        function _flushBatch() {
	            var messages = _messageQueue;
	            _messageQueue = [];
	            if (messages.length > 0) {
	                _send(messages, false);
	            }
	        }

	        /**
	         * Ends the batch of messages to be sent in a single request,
	         * optionally sending messages present in the message queue depending
	         * on the given argument.
	         * @see #_startBatch()
	         */
	        function _endBatch() {
	            --_batch;
	            _cometd._debug('Ending batch, depth', _batch);
	            if (_batch < 0) {
	                throw 'Calls to startBatch() and endBatch() are not paired';
	            }

	            if (_batch === 0 && !_isDisconnected() && !_internalBatch) {
	                _flushBatch();
	            }
	        }

	        /**
	         * Sends the connect message
	         */
	        function _connect() {
	            if (!_isDisconnected()) {
	                var bayeuxMessage = {
	                    id: _nextMessageId(),
	                    channel: '/meta/connect',
	                    connectionType: _transport.getType()
	                };

	                // In case of reload or temporary loss of connection
	                // we want the next successful connect to return immediately
	                // instead of being held by the server, so that connect listeners
	                // can be notified that the connection has been re-established
	                if (!_connected) {
	                    bayeuxMessage.advice = {
	                        timeout: 0
	                    };
	                }

	                _setStatus('connecting');
	                _cometd._debug('Connect sent', bayeuxMessage);
	                _send([bayeuxMessage], true, 'connect');
	                _setStatus('connected');
	            }
	        }

	        function _delayedConnect(delay) {
	            _setStatus('connecting');
	            _delayedSend(function() {
	                _connect();
	            }, delay);
	        }

	        function _updateAdvice(newAdvice) {
	            if (newAdvice) {
	                _advice = _cometd._mixin(false, {}, _config.advice, newAdvice);
	                _cometd._debug('New advice', _advice);
	            }
	        }

	        function _disconnect(abort) {
	            _cancelDelayedSend();
	            if (abort && _transport) {
	                _transport.abort();
	            }
	            _crossDomain = false;
	            _transport = null;
	            _setStatus('disconnected');
	            _clientId = null;
	            _batch = 0;
	            _resetBackoff();
	            _reestablish = false;
	            _connected = false;
	            _unconnectTime = 0;
	            _metaConnect = null;

	            // Fail any existing queued message
	            if (_messageQueue.length > 0) {
	                var messages = _messageQueue;
	                _messageQueue = [];
	                _handleFailure.call(_cometd, undefined, messages, {
	                    reason: 'Disconnected'
	                });
	            }
	        }

	        function _notifyTransportException(oldTransport, newTransport, failure) {
	            var handler = _cometd.onTransportException;
	            if (_isFunction(handler)) {
	                _cometd._debug('Invoking transport exception handler', oldTransport, newTransport, failure);
	                try {
	                    handler.call(_cometd, failure, oldTransport, newTransport);
	                } catch (x) {
	                    _cometd._info('Exception during execution of transport exception handler', x);
	                }
	            }
	        }

	        /**
	         * Sends the initial handshake message
	         */
	        function _handshake(handshakeProps, handshakeCallback) {
	            if (_isFunction(handshakeProps)) {
	                handshakeCallback = handshakeProps;
	                handshakeProps = undefined;
	            }

	            _clientId = null;

	            _clearSubscriptions();

	            // Reset the transports if we're not retrying the handshake
	            if (_isDisconnected()) {
	                _transports.reset(true);
	            }

	            // Reset the advice.
	            _updateAdvice({});

	            _batch = 0;

	            // Mark the start of an internal batch.
	            // This is needed because handshake and connect are async.
	            // It may happen that the application calls init() then subscribe()
	            // and the subscribe message is sent before the connect message, if
	            // the subscribe message is not held until the connect message is sent.
	            // So here we start a batch to hold temporarily any message until
	            // the connection is fully established.
	            _internalBatch = true;

	            // Save the properties provided by the user, so that
	            // we can reuse them during automatic re-handshake
	            _handshakeProps = handshakeProps;
	            _handshakeCallback = handshakeCallback;

	            var version = '1.0';

	            // Figure out the transports to send to the server
	            var url = _cometd.getURL();
	            var transportTypes = _transports.findTransportTypes(version, _crossDomain, url);

	            var bayeuxMessage = {
	                id: _nextMessageId(),
	                version: version,
	                minimumVersion: version,
	                channel: '/meta/handshake',
	                supportedConnectionTypes: transportTypes,
	                advice: {
	                    timeout: _advice.timeout,
	                    interval: _advice.interval
	                }
	            };
	            // Do not allow the user to override important fields.
	            var message = _cometd._mixin(false, {}, _handshakeProps, bayeuxMessage);

	            // Save the callback.
	            _cometd._putCallback(message.id, handshakeCallback);

	            // Pick up the first available transport as initial transport
	            // since we don't know if the server supports it
	            if (!_transport) {
	                _transport = _transports.negotiateTransport(transportTypes, version, _crossDomain, url);
	                if (!_transport) {
	                    var failure = 'Could not find initial transport among: ' + _transports.getTransportTypes();
	                    _cometd._warn(failure);
	                    throw failure;
	                }
	            }

	            _cometd._debug('Initial transport is', _transport.getType());

	            // We started a batch to hold the application messages,
	            // so here we must bypass it and send immediately.
	            _setStatus('handshaking');
	            _cometd._debug('Handshake sent', message);
	            _send([message], false, 'handshake');
	        }

	        function _delayedHandshake(delay) {
	            _setStatus('handshaking');

	            // We will call _handshake() which will reset _clientId, but we want to avoid
	            // that between the end of this method and the call to _handshake() someone may
	            // call publish() (or other methods that call _queueSend()).
	            _internalBatch = true;

	            _delayedSend(function() {
	                _handshake(_handshakeProps, _handshakeCallback);
	            }, delay);
	        }

	        function _notifyCallback(callback, message) {
	            try {
	                callback.call(_cometd, message);
	            } catch (x) {
	                var handler = _cometd.onCallbackException;
	                if (_isFunction(handler)) {
	                    _cometd._debug('Invoking callback exception handler', x);
	                    try {
	                        handler.call(_cometd, x, message);
	                    } catch (xx) {
	                        _cometd._info('Exception during execution of callback exception handler', xx);
	                    }
	                } else {
	                    _cometd._info('Exception during execution of message callback', x);
	                }
	            }
	        }

	        this._getCallback = function(messageId) {
	            return _callbacks[messageId];
	        };

	        this._putCallback = function(messageId, callback) {
	            var result = this._getCallback(messageId);
	            if (_isFunction(callback)) {
	                _callbacks[messageId] = callback;
	            }
	            return result;
	        };

	        function _handleCallback(message) {
	            var callback = _cometd._getCallback([message.id]);
	            if (_isFunction(callback)) {
	                delete _callbacks[message.id];
	                _notifyCallback(callback, message);
	            }
	        }

	        function _handleRemoteCall(message) {
	            var context = _remoteCalls[message.id];
	            delete _remoteCalls[message.id];
	            if (context) {
	                _cometd._debug('Handling remote call response for', message, 'with context', context);

	                // Clear the timeout, if present.
	                var timeout = context.timeout;
	                if (timeout) {
	                    _cometd.clearTimeout(timeout);
	                }

	                var callback = context.callback;
	                if (_isFunction(callback)) {
	                    _notifyCallback(callback, message);
	                    return true;
	                }
	            }
	            return false;
	        }

	        this.onTransportFailure = function(message, failureInfo, failureHandler) {
	            this._debug('Transport failure', failureInfo, 'for', message);

	            var transports = this.getTransportRegistry();
	            var url = this.getURL();
	            var crossDomain = this._isCrossDomain(_splitURL(url)[2]);
	            var version = '1.0';
	            var transportTypes = transports.findTransportTypes(version, crossDomain, url);

	            if (failureInfo.action === 'none') {
	                if (message.channel === '/meta/handshake') {
	                    if (!failureInfo.transport) {
	                        var failure = 'Could not negotiate transport, client=[' + transportTypes + '], server=[' + message.supportedConnectionTypes + ']';
	                        this._warn(failure);
	                        _notifyTransportException(_transport.getType(), null, {
	                            reason: failure,
	                            connectionType: _transport.getType(),
	                            transport: _transport
	                        });
	                    }
	                }
	            } else {
	                failureInfo.delay = this.getBackoffPeriod();
	                // Different logic depending on whether we are handshaking or connecting.
	                if (message.channel === '/meta/handshake') {
	                    if (!failureInfo.transport) {
	                        // The transport is invalid, try to negotiate again.
	                        var oldTransportType = _transport ? _transport.getType() : null;
	                        var newTransport = transports.negotiateTransport(transportTypes, version, crossDomain, url);
	                        if (!newTransport) {
	                            this._warn('Could not negotiate transport, client=[' + transportTypes + ']');
	                            _notifyTransportException(oldTransportType, null, message.failure);
	                            failureInfo.action = 'none';
	                        } else {
	                            var newTransportType = newTransport.getType();
	                            this._debug('Transport', oldTransportType, '->', newTransportType);
	                            _notifyTransportException(oldTransportType, newTransportType, message.failure);
	                            failureInfo.action = 'handshake';
	                            failureInfo.transport = newTransport;
	                        }
	                    }

	                    if (failureInfo.action !== 'none') {
	                        this.increaseBackoffPeriod();
	                    }
	                } else {
	                    var now = new Date().getTime();

	                    if (_unconnectTime === 0) {
	                        _unconnectTime = now;
	                    }

	                    if (failureInfo.action === 'retry') {
	                        failureInfo.delay = this.increaseBackoffPeriod();
	                        // Check whether we may switch to handshaking.
	                        var maxInterval = _advice.maxInterval;
	                        if (maxInterval > 0) {
	                            var expiration = _advice.timeout + _advice.interval + maxInterval;
	                            var unconnected = now - _unconnectTime;
	                            if (unconnected + _backoff > expiration) {
	                                failureInfo.action = 'handshake';
	                            }
	                        }
	                    }

	                    if (failureInfo.action === 'handshake') {
	                        failureInfo.delay = 0;
	                        transports.reset(false);
	                        this.resetBackoffPeriod();
	                    }
	                }
	            }

	            failureHandler.call(_cometd, failureInfo);
	        };

	        function _handleTransportFailure(failureInfo) {
	            _cometd._debug('Transport failure handling', failureInfo);

	            if (failureInfo.transport) {
	                _transport = failureInfo.transport;
	            }

	            if (failureInfo.url) {
	                _transport.setURL(failureInfo.url);
	            }

	            var action = failureInfo.action;
	            var delay = failureInfo.delay || 0;
	            switch (action) {
	                case 'handshake':
	                    _delayedHandshake(delay);
	                    break;
	                case 'retry':
	                    _delayedConnect(delay);
	                    break;
	                case 'none':
	                    _disconnect(true);
	                    break;
	                default:
	                    throw 'Unknown action ' + action;
	            }
	        }

	        function _failHandshake(message, failureInfo) {
	            _handleCallback(message);
	            _notifyListeners('/meta/handshake', message);
	            _notifyListeners('/meta/unsuccessful', message);

	            // The listeners may have disconnected.
	            if (_isDisconnected()) {
	                failureInfo.action = 'none';
	            }

	            _cometd.onTransportFailure.call(_cometd, message, failureInfo, _handleTransportFailure);
	        }

	        function _handshakeResponse(message) {
	            var url = _cometd.getURL();
	            if (message.successful) {
	                var crossDomain = _cometd._isCrossDomain(_splitURL(url)[2]);
	                var newTransport = _transports.negotiateTransport(message.supportedConnectionTypes, message.version, crossDomain, url);
	                if (newTransport === null) {
	                    message.successful = false;
	                    _failHandshake(message, {
	                        cause: 'negotiation',
	                        action: 'none',
	                        transport: null
	                    });
	                    return;
	                } else if (_transport !== newTransport) {
	                    _cometd._debug('Transport', _transport.getType(), '->', newTransport.getType());
	                    _transport = newTransport;
	                }

	                _clientId = message.clientId;

	                // End the internal batch and allow held messages from the application
	                // to go to the server (see _handshake() where we start the internal batch).
	                _internalBatch = false;
	                _flushBatch();

	                // Here the new transport is in place, as well as the clientId, so
	                // the listeners can perform a publish() if they want.
	                // Notify the listeners before the connect below.
	                message.reestablish = _reestablish;
	                _reestablish = true;

	                _handleCallback(message);
	                _notifyListeners('/meta/handshake', message);

	                _handshakeMessages = message['x-messages'] || 0;

	                var action = _isDisconnected() ? 'none' : _advice.reconnect || 'retry';
	                switch (action) {
	                    case 'retry':
	                        _resetBackoff();
	                        if (_handshakeMessages === 0) {
	                            _delayedConnect(0);
	                        } else {
	                            _cometd._debug('Processing', _handshakeMessages, 'handshake-delivered messages');
	                        }
	                        break;
	                    case 'none':
	                        _disconnect(true);
	                        break;
	                    default:
	                        throw 'Unrecognized advice action ' + action;
	                }
	            } else {
	                _failHandshake(message, {
	                    cause: 'unsuccessful',
	                    action: _advice.reconnect || 'handshake',
	                    transport: _transport
	                });
	            }
	        }

	        function _handshakeFailure(message) {
	            _failHandshake(message, {
	                cause: 'failure',
	                action: 'handshake',
	                transport: null
	            });
	        }

	        function _matchMetaConnect(connect) {
	            if (_status === 'disconnected') {
	                return true;
	            }
	            if (_metaConnect && _metaConnect.id === connect.id) {
	                _metaConnect = null;
	                return true;
	            }
	            return false;
	        }

	        function _failConnect(message, failureInfo) {
	            // Notify the listeners after the status change but before the next action.
	            _notifyListeners('/meta/connect', message);
	            _notifyListeners('/meta/unsuccessful', message);

	            // The listeners may have disconnected.
	            if (_isDisconnected()) {
	                failureInfo.action = 'none';
	            }

	            _cometd.onTransportFailure.call(_cometd, message, failureInfo, _handleTransportFailure);
	        }

	        function _connectResponse(message) {
	            if (_matchMetaConnect(message)) {
	                _connected = message.successful;
	                if (_connected) {
	                    _notifyListeners('/meta/connect', message);

	                    // Normally, the advice will say "reconnect: 'retry', interval: 0"
	                    // and the server will hold the request, so when a response returns
	                    // we immediately call the server again (long polling).
	                    // Listeners can call disconnect(), so check the state after they run.
	                    var action = _isDisconnected() ? 'none' : _advice.reconnect || 'retry';
	                    switch (action) {
	                        case 'retry':
	                            _resetBackoff();
	                            _delayedConnect(_backoff);
	                            break;
	                        case 'none':
	                            _disconnect(false);
	                            break;
	                        default:
	                            throw 'Unrecognized advice action ' + action;
	                    }
	                } else {
	                    _failConnect(message, {
	                        cause: 'unsuccessful',
	                        action: _advice.reconnect || 'retry',
	                        transport: _transport
	                    });
	                }
	            } else {
	                _cometd._debug('Mismatched /meta/connect reply', message);
	            }
	        }

	        function _connectFailure(message) {
	            if (_matchMetaConnect(message)) {
	                _connected = false;
	                _failConnect(message, {
	                    cause: 'failure',
	                    action: 'retry',
	                    transport: null
	                });
	            } else {
	                _cometd._debug('Mismatched /meta/connect failure', message);
	            }
	        }

	        function _failDisconnect(message) {
	            _disconnect(true);
	            _handleCallback(message);
	            _notifyListeners('/meta/disconnect', message);
	            _notifyListeners('/meta/unsuccessful', message);
	        }

	        function _disconnectResponse(message) {
	            if (message.successful) {
	                // Wait for the /meta/connect to arrive.
	                _disconnect(false);
	                _handleCallback(message);
	                _notifyListeners('/meta/disconnect', message);
	            } else {
	                _failDisconnect(message);
	            }
	        }

	        function _disconnectFailure(message) {
	            _failDisconnect(message);
	        }

	        function _failSubscribe(message) {
	            var subscriptions = _listeners[message.subscription];
	            if (subscriptions) {
	                for (var id in subscriptions) {
	                    if (subscriptions.hasOwnProperty(id)) {
	                        var subscription = subscriptions[id];
	                        if (subscription && !subscription.listener) {
	                            delete subscriptions[id];
	                            _cometd._debug('Removed failed subscription', subscription);
	                        }
	                    }
	                }
	            }
	            _handleCallback(message);
	            _notifyListeners('/meta/subscribe', message);
	            _notifyListeners('/meta/unsuccessful', message);
	        }

	        function _subscribeResponse(message) {
	            if (message.successful) {
	                _handleCallback(message);
	                _notifyListeners('/meta/subscribe', message);
	            } else {
	                _failSubscribe(message);
	            }
	        }

	        function _subscribeFailure(message) {
	            _failSubscribe(message);
	        }

	        function _failUnsubscribe(message) {
	            _handleCallback(message);
	            _notifyListeners('/meta/unsubscribe', message);
	            _notifyListeners('/meta/unsuccessful', message);
	        }

	        function _unsubscribeResponse(message) {
	            if (message.successful) {
	                _handleCallback(message);
	                _notifyListeners('/meta/unsubscribe', message);
	            } else {
	                _failUnsubscribe(message);
	            }
	        }

	        function _unsubscribeFailure(message) {
	            _failUnsubscribe(message);
	        }

	        function _failMessage(message) {
	            if (!_handleRemoteCall(message)) {
	                _handleCallback(message);
	                _notifyListeners('/meta/publish', message);
	                _notifyListeners('/meta/unsuccessful', message);
	            }
	        }

	        function _messageResponse(message) {
	            if (message.data !== undefined) {
	                if (!_handleRemoteCall(message)) {
	                    _notifyListeners(message.channel, message);
	                    if (_handshakeMessages > 0) {
	                        --_handshakeMessages;
	                        if (_handshakeMessages === 0) {
	                            _cometd._debug('Processed last handshake-delivered message');
	                            _delayedConnect(0);
	                        }
	                    }
	                }
	            } else {
	                if (message.successful === undefined) {
	                    _cometd._warn('Unknown Bayeux Message', message);
	                } else {
	                    if (message.successful) {
	                        _handleCallback(message);
	                        _notifyListeners('/meta/publish', message);
	                    } else {
	                        _failMessage(message);
	                    }
	                }
	            }
	        }

	        function _messageFailure(failure) {
	            _failMessage(failure);
	        }

	        function _receive(message) {
	            _unconnectTime = 0;

	            message = _applyIncomingExtensions(message);
	            if (message === undefined || message === null) {
	                return;
	            }

	            _updateAdvice(message.advice);

	            var channel = message.channel;
	            switch (channel) {
	                case '/meta/handshake':
	                    _handshakeResponse(message);
	                    break;
	                case '/meta/connect':
	                    _connectResponse(message);
	                    break;
	                case '/meta/disconnect':
	                    _disconnectResponse(message);
	                    break;
	                case '/meta/subscribe':
	                    _subscribeResponse(message);
	                    break;
	                case '/meta/unsubscribe':
	                    _unsubscribeResponse(message);
	                    break;
	                default:
	                    _messageResponse(message);
	                    break;
	            }
	        }

	        /**
	         * Receives a message.
	         * This method is exposed as a public so that extensions may inject
	         * messages simulating that they had been received.
	         */
	        this.receive = _receive;

	        _handleMessages = function(rcvdMessages) {
	            _cometd._debug('Received', rcvdMessages);

	            for (var i = 0; i < rcvdMessages.length; ++i) {
	                var message = rcvdMessages[i];
	                _receive(message);
	            }
	        };

	        _handleFailure = function(conduit, messages, failure) {
	            _cometd._debug('handleFailure', conduit, messages, failure);

	            failure.transport = conduit;
	            for (var i = 0; i < messages.length; ++i) {
	                var message = messages[i];
	                var failureMessage = {
	                    id: message.id,
	                    successful: false,
	                    channel: message.channel,
	                    failure: failure
	                };
	                failure.message = message;
	                switch (message.channel) {
	                    case '/meta/handshake':
	                        _handshakeFailure(failureMessage);
	                        break;
	                    case '/meta/connect':
	                        _connectFailure(failureMessage);
	                        break;
	                    case '/meta/disconnect':
	                        _disconnectFailure(failureMessage);
	                        break;
	                    case '/meta/subscribe':
	                        failureMessage.subscription = message.subscription;
	                        _subscribeFailure(failureMessage);
	                        break;
	                    case '/meta/unsubscribe':
	                        failureMessage.subscription = message.subscription;
	                        _unsubscribeFailure(failureMessage);
	                        break;
	                    default:
	                        _messageFailure(failureMessage);
	                        break;
	                }
	            }
	        };

	        function _hasSubscriptions(channel) {
	            var subscriptions = _listeners[channel];
	            if (subscriptions) {
	                for (var id in subscriptions) {
	                    if (subscriptions.hasOwnProperty(id)) {
	                        if (subscriptions[id]) {
	                            return true;
	                        }
	                    }
	                }
	            }
	            return false;
	        }

	        function _resolveScopedCallback(scope, callback) {
	            var delegate = {
	                scope: scope,
	                method: callback
	            };
	            if (_isFunction(scope)) {
	                delegate.scope = undefined;
	                delegate.method = scope;
	            } else {
	                if (_isString(callback)) {
	                    if (!scope) {
	                        throw 'Invalid scope ' + scope;
	                    }
	                    delegate.method = scope[callback];
	                    if (!_isFunction(delegate.method)) {
	                        throw 'Invalid callback ' + callback + ' for scope ' + scope;
	                    }
	                } else if (!_isFunction(callback)) {
	                    throw 'Invalid callback ' + callback;
	                }
	            }
	            return delegate;
	        }

	        function _addListener(channel, scope, callback, isListener) {
	            // The data structure is a map<channel, subscription[]>, where each subscription
	            // holds the callback to be called and its scope.

	            var delegate = _resolveScopedCallback(scope, callback);
	            _cometd._debug('Adding', isListener ? 'listener' : 'subscription', 'on', channel, 'with scope', delegate.scope, 'and callback', delegate.method);

	            var id = ++_listenerId;
	            var subscription = {
	                id: id,
	                channel: channel,
	                scope: delegate.scope,
	                callback: delegate.method,
	                listener: isListener
	            };

	            var subscriptions = _listeners[channel];
	            if (!subscriptions) {
	                subscriptions = {};
	                _listeners[channel] = subscriptions;
	            }

	            subscriptions[id] = subscription;

	            _cometd._debug('Added', isListener ? 'listener' : 'subscription', subscription);

	            return subscription;
	        }

	        //
	        // PUBLIC API
	        //

	        /**
	         * Registers the given transport under the given transport type.
	         * The optional index parameter specifies the "priority" at which the
	         * transport is registered (where 0 is the max priority).
	         * If a transport with the same type is already registered, this function
	         * does nothing and returns false.
	         * @param type the transport type
	         * @param transport the transport object
	         * @param index the index at which this transport is to be registered
	         * @return true if the transport has been registered, false otherwise
	         * @see #unregisterTransport(type)
	         */
	        this.registerTransport = function(type, transport, index) {
	            var result = _transports.add(type, transport, index);
	            if (result) {
	                this._debug('Registered transport', type);

	                if (_isFunction(transport.registered)) {
	                    transport.registered(type, this);
	                }
	            }
	            return result;
	        };

	        /**
	         * Unregisters the transport with the given transport type.
	         * @param type the transport type to unregister
	         * @return the transport that has been unregistered,
	         * or null if no transport was previously registered under the given transport type
	         */
	        this.unregisterTransport = function(type) {
	            var transport = _transports.remove(type);
	            if (transport !== null) {
	                this._debug('Unregistered transport', type);

	                if (_isFunction(transport.unregistered)) {
	                    transport.unregistered();
	                }
	            }
	            return transport;
	        };

	        this.unregisterTransports = function() {
	            _transports.clear();
	        };

	        /**
	         * @return an array of all registered transport types
	         */
	        this.getTransportTypes = function() {
	            return _transports.getTransportTypes();
	        };

	        this.findTransport = function(name) {
	            return _transports.find(name);
	        };

	        /**
	         * @returns the TransportRegistry object
	         */
	        this.getTransportRegistry = function() {
	            return _transports;
	        };

	        /**
	         * Configures the initial Bayeux communication with the Bayeux server.
	         * Configuration is passed via an object that must contain a mandatory field <code>url</code>
	         * of type string containing the URL of the Bayeux server.
	         * @param configuration the configuration object
	         */
	        this.configure = function(configuration) {
	            _configure.call(this, configuration);
	        };

	        /**
	         * Configures and establishes the Bayeux communication with the Bayeux server
	         * via a handshake and a subsequent connect.
	         * @param configuration the configuration object
	         * @param handshakeProps an object to be merged with the handshake message
	         * @see #configure(configuration)
	         * @see #handshake(handshakeProps)
	         */
	        this.init = function(configuration, handshakeProps) {
	            this.configure(configuration);
	            this.handshake(handshakeProps);
	        };

	        /**
	         * Establishes the Bayeux communication with the Bayeux server
	         * via a handshake and a subsequent connect.
	         * @param handshakeProps an object to be merged with the handshake message
	         * @param handshakeCallback a function to be invoked when the handshake is acknowledged
	         */
	        this.handshake = function(handshakeProps, handshakeCallback) {
	            if (_status !== 'disconnected') {
	                throw 'Illegal state: handshaken';
	            }
	            _handshake(handshakeProps, handshakeCallback);
	        };

	        /**
	         * Disconnects from the Bayeux server.
	         * @param disconnectProps an object to be merged with the disconnect message
	         * @param disconnectCallback a function to be invoked when the disconnect is acknowledged
	         */
	        this.disconnect = function(disconnectProps, disconnectCallback) {
	            if (_isDisconnected()) {
	                return;
	            }

	            if (_isFunction(disconnectProps)) {
	                disconnectCallback = disconnectProps;
	                disconnectProps = undefined;
	            }

	            var bayeuxMessage = {
	                id: _nextMessageId(),
	                channel: '/meta/disconnect'
	            };
	            // Do not allow the user to override important fields.
	            var message = this._mixin(false, {}, disconnectProps, bayeuxMessage);

	            // Save the callback.
	            _cometd._putCallback(message.id, disconnectCallback);

	            _setStatus('disconnecting');
	            _send([message], false, 'disconnect');
	        };

	        /**
	         * Marks the start of a batch of application messages to be sent to the server
	         * in a single request, obtaining a single response containing (possibly) many
	         * application reply messages.
	         * Messages are held in a queue and not sent until {@link #endBatch()} is called.
	         * If startBatch() is called multiple times, then an equal number of endBatch()
	         * calls must be made to close and send the batch of messages.
	         * @see #endBatch()
	         */
	        this.startBatch = function() {
	            _startBatch();
	        };

	        /**
	         * Marks the end of a batch of application messages to be sent to the server
	         * in a single request.
	         * @see #startBatch()
	         */
	        this.endBatch = function() {
	            _endBatch();
	        };

	        /**
	         * Executes the given callback in the given scope, surrounded by a {@link #startBatch()}
	         * and {@link #endBatch()} calls.
	         * @param scope the scope of the callback, may be omitted
	         * @param callback the callback to be executed within {@link #startBatch()} and {@link #endBatch()} calls
	         */
	        this.batch = function(scope, callback) {
	            var delegate = _resolveScopedCallback(scope, callback);
	            this.startBatch();
	            try {
	                delegate.method.call(delegate.scope);
	                this.endBatch();
	            } catch (x) {
	                this._info('Exception during execution of batch', x);
	                this.endBatch();
	                throw x;
	            }
	        };

	        /**
	         * Adds a listener for bayeux messages, performing the given callback in the given scope
	         * when a message for the given channel arrives.
	         * @param channel the channel the listener is interested to
	         * @param scope the scope of the callback, may be omitted
	         * @param callback the callback to call when a message is sent to the channel
	         * @returns the subscription handle to be passed to {@link #removeListener(object)}
	         * @see #removeListener(subscription)
	         */
	        this.addListener = function(channel, scope, callback) {
	            if (arguments.length < 2) {
	                throw 'Illegal arguments number: required 2, got ' + arguments.length;
	            }
	            if (!_isString(channel)) {
	                throw 'Illegal argument type: channel must be a string';
	            }

	            return _addListener(channel, scope, callback, true);
	        };

	        /**
	         * Removes the subscription obtained with a call to {@link #addListener(string, object, function)}.
	         * @param subscription the subscription to unsubscribe.
	         * @see #addListener(channel, scope, callback)
	         */
	        this.removeListener = function(subscription) {
	            // Beware of subscription.id == 0, which is falsy => cannot use !subscription.id
	            if (!subscription || !subscription.channel || !("id" in subscription)) {
	                throw 'Invalid argument: expected subscription, not ' + subscription;
	            }

	            _removeListener(subscription);
	        };

	        /**
	         * Removes all listeners registered with {@link #addListener(channel, scope, callback)} or
	         * {@link #subscribe(channel, scope, callback)}.
	         */
	        this.clearListeners = function() {
	            _listeners = {};
	        };

	        /**
	         * Subscribes to the given channel, performing the given callback in the given scope
	         * when a message for the channel arrives.
	         * @param channel the channel to subscribe to
	         * @param scope the scope of the callback, may be omitted
	         * @param callback the callback to call when a message is sent to the channel
	         * @param subscribeProps an object to be merged with the subscribe message
	         * @param subscribeCallback a function to be invoked when the subscription is acknowledged
	         * @return the subscription handle to be passed to {@link #unsubscribe(object)}
	         */
	        this.subscribe = function(channel, scope, callback, subscribeProps, subscribeCallback) {
	            if (arguments.length < 2) {
	                throw 'Illegal arguments number: required 2, got ' + arguments.length;
	            }
	            if (!_isString(channel)) {
	                throw 'Illegal argument type: channel must be a string';
	            }
	            if (_isDisconnected()) {
	                throw 'Illegal state: disconnected';
	            }

	            // Normalize arguments
	            if (_isFunction(scope)) {
	                subscribeCallback = subscribeProps;
	                subscribeProps = callback;
	                callback = scope;
	                scope = undefined;
	            }
	            if (_isFunction(subscribeProps)) {
	                subscribeCallback = subscribeProps;
	                subscribeProps = undefined;
	            }

	            // Only send the message to the server if this client has not yet subscribed to the channel
	            var send = !_hasSubscriptions(channel);

	            var subscription = _addListener(channel, scope, callback, false);

	            if (send) {
	                // Send the subscription message after the subscription registration to avoid
	                // races where the server would send a message to the subscribers, but here
	                // on the client the subscription has not been added yet to the data structures
	                var bayeuxMessage = {
	                    id: _nextMessageId(),
	                    channel: '/meta/subscribe',
	                    subscription: channel
	                };
	                // Do not allow the user to override important fields.
	                var message = this._mixin(false, {}, subscribeProps, bayeuxMessage);

	                // Save the callback.
	                _cometd._putCallback(message.id, subscribeCallback);

	                _queueSend(message);
	            }

	            return subscription;
	        };

	        /**
	         * Unsubscribes the subscription obtained with a call to {@link #subscribe(string, object, function)}.
	         * @param subscription the subscription to unsubscribe.
	         * @param unsubscribeProps an object to be merged with the unsubscribe message
	         * @param unsubscribeCallback a function to be invoked when the unsubscription is acknowledged
	         */
	        this.unsubscribe = function(subscription, unsubscribeProps, unsubscribeCallback) {
	            if (arguments.length < 1) {
	                throw 'Illegal arguments number: required 1, got ' + arguments.length;
	            }
	            if (_isDisconnected()) {
	                throw 'Illegal state: disconnected';
	            }

	            if (_isFunction(unsubscribeProps)) {
	                unsubscribeCallback = unsubscribeProps;
	                unsubscribeProps = undefined;
	            }

	            // Remove the local listener before sending the message
	            // This ensures that if the server fails, this client does not get notifications
	            this.removeListener(subscription);

	            var channel = subscription.channel;
	            // Only send the message to the server if this client unsubscribes the last subscription
	            if (!_hasSubscriptions(channel)) {
	                var bayeuxMessage = {
	                    id: _nextMessageId(),
	                    channel: '/meta/unsubscribe',
	                    subscription: channel
	                };
	                // Do not allow the user to override important fields.
	                var message = this._mixin(false, {}, unsubscribeProps, bayeuxMessage);

	                // Save the callback.
	                _cometd._putCallback(message.id, unsubscribeCallback);

	                _queueSend(message);
	            }
	        };

	        this.resubscribe = function(subscription, subscribeProps) {
	            _removeSubscription(subscription);
	            if (subscription) {
	                return this.subscribe(subscription.channel, subscription.scope, subscription.callback, subscribeProps);
	            }
	            return undefined;
	        };

	        /**
	         * Removes all subscriptions added via {@link #subscribe(channel, scope, callback, subscribeProps)},
	         * but does not remove the listeners added via {@link addListener(channel, scope, callback)}.
	         */
	        this.clearSubscriptions = function() {
	            _clearSubscriptions();
	        };

	        /**
	         * Publishes a message on the given channel, containing the given content.
	         * @param channel the channel to publish the message to
	         * @param content the content of the message
	         * @param publishProps an object to be merged with the publish message
	         * @param publishCallback a function to be invoked when the publish is acknowledged by the server
	         */
	        this.publish = function(channel, content, publishProps, publishCallback) {
	            if (arguments.length < 1) {
	                throw 'Illegal arguments number: required 1, got ' + arguments.length;
	            }
	            if (!_isString(channel)) {
	                throw 'Illegal argument type: channel must be a string';
	            }
	            if (/^\/meta\//.test(channel)) {
	                throw 'Illegal argument: cannot publish to meta channels';
	            }
	            if (_isDisconnected()) {
	                throw 'Illegal state: disconnected';
	            }

	            if (_isFunction(content)) {
	                publishCallback = content;
	                content = {};
	                publishProps = undefined;
	            } else if (_isFunction(publishProps)) {
	                publishCallback = publishProps;
	                publishProps = undefined;
	            }

	            var bayeuxMessage = {
	                id: _nextMessageId(),
	                channel: channel,
	                data: content
	            };
	            // Do not allow the user to override important fields.
	            var message = this._mixin(false, {}, publishProps, bayeuxMessage);

	            // Save the callback.
	            _cometd._putCallback(message.id, publishCallback);

	            _queueSend(message);
	        };

	        /**
	         * Publishes a message with binary data on the given channel.
	         * The binary data chunk may be an ArrayBuffer, a DataView, a TypedArray
	         * (such as Uint8Array) or a plain integer array.
	         * The meta data object may contain additional application data such as
	         * a file name, a mime type, etc.
	         * @param channel the channel to publish the message to
	         * @param data the binary data to publish
	         * @param last whether the binary data chunk is the last
	         * @param meta an object containing meta data associated to the binary chunk
	         * @param callback a function to be invoked when the publish is acknowledged by the server
	         */
	        this.publishBinary = function(channel, data, last, meta, callback) {
	            if (_isFunction(data)) {
	                callback = data;
	                data = new ArrayBuffer(0);
	                last = true;
	                meta = undefined;
	            } else if (_isFunction(last)) {
	                callback = last;
	                last = true;
	                meta = undefined;
	            } else if (_isFunction(meta)) {
	                callback = meta;
	                meta = undefined;
	            }
	            var content = {
	                meta: meta,
	                data: data,
	                last: last
	            };
	            var ext = {
	                ext: {
	                    binary: {}
	                }
	            };
	            this.publish(channel, content, ext, callback);
	        };

	        this.remoteCall = function(target, content, timeout, callProps, callback) {
	            if (arguments.length < 1) {
	                throw 'Illegal arguments number: required 1, got ' + arguments.length;
	            }
	            if (!_isString(target)) {
	                throw 'Illegal argument type: target must be a string';
	            }
	            if (_isDisconnected()) {
	                throw 'Illegal state: disconnected';
	            }

	            if (_isFunction(content)) {
	                callback = content;
	                content = {};
	                timeout = _config.maxNetworkDelay;
	                callProps = undefined;
	            } else if (_isFunction(timeout)) {
	                callback = timeout;
	                timeout = _config.maxNetworkDelay;
	                callProps = undefined;
	            } else if (_isFunction(callProps)) {
	                callback = callProps;
	                callProps = undefined;
	            }

	            if (typeof timeout !== 'number') {
	                throw 'Illegal argument type: timeout must be a number';
	            }

	            if (!target.match(/^\//)) {
	                target = '/' + target;
	            }
	            var channel = '/service' + target;

	            var bayeuxMessage = {
	                id: _nextMessageId(),
	                channel: channel,
	                data: content
	            };
	            var message = this._mixin(false, {}, callProps, bayeuxMessage);

	            var context = {
	                callback: callback
	            };
	            if (timeout > 0) {
	                context.timeout = _cometd.setTimeout(function() {
	                    _cometd._debug('Timing out remote call', message, 'after', timeout, 'ms');
	                    _failMessage({
	                        id: message.id,
	                        error: '406::timeout',
	                        successful: false,
	                        failure: {
	                            message: message,
	                            reason: 'Remote Call Timeout'
	                        }
	                    });
	                }, timeout);
	                _cometd._debug('Scheduled remote call timeout', message, 'in', timeout, 'ms');
	            }
	            _remoteCalls[message.id] = context;

	            _queueSend(message);
	        };

	        this.remoteCallBinary = function(target, data, last, meta, timeout, callback) {
	            if (_isFunction(data)) {
	                callback = data;
	                data = new ArrayBuffer(0);
	                last = true;
	                meta = undefined;
	                timeout = _config.maxNetworkDelay;
	            } else if (_isFunction(last)) {
	                callback = last;
	                last = true;
	                meta = undefined;
	                timeout = _config.maxNetworkDelay;
	            } else if (_isFunction(meta)) {
	                callback = meta;
	                meta = undefined;
	                timeout = _config.maxNetworkDelay;
	            } else if (_isFunction(timeout)) {
	                callback = timeout;
	                timeout = _config.maxNetworkDelay;
	            }

	            var content = {
	                meta: meta,
	                data: data,
	                last: last
	            };
	            var ext = {
	                ext: {
	                    binary: {}
	                }
	            };

	            this.remoteCall(target, content, timeout, ext, callback);
	        };

	        /**
	         * Returns a string representing the status of the bayeux communication with the Bayeux server.
	         */
	        this.getStatus = function() {
	            return _status;
	        };

	        /**
	         * Returns whether this instance has been disconnected.
	         */
	        this.isDisconnected = _isDisconnected;

	        /**
	         * Sets the backoff period used to increase the backoff time when retrying an unsuccessful or failed message.
	         * Default value is 1 second, which means if there is a persistent failure the retries will happen
	         * after 1 second, then after 2 seconds, then after 3 seconds, etc. So for example with 15 seconds of
	         * elapsed time, there will be 5 retries (at 1, 3, 6, 10 and 15 seconds elapsed).
	         * @param period the backoff period to set
	         * @see #getBackoffIncrement()
	         */
	        this.setBackoffIncrement = function(period) {
	            _config.backoffIncrement = period;
	        };

	        /**
	         * Returns the backoff period used to increase the backoff time when retrying an unsuccessful or failed message.
	         * @see #setBackoffIncrement(period)
	         */
	        this.getBackoffIncrement = function() {
	            return _config.backoffIncrement;
	        };

	        /**
	         * Returns the backoff period to wait before retrying an unsuccessful or failed message.
	         */
	        this.getBackoffPeriod = function() {
	            return _backoff;
	        };

	        /**
	         * Increases the backoff period up to the maximum value configured.
	         * @returns the backoff period after increment
	         * @see getBackoffIncrement
	         */
	        this.increaseBackoffPeriod = function() {
	            return _increaseBackoff();
	        };

	        /**
	         * Resets the backoff period to zero.
	         */
	        this.resetBackoffPeriod = function() {
	            _resetBackoff();
	        };

	        /**
	         * Sets the log level for console logging.
	         * Valid values are the strings 'error', 'warn', 'info' and 'debug', from
	         * less verbose to more verbose.
	         * @param level the log level string
	         */
	        this.setLogLevel = function(level) {
	            _config.logLevel = level;
	        };

	        /**
	         * Registers an extension whose callbacks are called for every incoming message
	         * (that comes from the server to this client implementation) and for every
	         * outgoing message (that originates from this client implementation for the
	         * server).
	         * The format of the extension object is the following:
	         * <pre>
	         * {
	         *     incoming: function(message) { ... },
	         *     outgoing: function(message) { ... }
	         * }
	         * </pre>
	         * Both properties are optional, but if they are present they will be called
	         * respectively for each incoming message and for each outgoing message.
	         * @param name the name of the extension
	         * @param extension the extension to register
	         * @return true if the extension was registered, false otherwise
	         * @see #unregisterExtension(name)
	         */
	        this.registerExtension = function(name, extension) {
	            if (arguments.length < 2) {
	                throw 'Illegal arguments number: required 2, got ' + arguments.length;
	            }
	            if (!_isString(name)) {
	                throw 'Illegal argument type: extension name must be a string';
	            }

	            var existing = false;
	            for (var i = 0; i < _extensions.length; ++i) {
	                var existingExtension = _extensions[i];
	                if (existingExtension.name === name) {
	                    existing = true;
	                    break;
	                }
	            }
	            if (!existing) {
	                _extensions.push({
	                    name: name,
	                    extension: extension
	                });
	                this._debug('Registered extension', name);

	                // Callback for extensions
	                if (_isFunction(extension.registered)) {
	                    extension.registered(name, this);
	                }

	                return true;
	            } else {
	                this._info('Could not register extension with name', name, 'since another extension with the same name already exists');
	                return false;
	            }
	        };

	        /**
	         * Unregister an extension previously registered with
	         * {@link #registerExtension(name, extension)}.
	         * @param name the name of the extension to unregister.
	         * @return true if the extension was unregistered, false otherwise
	         */
	        this.unregisterExtension = function(name) {
	            if (!_isString(name)) {
	                throw 'Illegal argument type: extension name must be a string';
	            }

	            var unregistered = false;
	            for (var i = 0; i < _extensions.length; ++i) {
	                var extension = _extensions[i];
	                if (extension.name === name) {
	                    _extensions.splice(i, 1);
	                    unregistered = true;
	                    this._debug('Unregistered extension', name);

	                    // Callback for extensions
	                    var ext = extension.extension;
	                    if (_isFunction(ext.unregistered)) {
	                        ext.unregistered();
	                    }

	                    break;
	                }
	            }
	            return unregistered;
	        };

	        /**
	         * Find the extension registered with the given name.
	         * @param name the name of the extension to find
	         * @return the extension found or null if no extension with the given name has been registered
	         */
	        this.getExtension = function(name) {
	            for (var i = 0; i < _extensions.length; ++i) {
	                var extension = _extensions[i];
	                if (extension.name === name) {
	                    return extension.extension;
	                }
	            }
	            return null;
	        };

	        /**
	         * Returns the name assigned to this CometD object, or the string 'default'
	         * if no name has been explicitly passed as parameter to the constructor.
	         */
	        this.getName = function() {
	            return _name;
	        };

	        /**
	         * Returns the clientId assigned by the Bayeux server during handshake.
	         */
	        this.getClientId = function() {
	            return _clientId;
	        };

	        /**
	         * Returns the URL of the Bayeux server.
	         */
	        this.getURL = function() {
	            if (_transport) {
	                var url = _transport.getURL();
	                if (url) {
	                    return url;
	                }
	                url = _config.urls[_transport.getType()];
	                if (url) {
	                    return url;
	                }
	            }
	            return _config.url;
	        };

	        this.getTransport = function() {
	            return _transport;
	        };

	        this.getConfiguration = function() {
	            return this._mixin(true, {}, _config);
	        };

	        this.getAdvice = function() {
	            return this._mixin(true, {}, _advice);
	        };

	        this.setTimeout = function(funktion, delay) {
	            return _scheduler.setTimeout(function() {
	                try {
	                    _cometd._debug('Invoking timed function', funktion);
	                    funktion();
	                } catch (x) {
	                    _cometd._debug('Exception invoking timed function', funktion, x);
	                }
	            }, delay);
	        };

	        this.clearTimeout = function(id) {
	            _scheduler.clearTimeout(id);
	        };

	        // Initialize transports.
	        if (window.WebSocket) {
	            this.registerTransport('websocket', new WebSocketTransport());
	        }
	        this.registerTransport('long-polling', new LongPollingTransport());
	        this.registerTransport('callback-polling', new CallbackPollingTransport());
	    };

	    var _z85EncodeTable = [
	        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
	        'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j',
	        'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't',
	        'u', 'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'D',
	        'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N',
	        'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X',
	        'Y', 'Z', '.', '-', ':', '+', '=', '^', '!', '/',
	        '*', '?', '&', '<', '>', '(', ')', '[', ']', '{',
	        '}', '@', '%', '$', '#'
	    ];
	    var _z85DecodeTable = [
	        0x00, 0x44, 0x00, 0x54, 0x53, 0x52, 0x48, 0x00,
	        0x4B, 0x4C, 0x46, 0x41, 0x00, 0x3F, 0x3E, 0x45,
	        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
	        0x08, 0x09, 0x40, 0x00, 0x49, 0x42, 0x4A, 0x47,
	        0x51, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A,
	        0x2B, 0x2C, 0x2D, 0x2E, 0x2F, 0x30, 0x31, 0x32,
	        0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A,
	        0x3B, 0x3C, 0x3D, 0x4D, 0x00, 0x4E, 0x43, 0x00,
	        0x00, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
	        0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
	        0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F, 0x20,
	        0x21, 0x22, 0x23, 0x4F, 0x00, 0x50, 0x00, 0x00
	    ];
	    var Z85 = {
	        encode: function(bytes) {
	            var buffer = null;
	            if (bytes instanceof ArrayBuffer) {
	                buffer = bytes;
	            } else if (bytes.buffer instanceof ArrayBuffer) {
	                buffer = bytes.buffer;
	            } else if (Array.isArray(bytes)) {
	                buffer = new Uint8Array(bytes).buffer;
	            }
	            if (buffer == null) {
	                throw 'Cannot Z85 encode ' + bytes;
	            }

	            var length = buffer.byteLength;
	            var remainder = length % 4;
	            var padding = 4 - (remainder === 0 ? 4 : remainder);
	            var view = new DataView(buffer);
	            var result = '';
	            var value = 0;
	            for (var i = 0; i < length + padding; ++i) {
	                var isPadding = i >= length;
	                value = value * 256 + (isPadding ? 0 : view.getUint8(i));
	                if ((i + 1) % 4 === 0) {
	                    var divisor = 85 * 85 * 85 * 85;
	                    for (var j = 5; j > 0; --j) {
	                        if (!isPadding || j > padding) {
	                            var code = Math.floor(value / divisor) % 85;
	                            result += _z85EncodeTable[code];
	                        }
	                        divisor /= 85;
	                    }
	                    value = 0;
	                }
	            }

	            return result;
	        },
	        decode: function(string) {
	            var remainder = string.length % 5;
	            var padding = 5 - (remainder === 0 ? 5 : remainder);
	            for (var p = 0; p < padding; ++p) {
	                string += _z85EncodeTable[_z85EncodeTable.length - 1];
	            }
	            var length = string.length;

	            var buffer = new ArrayBuffer((length * 4 / 5) - padding);
	            var view = new DataView(buffer);
	            var value = 0;
	            var charIdx = 0;
	            var byteIdx = 0;
	            for (var i = 0; i < length; ++i) {
	                var code = string.charCodeAt(charIdx++) - 32;
	                value = value * 85 + _z85DecodeTable[code];
	                if (charIdx % 5 === 0) {
	                    var divisor = 256 * 256 * 256;
	                    while (divisor >= 1) {
	                        if (byteIdx < view.byteLength) {
	                            view.setUint8(byteIdx++, Math.floor(value / divisor) % 256);
	                        }
	                        divisor /= 256;
	                    }
	                    value = 0;
	                }
	            }

	            return buffer;
	        }
	    };

	    return {
	        CometD: CometD,
	        Transport: Transport,
	        RequestTransport: RequestTransport,
	        LongPollingTransport: LongPollingTransport,
	        CallbackPollingTransport: CallbackPollingTransport,
	        WebSocketTransport: WebSocketTransport,
	        Utils: Utils,
	        Z85: Z85
	    };
	}));
	});

	var browser = {
	  CometD: cometd.CometD,
	  default: cometd
	};
	var browser_1 = browser.CometD;

	var MetaChannel;
	(function (MetaChannel) {
	    MetaChannel["HANDSHAKE"] = "/meta/handshake";
	    MetaChannel["CONNECT"] = "/meta/connect";
	    MetaChannel["SUBSCRIBE"] = "/meta/subscribe";
	    MetaChannel["UNSUBSCRIBE"] = "/meta/unsubscribe";
	})(MetaChannel || (MetaChannel = {}));

	class Realtime {
	    /**
	     * Allows to set up a realtime (websocket or long-polling) connection to the platform.
	     * @param client The fetch client instance to use
	     * @param url The URL to connect to
	     * @param handshakeCallback A function which is called on succeeded or failed handshake
	     */
	    constructor(client, url = '/notification/realtime', handshakeCallback) {
	        this.client = client;
	        this.url = url;
	        this.cometd = new browser_1();
	        this.metaHandshake = msg => {
	            if (!msg.successful) {
	                throw new Error('Handshake failed');
	            }
	        };
	        this.cometd.websocketEnabled = true;
	        this.cometd.addListener(MetaChannel.HANDSHAKE, handshakeCallback || this.metaHandshake);
	    }
	    /**
	     * Subscribes to a realtime channel to listen for data.
	     * @param channel The channel to connect to
	     * @param callback A function to call when data is received
	     */
	    subscribe(channel, callback) {
	        this.checkConnection();
	        return this.cometd.subscribe(channel, callback);
	    }
	    /**
	     * Cancels the listening to a channel.
	     * @param subscription The subscription object returned by subscribe()
	     */
	    unsubscribe(subscription) {
	        return this.cometd.unsubscribe(subscription);
	    }
	    /**
	     * Disconnects the current connection.
	     */
	    disconnect() {
	        this.cometd.disconnect();
	    }
	    checkConnection() {
	        const { cometd, client, url } = this;
	        if (cometd.isDisconnected()) {
	            const { headers } = client.getFetchOptions();
	            const config = {
	                url: client.getUrl(url),
	                requestHeaders: headers
	            };
	            cometd.configure(config);
	            this.handshake(client.getCometdHandshake());
	        }
	    }
	    handshake(config) {
	        this.cometd.handshake(config);
	    }
	}

	var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	/**
	 * Paging allows you to query the next and previous data chunks
	 * in a convenient way. You can also go to a specific page or just read
	 * page information about the current data chunk.
	 * Note that page numbers are generated by backend
	 * and may be used as offset rather than a continuous range of positive numbers
	 * (e.g. in case of users with restricted permissions).
	 */
	class Paging {
	    constructor(service, statistics, filter) {
	        this.filter = filter;
	        this.service = service;
	        this.currentPage = statistics.currentPage;
	        this.nextPage = statistics.nextPage;
	        this.prevPage = statistics.prevPage;
	        this.pageSize = statistics.pageSize;
	        this.totalPages = statistics.totalPages;
	    }
	    /**
	     * Gets the next page of available data from the server.
	     * @param filter
	     */
	    next(filter = {}) {
	        return __awaiter(this, void 0, void 0, function* () {
	            return this.list(this.getFilter(filter, this.nextPage));
	        });
	    }
	    /**
	     * Gets the previous page of available data from server.
	     * @param filter
	     */
	    prev(filter = {}) {
	        return __awaiter(this, void 0, void 0, function* () {
	            return this.list(this.getFilter(filter, this.prevPage));
	        });
	    }
	    /**
	     * Method used by next(), prev() and goto() to call the service.list method.
	     * It is public so it can be overriden in special cases (like children objects
	     * in inventory).
	     * @param filter
	     */
	    list(filter = {}) {
	        return __awaiter(this, void 0, void 0, function* () {
	            return this.service.list(filter);
	        });
	    }
	    /**
	     * Goes to the page that you define as page parameter.
	     * @param page
	     * @param filter
	     */
	    goto(page, filter = {}) {
	        return __awaiter(this, void 0, void 0, function* () {
	            return this.list(this.getFilter(filter, page));
	        });
	    }
	    getFilter(filter, page) {
	        return Object.assign(filter, this.filter, { currentPage: page });
	    }
	}

	var __awaiter$1 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	class Service {
	    constructor(client, realtime) {
	        this.client = client;
	        this.realtime = realtime;
	        this.cache = new Map();
	        const methodsToHide = ['list', 'create', 'update', 'detail', 'delete'];
	        const prototype = Object.getPrototypeOf(this);
	        methodsToHide.forEach(method => {
	            if (!prototype.hasOwnProperty(method)) {
	                Object.defineProperty(this, method, {
	                    get() {
	                        return undefined;
	                    }
	                });
	            }
	        });
	    }
	    list(filter = {}) {
	        return __awaiter$1(this, void 0, void 0, function* () {
	            const headers = { accept: 'application/json' };
	            const url = this.listUrl;
	            const res = yield this.fetch(url, this.changeFetchOptions({ headers, params: filter }, url));
	            const json = yield res.json();
	            const data = this.propertyName ? json[this.propertyName] : json;
	            const paging = this.getPaging(json, filter);
	            return { res, data, paging };
	        });
	    }
	    detail(entityOrId, filter = {}) {
	        return __awaiter$1(this, void 0, void 0, function* () {
	            const headers = { accept: 'application/json' };
	            const url = this.getDetailUrl(entityOrId);
	            const res = yield this.fetch(url, this.changeFetchOptions({ headers, params: Object.assign({}, filter) }, url));
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    create(entity) {
	        return __awaiter$1(this, void 0, void 0, function* () {
	            const url = this.listUrl;
	            const method = 'POST';
	            const body = JSON.stringify(this.onBeforeCreate(entity));
	            const headers = { 'content-type': 'application/json', accept: 'application/json' };
	            const res = yield this.fetch(url, this.changeFetchOptions({ method, body, headers }, url));
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    update(entity) {
	        return __awaiter$1(this, void 0, void 0, function* () {
	            const url = this.getDetailUrl(entity);
	            const method = 'PUT';
	            const body = JSON.stringify(this.onBeforeUpdate(entity));
	            const headers = { 'content-type': 'application/json', accept: 'application/json' };
	            const res = yield this.fetch(url, this.changeFetchOptions({ method, body, headers }, url));
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    delete(entityOrId, params) {
	        return __awaiter$1(this, void 0, void 0, function* () {
	            const method = 'DELETE';
	            const url = this.getDetailUrl(entityOrId);
	            const res = yield this.fetch(url, this.changeFetchOptions({ method, params }, url));
	            return { res, data: null };
	        });
	    }
	    onBeforeCreate(obj) {
	        delete obj.id;
	        return obj;
	    }
	    onBeforeUpdate(objWithId) {
	        return objWithId;
	    }
	    changeFetchOptions(options, url = '') {
	        return options;
	    }
	    getUrl(url = '') {
	        const baseUrl = this.baseUrl.replace(/\/+$/, '');
	        const partialUrl = url.replace(/^\/+/, '');
	        return `${baseUrl}/${partialUrl}`;
	    }
	    getDetailUrl(entityOrId) {
	        let id;
	        if (typeof entityOrId === 'object' && entityOrId.id) {
	            id = entityOrId.id;
	        }
	        else {
	            id = entityOrId;
	        }
	        return `${this.listUrl}/${id}`;
	    }
	    fetch(url, init) {
	        return __awaiter$1(this, void 0, void 0, function* () {
	            const fullUrl = this.getUrl(url);
	            const res = yield this.client.fetch(fullUrl, init);
	            if (res.status >= 400) {
	                let data = null;
	                try {
	                    data = yield res.json();
	                }
	                catch (ex) {
	                    try {
	                        data = yield res.text();
	                    }
	                    catch (ex) {
	                        // do nothing
	                    }
	                }
	                throw { res, data };
	            }
	            return res;
	        });
	    }
	    mimeType(type) {
	        return `application/vnd.com.nsn.cumulocity.${type}+json`;
	    }
	    getIdString(reference) {
	        let id;
	        if (typeof reference === 'object') {
	            id = reference.id;
	        }
	        else {
	            id = reference;
	        }
	        return String(id);
	    }
	    getPaging(json, filter) {
	        if (json.statistics) {
	            const statistics = Object.assign(Object.assign({}, json.statistics), { nextPage: this.getCurrentPageFromLink(json.next), prevPage: this.getCurrentPageFromLink(json.prev) });
	            return new Paging(this, statistics, filter);
	        }
	        return null;
	    }
	    getCurrentPageFromLink(link = '') {
	        const matches = link.match(/currentPage=(-{0,1}\d+)/);
	        return matches && parseInt(matches[1], 10);
	    }
	}

	var browserPonyfill = createCommonjsModule(function (module) {
	var __root__ = (function (root) {
	function F() { this.fetch = false; }
	F.prototype = root;
	return new F();
	})(typeof self !== 'undefined' ? self : commonjsGlobal);
	(function(self) {

	(function(self) {

	  if (self.fetch) {
	    return
	  }

	  var support = {
	    searchParams: 'URLSearchParams' in self,
	    iterable: 'Symbol' in self && 'iterator' in Symbol,
	    blob: 'FileReader' in self && 'Blob' in self && (function() {
	      try {
	        new Blob();
	        return true
	      } catch(e) {
	        return false
	      }
	    })(),
	    formData: 'FormData' in self,
	    arrayBuffer: 'ArrayBuffer' in self
	  };

	  if (support.arrayBuffer) {
	    var viewClasses = [
	      '[object Int8Array]',
	      '[object Uint8Array]',
	      '[object Uint8ClampedArray]',
	      '[object Int16Array]',
	      '[object Uint16Array]',
	      '[object Int32Array]',
	      '[object Uint32Array]',
	      '[object Float32Array]',
	      '[object Float64Array]'
	    ];

	    var isDataView = function(obj) {
	      return obj && DataView.prototype.isPrototypeOf(obj)
	    };

	    var isArrayBufferView = ArrayBuffer.isView || function(obj) {
	      return obj && viewClasses.indexOf(Object.prototype.toString.call(obj)) > -1
	    };
	  }

	  function normalizeName(name) {
	    if (typeof name !== 'string') {
	      name = String(name);
	    }
	    if (/[^a-z0-9\-#$%&'*+.\^_`|~]/i.test(name)) {
	      throw new TypeError('Invalid character in header field name')
	    }
	    return name.toLowerCase()
	  }

	  function normalizeValue(value) {
	    if (typeof value !== 'string') {
	      value = String(value);
	    }
	    return value
	  }

	  // Build a destructive iterator for the value list
	  function iteratorFor(items) {
	    var iterator = {
	      next: function() {
	        var value = items.shift();
	        return {done: value === undefined, value: value}
	      }
	    };

	    if (support.iterable) {
	      iterator[Symbol.iterator] = function() {
	        return iterator
	      };
	    }

	    return iterator
	  }

	  function Headers(headers) {
	    this.map = {};

	    if (headers instanceof Headers) {
	      headers.forEach(function(value, name) {
	        this.append(name, value);
	      }, this);
	    } else if (Array.isArray(headers)) {
	      headers.forEach(function(header) {
	        this.append(header[0], header[1]);
	      }, this);
	    } else if (headers) {
	      Object.getOwnPropertyNames(headers).forEach(function(name) {
	        this.append(name, headers[name]);
	      }, this);
	    }
	  }

	  Headers.prototype.append = function(name, value) {
	    name = normalizeName(name);
	    value = normalizeValue(value);
	    var oldValue = this.map[name];
	    this.map[name] = oldValue ? oldValue+','+value : value;
	  };

	  Headers.prototype['delete'] = function(name) {
	    delete this.map[normalizeName(name)];
	  };

	  Headers.prototype.get = function(name) {
	    name = normalizeName(name);
	    return this.has(name) ? this.map[name] : null
	  };

	  Headers.prototype.has = function(name) {
	    return this.map.hasOwnProperty(normalizeName(name))
	  };

	  Headers.prototype.set = function(name, value) {
	    this.map[normalizeName(name)] = normalizeValue(value);
	  };

	  Headers.prototype.forEach = function(callback, thisArg) {
	    for (var name in this.map) {
	      if (this.map.hasOwnProperty(name)) {
	        callback.call(thisArg, this.map[name], name, this);
	      }
	    }
	  };

	  Headers.prototype.keys = function() {
	    var items = [];
	    this.forEach(function(value, name) { items.push(name); });
	    return iteratorFor(items)
	  };

	  Headers.prototype.values = function() {
	    var items = [];
	    this.forEach(function(value) { items.push(value); });
	    return iteratorFor(items)
	  };

	  Headers.prototype.entries = function() {
	    var items = [];
	    this.forEach(function(value, name) { items.push([name, value]); });
	    return iteratorFor(items)
	  };

	  if (support.iterable) {
	    Headers.prototype[Symbol.iterator] = Headers.prototype.entries;
	  }

	  function consumed(body) {
	    if (body.bodyUsed) {
	      return Promise.reject(new TypeError('Already read'))
	    }
	    body.bodyUsed = true;
	  }

	  function fileReaderReady(reader) {
	    return new Promise(function(resolve, reject) {
	      reader.onload = function() {
	        resolve(reader.result);
	      };
	      reader.onerror = function() {
	        reject(reader.error);
	      };
	    })
	  }

	  function readBlobAsArrayBuffer(blob) {
	    var reader = new FileReader();
	    var promise = fileReaderReady(reader);
	    reader.readAsArrayBuffer(blob);
	    return promise
	  }

	  function readBlobAsText(blob) {
	    var reader = new FileReader();
	    var promise = fileReaderReady(reader);
	    reader.readAsText(blob);
	    return promise
	  }

	  function readArrayBufferAsText(buf) {
	    var view = new Uint8Array(buf);
	    var chars = new Array(view.length);

	    for (var i = 0; i < view.length; i++) {
	      chars[i] = String.fromCharCode(view[i]);
	    }
	    return chars.join('')
	  }

	  function bufferClone(buf) {
	    if (buf.slice) {
	      return buf.slice(0)
	    } else {
	      var view = new Uint8Array(buf.byteLength);
	      view.set(new Uint8Array(buf));
	      return view.buffer
	    }
	  }

	  function Body() {
	    this.bodyUsed = false;

	    this._initBody = function(body) {
	      this._bodyInit = body;
	      if (!body) {
	        this._bodyText = '';
	      } else if (typeof body === 'string') {
	        this._bodyText = body;
	      } else if (support.blob && Blob.prototype.isPrototypeOf(body)) {
	        this._bodyBlob = body;
	      } else if (support.formData && FormData.prototype.isPrototypeOf(body)) {
	        this._bodyFormData = body;
	      } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
	        this._bodyText = body.toString();
	      } else if (support.arrayBuffer && support.blob && isDataView(body)) {
	        this._bodyArrayBuffer = bufferClone(body.buffer);
	        // IE 10-11 can't handle a DataView body.
	        this._bodyInit = new Blob([this._bodyArrayBuffer]);
	      } else if (support.arrayBuffer && (ArrayBuffer.prototype.isPrototypeOf(body) || isArrayBufferView(body))) {
	        this._bodyArrayBuffer = bufferClone(body);
	      } else {
	        throw new Error('unsupported BodyInit type')
	      }

	      if (!this.headers.get('content-type')) {
	        if (typeof body === 'string') {
	          this.headers.set('content-type', 'text/plain;charset=UTF-8');
	        } else if (this._bodyBlob && this._bodyBlob.type) {
	          this.headers.set('content-type', this._bodyBlob.type);
	        } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
	          this.headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
	        }
	      }
	    };

	    if (support.blob) {
	      this.blob = function() {
	        var rejected = consumed(this);
	        if (rejected) {
	          return rejected
	        }

	        if (this._bodyBlob) {
	          return Promise.resolve(this._bodyBlob)
	        } else if (this._bodyArrayBuffer) {
	          return Promise.resolve(new Blob([this._bodyArrayBuffer]))
	        } else if (this._bodyFormData) {
	          throw new Error('could not read FormData body as blob')
	        } else {
	          return Promise.resolve(new Blob([this._bodyText]))
	        }
	      };

	      this.arrayBuffer = function() {
	        if (this._bodyArrayBuffer) {
	          return consumed(this) || Promise.resolve(this._bodyArrayBuffer)
	        } else {
	          return this.blob().then(readBlobAsArrayBuffer)
	        }
	      };
	    }

	    this.text = function() {
	      var rejected = consumed(this);
	      if (rejected) {
	        return rejected
	      }

	      if (this._bodyBlob) {
	        return readBlobAsText(this._bodyBlob)
	      } else if (this._bodyArrayBuffer) {
	        return Promise.resolve(readArrayBufferAsText(this._bodyArrayBuffer))
	      } else if (this._bodyFormData) {
	        throw new Error('could not read FormData body as text')
	      } else {
	        return Promise.resolve(this._bodyText)
	      }
	    };

	    if (support.formData) {
	      this.formData = function() {
	        return this.text().then(decode)
	      };
	    }

	    this.json = function() {
	      return this.text().then(JSON.parse)
	    };

	    return this
	  }

	  // HTTP methods whose capitalization should be normalized
	  var methods = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT'];

	  function normalizeMethod(method) {
	    var upcased = method.toUpperCase();
	    return (methods.indexOf(upcased) > -1) ? upcased : method
	  }

	  function Request(input, options) {
	    options = options || {};
	    var body = options.body;

	    if (input instanceof Request) {
	      if (input.bodyUsed) {
	        throw new TypeError('Already read')
	      }
	      this.url = input.url;
	      this.credentials = input.credentials;
	      if (!options.headers) {
	        this.headers = new Headers(input.headers);
	      }
	      this.method = input.method;
	      this.mode = input.mode;
	      if (!body && input._bodyInit != null) {
	        body = input._bodyInit;
	        input.bodyUsed = true;
	      }
	    } else {
	      this.url = String(input);
	    }

	    this.credentials = options.credentials || this.credentials || 'omit';
	    if (options.headers || !this.headers) {
	      this.headers = new Headers(options.headers);
	    }
	    this.method = normalizeMethod(options.method || this.method || 'GET');
	    this.mode = options.mode || this.mode || null;
	    this.referrer = null;

	    if ((this.method === 'GET' || this.method === 'HEAD') && body) {
	      throw new TypeError('Body not allowed for GET or HEAD requests')
	    }
	    this._initBody(body);
	  }

	  Request.prototype.clone = function() {
	    return new Request(this, { body: this._bodyInit })
	  };

	  function decode(body) {
	    var form = new FormData();
	    body.trim().split('&').forEach(function(bytes) {
	      if (bytes) {
	        var split = bytes.split('=');
	        var name = split.shift().replace(/\+/g, ' ');
	        var value = split.join('=').replace(/\+/g, ' ');
	        form.append(decodeURIComponent(name), decodeURIComponent(value));
	      }
	    });
	    return form
	  }

	  function parseHeaders(rawHeaders) {
	    var headers = new Headers();
	    rawHeaders.split(/\r?\n/).forEach(function(line) {
	      var parts = line.split(':');
	      var key = parts.shift().trim();
	      if (key) {
	        var value = parts.join(':').trim();
	        headers.append(key, value);
	      }
	    });
	    return headers
	  }

	  Body.call(Request.prototype);

	  function Response(bodyInit, options) {
	    if (!options) {
	      options = {};
	    }

	    this.type = 'default';
	    this.status = 'status' in options ? options.status : 200;
	    this.ok = this.status >= 200 && this.status < 300;
	    this.statusText = 'statusText' in options ? options.statusText : 'OK';
	    this.headers = new Headers(options.headers);
	    this.url = options.url || '';
	    this._initBody(bodyInit);
	  }

	  Body.call(Response.prototype);

	  Response.prototype.clone = function() {
	    return new Response(this._bodyInit, {
	      status: this.status,
	      statusText: this.statusText,
	      headers: new Headers(this.headers),
	      url: this.url
	    })
	  };

	  Response.error = function() {
	    var response = new Response(null, {status: 0, statusText: ''});
	    response.type = 'error';
	    return response
	  };

	  var redirectStatuses = [301, 302, 303, 307, 308];

	  Response.redirect = function(url, status) {
	    if (redirectStatuses.indexOf(status) === -1) {
	      throw new RangeError('Invalid status code')
	    }

	    return new Response(null, {status: status, headers: {location: url}})
	  };

	  self.Headers = Headers;
	  self.Request = Request;
	  self.Response = Response;

	  self.fetch = function(input, init) {
	    return new Promise(function(resolve, reject) {
	      var request = new Request(input, init);
	      var xhr = new XMLHttpRequest();

	      xhr.onload = function() {
	        var options = {
	          status: xhr.status,
	          statusText: xhr.statusText,
	          headers: parseHeaders(xhr.getAllResponseHeaders() || '')
	        };
	        options.url = 'responseURL' in xhr ? xhr.responseURL : options.headers.get('X-Request-URL');
	        var body = 'response' in xhr ? xhr.response : xhr.responseText;
	        resolve(new Response(body, options));
	      };

	      xhr.onerror = function() {
	        reject(new TypeError('Network request failed'));
	      };

	      xhr.ontimeout = function() {
	        reject(new TypeError('Network request failed'));
	      };

	      xhr.open(request.method, request.url, true);

	      if (request.credentials === 'include') {
	        xhr.withCredentials = true;
	      }

	      if ('responseType' in xhr && support.blob) {
	        xhr.responseType = 'blob';
	      }

	      request.headers.forEach(function(value, name) {
	        xhr.setRequestHeader(name, value);
	      });

	      xhr.send(typeof request._bodyInit === 'undefined' ? null : request._bodyInit);
	    })
	  };
	  self.fetch.polyfill = true;
	})(typeof self !== 'undefined' ? self : this);
	}).call(__root__, void(0));
	var fetch = __root__.fetch;
	var Response = fetch.Response = __root__.Response;
	var Request = fetch.Request = __root__.Request;
	var Headers = fetch.Headers = __root__.Headers;
	if ('object' === 'object' && module.exports) {
	module.exports = fetch;
	}
	});

	var __awaiter$2 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	let auths = new WeakMap(); // tslint:disable-line
	class FetchClient {
	    constructor(authOrBaseUrl, baseUrl) {
	        this.baseUrl = baseUrl;
	        this.tenant = '';
	        this.defaultHeaders = {};
	        if (typeof authOrBaseUrl === 'string') {
	            baseUrl = authOrBaseUrl;
	        }
	        else {
	            this.setAuth(authOrBaseUrl);
	        }
	        this.baseUrl = this.resolveServerUrl(baseUrl);
	    }
	    setAuth(auth) {
	        auths.set(this, auth);
	    }
	    fetch(url, init) {
	        return __awaiter$2(this, void 0, void 0, function* () {
	            let fetchFn = browserPonyfill;
	            try {
	                fetchFn = window.fetch || fetchFn;
	            }
	            catch (e) { /* do nothing */ }
	            const fullUrl = this.getUrl(url, init);
	            const options = this.getFetchOptions(init);
	            return fetchFn(fullUrl, options);
	        });
	    }
	    getUrl(url = '', options) {
	        const params = options && options.params;
	        let paramPart = '';
	        if (params && Object.keys(params).length) {
	            paramPart = Object.keys(params)
	                .map((k) => {
	                let vals = params[k];
	                const encodedKey = encodeURIComponent(k);
	                if (!Array.isArray(vals)) {
	                    vals = [vals];
	                }
	                return vals.map((v) => `${encodedKey}=${encodeURIComponent(v)}`).join('&');
	            })
	                .join('&');
	            paramPart = `?${paramPart}`;
	        }
	        const baseUrl = this.baseUrl.replace(/\/+$/, '').replace(/^\/+/, '');
	        const partialUrl = url.replace(/\/+$/, '').replace(/^\/+/, '');
	        return `${baseUrl}/${partialUrl}${paramPart}`;
	    }
	    getFetchOptions(options = {}) {
	        const auth = auths.get(this);
	        options.headers = Object.assign({}, this.defaultHeaders, options.headers, { UseXBasic: true });
	        delete options.params;
	        options = auth ? auth.getFetchOptions(options) : options;
	        return options;
	    }
	    getCometdHandshake(config = {}) {
	        const auth = auths.get(this);
	        return auth ? auth.getCometdHandshake(config) : config;
	    }
	    resolveServerUrl(baseUrl = '') {
	        if (baseUrl && baseUrl.startsWith('http')) {
	            return baseUrl.replace(/\/+$/, '');
	        }
	        try {
	            const location = window.location;
	            return `${location.protocol}//${location.host}/${baseUrl.replace(/\/+$/, '')}`;
	        }
	        catch (ex) {
	            throw Error('Your environment does not support relative URLs. Please provide a base URL.');
	        }
	    }
	}

	var error = function (message) {
	  function E() {
	    this.message = message;
	  }

	  E.prototype = new Error();
	  E.prototype.name = 'InvalidCharacterError';
	  E.prototype.code = 5;
	  return E;
	};
	var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

	var E = error('The string to be encoded contains characters out of range');
	var _btoa = typeof btoa !== 'undefined'
	/* istanbul ignore next */
	? function (input) {
	  return btoa(input);
	} : function (input) {
	  var str = String(input);
	  var output = '';

	  for ( // initialize result and counter
	  var block, charCode, idx = 0, map = chars; // if the next str index does not exist:
	  //   change the mapping table to "="
	  //   check if d has no fractional digits
	  str.charAt(idx | 0) || (map = '=', idx % 1); // "8 - idx % 1 * 8" generates the sequence 2, 4, 6, 8
	  output += map.charAt(63 & block >> 8 - idx % 1 * 8)) {
	    charCode = str.charCodeAt(idx += 3 / 4);

	    if (charCode > 0xFF) {
	      throw new E();
	    }

	    block = block << 8 | charCode;
	  }

	  return output;
	};

	var utf8 = function (input) {
	  return encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, function (match, p1) {
	    return String.fromCharCode('0x' + p1);
	  });
	};

	var btoa$1 = (function (input) {
	  return _btoa(utf8(input));
	});

	var E$1 = error('The string to be decoded is not correctly encoded');

	// this is var and not const to please typedoc https://github.com/TypeStrong/typedoc/issues/691
	var secrets = new WeakMap(); // tslint:disable-line
	/**
	 * Allows to use Basic-Auth for Authorization to the
	 * Cumulocity API.
	 */
	class BasicAuth {
	    /**
	     * Authenticates the given user against the given tenant.
	     * @param name
	     * @param password
	     * @param tenant
	     */
	    constructor(credentials) {
	        this.updateCredentials(credentials);
	    }
	    updateCredentials({ tenant, user, password, token, tfa } = {}) {
	        const secret = secrets.get(this) || {};
	        if (user && tenant) {
	            user = `${tenant}/${user}`;
	        }
	        user = user || this.user;
	        password = password || secret.password;
	        if (!token && user && password) {
	            token = btoa$1(`${user}:${password}`);
	        }
	        if (user) {
	            this.user = user;
	        }
	        token = token || secret.token;
	        tfa = tfa || secret.tfa;
	        secrets.set(this, { tfa, token, password });
	        return token;
	    }
	    getFetchOptions(options) {
	        const secret = secrets.get(this);
	        const { token, tfa } = secret;
	        const xsrfToken = this.getCookieValue('XSRF-TOKEN');
	        const headers = Object.assign({ Authorization: `Basic ${token || ''}` }, (xsrfToken ? { 'X-XSRF-TOKEN': xsrfToken } : undefined));
	        if (tfa) {
	            headers.tfatoken = tfa;
	        }
	        options.headers = Object.assign(headers, options.headers);
	        return options;
	    }
	    getCometdHandshake(config = {}) {
	        const secret = secrets.get(this);
	        const { token, tfa } = secret;
	        const KEY = 'com.cumulocity.authn';
	        const ext = config.ext = config.ext || {};
	        const auth = ext[KEY] = Object.assign(ext[KEY] || {}, { token, tfa });
	        return config;
	    }
	    logout() {
	        delete this.user;
	        secrets.set(this, {});
	    }
	    getCookieValue(name) {
	        try {
	            const value = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
	            return value ? value.pop() : undefined;
	        }
	        catch (ex) {
	            return undefined;
	        }
	    }
	}

	var __awaiter$3 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	/**
	 * Allows to use Cookies for Authorization to the
	 * Cumulocity API.
	 */
	class CookieAuth {
	    constructor() {
	        this.logoutUrl = 'user/logout';
	    }
	    updateCredentials({ user } = {}) {
	        this.user = user;
	        return undefined;
	    }
	    getFetchOptions(options) {
	        const xsrfToken = this.getCookieValue('XSRF-TOKEN');
	        const headers = { 'X-XSRF-TOKEN': xsrfToken };
	        options.headers = Object.assign(headers, options.headers);
	        return options;
	    }
	    getCometdHandshake(config = {}) {
	        const KEY = 'com.cumulocity.authn';
	        const xsrfToken = this.getCookieValue('XSRF-TOKEN');
	        const ext = (config.ext = config.ext || {});
	        ext[KEY] = Object.assign(ext[KEY] || {}, { xsrfToken });
	        return config;
	    }
	    logout() {
	        return __awaiter$3(this, void 0, void 0, function* () {
	            if (this.user) {
	                delete this.user;
	            }
	            const client = new FetchClient();
	            client.setAuth(this);
	            const method = 'POST';
	            const body = JSON.stringify({});
	            const headers = { 'content-type': 'application/json', accept: 'application/json' };
	            return client.fetch(this.logoutUrl, { headers, body, method });
	        });
	    }
	    getCookieValue(name) {
	        const value = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
	        return value ? value.pop() : '';
	    }
	}

	/**
	 * Allows to use either Cookie-Auth or Basic-Auth
	 * of a microservice client request header
	 * for Authorization to the Cumulocity API.
	 */
	class MicroserviceClientRequestAuth {
	    /**
	     * Authenticates using the credentials which were
	     * provided within the request headers of the
	     * client call to the microservice.
	     * @param headers
	     */
	    constructor(headers = {}) {
	        this.xsrfToken = this.getCookieValue(headers, 'XSRF-TOKEN');
	        this.authTokenFromCookie = this.getCookieValue(headers, 'authorization');
	        this.authTokenFromHeader = headers.authorization;
	    }
	    updateCredentials(credentials = {}) {
	        return undefined;
	    }
	    getFetchOptions(options) {
	        const headers = Object.assign({ Authorization: this.authTokenFromCookie
	                ? `Bearer ${this.authTokenFromCookie}`
	                : this.authTokenFromHeader }, (this.xsrfToken ? { 'X-XSRF-TOKEN': this.xsrfToken } : undefined));
	        options.headers = Object.assign(headers, options.headers);
	        return options;
	    }
	    getCometdHandshake(config = {}) {
	        const KEY = 'com.cumulocity.authn';
	        const xsrfToken = this.xsrfToken;
	        let token = this.authTokenFromCookie;
	        if (!token && this.authTokenFromHeader) {
	            token = this.authTokenFromHeader.replace('Basic ', '').replace('Bearer ', '');
	        }
	        const ext = (config.ext = config.ext || {});
	        ext[KEY] = Object.assign(ext[KEY] || {}, Object.assign({ token }, (xsrfToken ? { xsrfToken } : undefined)));
	        return config;
	    }
	    logout() {
	        if (this.authTokenFromCookie) {
	            delete this.authTokenFromCookie;
	        }
	        if (this.authTokenFromHeader) {
	            delete this.authTokenFromHeader;
	        }
	        if (this.xsrfToken) {
	            delete this.xsrfToken;
	        }
	    }
	    getCookieValue(headers, name) {
	        try {
	            const value = headers && headers.cookie && headers.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
	            return value ? value.pop() : undefined;
	        }
	        catch (ex) {
	            return undefined;
	        }
	    }
	}

	/** Identity function used for marking strings for translation */
	const gettext = t => t;

	(function (Severity) {
	    Severity[Severity["CRITICAL"] = gettext('CRITICAL')] = "CRITICAL";
	    Severity[Severity["MAJOR"] = gettext('MAJOR')] = "MAJOR";
	    Severity[Severity["MINOR"] = gettext('MINOR')] = "MINOR";
	    Severity[Severity["WARNING"] = gettext('WARNING')] = "WARNING";
	})(exports.Severity || (exports.Severity = {}));

	class QueriesUtil {
	    constructor() {
	        this.operatorFns = {
	            __not: operand => {
	                return `not(${this.buildQueryFilter(operand, null)})`;
	            },
	            __and: operand => {
	                return this.buildQueryFilter(operand, null, 'and');
	            },
	            __or: operand => {
	                return this.buildQueryFilter(operand, null, 'or');
	            },
	            __eq: (operand, contextKey) => {
	                if (typeof operand === 'object' && operand !== null) {
	                    return this.buildQueryFilter(operand, contextKey);
	                }
	                return `${contextKey} eq ${this.quoteString(operand)}`;
	            },
	            __gt: (operand, contextKey) => {
	                return `${contextKey} gt ${this.quoteString(operand)}`;
	            },
	            __ge: (operand, contextKey) => {
	                return `${contextKey} ge ${this.quoteString(operand)}`;
	            },
	            __lt: (operand, contextKey) => {
	                return `${contextKey} lt ${this.quoteString(operand)}`;
	            },
	            __le: (operand, contextKey) => {
	                return `${contextKey} le ${this.quoteString(operand)}`;
	            },
	            __in: (operand, contextKey) => {
	                const stmts = operand
	                    .filter(op => !!op)
	                    .map(op => {
	                    return `${contextKey} eq ${this.quoteString(op)}`;
	                });
	                return this.glue(stmts, 'or');
	            },
	            __bygroupid: operand => {
	                return `bygroupid(${operand})`;
	            },
	            __has: operand => {
	                return `has(${operand})`;
	            },
	            __useFilterQueryString: (queryString) => {
	                // match everything inside the most exterior parentheses, including them
	                const query = queryString.match(/\(.*\)/)[0];
	                // get rid of the most exterior parentheses
	                return query.substring(1, query.length - 1);
	            }
	        };
	    }
	    /**
	     * Builds query string from provided query object.
	     *
	     * @param query Object containing filters and sort order for querying managed objects. Supported filters are:
	     * - **__and** - Specifies conditions, e.g. {__and: [{__has: 'c8y_IsDevice'}, {'count': {__gt: 0}}]}.
	     * - **__or** - Specifies alternative conditions, e.g. {__or: [{__bygroupid: 10300}, {__bygroupid: 10400}]}.
	     * - **__eq** - Specified fragment must be equal to given value, e.g. {'status': 'AVAILABLE'} (no nested object required).
	     * - **__lt** - Specified fragment must be less then given value, e.g. {'count': {__lt: 10}}.
	     * - **__gt** - Specified fragment must be greater then given value, e.g. {'count': {__gt: 0}}.
	     * - **__in** - Specified fragment must be equal to one of values in the list, e.g. {'status': {__in: ['AVAILABLE', 'UNAVAILABLE']}}.
	     * - **__not** - Negates condition, e.g. {__not: {'status': 'AVAILABLE'}}.
	     * - **__bygroupid** - True if filtered managed object is assigned to given group, e.g. {__bygroupid: 10300}.
	     * - **__has** - Specified fragment must have a value defined, e.g. {__has: 'c8y_IsDevice'}.
	     * - **__useFilterQueryString** - Gets rid of the '$filter=()… $orderby=…' parts of a query and keeps only what's between the most
	     *                                exterior parentheses of the $filter.
	     *                                EXAMPLE: takes a query of the form
	     *                                "$filter=(name eq 'RaspPi*') $orderby=name asc"
	     *                                and turns it into
	     *                                "name eq 'RaspPi*'"
	     *                                This is necessary for searching for smart groups, which are identified by their own query
	     *                                that needs to be passed through.
	     *
	     *
	     * The order is specified by an array of field paths and sort direction (1 for ascending, -1 for descending), e.g.:
	     * - {__orderby: [{'creationTime': -1}, {'name': 1}], __filter: {...}}
	     *
	     * @returns {string} Returns a query string ready to be sent in request params to backend.
	     *
	     * **Example**
	     * <pre>
	     *   const query = {
	     *     __filter: {
	     *       'name': 'My Device*',
	     *       'c8y_Availability.status': {
	     *         __in: ['AVAILABLE', 'UNAVAILABLE']
	     *       },
	     *       'creationTime': {
	     *         __lt: '2015-11-30T13:28:123Z'
	     *       },
	     *       'c8y_ActiveAlarmsStatus.critical': {
	     *         __gt: 0
	     *       },
	     *       __or: [
	     *         {__not: {__has: 'c8y_ActiveAlarmsStatus.major'}},
	     *         {
	     *           __or: [
	     *             {__bygroupid: 10300},
	     *             {__bygroupid: 10400}
	     *           ]
	     *         }
	     *       ]
	     *     },
	     *     __orderby: [
	     *       {'name': 1},
	     *       {'creationTime': -1},
	     *       {'c8y_ActiveAlarmsStatus.critical': -1}
	     *     ]
	     *   };
	     *
	     *   const params = {
	     *     query: queriesUtil.buildQuery(query)
	     *   };
	     * </pre>
	     */
	    buildQuery(query) {
	        const q = [];
	        const filter = this.buildQueryFilter(query.__filter || query);
	        const orderBy = this.buildQueryOrderby(query.__orderby);
	        if (filter) {
	            q.push(`$filter=(${filter})`);
	        }
	        if (orderBy) {
	            q.push(`$orderby=${orderBy}`);
	        }
	        return q.join(' ');
	    }
	    buildQueryFilter(queryFilter, _queryKey, _glueType) {
	        const queryKey = _queryKey || null;
	        const glueType = _glueType || 'and';
	        const q = [];
	        if (Array.isArray(queryFilter)) {
	            queryFilter.forEach(qFilter => {
	                const _q = this.buildQueryFilter(qFilter, null, glueType);
	                if (_q) {
	                    q.push(_q);
	                }
	            });
	        }
	        else {
	            let _q;
	            Object.keys(queryFilter).forEach(k => {
	                if (this.operatorFns[k] !== undefined) {
	                    _q = this.operatorFns[k](queryFilter[k], queryKey);
	                    if (_q) {
	                        q.push(_q);
	                    }
	                }
	                else {
	                    _q = this.operatorFns.__eq(queryFilter[k], k);
	                    if (_q) {
	                        q.push(_q);
	                    }
	                }
	            });
	        }
	        return this.glue(q, glueType);
	    }
	    buildQueryOrderby(queryOrderbys) {
	        const o = [];
	        if (queryOrderbys) {
	            queryOrderbys.forEach(q => {
	                Object.keys(q).forEach(k => {
	                    if (q[k] !== 0) {
	                        o.push(`${k} ${q[k] > 0 ? 'asc' : 'desc'}`);
	                    }
	                });
	            });
	        }
	        return o.join(',');
	    }
	    addAndFilter(query, filter) {
	        return this.addFilter(query, filter, 'and');
	    }
	    addOrFilter(query, filter) {
	        return this.addFilter(query, filter, 'or');
	    }
	    addFilter(query, filter, operator) {
	        const oldFilter = query.__orderby ? query.__filter || {} : query.__filter || query;
	        const newFilter = { [`__${operator}`]: this.skipEmptyObjects([oldFilter, filter]) };
	        if (!query.__filter && !query.__orderby) {
	            return newFilter;
	        }
	        query.__filter = newFilter;
	        return query;
	    }
	    prependOrderbys(query, orderbys) {
	        return this.addOrderbys(query, orderbys, 'prepend');
	    }
	    appendOrderbys(query, orderbys) {
	        return this.addOrderbys(query, orderbys, 'append');
	    }
	    addOrderbys(query, orderbys, how) {
	        const oldFilter = query.__orderby ? query.__filter || {} : query.__filter || query;
	        const oldOrderbys = query.__orderby || [];
	        const newOrderbys = how === 'prepend' ? [...orderbys, ...oldOrderbys] : [...oldOrderbys, ...orderbys];
	        const newQuery = {
	            __orderby: this.skipEmptyObjects(newOrderbys)
	        };
	        if (!this.isEmptyObject(oldFilter)) {
	            newQuery.__filter = oldFilter;
	        }
	        return newQuery;
	    }
	    glue(stmts, type) {
	        return stmts.length > 1 ? `(${stmts.join(`) ${type} (`)})` : stmts[0];
	    }
	    quoteString(s) {
	        return typeof s === 'string' ? `'${s}'` : s;
	    }
	    skipEmptyObjects(objs) {
	        return objs.filter(obj => !this.isEmptyObject(obj));
	    }
	    isEmptyObject(obj) {
	        return Object.keys(obj).length === 0;
	    }
	}

	var __awaiter$4 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	/**
	 * This class allows managing for events.
	 */
	class EventService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'event';
	        this.listUrl = 'events';
	        this.propertyName = 'events';
	        this.channel = '/events/*';
	    }
	    /**
	     * Gets the details of a specific event.
	     *
	     * @param {string|number|IIdentified} entityOrId Entity or Id of the entity.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const eventId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await eventService.detail(eventId);
	     *   })();
	     * ```
	     */
	    detail(entityOrId) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$4(this, void 0, void 0, function* () {
	            return _super.detail.call(this, entityOrId);
	        });
	    }
	    /**
	     * Creates a new event.
	     *
	     * @param {IEvent} entity Event object with mandantory fragments.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const mandantoryObject: IEvent = {
	     *    source: device,
	     *    text: 'I am an Event!',
	     *    time: '2018-05-02T10:08:00Z',
	     *    type: 'device-type-here',
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await eventService.create(mandantoryObject);
	     *  })();
	     * ```
	     */
	    create(entity) {
	        const _super = Object.create(null, {
	            create: { get: () => super.create }
	        });
	        return __awaiter$4(this, void 0, void 0, function* () {
	            return _super.create.call(this, entity);
	        });
	    }
	    /**
	     * Updates event data.
	     *
	     * @param {Partial<IEvent>} entity Event is partially updatable.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const partialUpdateObject: Partial<IEvent> = {
	     *    source: device,
	     *    text: 'Changed Event!'
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await eventService.update(partialUpdateObject);
	     *  })();
	     * ```
	     */
	    update(entity) {
	        const _super = Object.create(null, {
	            update: { get: () => super.update }
	        });
	        return __awaiter$4(this, void 0, void 0, function* () {
	            return _super.update.call(this, entity);
	        });
	    }
	    /**
	     * Gets the list of events filtered by parameters.
	     *
	     * @returns Response wrapped in [[IResultList]]
	     *
	     * @param {object} filter Object containing filters for querying events.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await eventService.list(filter);
	     *   })();
	     * ```
	     */
	    list(filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$4(this, void 0, void 0, function* () {
	            return _super.list.call(this, filter);
	        });
	    }
	    /**
	     * Removes an event with given id.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {string | number | IIdentified} entityOrId entity or id of the event.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const eventId: number = 1;
	     *
	     *   (async () => {
	     *     const {data, res} = await eventService.delete(eventId);
	     *     // data will be null
	     *   })();
	     * ```
	     */
	    delete(entityOrId) {
	        const _super = Object.create(null, {
	            delete: { get: () => super.delete }
	        });
	        return __awaiter$4(this, void 0, void 0, function* () {
	            return _super.delete.call(this, entityOrId);
	        });
	    }
	}

	/* eslint-env browser */
	var browser$1 = typeof self == 'object' ? self.FormData : window.FormData;

	var __awaiter$5 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	class EventBinaryService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'event';
	        this.listUrl = 'events';
	    }
	    /**
	     * Uploads an event binary.
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {Stream | Buffer | File | Blob} file file to upload.
	     * @param {string | number | IEvent} eventOrId Event or Id of the Event.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *   const file = Buffer.from('aaa');
	     *   const eventId: string | number = 123;
	     *
	     *    (async () => {
	     *      const {data, res} = await eventBinaryService.upload(file, eventId);
	     *   })();
	     * ```
	     */
	    upload(file, entityOrId) {
	        return __awaiter$5(this, void 0, void 0, function* () {
	            const method = 'POST';
	            const url = this.getDetailUrl(entityOrId);
	            const body = new browser$1();
	            body.append('file', file);
	            const headers = {
	                accept: 'application/json'
	            };
	            const res = yield this.fetch(url, { method, body, headers });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    /**
	     * Downloads the binary for a given event.
	     * @returns Response wrapped in [[IFetchResponse]]
	     *
	     * @param {string | number | IEvent} eventOrId Event or Id of the Event.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *   const eventId: string | number = 123;
	     *
	     *    (async () => {
	     *      const res = await eventBinaryService.download(eventId);
	     *   })();
	     */
	    download(entityOrId) {
	        return __awaiter$5(this, void 0, void 0, function* () {
	            const url = this.getDetailUrl(entityOrId);
	            return yield this.fetch(url);
	        });
	    }
	    /**
	     * Removes the binary for a given event.
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {string | number | IEvent} eventOrId Event or Id of the Event.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *   const eventId: string | number = 123;
	     *
	     *    (async () => {
	     *      const {data, res} = await eventBinaryService.delete(eventId);
	     *   })();
	     * ```
	     */
	    delete(entityOrId) {
	        const _super = Object.create(null, {
	            delete: { get: () => super.delete }
	        });
	        return __awaiter$5(this, void 0, void 0, function* () {
	            return _super.delete.call(this, entityOrId);
	        });
	    }
	    getDetailUrl(entityOrId) {
	        let id;
	        if (typeof entityOrId === 'object' && entityOrId.id) {
	            id = entityOrId.id;
	        }
	        else {
	            id = entityOrId;
	        }
	        return `${this.listUrl}/${id}/binaries`;
	    }
	}

	var __awaiter$6 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	class InventoryBinaryService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'inventory';
	        this.listUrl = 'binaries';
	        this.propertyName = 'managedObjects';
	    }
	    /**
	     * Uploads a file and creates a managed object with its metadata.
	     * @param file A file to be uploaded.
	     * @param managedObject An object containing metadata about the file.
	     * Note that you can specify `fileType` and `fileName` in case `file` does not define them
	     * but these two properties will be removed from `managedObject` before saving.
	     */
	    create(file, managedObject = {}) {
	        return __awaiter$6(this, void 0, void 0, function* () {
	            const method = 'POST';
	            const url = this.listUrl;
	            const body = new browser$1();
	            let fileName;
	            let fileType;
	            if (managedObject.fileName) {
	                fileName = managedObject.fileName;
	                delete managedObject.fileName;
	            }
	            if (managedObject.fileType) {
	                fileType = managedObject.fileType;
	                delete managedObject.fileType;
	            }
	            if (!fileName) {
	                fileName = 'bin';
	            }
	            if (typeof (File) !== 'undefined' && file instanceof File) {
	                fileName = file.name;
	                fileType = file.type;
	            }
	            if (!managedObject.name) {
	                managedObject.name = fileName;
	            }
	            if (!managedObject.type) {
	                managedObject.type = fileType || 'c8y_upload';
	            }
	            body.append('file', file, fileName);
	            body.append('object', JSON.stringify(managedObject));
	            let bodyHeaders;
	            if (typeof body.getHeaders === 'function') {
	                bodyHeaders = body.getHeaders();
	            }
	            const headers = Object.assign({
	                accept: 'application/json'
	            }, bodyHeaders);
	            const res = yield this.fetch(url, { method, body, headers });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    list(filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$6(this, void 0, void 0, function* () {
	            return _super.list.call(this, filter);
	        });
	    }
	    delete(managedObjectOrId) {
	        const _super = Object.create(null, {
	            delete: { get: () => super.delete }
	        });
	        return __awaiter$6(this, void 0, void 0, function* () {
	            return _super.delete.call(this, managedObjectOrId);
	        });
	    }
	    download(managedObjectOrId) {
	        return __awaiter$6(this, void 0, void 0, function* () {
	            const url = this.getDetailUrl(managedObjectOrId);
	            return yield this.fetch(url);
	        });
	    }
	    /**
	     * Gets binary managed object's id from its download or self URL.
	     *
	     * @param {string} url URL string.
	     *
	     * @returns {number} Binary managed object's id.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *   const id = InventoryBinaryService.getIdFromUrl('http://mytenant.cumulocity.com/inventory/binaries/12345');
	     * ```
	     */
	    getIdFromUrl(url) {
	        const regexp = new RegExp('\\/inventory\\/binaries\\/(\\d+)|\\/inventory\\/managedObjects\\/(\\d+)');
	        const matches = url.match(regexp);
	        return matches && (matches[1] || matches[2]);
	    }
	}

	var __awaiter$7 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	(function (ChildType) {
	    ChildType["ASSETS"] = "childAssets";
	    ChildType["DEVICES"] = "childDevices";
	    ChildType["ADDITIONS"] = "childAdditions";
	})(exports.ChildType || (exports.ChildType = {}));
	/**
	 * This class allows for managing managed objects and different child types, see [[ChildType]].
	 */
	class InventoryService extends Service {
	    constructor(client, realtime) {
	        super(client, realtime);
	        this.baseUrl = 'inventory';
	        this.listUrl = 'managedObjects';
	        this.propertyName = 'managedObjects';
	        this.channel = '/managedobjects/*';
	        this.inventoriesQueryParamName = 'query';
	        this.devicesQueryParamName = 'q';
	        this.queriesUtil = new QueriesUtil();
	        this.binary = new InventoryBinaryService(client);
	    }
	    /**
	     * Gets the details of managed object
	     *
	     * @param {IdReference} managedObjectOrId ManagedObject or Id of the ManagedObject.
	     * @param {object} filter Filter object.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const managedObjId: number = 1;
	     *    const filter = { withChildren: false };
	     *
	     *    (async () => {
	     *      const {data, res} = await inventoryService.detail(managedObjId, filter);
	     *   })();
	     * ```
	     */
	    detail(managedObjectOrId, filter = {}) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$7(this, void 0, void 0, function* () {
	            return _super.detail.call(this, managedObjectOrId, filter);
	        });
	    }
	    /**
	     * Creates a new managed object.
	     *
	     * @param {Partial<IManagedObject>} managedObject
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const partialManagedObj: Partial<IManagedObject> = {
	     *    customFragment: 'yourData'
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await inventoryService.create(partialManagedObj);
	     *  })();
	     * ```
	     */
	    create(managedObject) {
	        const _super = Object.create(null, {
	            create: { get: () => super.create }
	        });
	        return __awaiter$7(this, void 0, void 0, function* () {
	            return _super.create.call(this, managedObject);
	        });
	    }
	    /**
	     * Updates managed object data.
	     *
	     * @param {Partial<IManagedObject>} managedObject Managed object is partially updatable.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const partialUpdateObject: Partial<IManagedObject> = {
	     *    customFragment: 'Changed data',
	     *    name: 'Name'
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await inventoryService.update(partialUpdateObject);
	     *  })();
	     * ```
	     */
	    update(managedObject) {
	        const _super = Object.create(null, {
	            update: { get: () => super.update }
	        });
	        return __awaiter$7(this, void 0, void 0, function* () {
	            return _super.update.call(this, managedObject);
	        });
	    }
	    /**
	     * Gets the list of managed objects filtered by parameters.
	     *
	     * @returns Response wrapped in [[IResultList]]
	     *
	     * @param {object} filter Object containing filters for querying managed objects.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await inventoryService.list(filter);
	     *   })();
	     * ```
	     */
	    list(filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$7(this, void 0, void 0, function* () {
	            return _super.list.call(this, filter);
	        });
	    }
	    /**
	     * Gets the list of all managed objects filtered and sorted by given query.
	     *
	     * @returns Response wrapped in [[IResultList]]
	     *
	     * @param {object} filter Object containing filters for querying managed objects.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *  const query = {
	     *      name: 'MY-NAM*'
	     *  }
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await inventoryService.listQuery(query, filter);
	     *   })();
	     * ```
	     */
	    listQuery(query, filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$7(this, void 0, void 0, function* () {
	            filter[this.inventoriesQueryParamName] = this.queriesUtil.buildQuery(query);
	            return _super.list.call(this, filter);
	        });
	    }
	    /**
	     * Gets the list of all devices filtered and sorted by given query.
	     *
	     * @returns Response wrapped in [[IResultList]]
	     *
	     * @param {object} filter Object containing filters for querying devices.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *  const query = {
	     *      name: 'MY-NAM*'
	     *  }
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await inventoryService.listQueryDevices(query, filter);
	     *   })();
	     * ```
	     */
	    listQueryDevices(query, filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$7(this, void 0, void 0, function* () {
	            filter[this.devicesQueryParamName] = this.queriesUtil.buildQuery(query);
	            return _super.list.call(this, filter);
	        });
	    }
	    /**
	     * Removes managed object with given id.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {IdReference} managedObjectOrId ManagedObject or Id of the ManagedObject.
	     * @param {object} params Additional query params.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *   const managedObjectId: number = 1;
	     *   const params: any = {
	     *     cascade: true
	     *   }
	     *
	     *    (async () => {
	     *      const {data, res} = await inventoryService.delete(managedObjectId, params);
	     *   })();
	     * ```
	     */
	    delete(managedObjectOrId, params = {}) {
	        const _super = Object.create(null, {
	            delete: { get: () => super.delete }
	        });
	        return __awaiter$7(this, void 0, void 0, function* () {
	            return _super.delete.call(this, managedObjectOrId, params);
	        });
	    }
	    /**
	     * Gets a list of child additions from a given managed object (parent)
	     *
	     * @returns Response wrapped in [[IResultList]]
	     *
	     * @param {IdReference} parentReference
	     * @param {object} filter
	     *
	     * **Example**
	     * ```typescript
	     *    const parentReferenceId: IdReference = 1;
	     *
	     *    const filter: object = {
	     *      pageSize: 100,
	     *      withTotalPages: true
	     *    };
	     *
	     *    (async () => {
	     *      const {data, res, paging} = await inventoryService.childAdditionsList(parentReferenceId, filter);
	     *    })();
	     * ```
	     */
	    childAdditionsList(parentReference, filter = {}) {
	        return __awaiter$7(this, void 0, void 0, function* () {
	            return this.listChildren(exports.ChildType.ADDITIONS, parentReference, filter);
	        });
	    }
	    /**
	     * Creates a new managed object as child addition to another managed object (parent)
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {Partial<IManagedObject>} managedObject
	     * @param {IdReference} parentReference
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const mOAsChildAddition: Partial<IManagedObject> = {
	     *      name: 'Child addition MO',
	     *      type: 'new type',
	     *      ...
	     *    };
	     *
	     *    // This is the identifier of the managed object which should be the parent of
	     *    // mOAsChildAddition, see above.
	     *    const parentReferenceId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await inventoryService.childAdditionsCreate(mOAsChildAddition, parentReferenceId);
	     *    })();
	     * ```
	     */
	    childAdditionsCreate(managedObject, parentReference) {
	        return __awaiter$7(this, void 0, void 0, function* () {
	            return this.createChild(exports.ChildType.ADDITIONS, managedObject, parentReference);
	        });
	    }
	    /**
	     * Adds an existing managed object as child addition to another managed object (parent)
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {IdReference} childReference
	     * @param {IdReference} parentReference
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const childRef: number = 2;
	     *    const parentReferenceId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await inventoryService.childAdditionsCreate(childRef, parentReferenceId);
	     *    })();
	     * ```
	     */
	    childAdditionsAdd(childReference, parentReference) {
	        return __awaiter$7(this, void 0, void 0, function* () {
	            return this.addChild(exports.ChildType.ADDITIONS, childReference, parentReference);
	        });
	    }
	    /**
	     * Removes an existing managed object as child addition from another managed object (parent)
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {IdReference} childReference
	     * @param {IdReference} parentReference
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const childRef: number = 2;
	     *    const parentReferenceId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await inventoryService.childAdditionsRemove(childRef, parentReferenceId);
	     *    })();
	     * ```
	     */
	    childAdditionsRemove(childReference, parentReference) {
	        return __awaiter$7(this, void 0, void 0, function* () {
	            return this.removeChild(exports.ChildType.ADDITIONS, childReference, parentReference);
	        });
	    }
	    /**
	     * Gets a list of child assets from a given managed object (parent)
	     *
	     * @returns Response wrapped in [[IResultList]]
	     *
	     * @param {IdReference} parentReference
	     * @param {object} filter
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const parentReferenceId: IdReference = 1;
	     *
	     *    const filter: object = {
	     *      pageSize: 100,
	     *      withTotalPages: true
	     *    };
	     *
	     *    (async () => {
	     *      const {data, res, paging} = await inventoryService.childAssetsList(parentReferenceId, filter);
	     *    })();
	     * ```
	     */
	    childAssetsList(parentReference, filter = {}) {
	        return __awaiter$7(this, void 0, void 0, function* () {
	            return this.listChildren(exports.ChildType.ASSETS, parentReference, filter);
	        });
	    }
	    /**
	     * Creates a new managed object as child asset to another managed object (parent)
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {Partial<IManagedObject>} managedObject
	     * @param {IdReference} parentReference
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const mOAsChildAsset: Partial<IManagedObject> = {
	     *      name: 'Child asset MO',
	     *      type: 'new type',
	     *      ...
	     *    };
	     *
	     *    // This is the identifier of the managed object which should be the parent of
	     *    // mOAsChildAsset, see above.
	     *    const parentReferenceId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await inventoryService.childAdditionsCreate(mOAsChildAddition, parentReferenceId);
	     *    })();
	     * ```
	     */
	    childAssetsCreate(managedObject, parentReference) {
	        return __awaiter$7(this, void 0, void 0, function* () {
	            return this.createChild(exports.ChildType.ASSETS, managedObject, parentReference);
	        });
	    }
	    /**
	     * Adds an existing managed object as child asset to another managed object (parent)
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {IdReference} childReference
	     * @param {IdReference} parentReference
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const childRef: number = 2;
	     *    const parentReferenceId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await inventoryService.childAssetsAdd(childRef, parentReferenceId);
	     *    })();
	     * ```
	     */
	    childAssetsAdd(childReference, parentReference) {
	        return __awaiter$7(this, void 0, void 0, function* () {
	            return this.addChild(exports.ChildType.ASSETS, childReference, parentReference);
	        });
	    }
	    /**
	     * Adds bulk of existing managed objects as child assets to another managed object (parent).
	     *
	     * @returns Response wrapped in array of [[IResult]]
	     *
	     * @param {IdReference[]} childReference List of existing managed objects IDs that should be added to another managed object (parent).
	     * @param {IdReference} parentReference
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const childAssetsRefIds: string[] = ['2', '3'];
	     *    const parentReferenceId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await inventoryService.childAssetsBulkAdd(childAssetsRefIds, parentReferenceId);
	     *    })();
	     * ```
	     */
	    childAssetsBulkAdd(childReference, parentReference) {
	        return __awaiter$7(this, void 0, void 0, function* () {
	            return this.addChildBulk(exports.ChildType.ASSETS, childReference, parentReference);
	        });
	    }
	    /**
	     * Removes an existing managed object as child asset from another managed object (parent)
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {IdReference} childReference
	     * @param {IdReference} parentReference
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const childRef: number = 2;
	     *    const parentReferenceId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await inventoryService.childAssetsRemove(childRef, parentReferenceId);
	     *    })();
	     * ```
	     */
	    childAssetsRemove(childReference, parentReference) {
	        return __awaiter$7(this, void 0, void 0, function* () {
	            return this.removeChild(exports.ChildType.ASSETS, childReference, parentReference);
	        });
	    }
	    /**
	     * Gets a list of child devices from a given managed object (parent)
	     *
	     * @returns Response wrapped in [[IResultList]]
	     *
	     * @param {IdReference} parentReference
	     * @param {object} filter
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const parentReferenceId: IdReference = 1;
	     *
	     *    const filter: object = {
	     *      pageSize: 100,
	     *      withTotalPages: true
	     *    };
	     *
	     *    (async () => {
	     *      const {data, res, paging} = await inventoryService.childDevicesList(parentReferenceId, filter);
	     *    })();
	     * ```
	     */
	    childDevicesList(parentReference, filter = {}) {
	        return __awaiter$7(this, void 0, void 0, function* () {
	            return this.listChildren(exports.ChildType.DEVICES, parentReference, filter);
	        });
	    }
	    /**
	     * Creates a new managed object as child device to another managed object (parent)
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {Partial<IManagedObject>} managedObject
	     * @param {IdReference} parentReference
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const mOAsChildDevice: Partial<IManagedObject> = {
	     *      name: 'Child device MO',
	     *      type: 'new type',
	     *      ...
	     *    };
	     *
	     *    // This is the identifier of the managed object which should be the parent of
	     *    // mOAsChildDevice, see above.
	     *    const parentReferenceId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await inventoryService.childDevicesCreate(mOAsChildDevice, parentReferenceId);
	     *    })();
	     * ```
	     */
	    childDevicesCreate(managedObject, parentReference) {
	        return __awaiter$7(this, void 0, void 0, function* () {
	            return this.createChild(exports.ChildType.DEVICES, managedObject, parentReference);
	        });
	    }
	    /**
	     * Adds an existing managed object as child device to another managed object (parent)
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {IdReference} childReference
	     * @param {IdReference} parentReference
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const childRef: number = 2;
	     *    const parentReferenceId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await inventoryService.childDevicesAdd(childRef, parentReferenceId);
	     *    })();
	     * ```
	     */
	    childDevicesAdd(childReference, parentReference) {
	        return __awaiter$7(this, void 0, void 0, function* () {
	            return this.addChild(exports.ChildType.DEVICES, childReference, parentReference);
	        });
	    }
	    /**
	     * Removes an existing managed object as child device from another managed object (parent)
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {IdReference} childReference
	     * @param {IdReference} parentReference
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const childRef: number = 2;
	     *    const parentReferenceId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await inventoryService.childDevicesRemove(childRef, parentReferenceId);
	     *    })();
	     * ```
	     */
	    childDevicesRemove(childReference, parentReference) {
	        return __awaiter$7(this, void 0, void 0, function* () {
	            return this.removeChild(exports.ChildType.DEVICES, childReference, parentReference);
	        });
	    }
	    onBeforeUpdate(objWithId) {
	        delete objWithId.lastUpdated;
	        return objWithId;
	    }
	    onBeforeCreate(managedObject) {
	        delete managedObject.id;
	        delete managedObject.lastUpdated;
	        return managedObject;
	    }
	    getChildrenUrl(type, parentReference) {
	        return `${this.getDetailUrl(parentReference)}/${type}`;
	    }
	    getChildUrl(type, childReference, parentReference) {
	        const childId = this.getIdString(childReference);
	        return `${this.getChildrenUrl(type, parentReference)}/${childId}`;
	    }
	    listChildren(type, parentReference, filter = {}) {
	        return __awaiter$7(this, void 0, void 0, function* () {
	            const headers = { 'content-type': 'application/json' };
	            const url = this.getChildrenUrl(type, parentReference);
	            const res = yield this.fetch(url, { headers, params: filter });
	            const json = yield res.json();
	            const data = json.references.map(ref => ref.managedObject);
	            const paging = this.getPaging(json, filter);
	            paging.list = pagingFilter => this.listChildren(type, parentReference, pagingFilter);
	            return { res, data, paging };
	        });
	    }
	    createChild(type, managedObject, parentReference) {
	        return __awaiter$7(this, void 0, void 0, function* () {
	            const url = this.getChildrenUrl(type, parentReference);
	            const method = 'POST';
	            const body = JSON.stringify(this.onBeforeCreate(managedObject));
	            const headers = { 'content-type': this.mimeType('managedObject'), accept: 'application/json' };
	            const res = yield this.fetch(url, { method, body, headers });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    addChild(type, childReference, parentReference) {
	        return __awaiter$7(this, void 0, void 0, function* () {
	            const url = this.getChildrenUrl(type, parentReference);
	            const method = 'POST';
	            const childId = this.getIdString(childReference);
	            const body = JSON.stringify({ managedObject: { id: String(childId) } });
	            const headers = {
	                accept: 'application/json',
	                'content-type': this.mimeType('managedObjectReference')
	            };
	            const res = yield this.fetch(url, { method, body, headers });
	            let data = yield res.json();
	            data = data.managedObject;
	            return { res, data };
	        });
	    }
	    addChildBulk(type, childReferenceArray, parentReference) {
	        return __awaiter$7(this, void 0, void 0, function* () {
	            const url = this.getChildrenUrl(type, parentReference);
	            const method = 'POST';
	            const references = childReferenceArray.map(childId => ({
	                managedObject: {
	                    id: this.getIdString(childId)
	                }
	            }));
	            const body = JSON.stringify({
	                references
	            });
	            const headers = {
	                accept: 'application/json',
	                'content-type': this.mimeType('managedObjectReferenceCollection')
	            };
	            const res = yield this.fetch(url, { method, body, headers });
	            const data = (yield res.json()).references;
	            return { res, data: data.map(obj => obj.managedObject) };
	        });
	    }
	    removeChild(type, childReference, parentReference) {
	        return __awaiter$7(this, void 0, void 0, function* () {
	            const childId = this.getIdString(childReference);
	            const url = `${this.getChildrenUrl(type, parentReference)}/${childId}`;
	            const method = 'DELETE';
	            const headers = { accept: 'application/json' };
	            const res = yield this.fetch(url, { method, headers });
	            const data = null;
	            return { res, data };
	        });
	    }
	}

	var __awaiter$8 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	/**
	 * This class allows for managing measurements.
	 */
	class MeasurementService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'measurement';
	        this.listUrl = 'measurements';
	        this.propertyName = 'measurements';
	        this.channel = '/measurements/*';
	    }
	    /**
	     * Gets the details of selected measurement.
	     *
	     * @param {string|number|IIdentified} entityOrId Entity or Id of the entity.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const measurementId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await measurementService.detail(measurementId);
	     *   })();
	     * ```
	     */
	    detail(entityOrId) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$8(this, void 0, void 0, function* () {
	            return _super.detail.call(this, entityOrId);
	        });
	    }
	    /**
	     * Creates a new measurement.
	     *
	     * @param {Partial<IMeasurementCreate>} entity At least sourceId is mandantory.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const mandantoryObject: Partial<IMeasurementCreate> = {
	     *    sourceId: device.id,
	     *    fragment: { series: { unit: '%', value: 51 } },
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await measurementService.create(mandantoryObject);
	     *  })();
	     * ```
	     */
	    create(entity) {
	        const _super = Object.create(null, {
	            create: { get: () => super.create }
	        });
	        return __awaiter$8(this, void 0, void 0, function* () {
	            return _super.create.call(this, this.onBeforeCreate(entity));
	        });
	    }
	    /**
	     * Gets the list of measurements filtered by parameters.
	     *
	     * @returns Response wrapped in [[IResultList]]
	     *
	     * @param {object} filter Object containing filters for querying measurements.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await measurementService.list(filter);
	     *   })();
	     * ```
	     */
	    list(filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$8(this, void 0, void 0, function* () {
	            return _super.list.call(this, filter);
	        });
	    }
	    /**
	     * Removes a measurement with given id.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {string | number | IIdentified} entityOrId
	     *
	     * **Example**
	     * ```typescript
	     *
	     *   const id: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await measurementService.delete(id);
	     *   })();
	     * ```
	     */
	    delete(entityOrId) {
	        const _super = Object.create(null, {
	            delete: { get: () => super.delete }
	        });
	        return __awaiter$8(this, void 0, void 0, function* () {
	            return _super.delete.call(this, entityOrId);
	        });
	    }
	    /**
	     * Gets the list of series in a measurement filtered by parameters.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {object} filter Object containing filters for querying measurements.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *    dateFrom: '2018-02-06T10:43:55.077Z',
	     *    dateTo: '2018-02-06T10:50:55.077Z',
	     *    source: device.id
	     *  };
	     *
	     *   (async () => {
	     *     const {data, res} = await measurementService.listSeries(filter);
	     *   })();
	     * ```
	     */
	    listSeries(params) {
	        return __awaiter$8(this, void 0, void 0, function* () {
	            const url = `${this.baseUrl}/${this.listUrl}/series`;
	            const res = yield this.client.fetch(url, { params });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    onBeforeCreate(entity) {
	        if (!entity.time) {
	            entity.time = new Date();
	        }
	        if (!entity.type) {
	            entity.type = 'c8y_Measurement';
	        }
	        if (entity.sourceId) {
	            const { sourceId } = entity;
	            delete entity.sourceId;
	            if (!entity.source) {
	                entity.source = {
	                    id: String(sourceId),
	                };
	            }
	        }
	        return entity;
	    }
	}

	(function (aggregationType) {
	    aggregationType["MINUTELY"] = "MINUTELY";
	    aggregationType["HOURLY"] = "HOURLY";
	    aggregationType["DAILY"] = "DAILY";
	})(exports.aggregationType || (exports.aggregationType = {}));

	var __awaiter$9 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	/**
	 * This class allows for managing alarms.
	 */
	class AlarmService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'alarm';
	        this.listUrl = 'alarms';
	        this.propertyName = 'alarms';
	        this.channel = '/alarms/*';
	    }
	    /**
	     * Gets the details of selected alarms.
	     *
	     * @param {string|number|IIdentified} entityOrId Entity or Id of the entity.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const alarmId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await alarmService.detail(alarmId);
	     *    })();
	     * ```
	     */
	    detail(entityOrId) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$9(this, void 0, void 0, function* () {
	            return _super.detail.call(this, entityOrId);
	        });
	    }
	    /**
	     * Creates a new alarm.
	     *
	     * @param {IAlarm} entity Alarm object with mandantory fragments.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const mandantoryObject: IAlarm = {
	     *    severity: Severity.CRITICAL,
	     *    source: device,
	     *    text: 'I am an Alarm!',
	     *    time: '2018-05-02T10:08:00Z',
	     *    type: 'device-type-here',
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await alarmService.create(mandantoryObject);
	     *  })();
	     * ```
	     */
	    create(entity) {
	        const _super = Object.create(null, {
	            create: { get: () => super.create }
	        });
	        return __awaiter$9(this, void 0, void 0, function* () {
	            return _super.create.call(this, entity);
	        });
	    }
	    /**
	     * Updates alarm data.
	     *
	     * @param {Partial<IAlarm>} entity Alarm is partially updatable.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const partialUpdateObject: Partial<IAlarm> = {
	     *    severity: Severity.MINOR,
	     *    source: device,
	     *    text: 'Changed Alarm!'
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await alarmService.update(partialUpdateObject);
	     *  })();
	     * ```
	     */
	    update(entity) {
	        const _super = Object.create(null, {
	            update: { get: () => super.update }
	        });
	        return __awaiter$9(this, void 0, void 0, function* () {
	            return _super.update.call(this, entity);
	        });
	    }
	    /**
	     * Gets the list of alarms filtered by parameters.
	     *
	     * @returns Response wrapped in [[IResultList]]
	     *
	     * @param {object} filter Object containing filters for querying alarms.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     severity: Severity.MAJOR,
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await alarmService.list(filter);
	     *   })();
	     * ```
	     */
	    list(filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$9(this, void 0, void 0, function* () {
	            return _super.list.call(this, filter);
	        });
	    }
	}

	(function (AlarmStatus) {
	    AlarmStatus[AlarmStatus["ACKNOWLEDGED"] = gettext('ACKNOWLEDGED')] = "ACKNOWLEDGED";
	    AlarmStatus[AlarmStatus["CLEARED"] = gettext('CLEARED')] = "CLEARED";
	    AlarmStatus[AlarmStatus["ACTIVE"] = gettext('ACTIVE')] = "ACTIVE";
	})(exports.AlarmStatus || (exports.AlarmStatus = {}));

	var __awaiter$10 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	/**
	 * This class allows for managing operations on a device.
	 */
	class OperationService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'devicecontrol';
	        this.listUrl = 'operations';
	        this.propertyName = 'operations';
	    }
	    /**
	     * Gets the details of selected operation.
	     *
	     * @param {string|number|IIdentified} entityOrId Entity or Id of the entitytabs.service.ts.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const operationId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await operationService.detail(operationId);
	     *   })();
	     * ```
	     */
	    detail(entityOrId) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$10(this, void 0, void 0, function* () {
	            return _super.detail.call(this, entityOrId);
	        });
	    }
	    /**
	     * Creates a new operation.
	     *
	     * @param {IOperation} entity Operation object with mandantory fragments.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const mandantoryObject: IOperation = {
	     *    com_cumulocity_model_WebCamDevice: {
	     *      name: 'take picture',
	     *      parameters: {
	     *         duration: '5s',
	     *         quality: 'HD'
	     *      }
	     *    },
	     *    deviceId: device.id,
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await operationService.create(mandantoryObject);
	     *  })();
	     * ```
	     */
	    create(entity) {
	        const _super = Object.create(null, {
	            create: { get: () => super.create }
	        });
	        return __awaiter$10(this, void 0, void 0, function* () {
	            return _super.create.call(this, entity);
	        });
	    }
	    /**
	     * Updates operation data.
	     *
	     * @param {Partial<IOperation>} entity Operation is partially updatable.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const partialUpdateObject: Partial<IOperation> = {
	     *    com_cumulocity_model_WebCamDevice: {
	     *      name: 'take picture',
	     *      parameters: {
	     *         duration: '2s',
	     *         quality: 'HD',
	     *         ratio: '16:9'
	     *      }
	     *    },
	     *    deviceId: device.id,
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await operationService.update(partialUpdateObject);
	     *  })();
	     * ```
	     */
	    update(entity) {
	        const _super = Object.create(null, {
	            update: { get: () => super.update }
	        });
	        return __awaiter$10(this, void 0, void 0, function* () {
	            return _super.update.call(this, entity);
	        });
	    }
	    /**
	     * Gets the list of operations filtered by parameters.
	     *
	     * @returns Response wrapped in [[IResultList]]
	     *
	     * @param {object} filter Object containing filters for querying operations.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await operationService.list(filter);
	     *   })();
	     * ```
	     */
	    list(filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$10(this, void 0, void 0, function* () {
	            return _super.list.call(this, filter);
	        });
	    }
	}

	var __awaiter$11 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	/**
	 * This class allows for managing bulk operations.
	 */
	class OperationBulkService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'devicecontrol';
	        this.listUrl = 'bulkoperations';
	        this.propertyName = 'bulkOperations';
	    }
	    /**
	     * Gets the details of selected bulk operation.
	     *
	     * @param {string|number|IIdentified} entityOrId Entity or Id of the entity.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const bulkOperationId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await operationBulkService.detail(bulkOperationId);
	     *   })();
	     * ```
	     */
	    detail(operationOrId) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$11(this, void 0, void 0, function* () {
	            return _super.detail.call(this, operationOrId);
	        });
	    }
	    /**
	     * Creates a new operation.
	     *
	     * @param {Partial<IOperationBulk>} operation Operation object with mandantory fragments.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const mandantoryObject: Partial<IOperationBulk> = {
	     *    creationRamp: 15,
	     *    groupId: '149044',
	     *    operationPrototype: {
	     *      c8y_Restart: {},
	     *      description: 'Restart device',
	     *      deviceId: device.id,
	     *      status: 'PENDING'
	     *    },
	     *     startDate: '2018-02-15T16:01:00.000Z'
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await operationBulkService.create(mandantoryObject);
	     *  })();
	     * ```
	     */
	    create(operation) {
	        const _super = Object.create(null, {
	            create: { get: () => super.create }
	        });
	        return __awaiter$11(this, void 0, void 0, function* () {
	            return _super.create.call(this, operation);
	        });
	    }
	    /**
	     * Updates a new operation.
	     *
	     * @param {Partial<IOperationBulk>} operation Operation object.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const updateObject: Partial<IOperationBulk> = {
	     *    creationRamp: 15,
	     *    groupId: '149044',
	     *    operationPrototype: {
	     *      c8y_Restart: {},
	     *      description: 'Restart device',
	     *      deviceId: device.id,
	     *      status: 'PENDING'
	     *    },
	     *     startDate: '2018-02-15T16:01:00.000Z'
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await operationBulkService.update(updateObject);
	     *  })();
	     * ```
	     */
	    update(entity) {
	        const _super = Object.create(null, {
	            update: { get: () => super.update }
	        });
	        return __awaiter$11(this, void 0, void 0, function* () {
	            return _super.update.call(this, entity);
	        });
	    }
	    /**
	     * Gets the list of bulk operations filtered by parameters.
	     *
	     * @returns Response wrapped in [[IResultList]]
	     *
	     * @param {object} filter Object containing filters for querying alarms.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await operationBulkService.list(filter);
	     *   })();
	     * ```
	     */
	    list(filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$11(this, void 0, void 0, function* () {
	            return _super.list.call(this, filter);
	        });
	    }
	    /**
	     * Removes an bulk operation with given id.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {string | number | IIdentified):} operationOrId Operation object or id.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *   const id: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await operationBulkService.delete(id);
	     *   })();
	     * ```
	     */
	    delete(operationOrId) {
	        const _super = Object.create(null, {
	            delete: { get: () => super.delete }
	        });
	        return __awaiter$11(this, void 0, void 0, function* () {
	            return _super.delete.call(this, operationOrId);
	        });
	    }
	}

	(function (OperationBulkStatus) {
	    OperationBulkStatus[OperationBulkStatus["ACTIVE"] = gettext('ACTIVE')] = "ACTIVE";
	    OperationBulkStatus[OperationBulkStatus["IN_PROGRESS"] = gettext('IN_PROGRESS')] = "IN_PROGRESS";
	    OperationBulkStatus[OperationBulkStatus["COMPLETED"] = gettext('COMPLETED')] = "COMPLETED";
	    OperationBulkStatus[OperationBulkStatus["DELETED"] = gettext('DELETED')] = "DELETED";
	})(exports.OperationBulkStatus || (exports.OperationBulkStatus = {}));

	(function (OperationBulkGeneralStatus) {
	    OperationBulkGeneralStatus[OperationBulkGeneralStatus["SCHEDULED"] = gettext('SCHEDULED')] = "SCHEDULED";
	    OperationBulkGeneralStatus[OperationBulkGeneralStatus["EXECUTING"] = gettext('EXECUTING')] = "EXECUTING";
	    OperationBulkGeneralStatus[OperationBulkGeneralStatus["EXECUTING_WITH_ERROR"] = gettext('EXECUTING_WITH_ERROR')] = "EXECUTING_WITH_ERROR";
	    OperationBulkGeneralStatus[OperationBulkGeneralStatus["CANCELED"] = gettext('CANCELED')] = "CANCELED";
	    OperationBulkGeneralStatus[OperationBulkGeneralStatus["FAILED"] = gettext('FAILED')] = "FAILED";
	    OperationBulkGeneralStatus[OperationBulkGeneralStatus["SUCCESSFUL"] = gettext('SUCCESSFUL')] = "SUCCESSFUL";
	    OperationBulkGeneralStatus[OperationBulkGeneralStatus["DELETED"] = gettext('DELETED')] = "DELETED";
	    OperationBulkGeneralStatus[OperationBulkGeneralStatus["INCORRECT"] = gettext('INCORRECT')] = "INCORRECT";
	})(exports.OperationBulkGeneralStatus || (exports.OperationBulkGeneralStatus = {}));

	(function (OperationStatus) {
	    OperationStatus[OperationStatus["PENDING"] = gettext('PENDING')] = "PENDING";
	    OperationStatus[OperationStatus["EXECUTING"] = gettext('EXECUTING')] = "EXECUTING";
	    OperationStatus[OperationStatus["SUCCESSFUL"] = gettext('SUCCESSFUL')] = "SUCCESSFUL";
	    OperationStatus[OperationStatus["FAILED"] = gettext('FAILED')] = "FAILED";
	})(exports.OperationStatus || (exports.OperationStatus = {}));

	var __awaiter$12 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	/**
	 * @description
	 * This service allows for managing tenants.
	 */
	class TenantService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'tenant';
	        this.listUrl = 'tenants';
	        this.currentTenantUrl = 'currentTenant';
	        this.propertyName = 'tenants';
	        this.fetchOptions = {
	            method: 'PUT',
	            body: '{}',
	            headers: { 'content-type': 'application/json', accept: 'application/json' }
	        };
	    }
	    /**
	     * Get a representation of a tenant.
	     *
	     * @param {string|number|IIdentified} entityOrId Tenant's id or tenant object.
	     *
	     * @returns Returns promise object that is resolved with the IIdentified wrapped by IResult.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const tenantId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await tenantService.detail(tenantId);
	     *   })();
	     * ```
	     *
	     * Required role: ROLE_TENANT_MANAGEMENT_READ<br><br>
	     * User password is never returned in GET response. Authentication mechanism is provided by another interface.
	     */
	    detail(entityOrId) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$12(this, void 0, void 0, function* () {
	            return _super.detail.call(this, entityOrId);
	        });
	    }
	    /**
	     * Creates a new tenant.
	     *
	     * @param {IIdentified} entity Tenant object.
	     *
	     * @returns {IResult<IIdentified>} Returns promise object that is resolved with the details of newly created tenant.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const tenantObject = {
	     *    id: "sample_tenant",
	     *    company: "sample_company",
	     *    domain: "sample_domain.com",
	     *    contactName: "Mr. Doe",
	     *    ...
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await tenantService.create(tenantObject);
	     *  })();
	     * ```
	     *
	     * Required role: ROLE_TENANT_MANAGEMENT_ADMIN or ROLE_TENANT_MANAGEMENT_CREATE<br><br>
	     * Note that creating a tenant with adminName, adminPass and adminEmail, creates an admin user with these settings.
	     * For the tenant id SQL keywords (e.g., select, cross, where) are not allowed.
	     */
	    create(entity) {
	        const _super = Object.create(null, {
	            create: { get: () => super.create }
	        });
	        return __awaiter$12(this, void 0, void 0, function* () {
	            return _super.create.call(this, entity);
	        });
	    }
	    /**
	     * Updates tenant data.
	     *
	     * @param {IIdentified} entity Tenant is partially updatable.
	     *
	     * @returns {IResult<IIdentified>} Returns promise object that is resolved with the saved tenant object.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const partialUpdateObject: IIdentified = {
	     *     adminName : "newAdmin"
	     *     ...
	     *   }
	     *
	     *  (async () => {
	     *    const {data, res} = await tenantService.update(partialUpdateObject);
	     *  })();
	     * ```
	     *
	     * Required role: ROLE_TENANT_MANAGEMENT_ADMIN or ROLE_TENANT_MANAGEMENT_UPDATE<br><br>
	     * Note that updating adminPass and adminEmail updates these settings in the admin user of the tenant.
	     * Updating adminName has no effect.
	     */
	    update(entity) {
	        const _super = Object.create(null, {
	            update: { get: () => super.update }
	        });
	        return __awaiter$12(this, void 0, void 0, function* () {
	            return _super.update.call(this, entity);
	        });
	    }
	    /**
	     * Gets the list of tenants filtered by parameters.
	     *
	     * @param {object} filter Object containing filters for querying tenants.
	     *
	     * @returns Returns promise object that is resolved with the IIdentified wrapped by IResultList.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     severity: Severity.MAJOR,
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await tenantService.list(filter);
	     *   })();
	     * ```
	     *
	     * Required role: ROLE_TENANT_MANAGEMENT_READ
	     */
	    list(filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$12(this, void 0, void 0, function* () {
	            return _super.list.call(this, filter);
	        });
	    }
	    /**
	     * Delete a representation of a tenant.
	     *
	     * @param {string|number|IIdentified} entityOrId Tenant's id or tenant object.
	     *
	     * @returns Returns promise object that is resolved with the IResult.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const tenantId: string = "uniqueTenantId";
	     *
	     *    (async () => {
	     *      const {data, res} = await tenantService.delete(tenantId);
	     *   })();
	     * ```
	     *
	     * Required role: ROLE_TENANT_MANAGEMENT_ADMIN
	     */
	    delete(entityOrId) {
	        const _super = Object.create(null, {
	            delete: { get: () => super.delete }
	        });
	        return __awaiter$12(this, void 0, void 0, function* () {
	            return _super.delete.call(this, entityOrId);
	        });
	    }
	    current() {
	        return __awaiter$12(this, void 0, void 0, function* () {
	            const headers = { 'content-type': 'application/json' };
	            const res = yield this.fetch(this.currentTenantUrl, { headers });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    /**
	     * enable support user for current tenant.
	     *
	     * @returns Returns promise object that is resolved with the IResult.
	     *
	     * **Example**
	     * ```typescript
	     *    (async () => {
	     *      const {res} = await tenantService.enableSupportUser();
	     *   })();
	     * ```
	     */
	    enableSupportUser() {
	        return __awaiter$12(this, void 0, void 0, function* () {
	            const url = 'support-user/enable';
	            const res = yield this.fetch(url, this.fetchOptions);
	            return { res, data: null };
	        });
	    }
	    /**
	     * disable support user for current tenant.
	     *
	     * @returns Returns promise object that is resolved with the IResult.
	     *
	     * **Example**
	     * ```typescript
	     *    (async () => {
	     *      const {res} = await tenantService.disableSupportUser();
	     *   })();
	     * ```
	     */
	    disableSupportUser() {
	        return __awaiter$12(this, void 0, void 0, function* () {
	            const url = 'support-user/disable';
	            const res = yield this.fetch(url, this.fetchOptions);
	            return { res, data: null };
	        });
	    }
	    currentTenantType() {
	        return __awaiter$12(this, void 0, void 0, function* () {
	            const tenantData = yield this.current();
	            if (tenantData.data.customProperties &&
	                tenantData.data.customProperties.tenantType === 'TRIAL') {
	                return 'TRIAL';
	            }
	            return 'REGULAR';
	        });
	    }
	    /**
	     * Returns two factor-authentication settings for given tenant.
	     *
	     * @param tenant The tenant object.
	     *
	     * @returns Promise which resolves with the object with TFA settings.
	     *
	     * **Example**
	     * ```typescript
	     *   (async () => {
	     *     const currentTenant = (await tenantService.current()).data;
	     *     const currentTenantTfaSettings = await tenantService.getTfaSettings(currentTenant);
	     *
	     *     const subtenant = (await tenantService.detail('t12345')).data;
	     *     const subtenantTfaSettings = await tenantService.getTfaSettings(subtenant);
	     *   })();
	     * ```
	     */
	    getTfaSettings(tenant) {
	        return __awaiter$12(this, void 0, void 0, function* () {
	            const entityOrId = this.getIdString(tenant);
	            const url = `tenants/${entityOrId}/tfa`;
	            const res = yield this.fetch(url);
	            const tfaSettings = yield res.json();
	            return tfaSettings;
	        });
	    }
	    /**
	     * Subscribes a given application to a given tenant.
	     *
	     * @param tenant The tenant object.
	     * @param application The application object.
	     *
	     * @returns Returns promise object that is resolved with the IResult.
	     *
	     * **Example**
	     * ```typescript
	     *     const newApp = {
	     *        name: 'New application',
	     *        type: 'HOSTED',
	     *        key: 'new-app'
	     *     };
	     *
	     *     const application = (await applicationService.create(newApp)).data;
	     *     const currentTenant = (await tenantService.current()).data;
	     *
	     *     const {data, res} = await tenantService.subscribeApplication(currentTenant, application);
	     *   })();
	     * ```
	     */
	    subscribeApplication(tenant, application) {
	        return __awaiter$12(this, void 0, void 0, function* () {
	            const entityOrId = this.getIdString(tenant);
	            const applicationId = application.id;
	            const url = `tenants/${entityOrId}/applications`;
	            const method = 'POST';
	            const body = JSON.stringify({
	                application: {
	                    id: applicationId,
	                    self: application.self
	                }
	            });
	            const headers = { 'content-type': this.mimeType('applicationReference') };
	            const res = yield this.fetch(url, this.changeFetchOptions({ method, body, headers }, url));
	            return { res, data: null };
	        });
	    }
	    /**
	     * Unsubscribes a given application from a given tenant.
	     *
	     * @param tenant The tenant object.
	     * @param application The application object.
	     *
	     * @returns Returns promise object that is resolved with the IResult.
	     *
	     * **Example**
	     * ```typescript
	     *     const newApp = {
	     *        name: 'New application',
	     *        type: 'HOSTED',
	     *        key: 'new-app'
	     *     };
	     *
	     *     const application = (await applicationService.create(newApp)).data;
	     *     const currentTenant = (await tenantService.current()).data;
	     *     await tenantService.addApplication(currentTenant, application);
	     *
	     *     await tenantService.unsubscribeApplication(currentTenant, application);
	     *   })();
	     * ```
	     */
	    unsubscribeApplication(tenant, application) {
	        return __awaiter$12(this, void 0, void 0, function* () {
	            const entityOrId = this.getIdString(tenant);
	            const url = `tenants/${entityOrId}/applications/${application.id}`;
	            const method = 'DELETE';
	            const res = yield this.fetch(url, this.changeFetchOptions({ method }, url));
	            return { res, data: null };
	        });
	    }
	    getIdString(tenant) {
	        return tenant.id || tenant.name;
	    }
	    onBeforeCreate(obj) {
	        return obj;
	    }
	}

	(function (TenantStatus) {
	    TenantStatus[TenantStatus["ACTIVE"] = gettext('ACTIVE')] = "ACTIVE";
	    TenantStatus[TenantStatus["SUSPENDED"] = gettext('SUSPENDED')] = "SUSPENDED";
	})(exports.TenantStatus || (exports.TenantStatus = {}));

	/**
	 * Represents a strategy used for two-factor authentication.
	 */
	(function (TfaStrategy) {
	    /** Two-factor authentication with Time-Based One Time Passwords. */
	    TfaStrategy["TOTP"] = "TOTP";
	    /** Two-factor authentication with codes sent via SMSes. */
	    TfaStrategy["SMS"] = "SMS";
	})(exports.TfaStrategy || (exports.TfaStrategy = {}));

	var __awaiter$13 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	/**
	 * @description
	 * This service allows for managing current user's inventory roles.
	 */
	class UserInventoryRoleService extends Service {
	    constructor(userUrl, client) {
	        super(client);
	        this.listUrl = `inventory`;
	        this.currenUserUrl = `currentUser`;
	        this.propertyName = 'inventoryAssignments';
	        this.baseUrl = `user/${userUrl}/roles`;
	    }
	    /**
	     * Get a representation of a concrete current user's inventory role.
	     *
	     * @param {string|number|IUserInventoryRole} entityOrId inventory role id or inventory role object.
	     *
	     * @returns Returns promise object that is resolved with the IUserInventoryRole wrapped by IResult.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const inventoryRoleId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await userInventoryRoleService.detail(inventoryRoleId);
	     *   })();
	     * ```
	     *
	     * Required role: ROLE_TENANT_MANAGEMENT_READ<br><br>
	     * User password is never returned in GET response. Authentication mechanism is provided by another interface.
	     */
	    detail(entityOrId) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$13(this, void 0, void 0, function* () {
	            return _super.detail.call(this, entityOrId);
	        });
	    }
	    /**
	     * Assign inventory role to current user.
	     *
	     * @param {IUserInventoryRole} entity Inventory Role object.
	     *
	     * @returns Returns promise object that is resolved with the details of newly assigned inventory role.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const inventoryRoleObject: IUserInventoryRole = {
	     *    ...
	     *  };
	     *
	     *    (async () => {
	     *      const {data, res} = await userInventoryRoleService.create(inventoryRoleObject);
	     *   })();
	     * ```
	     */
	    create(entity) {
	        const _super = Object.create(null, {
	            create: { get: () => super.create }
	        });
	        return __awaiter$13(this, void 0, void 0, function* () {
	            return _super.create.call(this, entity);
	        });
	    }
	    /**
	     * Updates an inventory role.
	     *
	     * @param {Partial<IUserInventoryRole>} entity Inventory Role object.
	     */
	    update(entity) {
	        const _super = Object.create(null, {
	            update: { get: () => super.update }
	        });
	        return __awaiter$13(this, void 0, void 0, function* () {
	            return _super.update.call(this, entity);
	        });
	    }
	    /**
	     * Gets the list the inventory roles applied to a current user.
	     *
	     * @param {object} filter Object containing filters for querying inventory roles.
	     *
	     * @returns Returns promise object that is resolved with the IUserInventoryRole wrapped by IResultList.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     severity: Severity.MAJOR,
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await userInventoryRoleService.list(filter);
	     *   })();
	     * ```
	     */
	    list(filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$13(this, void 0, void 0, function* () {
	            return _super.list.call(this, filter);
	        });
	    }
	    /**
	     * Unassign inventory role from current user
	     *
	     * @param {string|number|IIdentified} entityOrId Inventory Role id or Inventory Role object.
	     *
	     * @returns Returns promise object that is resolved with the IResult.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const inventoryRoleId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await userInventoryRoleService.delete(inventoryRoleId);
	     *   })();
	     * ```
	     */
	    delete(entityOrId) {
	        const _super = Object.create(null, {
	            delete: { get: () => super.delete }
	        });
	        return __awaiter$13(this, void 0, void 0, function* () {
	            return _super.delete.call(this, entityOrId);
	        });
	    }
	}

	var __awaiter$14 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	/**
	 * @description
	 * This service allows for managing users.
	 */
	class UserService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'user';
	        this.currentUserUrl = 'currentUser';
	        this.passwordResetUrl = 'passwordReset';
	        this.currentUserPhoneUrl = 'currentUserPhone';
	        this.verifyTFACodeUrl = 'pin';
	        this.totpCurrentUserURL = `${this.currentUserUrl}/totpSecret`;
	        this.verifyTOTPCodeUrl = `${this.totpCurrentUserURL}/verify`;
	        this.activateTOTPCodeUrl = `${this.totpCurrentUserURL}/activity`;
	        this.revokeTOTPSecretUrl = 'totpSecret/revoke';
	        this.propertyName = 'users';
	    }
	    get listUrl() {
	        return `${this.client.tenant}/users`;
	    }
	    /**
	     * Gets the details of given user.
	     *
	     * @param {string | number | IUser} entityOrId User's id or user object.
	     *
	     * @returns Returns promise object that is resolved with the IUser wrapped by IResult.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const userId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await userService.detail(userId);
	     *   })();
	     * ```
	     * User password is never returned in GET response. Authentication mechanism is provided by another interface.
	     */
	    detail(entityOrId) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$14(this, void 0, void 0, function* () {
	            return _super.detail.call(this, entityOrId);
	        });
	    }
	    /**
	     * Creates a new user.
	     *
	     * @param {IUser} entity User object.
	     *
	     * @returns {IResult<IUser>} Returns promise object that is resolved with the details of newly created user.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const userObject: IUser = {
	     *    userName: "newUser",
	     *    password: "userPassword12!@"
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await userService.create(userObject);
	     *  })();
	     * ```
	     */
	    create(entity) {
	        const _super = Object.create(null, {
	            create: { get: () => super.create }
	        });
	        return __awaiter$14(this, void 0, void 0, function* () {
	            return _super.create.call(this, entity);
	        });
	    }
	    /**
	     * Updates user data.
	     *
	     * @param {Partial<IUser>} entity User is partially updatable.
	     *
	     * @returns {IResult<IUserGroup>} Returns promise object that is resolved with the saved user object.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const partialUpdateObject: Partial<IUser> = {
	     *     "id" : "myuser",
	     *     "userName" : "newUserName",
	     *     "email": "newUserEmail@example.com"
	     *     ...
	     *   }
	     *
	     *  (async () => {
	     *    const {data, res} = await userService.update(partialUpdateObject);
	     *  })();
	     * ```
	     * When user is updated with changed permissions or groups, suitable audit record is created with type
	     * 'User' and activity 'User updated'.
	     */
	    update(entity) {
	        const _super = Object.create(null, {
	            update: { get: () => super.update }
	        });
	        return __awaiter$14(this, void 0, void 0, function* () {
	            return _super.update.call(this, entity);
	        });
	    }
	    /**
	     * Gets the list of users filtered by parameters.
	     *
	     * @param {object} filter Object containing filters for querying users.
	     *
	     * @returns Returns promise object that is resolved with the IUser wrapped by IResultList.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await userService.list(filter);
	     *   })();
	     * ```
	     */
	    list(filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$14(this, void 0, void 0, function* () {
	            return _super.list.call(this, filter);
	        });
	    }
	    /**
	     * Removes user.
	     *
	     * @param {number|IIdentified} entityOrId User's id or user object.
	     *
	     * @returns Returns promise object that is resolved with the IResult of null.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const userId: string = "uniqueUserId";
	     *
	     *    (async () => {
	     *      const {data, res} = await userService.delete(userGroupId);
	     *   })();
	     * ```
	     */
	    delete(entityOrId) {
	        const _super = Object.create(null, {
	            delete: { get: () => super.delete }
	        });
	        return __awaiter$14(this, void 0, void 0, function* () {
	            return _super.delete.call(this, entityOrId);
	        });
	    }
	    /**
	     * Create instance of User Inventory Role Service related with given User.
	     *
	     * @param {string|number|IUser} entityOrId User's id or user object.
	     *
	     * @returns Returns UserInventoryRoleService object that is related with given User.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const userId: string = "uniqueUserId";
	     *
	     *    const userInventoryRoleService = userService.inventoryAssignment(userGroupId);
	     *    (async () => {
	     *      const {data, res} = await userInventoryRoleService.create(...);
	     *   })();
	     * ```
	     */
	    inventoryAssignment(entityOrId) {
	        return new UserInventoryRoleService(this.getDetailUrl(entityOrId), this.client);
	    }
	    /**
	     * Gets user that is currently logged in.
	     *
	     * @returns Returns promise object that is resolved with the IUser wrapped by IResult.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    (async () => {
	     *      const {data, res} = await userService.current();
	     *   })();
	     * ```
	     */
	    current() {
	        return __awaiter$14(this, void 0, void 0, function* () {
	            const headers = {
	                'content-type': 'application/json',
	                Accept: 'application/vnd.com.nsn.cumulocity.user+json;'
	            };
	            const res = yield this.fetch(this.currentUserUrl, { headers });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    /**
	     * Gets user that is currently logged in with the list of all roles assigned.
	     *
	     * @returns Returns promise object that is resolved with the ICurrenUser wrapped by IResult.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    (async () => {
	     *      const {data, res} = await userService.currentWithEffectiveRoles();
	     *   })();
	     * ```
	     */
	    currentWithEffectiveRoles() {
	        return __awaiter$14(this, void 0, void 0, function* () {
	            const headers = {
	                'content-type': 'application/json',
	                Accept: 'application/vnd.com.nsn.cumulocity.currentUser+json;'
	            };
	            const res = yield this.fetch(this.currentUserUrl, { headers });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    /**
	     * Updates the current user
	     *
	     * @param {IUser} user The user object with the properties to be updated
	     *
	     * @return Returns promise object resolved with the IUser wrapped by IResult
	     */
	    updateCurrent(user) {
	        return __awaiter$14(this, void 0, void 0, function* () {
	            const mimeType = 'application/vnd.com.nsn.cumulocity.user+json';
	            const headers = { 'content-type': mimeType, Accept: mimeType };
	            const body = JSON.stringify(this.onBeforeUpdate(user));
	            const res = yield this.fetch(this.currentUserUrl, { headers, body, method: 'PUT' });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    /**
	     * Sends an email message with a link allowing user to reset their password.
	     *
	     * @param {string} email The email address to send the message to.
	     * @param {string} tenantId The id of user's tenant (if cannot be inferred from URL).
	     *
	     * @returns Returns a request result object.
	     *
	     * **Example**
	     * ```typescript
	     *   const email = 'user@example.com';
	     *   const tenantId = 't123456';
	     *
	     *   (async () => {
	     *     const { res, data } = await userService.sendPasswordResetMail(email, tenantId);
	     *   })();
	     * ```
	     */
	    sendPasswordResetMail(email, tenantId) {
	        return __awaiter$14(this, void 0, void 0, function* () {
	            const headers = { 'content-type': 'application/json', accept: 'application/json' };
	            const method = 'POST';
	            const url = this.passwordResetUrl;
	            const params = tenantId ? { tenantId } : {};
	            const body = JSON.stringify({ email });
	            const res = yield this.fetch(url, { headers, method, params, body });
	            return { res, data: null };
	        });
	    }
	    /**
	     * Resets user's password to a new one.
	     *
	     * @param {IResetPassword} newPassword Object with token, user's email, new password and its strength indicator.
	     * @param {string} tenantId The id of user's tenant (if cannot be inferred from URL).
	     *
	     * @returns Returns a request result object.
	     *
	     * **Example**
	     * ```typescript
	     *   const newPassword: IResetPassword = {
	     *     token: '123123ASDAWERER@#!WEDS$@#!WADA#A#EA#EA#EA',
	     *     email: 'user@example.com',
	     *     newPassword: 'myNewPassword',
	     *     passwordStrength: PasswordStrength.GREEN
	     *   };
	     *   const tenantId = 't123456';
	     *
	     *   (async () => {
	     *     const { res, data } = await userService.resetPassword(newPassword, tenantId);
	     *   })();
	     * ```
	     */
	    resetPassword(newPassword, tenantId) {
	        return __awaiter$14(this, void 0, void 0, function* () {
	            const headers = { 'content-type': 'application/json', accept: 'application/json' };
	            const method = 'PUT';
	            const url = this.passwordResetUrl;
	            const params = tenantId ? { tenantId } : {};
	            const body = JSON.stringify(newPassword);
	            const res = yield this.fetch(url, { headers, method, params, body });
	            return { res, data: null };
	        });
	    }
	    /**
	     * Verifies TFA code which is sent via SMS. If invoked with string '0', new TFA code will be sent.
	     *
	     * @param {string} pin The code to verify.
	     *
	     * @returns Returns a status object.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    (async () => {
	     *      const {data, res} = await userService.verifyTFACode('123123');
	     *   })();
	     * ```
	     */
	    verifyTFACode(pin) {
	        return __awaiter$14(this, void 0, void 0, function* () {
	            const method = 'POST';
	            const body = JSON.stringify({ pin });
	            const headers = { 'content-type': 'application/json', accept: 'application/json' };
	            const res = yield this.fetch(this.verifyTFACodeUrl, { headers, body, method });
	            return { res, data: null };
	        });
	    }
	    /**
	     * Verifies TFA code which is generated by a TOTP app.
	     *
	     * @param {string} code The code to verify.
	     *
	     * @returns Returns a status object.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    (async () => {
	     *      const {data, res} = await userService.verifyTotpCode('123123');
	     *   })();
	     * ```
	     */
	    verifyTotpCode(code) {
	        return __awaiter$14(this, void 0, void 0, function* () {
	            const method = 'POST';
	            const headers = { 'content-type': 'application/json' };
	            const body = JSON.stringify({ code });
	            const res = yield this.fetch(this.verifyTOTPCodeUrl, { headers, body, method });
	            return { res, data: null };
	        });
	    }
	    /**
	     * Verifies TFA code which is generated by a TOTP app.
	     *
	     * @returns Returns a status object.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    (async () => {
	     *      const {data, res} = await userService.activateTotp();
	     *   })();
	     * ```
	     */
	    activateTotp() {
	        return __awaiter$14(this, void 0, void 0, function* () {
	            const method = 'POST';
	            const headers = { 'content-type': 'application/json' };
	            const body = JSON.stringify({ isActive: true });
	            const res = yield this.fetch(this.activateTOTPCodeUrl, { headers, body, method });
	            return { res, data: null };
	        });
	    }
	    /**
	     * Checks if TOTP is activated and enforced.
	     *
	     * @returns Returns an object of ITotpStatus if it is active.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    (async () => {
	     *      const {data, res} = await userService.getActivityTotp();
	     *      console.log(data.isActive);
	     *   })();
	     * ```
	     */
	    getActivityTotp() {
	        return __awaiter$14(this, void 0, void 0, function* () {
	            const method = 'GET';
	            const headers = { 'content-type': 'application/json' };
	            const res = yield this.fetch(this.activateTOTPCodeUrl, { headers, method });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    /**
	     * Generates a secret which can be used to setup two-factor authentication with TOTP.
	     *
	     * @returns Returns the secret and an URL to a QR Code.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    (async () => {
	     *      const {data, res} = await userService.generateTotpSecret();
	     *      console.log(secret);
	     *   })();
	     * ```
	     */
	    generateTotpSecret() {
	        return __awaiter$14(this, void 0, void 0, function* () {
	            const method = 'POST';
	            const headers = { 'content-type': 'application/json', accept: 'application/json' };
	            const res = yield this.fetch(this.totpCurrentUserURL, { headers, method });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    /**
	     * Revokes a specific user's TOTP secret.
	     *
	     * @param {IUser} user User whose TOTP secret to revoke.
	     *
	     * @returns Status object
	     */
	    totpRevokeSecret(user) {
	        return __awaiter$14(this, void 0, void 0, function* () {
	            const url = `${this.getDetailUrl(user)}/${this.revokeTOTPSecretUrl}`;
	            const method = 'DELETE';
	            const headers = { accept: 'application/json' };
	            const res = yield this.fetch(url, { headers, method });
	            return { res, data: null };
	        });
	    }
	    /**
	     * Saves phone number for the current user.
	     * @param phoneNumber Phone number to save.
	     * @returns Server response and data with updated current user object.
	     */
	    savePhoneNumber(phoneNumber) {
	        return __awaiter$14(this, void 0, void 0, function* () {
	            const url = this.currentUserPhoneUrl;
	            const options = {
	                method: 'PUT',
	                headers: { 'content-type': 'application/json', accept: 'application/json' },
	                body: JSON.stringify({
	                    phone: phoneNumber
	                })
	            };
	            const res = yield this.fetch(url, options);
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    hasRole(user, roleId) {
	        return this.hasRoleInUser(user, roleId) || this.hasRoleInGroups(user, roleId);
	    }
	    hasAllRoles(user, roleIds) {
	        return roleIds.every(roleId => this.hasRole(user, roleId));
	    }
	    hasAnyRole(user, roleIds) {
	        return roleIds.some(roleId => this.hasRole(user, roleId));
	    }
	    onBeforeUpdate(user) {
	        const obj = Object.assign({}, user);
	        delete obj.id;
	        delete obj.userName;
	        return obj;
	    }
	    getDetailUrl(entityOrId) {
	        let id;
	        if (typeof entityOrId === 'object' && entityOrId.id) {
	            id = entityOrId.id;
	        }
	        else if (typeof entityOrId === 'object' && entityOrId.userName) {
	            id = entityOrId.userName;
	        }
	        else {
	            id = entityOrId;
	        }
	        return `${this.listUrl}/${encodeURIComponent(String(id))}`;
	    }
	    hasRoleInUser(user, roleId) {
	        const effectiveRoles = user.effectiveRoles || [];
	        return (this.hasRoleInReferences((user && user.roles && user.roles.references) || [], roleId) ||
	            effectiveRoles.some(({ id }) => roleId === id));
	    }
	    hasRoleInGroups(user, roleId) {
	        const groupReferences = (user && user.groups && user.groups.references) || [];
	        return groupReferences.some(groupRef => this.hasRoleInReferences(groupRef.group.roles.references, roleId));
	    }
	    hasRoleInReferences(references, roleId) {
	        return references.some(ref => ref.role.id === roleId);
	    }
	}

	(function (PasswordStrength) {
	    PasswordStrength["GREEN"] = "GREEN";
	    PasswordStrength["RED"] = "RED";
	    PasswordStrength["YELLOW"] = "YELLOW";
	})(exports.PasswordStrength || (exports.PasswordStrength = {}));

	var __awaiter$15 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	class ApplicationBinaryService extends Service {
	    constructor(client, applicationOrId) {
	        super(client);
	        this.listUrl = 'binaries';
	        this.propertyName = 'attachments';
	        this.baseUrl = `application/applications/${this.getIdString(applicationOrId)}`;
	    }
	    upload(binary, fileName) {
	        return __awaiter$15(this, void 0, void 0, function* () {
	            const url = this.listUrl;
	            const method = 'POST';
	            const body = this.createBinaryRequestBody(binary, fileName);
	            let bodyHeaders;
	            if (typeof body.getHeaders === 'function') {
	                bodyHeaders = body.getHeaders();
	            }
	            const headers = Object.assign({
	                accept: 'application/json'
	            }, bodyHeaders);
	            const res = yield this.fetch(url, { method, body, headers });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    uploadWithProgress(binary, onProgress, fileName) {
	        const url = `/${this.baseUrl}/${this.listUrl}`;
	        const method = 'POST';
	        const body = this.createBinaryRequestBody(binary, fileName);
	        let bodyHeaders;
	        if (typeof body.getHeaders === 'function') {
	            bodyHeaders = body.getHeaders();
	        }
	        const headers = this.client.getFetchOptions().headers;
	        Object.assign(headers, {
	            Accept: 'application/json'
	        });
	        Object.assign(headers, bodyHeaders);
	        return new Promise((res, rej) => {
	            const xhr = new XMLHttpRequest();
	            xhr.open(method, url, true);
	            for (const key in headers) {
	                if (headers.hasOwnProperty(key)) {
	                    xhr.setRequestHeader(key, headers[key]);
	                }
	            }
	            xhr.upload.addEventListener('progress', onProgress);
	            xhr.addEventListener('loadend', () => {
	                xhr.readyState === 4 && (xhr.status === 200 || xhr.status === 201) ?
	                    res(JSON.parse(xhr.responseText)) :
	                    rej('Could not upload file.');
	            });
	            xhr.send(body);
	        });
	    }
	    list() {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$15(this, void 0, void 0, function* () {
	            return _super.list.call(this);
	        });
	    }
	    delete(binaryOrId) {
	        const _super = Object.create(null, {
	            delete: { get: () => super.delete }
	        });
	        return __awaiter$15(this, void 0, void 0, function* () {
	            return _super.delete.call(this, binaryOrId);
	        });
	    }
	    listPlugins() {
	        return __awaiter$15(this, void 0, void 0, function* () {
	            const headers = { accept: 'application/json' };
	            const url = `${this.listUrl}/plugins`;
	            const res = yield this.fetch(url, { headers });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    addPlugin(pluginName, pluginFile) {
	        return __awaiter$15(this, void 0, void 0, function* () {
	            const url = `${this.listUrl}/plugins/${encodeURIComponent(pluginName)}`;
	            const method = 'POST';
	            const body = new browser$1();
	            const bufferOrStream = pluginFile instanceof ArrayBuffer ? Buffer.from(pluginFile) : pluginFile;
	            body.append('file', bufferOrStream);
	            let bodyHeaders;
	            if (typeof body.getHeaders === 'function') {
	                bodyHeaders = body.getHeaders();
	            }
	            const headers = Object.assign({
	                accept: 'application/json'
	            }, bodyHeaders);
	            const res = yield this.fetch(url, { method, body, headers });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    removePlugin(pluginName) {
	        return __awaiter$15(this, void 0, void 0, function* () {
	            const method = 'DELETE';
	            const headers = { accept: 'application/json' };
	            const url = `${this.listUrl}/plugins/${pluginName}`;
	            const res = yield this.fetch(url, { method, headers });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    updateFiles(files) {
	        return __awaiter$15(this, void 0, void 0, function* () {
	            const url = `${this.listUrl}/files`;
	            const method = 'POST';
	            const body = new browser$1();
	            files.forEach(file => {
	                const bufferOrStream = file.contents instanceof ArrayBuffer ? Buffer.from(file.contents) : file.contents;
	                body.append(file.path, bufferOrStream);
	            });
	            let bodyHeaders;
	            if (typeof body.getHeaders === 'function') {
	                bodyHeaders = body.getHeaders();
	            }
	            const headers = Object.assign({
	                accept: 'application/json'
	            }, bodyHeaders);
	            const res = yield this.fetch(url, { method, body, headers });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    createBinaryRequestBody(binary, fileName) {
	        const body = new browser$1();
	        const bufferOrStream = binary instanceof ArrayBuffer ? Buffer.from(binary) : binary;
	        let uploadFileName = fileName;
	        if (typeof File !== 'undefined' && binary instanceof File) {
	            uploadFileName = binary.name;
	        }
	        body.append('file', bufferOrStream, uploadFileName);
	        body.append('fileName', uploadFileName);
	        return body;
	    }
	}

	(function (ApplicationType) {
	    ApplicationType["EXTERNAL"] = "EXTERNAL";
	    ApplicationType["HOSTED"] = "HOSTED";
	    ApplicationType["MICROSERVICE"] = "MICROSERVICE";
	    ApplicationType["FEATURE"] = "FEATURE";
	    ApplicationType["REPOSITORY"] = "REPOSITORY";
	})(exports.ApplicationType || (exports.ApplicationType = {}));

	var __awaiter$16 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	class ApplicationService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'application';
	        this.listUrl = 'applications';
	        this.propertyName = 'applications';
	        this.channel = '/applications/*';
	    }
	    /**
	     * Creates a new application.
	     *
	     * @param {IIdentified} entity Application object.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const newApp = {
	     *    name: 'New application',
	     *    type: 'EXTERNAL',
	     *    key: 'new-app'
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await applicationService.create(newApp);
	     *  })();
	     * ```
	     */
	    create(entity) {
	        const _super = Object.create(null, {
	            create: { get: () => super.create }
	        });
	        return __awaiter$16(this, void 0, void 0, function* () {
	            return _super.create.call(this, entity);
	        });
	    }
	    clone(entity) {
	        return __awaiter$16(this, void 0, void 0, function* () {
	            const url = `${this.getDetailUrl(entity)}/clone`;
	            const method = 'POST';
	            const body = '';
	            const headers = { 'content-type': 'application/json', accept: 'application/json' };
	            const res = yield this.fetch(url, { method, body, headers });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    /**
	     * Gets the list of existing applications filtered by parameters.
	     *
	     * @returns Response wrapped in [[IResultList]]
	     *
	     * @param {object} filter Object containing filters for querying applications.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await applicationService.list(filter);
	     *   })();
	     * ```
	     */
	    list(filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$16(this, void 0, void 0, function* () {
	            return _super.list.call(this, filter);
	        });
	    }
	    /**
	     * Gets the details of selected application.
	     *
	     * @param {string|number|IIdentified} entityOrId Entity or Id of the entity.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const applicationId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await applicationService.detail(applicationId);
	     *   })();
	     * ```
	     */
	    detail(entityOrId) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$16(this, void 0, void 0, function* () {
	            return _super.detail.call(this, entityOrId);
	        });
	    }
	    /**
	     * Updates existing application.
	     * Make sure that you specifiy the application id within the update object.
	     *
	     * @param {IIdentified} entity Application object.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const updateApp = {
	     *    id: 38
	     *    name: 'Updated application'
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await applicationService.update(updateApp);
	     *  })();
	     * ```
	     */
	    update(entity) {
	        const _super = Object.create(null, {
	            update: { get: () => super.update }
	        });
	        return __awaiter$16(this, void 0, void 0, function* () {
	            return _super.update.call(this, entity);
	        });
	    }
	    /**
	     * Removes an application with given id.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {string | number | IIdentified} entityOrId entity or id of the application.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const removeApp: object = {
	     *     id: 38
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res} = await applicationService.delete(removeApp);
	     *     // data will be null
	     *   })();
	     * ```
	     */
	    delete(entityOrId) {
	        const _super = Object.create(null, {
	            delete: { get: () => super.delete }
	        });
	        return __awaiter$16(this, void 0, void 0, function* () {
	            return _super.delete.call(this, entityOrId);
	        });
	    }
	    listByName(name) {
	        return __awaiter$16(this, void 0, void 0, function* () {
	            const headers = { 'content-type': 'application/json' };
	            const url = `applicationsByName/${encodeURIComponent(name)}`;
	            const res = yield this.fetch(url, { headers });
	            const json = yield res.json();
	            const data = json[this.propertyName];
	            return { res, data };
	        });
	    }
	    listByTenant(tenantOrName, params = {}) {
	        return __awaiter$16(this, void 0, void 0, function* () {
	            const headers = { 'content-type': 'application/json' };
	            const tenantService = new TenantService(this.client);
	            const tenantName = this.getIdString(tenantOrName || (yield tenantService.current()).data.name);
	            const url = `applicationsByTenant/${encodeURIComponent(tenantName)}`;
	            const res = yield this.fetch(url, { headers, params });
	            const json = yield res.json();
	            const data = json[this.propertyName];
	            return { res, data };
	        });
	    }
	    listByOwner(tenantOrName, params = {}) {
	        return __awaiter$16(this, void 0, void 0, function* () {
	            const headers = { 'content-type': 'application/json' };
	            const tenantService = new TenantService(this.client);
	            const tenantName = this.getIdString(tenantOrName || (yield tenantService.current()).data.name);
	            const url = `applicationsByOwner/${encodeURIComponent(tenantName)}`;
	            const res = yield this.fetch(url, { headers, params });
	            const json = yield res.json();
	            const data = json[this.propertyName];
	            return { res, data };
	        });
	    }
	    listByUser(userOrId, params = {}) {
	        return __awaiter$16(this, void 0, void 0, function* () {
	            const headers = { 'content-type': 'application/json' };
	            const userService = new UserService(this.client);
	            const userId = this.getIdString(userOrId || (yield userService.current()).data);
	            const url = `applicationsByUser/${encodeURIComponent(userId)}`;
	            const res = yield this.fetch(url, { headers, params });
	            const json = yield res.json();
	            const data = json[this.propertyName];
	            return { res, data };
	        });
	    }
	    binary(application) {
	        return new ApplicationBinaryService(this.client, application);
	    }
	    getHref(application) {
	        if (application.type === exports.ApplicationType.EXTERNAL) {
	            return application.externalUrl;
	        }
	        return `/apps/${application.public ? 'public/' : ''}${application.contextPath}`;
	    }
	    /**
	     * Checks if current user can access specified application.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {string | IApplication} application Application name or contextPath as a
	     * string or Application object.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const checkApp: object = {
	     *    name: 'myApplication'
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await applicationService.isAvailable(checkApp);
	     *  })();
	     * ```
	     */
	    isAvailable(application) {
	        return __awaiter$16(this, void 0, void 0, function* () {
	            const { res, data } = yield this.listByUser(undefined, {
	                dropOverwrittenApps: true,
	                noPaging: true
	            });
	            const available = (data || []).some((availableApp) => typeof application === 'string'
	                ? availableApp.name === application || availableApp.contextPath === application
	                : this.isMatch(availableApp, application));
	            return { data: available, res };
	        });
	    }
	    isMatch(object, source) {
	        return Object.keys(source).every(key => {
	            if (Array.isArray(object[key]) && Array.isArray(source[key])) {
	                return source[key].every(el => object[key].includes(el));
	            }
	            else if (typeof object[key] === 'object' &&
	                object[key] !== null &&
	                typeof source[key] === 'object' &&
	                source[key] !== null) {
	                return this.isMatch(object[key], source[key]);
	            }
	            else {
	                return object[key] === source[key];
	            }
	        });
	    }
	}

	(function (BillingMode) {
	    BillingMode["SUBSCRIPTION"] = "SUBSCRIPTION";
	    BillingMode["RESOURCES"] = "RESOURCES";
	})(exports.BillingMode || (exports.BillingMode = {}));

	(function (Isolation) {
	    Isolation["PER_TENANT"] = "PER_TENANT";
	    Isolation["MULTI_TENANT"] = "MULTI_TENANT";
	})(exports.Isolation || (exports.Isolation = {}));

	(function (ApplicationAvailability) {
	    ApplicationAvailability[ApplicationAvailability["MARKET"] = gettext('MARKET')] = "MARKET";
	    ApplicationAvailability[ApplicationAvailability["PRIVATE"] = gettext('PRIVATE')] = "PRIVATE";
	})(exports.ApplicationAvailability || (exports.ApplicationAvailability = {}));

	var __awaiter$17 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	class SystemOptionsService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'tenant/system';
	        this.listUrl = 'options';
	        this.propertyName = 'options';
	    }
	    /**
	     * Gets the details of given system option.
	     *
	     * @param {string|number|IIdentified} option System option object with mandantory fragments.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const option: ISystemOption = {
	     *      category: 'alarm.type.mapping',
	     *      key: 'temp_to_high'
	     *    };
	     *
	     *    (async () => {
	     *      const {data, res} = await systemOptionsService.detail(option);
	     *   })();
	     * ```
	     */
	    detail(option) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$17(this, void 0, void 0, function* () {
	            return _super.detail.call(this, option);
	        });
	    }
	    /**
	     * Gets the list of system options filtered by parameters.
	     *
	     * @returns Response wrapped in [[IResultList]]
	     *
	     * @param {object} filter Object containing filters for querying system options.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await systemOptionsService.list(filter);
	     *   })();
	     * ```
	     */
	    list(filter = {}) {
	        return __awaiter$17(this, void 0, void 0, function* () {
	            const headers = { 'content-type': 'application/json' };
	            const url = this.listUrl;
	            const res = yield this.fetch(url, { headers, params: filter });
	            const json = yield res.json();
	            const data = json[this.propertyName];
	            return { res, data };
	        });
	    }
	    getDetailUrl(option) {
	        return `${this.listUrl}/${option.category}/${option.key}`;
	    }
	    onBeforeCreate(obj) {
	        return obj;
	    }
	}

	var __awaiter$18 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	/**
	 * @description
	 * This service allows for managing tenant's options.
	 */
	class TenantOptionsService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'tenant';
	        this.listUrl = 'options';
	        this.propertyName = 'options';
	        this.securityOptionsCategories = ['password'];
	        this.securityOptionsListUrl = 'security-options';
	        this.systemOptions = 'system';
	    }
	    /**
	     * Get a representation of a tenant's option.
	     *
	     * @param entity Tenant option object.
	     * @param params Additional query parameters.
	     *
	     * @returns Returns promise object that is resolved with
	     * the ITenantOption wrapped by IResult.
	     *
	     * **Example**
	     * ```typescript
	     * const option: ITenantOption = {
	     *   category: 'access.control',
	     *   key: 'allow.origin'
	     * };
	     * const params: ITenantOptionDetailParams = {
	     *   evaluate: 'inherited'
	     * };
	     * (async () => {
	     *   const { data, res } = await tenantService.detail(option);
	     *   console.log('value inherited from parent tenant:', data.value);
	     * })();
	     * ```
	     *
	     * Required role: ROLE_OPTION_MANAGEMENT_READ
	     */
	    detail(entity, params = {}) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$18(this, void 0, void 0, function* () {
	            return _super.detail.call(this, entity, params);
	        });
	    }
	    /**
	     * Creates a new tenant's option.
	     *
	     * @param {ITenantOption} entity Tenant's Option object.
	     *
	     * @returns {IResult<IIdentified>} Returns promise object that is resolved with
	     * the details of newly created tenant option.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const tenantObject = {
	     *    id: "sample_tenant",
	     *    company: "sample_company",
	     *    domain: "sample_domain.com",
	     *    contactName: "Mr. Doe",
	     *    ...
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await tenantService.create(tenantObject);
	     *  })();
	     * ```
	     *
	     * Required role: ROLE_OPTION_MANAGEMENT_ADMIN<br><br>
	     * Options are category-key-value tuples, storing tenant configuration.Some categories of options
	     * allow creation of new one, other are limited to predefined set of keys.<br><br>
	     * Any option of any tenant can be defined as "non-editable" by "management" tenant. Afterwards, any PUT or DELETE
	     * requests made on that option by the owner tenant, will result in 403 error (Unauthorized).
	     */
	    create(entity) {
	        const _super = Object.create(null, {
	            create: { get: () => super.create }
	        });
	        return __awaiter$18(this, void 0, void 0, function* () {
	            return _super.create.call(this, entity);
	        });
	    }
	    /**
	     * Updates tenant's option data.
	     *
	     * @param {ITenantOption} entity Tenant option is partially updatable.
	     *
	     * @returns {IResult<ITenantOption>} Returns promise object that is resolved with the saved tenant option object.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const partialUpdateObject: IIdentified = {
	     *     value : "http://developer.cumulocity.com"
	     *     ...
	     *   }
	     *
	     *  (async () => {
	     *    const {data, res} = await tenantOptionsService.update(partialUpdateObject);
	     *  })();
	     * ```
	     *
	     * Required role: ROLE_OPTION_MANAGEMENT_ADMIN
	     */
	    update(entity) {
	        const _super = Object.create(null, {
	            update: { get: () => super.update }
	        });
	        return __awaiter$18(this, void 0, void 0, function* () {
	            return _super.update.call(this, entity);
	        });
	    }
	    /**
	     * Gets the list of tenant's options filtered by parameters.
	     *
	     * @param {object} filter Object containing filters for querying tenant options.
	     *
	     * @returns {IResultList<ITenantOption>} Returns promise object that is resolved
	     * with the ITenantOption wrapped by IResultList.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     severity: Severity.MAJOR,
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await tenantOptionsService.list(filter);
	     *   })();
	     * ```
	     *
	     * Required role: ROLE_OPTION_MANAGEMENT_READ
	     */
	    list(filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$18(this, void 0, void 0, function* () {
	            return _super.list.call(this, filter);
	        });
	    }
	    /**
	     * Delete a representation of a tenant's option.
	     *
	     * @param {string|number|IIdentified} entityOrId Tenant's option id or tenant's option object.
	     *
	     * @returns Returns promise object that is resolved with the IResult.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const tenantOptionId: string = "uniqueTenantId";
	     *
	     *    (async () => {
	     *      const {data, res} = await tenantOptionsService.delete(tenantOptionId);
	     *   })();
	     * ```
	     *
	     * Required role: ROLE_TENANT_MANAGEMENT_ADMIN
	     */
	    delete(entityOrId) {
	        const _super = Object.create(null, {
	            delete: { get: () => super.delete }
	        });
	        return __awaiter$18(this, void 0, void 0, function* () {
	            return _super.delete.call(this, entityOrId);
	        });
	    }
	    getDetailUrl(entity) {
	        const encodedCategory = encodeURIComponent(entity.category);
	        const encodedKey = encodeURIComponent(entity.key);
	        if (this.securityOptionsCategories.indexOf(entity.category) > -1) {
	            return `${this.securityOptionsListUrl}/${encodedCategory}/${encodedKey}`;
	        }
	        else {
	            return `${this.listUrl}/${encodedCategory}/${encodedKey}`;
	        }
	    }
	    onBeforeCreate(obj) {
	        return obj;
	    }
	}

	var __awaiter$19 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	/**
	 * @description
	 * This service allows to get tenant security option.
	 */
	class TenantSecurityOptionsService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'tenant';
	        this.listUrl = 'security-options';
	        this.category = 'password';
	        this.propertyName = 'options';
	    }
	    /**
	     * Get a specific tenant's security option.
	     *
	     * @param {ITenantSecurityOption} Tenant's security option object with key value.
	     *
	     * @returns Returns promise object that is resolved with the ITenantSecurityOption wrapped by IResult.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *     const option: ITenantSecurityOption = {
	     *        key: 'limit.validity'
	     *      };
	     *
	     *    (async () => {
	     *      const {data, res} = await tenantSecurityOptionsService.detail(option);
	     *   })();
	     * ```
	     */
	    detail(tenantSecurityOption) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$19(this, void 0, void 0, function* () {
	            return _super.detail.call(this, tenantSecurityOption);
	        });
	    }
	    getDetailUrl(tenantSecurityOption) {
	        return `${this.listUrl}/${this.category}/${tenantSecurityOption.key}`;
	    }
	    onBeforeCreate(obj) {
	        return obj;
	    }
	}

	var __awaiter$20 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	/**
	 * @description
	 * This service allows to get tenant login options.
	 */
	class TenantLoginOptionsService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'tenant';
	        this.loginOptionsUrl = 'loginOptions';
	    }
	    /**
	     * Gets the tenant's login options.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    (async () => {
	     *      const {data, res} = await tenantLoginOptionsService.detail();
	     *   })();
	     * ```
	     */
	    detail() {
	        return __awaiter$20(this, void 0, void 0, function* () {
	            let url = this.loginOptionsUrl;
	            if (this.client.tenant) {
	                url = `${this.loginOptionsUrl}?tenantId=${this.client.tenant}`;
	            }
	            const res = yield this.fetch(url);
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	}

	(function (TenantLoginOptionType) {
	    TenantLoginOptionType["OAUTH2_INTERNAL"] = "OAUTH2_INTERNAL";
	    TenantLoginOptionType["OAUTH2"] = "OAUTH2";
	    TenantLoginOptionType["BASIC"] = "BASIC";
	})(exports.TenantLoginOptionType || (exports.TenantLoginOptionType = {}));

	var __awaiter$21 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	class AuditService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'audit';
	        this.listUrl = 'auditRecords';
	        this.propertyName = 'auditRecords';
	    }
	    /**
	     * Gets the details of selected audit record.
	     *
	     * @param {string|number|IAuditRecord} entityOrId Entity or Id of the entity.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const auditId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await auditService.detail(auditId);
	     *   })();
	     * ```
	     */
	    detail(entityOrId) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$21(this, void 0, void 0, function* () {
	            return _super.detail.call(this, entityOrId);
	        });
	    }
	    /**
	     * Creates a new audit record for a given source.
	     *
	     * @param {IAuditRecord} entity Audit record object with mandantory fragments.
	     * IAuditRecord implements the [[IEvent]] interface.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const mandantoryObject: IAuditRecord = {
	     *    type: AuditRecordType.ALARM,
	     *    time: '2018-05-02T10:08:00Z',
	     *    severity: Severity.MAJOR,
	     *    source: {id: 1}
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await auditService.create(mandantoryObject);
	     *  })();
	     * ```
	     */
	    create(entity) {
	        const _super = Object.create(null, {
	            create: { get: () => super.create }
	        });
	        return __awaiter$21(this, void 0, void 0, function* () {
	            return _super.create.call(this, entity);
	        });
	    }
	    /**
	     * Gets the list of audit records filtered by parameters.
	     *
	     * @returns Response wrapped in [[IResultList]]
	     *
	     * @param {object} filter Object containing filters for querying audit records.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     severity: Severity.MAJOR,
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await auditService.list(filter);
	     *   })();
	     * ```
	     */
	    list(filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$21(this, void 0, void 0, function* () {
	            return _super.list.call(this, filter);
	        });
	    }
	}

	/**
	 * A specific audit record can have one of the following types
	 */
	(function (AuditRecordType) {
	    AuditRecordType["ALARM"] = "Alarm";
	    AuditRecordType["BULK_OPERATION"] = "BulkOperation";
	    AuditRecordType["CEP_MODULE"] = "CepModule";
	    AuditRecordType["EVENT"] = "Event";
	    AuditRecordType["INVENTORY"] = "Inventory";
	    AuditRecordType["INVENTORY_ROLE"] = "InventoryRole";
	    AuditRecordType["OPERATION"] = "Operation";
	    AuditRecordType["OPTION"] = "Option";
	    AuditRecordType["GROUP"] = "Group";
	    AuditRecordType["SMART_RULE"] = "SmartRule";
	    AuditRecordType["SYSTEM"] = "SYSTEM";
	    AuditRecordType["TENANT"] = "Tenant";
	    AuditRecordType["USER"] = "User";
	})(exports.AuditRecordType || (exports.AuditRecordType = {}));

	(function (ChangeType) {
	    ChangeType[ChangeType["ADDED"] = gettext('ADDED')] = "ADDED";
	    ChangeType[ChangeType["REPLACED"] = gettext('REPLACED')] = "REPLACED";
	    ChangeType[ChangeType["REMOVED"] = gettext('REMOVED')] = "REMOVED";
	})(exports.ChangeType || (exports.ChangeType = {}));

	var __awaiter$22 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	class InventoryRoleService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'user';
	        this.listUrl = 'inventoryroles';
	        this.propertyName = 'roles';
	    }
	    /**
	     * Gets the details of inventory role.
	     *
	     * @param {string|number|IIdentified} entityOrId Entity or Id of the entity.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const inventoryRoleId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await inventoryRoleService.detail(inventoryRoleId);
	     *   })();
	     * ```
	     */
	    detail(entityOrId) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$22(this, void 0, void 0, function* () {
	            return _super.detail.call(this, entityOrId);
	        });
	    }
	    /**
	     * Creates a new inventory role.
	     *
	     * @param {IIdentified} entity
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const newRole: IIdentified = {
	     *    name: 'Custom role'
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await inventoryRoleService.create(newRole);
	     *  })();
	     * ```
	     */
	    create(entity) {
	        const _super = Object.create(null, {
	            create: { get: () => super.create }
	        });
	        return __awaiter$22(this, void 0, void 0, function* () {
	            return _super.create.call(this, entity);
	        });
	    }
	    /**
	     * Updates inventory role data.
	     *
	     * @param {IIdentified} entity
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const updateObject: IIdentified = {
	     *    id: 1,
	     *    name: 'changed role'
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await inventoryRoleService.update(updateObject);
	     *  })();
	     * ```
	     */
	    update(entity) {
	        const _super = Object.create(null, {
	            update: { get: () => super.update }
	        });
	        return __awaiter$22(this, void 0, void 0, function* () {
	            return _super.update.call(this, entity);
	        });
	    }
	    /**
	     * Gets the list of inventory roles filtered by parameters.
	     *
	     * @returns Response wrapped in [[IResultList]]
	     *
	     * @param {object} filter Object containing filters for querying alarms.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await inventoryRoleService.list(filter);
	     *   })();
	     * ```
	     */
	    list(filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$22(this, void 0, void 0, function* () {
	            return _super.list.call(this, filter);
	        });
	    }
	    /**
	     * Removes an inventory role with given id.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {IExternalIdentity} identity Identity object with mandantory fragments.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *   const id: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await identityService.delete(id);
	     *   })();
	     * ```
	     */
	    delete(entityOrId) {
	        const _super = Object.create(null, {
	            delete: { get: () => super.delete }
	        });
	        return __awaiter$22(this, void 0, void 0, function* () {
	            return _super.delete.call(this, entityOrId);
	        });
	    }
	}

	(function (DeviceRegistrationStatus) {
	    DeviceRegistrationStatus[DeviceRegistrationStatus["WAITING_FOR_CONNECTION"] = gettext('WAITING_FOR_CONNECTION')] = "WAITING_FOR_CONNECTION";
	    DeviceRegistrationStatus[DeviceRegistrationStatus["PENDING_ACCEPTANCE"] = gettext('PENDING_ACCEPTANCE')] = "PENDING_ACCEPTANCE";
	    DeviceRegistrationStatus[DeviceRegistrationStatus["ACCEPTED"] = gettext('ACCEPTED')] = "ACCEPTED";
	})(exports.DeviceRegistrationStatus || (exports.DeviceRegistrationStatus = {}));

	var __awaiter$23 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	/**
	 * This class allows registration of a new device.
	 */
	class DeviceRegistrationService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'devicecontrol';
	        this.listUrl = 'newDeviceRequests';
	        this.propertyName = 'newDeviceRequests';
	    }
	    /**
	     * Gets the details of device registration.
	     *
	     * @param {string|number|IIdentified} entityOrId Entity or Id of the entity.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const entityId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await deviceRegistrationService.detail(entityId);
	     *    })();
	     * ```
	     */
	    detail(entityOrId) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$23(this, void 0, void 0, function* () {
	            return _super.detail.call(this, entityOrId);
	        });
	    }
	    /**
	     * Creates a new device registration.
	     *
	     * @param {IDeviceRegistrationCreate} entity Device registration object with mandantory fragments.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const mandantoryObject: IDeviceRegistrationCreate = {
	     *      id: 1,
	     *    };
	     *
	     *    (async () => {
	     *      const {data, res} = await deviceRegistrationService.create(mandantoryObject);
	     *    })();
	     * ```
	     */
	    create(entity) {
	        const _super = Object.create(null, {
	            create: { get: () => super.create }
	        });
	        return __awaiter$23(this, void 0, void 0, function* () {
	            return _super.create.call(this, entity);
	        });
	    }
	    /**
	     * Gets the list of device registrations by parameters.
	     *
	     * @returns Response wrapped in [[IResultList]]
	     *
	     * @param {object} filter Object containing filters for querying registrations.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *   const filter: object = {
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await deviceRegistrationService.list(filter);
	     *   })();
	     * ```
	     */
	    list(filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$23(this, void 0, void 0, function* () {
	            return _super.list.call(this, filter);
	        });
	    }
	    /**
	     * Removes an registration with given id.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {string | number | IIdentified} entityOrId entity or id of the registration.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *   const id = 'abc';
	     *
	     *   (async () => {
	     *     const {data, res} = await deviceRegistrationService.delete(id);
	     *     // data will be null
	     *   })();
	     * ```
	     */
	    delete(entityOrId) {
	        const _super = Object.create(null, {
	            delete: { get: () => super.delete }
	        });
	        return __awaiter$23(this, void 0, void 0, function* () {
	            return _super.delete.call(this, entityOrId);
	        });
	    }
	    /**
	     * Accepts the device registration for given id.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {string | number | IIdentified} entityOrId entity or id of registration.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *   const id = 'abc';
	     *
	     *   (async () => {
	     *     const {data, res} = await deviceRegistrationService.accept(id);
	     *   })();
	     * ```
	     */
	    accept(entityOrId) {
	        return __awaiter$23(this, void 0, void 0, function* () {
	            const id = this.getIdString(entityOrId);
	            const update = Object.getPrototypeOf(this).update.bind(this);
	            return update({ id, status: exports.DeviceRegistrationStatus.ACCEPTED });
	        });
	    }
	    /**
	     * Bootstraps the device with given id.
	     *
	     * @param entityOrId entity or id of registration.
	     * @param options for details see [[IDeviceBootstrapOptions]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *   const id: 'abc';
	     *   const options: IDeviceBootstrapOptions = {
	     *     basicAuthToken: 'Basic dGVuYW50L3VzZXJuYW1lOnBhc3N3b3Jk',
	     *     basicAuth: {
	     *       user: 'username',
	     *       pass: 'password'
	     *     }
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res} = await deviceRegistrationService.bootstrap(id, options);
	     *   })();
	     * ```
	     */
	    bootstrap(entityOrId, options) {
	        return __awaiter$23(this, void 0, void 0, function* () {
	            const id = this.getIdString(entityOrId);
	            const body = JSON.stringify({ id });
	            const url = `${this.baseUrl}/deviceCredentials`;
	            const { basicAuth } = options;
	            let { basicAuthToken } = options;
	            if (basicAuth) {
	                const { user, pass } = basicAuth;
	                basicAuthToken = btoa$1(`${user}:${pass}`);
	            }
	            const headers = {
	                Authorization: `Basic ${basicAuthToken}`,
	                accept: 'application/json',
	                'content-type': 'application/json',
	            };
	            const method = 'POST';
	            const res = yield this.client.fetch(url, { body, headers, method });
	            const data = yield res.json();
	            if (res.status > 400) {
	                throw { res, data };
	            }
	            return { res, data };
	        });
	    }
	    onBeforeCreate(entity) {
	        return entity;
	    }
	    onBeforeUpdate(entity) {
	        const noIdEntity = Object.assign({}, entity);
	        delete noIdEntity.id;
	        return noIdEntity;
	    }
	}

	var __awaiter$24 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	/**
	 * This class allows for bulk registering devices.
	 */
	class DeviceRegistrationBulkService {
	    /**
	     * Instantiate class and assign client
	     * @param {IFetchClient} client
	     */
	    constructor(client) {
	        this.client = client;
	    }
	    /**
	     * A new device registration as bulk.
	     *
	     * @param {Stream | Buffer} csv
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const csvString = `
	     *  ID,CREDENTIALS,TENANT,TYPE,NAME,ICCID,IDTYPE,PATH,SHELL
	     *  e2eDeviceRegistrationId,e2epassword123!,e2edocker,c8y_e2eDevice,e2eDevice,123456789,89456,e2eDeviceGroup,1
	     *  900001,e2epassword123!,e2edocker,c8y_e2eDevice1,e2eDevice1,123456789,89456,e2eDeviceGroup,1
	     *  900002,e2epassword123!,e2edocker,c8y_e2eDevice2,e2eDevice2,123456789,89456,e2eDeviceGroup,1`.trim();
	     *
	     *  const csvBuffer = Buffer.from(csvString):
	     *
	     *  (async () => {
	     *    const {data, res} = await deviceRegistrationBulkService.create(csvBuffer);
	     *  })();
	     * ```
	     */
	    create(csv) {
	        return __awaiter$24(this, void 0, void 0, function* () {
	            const url = '/devicecontrol/bulkNewDeviceRequests';
	            const method = 'POST';
	            const body = new browser$1();
	            let fileName = 'bulk-registration.csv';
	            if (typeof (File) !== 'undefined' && csv instanceof File) {
	                fileName = csv.name;
	            }
	            body.append('file', csv, fileName);
	            let bodyHeaders;
	            if (typeof body.getHeaders === 'function') {
	                bodyHeaders = body.getHeaders();
	            }
	            const headers = Object.assign({
	                accept: 'application/json'
	            }, bodyHeaders);
	            const res = yield this.client.fetch(url, { method, body, headers });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	}

	var __awaiter$25 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	/**
	 * @description
	 * This service allows for fetch user roles.
	 */
	class UserRoleService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'user';
	        this.listUrl = 'roles';
	        this.propertyName = 'roles';
	    }
	    /**
	     * Gets the details of given role.
	     *
	     * @param {string|number|IRole} entityOrId Roles's id or role object.
	     *
	     * @returns Returns promise object that is resolved with the IRole wrapped by IResult.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const roleId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await userRoleService.detail(roleId);
	     *   })();
	     * ```
	     */
	    detail(entityOrId) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$25(this, void 0, void 0, function* () {
	            return _super.detail.call(this, entityOrId);
	        });
	    }
	    /**
	     * Gets the list of user roles filtered by parameters.
	     *
	     * @param {object} filter Object containing filters for querying roles.
	     *
	     * @returns Returns promise object that is resolved with the IRole wrapped by IResultList.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     severity: Severity.MAJOR,
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await userRoleService.list(filter);
	     *   })();
	     * ```
	     */
	    list(filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$25(this, void 0, void 0, function* () {
	            return _super.list.call(this, filter);
	        });
	    }
	}

	var __awaiter$26 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	var ChildType;
	(function (ChildType) {
	    ChildType["ROLES"] = "roles";
	    ChildType["USERS"] = "users";
	})(ChildType || (ChildType = {}));
	/**
	 * @description
	 * This service allows for managing user groups.
	 */
	class UserGroupService extends Service {
	    constructor() {
	        super(...arguments);
	        this.baseUrl = 'user';
	        this.propertyName = 'groups';
	    }
	    get listUrl() {
	        return `${this.client.tenant}/groups`;
	    }
	    /**
	     * Gets the details of given user group.
	     *
	     * @param {string|number|IUserGroup} entityOrId Group's id or role object.
	     *
	     * @returns Returns promise object that is resolved with the IUserGroup wrapped by IResult.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const groupId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await userGroupService.detail(roleId);
	     *   })();
	     * ```
	     */
	    detail(entityOrId) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$26(this, void 0, void 0, function* () {
	            return _super.detail.call(this, entityOrId);
	        });
	    }
	    /**
	     * Creates a new user group.
	     *
	     * @param {IUserGroup} entity User Group object.
	     *
	     * @returns {IResult<IUserGroup>} Returns promise object that is resolved with
	     * the details of newly created user group.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const userGroupObject: IUserGroup = {
	     *    name: "new user group"
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await userGroupService.create(userGroupObject);
	     *  })();
	     * ```
	     */
	    create(entity) {
	        const _super = Object.create(null, {
	            create: { get: () => super.create }
	        });
	        return __awaiter$26(this, void 0, void 0, function* () {
	            return _super.create.call(this, entity);
	        });
	    }
	    /**
	     * Updates user group data.
	     *
	     * @param {Partial<IUserGroup>} entity User group is partially updatable.
	     *
	     * @returns {IResult<IUserGroup>} Returns promise object that is resolved with the saved user group object.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const partialUpdateObject: Partial<IUserGroup> = {
	     *     "id" : 1,
	     *     "self" : "[URL to this resource]",
	     *     "name" : "PlatformAdministrators",
	     *     ...
	     *   }
	     *
	     *  (async () => {
	     *    const {data, res} = await userGroupService.update(partialUpdateObject);
	     *  })();
	     * ```
	     */
	    update(entity) {
	        const _super = Object.create(null, {
	            update: { get: () => super.update }
	        });
	        return __awaiter$26(this, void 0, void 0, function* () {
	            return _super.update.call(this, entity);
	        });
	    }
	    /**
	     * Gets the list of user groups filtered by parameters.
	     *
	     * @param {object} filter Object containing filters for querying User Groups.
	     *
	     * @returns Returns promise object that is resolved with the IUserGroup wrapped by IResultList.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     severity: Severity.MAJOR,
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await userGroupService.list(filter);
	     *   })();
	     * ```
	     */
	    list(filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$26(this, void 0, void 0, function* () {
	            return _super.list.call(this, filter);
	        });
	    }
	    /**
	     * Removes user group.
	     *
	     * @param {number | IIdentified} entityOrId User group's id or user group object.
	     *
	     * @returns Returns promise object that is resolved with the IResult of null.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const userGroupId: number = 1;
	     *
	     *    (async () => {
	     *      const {data, res} = await userGroupService.delete(userGroupId);
	     *   })();
	     * ```
	     * When group is removed, suitable audit records are created with type 'User'
	     * and activity 'User updated' with information that user has been removed from group.
	     *
	     * Please, note that the ADMINS and DEVICES groups can not be deleted.
	     */
	    delete(entityOrId) {
	        const _super = Object.create(null, {
	            delete: { get: () => super.delete }
	        });
	        return __awaiter$26(this, void 0, void 0, function* () {
	            return _super.delete.call(this, entityOrId);
	        });
	    }
	    /**
	     * Assign role to user group.
	     *
	     * @param {string | number | Partial<IUserGroup>} entityOrId User group's id or user group object.
	     * @param {string | Partial<ISource>} childEntityOrSelf Url to role resource or IRoleReference object.
	     *
	     * @returns Returns promise object that is resolved with the IRoleReference wrapped by IResult.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const userGroupId: number = 1;
	     *    const roleResource: string = "[URL to the Role resource]";
	     *
	     *    (async () => {
	     *      const {data, res} = await userGroupService.addRoleToGroup(userGroupId, roleResource);
	     *   })();
	     * ```
	     * When role is assigned to user, suitable audit record is created with type 'User' and activity 'User updated'.
	     */
	    addRoleToGroup(entityOrId, childEntityOrSelf) {
	        return __awaiter$26(this, void 0, void 0, function* () {
	            return this.addChild(ChildType.ROLES, entityOrId, childEntityOrSelf);
	        });
	    }
	    /**
	     * Unassign role from user
	     *
	     * @param {string | number | Partial<IUserGroup>} entityOrId User group's id or user group object.
	     * @param {string | Partial<ISource>} childEntityOrSelf Url to user resource or IRoleReference object.
	     *
	     * @returns Returns promise object that is resolved with the IResult of null.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const userGroupId: number = 1;
	     *    const userResource: string = "[URL to the Role resource]";
	     *
	     *    (async () => {
	     *      const {data, res} = await userGroupService.removeRoleFromGroup(userGroupId, userResource);
	     *   })();
	     * ```
	     */
	    removeRoleFromGroup(entityOrId, childEntityOrSelf) {
	        return __awaiter$26(this, void 0, void 0, function* () {
	            return this.removeChild(ChildType.ROLES, entityOrId, childEntityOrSelf);
	        });
	    }
	    /**
	     * Assign user to user group.
	     *
	     * @param {string | number | Partial<IUserGroup>} entityOrId User group's id or user group object.
	     * @param {string | Partial<ISource>} childEntityOrSelf Url to user resource or IUserReference object.
	     *
	     * @returns Returns promise object that is resolved with the IUserReference wrapped by IResult.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const userGroupId: number = 1;
	     *    const userResource: string = "[URL to the User resource]";
	     *
	     *    (async () => {
	     *      const {data, res} = await userGroupService.addUserToGroup(userGroupId, userResource);
	     *   })();
	     * ```
	     * When user is added to group, suitable audit record is created with type 'User' and activity 'User updated'.
	     */
	    addUserToGroup(entityOrId, childEntityOrSelf) {
	        return __awaiter$26(this, void 0, void 0, function* () {
	            return this.addChild(ChildType.USERS, entityOrId, childEntityOrSelf);
	        });
	    }
	    /**
	     * Remove user from a group
	     *
	     * @param {string | number | Partial<IUserGroup>} entityOrId User group's id or user group object.
	     * @param {string | Partial<ISource>} childEntityOrSelf Url to user resource or IUserReference object.
	     *
	     * @returns Returns promise object that is resolved with the IResult of null.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const userGroupId: number = 1;
	     *    const userResource: string = "[URL to the User resource]";
	     *
	     *    (async () => {
	     *      const {data, res} = await userGroupService.removeUserFromGroup(userGroupId, userResource);
	     *   })();
	     * ```
	     * When user is removed from group, suitable audit record is created with type 'User' and activity 'User updated'.
	     */
	    removeUserFromGroup(entityOrId, childEntityOrSelf) {
	        return __awaiter$26(this, void 0, void 0, function* () {
	            return this.removeChild(ChildType.USERS, entityOrId, childEntityOrSelf);
	        });
	    }
	    getSelf(childReference) {
	        if (typeof childReference === 'object' && childReference.self) {
	            return childReference.self;
	        }
	        else {
	            return childReference;
	        }
	    }
	    getChildUrl(type, userGroupOrId) {
	        return `${this.getDetailUrl(userGroupOrId)}/${type}`;
	    }
	    getChildReferenceAsBody(type, childReference) {
	        const childSelf = this.getSelf(childReference);
	        switch (type) {
	            case ChildType.ROLES:
	                return JSON.stringify({ role: { self: String(childSelf) } });
	            case ChildType.USERS:
	                return JSON.stringify({ user: { self: String(childSelf) } });
	        }
	        throw new Error('UserGroupService -> getChild -> unsupported child type');
	    }
	    addChild(type, userGroupOrId, childReference) {
	        return __awaiter$26(this, void 0, void 0, function* () {
	            const url = this.getChildUrl(type, userGroupOrId);
	            const method = 'POST';
	            const body = this.getChildReferenceAsBody(type, childReference);
	            const headers = {
	                accept: 'application/json',
	                'content-type': 'application/json'
	            };
	            const res = yield this.fetch(url, { method, body, headers });
	            let data = yield res.json();
	            data = data.managedObject;
	            return { res, data };
	        });
	    }
	    removeChild(type, userGroupOrId, childReference) {
	        return __awaiter$26(this, void 0, void 0, function* () {
	            const childId = this.getIdString(childReference);
	            const url = `${this.getChildUrl(type, userGroupOrId)}/${encodeURIComponent(String(childId))}`;
	            const method = 'DELETE';
	            const headers = { accept: 'application/json' };
	            const res = yield this.fetch(url, { method, headers });
	            const data = null;
	            return { res, data };
	        });
	    }
	}

	var __awaiter$27 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	/**
	 * This class allwos for managing external identifiers.
	 */
	class IdentityService {
	    constructor(client) {
	        this.baseUrl = 'identity';
	        this.propertyName = 'externalIds';
	        this.client = client;
	    }
	    /**
	     * Gets the list of identities filtered by parameters.
	     *
	     * @returns Response wrapped in [[IResultList]]
	     *
	     * @param {object} filter Object containing filters for querying identity.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const filter: object = {
	     *     pageSize: 100,
	     *     withTotalPages: true
	     *   };
	     *
	     *   (async () => {
	     *     const {data, res, paging} = await identityService.list(filter);
	     *   })();
	     * ```
	     */
	    list(managedObjectId) {
	        return __awaiter$27(this, void 0, void 0, function* () {
	            const headers = { accept: 'application/json' };
	            const url = this.getExternalIdsOfGlobalIdUrl(managedObjectId);
	            const res = yield this.fetch(url, { headers });
	            const json = yield res.json();
	            const data = json[this.propertyName];
	            return { res, data };
	        });
	    }
	    /**
	     * Creates a new identity.
	     *
	     * @param {IExternalIdentity} identity Identity object with mandantory fragments.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *   const linkedManagedObjectId = '123';
	     *   const identity: IExternalIdentity = {
	     *      type: 'type',
	     *      externalId: '1',
	     *      managedObject: {
	     *        id: linkedManagedObjectId
	     *      }
	     *    };
	     *
	     *    (async () => {
	     *      const {data, res} = await identityService.create(identity);
	     *   })();
	     * ```
	     */
	    create(identity) {
	        return __awaiter$27(this, void 0, void 0, function* () {
	            const headers = { 'content-type': 'application/json', accept: 'application/json' };
	            const method = 'POST';
	            const body = JSON.stringify(identity);
	            const url = this.getExternalIdsOfGlobalIdUrl(identity.managedObject.id);
	            const res = yield this.fetch(url, { headers, method, body });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    /**
	     * Gets the details of an identity.
	     *
	     * @param {IExternalIdentity} identity Identity object with mandantory fragments.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const identity: IExternalIdentity = {
	     *      type: 'type',
	     *      externalId: '1'
	     *    };
	     *
	     *    (async () => {
	     *      const {data, res} = await identityService.detail(identity);
	     *   })();
	     * ```
	     */
	    detail(identity) {
	        return __awaiter$27(this, void 0, void 0, function* () {
	            const headers = { accept: 'application/json' };
	            const url = this.getExternalIdUrl(identity);
	            const res = yield this.fetch(url, { headers });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    /**
	     * Removes an identity with given id.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {IExternalIdentity} identity Identity object with mandantory fragments.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *   const identity: IExternalIdentity = {
	     *      type: 'type',
	     *      externalId: '1'
	     *    };
	     *
	     *    (async () => {
	     *      const {data, res} = await identityService.delete(identity);
	     *   })();
	     * ```
	     */
	    delete(identity) {
	        return __awaiter$27(this, void 0, void 0, function* () {
	            const headers = { accept: 'application/json' };
	            const method = 'DELETE';
	            const url = this.getExternalIdUrl(identity);
	            const res = yield this.fetch(url, { headers, method });
	            return { res, data: null };
	        });
	    }
	    fetch(url, init) {
	        return __awaiter$27(this, void 0, void 0, function* () {
	            const res = yield this.client.fetch(url, init);
	            if (res.status >= 400) {
	                let data = null;
	                try {
	                    data = yield res.json();
	                }
	                catch (ex) {
	                    try {
	                        data = yield res.text();
	                    }
	                    catch (ex) {
	                        // do nothing
	                    }
	                }
	                throw { res, data };
	            }
	            return res;
	        });
	    }
	    getExternalIdsOfGlobalIdUrl(managedObjectId) {
	        return `/${this.baseUrl}/globalIds/${managedObjectId}/externalIds`;
	    }
	    getExternalIdUrl(identity) {
	        return `/${this.baseUrl}/externalIds/${identity.type}/${identity.externalId}`;
	    }
	}

	var __awaiter$28 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	/**
	 * This class allows for managing trusted certificates.
	 */
	class TrustedCertificateService extends Service {
	    constructor() {
	        super(...arguments);
	        this.listUrl = 'trusted-certificates';
	        this.propertyName = 'certificates';
	    }
	    get baseUrl() {
	        return `/tenant/tenants/${this.client.tenant}`;
	    }
	    /**
	     * Gets a list of trusted certificates.
	     *
	     * @returns Response wrapped in [[IResultList]].
	     *
	     * **Example**
	     * ```typescript
	     *
	     *   (async () => {
	     *     const {data, res} = await trustedCertificateService.list();
	     *   })();
	     * ```
	     */
	    list(filter = {}) {
	        const _super = Object.create(null, {
	            list: { get: () => super.list }
	        });
	        return __awaiter$28(this, void 0, void 0, function* () {
	            return _super.list.call(this, filter);
	        });
	    }
	    /**
	     * Gets the details of trusted certificate
	     *
	     * @param {string | ITrustedCertificate} entityOrId Trusted certificate object or trusted certificate fingerprint.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *    const fingerprint: string = 'abc';
	     *
	     *    (async () => {
	     *      const {data, res} = await trustedCertificateService.detail(fingerprint);
	     *   })();
	     * ```
	     */
	    detail(entityOrId) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$28(this, void 0, void 0, function* () {
	            return _super.detail.call(this, entityOrId);
	        });
	    }
	    /**
	     * Removes a trusted certificate with given fingerprint.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @param {string | ITrustedCertificate} entityOrId Trusted certificate object or trusted certificate fingerprint.
	     *
	     * **Example**
	     * ```typescript
	     *
	     *   const fingerprint: string = 'abc';
	     *
	     *    (async () => {
	     *      const {data, res} = await trustedCertificateService.delete(fingerprint);
	     *   })();
	     * ```
	     */
	    delete(entityOrId) {
	        const _super = Object.create(null, {
	            delete: { get: () => super.delete }
	        });
	        return __awaiter$28(this, void 0, void 0, function* () {
	            return _super.delete.call(this, entityOrId);
	        });
	    }
	    /**
	     * Updates trusted certificate data.
	     *
	     * @param entity Trusted certificate partial object.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const certificate: Partial<ITrustedCertificate> = {
	     *    name: 'Name'
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await trustedCertificateService.update(certificate);
	     *  })();
	     * ```
	     */
	    update(entity) {
	        const _super = Object.create(null, {
	            update: { get: () => super.update }
	        });
	        return __awaiter$28(this, void 0, void 0, function* () {
	            return _super.update.call(this, entity);
	        });
	    }
	    /**
	     * Creates a new trusted certificate.
	     *
	     * @param {Partial<ITrustedCertificate>} Trusted certificate object.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * **Example**
	     * ```typescript
	     *
	     *  const certificate: Partial<ITrustedCertificate> = {
	     *    name: 'Name',
	     *    certInPemFormat: 'MIID+DCCAuCgAwIBAgIJAO1Q9t/M9gYlMA0GC...',
	     *    status: 'ENABLED'
	     *  };
	     *
	     *  (async () => {
	     *    const {data, res} = await trustedCertificateService.create(certificate);
	     *  })();
	     * ```
	     */
	    create(entity) {
	        const _super = Object.create(null, {
	            create: { get: () => super.create }
	        });
	        return __awaiter$28(this, void 0, void 0, function* () {
	            return _super.create.call(this, entity);
	        });
	    }
	    getDetailUrl(entityOrId) {
	        let id;
	        if (typeof entityOrId === 'object' && entityOrId.fingerprint) {
	            id = entityOrId.fingerprint;
	        }
	        else {
	            id = entityOrId;
	        }
	        return `${this.listUrl}/${id}`;
	    }
	}

	var __awaiter$29 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	var __rest = (undefined && undefined.__rest) || function (s, e) {
	    var t = {};
	    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
	        t[p] = s[p];
	    if (s != null && typeof Object.getOwnPropertySymbols === "function")
	        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
	            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
	                t[p[i]] = s[p[i]];
	        }
	    return t;
	};
	class SmartGroupsService extends Service {
	    constructor(client) {
	        super(client);
	        this.baseUrl = 'inventory';
	        this.listUrl = 'managedObjects';
	        this.SMART_GROUP_TYPE = 'c8y_DynamicGroup';
	        this.SMART_GROUP_FRAGMENT_TYPE = 'c8y_IsDynamicGroup';
	        this.DEVICE_GROUP_FRAGMENT_TYPE = 'c8y_IsDeviceGroup';
	        this.DEVICE_GROUP_TYPE = 'c8y_DeviceGroup';
	        this.DEVICE_SUBGROUP_TYPE = 'c8y_DeviceSubgroup';
	        this.SMART_GROUPS_V2_MICROSERVICE_APP_NAME = 'smartgroup';
	        this.SMART_GROUPS_V2_MICROSERVICE_BASE_PATH = 'service/smartgroup';
	        this.SMART_GROUPS_V2_MICROSERVICE_ENDPOINT_PATH = `${this.SMART_GROUPS_V2_MICROSERVICE_BASE_PATH}/smartgroups`;
	        this.applicationService = new ApplicationService(client);
	    }
	    /**
	     * Gets the details of managed object
	     *
	     * @param {IdReference} entityOrId Entity or Id of the ManagedObject.
	     * @param {object} filter Filter object.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @example
	     * ```typescript
	     *
	     *    const id: string = '1';
	     *    const filter: any = { withChildren: false };
	     *
	     *    (async () => {
	     *      const {data, res} = await smartGroupsService.detail(id, filter);
	     *   })();
	     * ```
	     */
	    detail(entityOrId, filter = {}) {
	        const _super = Object.create(null, {
	            detail: { get: () => super.detail }
	        });
	        return __awaiter$29(this, void 0, void 0, function* () {
	            return _super.detail.call(this, entityOrId, filter);
	        });
	    }
	    /**
	     * Updates smart group managed object with given id.
	     *
	     * @param {Partial<IManagedObject>} mo Partial managed object of the smart group.
	     * @param {object} filter Filter object.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @example
	     * ```typescript
	     *
	     *    const smartGroup = { id: '1', name: 'newName' };
	     *
	     *    (async () => {
	     *      await smartGroupsService.update(smartGroup);
	     *   })();
	     * ```
	     */
	    update(mo, filter = {}) {
	        const _super = Object.create(null, {
	            update: { get: () => super.update }
	        });
	        return __awaiter$29(this, void 0, void 0, function* () {
	            const { id } = mo;
	            const { data: isInstalled } = yield this.isSmartGroupsV2MicroserviceInstalled();
	            const { data: groupMo } = yield this.detail(id, { withChildren: false });
	            return isInstalled && this.isSmartGroupV2(groupMo)
	                ? this.updateSmartGroupV2(mo, filter)
	                : _super.update.call(this, mo);
	        });
	    }
	    /**
	     * Updates smart group v2 managed object with given id.
	     *
	     * @param {Partial<IManagedObject>} mo Partial managed object of the smart group v2.
	     * @param {object} filter Filter object.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @example
	     * ```typescript
	     *
	     *    const smartGroupV2 = { id: '1', name: 'newName' };
	     *
	     *    (async () => {
	     *      await smartGroupsService.updateSmartGroupV2(smartGroupV2);
	     *   })();
	     * ```
	     */
	    updateSmartGroupV2(mo, filter = {}) {
	        return __awaiter$29(this, void 0, void 0, function* () {
	            const { id } = mo, partialMo = __rest(mo, ["id"]);
	            const method = 'PUT';
	            const body = JSON.stringify(this.onBeforeUpdate(partialMo));
	            const headers = { 'content-type': 'application/json', accept: 'application/json' };
	            const url = `${this.SMART_GROUPS_V2_MICROSERVICE_ENDPOINT_PATH}/${id}`;
	            const res = yield this.fetch(url, { method, body, headers, params: Object.assign({}, filter) });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    /**
	     * Removes managed object with given id.
	     *
	     * @param {IManagedObject} group Managed object of the group.
	     * @param {object} params Additional query params.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @example
	     * ```typescript
	     *
	     *   const group = { id: '1' } as IManagedObject;
	     *   const params: any = {
	     *     withChildren: false
	     *   }
	     *
	     *    (async () => {
	     *      await smartGroupsService.delete(group, params);
	     *   })();
	     * ```
	     */
	    delete(entityOrId, params = {}) {
	        const _super = Object.create(null, {
	            delete: { get: () => super.delete }
	        });
	        return __awaiter$29(this, void 0, void 0, function* () {
	            const { data: isInstalled } = yield this.isSmartGroupsV2MicroserviceInstalled();
	            const data = (yield this.detail(entityOrId, { withChildren: false })).data;
	            return isInstalled && this.isSmartGroupV2(data)
	                ? yield this.removeSmartGroupV2(data)
	                : yield _super.delete.call(this, data, params);
	        });
	    }
	    /**
	     * Checks if the smart groups v2 microservice is installed.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @example
	     * ```typescript
	     *
	     *    (async () => {
	     *      const {data, res} = await smartGroupsService.isSmartGroupsV2MicroserviceInstalled();
	     *   })();
	     * ```
	     */
	    isSmartGroupsV2MicroserviceInstalled() {
	        return this.applicationService.isAvailable({
	            name: this.SMART_GROUPS_V2_MICROSERVICE_APP_NAME
	        });
	    }
	    /**
	     * Checks whether a given managed object is a smart group
	     *
	     * @param {IManagedObject} mo Managed object to check.
	     *
	     * @returns boolean
	     *
	     * @example
	     * ```typescript
	     *
	     *    const mo: IManagedObject = {id: 1, type: "c8y_DeviceGroup", c8y_IsDeviceGroup: {}} as IManagedObject;
	     *
	     *    (() => {
	     *      const isSmartGroup = smartGroupsService.isSmartGroup(mo);
	     *   })();
	     * ```
	     */
	    isSmartGroup(mo) {
	        const hasSmartGroupFragmentType = mo.hasOwnProperty(this.SMART_GROUP_FRAGMENT_TYPE);
	        const isSmartGroupType = mo && mo.type === this.SMART_GROUP_TYPE;
	        return hasSmartGroupFragmentType || isSmartGroupType;
	    }
	    /**
	     * Checks whether a given managed object is a smart group v2
	     *
	     * @param {IManagedObject} mo Managed object to check.
	     *
	     * @returns boolean
	     *
	     * @example
	     * ```typescript
	     *
	     *    const mo: IManagedObject = {id: 1, type: "c8y_DeviceGroup", c8y_IsDeviceGroup: {}} as IManagedObject;
	     *
	     *    (() => {
	     *      const isSmartGroup = smartGroupsService.isSmartGroupV2(mo);
	     *   })();
	     * ```
	     */
	    isSmartGroupV2(mo) {
	        const hasSmartGroupFragmentType = mo.hasOwnProperty(this.SMART_GROUP_FRAGMENT_TYPE);
	        const hasDeviceGroupFragmentType = mo.hasOwnProperty(this.DEVICE_GROUP_FRAGMENT_TYPE);
	        const isGroupOrSubgroup = (mo && mo.type === this.DEVICE_GROUP_TYPE) || mo.type === this.DEVICE_SUBGROUP_TYPE;
	        return hasSmartGroupFragmentType && hasDeviceGroupFragmentType && isGroupOrSubgroup;
	    }
	    /**
	     * Removes smart group v2 managed object with given id.
	     *
	     * @param {IdReference} entityOrId entity or Id of the ManagedObject.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @example
	     * ```typescript
	     *
	     *    const id: string = '1';
	     *
	     *    (async () => {
	     *      await smartGroupsService.removeSmartGroupV2(id);
	     *   })();
	     * ```
	     */
	    removeSmartGroupV2(entityOrId) {
	        return __awaiter$29(this, void 0, void 0, function* () {
	            let id;
	            if (typeof entityOrId === 'object' && entityOrId.id) {
	                id = entityOrId.id;
	            }
	            else {
	                id = entityOrId;
	            }
	            const method = 'DELETE';
	            const url = `${this.SMART_GROUPS_V2_MICROSERVICE_ENDPOINT_PATH}/${id}`;
	            const res = yield this.client.fetch(url, { method });
	            return { res, data: null };
	        });
	    }
	    getUrl(url = '') {
	        const partialUrl = url.replace(/^\/+/, '');
	        const baseUrl = this.baseUrl.replace(/\/+$/, '');
	        if (url.includes(this.SMART_GROUPS_V2_MICROSERVICE_ENDPOINT_PATH)) {
	            return partialUrl;
	        }
	        else {
	            return `${baseUrl}/${partialUrl}`;
	        }
	    }
	}

	var __awaiter$30 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	class SmartRulesService extends Service {
	    constructor(client) {
	        super(client);
	        this.baseUrl = 'service/smartrule';
	        this.rulesUrl = 'smartrules';
	        this.unupdatableFields = ['type', 'cepModuleId', 'creationTime', 'lastUpdated'];
	    }
	    /**
	     * Gets a list of smart rules for given managed object.
	     *
	     * @param {IdReference} entityOrId Entity or Id of the ManagedObject.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @example
	     * ```typescript
	     *
	     *    const id: string = '1';
	     *
	     *    (async () => {
	     *      const {data, res} = await smartRulesService.listByContext(id);
	     *   })();
	     * ```
	     */
	    listByContext(entityOrId) {
	        return __awaiter$30(this, void 0, void 0, function* () {
	            const url = this.contextRulesUrl(entityOrId);
	            const res = yield this.fetch(url, { method: 'GET' });
	            const rules = (yield res.json()).rules;
	            return { res, data: rules };
	        });
	    }
	    /**
	     * Deactivates smart rule for given entities list.
	     *
	     * @param {Partial<IRule>} rule Smart rule managed object.
	     * @param {IdReference[]} entitiesOrIdsList List of entities or Id of the ManagedObjects.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @example
	     * ```typescript
	     *
	     *    const rule: IRule = {id: '1', enabledSources: ['2', '3'],...};
	     *    const entityOrIdList: IdReference[] = ['2'];
	     *    (async () => {
	     *      const {data, res} = await smartRulesService.bulkDeactivateEnabledSources(rule, entityOrIdList);
	     *   })();
	     * ```
	     */
	    bulkDeactivateEnabledSources(rule, entitiesOrIdsList) {
	        if (entitiesOrIdsList.length === 0) {
	            return Promise.resolve({ res: null, data: null });
	        }
	        const { enabledSources } = rule;
	        const newEnabledSources = this.disableEnabledSources(enabledSources, entitiesOrIdsList);
	        const ruleCopy = Object.assign({}, rule);
	        Object.assign(ruleCopy, { enabledSources: newEnabledSources });
	        return this.update(ruleCopy);
	    }
	    /**
	     * Updates smart rule.
	     *
	     * @param {Parial<IRule>} rule Smart rule managed object.
	     *
	     * @returns Response wrapped in [[IResult]]
	     *
	     * @example
	     * ```typescript
	     *
	     *    const rule: IRule = {id: '1', enabledSources: ['2', '3'],...};
	     *    (async () => {
	     *      const {data, res} = await smartRulesService.updateSmartRule(rule);
	     *   })();
	     * ```
	     */
	    update(rule) {
	        return __awaiter$30(this, void 0, void 0, function* () {
	            const url = this.getSmartRulesUrl(rule);
	            const method = 'PUT';
	            const body = JSON.stringify(this.removeUnclonableFields(rule, this.unupdatableFields));
	            const headers = { 'content-type': 'application/json', accept: 'application/json' };
	            const res = yield this.fetch(url, { method, body, headers });
	            const data = yield res.json();
	            return { res, data };
	        });
	    }
	    disableEnabledSources(enabledSources = [], entityOrIdList) {
	        return enabledSources.filter(id => !this.getListOfStringIds(entityOrIdList).includes(id));
	    }
	    getListOfStringIds(entityOrIdList) {
	        return entityOrIdList.map(entityOrId => {
	            if (typeof entityOrId === 'object' && entityOrId.id) {
	                return entityOrId.id.toString();
	            }
	            return entityOrId.toString();
	        });
	    }
	    getSmartRulesUrl(rule) {
	        const contextMoId = rule && rule.c8y_Context && rule.c8y_Context.id;
	        let url = !!contextMoId ? this.contextRulesUrl(contextMoId) : this.rulesUrl;
	        if (rule.id) {
	            url = `${url}/${rule.id}`;
	        }
	        return url;
	    }
	    removeUnclonableFields(rule, fieldsToRemove) {
	        const ruleCopy = Object.assign({}, rule);
	        fieldsToRemove.forEach(f => {
	            delete ruleCopy[f];
	        });
	        return ruleCopy;
	    }
	    contextRulesUrl(entityOrId = {}) {
	        if (typeof entityOrId === 'object' && entityOrId.id) {
	            return `managedObjects/${entityOrId.id}/smartrules`;
	        }
	        return `managedObjects/${entityOrId}/smartrules`;
	    }
	}

	var __awaiter$31 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	class Client {
	    /**
	     * Initializes a new Client, which allows to request data from the API. Differently
	     * to Client.authenticate([...]) it needs a tenant given and does not verify if the
	     * login is correct.
	     *
	     * **Example**
	     * ```typescript
	     *
	     * const auth = new BasicAuth({
	     *   user: 'youruser',
	     *   password: 'yourpassword',
	     *   tenant: 'acme'
	     * }); // use CookieAuth() if your platform uses oauth (only in browser!)
	     *
	     * const baseUrl = 'https://acme.cumulocity.com';
	     * const client = new Client(auth, baseUrl);
	     * (async () => {
	     *   const { data, paging, res }); =  await client.inventory.list({ pageSize: 100 });
	     * })();
	     * ```
	     *
	     * @param auth The Authentication strategy to use (e.g. new BasicAuth())
	     * @param baseUrl The URL to request (optional in browser, mandatory in node)
	     */
	    constructor(auth, baseUrl) {
	        const client = new FetchClient(auth, baseUrl);
	        this.realtime = new Realtime(client);
	        this.alarm = new AlarmService(client, this.realtime);
	        this.application = new ApplicationService(client, this.realtime);
	        this.audit = new AuditService(client);
	        this.core = client;
	        this.deviceRegistration = new DeviceRegistrationService(client);
	        this.deviceRegistrationBulk = new DeviceRegistrationBulkService(client);
	        this.event = new EventService(client, this.realtime);
	        this.inventory = new InventoryService(client, this.realtime);
	        this.inventoryBinary = new InventoryBinaryService(client);
	        this.inventoryRole = new InventoryRoleService(client);
	        this.measurement = new MeasurementService(client, this.realtime);
	        this.operation = new OperationService(client);
	        this.operationBulk = new OperationBulkService(client);
	        this.options = {
	            security: new TenantSecurityOptionsService(client),
	            system: new SystemOptionsService(client),
	            login: new TenantLoginOptionsService(client),
	            tenant: new TenantOptionsService(client),
	        };
	        this.role = new InventoryRoleService(client);
	        this.tenant = new TenantService(client);
	        this.user = new UserService(client);
	        this.userGroup = new UserGroupService(client);
	        this.userRole = new UserRoleService(client);
	        this.identity = new IdentityService(client);
	        this.smartGroups = new SmartGroupsService(client);
	        this.smartRules = new SmartRulesService(client);
	    }
	    /**
	     * Authenticates the given user. Determines the tenant by itself via a call to tenant/currentTenant.
	     *
	     * **Example**
	     * ```typescript
	     *
	     * let client: Client;
	     * (async () => {
	     *  client = await Client.authenticate({
	     *    user: 'testuser',
	     *    password: 'password1337!'
	     *  }, 'https://acme.cumulocity.com');
	     *
	     *  //you have access to the client api now
	     *  const { data, paging, res }); =  await client.inventory.list({ pageSize: 100 });
	     * })();
	     * ```
	     */
	    static authenticate(credentials, baseUrl) {
	        return __awaiter$31(this, void 0, void 0, function* () {
	            const auth = new BasicAuth(credentials);
	            const clientCore = new FetchClient(auth, baseUrl);
	            const res = yield clientCore.fetch('/tenant/currentTenant', { method: 'GET' });
	            if (res.status !== 200) {
	                throw { res };
	            }
	            const { name } = yield res.json();
	            const client = new Client(auth, baseUrl);
	            client.core.tenant = name;
	            return client;
	        });
	    }
	    /**
	     * Allows to use http to register a device on the platform.
	     *
	     * **Deprecated** Please use MQTT to bootstrap a device.
	     */
	    static deviceBootstrap(options) {
	        return __awaiter$31(this, void 0, void 0, function* () {
	            const { deviceId, timeout, baseUrl, basicAuthToken } = options;
	            let { expire } = options;
	            if (timeout && !expire) {
	                expire = Date.now() + timeout;
	            }
	            const clientCore = new FetchClient(undefined, baseUrl);
	            const deviceRegistration = new DeviceRegistrationService(clientCore);
	            let client;
	            try {
	                const { data } = yield deviceRegistration.bootstrap(deviceId, { basicAuthToken });
	                const { username, password, tenantId } = data;
	                const auth = new BasicAuth({ user: username, tenant: tenantId, password });
	                client = new Client(auth, baseUrl);
	                client.core.tenant = tenantId;
	            }
	            catch (error) {
	                const retry = (!expire || Date.now() < expire) && error.res.status === 404;
	                if (retry) {
	                    return Client.deviceBootstrap(Object.assign({ expire }, options));
	                }
	                else {
	                    throw error;
	                }
	            }
	            return client;
	        });
	    }
	    /**
	     * Retrieves microservice credentials for the subscribed tenants
	     * using provided bootstrap credentials
	     *
	     * **Example**
	     * ```typescript
	     *
	     * (async () => {
	     *  const subscriptions = await Client.getMicroserviceSubscriptions({
	     *    tenant: process.env.C8Y_BOOTSTRAP_TENANT,
	     *    user: process.env.C8Y_BOOTSTRAP_USER,
	     *    password: process.env.C8Y_BOOTSTRAP_PASSWORD
	     *  }, process.env.C8Y_BASEURL);
	     *
	     *  const clients = subscriptions.map(subscription => new Client(new BasicAuth(subscription), process.env.C8Y_BASEURL));
	     *  // you have access to the client api now
	     *  const promiseArray = clients.map(client => client.options.tenant.detail({
	     *    category: process.env.APPLICATION_KEY,
	     *    key: 'someSetting'
	     *  }));
	     * })();
	     * ```
	     */
	    static getMicroserviceSubscriptions(bootstrapCredentials, baseUrl) {
	        return __awaiter$31(this, void 0, void 0, function* () {
	            const microserviceSubscriptionsEndpoint = '/application/currentApplication/subscriptions';
	            const clientCore = new FetchClient(new BasicAuth(bootstrapCredentials), baseUrl);
	            const res = yield clientCore.fetch(microserviceSubscriptionsEndpoint);
	            const { users } = yield res.json();
	            return users.map(({ tenant, name, password }) => {
	                return {
	                    tenant,
	                    user: name,
	                    password
	                };
	            });
	        });
	    }
	    /**
	     * Allows to change the current Authentication
	     * @param auth The new Authentication information.
	     */
	    setAuth(auth) {
	        this.core.setAuth(auth);
	        this.realtime.disconnect();
	    }
	}

	exports.Client = Client;
	exports.AlarmService = AlarmService;
	exports.ApplicationService = ApplicationService;
	exports.AuditService = AuditService;
	exports.Service = Service;
	exports.FetchClient = FetchClient;
	exports.BasicAuth = BasicAuth;
	exports.CookieAuth = CookieAuth;
	exports.MicroserviceClientRequestAuth = MicroserviceClientRequestAuth;
	exports.Paging = Paging;
	exports.QueriesUtil = QueriesUtil;
	exports.TrustedCertificateService = TrustedCertificateService;
	exports.DeviceRegistrationService = DeviceRegistrationService;
	exports.DeviceRegistrationBulkService = DeviceRegistrationBulkService;
	exports.EventService = EventService;
	exports.EventBinaryService = EventBinaryService;
	exports.IdentityService = IdentityService;
	exports.InventoryService = InventoryService;
	exports.InventoryBinaryService = InventoryBinaryService;
	exports.InventoryRoleService = InventoryRoleService;
	exports.MeasurementService = MeasurementService;
	exports.OperationService = OperationService;
	exports.OperationBulkService = OperationBulkService;
	exports.Realtime = Realtime;
	exports.SystemOptionsService = SystemOptionsService;
	exports.TenantService = TenantService;
	exports.TenantOptionsService = TenantOptionsService;
	exports.TenantSecurityOptionsService = TenantSecurityOptionsService;
	exports.TenantLoginOptionsService = TenantLoginOptionsService;
	exports.UserService = UserService;
	exports.UserInventoryRoleService = UserInventoryRoleService;
	exports.UserGroupService = UserGroupService;
	exports.UserRoleService = UserRoleService;
	exports.SmartRulesService = SmartRulesService;
	exports.SmartGroupsService = SmartGroupsService;

	Object.defineProperty(exports, '__esModule', { value: true });

})));
//# sourceMappingURL=client.umd.js.map
